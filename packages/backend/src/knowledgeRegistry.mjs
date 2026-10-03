/**
 * ENTITY-2 — KNOWLEDGE GAP AND CONTRADICTION REGISTRY. What Genesis does not know, and where its
 * sources disagree, kept across restarts.
 *
 * Detection stays where it already lives: `observationGap.ts` (what measurement is missing),
 * `metaCognition/scientificMetrics.ts::KnowledgeGap` (two hypotheses left unseparated), the Mind's
 * `OPEN_QUESTION` and `@genesis/core/knowledge/contradictionHunter`. None of them is copied here;
 * the frontend adapter `core/mind/knowledgeRegistryAdapter.ts` maps each into the one input shape
 * below. This module only REMEMBERS what they found, append-only:
 *
 *   GAP_OPENED / GAP_RESOLVED / CONTRADICTION_RECORDED / CONTRADICTION_RESOLVED
 *
 * No new table. The events are steps of one agent run per project (domain
 * KNOWLEDGE_REGISTRY_DOMAIN, tool KNOWLEDGE_REGISTRY_TOOL), hash-chained with the same rule as the
 * ENTITY-0 research state, and every read re-verifies the chain; a broken chain is reported, never
 * repaired, and the registry then accepts nothing more.
 *
 * Two rules this module exists for:
 *  - A gap is RESOLVED only by evidence that exists in this project's own records (a sealed experiment
 *    record, a successful science run, or a lab observation a human accepted). A string that points
 *    nowhere closes nothing.
 *  - A contradiction is never resolved by picking a side. It stays UNRESOLVED (CONFLICTING_EVIDENCE is
 *    a correct state) until NEW evidence, beyond the two conflicting claims, is recorded against it.
 */
import { canonicalJson, fnv1a } from './determinism.mjs';
import { addAgentStep, createAgentRun, listAgentRuns, listAgentSteps } from './agentRun.mjs';
import { LAB_EVENT } from './campaign/labClosedLoop.mjs';

export const KNOWLEDGE_REGISTRY_TOOL = 'entity.knowledgeRegistry';
export const KNOWLEDGE_REGISTRY_DOMAIN = 'genesis-entity.knowledge-registry';
// ENTITY-3 adds CLAIM_PROPOSED: a validated proposal from an external reasoning model. There is deliberately no
// event that promotes a claim: a proposal stays PROPOSED here, and only the canonical evidence paths make anything true.
export const REGISTRY_EVENT_TYPES = Object.freeze(['GAP_OPENED', 'GAP_RESOLVED', 'CONTRADICTION_RECORDED', 'CONTRADICTION_RESOLVED', 'CLAIM_PROPOSED']);
export const GAP_SOURCES = Object.freeze(['OBSERVATION_GAP', 'KNOWLEDGE_GAP', 'OPEN_QUESTION', 'SELF_MODEL']);
export const CONTRADICTION_TYPES = Object.freeze(['NUMERIC_DISAGREEMENT', 'POLARITY_CONFLICT', 'STATUS_CONFLICT', 'MODEL_OBSERVATION_DISAGREEMENT']);
export const REGISTRY_GENESIS_HEAD = fnv1a(canonicalJson({ genesis: 'knowledge-registry-v1' }));

const STR = (v, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const STRS = (v, max = 50) => (Array.isArray(v) ? [...new Set(v.map((x) => STR(x, 300)).filter(Boolean))].slice(0, max) : []);

function transition(prev, type, payloadFingerprint, seq) {
  return fnv1a(canonicalJson({ prev, type, payloadFingerprint, seq }));
}

export function verifyRegistryEvents(events) {
  let head = REGISTRY_GENESIS_HEAD;
  for (const [index, event] of events.entries()) {
    const fail = (reason) => ({ ok: false, length: events.length, head: null, brokenAt: index, reason });
    if (!event || typeof event !== 'object') return fail('malformed_event');
    if (event.seq !== index) return fail('sequence_gap');
    if (!REGISTRY_EVENT_TYPES.includes(event.type)) return fail('unknown_event_type');
    if (fnv1a(canonicalJson(event.payload)) !== event.payloadFingerprint) return fail('payload_fingerprint_mismatch');
    if (transition(head, event.type, event.payloadFingerprint, event.seq) !== event.transitionFingerprint) return fail('transition_fingerprint_mismatch');
    head = event.transitionFingerprint;
  }
  return { ok: true, length: events.length, head, brokenAt: null, reason: null };
}

export function findRegistryRun(db, projectId) {
  return listAgentRuns(db, projectId).filter((run) => run.domain === KNOWLEDGE_REGISTRY_DOMAIN).at(-1) ?? null;
}

/** Folds the event log into current gaps and contradictions. Status is only ever what an event set. */
function fold(events) {
  const gaps = new Map();
  const contradictions = new Map();
  const claims = new Map();
  for (const { type, payload, at } of events) {
    if (type === 'GAP_OPENED') {
      gaps.set(payload.gapId, { ...payload, status: 'OPEN', openedAt: at, resolvedAt: null, resolvedEvidenceRefs: [] });
    } else if (type === 'GAP_RESOLVED' && gaps.has(payload.gapId)) {
      gaps.set(payload.gapId, { ...gaps.get(payload.gapId), status: 'RESOLVED', resolvedAt: at, resolvedEvidenceRefs: payload.evidenceRefs });
    } else if (type === 'CONTRADICTION_RECORDED') {
      contradictions.set(payload.contradictionId, { ...payload, status: 'UNRESOLVED', epistemicState: 'CONFLICTING_EVIDENCE', recordedAt: at, resolution: null });
    } else if (type === 'CONTRADICTION_RESOLVED' && contradictions.has(payload.contradictionId)) {
      contradictions.set(payload.contradictionId, {
        ...contradictions.get(payload.contradictionId), status: 'RESOLVED', epistemicState: 'RESOLVED_BY_NEW_EVIDENCE',
        resolution: { statement: payload.statement, evidenceRefs: payload.evidenceRefs, resolvedBy: payload.resolvedBy, at },
      });
    } else if (type === 'CLAIM_PROPOSED') {
      claims.set(payload.proposalId, { ...payload, status: 'PROPOSED', proposedAt: at });
    }
  }
  return { gaps: [...gaps.values()], contradictions: [...contradictions.values()], claims: [...claims.values()] };
}

/** The persisted registry of a project: events, re-verified chain, and (only when the chain holds) the folded state. */
export function readKnowledgeRegistry(db, projectId) {
  const run = findRegistryRun(db, projectId);
  const events = run ? listAgentSteps(db, run.id).filter((s) => s.toolInvoked === KNOWLEDGE_REGISTRY_TOOL).map((s) => s.observation) : [];
  const chain = verifyRegistryEvents(events);
  return chain.ok
    ? { runId: run?.id ?? null, events, chain, ...fold(events) }
    : { runId: run?.id ?? null, events, chain, gaps: null, contradictions: null, claims: null };
}

/** ENTITY-3: stores an already validated claim proposal (claimProposal.mjs). Its status is PROPOSED by construction. */
export function recordClaimProposal(db, projectId, proposal, userId = null) {
  const current = readKnowledgeRegistry(db, projectId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const existing = current.claims.find((c) => c.proposalId === proposal.proposalId);
  if (existing) return { ok: true, deduped: true, proposal: existing };
  const res = append(db, projectId, 'CLAIM_PROPOSED', { ...proposal, status: 'PROPOSED' }, userId);
  return res.ok ? { ok: true, deduped: false, proposal: fold(readKnowledgeRegistry(db, projectId).events).claims.find((c) => c.proposalId === proposal.proposalId) } : res;
}

function append(db, projectId, type, payload, userId) {
  const current = readKnowledgeRegistry(db, projectId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const run = current.runId ? { id: current.runId } : createAgentRun(db, {
    projectId, goal: 'Knowledge gaps and contradictions of this project (ENTITY-2)', domain: KNOWLEDGE_REGISTRY_DOMAIN, createdBy: userId,
  });
  const seq = current.events.length;
  const stored = JSON.parse(canonicalJson(payload));
  const payloadFingerprint = fnv1a(canonicalJson(stored));
  const event = {
    seq, type, at: new Date().toISOString(), payload: stored, payloadFingerprint,
    transitionFingerprint: transition(current.chain.head, type, payloadFingerprint, seq),
  };
  addAgentStep(db, { agentRunId: run.id, stepIndex: seq, toolInvoked: KNOWLEDGE_REGISTRY_TOOL, capability: type, hypothesis: {}, observation: event, nextAction: {} });
  return { ok: true, event };
}

/**
 * Resolves an evidence reference against THIS project's own persisted records. Accepted forms:
 *   experiment_record:<id>  a sealed preregistration or session
 *   science_run:<id>        a science run with status ok
 *   lab_observation:<id>    an ingested external observation whose latest human review accepted it
 */
export function resolveEvidenceRef(db, projectId, ref) {
  const m = /^(experiment_record|science_run|lab_observation):(.+)$/.exec(ref ?? '');
  if (!m) return { ok: false, ref, reason: 'unknown_ref_kind' };
  const [, kind, id] = m;
  if (kind === 'experiment_record') {
    const row = db.prepare('SELECT id FROM experiment_records WHERE id = ? AND project_id = ?').get(id, projectId);
    return row ? { ok: true, ref } : { ok: false, ref, reason: 'not_found' };
  }
  if (kind === 'science_run') {
    const row = db.prepare("SELECT id FROM science_runs WHERE id = ? AND project_id = ? AND status = 'ok'").get(id, projectId);
    return row ? { ok: true, ref } : { ok: false, ref, reason: 'not_found' };
  }
  const rows = db.prepare(
    `SELECT e.type, e.payload_json FROM campaign_events e JOIN campaigns c ON c.id = e.campaign_id
     WHERE c.project_id = ? AND e.type IN (?, ?) ORDER BY e.rowid ASC`,
  ).all(projectId, LAB_EVENT.OBSERVATION_INGESTED, LAB_EVENT.OBSERVATION_REVIEWED);
  let ingested = false;
  let verdict = null;
  for (const row of rows) {
    let p;
    try { p = JSON.parse(row.payload_json); } catch { continue; }
    if (p?.observationId !== id) continue;
    if (row.type === LAB_EVENT.OBSERVATION_INGESTED) ingested = true;
    else verdict = p.verdict ?? null;
  }
  if (!ingested) return { ok: false, ref, reason: 'not_found' };
  return verdict === 'ACCEPTED_AS_OBSERVATION' ? { ok: true, ref } : { ok: false, ref, reason: 'observation_not_accepted' };
}

function checkEvidence(db, projectId, refs) {
  if (refs.length === 0) return { ok: false, error: 'evidence_required' };
  const unresolved = refs.map((ref) => resolveEvidenceRef(db, projectId, ref)).filter((r) => !r.ok);
  return unresolved.length ? { ok: false, error: 'evidence_ref_not_found', unresolved } : { ok: true };
}

/** Deterministic identity: the same question from the same source is the same gap. */
export function gapIdOf(source, question) {
  return `gap-${fnv1a(canonicalJson({ kind: source.kind, ref: source.ref ?? null, question }))}`;
}

export function openGap(db, projectId, input, userId = null) {
  const question = STR(input?.question);
  const kind = input?.source?.kind;
  if (!question) return { ok: false, error: 'invalid_gap', reason: 'question' };
  if (!GAP_SOURCES.includes(kind)) return { ok: false, error: 'invalid_gap', reason: 'source' };
  const source = { kind, ref: STR(input.source.ref, 300) };
  const gapId = gapIdOf(source, question);
  const current = readKnowledgeRegistry(db, projectId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const existing = current.gaps.find((g) => g.gapId === gapId);
  if (existing?.status === 'OPEN') return { ok: true, deduped: true, gap: existing };
  const res = append(db, projectId, 'GAP_OPENED', {
    gapId, question, source,
    relatedHypotheses: STRS(input.relatedHypotheses),
    missingEvidence: STRS(input.missingEvidence),
    requiredCapability: STR(input.requiredCapability, 200),
    createdEvidenceRefs: STRS(input.createdEvidenceRefs),
  }, userId);
  return res.ok ? { ok: true, deduped: false, gap: fold(readKnowledgeRegistry(db, projectId).events).gaps.find((g) => g.gapId === gapId) } : res;
}

export function resolveGap(db, projectId, gapId, input, userId = null) {
  const current = readKnowledgeRegistry(db, projectId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const gap = current.gaps.find((g) => g.gapId === gapId);
  if (!gap) return { ok: false, error: 'not_found' };
  if (gap.status !== 'OPEN') return { ok: false, error: 'gap_not_open' };
  const evidenceRefs = STRS(input?.evidenceRefs);
  const check = checkEvidence(db, projectId, evidenceRefs);
  if (!check.ok) return check;
  const res = append(db, projectId, 'GAP_RESOLVED', { gapId, evidenceRefs }, userId);
  return res.ok ? { ok: true, gap: fold(readKnowledgeRegistry(db, projectId).events).gaps.find((g) => g.gapId === gapId) } : res;
}

function claimOf(raw) {
  const recordId = STR(raw?.recordId, 300);
  const statement = STR(raw?.statement);
  if (!recordId && !statement) return null;
  return { recordId, source: STR(raw?.source, 300), statement };
}

export function recordContradiction(db, projectId, input, userId = null) {
  const claimA = claimOf(input?.claimA);
  const claimB = claimOf(input?.claimB);
  if (!claimA || !claimB) return { ok: false, error: 'invalid_contradiction', reason: 'claims' };
  if (!CONTRADICTION_TYPES.includes(input?.type)) return { ok: false, error: 'invalid_contradiction', reason: 'type' };
  const contradictionId = STR(input.contradictionId, 200) ?? `ctr-${fnv1a(canonicalJson({ type: input.type, claimA, claimB }))}`;
  const current = readKnowledgeRegistry(db, projectId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const existing = current.contradictions.find((c) => c.contradictionId === contradictionId);
  if (existing) return { ok: true, deduped: true, contradiction: existing };
  const res = append(db, projectId, 'CONTRADICTION_RECORDED', {
    contradictionId, type: input.type, claimA, claimB,
    evidenceRefs: STRS(input.evidenceRefs), reason: STR(input.reason),
  }, userId);
  return res.ok ? { ok: true, deduped: false, contradiction: fold(readKnowledgeRegistry(db, projectId).events).contradictions.find((c) => c.contradictionId === contradictionId) } : res;
}

export function resolveContradiction(db, projectId, contradictionId, input, userId = null) {
  const current = readKnowledgeRegistry(db, projectId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const contradiction = current.contradictions.find((c) => c.contradictionId === contradictionId);
  if (!contradiction) return { ok: false, error: 'not_found' };
  if (contradiction.status !== 'UNRESOLVED') return { ok: false, error: 'contradiction_not_open' };
  const statement = STR(input?.statement);
  if (!statement) return { ok: false, error: 'resolution_statement_required' };
  const evidenceRefs = STRS(input?.evidenceRefs);
  // Re-citing the two claims that disagree settles nothing: resolution needs evidence beyond them.
  const already = new Set([...contradiction.evidenceRefs, contradiction.claimA.recordId, contradiction.claimB.recordId].filter(Boolean));
  const fresh = evidenceRefs.filter((ref) => !already.has(ref));
  if (fresh.length === 0) return { ok: false, error: 'new_evidence_required' };
  const check = checkEvidence(db, projectId, fresh);
  if (!check.ok) return check;
  const res = append(db, projectId, 'CONTRADICTION_RESOLVED', { contradictionId, statement, evidenceRefs: fresh, resolvedBy: userId }, userId);
  return res.ok ? { ok: true, contradiction: fold(readKnowledgeRegistry(db, projectId).events).contradictions.find((c) => c.contradictionId === contradictionId) } : res;
}
