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

---

# Security — commercial backend (audit-current, English)

The threat model above predates the commercial layer. Genesis now has **real user
accounts, sessions, API keys, RBAC, and Stripe billing**. This section is the honest,
audited (2026-07) state of that backend.

## Verified-good controls
- **Passwords:** scrypt with per-user salt (`auth.mjs`). N=16384 (acceptable, on the low
  side).
- **SQL:** uniformly parameterized (`node:sqlite` prepared statements). The only
  template-literal queries interpolate internal constants, not user input.
- **Stripe webhooks:** HMAC-SHA256 over the **raw** body, constant-time compare, timestamp
  tolerance (`billing/stripe.mjs`). Idempotent provisioning via a processed-events table.
- **RBAC + tenant isolation:** roles enforced per handler; project ownership checked
  consistently.
- **Transport hardening:** CSP / X-Frame-Options / nosniff / Referrer-Policy on every
  response; path-traversal-safe static server; graceful SIGTERM/SIGINT shutdown.

## Open blockers (MUST fix before public multi-tenant production)
| # | Severity | Issue |
|---|----------|-------|
| C1 | Critical | `/api/science/*` and `/api/compute/*` run **before** the auth gate and spawn Python subprocesses → unauthenticated compute DoS. |
| C2 | Critical | Rate limiting keyed on raw socket IP, no `X-Forwarded-For` → collapses to one bucket behind a proxy. The `/api/v1` monthly quota is the only reliable per-client limit (and its usage increment is non-atomic). |
| H3 | High | Session tokens and API keys stored **in plaintext** in SQLite (strong CSPRNG values, but a DB/backup leak is directly usable). Store SHA-256 of the secret. |
| M1 | Medium | No `uncaughtException` / `unhandledRejection` handler. |
| M2 | Medium | No per-account login throttle / lockout (only the broken IP limiter). |
| M4 | Medium | No CORS headers → public API unusable from browsers. |
| M5 | Medium | `regenerateAccountKey` deletes-then-creates non-transactionally. |

Full detail and remediation notes: **KNOWN_LIMITATIONS.md §2**.

## Reporting a vulnerability
Private report to the repository owner (GitHub → Security → Report a vulnerability). Do not
open public issues with exploit detail before a fix.
