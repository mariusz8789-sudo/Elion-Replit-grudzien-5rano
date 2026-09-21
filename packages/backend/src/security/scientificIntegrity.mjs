/**
 * D-084 — scientific-integrity watchdogs.
 *
 * Security in this repository is not only "can a stranger read the database".
 * The asset worth protecting is the HONESTY OF THE VERDICT. The ways to
 * corrupt it are specific and enumerable, so they are watched specifically:
 *
 *   - move a frozen threshold so a failing model passes
 *   - swap the pinned data under a model that already passed
 *   - write a WinnerRecord that the canonical gate never produced
 *   - change the analysis after seeing the result (HARKing)
 *   - promote on evidence that never reached the required rank
 *   - merge two incomparable endpoint families to clear a row count
 *
 * ==================== WHY THIS DOES NOT RE-IMPLEMENT ANYTHING =============
 *
 * The reviewed candidate package hardcoded the gate thresholds
 * (MIN_TRAIN: 150, MIN_TEST: 40, MAX_MAE: 1.0, MIN_R2: 0.25) and the pin
 * hashes as fresh constants. That creates a SECOND source of truth: edit the
 * real gate and the watchdog is the only thing that disagrees, and edit both
 * and nothing disagrees at all. It also reintroduced the missing-pin
 * inversion already fixed in D-083:
 *
 *   live[k] !== undefined && live[k] !== BASE_PINS[k]     // absent pin passes
 *
 * So these watchdogs hold NO thresholds and NO row counts of their own. They
 * anchor on RULE FINGERPRINTS and delegate to the existing loaders — the gate
 * loader that re-hashes the gate object on every read (validationGate.mjs)
 * and the manifest verifier whose three states are distinct (pinManifest.mjs).
 * A watchdog that agreed with a tampered file would be worse than none.
 */

import { loadValidationGate } from '../campaign/validationGate.mjs';
import { verifyPinManifest } from '../campaign/pinManifest.mjs';
import { GLP1R_GATE_PATH } from '../campaign/glp1rQsar.mjs';
import { GIPR_GATE_PATH } from '../campaign/giprQsar.mjs';

/**
 * The frozen rule fingerprints as sealed by D-077 (GLP-1R) and D-081 (GIPR).
 * These are TRIPWIRES, not thresholds: the numbers still live only in the gate
 * files. Changing a threshold changes the gate object's hash, which no longer
 * matches the fingerprint here, which is the alarm.
 */
export const FROZEN_GATE_FINGERPRINTS = Object.freeze({
  GLP1R: 'd2f77a7e6042f0fc',
  GIPR: 'e648580eeec19aab',
});

/** Minimum evidence class rank that may support a promotion (INDIRECT_RANDOMISED). */
export const MIN_PROMOTION_RANK = 9;

/** Reports GATE_TAMPERED for any frozen gate that no longer matches its sealed fingerprint. */
export function watchGates(paths = { GLP1R: GLP1R_GATE_PATH, GIPR: GIPR_GATE_PATH }, expected = FROZEN_GATE_FINGERPRINTS) {
  const events = [];
  for (const [label, gatePath] of Object.entries(paths)) {
    const res = loadValidationGate(gatePath, { targetLabel: label, expectedRuleFingerprint: expected[label] });
    if (!res.ok) events.push(Object.freeze({ event: 'GATE_TAMPERED', target: label, code: res.code, reason: res.reason }));
  }
  return Object.freeze(events);
}

/**
 * Delegates custody entirely to `verifyPinManifest`, whose MISSING / DRIFTED /
 * VERIFIED states are already distinct and fail-closed. A pin declared and
 * absent raises PIN_MISSING here, never a silent pass.
 */
export function watchPins(manifest, loaded) {
  const res = verifyPinManifest(manifest, loaded);
  if (res.ok) return Object.freeze([]);
  const events = [
    ...res.missing.map((pinId) => ({ event: 'PIN_MISSING', pinId })),
    ...res.drifted.map((d) => ({ event: 'PIN_DRIFT', pinId: d.pinId, expected: d.expected, actual: d.actual })),
  ];
  if (events.length === 0) events.push({ event: 'PIN_MISSING', pinId: null, reason: res.reasons.join('; ') });
  return Object.freeze(events.map(Object.freeze));
}

/**
 * A WinnerRecord may exist ONLY as the output of the canonical gate. Any other
 * provenance is a fabrication attempt regardless of how good the candidate
 * looks — `if (candidate looks best) winner = candidate` is precisely the
 * thing this repository exists to make impossible.
 */
export function watchWinnerFabrication(winnerRecord, promotionOutcome) {
  if (!winnerRecord) return Object.freeze([]);
  if (promotionOutcome === 'PROMOTE') return Object.freeze([]);
  return Object.freeze([Object.freeze({
    event: 'WINNER_FABRICATION_ATTEMPT',
    reason: `a WinnerRecord exists while the canonical gate returned "${promotionOutcome}"; the gate is the only producer of a WinnerRecord`,
  })]);
}

/**
 * Promotion on evidence below the required rank is fabrication even if the
 * gate said PROMOTE.
 *
 * ONLY WHEN A PROMOTION ACTUALLY HAPPENED. A first version fired whenever the
 * best available evidence ranked below the bar, regardless of outcome — which
 * meant it raised WINNER_FABRICATION_ATTEMPT on every honest NO_WINNER run,
 * because weak evidence AND no promotion is precisely the correct result this
 * repository exists to produce. Caught when the E2E turned red against a
 * verdict that was right. A watchdog that cries wolf on the correct outcome
 * teaches its readers to ignore it, which is worse than not having one.
 */
export function watchEvidenceRank(promotion, minRank = MIN_PROMOTION_RANK) {
  if (!promotion || typeof promotion.maxRank !== 'number') return Object.freeze([]);
  if (promotion.outcome !== 'PROMOTE') return Object.freeze([]);
  if (promotion.maxRank >= minRank) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    event: 'WINNER_FABRICATION_ATTEMPT',
    reason: `a PROMOTE was issued on evidence of rank ${promotion.maxRank}, below the required ${minRank}; in-silico work ranks COMPUTATIONAL and cannot reach ${minRank} by accumulating`,
  })]);
}

/** Analysis fingerprint diverging from the sealed preregistration is HARKing, recorded as a security event. */
export function watchHark(preregFingerprint, analysisFingerprint) {
  if (preregFingerprint === analysisFingerprint) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    event: 'HARK_MISMATCH',
    reason: `the analysis fingerprint (${analysisFingerprint}) differs from the sealed preregistration (${preregFingerprint}); the rules were changed after the data was seen`,
  })]);
}

/** Runs every watchdog and returns one flat, frozen event list. Empty means clean. */
export function runIntegrityWatchdogs({ gatePaths, manifest, loadedPins, winnerRecord, promotionOutcome, promotion, preregFingerprint, analysisFingerprint } = {}) {
  const events = [
    ...(gatePaths === null ? [] : watchGates(gatePaths ?? undefined)),
    ...(manifest ? watchPins(manifest, loadedPins ?? {}) : []),
    ...watchWinnerFabrication(winnerRecord, promotionOutcome),
    ...watchEvidenceRank(promotion),
    ...(preregFingerprint !== undefined && analysisFingerprint !== undefined ? watchHark(preregFingerprint, analysisFingerprint) : []),
  ];
  return Object.freeze({ clean: events.length === 0, events: Object.freeze(events) });
}
