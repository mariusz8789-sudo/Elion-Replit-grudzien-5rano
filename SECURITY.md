# Bezpieczeństwo Genesis OS

## Model zagrożeń (stan: audyt 2026-07)

| Powierzchnia | Ochrona |
|---|---|
| Klucz API Anthropic | Wyłącznie po stronie backendu (zmienna środowiskowa); frontend nie ma do niego żadnej ścieżki |
| Wejście użytkownika → LLM | Pytanie ≤ 500 znaków; kontekst walidowany typami (sanitizeFlat: płaskie wartości, limity kluczy i długości); żądanie ≤ 16 kB |
| Nadużycie AI (koszty) | Rate limit 10 pytań/min/IP z okresowym sprzątaniem pamięci |
| Prompt injection | Grounding architektoniczny: model dostaje tylko stan symulacji widoczny na ekranie + system prompt z twardymi zasadami; odpowiedzi `refusal` obsłużone |
| Path traversal (serwer statyczny) | Kanonizacja ścieżek + prefix check; zweryfikowane wektory `/../` i `..%2f` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Service worker | Nie cache'uje `/api/`; zasoby tylko same-origin GET |
| Docker | Proces jako `node` (nie root), obraz slim bez devDependencies |
| Dane użytkownika | Aplikacja nie zbiera danych osobowych; pytania do AI nie są zapisywane przez backend |

## Zgłaszanie podatności

Zgłoś problem przez prywatne zgłoszenie do właściciela repozytorium
(GitHub → Security → Report a vulnerability). Nie otwieraj publicznych issue
z detalami exploita przed poprawką.

## Świadome ograniczenia (do adresowania przy skalowaniu)

- Rate limit jest per-proces (in-memory) — przy wielu instancjach autoscale
  potrzebny współdzielony magazyn (np. Redis) albo limit na warstwie edge.
- Brak CSP w nagłówkach — do dodania na poziomie hostingu/edge przy publicznym
  wdrożeniu (aplikacja nie używa inline skryptów, więc polityka może być ścisła).
- Brak kont użytkowników = brak danych do wycieku; przy wprowadzeniu kont
  (Etap 3 roadmapy) wymagany osobny przegląd (hasła, sesje, RODO/COPPA dla EDU).
