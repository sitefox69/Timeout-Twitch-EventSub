# Twitch Timeout Bot

Automatyczny bot do Twitcha, który nadaje **timeouta** użytkownikowi wskazanemu w realizacji nagrody Channel Points.

## Funkcje

- Automatyczne wykrywanie realizacji nagrody przez Twitch EventSub
- Pobieranie nicku z `user_input`
- Automatyczne wyszukiwanie użytkownika
- Timeout na 600 sekund
- Automatyczne oznaczanie nagrody jako zrealizowane
- Ochrona przed timeoutem streamera
- Zabezpieczenie webhooka EventSub
- Obsługa OAuth Twitch
- Cloudflare Workers + KV

## Schemat działania

```
Twitch Channel Points
        ↓
Twitch EventSub
        ↓
Cloudflare Worker /webhook
        ↓
Weryfikacja podpisu EventSub
        ↓
Sprawdzenie REWARD_ID
        ↓
Pobranie user_input
        ↓
Wyszukanie użytkownika
        ↓
Sprawdzenie użytkownika
        ↓
Timeout
        ↓
FULFILLED
```
# Konfiguracja

Bot automatycznie nadaje timeout użytkownikowi wskazanemu podczas realizacji wybranej nagrody Channel Points.

Projekt wykorzystuje **Twitch OAuth**, **Twitch EventSub**, **Twitch API**, **Cloudflare Workers** oraz **Cloudflare KV**.

## Wymagania

Przed rozpoczęciem potrzebujesz:

- konta Twitch
- konta Cloudflare
- aplikacji utworzonej w Twitch Developer Console
- Cloudflare Worker
- Cloudflare KV Namespace
- własnej nagrody Channel Points

## 1. Utworzenie Cloudflare Worker

Wejdź na: [https://dash.cloudflare.com/](https://dash.cloudflare.com/)

Przejdź do: **Workers & Pages → Create → Worker**

Utwórz nowego Workera.

Wklej kod bota do Workera i wykonaj **Deploy**.

Po wdrożeniu otrzymasz adres podobny do:

```
https://nazwa-workera.nazwa-uzytkownika.workers.dev
```

Ten adres będzie potrzebny w dalszej konfiguracji.

 ## 2. Utworzenie aplikacji Twitch

Wejdź na: [https://dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)

Wybierz **Register Your Application**.

Ustaw:

| Pole | Wartość |
|------|---------|
| **Name** | dowolna nazwa aplikacji |
| **OAuth Redirect URL** | `https://TWÓJ-WORKER.workers.dev/auth/callback` |
| **Category** | Chat Bot |

Następnie utwórz aplikację.

Zapisz:

- **Client ID**
- **Client Secret**

> **Uwaga:** Client Secret traktuj jako hasło i nigdy nie publikuj go w repozytorium.


## 3. Utworzenie Cloudflare KV

W Cloudflare utwórz nowy **KV Namespace**.

Możesz nazwać go:

```
TWITCH_DATA
```

Następnie przypisz go do Workera jako binding:

```
TWITCH_DATA
```

Nazwa bindingu musi odpowiadać nazwie używanej w kodzie:

```js
env.TWITCH_DATA
```

KV jest używane przez bota do przechowywania danych podłączonego streamera, tokenów oraz informacji o EventSub.

## 4. Dodanie sekretów Cloudflare

W ustawieniach Workera przejdź do:

**Settings → Variables and Secrets**

Dodaj następujące wartości:

| Sekret | Opis |
|--------|------|
| `TWITCH_CLIENT_ID` | Client ID aplikacji Twitch |
| `TWITCH_CLIENT_SECRET` | Client Secret aplikacji Twitch |
| `TWITCH_WEBHOOK_SECRET` | Losowy sekret używany do zabezpieczenia EventSub |

Sekret EventSub powinien mieć od **10 do 100 znaków**. Twitch zaleca użycie kryptograficznie losowej wartości.

> **Uwaga:** Nie wpisuj tych wartości bezpośrednio do kodu.

## 5. Ustawienie nagrody Channel Points

Na Twitchu przejdź do:

**Creator Dashboard → Viewer Rewards → Channel Points**

Utwórz własną nagrodę.

Przykładowa nazwa:

```
Timeout
```

Nagroda powinna wymagać wpisania tekstu przez użytkownika.

Przykład podpowiedzi:

```
Wpisz nick osoby, którą chcesz timeoutować.
```

Podczas realizacji użytkownik wpisuje np.:

```
Hajdook
```

Twitch przekazuje ten tekst do EventSub jako `user_input`.

## 6. Pobranie REWARD_ID

Każda własna nagroda Channel Points na Twitchu posiada unikalne ID (`REWARD_ID`).

### Aby znaleźć ID swojej nagrody:

1. Otwórz swój kanał Twitch w przeglądarce.

2. Otwórz narzędzia deweloperskie przeglądarki:  
   **F12**

3. Przejdź do zakładki **Network / Sieć**.

4. W polu filtrowania wpisz:  

    `gql`

6. Na swoim kanale otwórz menu **Channel Points**.

7. W zakładce Network pojawią się żądania Twitcha związane z Channel Points. Otwórz żądanie dotyczące nagród.

8. Przejdź do zakładki **Response / Odpowiedź** i wyszukaj nazwę swojej nagrody, np.:  

    `Timeout`

9. Przy danych nagrody znajdziesz pole `id`, np.:  
   ```json
   "id": "92af127c-7326-4483-a52b-b0da0be61c01"
   ```

10. Skopiuj samą wartość ID:  
   `92af127c-7326-4483-a52b-b0da0be61c01`

Następnie w kodzie Workera znajdź:

```js
const REWARD_ID = "YOUR_REWARD_ID";
```

i zastąp `YOUR_REWARD_ID` skopiowanym ID swojej nagrody:

```js
const REWARD_ID = "92af127c-7326-4483-a52b-b0da0be61c01";
```

Po zmianie wykonaj ponownie **Deploy Workera**.

> **Uwaga:** Każda nagroda Channel Points posiada inne ID. Upewnij się, że kopiujesz ID dokładnie tej nagrody, która ma uruchamiać timeout.

## 7. Ustawienie czasu timeouta

W kodzie znajduje się:

```js
const TIMEOUT_SECONDS = 600;
```

`600` oznacza **10 minut**.

Przykłady:

| Wartość | Czas |
|---------|------|
| `300` | 5 minut |
| `600` | 10 minut |
| `900` | 15 minut |

Możesz zmienić tę wartość według potrzeb.

## 8. OAuth Redirect URL

W Twitch Developer Console ustaw dokładnie:

```
https://TWÓJ-WORKER.workers.dev/auth/callback
```

Adres musi odpowiadać adresowi używanemu przez Workera.

Przykład:

```
https://twitch-timeout.example.workers.dev/auth/callback
```

> Nie dodawaj dodatkowego `/` na końcu, jeśli nie występuje w adresie używanym przez Worker.

## 9. Uprawnienia Twitch OAuth

Bot korzysta z uprawnień potrzebnych do:

- obsługi Channel Points
- aktualizacji statusu realizacji nagrody
- nadawania timeoutów

W kodzie OAuth znajdują się:

```
channel:manage:redemptions
moderator:manage:banned_users
```

Twitch wymaga odpowiednich scope’ów dla operacji wykonywanych przez aplikację. Nie należy dodawać dodatkowych scope’ów bez potrzeby.

## 10. Podłączenie konta Twitch

Po wdrożeniu Workera otwórz:

```
https://TWÓJ-WORKER.workers.dev/auth/twitch
```

Zaloguj się na konto Twitch streamera.

Zaakceptuj wymagane uprawnienia.

Po poprawnym połączeniu Worker pobierze dane konta i zapisze je w Cloudflare KV.

Następnie automatycznie utworzy subskrypcję Twitch EventSub.

## 11. Sprawdzenie statusu

Otwórz:

```
https://TWÓJ-WORKER.workers.dev/status
```

Powinieneś zobaczyć informacje o podłączonym koncie Twitch.

Przykładowo:

```json
[{"id":"123456789","login":"example","reward_id":"..."}]
```

Jeżeli lista jest pusta, konto nie zostało prawidłowo zapisane w KV.

## 12. EventSub

Bot wykorzystuje EventSub do wykrywania realizacji nagrody.

Subskrybowane zdarzenie to:

```
channel.channel_points_custom_reward_redemption.add
```

Twitch wysyła do Workera informacje o każdej realizacji nagrody. EventSub dla tego zdarzenia wymaga odpowiedniego scope’a Channel Points.

Worker filtruje zdarzenia i reaguje wyłącznie na nagrodę posiadającą ustawione `REWARD_ID`.

## 13. Webhook

Webhook znajduje się pod:

```
https://TWÓJ-WORKER.workers.dev/webhook
```

Adres musi być publicznie dostępny przez HTTPS.

Cloudflare Worker spełnia ten warunek.

Twitch podczas tworzenia subskrypcji wysyła żądanie weryfikacyjne z challenge. Worker odpowiada challenge’em, dzięki czemu Twitch może potwierdzić poprawność callbacku.

## 14. Zabezpieczenie EventSub

Worker sprawdza:

- `Twitch-Eventsub-Message-Id`
- `Twitch-Eventsub-Message-Timestamp`
- `Twitch-Eventsub-Message-Signature`

Następnie tworzy **HMAC-SHA256** z:

```
message_id + timestamp + raw_body
```

i porównuje wynik z podpisem przesłanym przez Twitch.

Dzięki temu Worker nie powinien wykonywać poleceń pochodzących ze spreparowanego żądania. Twitch wymaga weryfikowania podpisu przed przetwarzaniem wiadomości EventSub.

## 15. Test działania

Po poprawnym podłączeniu Twitcha:

1. Wejdź na swój kanał.
2. Otwórz Channel Points.
3. Zrealizuj skonfigurowaną nagrodę.
4. Wpisz nick użytkownika.
5. Poczekaj na przetworzenie EventSub.

Bot powinien:

1. wykryć realizację nagrody
2. sprawdzić ID nagrody
3. pobrać wpisany nick
4. znaleźć użytkownika przez Twitch API
5. sprawdzić, czy użytkownik nie jest streamerem
6. nadać timeout
7. oznaczyć realizację jako `FULFILLED`

## 16. Ochrona przed podwójnym wykonaniem

Twitch może ponownie wysłać powiadomienie EventSub, dlatego bot zapisuje ID przetworzonej realizacji w KV.

Dzięki temu ta sama realizacja nie powinna zostać wykonana drugi raz.

## 17. Wymagane dane Cloudflare

Worker powinien mieć:

**KV Binding:**

```
TWITCH_DATA
```

**Secrets:**

```
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
TWITCH_WEBHOOK_SECRET
```

**Konfiguracja w kodzie:**

```js
REWARD_ID
TIMEOUT_SECONDS
```

## 18. Najczęstsze problemy

### OAuth error

Sprawdź, czy:

- Client ID jest prawidłowy
- Client Secret jest prawidłowy
- Redirect URL jest identyczny w Twitch Developer Console i Workerze

### EventSub nie działa

Sprawdź:

- czy konto zostało podłączone przez `/auth/twitch`
- czy `TWITCH_WEBHOOK_SECRET` jest ustawiony
- czy webhook jest dostępny przez HTTPS
- czy `TWITCH_DATA` jest prawidłowo przypisane
- czy Worker został ponownie wdrożony po zmianach

### Nagroda nie uruchamia timeouta

Sprawdź:

- czy `REWARD_ID` jest prawidłowe
- czy nagroda wymaga wpisania tekstu
- czy użytkownik wpisał prawidłowy nick
- czy konto streamera ma odpowiednie uprawnienia moderacyjne

### Timeout nie zostaje nadany

Sprawdź logi Workera i odpowiedź Twitch API.

Konto używane przez bota musi mieć odpowiednie uprawnienia do wykonania operacji moderacyjnej.
