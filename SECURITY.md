# Bezpieczeństwo Genesis OS

## Model zagrożeń (stan: audyt 2026-07)

| Powierzchnia | Ochrona |
|---|---|
| Klucz API Anthropic | Wyłącznie po stronie backendu (zmienna środowiskowa); frontend nie ma do niego żadnej ścieżki |
| Wejście użytkownika → LLM | Pytanie ≤ 500 znaków; kontekst walidowany typami (sanitizeFlat: płaskie wartości, limity kluczy i długości); żądanie ≤ 16 kB |
| Nadużycie AI (koszty) | Rate limit 10 pytań/min/IP z okresowym sprzątaniem pamięci |
| Prompt injection | Grounding architektoniczny: model dostaje tylko stan symulacji widoczny na ekranie + system prompt z twardymi zasadami; odpowiedzi `refusal` obsłużone |
| Path traversal (serwer statyczny) | Kanonizacja ścieżek + granica katalogu (`staticDir` + separator, nie sam `startsWith`); zweryfikowane wektory `/../` i `..%2f` (`packages/backend/src/lib.mjs` + `lib.test.mjs`) |
| MIME sniffing / clickjacking / referrer leak | Nagłówki bezpieczeństwa na KAŻDEJ odpowiedzi: `Content-Security-Policy` (`default-src 'self'`, zero inline), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` — patrz `SECURITY_HEADERS` w `lib.mjs` |
| Service worker | Nie cache'uje `/api/`; zasoby tylko same-origin GET |
| Docker | Proces jako `node` (nie root), obraz slim bez devDependencies |
| Dane użytkownika (backend) | Aplikacja nie zbiera danych osobowych; pytania do AI nie są zapisywane przez backend |
| Dane lokalne (przeglądarka) | Ustawienia, dziennik odkryć i statystyka aktywności żyją wyłącznie w `localStorage` tej przeglądarki (`core/storage.ts`) — zero transmisji sieciowej, zero konta, jeden przycisk „wyczyść dane lokalne" w Ustawieniach. Odczyty są walidowane pole po polu, bo localStorage jest edytowalny poza aplikacją. |

## Zgłaszanie podatności

Zgłoś problem przez prywatne zgłoszenie do właściciela repozytorium
(GitHub → Security → Report a vulnerability). Nie otwieraj publicznych issue
z detalami exploita przed poprawką.

## Świadome ograniczenia (do adresowania przy skalowaniu)

- Rate limit jest per-proces (in-memory) — przy wielu instancjach autoscale
  potrzebny współdzielony magazyn (np. Redis) albo limit na warstwie edge.
- Brak kont użytkowników = brak danych do wycieku; przy wprowadzeniu kont
  (roadmapa) wymagany osobny przegląd (hasła, sesje, RODO/COPPA dla EDU).
