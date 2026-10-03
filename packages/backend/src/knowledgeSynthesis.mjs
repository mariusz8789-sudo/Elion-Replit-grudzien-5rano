/**
 * Scientific Knowledge Loop — SYNTHESIS. Pure functions over canonical state. They own no storage:
 * the corpus is the cognitive state (BYT projection, knowledge registry) plus read-only source
 * documents, and every output is a PROPOSED, NOT_EVIDENCE view whose every item names the refs it
 * stands on. A source without a traceable ref, or a chain that failed verification, is excluded and
 * reported — never summarised as if it were fine.
 */
import { fnv1a } from './determinism.mjs';
import { RECALL_MODE, buildRecallIndex, cosine, normalizeText, searchRecallIndex } from './knowledgeRecall.mjs';

export const KNOWLEDGE_SYNTHESIS_SCHEMA_VERSION = 1;
const BLOCKER_RE = /\b(BLOCKED|INSUFFICIENT|NO_WINNER|REFUS\w*|NOT_MET|FAILED|MISSES?)\b/;
const VERDICT_STATUS = Object.freeze({ FALSIFIED_WITHIN_PROTOCOL: 'CONTRADICTED', SUPPORTED_WITHIN_PROTOCOL: 'SIMULATED', UNRESOLVED: 'UNKNOWN', UNVERIFIED: 'UNVERIFIED' });

const flat = (value) => {
  try { return JSON.stringify(value) ?? ''; } catch { return ''; }
};
const claimKey = (claim) => normalizeText(claim);

/** The claims a previous run already falsified within protocol; used to keep NEXT_EXPERIMENT from repeating them. */
export function priorFalsifiedClaims(byt, { excludeRunId = null } = {}) {
  const out = new Map();
  for (const entry of byt?.necropolis ?? []) {
    if (!entry.claim || entry.researchRunId === excludeRunId) continue;
    out.set(claimKey(entry.claim), entry.necropolisId);
  }
  return out;
}

/** Documents from canonical state. Rows without a traceable ref are rejected, not indexed. */
export function documentsFromCognitiveState(state) {
  const documents = [];
  const rejectedUntraceable = [];
  const integrityFailures = [];
  const push = (doc) => {
    if (!doc.ref || typeof doc.ref !== 'string') rejectedUntraceable.push({ docId: doc.docId ?? null, kind: doc.kind ?? null });
    else documents.push(doc);
  };
  const byt = state?.byt ?? {};

  for (const run of byt.integrity?.researchRuns ?? []) {
    if (!run.ok) integrityFailures.push({ source: 'RESEARCH_RUN', ref: `research_run:${run.researchRunId}`, reason: run.reason ?? 'STATE_INTEGRITY_FAILURE' });
  }
  if (byt.integrity?.knowledgeRegistry && byt.integrity.knowledgeRegistry.ok === false) {
    integrityFailures.push({ source: 'KNOWLEDGE_REGISTRY', ref: 'knowledge_registry', reason: byt.integrity.knowledgeRegistry.reason ?? 'STATE_INTEGRITY_FAILURE' });
  }

  for (const entry of byt.predictionLedger ?? []) {
    push({
      docId: `prediction:${entry.researchRunId}:${entry.experimentId}`,
      kind: 'PREDICTION_LEDGER',
      ref: entry.researchRunId && entry.experimentId ? `research_run:${entry.researchRunId}#${entry.experimentId}` : null,
      epistemicStatus: VERDICT_STATUS[entry.verdict] ?? 'UNKNOWN',
      hypothesisId: entry.hypothesisId ?? null,
      claim: entry.claim ?? null,
      verdict: entry.verdict ?? null,
      sourceRefs: [entry.evidence?.ref, entry.replay?.ref].filter(Boolean),
      text: `${entry.claim ?? ''} engine ${entry.engineId ?? ''} verdict ${entry.verdict ?? 'NO_VERDICT'} replay ${entry.replay?.verdict ?? ''} ${(entry.criteria ?? []).map((c) => `${c.observable} ${c.status}`).join(' ')}`,
    });
  }
  for (const entry of byt.necropolis ?? []) {
    push({
      docId: entry.necropolisId, kind: 'NECROPOLIS', ref: entry.necropolisId, epistemicStatus: 'CONTRADICTED',
      hypothesisId: entry.hypothesisId ?? null, claim: entry.claim ?? null, verdict: entry.status,
      text: `refuted hypothesis ${entry.claim ?? ''} failed criteria ${(entry.failedCriteria ?? []).join(' ')} scope ${entry.scope ?? ''}`,
    });
  }
  for (const item of byt.decisionTraces ?? []) {
    push({
      docId: `trace:${item.researchRunId}:${item.experimentId}`, kind: 'DECISION_TRACE',
      ref: item.researchRunId && item.experimentId ? `decision_trace:${item.researchRunId}#${item.experimentId}` : null,
      epistemicStatus: 'INFERRED', text: `decision trace ${flat(item.trace).slice(0, 3000)}`,
    });
  }
  for (const flight of byt.scienceFlightControl?.flights ?? []) {
    push({
      docId: `flight:${flight.flightFingerprint}`, kind: 'FLIGHT_CONTROL', ref: `flight:${flight.flightFingerprint}`,
      epistemicStatus: flight.status === 'VERIFIED' ? 'SIMULATED' : 'UNKNOWN', status: flight.status,
      text: `flight control ${flight.status} candidate ${flight.candidateId ?? ''} ${flat(flight.failure ?? flight.postFlight ?? '').slice(0, 1500)}`,
    });
  }
  for (const gap of Array.isArray(state?.knowledgeGaps) ? state.knowledgeGaps : []) {
    push({
      docId: `gap:${gap.gapId}`, kind: 'KNOWLEDGE_GAP', ref: `knowledge_registry:gap:${gap.gapId}`, epistemicStatus: 'UNKNOWN',
      requiredCapability: gap.requiredCapability ?? null, text: `open knowledge gap ${gap.question ?? ''} missing evidence ${(gap.missingEvidence ?? []).join(' ')}`,
    });
  }
  for (const item of Array.isArray(state?.contradictions) ? state.contradictions : []) {
    push({
      docId: `contradiction:${item.contradictionId}`, kind: 'CONTRADICTION', ref: `knowledge_registry:contradiction:${item.contradictionId}`,
      epistemicStatus: 'CONTRADICTED', status: item.status,
      sideRefs: [item.claimA?.recordId, item.claimB?.recordId, ...(item.evidenceRefs ?? [])].filter(Boolean),
      text: `contradiction ${item.type ?? ''}: ${item.claimA?.statement ?? ''} versus ${item.claimB?.statement ?? ''} ${item.reason ?? ''}`,
    });
  }
  for (const claim of Array.isArray(state?.proposedClaims) ? state.proposedClaims : []) {
    push({
      docId: `claim:${claim.proposalId}`, kind: 'PROPOSED_CLAIM', ref: `knowledge_registry:claim:${claim.proposalId}`,
      epistemicStatus: 'UNVERIFIED', text: `proposed external-model claim ${flat(claim).slice(0, 1500)}`,
    });
  }
  for (const blocked of Array.isArray(state?.blockedCapabilities) ? state.blockedCapabilities : []) {
    push({
      docId: `blocked:${blocked.kind}:${blocked.id}`, kind: 'BLOCKED_CAPABILITY', ref: `self_model:${blocked.kind}:${blocked.id}`,
      epistemicStatus: 'UNKNOWN', text: `capability ${blocked.id} blocked by ${blocked.blockedBy ?? ''}`,
    });
  }
  return { documents, rejectedUntraceable, integrityFailures };
}

function relationBetween(a, b) {
  if (a.textFingerprint === b.textFingerprint || cosine(a.vector, b.vector) >= 0.97) return { relation: 'DUPLICATE', basis: 'IDENTICAL_OR_NEAR_IDENTICAL_TEXT' };
  const registry = [a.doc, b.doc].find((d) => d.kind === 'CONTRADICTION');
  const other = registry ? (registry === a.doc ? b.doc : a.doc) : null;
  if (registry && other && (registry.sideRefs ?? []).includes(other.ref)) return { relation: 'CONTRADICTS', basis: 'KNOWLEDGE_REGISTRY_CONTRADICTION_RECORD' };
  if (a.doc.claim && b.doc.claim && claimKey(a.doc.claim) === claimKey(b.doc.claim) && a.doc.verdict && b.doc.verdict) {
    return a.doc.verdict === b.doc.verdict
      ? { relation: 'SUPPORTS', basis: 'SAME_CLAIM_SAME_VERDICT' }
      : { relation: 'CONTRADICTS', basis: 'SAME_CLAIM_DIFFERENT_VERDICT' };
  }
  if (cosine(a.vector, b.vector) >= 0.3) return { relation: 'CONTEXT', basis: 'TEXT_SIMILARITY' };
  return { relation: 'UNKNOWN', basis: 'NO_STRUCTURAL_OR_TEXTUAL_LINK' };
}

const excerpt = (text) => String(text).replace(/\s+/g, ' ').slice(0, 280);
const item = (hit, extra = {}) => ({
  docId: hit.doc.docId, kind: hit.doc.kind, ref: hit.doc.ref, sourceSha256: hit.doc.sourceSha256 ?? null,
  epistemicStatus: hit.doc.epistemicStatus, score: hit.score, excerpt: excerpt(hit.doc.text), ...extra,
});

/** The next experiment as a fixed rule over memory. Never executes anything; always PROPOSED. */
export function nextExperimentFromMemory(sections, { integrityFailures = [] } = {}) {
  const refs = (list) => list.map((entry) => entry.ref);
  const base = { decidedBy: 'GENESIS_FIXED_RULE_OVER_MEMORY', status: 'PROPOSED', executes: false, excludedAsRefuted: refs(sections.refuted) };
  if (integrityFailures.length) {
    return { ...base, action: 'HUMAN_REVIEW', reason: 'PROVENANCE_FAILURE_IN_MEMORY', derivedFrom: integrityFailures.map((f) => f.ref) };
  }
  const contradiction = sections.contradicted.find((entry) => entry.kind === 'CONTRADICTION' && entry.status !== 'RESOLVED');
  if (contradiction) return { ...base, action: 'SEEK_EVIDENCE_FOR_CONTRADICTION', reason: 'UNRESOLVED_CONTRADICTION_IN_MEMORY', derivedFrom: [contradiction.ref] };
  const gap = sections.unknown.find((entry) => entry.kind === 'KNOWLEDGE_GAP');
  if (gap) {
    const blockedFor = sections.blockers.find((entry) => entry.kind === 'BLOCKED_CAPABILITY');
    return { ...base, action: 'OBTAIN_MISSING_EVIDENCE', reason: blockedFor ? 'OPEN_GAP_AND_CAPABILITY_BLOCKED' : 'OPEN_KNOWLEDGE_GAP', derivedFrom: [gap.ref, ...(blockedFor ? [blockedFor.ref] : [])] };
  }
  const refutedClaims = new Set(sections.refuted.map((entry) => claimKey(entry.claim ?? '')));
  const surviving = sections.activeHypotheses.find((entry) => !entry.claim || !refutedClaims.has(claimKey(entry.claim)));
  if (surviving) return { ...base, action: 'EXECUTE_NEXT_HYPOTHESIS', reason: 'SURVIVING_HYPOTHESIS_NOT_FALSIFIED_IN_MEMORY', derivedFrom: [surviving.ref], hypothesisId: surviving.hypothesisId ?? null };
  if (sections.blockers.length) return { ...base, action: 'RESOLVE_BLOCKER', reason: 'NO_SURVIVING_HYPOTHESIS_AND_BLOCKERS_RECORDED', derivedFrom: refs(sections.blockers).slice(0, 5) };
  return { ...base, action: 'HUMAN_REVIEW', reason: 'NO_RELEVANT_MEMORY', derivedFrom: [] };
}

export function synthesizeKnowledge({ question, cognitiveState, sources = [], limit = 12 }) {
  const fromState = documentsFromCognitiveState(cognitiveState);
  const rejectedUntraceable = [...fromState.rejectedUntraceable];
  const external = [];
  for (const doc of sources) {
    if (!doc.ref || !doc.sourceSha256) rejectedUntraceable.push({ docId: doc.docId ?? null, kind: doc.kind ?? null });
    else external.push(doc);
  }
  const corpus = [...fromState.documents, ...external];
  const index = buildRecallIndex(corpus);
  const hits = searchRecallIndex(index, question, { limit });

  const sections = { know: [], unknown: [], contradicted: [], refuted: [], activeHypotheses: [], blockers: [], recordedDecisions: [] };
  for (const hit of hits) {
    const { kind, epistemicStatus } = hit.doc;
    const entry = item(hit, { claim: hit.doc.claim ?? null, hypothesisId: hit.doc.hypothesisId ?? null, status: hit.doc.status ?? null });
    if (kind === 'NECROPOLIS') sections.refuted.push(entry);
    else if (kind === 'CONTRADICTION') sections.contradicted.push(entry);
    else if (kind === 'KNOWLEDGE_GAP') sections.unknown.push(entry);
    else if (kind === 'BLOCKED_CAPABILITY' || (kind === 'FLIGHT_CONTROL' && /BLOCKED/.test(hit.doc.status ?? ''))) sections.blockers.push(entry);
    else if (kind === 'PREDICTION_LEDGER' && (!hit.doc.verdict || hit.doc.verdict === 'UNVERIFIED')) sections.activeHypotheses.push(entry);
    else if (kind === 'DECISION_LOG_ENTRY') {
      sections.recordedDecisions.push(entry);
      if (BLOCKER_RE.test(hit.doc.text)) sections.blockers.push({ ...entry, classifiedBy: 'KEYWORD_RULE' });
    } else if (kind === 'SEALED_ARTIFACT') {
      sections.know.push(entry);
      if (BLOCKER_RE.test(hit.doc.text)) sections.blockers.push({ ...entry, classifiedBy: 'KEYWORD_RULE' });
    } else if (['SIMULATED', 'SUPPORTED', 'KNOWN'].includes(epistemicStatus)) sections.know.push(entry);
    else if (epistemicStatus === 'UNKNOWN') sections.unknown.push(entry);
  }

  const relations = [];
  let unknownRelations = 0;
  const top = hits.slice(0, 8);
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const rel = relationBetween(top[i], top[j]);
      if (rel.relation === 'UNKNOWN') { unknownRelations += 1; continue; }
      relations.push({ a: top[i].doc.ref, b: top[j].doc.ref, ...rel, promotedToEvidence: false });
    }
  }
  for (const rel of relations.filter((r) => r.relation === 'CONTRADICTS')) {
    for (const ref of [rel.a, rel.b]) {
      const hit = hits.find((h) => h.doc.ref === ref);
      if (hit && !sections.contradicted.some((e) => e.ref === ref)) sections.contradicted.push(item(hit, { via: 'RELATION_CONTRADICTS' }));
    }
  }

  const integrityFailures = fromState.integrityFailures;
  const nextExperiment = nextExperimentFromMemory(sections, { integrityFailures });
  return {
    schemaVersion: KNOWLEDGE_SYNTHESIS_SCHEMA_VERSION,
    question,
    view: 'DERIVED_FROM_CANONICAL_STATE',
    recallMode: RECALL_MODE,
    epistemicStatus: 'PROPOSED_NOT_EVIDENCE',
    status: integrityFailures.length ? 'PARTIAL_PROVENANCE_FAILURE' : hits.length ? 'OK' : 'NO_RELEVANT_MEMORY',
    corpus: {
      documents: corpus.length,
      byKind: corpus.reduce((acc, doc) => ({ ...acc, [doc.kind]: (acc[doc.kind] ?? 0) + 1 }), {}),
      researchRuns: cognitiveState?.byt?.continuity?.researchRuns ?? 0,
    },
    hits: hits.map((hit) => ({ docId: hit.doc.docId, ref: hit.doc.ref, kind: hit.doc.kind, score: hit.score, matchedTerms: hit.matchedTerms })),
    sections,
    relations,
    unknownRelations,
    nextExperiment,
    integrityFailures,
    rejectedUntraceable,
    fingerprint: fnv1a(JSON.stringify({ question, refs: hits.map((h) => h.doc.ref), next: nextExperiment.action })),
  };
}
