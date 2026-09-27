/**
 * Target Hypothesis Intelligence + Funnel (Live Discovery Brain, Phases 4–5).
 *
 * Turns supplied evidence + target hypotheses into an explicit, versioned, component-scored
 * target funnel. No opaque "seems promising" ranking: every score exposes its components,
 * the evidence it rests on, and its uncertainty. The reasoning model may PROPOSE hypotheses,
 * but scoring here is DETERMINISTIC over real evidence and never overwrites measurements.
 *
 * The Truth Engine gate can WARN/BLOCK progression when evidence is insufficient or
 * contradictory — a target with no supporting evidence cannot silently proceed.
 */
import { canonicalHash } from '../provenance.mjs';
import * as te from './truthEngine.mjs';

export const SCORING_POLICY_VERSION = 'zefir-target-scoring/1';
export const TARGET_GATE = Object.freeze({ PROCEED: 'PROCEED', WARN: 'WARN', BLOCK: 'BLOCK' });

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Deterministic component scores in [0,1] for a target hypothesis given a claim registry
 * (claims with status + evidence). Components are explicit and preserved.
 */
export function scoreTarget(target, claimRegistry = []) {
  const claimsFor = claimRegistry.filter((c) => (target.claimIds ?? []).includes(c.claimId));
  const supported = claimsFor.filter((c) => c.status === 'SUPPORTED').length;
  const contested = claimsFor.filter((c) => c.status === 'CONTESTED').length;
  const contradicted = claimsFor.filter((c) => c.status === 'RETRACTED_OR_INVALIDATED').length;
  const totalSupportSources = claimsFor.reduce((n, c) => n + (c.supportingEvidenceIds?.length ?? 0), 0);

  const components = {
    evidenceSupport: clamp01(supported / 3),
    contradictionBurden: clamp01((contested + contradicted) / 3), // higher = worse
    mechanismCoherence: clamp01((target.mechanismRationale ? 0.5 : 0) + Math.min(0.5, supported * 0.25)),
    targetTractability: clamp01(target.tractability ?? (target.structureAvailable ? 0.6 : 0.3)),
    structuralDataAvailability: target.structureAvailable ? 1 : 0,
    chemicalMatterAvailability: clamp01(target.knownChemicalMatter ? 1 : 0),
    noveltyOpportunity: clamp01(target.noveltyOpportunity ?? 0.5),
    priorFailureBurden: clamp01(target.priorFailures ? Math.min(1, target.priorFailures / 3) : 0), // higher = worse
    capabilityCompatibility: clamp01(target.structureAvailable ? 0.8 : 0.4), // docking needs structure
    falsifiability: clamp01(target.cheapestFalsification ? 1 : 0.5),
    estimatedCampaignCost: clamp01(target.estimatedCost ?? 0.5), // higher = worse
  };
  // Weighted: reward support/coherence/tractability/falsifiability; penalise contradiction/failure/cost.
  const total =
    0.28 * components.evidenceSupport +
    0.14 * components.mechanismCoherence +
    0.12 * components.targetTractability +
    0.10 * components.structuralDataAvailability +
    0.08 * components.chemicalMatterAvailability +
    0.08 * components.falsifiability +
    0.06 * components.noveltyOpportunity +
    0.06 * components.capabilityCompatibility -
    0.10 * components.contradictionBurden -
    0.06 * components.priorFailureBurden -
    0.04 * components.estimatedCampaignCost;

  return {
    targetId: target.targetId ?? 'tgt_' + canonicalHash(target).slice(0, 12),
    targetName: target.targetName ?? null, targetType: target.targetType ?? null,
    mechanismHypothesis: target.mechanismRationale ?? null,
    evidenceFor: claimsFor.filter((c) => c.status === 'SUPPORTED').map((c) => c.claimId),
    evidenceAgainst: claimsFor.filter((c) => c.status === 'RETRACTED_OR_INVALIDATED' || c.status === 'CONTESTED').map((c) => c.claimId),
    supportingSourceCount: totalSupportSources,
    scoringPolicyVersion: SCORING_POLICY_VERSION,
    scoreComponents: components,
    totalPriorityScore: +total.toFixed(4),
    uncertainty: claimsFor.length === 0 ? 'high (no scored claims)' : contested > 0 ? 'elevated (contested evidence)' : 'moderate',
    cheapestFalsification: target.cheapestFalsification ?? 'acquire supporting genetic/structural evidence for the mechanism',
    epistemicStatus: supported > 0 ? 'EVIDENCE_LINKED' : 'HYPOTHESIS_ONLY',
  };
}

/** Rank targets by total priority; ties broken by evidence support then id (stable). */
export function rankTargets(targets, claimRegistry) {
  return targets.map((t) => scoreTarget(t, claimRegistry))
    .sort((a, b) => b.totalPriorityScore - a.totalPriorityScore || b.supportingSourceCount - a.supportingSourceCount || String(a.targetId).localeCompare(String(b.targetId)));
}

/**
 * Truth-Engine gate on a scored target. Builds a proposal from the target's evidence and lets
 * the kill-switch decide. No supporting evidence → INSUFFICIENT_DATA/WARN → do not proceed
 * silently. Contradiction present → WARN.
 */
export function gateTarget(scored) {
  const proposal = {
    problemStatement: `Proceed to a computational campaign on target ${scored.targetName ?? scored.targetId}`,
    claimedResult: scored.mechanismHypothesis ?? 'target is druggable for the stated mechanism',
    assumptions: scored.evidenceFor.length ? scored.evidenceFor.map((id) => `supported by ${id}`) : [],
  };
  // Truth Engine is consulted for a dimensional/physical contradiction in the mechanism claim
  // (recorded for provenance); the PROGRESSION gate keys off EVIDENCE, not the incidental
  // missing-equations WARN a bare target proposal produces.
  const decision = te.analyze(proposal).decision.decision;
  let gate;
  if (scored.evidenceFor.length === 0) gate = TARGET_GATE.BLOCK; // no supporting evidence → do not proceed
  else if (decision === 'BLOCK') gate = TARGET_GATE.BLOCK;       // a provable contradiction in the claim
  else if (scored.evidenceAgainst.length > 0) gate = TARGET_GATE.WARN; // contested/contradicted evidence
  else gate = TARGET_GATE.PROCEED;
  return { gate, truthEngineDecision: decision, reason: gate === TARGET_GATE.BLOCK ? (scored.evidenceFor.length === 0 ? 'no SUPPORTED claim backs this target — evidence-insufficient' : 'the mechanism claim is internally contradictory (Truth Engine BLOCK)') : gate === TARGET_GATE.WARN ? 'proceed with caution: contradictory or thin evidence' : 'supported by real evidence, no contradiction found under supplied assumptions' };
}

/** Build the full target funnel: ranked targets + gate on the leader. */
export function targetFunnel(targets, claimRegistry) {
  const ranked = rankTargets(targets, claimRegistry);
  const primary = ranked[0] ?? null;
  const gate = primary ? gateTarget(primary) : { gate: TARGET_GATE.BLOCK, reason: 'no target hypotheses supplied' };
  return { scoringPolicyVersion: SCORING_POLICY_VERSION, ranked, primaryTarget: primary, primaryGate: gate, alternatives: ranked.slice(1, 3) };
}
