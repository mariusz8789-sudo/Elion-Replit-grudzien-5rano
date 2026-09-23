# Genesis — Human Explorer + Mirror Product Acceptance

Branch: `claude/genesis-final-human-mirror-product`. Base: `codex/genesis-final-integration` @ `a36e3bca836095ba0fbfc8ef4b70a2b2b3b472b4`.

This is a PRODUCT/UI implementation pass on top of existing canonical systems. No new
Human Digital Twin, anatomy state, Mirror state machine, renderer, WorldGraph, or Evidence
system was created. Everything below composes systems that already existed on the base
branch, or is a thin, honestly-labelled browser adapter.

## 1. Human Explorer product flow

`packages/frontend/src/components/HumanExplorerPanel.tsx` was audited in full and found
already complete against this task's brief: full human → system → organ → isolate →
metadata/provenance → cross-section → Hyperscope/micro → back, all driven by the existing
`HumanDigitalTwinManifest`, `AnatomyViewState`, `explorerPath`/`explorerCommands` and the
existing `CutawayState`/isolation contract owned by the screen. Every structure already
carries an honest per-structure evidence label (`explorerTruthLabel`, `organ.epistemic`,
`organ.representation.confidence/resolution.status`) and the panel's own header names the
model `PROXY`/`CC0` and "anatomy model" — never patient-specific or medically validated.
**No changes were made to this file** — it already satisfies feature 1, and duplicating or
rewriting it would have created a second anatomy UX, which this task explicitly forbids.

## 2. Segmentable anatomy software (`anatomyIntegrationShell.ts`)

Added `evaluateAnatomySoftwareReadiness(manifest, provenPlaceholderRuntimePath)` —
additive only, reuses the existing `resolveAnatomyLayerShell` and
`evaluateAnatomyVisualAsset` exactly as already declared on the base branch. It proves,
for all six canonical layers (SKIN, MUSCLES, SKELETON, VESSELS, NERVES, ORGANS):

- the shell resolves a well-formed presentation per layer (stable `pickId`, provenance
  source, hierarchy/system mapping, LOD declaration, deterministic binding);
- the asset-governance gate mechanism itself works, proven against a real, already-APPROVED
  free/CC0 asset (`cc0-mpfb-human-lod0`) — never a purchased or fabricated one;
- each layer's *own* configured asset slot is checked independently against the same gate.

Current, honest result on this repository: **`EXTERNAL_ASSET_REQUIRED`**. The software
path is fully proven (`shellLogicProven: true`, placeholder gate `mayLoadVisualAsset:
true`), but no canonical layer's own asset slot yet resolves to a registered, licensed,
segmented runtime asset. No purchase was made and no premium model is fabricated by this
evaluation or anywhere in this change. `status` only ever becomes
`SOFTWARE_READY_FOR_PREMIUM_ASSET` once a real layer asset is registered as `APPROVED` in
`assetGovernance.ts` (owned by another workstream, not touched here).

Tests: `packages/frontend/src/__tests__/anatomyIntegrationShell.test.ts` (2 new cases,
4 total in file, all passing) prove both the honest `EXTERNAL_ASSET_REQUIRED` result and
the failure path when the placeholder proof itself is not approved.

## 3. Mirror product flow

`packages/frontend/src/components/MirrorStatusScreen.tsx` was rewritten to drive the
**existing, unmodified** canonical `MirrorTwinSession` state machine
(`packages/core/src/flagship/mirrorTwin.ts`, `createMirrorSession`/`mirrorTransition`) —
no second Mirror state machine was added. UI states shown: `MIRROR_IDLE →
CONSENT_REQUIRED → SCANNING → SYNCING → TWIN_READY → DIVERGENCE_MODE → CAPTURE → REPLAY`.

**Resolved design gap — no `ERROR` state exists in the canonical `MirrorState` union.**
Rather than invent a parallel state machine to add one, the UI surfaces the canonical
session's own `refusals: readonly string[]` field (already populated by
`mirrorTransition` on any illegal event, declined consent, or telemetry refusal) plus a
local adapter-failure message, as a single honest `data-testid="mirror-blocked"` banner.
This satisfies the brief's error-visibility intent using the machine's own real signal
instead of a second, competing state machine.

The header permanently discloses **`EXPERIMENTAL / SYNTHETIC / NOT_CALIBRATED`**. The UI
never renders the literal strings `CONNECTED` or `CALIBRATED` (asserted by test). Camera
status, consent state, and `session.appearance.sourceMode` are always shown from real
values — never fabricated.

### Browser camera adapter (`core/mirrorProduct/browserCameraAdapter.ts`)

The one new subsystem this task required: no `getUserMedia`/`mediaDevices`/`MediaStream`
integration existed anywhere in this repository before this branch. `createBrowserCameraAdapter`
is a plain adapter — it never calls `mirrorTransition` itself and never invents a Mirror
state. It only:

- requests/reports real camera **capability and consent** (`UNAVAILABLE | NOT_REQUESTED |
  PERMISSION_DENIED | STREAM_OPEN | STOPPED | ERROR`), via the real `navigator.mediaDevices.getUserMedia`
  (injectable for tests — never a real camera or browser required to test it);
- on success, builds the exact `TELEMETRY` event payload the canonical `mirrorTransition`
  already accepts — **always** `mode: 'SYNTHETIC_FALLBACK'`, `confidence: 0`. It never
  reports `mode: 'MEDIAPIPE'`, because there is no real face-landmark extraction in this
  repository. A real, open camera stream proves real consent and real device capability —
  it does not prove face tracking, calibration, or identity, and this adapter never claims
  otherwise.
- stops every opened `MediaStreamTrack` via `stop()` — the one cleanup path, called on
  every failed request and on component unmount (verified by lifecycle tests, §4).

Tests: `packages/frontend/src/__tests__/browserCameraAdapter.test.ts` (8 cases, all real
logic against an injected fake `MinimalMediaDevices`, no browser required) and
`packages/frontend/src/__tests__/mirrorStatusScreen.test.tsx` (1 static-markup smoke test,
this repo's established component-test convention — no jsdom/RTL is configured here).

## 4. GPU / lifecycle

`MirrorStatusScreen.tsx` mounts no new Three.js scene, renderer, or animation loop — it is
plain DOM/React, consuming no `useThreeLoop` instance at all (nothing in this feature
needs one). Its only owned resource is the camera adapter's `MediaStreamTrack`s, and its
`useEffect(() => () => adapterRef.current?.stop(), [])` cleanup guarantees every track
opened during the component's life is stopped on unmount — proven directly by
`browserCameraAdapter.test.ts`'s `stop()` tests (idempotent, stops every real track, safe
to call with nothing open, safe to call twice). `HumanExplorerPanel.tsx` was not modified,
so its existing lifecycle discipline (audited, unchanged) stands as-is.

## 5. Real browser E2E

`packages/e2e/src/mirror.e2e.spec.ts` — real Playwright against the real, built production
server (`node packages/backend/src/start.mjs` serving `packages/frontend/dist`), real
Chromium (`/opt/pw-browsers/chromium`), three scenarios, **3/3 passing**:

1. **Desktop, no camera permission**: `MIRROR_IDLE → CONSENT_REQUIRED`, consent click ⇒
   `PERMISSION_DENIED|ERROR|UNAVAILABLE`, `mirror-blocked` banner visible, never
   `STREAM_OPEN`.
2. **Desktop, full OS/browser permission + Chromium fake video device**: proves the site's
   own response header still wins (see the real finding below) — never a fabricated
   `STREAM_OPEN`, never `MEDIAPIPE`, even with full browser-level consent granted.
3. **Mobile viewport** (390×844, this repo's existing mobile-test convention): panel
   visible, `Enter zone` control reachable and on-screen, `CONSENT_REQUIRED` reached, both
   consent buttons visible, `document.documentElement.scrollWidth` does not exceed the
   viewport (no horizontal overflow), zero unexpected console/page errors.

No screenshots were needed to diagnose any defect; none were generated. No video/MP4 was
generated.

### Honest blocker found via live E2E — site-wide `permissions-policy: camera=()`

`packages/backend/src/lib.mjs`'s `SECURITY_HEADERS['permissions-policy']` is
`'camera=(), microphone=(), geolocation=(), interest-cohort=()'`, sent unconditionally on
every response. This disables `getUserMedia` for the **entire origin**, regardless of
browser/OS camera permission grants. Confirmed live: even with Playwright's `permissions:
['camera']` context grant and Chromium's fake video device, the real browser still refuses
`getUserMedia` at the document level and logs `"Permissions policy violation: camera is not
allowed in this document."` — the adapter correctly, honestly reports `PERMISSION_DENIED`/
`ERROR`, never a fabricated success.

This is a genuine, pre-existing, site-wide constraint, not a defect in this change, and
`packages/backend/**` is explicitly outside this task's ownership, so it was **not**
modified. A real camera-based Mirror experience additionally requires a scoped
`permissions-policy` header change (e.g. `camera=(self)`), which is backend infrastructure
for a separate, backend-owning workstream to make.

## Architecture rules honoured

Exactly one Human Digital Twin, one Mirror state contract
(`packages/core/src/flagship/mirrorTwin.ts`, unmodified), one renderer, one WorldGraph, one
Evidence system, one command path — none duplicated. No `ALLOWED_ORPHANS` entries added. No
fake observations, calibration, patient data, or hardware-validation claims anywhere in
this change.
