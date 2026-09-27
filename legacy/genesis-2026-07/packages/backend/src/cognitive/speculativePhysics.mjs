/**
 * Speculative Physics Adversary + Impossibility-to-Invention (Phase 4 — P/Q/R/S).
 *
 * These are NOT claims that fictional or alleged technologies exist. They are
 * adversarial tests of Genesis: a linguistic objection cannot overturn physics, and a
 * fictional device is not buildable just because it can be named. Every speculative
 * target is decomposed into physical requirements and each claim is classified against
 * known physics. The engine never claims a working time machine / reality gate / future
 * receiver; it separates MATHEMATICAL SOLUTION vs PHYSICAL POSSIBILITY vs EXPERIMENTAL
 * EVIDENCE, names the dominant blocker, and designs the nearest buildable descendant.
 *
 * Determinism: rule-based over a small, explicitly-labelled physics constraint table
 * (heuristic, not exhaustive). Nothing here is presented as a novel physical result.
 */
export const BUILDABILITY = Object.freeze({
  BUILDABLE_UNDER_KNOWN_PHYSICS: 'BUILDABLE_UNDER_KNOWN_PHYSICS',
  NOT_BUILDABLE_UNDER_CURRENT_MODEL: 'NOT_BUILDABLE_UNDER_CURRENT_MODEL',
  UNRESOLVED: 'UNRESOLVED', MISSING_PHYSICAL_MECHANISM: 'MISSING_PHYSICAL_MECHANISM',
  RESOURCE_INFEASIBLE: 'RESOURCE_INFEASIBLE', EXPERIMENTALLY_UNSUPPORTED: 'EXPERIMENTALLY_UNSUPPORTED',
});
export const CLAIM_STATUS = Object.freeze({ SUPPORTED: 'SUPPORTED', UNSUPPORTED: 'UNSUPPORTED', CONTRADICTED: 'CONTRADICTED', UNRESOLVED: 'UNRESOLVED' });

/** Small, explicit constraint table (heuristic). Each rule maps a physical requirement
 * to a status + the governing principle. NOT exhaustive; labelled as heuristic. */
const CONSTRAINTS = [
  { match: /faster.than.light|ftl|superluminal (signal|information)/i, status: CLAIM_STATUS.CONTRADICTED, principle: 'special relativity + causality (no superluminal information transfer)' },
  { match: /backward (information|matter) transfer|receive.*future|future information/i, status: CLAIM_STATUS.CONTRADICTED, principle: 'causality / no closed timelike curve realizable with known matter-energy' },
  { match: /forward time dilation|relativistic travel|gravitational time dilation/i, status: CLAIM_STATUS.SUPPORTED, principle: 'special/general relativity (experimentally confirmed)' },
  { match: /perpetual motion|over.?unity|free energy/i, status: CLAIM_STATUS.CONTRADICTED, principle: 'first/second law of thermodynamics' },
  { match: /teleport(ation)? of macroscopic|matter teleportation/i, status: CLAIM_STATUS.UNSUPPORTED, principle: 'no known mechanism for macroscopic matter transport; quantum teleportation moves state not matter' },
  { match: /invisibility|cloak/i, status: CLAIM_STATUS.SUPPORTED, principle: 'electromagnetic metamaterials / transformation optics (narrow-band, partial — active research)' },
  { match: /parallel (reality|world) (gate|travel|transfer)|inter.?world channel/i, status: CLAIM_STATUS.UNRESOLVED, principle: 'many-worlds decoherence forbids controllable inter-branch information channel under standard QM' },
];

/** Classify a physical claim against the constraint table. Unknown → UNRESOLVED (honest). */
export function assessPhysicalClaim(claimText) {
  const hit = CONSTRAINTS.find((c) => c.match.test(claimText));
  if (!hit) return { claim: claimText, status: CLAIM_STATUS.UNRESOLVED, principle: 'no matching known-physics constraint in the heuristic table; requires formal analysis' };
  return { claim: claimText, status: hit.status, principle: hit.principle };
}

/**
 * Impossibility-to-Invention: decompose a speculative target and return buildability +
 * dominant blocker + nearest buildable descendant + a falsifiable experiment.
 */
export function impossibilityToInvention({ target, requirements = [], nearestDescendant = null }) {
  const claims = requirements.map(assessPhysicalClaim);
  const contradicted = claims.filter((c) => c.status === CLAIM_STATUS.CONTRADICTED);
  const unresolved = claims.filter((c) => c.status === CLAIM_STATUS.UNRESOLVED);
  const supported = claims.filter((c) => c.status === CLAIM_STATUS.SUPPORTED);
  let buildability;
  if (contradicted.length > 0) buildability = BUILDABILITY.NOT_BUILDABLE_UNDER_CURRENT_MODEL;
  else if (unresolved.length > 0) buildability = BUILDABILITY.UNRESOLVED;
  else if (supported.length === claims.length && claims.length > 0) buildability = BUILDABILITY.BUILDABLE_UNDER_KNOWN_PHYSICS;
  else buildability = BUILDABILITY.MISSING_PHYSICAL_MECHANISM;
  const dominantBlocker = contradicted[0]?.principle ?? unresolved[0]?.principle ?? null;
  return {
    target, buildability, claims,
    dominantBlocker,
    nearestBuildableDescendant: nearestDescendant,
    falsifiableExperiment: buildability === BUILDABILITY.BUILDABLE_UNDER_KNOWN_PHYSICS
      ? 'construct and measure against the predicted observable'
      : 'no falsifiable build exists for the full target under current physics; test the nearest descendant instead',
  };
}

/** Fundamental Physics Adversary (P): a challenge to an established model is only valid
 * if it supplies a formal divergence + parameter region + alternative prediction +
 * falsifiable test. A linguistic objection is REJECTED (Einstein is not disproved). */
export function challengeModel({ model, formalDivergence = null, parameterRegion = null, alternativePrediction = null, falsifiableTest = null }) {
  const missing = [];
  if (!formalDivergence) missing.push('FORMAL_DIVERGENCE');
  if (!parameterRegion) missing.push('PARAMETER_REGION');
  if (!alternativePrediction) missing.push('ALTERNATIVE_PREDICTION');
  if (!falsifiableTest) missing.push('FALSIFIABLE_TEST');
  if (missing.length > 0) {
    return { model, admissible: false, verdict: 'REJECTED_LINGUISTIC_OBJECTION', missing, note: `a linguistic objection cannot overturn ${model}; supply the missing formal elements` };
  }
  return { model, admissible: true, verdict: 'ADMISSIBLE_FORMAL_CHALLENGE', note: 'challenge is formally admissible; run the falsifiable test to adjudicate (this is NOT a disproof)' };
}

/** Grandfather paradox (Q): separate the layers honestly. */
export function grandfatherParadox() {
  return {
    question: 'Does the grandfather paradox show time travel is inconsistent, or that a specific causal model is inconsistent?',
    mathematicalSolution: 'Novikov self-consistency and branching-history models are each mathematically consistent; the paradox refutes only the naive free-variable backward-causation model.',
    physicalPossibility: BUILDABILITY.EXPERIMENTALLY_UNSUPPORTED,
    physicalNote: 'closed timelike curves require exotic spacetime/negative energy densities with no experimental realization',
    experimentalEvidence: 'none',
    conclusion: 'The paradox demonstrates inconsistency of a SPECIFIC causal model, not of physics. No claim that time travel works.',
  };
}

/** Looking Glass (S4): distinguish a genuine future-information receiver from prediction,
 * and design Looking Glass Zero (the buildable descendant). */
export function lookingGlass() {
  const futureReceiver = assessPhysicalClaim('receive future information'); // CONTRADICTED
  return {
    futureInformationReceiver: { ...futureReceiver, buildability: BUILDABILITY.NOT_BUILDABLE_UNDER_CURRENT_MODEL },
    extremePredictionSystem: BUILDABILITY.BUILDABLE_UNDER_KNOWN_PHYSICS,
    quantumComputeRole: 'ACCELERATOR_ONLY', // quantum compute is not magic; not essential to prediction
    lookingGlassZero: {
      description: 'the closest buildable system: NOT a future-information receiver, a prediction system',
      architecture: ['REAL_TIME_TELEMETRY', 'STATE_ESTIMATION', 'CAUSAL_MODEL_ENSEMBLES', 'DIGITAL_TWINS', 'MONTE_CARLO_TRAJECTORIES', 'UNCERTAINTY_PROPAGATION', 'BRANCHING_FUTURE_TREE', 'COUNTERFACTUAL_SIMULATION', 'FORECAST_FAILURE_MEMORY'],
      honestyRule: 'prediction is labelled prediction — NEVER future information; forecasts carry uncertainty and a failure-memory record',
    },
  };
}
