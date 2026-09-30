/**
 * ENTITY-3 — AN EXTERNAL MODEL MAY ONLY PROPOSE.
 *
 * One question goes to the configured reasoning provider (`reasoningProvider.mjs`). Whatever comes back
 * is text from outside Genesis, so this module treats it as untrusted input:
 *
 *  - It must parse into one ScientificClaimProposal (claim, claimType, hypothesisId, assumptions,
 *    supportingEvidenceRefs, contradictingEvidenceRefs, missingEvidence, uncertainty,
 *    falsificationProposal). Anything else is REJECTED_MALFORMED_RESPONSE and nothing is stored.
 *  - A model cannot assert knowledge. FACT / SUPPORTED / REAL_MEASUREMENT and every other status that
 *    means "known" are degraded to HYPOTHESIS, and every degradation is recorded on the proposal.
 *  - A cited evidence reference counts only if it resolves in this project (the ENTITY-2 rule);
 *    an unresolved citation is removed from support and listed as unresolved.
 *  - The model gets no tools and no shell. It may describe an experiment; Genesis decides about it:
 *    a change to a frozen threshold is rejected, biology needs a human, an engine the self model does
 *    not know is blocked, an engine whose runtime is down is blocked. Nothing is ever run from here.
 *  - The result is stored in the knowledge registry as CLAIM_PROPOSED, status PROPOSED. There is no
 *    path from there to fact: only the canonical evidence routes (sealed records, science runs, accepted
 *    lab observations) establish anything.
 * A missing key, a timeout, a refusal or an upstream error writes nothing, so the state stays as it was.
 */
import { canonicalJson, fnv1a } from './determinism.mjs';
import { readKnowledgeRegistry, recordClaimProposal, resolveEvidenceRef } from './knowledgeRegistry.mjs';
import { REASONING_ADAPTER_VERSION, ReasoningProviderError } from './reasoningProvider.mjs';

export const CLAIM_PROPOSAL_CONTRACT_VERSION = 1;
export const PROPOSAL_CLAIM_TYPES = Object.freeze(['HYPOTHESIS', 'PREDICTION', 'MECHANISM_PROPOSAL', 'OPEN_QUESTION']);
/** What only evidence may say. A model that says it is degraded, never believed. */
export const KNOWLEDGE_CLAIM_TYPES = Object.freeze([
  'FACT', 'SUPPORTED', 'REAL_MEASUREMENT', 'MEASURED', 'OBSERVED', 'OBSERVATION', 'VALIDATED', 'VERIFIED', 'CONFIRMED', 'PROVEN', 'ESTABLISHED', 'EVIDENCE',
]);
export const UNCERTAINTY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
export const HUMAN_APPROVAL_KINDS = Object.freeze(['BIOLOGICAL', 'WET_LAB', 'CLINICAL', 'ANIMAL', 'HUMAN_SUBJECTS', 'SYNTHESIS']);
export const EXPERIMENT_DECISIONS = Object.freeze(['REJECTED_MALFORMED', 'REJECTED_FROZEN_THRESHOLD', 'HUMAN_APPROVAL_REQUIRED', 'BLOCKED_BY_SELF_MODEL', 'BLOCKED_BY_RUNTIME', 'PROPOSED']);
/** Names that point at a preregistered or gated decision rule. Changing one after the fact is what preregistration forbids. */
const FROZEN_TARGET = /threshold|gate|prereg|acceptance|criteri|verdict|pass[_ -]?rule|max[_ -]?mae|min[_ -]?r2|split[_ -]?rule|decision[_ -]?rule/i;

const STR = (v, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const STRS = (v, max = 30) => (Array.isArray(v) ? [...new Set(v.map((x) => STR(x, 500)).filter(Boolean))].slice(0, max) : []);

export const CLAIM_PROPOSAL_SYSTEM_PROMPT = `You assist Genesis, a platform that runs and verifies computational experiments. You do not know anything as fact and you cannot run anything. You may only PROPOSE.

Answer with exactly one JSON object and nothing else:
{
  "claim": string,
  "claimType": "HYPOTHESIS" | "PREDICTION" | "MECHANISM_PROPOSAL" | "OPEN_QUESTION",
  "hypothesisId": string | null,
  "assumptions": string[],
  "supportingEvidenceRefs": string[],
  "contradictingEvidenceRefs": string[],
  "missingEvidence": string[],
  "uncertainty": { "level": "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN", "statement": string },
  "falsificationProposal": string,
  "experimentProposal": null | { "engineId": string | null, "kind": "COMPUTATIONAL" | "BIOLOGICAL" | "WET_LAB" | "CLINICAL", "description": string, "parameters": object, "parameterChanges": [{ "target": string, "to": any }] }
}

Rules:
1. Cite only evidence references from the list you are given, exactly as written. Never invent one.
2. Propose engines only from the list of engines you are given.
3. Never propose changing a preregistered threshold, gate or acceptance criterion.
4. falsificationProposal must say what observation would show the claim is wrong.
5. If you do not know, say so in uncertainty. An honest UNKNOWN is a good answer.`;

/** Pulls one JSON object out of the provider's text. Code fences are tolerated; anything else around it is not. */
export function parseProposalText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty_response' };
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  const candidate = fenced ? fenced[1] : text.trim();
  let value;
  try { value = JSON.parse(candidate); } catch { return { ok: false, reason: 'not_json' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not_an_object' };
  return { ok: true, value };
}

function frozenTargetsOf(selfModel, db, projectId) {
  const ids = new Set();
  for (const m of selfModel?.knownModels ?? []) for (const v of [m.ruleId, m.ruleFingerprint]) if (v) ids.add(String(v));
  for (const g of selfModel?.failedGates ?? []) for (const v of [g.evaluationId, g.gateRuleFingerprint]) if (v) ids.add(String(v));
  if (db) for (const r of db.prepare('SELECT id FROM experiment_records WHERE project_id = ?').all(projectId)) ids.add(r.id);
  return ids;
}

/**
 * Genesis's decision about an experiment the model described. The model never runs it; the decision is
 * recorded next to the proposal and anything that proceeds goes through the canonical routes, started by a person.
 */
export function decideExperimentProposal(raw, { selfModel, frozenTargets = new Set() } = {}) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return { decision: 'REJECTED_MALFORMED', reason: 'experiment_proposal_not_an_object' };
  const kind = STR(raw.kind, 40)?.toUpperCase() ?? 'COMPUTATIONAL';
  const engineId = STR(raw.engineId, 120);
  const parameterChanges = Array.isArray(raw.parameterChanges)
    ? raw.parameterChanges.filter((c) => c && typeof c === 'object').slice(0, 30).map((c) => ({ target: STR(c.target, 300), to: c.to ?? null }))
    : [];
  const base = {
    kind, engineId, description: STR(raw.description), parameters: raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters) ? raw.parameters : {},
    parameterChanges, executedByModel: false,
  };
  const frozenHit = parameterChanges.find((c) => !c.target || FROZEN_TARGET.test(c.target) || frozenTargets.has(c.target));
  if (frozenHit) return { ...base, decision: 'REJECTED_FROZEN_THRESHOLD', reason: `A model may not change a frozen rule (${frozenHit.target ?? 'unnamed target'}).` };
  if (HUMAN_APPROVAL_KINDS.includes(kind)) return { ...base, decision: 'HUMAN_APPROVAL_REQUIRED', reason: 'Biological or laboratory work waits for a person to approve it.' };
  if (!selfModel) return { ...base, decision: 'BLOCKED_BY_SELF_MODEL', reason: 'SELF_MODEL_UNAVAILABLE' };
  const engine = engineId ? (selfModel.engines ?? []).find((e) => e.toolId === engineId || e.capabilityId === engineId) : null;
  if (!engine) return { ...base, decision: 'BLOCKED_BY_SELF_MODEL', reason: engineId ? `UNKNOWN_ENGINE: Genesis has no engine "${engineId}".` : 'NO_ENGINE_NAMED' };
  if (!engine.runtimeAvailableNow) return { ...base, engineId: engine.toolId, decision: 'BLOCKED_BY_RUNTIME', reason: engine.statement ?? engine.blockedBy };
  return { ...base, engineId: engine.toolId, decision: 'PROPOSED', reason: 'Genesis may plan it through its canonical routes; the model does not run it.' };
}

/**
 * Turns parsed provider output into a ScientificClaimProposal, or rejects it. Pure apart from the
 * evidence lookups, so the same output yields the same proposal whichever provider produced it.
 */
export function validateClaimProposal(value, { db = null, projectId = null, selfModel = null, question = null, hypothesisId = null } = {}) {
  const claim = STR(value?.claim);
  const falsificationProposal = STR(value?.falsificationProposal);
  const missing = [!claim && 'claim', !falsificationProposal && 'falsificationProposal'].filter(Boolean);
  if (missing.length) return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: `missing_${missing.join('_and_')}` };

  const degradations = [];
  const typeRaw = STR(value.claimType, 60)?.toUpperCase() ?? null;
  let claimType = typeRaw;
  if (!PROPOSAL_CLAIM_TYPES.includes(typeRaw)) {
    claimType = 'HYPOTHESIS';
    degradations.push({ field: 'claimType', from: typeRaw, to: 'HYPOTHESIS', reason: KNOWLEDGE_CLAIM_TYPES.includes(typeRaw) ? 'MODEL_CANNOT_ASSERT_KNOWLEDGE' : 'UNKNOWN_CLAIM_TYPE' });
  }
  const statusRaw = STR(value.status, 60)?.toUpperCase() ?? null;
  if (statusRaw && statusRaw !== 'PROPOSED') degradations.push({ field: 'status', from: statusRaw, to: 'PROPOSED', reason: 'MODEL_CANNOT_SET_STATUS' });

  const unresolvedEvidenceRefs = [];
  const keepResolved = (refs, field) => refs.filter((ref) => {
    const r = db && projectId ? resolveEvidenceRef(db, projectId, ref) : { ok: false, reason: 'no_project' };
    if (!r.ok) unresolvedEvidenceRefs.push({ field, ref, reason: r.reason });
    return r.ok;
  });
  const supportingEvidenceRefs = keepResolved(STRS(value.supportingEvidenceRefs), 'supportingEvidenceRefs');
  const contradictingEvidenceRefs = keepResolved(STRS(value.contradictingEvidenceRefs), 'contradictingEvidenceRefs');
  if (unresolvedEvidenceRefs.length) degradations.push({ field: 'evidenceRefs', from: unresolvedEvidenceRefs.length, to: 0, reason: 'CITATION_NOT_IN_THIS_PROJECT' });

  const u = value.uncertainty;
  const level = STR(typeof u === 'object' && u ? u.level : null, 20)?.toUpperCase();
  const uncertainty = {
    level: UNCERTAINTY_LEVELS.includes(level) ? level : 'UNKNOWN',
    statement: STR(typeof u === 'string' ? u : u?.statement),
  };

  const experimentProposal = decideExperimentProposal(value.experimentProposal, { selfModel, frozenTargets: frozenTargetsOf(selfModel, db, projectId) });
  const proposal = {
    contractVersion: CLAIM_PROPOSAL_CONTRACT_VERSION,
    question: STR(question),
    claim,
    claimType,
    hypothesisId: STR(hypothesisId, 200) ?? STR(value.hypothesisId, 200),
    assumptions: STRS(value.assumptions),
    supportingEvidenceRefs,
    contradictingEvidenceRefs,
    missingEvidence: STRS(value.missingEvidence),
    uncertainty,
    falsificationProposal,
    experimentProposal,
    unresolvedEvidenceRefs,
    degradations,
    epistemicStatus: 'NOT_EVIDENCE',
    status: 'PROPOSED',
  };
  return { ok: true, proposal };
}

function projectEvidenceRefs(db, projectId) {
  return [
    ...db.prepare('SELECT id FROM experiment_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 20').all(projectId).map((r) => `experiment_record:${r.id}`),
    ...db.prepare("SELECT id FROM science_runs WHERE project_id = ? AND status = 'ok' ORDER BY created_at DESC LIMIT 20").all(projectId).map((r) => `science_run:${r.id}`),
  ];
}

export function buildProposalPrompt({ question, hypothesisId, evidenceRefs, selfModel }) {
  const engines = (selfModel?.engines ?? []).map((e) => `- ${e.toolId}: ${e.runtimeAvailableNow ? 'available now' : `adapter exists, runtime unavailable (${e.blockedBy})`}`);
  return [
    `Question: ${question}`,
    hypothesisId ? `Hypothesis id: ${hypothesisId}` : null,
    '',
    'Evidence references you may cite (this project only):',
    ...(evidenceRefs.length ? evidenceRefs.map((r) => `- ${r}`) : ['- (none: this project has no evidence yet)']),
    '',
    'Engines Genesis has:',
    ...(engines.length ? engines : ['- (self model unavailable)']),
  ].filter((line) => line !== null).join('\n');
}

const PROVIDER_FAILURE = { NOT_CONFIGURED: 'BLOCKED_BY_PROVIDER_CONFIGURATION', TIMEOUT: 'PROVIDER_TIMEOUT', REFUSED: 'PROVIDER_REFUSED', UPSTREAM: 'PROVIDER_ERROR' };

/**
 * The whole ENTITY-3 path: ask → validate → store as PROPOSED. Returns { ok, status, ... }; on every
 * failure nothing is written.
 */
export async function proposeScientificClaim(db, projectId, input, { provider, selfModel = null, userId = null, timeoutMs } = {}) {
  const question = STR(input?.question, 4000);
  if (!question) return { ok: false, status: 'INVALID_REQUEST', reason: 'question' };
  const hypothesisId = STR(input?.hypothesisId, 200);
  if (!provider?.configured) return { ok: false, status: 'BLOCKED_BY_PROVIDER_CONFIGURATION', reason: provider?.reason ?? 'NO_PROVIDER' };
  const registry = readKnowledgeRegistry(db, projectId);
  if (!registry.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', chain: registry.chain };

  const prompt = buildProposalPrompt({ question, hypothesisId, evidenceRefs: projectEvidenceRefs(db, projectId), selfModel });
  let completion;
  try {
    completion = await provider.complete({ system: CLAIM_PROPOSAL_SYSTEM_PROMPT, prompt, ...(timeoutMs ? { timeoutMs } : {}) });
  } catch (err) {
    const code = err instanceof ReasoningProviderError ? err.code : 'UPSTREAM';
    return { ok: false, status: PROVIDER_FAILURE[code] ?? 'PROVIDER_ERROR', reason: code };
  }
  const parsed = parseProposalText(completion?.text);
  if (!parsed.ok) return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: parsed.reason };
  const validated = validateClaimProposal(parsed.value, { db, projectId, selfModel, question, hypothesisId });
  if (!validated.ok) return validated;

  const generatedBy = { kind: 'EXTERNAL_REASONING_MODEL', providerId: provider.providerId, model: completion.model ?? provider.model, version: REASONING_ADAPTER_VERSION };
  const proposalId = `claim-${fnv1a(canonicalJson({ question, hypothesisId, proposal: validated.proposal, generatedBy }))}`;
  const stored = recordClaimProposal(db, projectId, { proposalId, ...validated.proposal, generatedBy }, userId);
  if (!stored.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', chain: stored.chain };
  return { ok: true, status: 'PROPOSED', deduped: stored.deduped, proposal: stored.proposal };
}
