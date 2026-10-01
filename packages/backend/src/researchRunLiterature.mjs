import { appendServerResearchStateEvent } from './agentRun.mjs';
import { canonicalJson, fnv1a } from './determinism.mjs';
import { createResearchRunLiteraturePort } from './literature/researchRunLiteraturePort.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';

export const RESEARCH_RUN_LITERATURE_SNAPSHOT_VERSION = 'research-run-literature-snapshot@1';
const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

function boundedLimit(value) {
  return Number.isInteger(value) && value >= 1 && value <= 25 ? value : 10;
}

function snapshotResult(result) {
  return {
    intent: result.intent,
    status: result.status,
    query: result.query ?? null,
    sources: Array.isArray(result.sources) ? result.sources : [],
    links: Array.isArray(result.links) ? result.links : [],
    support: Array.isArray(result.support) ? result.support : [],
    contradictions: Array.isArray(result.contradictions) ? result.contradictions : [],
    missingEvidence: Array.isArray(result.missingEvidence) ? result.missingEvidence : [],
    accessBlockers: Array.isArray(result.accessBlockers) ? result.accessBlockers : [],
  };
}

export async function retrieveResearchRunLiterature(db, projectId, runId, input = {}, dependencies = {}) {
  const before = getResearchRun(db, projectId, runId);
  if (!before) return { ok: false, status: 'NOT_FOUND' };
  if (!before.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  if (before.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_RETRIEVABLE', reason: before.run.status };

  const claim = STR(input.claim, 4_000) ?? before.question;
  const query = STR(input.query, 1_000) ?? claim;
  const contradictionQuery = STR(input.contradictionQuery, 1_000);
  const limit = boundedLimit(input.limit);
  const claimId = STR(input.claimId, 300) ?? `literature-claim-${fnv1a(canonicalJson({ runId, claim }))}`;
  const requestFingerprint = fnv1a(canonicalJson({ runId, claimId, claim, query, contradictionQuery, limit }));
  const existing = before.literatureSnapshots.find((snapshot) => snapshot.requestFingerprint === requestFingerprint);
  if (existing) return { ok: true, status: existing.status, deduped: true, snapshot: existing, researchRun: before };

  const port = dependencies.port ?? createResearchRunLiteraturePort();
  if (!port?.findForClaim || !port?.findContradictionsForClaim) {
    return { ok: false, status: 'LITERATURE_PORT_NOT_CONFIGURED' };
  }
  const request = { researchRunId: runId, claimId, claim, query, limit };
  const [primary, contradictionSearch] = await Promise.all([
    port.findForClaim(request, dependencies.options),
    port.findContradictionsForClaim({ ...request, query: contradictionQuery }, dependencies.options),
  ]);
  const primarySnapshot = snapshotResult(primary);
  const contradictionSnapshot = snapshotResult(contradictionSearch);
  const sourceCount = new Set([...primarySnapshot.sources, ...contradictionSnapshot.sources].map((source) => source.sourceId)).size;
  const status = sourceCount > 0 ? 'METADATA_RETRIEVED'
    : [...primarySnapshot.accessBlockers, ...contradictionSnapshot.accessBlockers].length > 0 ? 'BLOCKED' : 'NOT_FOUND';
  const payload = {
    contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
    snapshotVersion: RESEARCH_RUN_LITERATURE_SNAPSHOT_VERSION,
    researchRunId: runId,
    claimId,
    claim,
    query,
    contradictionQuery: contradictionSnapshot.query,
    limit,
    requestFingerprint,
    status,
    epistemicStatus: 'NOT_EVIDENCE',
    sourceCount,
    primary: primarySnapshot,
    contradictionSearch: contradictionSnapshot,
  };

  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    if (current.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_RETRIEVABLE', reason: current.run.status };
    const duplicate = current.literatureSnapshots.find((snapshot) => snapshot.requestFingerprint === requestFingerprint);
    if (duplicate) return { ok: true, status: duplicate.status, deduped: true, snapshot: duplicate, researchRun: current };
    const appended = appendServerResearchStateEvent(db, runId, 'KNOWLEDGE_SNAPSHOT', payload, dependencies.at);
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    const researchRun = getResearchRun(db, projectId, runId);
    return { ok: true, status, deduped: false, snapshot: researchRun.literatureSnapshots.at(-1), researchRun };
  });
}
