# Point to Point

A full-stack P2P logistics marketplace platform: on-demand transport bookings, company/driver/vehicle management, a
resale marketplace, carpooling, real-time chat and GPS tracking, eco/carbon reward tools, staff & resource (vehicle,
warehouse) sharing between companies, analytics, and an admin panel — with Stripe payments and Mapbox routing.

## Stack

- **Server**: Express + TypeScript, session auth (Passport local strategy + bcrypt), WebSocket (`ws`) for chat/tracking/WebRTC signaling
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless driver)
- **Client**: React 18 + Vite + Tailwind + shadcn/ui, i18next (18 languages), wouter routing
- **Payments**: Stripe (manual-capture "escrow" Payment Intents for bookings, Checkout for company plan upgrades)
- **Maps**: Mapbox (geocoding + directions)
- **AI**: Anthropic Claude (cargo photo recognition, chat translation) — optional, degrades gracefully if unconfigured
- **Calendar sync**: Google Calendar / Microsoft Graph REST APIs — optional
- **Calls**: WebRTC (STUN by default, optional TURN relay for production NAT traversal)
- **Testing**: Vitest (`npm test`)

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, STRIPE_*, MAPBOX_TOKEN, SESSION_SECRET
npm run db:push         # sync the Drizzle schema to your database
npm run dev             # http://localhost:5000
```

### Required environment variables

See `.env.example`. At minimum you need `DATABASE_URL` (PostgreSQL/Neon) to boot the server; Stripe and Mapbox keys
are required for payments and maps features respectively. `ANTHROPIC_API_KEY`, the Google/Microsoft calendar OAuth
vars, `TURN_SERVER_*`, and `PARTNER_JWT_SECRET` are all optional — each feature they gate returns a clear `503` (or,
for calendar sync, simply hides its "Connect" button) rather than crashing the server when unset.

## Scripts

- `npm run dev` — start the API + Vite dev server together on port 5000
- `npm run build` — build the client (Vite) and bundle the server (esbuild) into `dist/`
- `npm start` — run the production build
- `npm run check` — TypeScript type-check
- `npm run test` — run the Vitest unit test suite
- `npm run db:push` — push the Drizzle schema to the configured database

## Feature map

| Area | Where |
|---|---|
| Bookings, offers, quotes | `server/routes.ts`, `client/src/components/BookingFlow.tsx`, `OffersDialog.tsx` |
| Company / driver / vehicle management | `client/src/components/AdminPanel.tsx`, `VehicleManager.tsx` |
| Marketplace listings | `client/src/pages/MarketplacePage.tsx`, `CreateListingDialog.tsx` |
| Carpooling / shared rides | `client/src/pages/CarpoolPage.tsx` |
| Staff & resource (vehicle/warehouse) sharing | `client/src/pages/WorkShareHub.tsx` |
| Chat | `client/src/components/BookingChat.tsx`, `ChatWindow.tsx`, `server/socket.ts` |
| Live tracking | `client/src/components/LiveTrackingMap.tsx`, `TrackingPage.tsx` |
| Eco / carbon rewards | `client/src/pages/EcoPage.tsx`, `EcoRewardPage.tsx`, `CarbonLedger.tsx`, `EcoCalculator.tsx` |
| Analytics & admin | `client/src/pages/AnalyticsPage.tsx`, `AdminPanel.tsx` |
| Company subscription plans (booking-limit enforcement + Stripe checkout) | `client/src/pages/Plans.tsx`, `server/routes.ts` (`/api/companies/:id/subscribe`, `/api/companies/:id/usage`) |

Company accounts have a `subscriptionTier` and `monthlyBookingLimit` (see `shared/schema.ts`). When a customer accepts
a company's offer, the server checks that company's bookings accepted so far this calendar month against its plan
limit and returns `402` if exceeded; the `/plans` page lets a company upgrade via Stripe Checkout.

### Enterprise / platform features

| Area | Where |
|---|---|
| Driver availability calendar (recurring hours, time off) + Google/Outlook sync | `client/src/pages/DriverCalendar.tsx`, `server/services/calendarSync.ts`, `/api/drivers/:id/availability` |
| AI cargo photo recognition (dimensions, weight, fragility, vehicle suggestion) | `client/src/components/CargoAnalyzer.tsx`, `server/services/cargoRecognition.ts` |
| AI chat translation (auto-detect + preserve original) | `client/src/components/BookingChat.tsx` (Translate button), `server/services/translation.ts` |
| Voice/video calls (WebRTC, call history, quality indicator) | `client/src/lib/CallProvider.tsx`, `client/src/components/CallModal.tsx`, `server/socket.ts` |
| Identity & document verification + admin approval | `client/src/components/VerificationUpload.tsx`, `AdminPanel.tsx` (Verification tab) |
| Fraud prevention (risk scoring, duplicate accounts, GPS anomaly, audit log) | `server/services/fraud.ts`, `/api/admin/risk-scores`, `/api/admin/audit-logs` |
| Public Partner API (API keys, OAuth2-style JWT exchange, webhooks, OpenAPI docs) | `server/partnerApi.ts` (mounted at `/partner/v1`), `client/src/components/ApiKeysPanel.tsx`, `docs/partner-api-openapi.yaml` |

Every AI/calendar/TURN integration above is built as a real provider implementation behind a small interface
(`CalendarSyncProvider`, `CargoRecognitionProvider`, `TranslationProvider` in `server/services/`) — switching or
adding a provider means implementing the interface, not rewriting call sites. The Partner API is fully interactive at
`/partner/v1/docs` (Swagger UI) once the server is running.

### Performance & security notes

- **Indexes**: every foreign-key/lookup column added in the schema (bookings, offers, messages, notifications, the
  Batch 2 tables, etc.) has an explicit Drizzle `index()` — run `npm run db:push` after pulling to apply them.
- **Code splitting**: every route in `client/src/App.tsx` is `React.lazy`-loaded, and `LiveTrackingMap` (Mapbox GL,
  the single largest dependency) is lazy-loaded inside `BookingDetailPage` so it only downloads for bookings that
  actually have GPS coordinates to show. This cut the initial JS bundle from ~3.2MB to ~485KB.
- **SSRF guard**: partner webhook URLs are validated (`server/lib/urlSafety.ts`) to reject non-http(s) schemes and
  any hostname resolving to a loopback/private/link-local address (including the cloud metadata IP
  `169.254.169.254`) before a subscription is created.
- **Auth rate limiting**: `/api/auth/login` and `/api/auth/register` have a dedicated 10-attempts/15-minute limiter
  keyed by IP + email/phone, tighter than the general API rate limit, to slow credential stuffing.
- **Postgres-backed sessions**: sessions are stored via `connect-pg-simple` (same `DATABASE_URL`, auto-creates its
  `session` table) instead of in-memory storage, so logins survive a server restart and sessions are shared across
  horizontally-scaled instances.
- **Production CSP**: helmet's Content-Security-Policy is explicitly scoped in production (script/style/img/connect/
  frame allowlists for Stripe.js, Mapbox, and `wss:` WebSocket traffic) rather than left at helmet's restrictive
  default, which would otherwise silently block Stripe Elements, map tiles, and live tracking/chat.
- **Stripe webhook signature verification**: the JSON body parser now preserves the raw request bytes
  (`req.rawBody`) via a `verify` callback so `/api/stripe-webhook` can pass the exact payload Stripe signed to
  `stripe.webhooks.constructEvent` — verifying against the re-serialized JSON object would always fail the
  signature check.
- **Booking authorization (IDOR hardening)**: booking reads and sub-resources (details, messages, attachments,
  tracking, offers, status updates) now check that the caller is the customer who placed the booking, the
  assigned company/driver, or an admin (`server/lib/authz.ts`) before returning data — previously any
  authenticated user could read or mutate any other user's bookings by ID. `GET /api/bookings` now scopes to the
  caller's own bookings (or their company's) instead of returning every booking in the system, and
  `PATCH /api/companies/:id/verify` now requires an admin.
- **Removed a leftover unauthenticated debug endpoint** (`GET /download-code`) that served a source-export file
  with no auth check.
- **Transactional offer acceptance**: `acceptOffer` now runs the offer-accept, reject-competing-offers, and
  booking-assignment writes in a single DB transaction so a failed assignment can't leave the offer table and
  the booking in an inconsistent state.
- **Graceful shutdown & health check**: the server now exposes `GET /health` for liveness/readiness probes and
  handles `SIGTERM`/`SIGINT` by draining in-flight requests and closing the DB pool before exiting.

## Deployment

### Replit

`.replit` is preconfigured to provision a Postgres database, run `npm run dev` for the workspace preview, and deploy
with `npm run build` / `npm run start` on autoscale.

### Render

`render.yaml` defines a Node web service plus a managed Postgres database. Set the `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `MAPBOX_TOKEN`, and `ALLOWED_ORIGINS` environment variables in the Render dashboard (they're
marked `sync: false` in the blueprint so they aren't committed to git). After the first deploy, run
`npm run db:push` once (Render shell or a local connection to the same `DATABASE_URL`) to create the schema.
