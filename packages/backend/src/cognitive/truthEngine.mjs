/**
 * ZEFIR Deep-Tech Truth Engine + R&D Kill-Switch (Phase 4 product).
 *
 * Answers: "Before we spend money/compute/lab-time/expert-hours, is this direction
 * internally coherent, physically plausible, properly specified, and worth continuing?"
 *
 * This module ONLY composes already-verified deterministic engines (formalKernel,
 * speculativePhysics, preflightGate) — it invents no new science. Missing information
 * is a first-class result; engines never run without their required inputs. The
 * decision is explainable and, for the same canonical input + engine versions, the
 * `decisionHash` is reproducible (timestamp excluded from it).
 *
 * HONESTY: BLOCK never means "proven impossible in all conceivable universes". It means
 * "under the supplied assumptions, constraints, evidence, and currently encoded checks,
 * continuation is not justified." Marketing language does not change the decision.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';
import * as fk from './formalKernel.mjs';
import * as sp from './speculativePhysics.mjs';
import * as cr from './constraintRegistry.mjs';
import * as necro from './necropolis.mjs';

export const KILL_SWITCH = Object.freeze({ GO: 'GO', WARN: 'WARN', BLOCK: 'BLOCK', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA' });
export const ENGINE_VERSIONS = Object.freeze({ formalKernel: '1.0', speculativePhysics: '1.0', preflightGate: '1.0', constraintRegistry: cr.REGISTRY_VERSION, necropolis: necro.NECROPOLIS_SCHEMA, truthEngine: '1.1' });
export const CERT_SCHEMA = 'zefir-truth-cert/1';

/** Canonicalize a proposal (stable key order) and hash it. Structured engineering
 *  inputs are included so the proposalHash + decisionHash stay reproducible. */
export function normalizeProposal(proposal = {}) {
  const norm = {
    problemStatement: proposal.problemStatement ?? null,
    proposedMechanism: proposal.proposedMechanism ?? null,
    claimedResult: proposal.claimedResult ?? null,
    equations: proposal.equations ?? [],
    variables: proposal.variables ?? [],
    comparisons: proposal.comparisons ?? [],
    assumptions: proposal.assumptions ?? [],
    physicalConstraints: proposal.physicalConstraints ?? [],
    speculativeClaims: proposal.speculativeClaims ?? [],
    requiredCapabilities: proposal.requiredCapabilities ?? [],
    // Structured engineering inputs consumed by the deterministic Constraint Registry.
    energy: proposal.energy ?? null,
    efficiency: Number.isFinite(proposal.efficiency) ? proposal.efficiency : null,
    efficiencyKind: proposal.efficiencyKind ?? null,
    mass: proposal.mass ?? null,
    operating: proposal.operating ?? null,
    flow: proposal.flow ?? null,
    power: proposal.power ?? null,
    geometry: proposal.geometry ?? null,
    materials: proposal.materials ?? [],
    accounting: proposal.accounting ?? null,
    requestedDomains: proposal.requestedDomains ?? [],
    expectedPerformance: proposal.expectedPerformance ?? null,
    estimatedCost: proposal.estimatedCost ?? null,
    parameterVector: proposal.parameterVector ?? null,
    context: proposal.context ?? null,
    scales: proposal.scales ?? null,
    target: proposal.target ?? null,
    requirements: proposal.requirements ?? [],
    challengesModel: proposal.challengesModel ?? null,
    evidence: proposal.evidence ?? [],
  };
  return { normalized: norm, proposalHash: canonicalHash(norm) };
}

/**
 * Run the full ZEFIR truth pipeline. opts: { db?, capabilityResolver?, missionId? }.
 * Returns { proposalHash, stages, decision, certificate }.
 */
export function analyze(proposal = {}, { db = null, capabilityResolver = () => false, missionId = null, projectId = null } = {}) {
  const { normalized: P, proposalHash } = normalizeProposal(proposal);
  const stages = [];
  const S = (stage, status, findings = {}, missing = []) => { stages.push({ stage, status, findings, missing }); return stages[stages.length - 1]; };

  const critical = []; const warnings = []; const missingInfo = [];
  const dimensionalInconsistencies = []; const physicalViolations = []; const deadEnds = [];
  const capabilityGaps = []; const speculative = []; const unresolvedAssumptions = [];
  const constraintViolations = []; const unsupportedDomains = [];

  // 1) NORMALIZATION
  S('NORMALIZATION', 'EXECUTED', { proposalHash });

  // 2) CLAIM_EXTRACTION
  const claims = [P.claimedResult, ...(P.physicalConstraints), ...(P.speculativeClaims)].filter(Boolean);
  S('CLAIM_EXTRACTION', claims.length ? 'EXECUTED' : 'SKIPPED', { claims }, claims.length ? [] : ['no explicit claims']);

  // 3) ASSUMPTION_ANALYSIS
  if (P.assumptions.length > 0) {
    const attacks = P.assumptions.map((a) => fk.assumptionAttack(a, P.claimedResult ? [P.claimedResult] : []));
    S('ASSUMPTION_ANALYSIS', 'EXECUTED', { attacks });
  } else {
    warnings.push('assumptions-unstated'); missingInfo.push('assumptions');
    S('ASSUMPTION_ANALYSIS', 'WARN', { note: 'no assumptions stated — hidden-assumption risk' }, ['assumptions']);
  }
  if (P.claimedResult && P.assumptions.length === 0) unresolvedAssumptions.push('implicit assumptions behind the claimed result');

  // 4) DIMENSIONAL_ANALYSIS + UNIT_CONSISTENCY
  const eqs = (P.equations ?? []).filter((e) => Array.isArray(e.terms) && e.terms.length > 0);
  if (eqs.length > 0) {
    const results = eqs.map((e) => ({ equation: e.symbol ?? '?', ...fk.checkDimensionalConsistency(e.terms) }));
    const bad = results.filter((r) => !r.consistent);
    bad.forEach((b) => { dimensionalInconsistencies.push(b.equation); critical.push(`dimensional inconsistency in ${b.equation}`); });
    let pi = null;
    if (Array.isArray(P.variables) && P.variables.length >= 2 && P.variables.every((v) => Array.isArray(v.dimension))) pi = fk.buckinghamPi(P.variables);
    S('DIMENSIONAL_ANALYSIS', bad.length ? 'BLOCK' : 'EXECUTED', { results, buckinghamPi: pi });
  } else {
    missingInfo.push('equations-with-dimensions');
    S('DIMENSIONAL_ANALYSIS', 'SKIPPED', {}, ['equations-with-dimensions']);
  }

  // 5) PHYSICAL_CONSTRAINT_CHECK
  if (P.physicalConstraints.length > 0) {
    const assessed = P.physicalConstraints.map(sp.assessPhysicalClaim);
    assessed.filter((a) => a.status === 'CONTRADICTED').forEach((a) => { physicalViolations.push(a.claim); critical.push(`physical constraint violated: ${a.claim}`); });
    S('PHYSICAL_CONSTRAINT_CHECK', physicalViolations.length ? 'BLOCK' : 'EXECUTED', { assessed });
  } else {
    S('PHYSICAL_CONSTRAINT_CHECK', 'SKIPPED', {}, ['physical-constraints']);
  }

  // 5b) CONSTRAINT_REGISTRY — deterministic engineering constraints over STRUCTURED inputs
  //     (energy, efficiency, mass, operating bounds, flow=V/t, power=E/t, geometry,
  //     material limits, conservation). Missing structured inputs → the constraint is
  //     SKIPPED, never a silent pass. A CRITICAL violation is a BLOCK with exact numbers.
  const registryInputs = { energy: P.energy, efficiency: P.efficiency, efficiencyKind: P.efficiencyKind, mass: P.mass, operating: P.operating, flow: P.flow, power: P.power, geometry: P.geometry, materials: P.materials, accounting: P.accounting };
  const anyStructured = P.energy || Number.isFinite(P.efficiency) || P.mass || P.operating || P.flow || P.power || P.geometry || (P.materials && P.materials.length) || P.accounting;
  if (anyStructured || (P.requestedDomains && P.requestedDomains.length)) {
    const reg = cr.evaluateAll(registryInputs, { requestedDomains: P.requestedDomains ?? [] });
    reg.violations.forEach((v) => { constraintViolations.push({ id: v.id, detail: v.detail }); critical.push(`constraint "${v.id}" violated: ${v.detail}`); });
    reg.warnings.forEach((w) => warnings.push(`constraint-warning:${w.id}`));
    reg.unsupported.forEach((u) => { unsupportedDomains.push(u); capabilityGaps.push(u.domain); warnings.push('constraint-domain-unsupported'); });
    const evaluated = reg.violations.length + reg.warnings.length + reg.passed.length;
    S('CONSTRAINT_REGISTRY', reg.violations.length ? 'BLOCK' : evaluated > 0 || reg.unsupported.length ? 'EXECUTED' : 'SKIPPED',
      { registryVersion: reg.registryVersion, violations: reg.violations, warnings: reg.warnings, passed: reg.passed.map((p) => p.id), unsupported: reg.unsupported }, evaluated > 0 ? [] : ['structured-engineering-inputs']);
  } else {
    S('CONSTRAINT_REGISTRY', 'SKIPPED', {}, ['structured-engineering-inputs']);
  }

  // 6) CAPABILITY_CHECK — a gap is a WARN (can't validate here), not a kill.
  if (P.requiredCapabilities.length > 0) {
    const missing = P.requiredCapabilities.filter((c) => !capabilityResolver(c));
    missing.forEach((c) => capabilityGaps.push(c));
    if (missing.length) warnings.push('capability-gap');
    S('CAPABILITY_CHECK', missing.length ? 'WARN' : 'EXECUTED', { required: P.requiredCapabilities, missing });
  } else {
    S('CAPABILITY_CHECK', 'SKIPPED', {}, ['required-capabilities']);
  }

  // 7) NECROPOLIS_CHECK — tenant-scoped failure memory. In the product path a projectId
  //    is supplied and ONLY that tenant's regions are consulted (strict isolation).
  //    Mission-scoped lookup is kept for the internal cognitive path (backward compatible).
  if (db && P.parameterVector && P.context && (projectId || missionId)) {
    const region = projectId
      ? necro.assess(db, projectId, { context: P.context, parameterVector: P.parameterVector, scales: P.scales })
      : fk.assessRegion(db, missionId, { context: P.context, parameterVector: P.parameterVector, scales: P.scales });
    if (region.verdict === 'KNOWN_DEAD_END') { deadEnds.push(region); critical.push('matches a known dead-end region in this tenant\'s failure memory'); }
    else if (region.verdict === 'HIGH_FAILURE_SIMILARITY') { deadEnds.push(region); warnings.push('high-failure-similarity'); }
    S('NECROPOLIS_CHECK', region.verdict === 'KNOWN_DEAD_END' ? 'BLOCK' : region.verdict === 'HIGH_FAILURE_SIMILARITY' ? 'WARN' : 'EXECUTED', { region, scope: projectId ? 'tenant' : 'mission' });
  } else {
    S('NECROPOLIS_CHECK', 'SKIPPED', {}, ['parameter-vector+context+tenant']);
  }

  // 8) SPECULATIVE_PHYSICS_ADVERSARY
  if (P.speculativeClaims.length > 0 || P.challengesModel) {
    const assessed = P.speculativeClaims.map(sp.assessPhysicalClaim);
    assessed.forEach((a) => { speculative.push(a); if (a.status === 'CONTRADICTED') critical.push(`speculative claim contradicts known physics: ${a.claim}`); if (a.status === 'UNRESOLVED') warnings.push('unresolved-speculative-claim'); });
    let challenge = null;
    if (P.challengesModel) { challenge = sp.challengeModel(P.challengesModel); if (!challenge.admissible) warnings.push('inadmissible-model-challenge'); }
    S('SPECULATIVE_PHYSICS_ADVERSARY', assessed.some((a) => a.status === 'CONTRADICTED') ? 'BLOCK' : (assessed.length || challenge) ? 'EXECUTED' : 'SKIPPED', { assessed, challenge });
  } else {
    S('SPECULATIVE_PHYSICS_ADVERSARY', 'SKIPPED', {}, ['speculative-claims']);
  }

  // 9) IMPOSSIBILITY_TO_INVENTION
  if (P.target && P.requirements.length > 0) {
    const inv = sp.impossibilityToInvention({ target: P.target, requirements: P.requirements, nearestDescendant: proposal.nearestDescendant ?? null });
    if (inv.buildability === 'NOT_BUILDABLE_UNDER_CURRENT_MODEL') { critical.push(`not buildable under current model: ${inv.dominantBlocker}`); }
    else if (inv.buildability === 'UNRESOLVED') warnings.push('buildability-unresolved');
    S('IMPOSSIBILITY_TO_INVENTION', inv.buildability === 'NOT_BUILDABLE_UNDER_CURRENT_MODEL' ? 'BLOCK' : 'EXECUTED', { inv });
  } else {
    S('IMPOSSIBILITY_TO_INVENTION', 'SKIPPED', {}, ['target+requirements']);
  }

  // 10) EPISTEMIC_PRIORITY / CHEAPEST FALSIFICATION
  const falsification = cheapestFalsification({ unresolvedAssumptions, missingInfo, dimensionalInconsistencies, physicalViolations: [...physicalViolations, ...constraintViolations.map((c) => c.detail)], capabilityGaps });
  S('EPISTEMIC_PRIORITY', 'EXECUTED', { falsification });

  // 11) KILL-SWITCH DECISION
  // CLAIM_EXTRACTION/NORMALIZATION/EPISTEMIC_PRIORITY are preparatory bookkeeping, not
  // substantive scientific checks — extracting a hype sentence must NOT unlock a WARN/GO.
  const executed = stages.filter((s) => s.status === 'EXECUTED' && !['NORMALIZATION', 'CLAIM_EXTRACTION', 'EPISTEMIC_PRIORITY'].includes(s.stage));
  const substantive = executed.length;
  let decision;
  if (critical.length > 0) decision = KILL_SWITCH.BLOCK;
  else if (substantive === 0) decision = KILL_SWITCH.INSUFFICIENT_DATA;
  else if (warnings.length > 0 || missingInfo.length > 0) decision = KILL_SWITCH.WARN;
  else decision = KILL_SWITCH.GO;

  const applicable = stages.filter((s) => s.status !== 'SKIPPED' || s.missing.length > 0).length;
  const ran = stages.filter((s) => s.status === 'EXECUTED' || s.status === 'BLOCK' || s.status === 'WARN').length;
  const decisionStrength = +(ran / Math.max(1, applicable)).toFixed(3);

  const explanation = {
    decision, decisionStrength,
    criticalFailures: critical, unresolvedAssumptions, missingInformation: missingInfo,
    dimensionalInconsistencies, physicalConstraintViolations: physicalViolations,
    knownDeadEndSimilarities: deadEnds.map((d) => d.verdict ?? d), capabilityGaps, speculativeClaims: speculative,
    constraintViolations, unsupportedDomains,
    highestValueNextExperiment: falsification.recommendation ?? null,
    cheapestFalsificationTest: falsification.recommendation ?? null,
    recommendedEvidenceRequired: missingInfo,
    reasonsToKill: critical.length ? critical : (decision === KILL_SWITCH.INSUFFICIENT_DATA ? ['nothing checkable was supplied'] : []),
    reasonsNotToKill: [
      ...(dimensionalInconsistencies.length === 0 && eqs.length ? ['equations are dimensionally consistent'] : []),
      ...(physicalViolations.length === 0 && P.physicalConstraints.length ? ['no physical-constraint violation found'] : []),
      ...(deadEnds.length === 0 && P.parameterVector ? ['not near a known dead end'] : []),
    ],
    boundedClaim: 'Under the supplied assumptions, constraints, evidence, and currently encoded checks only — NOT a universal impossibility proof.',
  };

  // 12) CERTIFICATE (decisionHash reproducible; timestamp excluded)
  const enginesExecuted = stages.filter((s) => s.status === 'EXECUTED' || s.status === 'BLOCK' || s.status === 'WARN').map((s) => s.stage);
  const enginesSkipped = stages.filter((s) => s.status === 'SKIPPED').map((s) => ({ stage: s.stage, reason: `missing: ${s.missing.join(',') || 'n/a'}` }));
  const decisionCore = { schema: CERT_SCHEMA, engineVersions: ENGINE_VERSIONS, proposalHash, enginesExecuted, enginesSkipped, decision, criticalFindings: critical, recommendedNextAction: falsification.recommendation ?? null, explanation };
  const decisionHash = canonicalHash(decisionCore);
  const certificate = { ...decisionCore, decisionHash, provenance: { hashAlgo: 'sha256', reproducible: 'decisionHash is stable for identical canonical input + engine versions' } };

  if (db) store.saveTruthAnalysis(db, { proposalHash, projectId, decision, decisionHash, certificate });
  return { proposalHash, projectId, stages, decision: explanation, certificate };
}

/** Cheapest / highest-information next validation step (Phase D). Uses epistemic priority. */
export function cheapestFalsification({ unresolvedAssumptions = [], missingInfo = [], dimensionalInconsistencies = [], physicalViolations = [], capabilityGaps = [] }) {
  const actions = [];
  if (dimensionalInconsistencies.length) actions.push({ type: 'TEST_ASSUMPTION', target: `re-derive ${dimensionalInconsistencies[0]}`, expectedInfoGainProxy: 0.95, computeCost: 0, decisionRelevance: 1, reversibility: 1, riskOfInvalidInference: 0, testType: 'symbolic-rederivation', requiredInput: 'the intended equation + variable dimensions', costClass: 'trivial' });
  if (physicalViolations.length) actions.push({ type: 'TEST_ASSUMPTION', target: physicalViolations[0], expectedInfoGainProxy: 0.9, computeCost: 0.1, decisionRelevance: 1, reversibility: 1, riskOfInvalidInference: 0, testType: 'constraint-source-check', requiredInput: 'the physical principle the claim relies on', costClass: 'trivial' });
  if (unresolvedAssumptions.length) actions.push({ type: 'TEST_ASSUMPTION', target: unresolvedAssumptions[0], expectedInfoGainProxy: 0.6, computeCost: 0.2, decisionRelevance: 0.9, reversibility: 1, riskOfInvalidInference: 0.1, testType: 'assumption-elicitation', requiredInput: 'the operating regime + boundary conditions', costClass: 'cheap' });
  if (missingInfo.length) actions.push({ type: 'RETRIEVE_EVIDENCE', target: missingInfo[0], expectedInfoGainProxy: 0.5, computeCost: 0.3, decisionRelevance: 0.8, reversibility: 1, riskOfInvalidInference: 0.1, testType: 'specify-missing-field', requiredInput: missingInfo[0], costClass: 'cheap' });
  if (capabilityGaps.length) actions.push({ type: 'WAIT_FOR_RESOURCE', target: capabilityGaps[0], expectedInfoGainProxy: 0.4, computeCost: 1, decisionRelevance: 0.7, reversibility: 1, riskOfInvalidInference: 0.2, testType: 'acquire-capability-or-resource', requiredInput: `the engine/resource: ${capabilityGaps[0]}`, costClass: 'moderate' });
  if (actions.length === 0) return { recommendation: null, note: 'no cheaper falsification identified; proposal is checkable and clean under encoded checks' };
  const sel = fk.selectNextAction(actions);
  const a = sel.action;
  const needsExpert = a.type === 'WAIT_FOR_RESOURCE';
  return {
    recommendation: {
      targetAssumption: a.target, falsificationObjective: `invalidate the most expensive weak point: ${a.target}`,
      recommendedTestType: a.testType, requiredInput: a.requiredInput, expectedInformationGainProxy: a.expectedInfoGainProxy,
      relativeCostClass: a.costClass, priorityReason: sel.reason,
      stopCondition: 'the target is invalidated (kill) or fully specified (continue)',
      continuationCondition: 'the target survives the test and no other critical failure exists',
      ...(needsExpert ? { expertReviewRequested: true, note: 'exact experimental design is outside encoded capability — request domain-expert review' } : {}),
    },
    ranking: sel.ranking,
  };
}
