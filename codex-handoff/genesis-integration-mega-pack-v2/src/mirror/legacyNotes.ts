/**
 * Documentation-only module (no runtime logic) recording the Mirror consolidation
 * decision for Codex's real-repo integration. Nothing here is imported for behavior.
 */

/**
 * Real repo (`packages/core/src/flagship/mirrorTwin.ts`) state union, exactly:
 *   'MIRROR_IDLE' | 'SCANNING' | 'SYNCING' | 'TWIN_READY' | 'DIVERGENCE_MODE' | 'CAPTURE' | 'REPLAY'
 * plus a `divergenceAllowed: true` field.
 *
 * `mirrorContract.ts`'s `MirrorState` is a strict superset (adds `CONSENT_REQUIRED` and
 * `ERROR`), and `GenesisMirrorRuntime.divergence()` is always callable from
 * SYNCING/TWIN_READY with no separate flag needed — semantically equivalent to the real
 * repo's `divergenceAllowed: true` being unconditional.
 *
 * Integration decision required from Codex/the user (this package does not make it):
 * the real repo's `mirrorTwin.ts` is driven today by a 100%-hardcoded scripted event
 * sequence in `agenticScienceRuntime.ts::runFlagshipJourney` (SYNTHETIC_FALLBACK
 * telemetry, no real sensor). `mirrorContract.ts::GenesisMirrorRuntime` can either:
 *   (a) replace `mirrorTwin.ts` outright, with `runFlagshipJourney` driving it via
 *       `FakeCameraFrameSource` (preserves today's deterministic scripted behavior
 *       exactly) while a real UI surface gets the option to use
 *       `BrowserCameraFrameSource` instead, or
 *   (b) be adopted only for NEW callers (D-142, bio-real-lab) while `mirrorTwin.ts`
 *       stays as-is for the existing flagship journey.
 * (a) is recommended — it removes a duplicate state machine instead of adding a fifth
 * one — but it is a product decision, not something this package should force silently.
 *
 * Retired by this package (do not reintroduce as separate implementations):
 *   - D-142 V2's own `src/mirror.ts` (was structurally identical to this file)
 *   - bio-real-lab-v1's own `src/mirror.ts` (independent near-duplicate of the above)
 * Both `precisionBay/` and `bioRealLab/` in this V2 package import
 * `mirror/mirrorContract.ts` instead of declaring their own state machine.
 *
 * Already-dead code in the real repo, unaffected by this decision either way:
 *   - `packages/core/src/mirror/GenesisMirrorBridge.ts` (imported only by unit tests)
 *   - `packages/ui/src/mirror/GenesisMirrorClient.ts` (imported only by unit tests;
 *     depends on `@mediapipe/tasks-vision`, which is not installed anywhere in the repo)
 * Neither is a Mirror *state machine* competitor to this contract — they are an
 * unreachable bridge/client pair. Leave the integration decision about deleting them to
 * Codex/the user; this package does not touch real-repo files.
 */
export const MIRROR_CONSOLIDATION_NOTE = true;
