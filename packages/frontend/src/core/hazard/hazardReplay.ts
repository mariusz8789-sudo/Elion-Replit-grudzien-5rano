/**
 * PHASE 0 — HAZARD REPLAY GATE.
 *
 * Deliberately separate from `core/discovery/discoveryReplay.ts` (epidemic
 * replay stays untouched — see docs/PHASE0_HAZARD_PROVENANCE_FOUNDATION.md,
 * "why a separate replay path"). The two share only the generic hashing
 * primitives, not a code path, so hazard replay can never silently gain
 * epidemic-replay behavior or vice versa. This file makes no change to
 * `discoveryReplay.ts` or its semantics.
 *
 * Replay NEVER re-fetches a live source: it reads the frozen `SourceArtifact`
 * already sitting in the store by id, and if that artifact is missing or its
 * pinned content hash no longer matches what the `HazardInput` was created
 * against, the run is BLOCKED — never a false MATCH (audit doc §8).
 *
 * The `evaluator` this module calls is supplied by the caller and MUST be a
 * test-local deterministic reference fixture in Phase 0 — seeing one here is
 * not evidence of a real hazard model; see `HazardReferenceEvaluator`'s own
 * doc comment.
 *
 * CAPABILITY FENCE (earthquake final-readiness gate): when a caller supplies
 * `hazardType`, this function calls the Hazard Module Registry's
 * `assertHazardRunCompatibleWithModule()` — actually enforced on this real
 * path, not merely available as an unused helper — before ever touching the
 * artifact or running the evaluator. An unregistered hazardType, a
 * hazardModuleVersion/projectionSchemaVersion mismatch, or a HazardInput
 * that doesn't actually correspond to hazardType/hazardRunId all resolve to
 * `BLOCKED`, keeping this function's existing never-throws, always-returns-
 * a-verdict contract intact. Omitting `hazardType` skips the fence entirely
 * and exercises only the domain-neutral Phase 0 mechanism — this is what
 * `hazardProvenance.test.ts`'s pre-registry fixture tests still do, since
 * they test that mechanism in the abstract, not any specific registered
 * hazard, and use an intentionally-unregistered fixture hazard type.
 */
import { computeHazardInputFingerprint, computeHazardRunResultFingerprint } from './fingerprint';
import { assertHazardRunCompatibleWithModule } from './hazardModuleRegistry';
import type { HazardInput, HazardReplayStatus, SourceArtifact } from './contracts';
import type { HazardProvenanceStore } from './hazardProvenanceStore';

/**
 * A PURE, DETERMINISTIC function of (input, artifact) used only to exercise
 * the replay gate's MATCH/DRIFT/BLOCKED logic in tests and Phase 0 wiring.
 * This is a contract fixture, not a hazard-specific scientific module — no
 * earthquake/flood/fire/weather/contamination computation may live behind an
 * implementation of this interface until a later, separately approved
 * phase.
 */
export interface HazardReferenceEvaluator {
  evaluate(input: HazardInput, artifact: SourceArtifact): Promise<Readonly<Record<string, unknown>>> | Readonly<Record<string, unknown>>;
}

export interface HazardReplayReport {
  readonly hazardRunId: string;
  readonly status: HazardReplayStatus;
  readonly originalResultFingerprint: string | null;
  readonly replayResultFingerprint: string | null;
  readonly differences: readonly string[];
}

function report(
  hazardRunId: string,
  status: HazardReplayStatus,
  originalResultFingerprint: string | null,
  replayResultFingerprint: string | null,
  differences: readonly string[],
): HazardReplayReport {
  return { hazardRunId, status, originalResultFingerprint, replayResultFingerprint, differences };
}

export async function replayHazardRun(options: {
  readonly store: HazardProvenanceStore;
  readonly hazardRunId: string;
  readonly evaluator: HazardReferenceEvaluator;
  /** When supplied, enforces the Hazard Module Registry's capability fence before artifact/fingerprint checks run. Omit only for domain-neutral Phase 0 mechanism tests. */
  readonly hazardType?: string;
  /** Optionally also checked against the registered module's projection schema version — same fence, same failure mode. */
  readonly projectionSchemaVersion?: string;
}): Promise<HazardReplayReport> {
  const { store, hazardRunId, evaluator, hazardType, projectionSchemaVersion } = options;

  const originalRun = await store.getRun(hazardRunId);
  if (!originalRun) {
    return report(hazardRunId, 'NOT_REPRODUCIBLE', null, null, [`hazardRun "${hazardRunId}" not found in store`]);
  }

  const input = await store.getInput(originalRun.hazardInputId);
  if (!input) {
    return report(hazardRunId, 'NOT_REPRODUCIBLE', originalRun.resultFingerprint, null, [
      `hazardInput "${originalRun.hazardInputId}" not found — cannot reconstruct the run request`,
    ]);
  }

  if (hazardType !== undefined) {
    try {
      assertHazardRunCompatibleWithModule({ hazardType, run: originalRun, input, projectionSchemaVersion });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return report(hazardRunId, 'BLOCKED', originalRun.resultFingerprint, null, [`capability fence rejected replay: ${message}`]);
    }
  }

  const artifact = await store.getArtifact(input.sourceArtifactId);
  if (!artifact) {
    return report(hazardRunId, 'BLOCKED', originalRun.resultFingerprint, null, [
      `sourceArtifact "${input.sourceArtifactId}" is unavailable — replay must not re-fetch it live`,
    ]);
  }

  // The input's fingerprint was computed against the artifact's contentHash
  // at HazardInput creation time. If the artifact stored under this id no
  // longer has that same contentHash (tampered, replaced, corrupted), this
  // recomputation will not match — catching drift the store's own
  // immutability check cannot see if it was bypassed.
  const expectedInputFingerprint = await computeHazardInputFingerprint({
    hazardType: input.hazardType,
    sourceArtifactContentHash: artifact.contentHash,
    scientificFields: input.scientificFields,
    seed: input.seed,
  });
  if (expectedInputFingerprint !== input.inputFingerprint) {
    return report(hazardRunId, 'BLOCKED', originalRun.resultFingerprint, null, [
      'pinned source artifact no longer matches the fingerprint the input was created against',
    ]);
  }

  const outputFields = await evaluator.evaluate(input, artifact);
  const replayResultFingerprint = await computeHazardRunResultFingerprint({
    hazardInputId: originalRun.hazardInputId,
    hazardModuleVersion: originalRun.hazardModuleVersion,
    codeCommitHash: originalRun.codeCommitHash,
    outputFields,
  });

  if (replayResultFingerprint === originalRun.resultFingerprint) {
    return report(hazardRunId, 'MATCH', originalRun.resultFingerprint, replayResultFingerprint, []);
  }
  return report(hazardRunId, 'DRIFT', originalRun.resultFingerprint, replayResultFingerprint, [
    'result fingerprint differs on re-evaluation of the same frozen input and artifact',
  ]);
}
