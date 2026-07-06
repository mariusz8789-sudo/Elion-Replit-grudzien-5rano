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
- **Real Stripe payment collection**: `PaymentDialog` previously had a hard-coded "demo payment" path that marked
  a booking as paid without ever charging a card. It's now a real `@stripe/react-stripe-js` `Elements`/
  `PaymentElement` checkout (`client/src/lib/stripe.ts`) that confirms the manual-capture PaymentIntent created by
  `/api/create-payment-intent`; payment status is now updated exclusively by the Stripe webhook, and the manual
  `PATCH /api/bookings/:id/payment` override is admin-only reconciliation, not a client-facing endpoint.
- **More authorization gaps closed**: removed a duplicate unauthenticated `POST /api/vehicles` route that
  shadowed the authenticated one; added company/driver ownership checks to `POST /api/drivers`,
  `PATCH /api/drivers/:id/availability`, `POST /api/vehicles`, `PATCH /api/bookings/:id/assign`, and
  `POST /api/messages` / `/api/attachments` / `/api/tracking` (which also now force the sender/uploader identity
  from the session instead of trusting the request body); `POST /api/notifications` and
  `PATCH /api/notifications/:id/read` no longer let one user spoof or silence another user's notifications.
- **Data integrity**: `reviews` now has a unique `(bookingId, reviewerId)` constraint so a customer can't submit
  multiple reviews for the same booking; carpool ride booking (`POST /api/carpool/:id/book`) computes price
  server-side from the ride's own rate (never trusts a client-supplied total) and uses a transactional
  conditional seat-count update to close a seat-oversell race between concurrent bookings.
- **Fixed WorkShare HUB (staff/resource sharing)**: the feature was broken end-to-end — the frontend form posted
  fields (`staffType`, `availability`, `minHours`/`maxHours`) that didn't exist on the `staff_sharing` table, and
  the create route tried to override a `providerCompanyId` field that table doesn't have (the real column is
  `lenderCompanyId`), so every submission failed validation. `staff_sharing` gained the missing columns
  (`staffType`, `availability`, `minHours`, `maxHours`) and relaxed `borrowerCompanyId`/`driverId`/`startDate`/
  `endDate` to nullable (a freshly-posted listing has no borrower or dates yet — those are set once another
  company requests it); `resource_sharing` gained a matching `availability` column and a nullable `description`.
  `PATCH /api/{staff,resource}-sharing/:id/status` now checks that the caller is the listing's own company, the
  already-matched counterparty, or an admin before changing status, and records the requesting company as the
  borrower/requester the first time a listing is requested.
- **Company subscription IDOR closed**: `POST /api/companies/:id/subscribe` and `GET /api/companies/:id/usage` now
  require the caller belong to that company (or be an admin) — previously any authenticated user could view
  another company's booking usage or kick off a Stripe checkout that upgrades a company they have no relationship
  with.
- **More booking sub-resources authorized**: GPS anomaly checks, AI cargo-item analysis/creation/correction, and
  chat message translation now all verify the caller can access the underlying booking via
  `userCanAccessBooking`, matching the pattern applied to messages/attachments/tracking in earlier batches.
- **AI endpoints rate-limited separately**: cargo-photo analysis and chat translation call the paid Anthropic API
  per request, so they now sit behind a dedicated 10-requests/minute-per-user limiter instead of sharing the
  general 100-requests/15-minute API limiter, which could otherwise let one client burn most of that budget on
  cheap routes and still fire dozens of paid AI calls.
- **Driver time-off/calendar-sync ownership checks**: creating/deleting a driver's time-off entries, requesting a
  calendar OAuth URL, and viewing/disconnecting calendar connections now require the caller be that driver, their
  company, or an admin — previously any authenticated user could manage another driver's time off or calendar
  sync.
- **Polish (`pl.json`) translation completed**: the locale was missing 7 of 14 top-level sections (`admin`,
  `dashboard`, `eco`, `marketplace`, `offers`, `payment`, `tracking` — 47 keys) and silently fell back to English
  mid-screen for checkout, tracking, offers, and admin UI; it now has full key parity with `en.json`.

## Deployment

### Replit

`.replit` is preconfigured to provision a Postgres database, run `npm run dev` for the workspace preview, and deploy
with `npm run build` / `npm run start` on autoscale.

### Render

`render.yaml` defines a Node web service plus a managed Postgres database. Set the `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `MAPBOX_TOKEN`, and `ALLOWED_ORIGINS` environment variables in the Render dashboard (they're
marked `sync: false` in the blueprint so they aren't committed to git). After the first deploy, run
`npm run db:push` once (Render shell or a local connection to the same `DATABASE_URL`) to create the schema.
