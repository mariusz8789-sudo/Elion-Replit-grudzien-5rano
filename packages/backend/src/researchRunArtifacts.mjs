import { canonicalJson, sha256Hex } from './determinism.mjs';
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';

/**
 * Artifact custody for an executed ResearchRun experiment. The bytes go to the existing content-addressed
 * artifact storage (compute/localArtifactStorageBackend.mjs, single node) and only the ArtifactRef enters
 * the hash-chained research state as ARTIFACT_PERSISTED. No second store, ledger or lifecycle.
 * Fail closed: a missing, truncated or altered object is reported, never repaired or replaced silently.
 */
export const ARTIFACT_BUNDLE_KIND = 'genesis-research-run-execution-bundle/v1';
export const ARTIFACT_PRODUCER = 'genesis-research-run';

const safeId = (value) => String(value).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 120);

export function buildExecutionBundle(runId, experiment) {
  const x = experiment.execution;
  const bundle = {
    kind: ARTIFACT_BUNDLE_KIND,
    researchRunId: runId,
    experimentId: experiment.experimentId,
    predictionFingerprint: x.predictionFingerprint,
    preregistrationFingerprint: x.preregistrationFingerprint,
    engine: x.engine,
    status: x.status,
    input: x.input,
    inputHash: x.inputHash,
    output: x.output,
    outputHash: x.outputHash,
  };
  return Buffer.from(canonicalJson(bundle), 'utf8');
}

const artifactEventOf = (view, experimentId) => view.researchState.events.filter((e) => e.type === 'ARTIFACT_PERSISTED' && e.payload?.experimentId === experimentId).at(-1)?.payload ?? null;

/** Idempotent: an experiment with a recorded, intact artifact is not stored twice. */
export async function persistExperimentArtifact(db, storage, projectId, runId, experimentId) {
  if (!storage) return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', reason: 'NO_ARTIFACT_STORAGE' };
  const view = getResearchRun(db, projectId, runId);
  if (!view) return { ok: false, status: 'NOT_FOUND' };
  if (!view.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  const experiment = view.experiments.find((e) => e.experimentId === experimentId);
  if (!experiment?.execution || experiment.execution.status !== 'EXECUTED') return { ok: false, status: 'NOT_EXECUTED' };
  const bytes = buildExecutionBundle(runId, experiment);
  let ref;
  try {
    ref = await storage.put({ key: `research-run/${safeId(runId)}/${safeId(experimentId)}.json`, bytes, mimeType: 'application/json', producer: ARTIFACT_PRODUCER, researchRunId: safeId(runId), experimentId: safeId(experimentId) });
  } catch (error) {
    return { ok: false, status: 'ARTIFACT_PERSIST_FAILED', reason: String(error?.message ?? error) };
  }
  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current?.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    const existing = artifactEventOf(current, experimentId);
    if (existing) return existing.artifactRef.sha256 === ref.sha256 ? { ok: true, deduped: true, artifactRef: existing.artifactRef } : { ok: false, status: 'ARTIFACT_CONTRADICTION', reason: 'a different artifact is already recorded for this experiment' };
    const appended = appendServerResearchStateEvent(db, runId, 'ARTIFACT_PERSISTED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION, researchRunId: runId, experimentId, outputHash: experiment.execution.outputHash,
      artifactRef: ref, scope: 'Single-node content-addressed custody of the execution bundle. Not shared or multi-replica object storage.',
    });
    return appended.ok ? { ok: true, deduped: false, artifactRef: ref } : { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
  });
}

/** Reads the recorded artifact back, verifies bytes against the ref and the bundle against the chain. */
export async function verifyExperimentArtifact(db, storage, projectId, runId, experimentId) {
  const view = getResearchRun(db, projectId, runId);
  if (!view) return { ok: false, status: 'NOT_FOUND' };
  if (!view.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  const experiment = view.experiments.find((e) => e.experimentId === experimentId);
  const recorded = artifactEventOf(view, experimentId);
  if (!experiment?.execution) return { ok: false, status: 'NOT_EXECUTED' };
  if (!recorded) return { ok: false, status: 'NO_ARTIFACT_RECORDED' };
  if (!storage) return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', reason: 'NO_ARTIFACT_STORAGE' };
  const ref = recorded.artifactRef;
  let bytes;
  try { bytes = await storage.get({ key: ref.key, sha256: ref.sha256 }); } catch (error) {
    return { ok: false, status: String(error?.message).startsWith('ARTIFACT_INTEGRITY') ? 'ARTIFACT_INTEGRITY_MISMATCH' : 'ARTIFACT_MISSING', reason: String(error?.message ?? error) };
  }
  if (sha256Hex(bytes) !== ref.sha256 || bytes.byteLength !== ref.size) return { ok: false, status: 'ARTIFACT_INTEGRITY_MISMATCH' };
  const expected = buildExecutionBundle(runId, experiment);
  if (!expected.equals(Buffer.from(bytes))) return { ok: false, status: 'ARTIFACT_CHAIN_MISMATCH', reason: 'stored bundle differs from the execution record in the chain' };
  return { ok: true, artifactRef: ref, bundleOutputHash: experiment.execution.outputHash };
}

/** Executed experiments whose artifact was never recorded (e.g. a crash between execution and custody). */
export function experimentsMissingArtifact(db, projectId, runId) {
  const view = getResearchRun(db, projectId, runId);
  if (!view?.researchState.chain.ok) return [];
  return view.experiments.filter((e) => e.execution?.status === 'EXECUTED' && !artifactEventOf(view, e.experimentId)).map((e) => e.experimentId);
}

/** Custody recovery after a crash or storage failure: stores every missing artifact; executes nothing. */
export async function recoverMissingArtifacts(db, storage, projectId, runId) {
  const recovered = [];
  const failed = [];
  for (const experimentId of experimentsMissingArtifact(db, projectId, runId)) {
    const r = await persistExperimentArtifact(db, storage, projectId, runId, experimentId);
    (r.ok ? recovered : failed).push(r.ok ? experimentId : { experimentId, status: r.status });
  }
  return { recovered, failed };
}
