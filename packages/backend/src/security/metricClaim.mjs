/**
 * D-090 — METRIC CLAIMS. A reported number carries the identity of the run
 * that produced it, or it cannot be printed.
 *
 * ====================== THE DEFECT CLASS THIS CLOSES =====================
 *
 * D-088 established that the E2E's "MAE 1.0425" was not fabricated: it was
 * arm B's real, reproducible number, quoted in a report describing the V1
 * axis. A fabricated figure dies on re-run. A REAL figure from the WRONG RUN
 * reproduces perfectly and survives every replay check, because it is a
 * correct answer to a different question. Only binding each number to its own
 * run catches it.
 *
 * =================== WHAT WAS CORRECTED IN THE PROPOSAL ==================
 *
 * The reviewed package proposed `sha256Hex(canonicalHash(r))`. Measured
 * against HEAD: `sha256Hex` DOES NOT EXIST in provenance.mjs (exports are
 * canonicalHash, sha256Hex16, maxRelativeDiff, snapshotEnvironment), and
 * `canonicalHash` already returns a full 64-char sha256 hex. So the expression
 * is an import error, and would be double-hashing if it resolved. One
 * canonical hash, applied once.
 *
 * It also took `identity` as a caller-supplied object and minted the
 * fingerprint from it at emission — provenance constructed in the reporting
 * layer, which is the defect itself. Here the identity and the VALUE are both
 * READ OUT OF THE SEALED ARTIFACT. A caller cannot emit `MAE = 1.0425` for a
 * run whose sealed artifact says 1.1726, because the caller never supplies the
 * number at all.
 *
 * ============================ FAIL-CLOSED ENUM ==========================
 *   METRIC_WITHOUT_PROVENANCE  the claim does not resolve to the sealed run
 *   ARTIFACT_TAMPERED          the sealed artifact no longer hashes to its seal
 *   METRIC_NOT_IN_ARTIFACT     the named metric is absent from the run
 *   SELECTION_NOT_CLOSED       a post-selection metric claimed before closure
 */

import { canonicalHash } from '../provenance.mjs';

/** The eight fields that make two runs the same run. Any difference is a different run. */
export const RUN_IDENTITY_FIELDS = Object.freeze([
  'datasetPinSha', 'splitFingerprint', 'preregId', 'engine',
  'engineVersion', 'modelConfigFingerprint', 'seed', 'target', 'armId',
]);

export function runIdentity(source) {
  const id = {};
  for (const f of RUN_IDENTITY_FIELDS) {
    if (!(f in source)) throw new Error(`FAIL_CLOSED[RUN_IDENTITY_INCOMPLETE]: missing "${f}"`);
    id[f] = source[f];
  }
  return Object.freeze(id);
}

/** ONE canonical hash, applied ONCE. No second hashing pass, no second algorithm. */
export function runIdentityFingerprint(identity) {
  return canonicalHash(runIdentity(identity));
}

/**
 * Seals a completed run. `metrics` is a flat map of name -> number, taken from
 * the run's own output. The seal covers identity AND metrics together, so a
 * value cannot be swapped without breaking the seal.
 */
export function sealRunArtifact({ identity, metrics, decisionRecordId, selectionClosedAt = null }) {
  const id = runIdentity(identity);
  for (const [k, v] of Object.entries(metrics ?? {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`FAIL_CLOSED[METRIC_NOT_FINITE]: ${k}=${String(v)}`);
  }
  const body = Object.freeze({
    identity: id,
    metrics: Object.freeze({ ...metrics }),
    decisionRecordId: String(decisionRecordId),
    selectionClosedAt,
  });
  return Object.freeze({ ...body, artifactHash: canonicalHash(body), runFingerprint: runIdentityFingerprint(id) });
}

/** Re-derives the seal. Any edit to identity, metrics or closure breaks it. */
export function verifySealedArtifact(artifact) {
  const { artifactHash, runFingerprint, ...body } = artifact;
  void runFingerprint;
  const actual = canonicalHash(body);
  return actual === artifactHash
    ? Object.freeze({ ok: true })
    : Object.freeze({ ok: false, event: 'ARTIFACT_TAMPERED', reason: `sealed as ${String(artifactHash).slice(0, 16)}… but content hashes to ${actual.slice(0, 16)}…` });
}

/**
 * Emits a claim for ONE metric. The caller names the metric; it does NOT
 * supply the value. That is the whole point: there is no argument through
 * which a wrong number can enter.
 */
export function emitMetricClaim(sealedArtifact, metricName, phase = 'REPORT') {
  const seal = verifySealedArtifact(sealedArtifact);
  if (!seal.ok) throw new Error(`FAIL_CLOSED[ARTIFACT_TAMPERED]: refusing to emit a claim from an edited artifact`);
  if (!(metricName in sealedArtifact.metrics)) throw new Error(`FAIL_CLOSED[METRIC_NOT_IN_ARTIFACT]: "${metricName}" was never measured by this run`);
  if (phase === 'POST_SELECTION_TEST' && sealedArtifact.selectionClosedAt === null) {
    throw new Error('FAIL_CLOSED[SELECTION_NOT_CLOSED]: a post-selection metric cannot exist before selection closed');
  }
  return Object.freeze({
    metric: metricName,
    value: sealedArtifact.metrics[metricName],
    runFingerprint: sealedArtifact.runFingerprint,
    artifactHash: sealedArtifact.artifactHash,
    decisionRecordId: sealedArtifact.decisionRecordId,
    selectionClosedAt: sealedArtifact.selectionClosedAt,
    emittedBy: 'EXPERIMENT_RUN',
    phase,
  });
}

/**
 * Verifies a claim against the live sealed artifact. Compares against the
 * ARTIFACT's own bytes, never against metadata re-derived from the claim —
 * a claim cannot be its own witness.
 */
export function verifyMetricClaim(claim, liveArtifact) {
  if (!liveArtifact) return Object.freeze({ ok: false, event: 'METRIC_WITHOUT_PROVENANCE', reason: 'no sealed run artifact for this decisionRecordId' });
  const seal = verifySealedArtifact(liveArtifact);
  if (!seal.ok) return Object.freeze({ ok: false, event: 'ARTIFACT_TAMPERED', reason: seal.reason });
  if (claim.artifactHash !== liveArtifact.artifactHash) return Object.freeze({ ok: false, event: 'METRIC_WITHOUT_PROVENANCE', reason: 'the claim was emitted from a different artifact than the one presented' });
  if (claim.runFingerprint !== liveArtifact.runFingerprint) return Object.freeze({ ok: false, event: 'METRIC_WITHOUT_PROVENANCE', reason: 'run identity does not match — e.g. a metric from one arm quoted for another' });
  if (!(claim.metric in liveArtifact.metrics)) return Object.freeze({ ok: false, event: 'METRIC_NOT_IN_ARTIFACT', reason: `"${claim.metric}" is absent from the sealed run` });
  if (liveArtifact.metrics[claim.metric] !== claim.value) return Object.freeze({ ok: false, event: 'METRIC_WITHOUT_PROVENANCE', reason: `claimed ${claim.value} but the sealed run measured ${liveArtifact.metrics[claim.metric]}` });
  if (claim.phase === 'POST_SELECTION_TEST' && claim.selectionClosedAt !== liveArtifact.selectionClosedAt) {
    return Object.freeze({ ok: false, event: 'SELECTION_NOT_CLOSED', reason: 'the claim\'s selection-closure marker does not match the run' });
  }
  return Object.freeze({ ok: true });
}

/**
 * The ONLY way a number reaches a report. No claim, or a claim that does not
 * resolve, means nothing is printed — not a placeholder, not a fallback.
 */
export function printMetric(claims, liveArtifact, metricName) {
  const claim = (claims ?? []).find((c) => c.metric === metricName);
  if (!claim) throw new Error(`FAIL_CLOSED[METRIC_WITHOUT_PROVENANCE]: nothing may print "${metricName}" without a claim`);
  const v = verifyMetricClaim(claim, liveArtifact);
  if (!v.ok) throw new Error(`FAIL_CLOSED[${v.event}]: ${v.reason}`);
  return `${metricName}=${claim.value}`;
}
