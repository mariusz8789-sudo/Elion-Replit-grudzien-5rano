/**
 * Autonomous Computational Discovery Forge (Final WOW Mandate).
 *
 * A closed-loop controller that takes a bounded computational discovery mission and
 * autonomously drives MULTIPLE generations of candidate generation → real-engine funnel →
 * adversarial criticism → falsification-priority → failure memory → PLAN MUTATION →
 * next generation, until an explicit stop condition. It composes ONLY verified substrate:
 * real RDKit (analogue generation via SMARTS reactions, descriptors, structural alerts,
 * synthetic-accessibility, Tanimoto novelty), the tenant-isolated Necropolis, the epistemic
 * priority scorer, and the append-only discovery event log for provenance + replay.
 *
 * HONESTY (non-negotiable):
 *  - Output is COMPUTATIONAL CANDIDATES — hypotheses for further validation. Never an
 *    experimentally validated therapeutic, never an approved drug, never "NOVEL_DISCOVERY".
 *  - Engines that lack real inputs (docking receptor, MD system, a defined QM question, a
 *    live reasoning model, live literature) are CAPABILITY_BLOCKED / SKIPPED with a reason —
 *    never faked. Docking/MD/QM are not claimed unless a real run occurred.
 *  - The autonomy claim is the NARROWEST defensible one: the campaign changes its plan
 *    because of results it actually observed. That is autonomous computational campaign
 *    ADAPTATION, not autonomous scientific discovery and not AGI.
 */
import { canonicalHash } from '../provenance.mjs';
import * as necro from './necropolis.mjs';
import { selectNextAction } from './formalKernel.mjs';
import * as rdkitAdapter from '../compute/rdkitAdapter.mjs';
import * as admetAdapter from '../compute/admetAdapter.mjs';

export const CAMPAIGN_STATUS = Object.freeze({
  CREATED: 'CREATED', EVIDENCE_BUILDING: 'EVIDENCE_BUILDING', TARGET_MAPPING: 'TARGET_MAPPING',
  TARGET_SELECTION: 'TARGET_SELECTION', CANDIDATE_GENERATION: 'CANDIDATE_GENERATION', FUNNEL_RUNNING: 'FUNNEL_RUNNING',
  CRITICIZING: 'CRITICIZING', FALSIFYING: 'FALSIFYING', PLAN_MUTATING: 'PLAN_MUTATING', NEXT_GENERATION: 'NEXT_GENERATION',
  NOVELTY_CHECKING: 'NOVELTY_CHECKING', DOSSIER_BUILDING: 'DOSSIER_BUILDING',
  COMPLETED_WITH_COMPUTATIONAL_CANDIDATES: 'COMPLETED_WITH_COMPUTATIONAL_CANDIDATES',
  COMPLETED_NO_SURVIVORS: 'COMPLETED_NO_SURVIVORS', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED', BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED', MISSION_FAILURE: 'MISSION_FAILURE',
});
export const CANDIDATE_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', SURVIVED_STAGE: 'SURVIVED_STAGE', REJECTED: 'REJECTED', NEEDS_REVIEW: 'NEEDS_REVIEW', CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED', FINALIST: 'FINALIST' });
export const ENGINE_DECISION = Object.freeze({ EXECUTE: 'EXECUTE', SKIP: 'SKIP', UNSUPPORTED: 'UNSUPPORTED', CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED' });
export const MUTATION_TYPE = Object.freeze({
  CHANGE_TARGET_PRIORITY: 'CHANGE_TARGET_PRIORITY', REQUEST_MORE_EVIDENCE: 'REQUEST_MORE_EVIDENCE',
  NARROW_CHEMICAL_REGION: 'NARROW_CHEMICAL_REGION', EXPAND_CHEMICAL_REGION: 'EXPAND_CHEMICAL_REGION',
  AVOID_FAILURE_REGION: 'AVOID_FAILURE_REGION', CHANGE_GENERATION_STRATEGY: 'CHANGE_GENERATION_STRATEGY',
  ADD_FALSIFICATION_TASK: 'ADD_FALSIFICATION_TASK', REMOVE_LOW_VALUE_STAGE: 'REMOVE_LOW_VALUE_STAGE',
  ADD_HIGH_VALUE_STAGE: 'ADD_HIGH_VALUE_STAGE', STOP_CAMPAIGN: 'STOP_CAMPAIGN', REQUEST_HUMAN_REVIEW: 'REQUEST_HUMAN_REVIEW',
});
export const NOVELTY_STATUS = Object.freeze({ KNOWN: 'KNOWN', CLOSE_ANALOGUE: 'CLOSE_ANALOGUE', POSSIBLY_NOVEL: 'POSSIBLY_NOVEL', NOVELTY_UNRESOLVED: 'NOVELTY_UNRESOLVED' });

export const DISCOVERY_LIMITATION =
  'Computational candidates are hypotheses for further validation. They are not experimentally ' +
  'validated therapeutics and are not approved drugs.';

/** Real engine adapters. Injectable so hostile/autonomy tests are deterministic. */
export function defaultEngines() {
  return {
    validate: (s) => rdkitAdapter.validate(s),
    descriptors: (s) => rdkitAdapter.descriptors(s),
    transform: (s, t) => rdkitAdapter.transform(s, t),
    listTransformations: () => rdkitAdapter.listTransformations(),
    alerts: (s) => rdkitAdapter.structuralAlerts(s),
    saScore: (s) => rdkitAdapter.saScore(s),
    novelty: (s, ref) => rdkitAdapter.novelty(s, ref),
    admetDetect: () => admetAdapter.detect(),
  };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/* ---------------- Plan model ---------------- */
export function initialPlan(challenge = {}) {
  return {
    generationStrategy: 'ANALOGUE_GENERATION',
    allowedTransformations: challenge.allowedTransformations ?? null, // null = all supported
    avoidTransformations: [],
    avoidScaffolds: [],
    region: { maxMolWt: challenge.maxMolWt ?? 550, maxAlerts: challenge.maxAlerts ?? 0, maxLogP: challenge.maxLogP ?? 5 },
  };
}
export const planHash = (plan) => canonicalHash(plan);

/* ---------------- Engine Applicability Router (Phase 7) ---------------- */
export function engineApplicability(_candidate, { hasReceptor = false, quantumQuestion = null, mdSystem = null, engines = defaultEngines() } = {}) {
  const admet = engines.admetDetect ? engines.admetDetect() : { available: false };
  return [
    { engine: 'RDKit', decision: ENGINE_DECISION.EXECUTE, reason: '2D sanity/descriptors/alerts always applicable to a valid structure', requiredInputs: ['canonical SMILES'], expectedInfoValue: 0.7, computeCost: 0.05 },
    { engine: 'ADMET-AI', decision: admet.available ? ENGINE_DECISION.EXECUTE : ENGINE_DECISION.CAPABILITY_BLOCKED, reason: admet.available ? 'engine installed and detected' : 'ADMET-AI engine not installed/detected — not claimed', requiredInputs: ['canonical SMILES', 'installed admet-ai'], expectedInfoValue: 0.6, computeCost: 0.4 },
    { engine: 'AutoDock Vina', decision: hasReceptor ? ENGINE_DECISION.EXECUTE : ENGINE_DECISION.CAPABILITY_BLOCKED, reason: hasReceptor ? 'real prepared receptor supplied' : 'no real prepared receptor structure — docking NOT run and NOT claimed', requiredInputs: ['prepared receptor (PDBQT)', 'binding site', 'ligand 3D'], expectedInfoValue: 0.85, computeCost: 1 },
    { engine: 'OpenMM', decision: mdSystem ? ENGINE_DECISION.EXECUTE : ENGINE_DECISION.CAPABILITY_BLOCKED, reason: mdSystem ? 'valid prepared system supplied' : 'no valid prepared MD system — molecular dynamics NOT run and NOT claimed', requiredInputs: ['prepared system', 'force field'], expectedInfoValue: 0.8, computeCost: 1 },
    { engine: 'PySCF', decision: quantumQuestion ? ENGINE_DECISION.EXECUTE : ENGINE_DECISION.SKIP, reason: quantumQuestion ? `defined quantum question: ${quantumQuestion}` : 'no defined quantum-chemistry question — NOT run for decoration', requiredInputs: ['defined QM question', '3D geometry', 'method+basis'], expectedInfoValue: 0.75, computeCost: 1 },
  ];
}

/* ---------------- Candidate generation (Phase 6, real RDKit analogue generation) ---------------- */
/**
 * Generate a cohort by applying real SMARTS-reaction transformations to seed scaffolds.
 * Deterministic. Dedups canonically, rejects invalid, and consults tenant Necropolis to
 * skip candidates whose descriptor region is a known dead end for this campaign's tenant.
 */
export function generateCohort(db, campaign, { generation, plan, seeds, engines = defaultEngines(), maxCandidates = 12 }) {
  const projectId = campaign.projectId;
  const avoid = new Set(plan.avoidTransformations ?? []);
  const allTransforms = plan.allowedTransformations ?? (engines.listTransformations().transformations ?? []);
  const transforms = allTransforms.filter((t) => !avoid.has(t));
  const seen = new Set();
  const candidates = [];
  const skipped = [];
  for (const seed of seeds) {
    for (const t of transforms) {
      if (candidates.length >= maxCandidates) break;
      const res = engines.transform(seed.smiles, t);
      if (!res.ok) { skipped.push({ seed: seed.name, transformation: t, reason: res.error ?? 'transform_failed' }); continue; }
      for (const prod of res.products ?? []) {
        if (candidates.length >= maxCandidates) break;
        const v = engines.validate(prod);
        if (!v.ok) { skipped.push({ transformation: t, smiles: prod, reason: 'invalid_structure' }); continue; }
        const canonical = v.canonicalSmiles ?? prod;
        if (seen.has(canonical)) continue; // canonical dedup — no fake cohort diversity
        seen.add(canonical);
        // Consult Necropolis: does this candidate's region match a known dead end for the tenant?
        const desc = engines.descriptors(canonical);
        const pv = desc.ok ? { molWt: num(desc.data.molWt), logP: num(desc.data.crippenLogP) } : {};
        const region = necro.assess(db, projectId, { context: `discovery:${campaign.id}`, parameterVector: pv, scales: { molWt: 500, logP: 5 } });
        if (region.verdict === 'KNOWN_DEAD_END') { skipped.push({ transformation: t, smiles: canonical, reason: `necropolis_dead_end (${region.nearest?.failureClass})` }); continue; }
        candidates.push({
          candidateId: canonicalHash({ campaign: campaign.id, canonical, generation }).slice(0, 16),
          cohortId: `${campaign.id}:gen${generation}`, generationNumber: generation,
          parentCandidateIds: [seed.candidateId ?? seed.name], generationStrategy: plan.generationStrategy,
          generationReason: `SMARTS transformation ${t} applied to ${seed.name}`, canonicalStructure: canonical,
          canonicalStructureHash: canonicalHash(canonical), scaffold: seed.name, mutationHistory: [...(seed.mutationHistory ?? []), t],
          constraintsUsed: plan.region, provenance: { engine: 'RDKit', transformation: t }, epistemicStatus: 'COMPUTED', status: CANDIDATE_STATUS.ACTIVE,
        });
      }
    }
  }
  return { candidates, skipped, transformsUsed: transforms };
}

/* ---------------- Computational funnel (Phase 8, real RDKit engines) ---------------- */
export function funnelCandidate(candidate, { plan, engines = defaultEngines(), referenceSet = [] }) {
  const s = candidate.canonicalStructure;
  const stages = [];
  const rec = (stage, status, result, extra = {}) => stages.push({ stage, engine: extra.engine ?? 'RDKit', status, result, inputHash: canonicalHash(s), resultHash: canonicalHash(result ?? {}), ...extra });

  const v = engines.validate(s);
  if (!v.ok) { rec('CANDIDATE_SANITY', 'REJECTED', { valid: false }, { failureReason: 'invalid_structure' }); return { status: CANDIDATE_STATUS.REJECTED, stages, signals: {}, rejectReason: 'invalid_structure' }; }
  rec('CANDIDATE_SANITY', 'EXECUTED', { valid: true });

  const d = engines.descriptors(s);
  if (!d.ok) { rec('DESCRIPTOR_ANALYSIS', 'CAPABILITY_BLOCKED', {}, { failureReason: d.error ?? 'descriptors_failed' }); return { status: CANDIDATE_STATUS.CAPABILITY_BLOCKED, stages, signals: {} }; }
  const molWt = num(d.data.molWt); const logP = num(d.data.crippenLogP); const lipinski = num(d.data.lipinskiViolations);
  rec('DESCRIPTOR_ANALYSIS', 'EXECUTED', { molWt, logP, lipinskiViolations: lipinski });

  const al = engines.alerts(s);
  const nAlerts = al.ok ? (al.nAlerts ?? (al.alerts ?? []).length) : null;
  rec('STRUCTURAL_ALERTS', al.ok ? 'EXECUTED' : 'CAPABILITY_BLOCKED', { nAlerts, alerts: al.alerts ?? [] });

  const sa = engines.saScore(s);
  rec('SYNTHETIC_ACCESSIBILITY', sa.ok ? 'EXECUTED' : 'CAPABILITY_BLOCKED', { saScore: sa.ok ? num(sa.saScore) : null });

  const nov = engines.novelty(s, referenceSet);
  rec('NOVELTY_SIGNAL', nov.ok ? 'EXECUTED' : 'CAPABILITY_BLOCKED', { maxTanimoto: nov.ok ? nov.maxTanimoto : null });

  // Region gate under the current plan — provable, explainable rejections.
  const reasons = [];
  if (num(molWt) != null && molWt > plan.region.maxMolWt) reasons.push(`molWt ${molWt.toFixed(1)} > ${plan.region.maxMolWt}`);
  if (num(logP) != null && logP > plan.region.maxLogP) reasons.push(`logP ${logP.toFixed(2)} > ${plan.region.maxLogP}`);
  if (num(nAlerts) != null && nAlerts > plan.region.maxAlerts) reasons.push(`structural alerts ${nAlerts} > ${plan.region.maxAlerts}`);
  const signals = { molWt, logP, lipinskiViolations: lipinski, nAlerts, saScore: sa.ok ? num(sa.saScore) : null, maxTanimoto: nov.ok ? nov.maxTanimoto : null };
  if (reasons.length) { rec('REGION_GATE', 'REJECTED', { reasons }); return { status: CANDIDATE_STATUS.REJECTED, stages, signals, rejectReason: reasons.join('; ') }; }
  rec('REGION_GATE', 'EXECUTED', { withinRegion: true });
  return { status: CANDIDATE_STATUS.SURVIVED_STAGE, stages, signals };
}

/* ---------------- Adversarial Discovery Critic (Phase 9) ---------------- */
/** Structured criticism that can DEMOTE a top-ranked candidate. */
export function critiqueCandidate(candidate, signals, { enginesRun = ['RDKit'], referenceNoveltyThreshold = 0.85 }) {
  const critiques = [];
  if (signals.maxTanimoto != null && signals.maxTanimoto >= referenceNoveltyThreshold) critiques.push({ concern: 'close-analogue', detail: `Tanimoto ${signals.maxTanimoto.toFixed(2)} to a known reference — ranking may reward mere similarity, not novelty`, severity: 'high' });
  if (enginesRun.length <= 1) critiques.push({ concern: 'single-engine-evidence', detail: 'ranking rests on a single engine (RDKit 2D) — not independent multi-engine support; docking/ADMET not available', severity: 'medium' });
  if (signals.saScore != null && signals.saScore > 6) critiques.push({ concern: 'low-synthesizability', detail: `SA score ${signals.saScore.toFixed(1)} suggests hard synthesis`, severity: 'medium' });
  critiques.push({ concern: 'no-affinity-claim', detail: 'no docking/affinity was computed; do NOT interpret survival as target binding', severity: 'info' });
  const demote = critiques.some((c) => c.severity === 'high');
  return { critiques, demote };
}

/* ---------------- Falsification priority (Phase 10, epistemic priority) ---------------- */
export function cheapestFalsification(candidate, signals, { hasReceptor = false }) {
  const actions = [];
  if (signals.maxTanimoto != null && signals.maxTanimoto >= 0.85) actions.push({ type: 'RETRIEVE_EVIDENCE', target: 'novelty vs prior art', expectedInfoGainProxy: 0.8, computeCost: 0.2, decisionRelevance: 0.9, reversibility: 1, riskOfInvalidInference: 0.1, testType: 'prior-art-check', requiredInput: 'a live structure/bioactivity source', costClass: 'cheap' });
  if (!hasReceptor) actions.push({ type: 'WAIT_FOR_RESOURCE', target: 'target binding is unproven without a receptor', expectedInfoGainProxy: 0.85, computeCost: 1, decisionRelevance: 1, reversibility: 1, riskOfInvalidInference: 0.2, testType: 'acquire-receptor-and-dock', requiredInput: 'a real prepared receptor structure', costClass: 'moderate' });
  actions.push({ type: 'TEST_ASSUMPTION', target: 'developability assumption behind survival', expectedInfoGainProxy: 0.5, computeCost: 0.3, decisionRelevance: 0.7, reversibility: 1, riskOfInvalidInference: 0.1, testType: 'admet-assessment', requiredInput: 'installed ADMET engine', costClass: 'cheap' });
  const sel = selectNextAction(actions);
  const a = sel.action;
  return { targetAssumption: a.target, falsificationObjective: `invalidate: ${a.target}`, testType: a.testType, requiredInput: a.requiredInput, expectedInformationGain: a.expectedInfoGainProxy, costClass: a.costClass, priorityReason: sel.reason, expertReviewRequested: a.type === 'WAIT_FOR_RESOURCE' };
}

/* ---------------- Evidence claim guard (Phase 4, honesty core) ---------------- */
export const CLAIM_STATE = Object.freeze({ UNSUPPORTED: 'UNSUPPORTED', MODEL_PROPOSED: 'MODEL_PROPOSED', SOURCE_SUPPORTED: 'SOURCE_SUPPORTED', SOURCE_CONTRADICTED: 'SOURCE_CONTRADICTED', MULTI_SOURCE_SUPPORTED: 'MULTI_SOURCE_SUPPORTED', CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE', REQUIRES_HUMAN_REVIEW: 'REQUIRES_HUMAN_REVIEW' });
/**
 * A model-produced claim is a PROPOSAL. It can only reach SOURCE_SUPPORTED when a real
 * supporting source is attached — never by assertion or confident wording alone.
 */
export function classifyClaim({ text, proposedByModel = false, sources = [] } = {}) {
  const supporting = sources.filter((s) => s && s.direction === 'supporting' && (s.sourceId || s.doi));
  const contradicting = sources.filter((s) => s && s.direction === 'contradicting' && (s.sourceId || s.doi));
  if (supporting.length && contradicting.length) return { text, state: CLAIM_STATE.CONFLICTING_EVIDENCE, supporting: supporting.length, contradicting: contradicting.length };
  if (supporting.length >= 2) return { text, state: CLAIM_STATE.MULTI_SOURCE_SUPPORTED, supporting: supporting.length };
  if (supporting.length === 1) return { text, state: CLAIM_STATE.SOURCE_SUPPORTED, supporting: 1 };
  if (contradicting.length) return { text, state: CLAIM_STATE.SOURCE_CONTRADICTED, contradicting: contradicting.length };
  if (proposedByModel) return { text, state: CLAIM_STATE.MODEL_PROPOSED, note: 'model proposal — NOT evidence until a real source supports it' };
  return { text, state: CLAIM_STATE.UNSUPPORTED };
}

/* ---------------- Novelty gate (Phase 14) ---------------- */
export function noveltyGate(candidate, signals, { referenceSet = [], liveSources = false }) {
  const canonical = candidate.canonicalStructure;
  if (referenceSet.includes(canonical)) return { status: NOVELTY_STATUS.KNOWN, reason: 'exact canonical match to a supplied reference structure' };
  if (signals.maxTanimoto != null && signals.maxTanimoto >= 0.85) return { status: NOVELTY_STATUS.CLOSE_ANALOGUE, reason: `Tanimoto ${signals.maxTanimoto.toFixed(2)} to a reference structure` };
  if (!liveSources) return { status: NOVELTY_STATUS.NOVELTY_UNRESOLVED, reason: 'no live structure/patent/bioactivity source available — novelty cannot be established (never fabricated)' };
  return { status: NOVELTY_STATUS.POSSIBLY_NOVEL, reason: 'no match in available live sources (bounded by source coverage)' };
}

/* ---------------- Dynamic Plan Mutation (Phase 12 — core WOW) ---------------- */
/**
 * Mutate the plan based ONLY on OBSERVED cohort results (aggregated rejection reasons and
 * survivor pattern) plus tenant failure memory. Fake mutation (timestamp/id changes) is
 * impossible here: the new plan hash changes only when a real plan field changes.
 */
export function mutatePlan(plan, observations, { movesRemaining = true } = {}) {
  const prev = planHash(plan);
  const next = JSON.parse(JSON.stringify(plan));
  let mutationType = null; const rationale = [];

  const { survivors, rejected, alertRejections, mwRejections, logpRejections, failingTransformations } = observations;

  if (survivors === 0 && rejected === 0) {
    return { mutated: false, mutationType: MUTATION_TYPE.REQUEST_HUMAN_REVIEW, previousPlanHash: prev, newPlanHash: prev, newPlan: plan, rationale: ['no candidates were produced — generation strategy exhausted'], trigger: 'empty-cohort' };
  }
  // Prioritise the dominant, provable failure mode observed this generation.
  if (alertRejections > 0 && alertRejections >= mwRejections && failingTransformations.length > 0) {
    next.avoidTransformations = [...new Set([...(next.avoidTransformations ?? []), ...failingTransformations])];
    mutationType = MUTATION_TYPE.CHANGE_GENERATION_STRATEGY;
    rationale.push(`${alertRejections} candidate(s) rejected on structural alerts; avoiding transformations ${failingTransformations.join(', ')} that produced them`);
  } else if (mwRejections > 0 && mwRejections >= alertRejections) {
    next.region = { ...next.region, maxMolWt: Math.max(250, Math.round(next.region.maxMolWt * 0.85)) };
    mutationType = MUTATION_TYPE.NARROW_CHEMICAL_REGION;
    rationale.push(`${mwRejections} candidate(s) exceeded the MW ceiling; narrowing maxMolWt to ${next.region.maxMolWt}`);
  } else if (logpRejections > 0) {
    next.region = { ...next.region, maxLogP: +(next.region.maxLogP - 0.5).toFixed(2) };
    mutationType = MUTATION_TYPE.NARROW_CHEMICAL_REGION;
    rationale.push(`${logpRejections} candidate(s) exceeded the logP ceiling; narrowing maxLogP to ${next.region.maxLogP}`);
  } else if (survivors > 0) {
    mutationType = MUTATION_TYPE.CHANGE_GENERATION_STRATEGY;
    next.generationStrategy = 'ANALOGUE_GENERATION_AROUND_SURVIVORS';
    rationale.push(`${survivors} survivor(s) — refocusing next generation around survivors (local exploration)`);
  }
  if (!movesRemaining) { return { mutated: false, mutationType: MUTATION_TYPE.STOP_CAMPAIGN, previousPlanHash: prev, newPlanHash: prev, newPlan: plan, rationale: ['budget/convergence — no further productive moves'], trigger: 'exhausted' }; }

  const nh = planHash(next);
  return { mutated: nh !== prev, mutationType, previousPlanHash: prev, newPlanHash: nh, newPlan: next, rationale, trigger: 'observed-cohort-results' };
}

/** Aggregate observed cohort outcomes into the signal the mutation layer consumes. */
export function observeCohort(funnelResults) {
  let survivors = 0; let rejected = 0; let alertRejections = 0; let mwRejections = 0; let logpRejections = 0;
  const failingTransformations = new Set();
  for (const r of funnelResults) {
    if (r.status === CANDIDATE_STATUS.SURVIVED_STAGE || r.status === CANDIDATE_STATUS.FINALIST) survivors++;
    if (r.status === CANDIDATE_STATUS.REJECTED) {
      rejected++;
      const why = r.rejectReason ?? '';
      if (/alert/.test(why)) { alertRejections++; if (r.candidate?.provenance?.transformation) failingTransformations.add(r.candidate.provenance.transformation); }
      if (/molWt/.test(why)) mwRejections++;
      if (/logP/.test(why)) logpRejections++;
    }
  }
  return { survivors, rejected, alertRejections, mwRejections, logpRejections, failingTransformations: [...failingTransformations] };
}
