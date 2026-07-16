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

## Blockers — status after Stage 8 (Security & Production Hardening)
| # | Severity | Issue | Status |
|---|----------|-------|--------|
| C1 | Critical | Subprocess-spawning compute (`/api/science/laboratory-readiness`, `/api/science/molecule/render`) reachable unauthenticated → DoS. | **FIXED** — both now require a valid session token (`api.mjs`); `/api/compute/run` runs only bounded in-process physics models (no subprocess), left public by design. |
| C2 | Critical | Rate limiting keyed on raw socket IP, no `X-Forwarded-For`. | **FIXED** — `clientIp()` honours `X-Forwarded-For` only when `GENESIS_TRUST_PROXY=true` (spoof-safe otherwise); wired into both limiters (`server.mjs`). |
| H3 | High | Session tokens and API keys stored in plaintext. | **FIXED** — tokens/keys stored as SHA-256 (`secrets.mjs`, schema v24 in-place migration). Raw value shown once at creation; dashboard shows a masked hint. Existing users keep working (raw presented → hashed → matches). |
| M1 | Medium | No global crash handlers. | **FIXED** — `unhandledRejection` logged (process survives); `uncaughtException` logged + controlled shutdown (`server.mjs`). |
| M5 | Medium | `regenerateAccountKey` non-transactional. | **FIXED** — wrapped in a BEGIN/COMMIT/ROLLBACK transaction (`api.mjs`). |
| M2 | Medium | No per-account login throttle/lockout. | **FIXED (Genesis 2.0)** — persistent per-account lockout (`login_attempts`, schema v25): 8 failed attempts → 15-min lock, checked before password verification; a success clears the counter (`store.mjs`, `api.mjs`). Survives restart. |
| M4 | Medium | No CORS headers → public API unusable from browsers. | **FIXED (Genesis 2.0)** — config-gated CORS for `/api/v1` via `GENESIS_CORS_ORIGINS` (allowlist or `*`; empty = off). Origin echoed only when explicitly allowed; OPTIONS preflight handled (`lib.mjs`, `server.mjs`). |
| M3 | Medium | `server.mjs` dispatch allow-list hand-synced with `api.mjs`. | **MITIGATED** — the prefixes are now a single named constant (`PERSIST_API_PREFIXES`) instead of scattered `startsWith` checks. |
| H1 | High | Blocking event loop (sync SQLite + `execFileSync` compute). | **DEFERRED** — a true non-blocking worker queue requires an async router refactor (a redesign, out of scope). See FUTURE_WORK.md. |
| H2 | High | In-process jobs, no orphan recovery. | **DEFERRED** — depends on the same execution refactor (H1). |
| — | Ops | Single-file SQLite, no backup/DR. | **OPEN (ops task, not code)** — put `genesis.db` on a durable volume + scheduled WAL-aware backups. See DEPLOYMENT.md. |

The `/api/v1` monthly quota remains the reliable per-client limit; its usage increment is
still a non-atomic read-modify-write (safe single-instance — `node:sqlite` is synchronous and
JS is single-threaded, so the read-modify-write cannot interleave within one process; revisit
only for multi-instance).

Full detail and remediation notes: **KNOWN_LIMITATIONS.md §2**.

## Reporting a vulnerability
Private report to the repository owner (GitHub → Security → Report a vulnerability). Do not
open public issues with exploit detail before a fix.
