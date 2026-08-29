const REWARD_ID = "YOUR_REWARD_ID";
const TIMEOUT_SECONDS = 600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        "Twitch Timeout Bot działa.\n\n/auth/twitch - podłącz Twitch\n/status - sprawdź status"
      );
    }

    if (url.pathname === "/auth/twitch" && request.method === "GET") {
      const redirectUri = `${url.origin}/auth/callback`;

      const params = new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope:
          "channel:manage:redemptions moderator:manage:banned_users",
      });

      return Response.redirect(
        `https://id.twitch.tv/oauth2/authorize?${params}`,
        302
      );
    }

    if (url.pathname === "/auth/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");

      if (!code) {
        return new Response("Brak kodu OAuth.", {
          status: 400,
        });
      }

      const redirectUri = `${url.origin}/auth/callback`;

      const tokenResponse = await fetch(
        "https://id.twitch.tv/oauth2/token",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: env.TWITCH_CLIENT_ID,
            client_secret: env.TWITCH_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        return new Response(
          `OAuth error: ${JSON.stringify(tokenData)}`,
          { status: 500 }
        );
      }

      const userResponse = await twitchApi(
        "https://api.twitch.tv/helix/users",
        tokenData.access_token,
        env.TWITCH_CLIENT_ID
      );

      if (!userResponse.ok) {
        return new Response(
          `User API error: ${await userResponse.text()}`,
          { status: 500 }
        );
      }

      const userData = await userResponse.json();
      const user = userData.data?.[0];

      if (!user) {
        return new Response(
          "Nie znaleziono konta Twitch.",
          { status: 500 }
        );
      }

      const streamer = {
        id: user.id,
        login: user.login,
        display_name: user.display_name,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at:
          Date.now() +
          (tokenData.expires_in || 0) * 1000,
        reward_id: REWARD_ID,
      };

      await env.TWITCH_DATA.put(
        `streamer:${user.id}`,
        JSON.stringify(streamer)
      );

      const eventSubResult =
        await createEventSub(
          streamer,
          env,
          url.origin
        );

      if (!eventSubResult.ok) {
        return new Response(
          `Kanał zapisany, ale EventSub nie został utworzony.\n\n${JSON.stringify(
            eventSubResult.data,
            null,
            2
          )}`,
          {
            status: 500,
            headers: {
              "content-type":
                "text/plain; charset=utf-8",
            },
          }
        );
      }

      return new Response(
        `Kanał ${user.display_name} został podłączony!\n\n` +
          `Nagroda ID: ${REWARD_ID}\n` +
          `EventSub: aktywny\n\n` +
          `Możesz teraz przetestować wykupienie nagrody.`,
        {
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
          },
        }
      );
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const keys = await env.TWITCH_DATA.list();
      const streamers = [];

      for (const key of keys.keys) {
        if (!key.name.startsWith("streamer:")) {
          continue;
        }

        const value = await env.TWITCH_DATA.get(key.name);

        if (!value) continue;

        const streamer = JSON.parse(value);

        streamers.push({
          id: streamer.id,
          login: streamer.login,
          reward_id: streamer.reward_id,
        });
      }

      return new Response(
        JSON.stringify(streamers, null, 2),
        {
          headers: {
            "content-type":
              "application/json; charset=utf-8",
          },
        }
      );
    }

    if (
      url.pathname === "/webhook" &&
      request.method === "POST"
    ) {
      const body = await request.text();

      const messageType =
        request.headers.get(
          "Twitch-Eventsub-Message-Type"
        );

      const messageId =
        request.headers.get(
          "Twitch-Eventsub-Message-Id"
        );

      const timestamp =
        request.headers.get(
          "Twitch-Eventsub-Message-Timestamp"
        );

      const signature =
        request.headers.get(
          "Twitch-Eventsub-Message-Signature"
        );

      if (
        !messageId ||
        !timestamp ||
        !signature ||
        !(await verifyEventSubSignature(
          env.TWITCH_WEBHOOK_SECRET,
          messageId,
          timestamp,
          body,
          signature
        ))
      ) {
        return new Response("Forbidden", {
          status: 403,
        });
      }

      if (
        messageType ===
        "webhook_callback_verification"
      ) {
        const data = JSON.parse(body);

        return new Response(data.challenge, {
          status: 200,
          headers: {
            "content-type":
              "text/plain",
          },
        });
      }

      if (messageType === "notification") {
        const data = JSON.parse(body);

        if (
          data.subscription?.type ===
          "channel.channel_points_custom_reward_redemption.add"
        ) {
          await handleRedemption(
            data.event,
            env
          );
        }

        return new Response("OK", {
          status: 200,
        });
      }

      if (messageType === "revocation") {
        console.log(
          "EventSub revoked:",
          body
        );

        return new Response("OK", {
          status: 200,
        });
      }

      return new Response("OK", {
        status: 200,
      });
    }

    return new Response(
      "404 - Not Found",
      { status: 404 }
    );
  },
};

async function twitchApi(
  url,
  accessToken,
  clientId,
  options = {}
) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });
}

async function getAppAccessToken(env) {
  const response = await fetch(
    "https://id.twitch.tv/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `App token error: ${JSON.stringify(data)}`
    );
  }

  return data.access_token;
}

async function createEventSub(
  streamer,
  env,
  origin
) {
  const appAccessToken =
    await getAppAccessToken(env);

  const callback =
    `${origin}/webhook`;

  const existingResponse = await fetch(
    "https://api.twitch.tv/helix/eventsub/subscriptions",
    {
      headers: {
        Authorization:
          `Bearer ${appAccessToken}`,
        "Client-Id":
          env.TWITCH_CLIENT_ID,
      },
    }
  );

  const existingData =
    await existingResponse.json();

  const existing =
    existingData.data?.find(
      (sub) =>
        sub.type ===
          "channel.channel_points_custom_reward_redemption.add" &&
        sub.version === "1" &&
        sub.condition?.broadcaster_user_id ===
          streamer.id &&
        sub.condition?.reward_id ===
          REWARD_ID &&
        sub.status === "enabled"
    );

  if (existing) {
    await env.TWITCH_DATA.put(
      `subscription:${streamer.id}`,
      JSON.stringify({
        id: existing.id,
        status: existing.status,
        reward_id: REWARD_ID,
      })
    );

    return {
      ok: true,
      data: existing,
    };
  }

  const response = await fetch(
    "https://api.twitch.tv/helix/eventsub/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${appAccessToken}`,
        "Client-Id":
          env.TWITCH_CLIENT_ID,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        type:
          "channel.channel_points_custom_reward_redemption.add",
        version: "1",
        condition: {
          broadcaster_user_id:
            streamer.id,
          reward_id:
            REWARD_ID,
        },
        transport: {
          method: "webhook",
          callback,
          secret:
            env.TWITCH_WEBHOOK_SECRET,
        },
      }),
    }
  );

  const data = await response.json();

  if (response.ok && data.data?.[0]) {
    await env.TWITCH_DATA.put(
      `subscription:${streamer.id}`,
      JSON.stringify({
        id: data.data[0].id,
        status: data.data[0].status,
        reward_id: REWARD_ID,
      })
    );
  }

  return {
    ok: response.ok,
    data,
  };
}

async function handleRedemption(
  event,
  env
) {
  if (
    event.reward?.id !== REWARD_ID
  ) {
    return;
  }

  const broadcasterId =
    event.broadcaster_user_id;

  const redemptionId =
    event.id;

  const processedKey =
    `redemption:${redemptionId}`;

  const alreadyProcessed =
    await env.TWITCH_DATA.get(
      processedKey
    );

  if (alreadyProcessed) {
    return;
  }

  const targetLogin =
    (event.user_input || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

  if (!targetLogin) {
    console.log(
      "Brak nicku w redemption."
    );

    await updateRedemption(
      null,
      broadcasterId,
      redemptionId,
      "CANCELED",
      env
    );

    return;
  }

  const stored =
    await env.TWITCH_DATA.get(
      `streamer:${broadcasterId}`
    );

  if (!stored) {
    console.log(
      "Nie znaleziono streamera w KV."
    );

    return;
  }

  let streamer =
    JSON.parse(stored);

  const userResponse =
    await twitchApi(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(
        targetLogin
      )}`,
      streamer.access_token,
      env.TWITCH_CLIENT_ID
    );

  if (!userResponse.ok) {
    console.log(
      "Get Users error:",
      await userResponse.text()
    );

    return;
  }

  const userData =
    await userResponse.json();

  const target =
    userData.data?.[0];

  if (!target) {
    console.log(
      `Nie znaleziono użytkownika: ${targetLogin}`
    );

    await updateRedemption(
      streamer,
      broadcasterId,
      redemptionId,
      "CANCELED",
      env
    );

    return;
  }

  if (target.id === broadcasterId) {
    await updateRedemption(
      streamer,
      broadcasterId,
      redemptionId,
      "CANCELED",
      env
    );

    return;
  }

  const banResponse =
    await twitchApi(
      `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${encodeURIComponent(
        broadcasterId
      )}&moderator_id=${encodeURIComponent(
        streamer.id
      )}`,
      streamer.access_token,
      env.TWITCH_CLIENT_ID,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          data: {
            user_id: target.id,
            duration:
              TIMEOUT_SECONDS,
            reason:
              "Timeout za Channel Points",
          },
        }),
      }
    );

  if (!banResponse.ok) {
    console.log(
      "Ban/timeout error:",
      await banResponse.text()
    );

    return;
  }

  console.log(
    `Timeout ${TIMEOUT_SECONDS} sekund dla ${target.login}`
  );

  await updateRedemption(
    streamer,
    broadcasterId,
    redemptionId,
    "FULFILLED",
    env
  );

  await env.TWITCH_DATA.put(
    processedKey,
    JSON.stringify({
      status: "fulfilled",
      user_id: target.id,
      username: target.login,
      timestamp: Date.now(),
    }),
    {
      expirationTtl: 86400,
    }
  );
}

async function updateRedemption(
  streamer,
  broadcasterId,
  redemptionId,
  status,
  env
) {
  if (!streamer?.access_token) {
    return;
  }

  const response =
    await twitchApi(
      `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?id=${encodeURIComponent(
        redemptionId
      )}&broadcaster_id=${encodeURIComponent(
        broadcasterId
      )}&reward_id=${encodeURIComponent(
        REWARD_ID
      )}`,
      streamer.access_token,
      env.TWITCH_CLIENT_ID,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          status,
        }),
      }
    );

  if (!response.ok) {
    console.log(
      "Redemption update error:",
      await response.text()
    );
  }
}

async function verifyEventSubSignature(
  secret,
  messageId,
  timestamp,
  body,
  signature
) {
  if (!secret) {
    return false;
  }

  const encoder =
    new TextEncoder();

  const message =
    messageId +
    timestamp +
    body;

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const signatureBytes =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message)
    );

  const expectedSignature =
    "sha256=" +
    Array.from(
      new Uint8Array(signatureBytes)
    )
      .map((byte) =>
        byte.toString(16).padStart(2, "0")
      )
      .join("");

  return timingSafeEqual(
    expectedSignature,
    signature
  );
}

function timingSafeEqual(
  a,
  b
) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}