# Twitch Timeout Bot

Automatyczny bot do Twitcha, który nadaje **10-minutowego timeouta** użytkownikowi wskazanemu w realizacji nagrody Channel Points.

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