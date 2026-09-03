/**
 * SPACETIME STRUCTURE INQUIRY — infrastructure for the temporal/spacetime
 * research direction, not a theory.
 *
 * THE QUESTION THIS MODULE SERVES (translated from the mission brief): "Do
 * the known equations of physics require or permit an additional degree of
 * freedom / dimension that would coherently link the past, present, and
 * future?" This module does NOT answer that question — it builds the
 * machinery so Genesis can hold named candidate positions on it up against a
 * registry of REAL, citable, established-physics constraints and report each
 * position's honest status: consistent with confirmed observation, merely
 * speculative, contradicted by fact, or genuinely unresolved.
 *
 * THREE ASSUMPTIONS THIS MODULE IS FORBIDDEN FROM MAKING, ENFORCED IN CODE
 * (not just in prose) by `registerSpacetimeHypothesis` throwing on any
 * candidate that sets one of these flags:
 *   - that a "fifth dimension" exists,
 *   - that travel to the past is physically possible,
 *   - that Einstein and Rosen "missed" something in their original work.
 * A hypothesis is free to EXPLORE these ideas as a stated possibility to be
 * checked, but never to ASSERT them as a starting premise — a starting
 * premise is exactly what the mission brief prohibits.
 *
 * THE CONSTRAINT REGISTRY is the honest core: every entry is a real,
 * independently checkable historical/physics fact, theory, or named
 * conjecture, each carrying its own epistemic status and source. Hypotheses
 * are evaluated purely by their declared logical relationship to these
 * constraints — never by free-text inference, so the reasoning is always
 * traceable to a specific, citable line.
 */
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';

export const SPACETIME_STRUCTURE_INQUIRY_VERSION = '1.0.0';

export type ConstraintStatus = 'FACT' | 'THEORY' | 'CONJECTURE';

export interface EstablishedPhysicsConstraint {
  constraintId: string;
  statement: string;
  status: ConstraintStatus;
  source: string;
}

/**
 * Real, citable constraints only. FACT = experimentally confirmed or a
 * direct mathematical property of a named, published solution. THEORY = a
 * proposed extension to established physics, not drawn from confirmed data.
 * CONJECTURE = a named, published hypothesis about unresolved physics that
 * is neither proven nor disproven.
 */
export const ESTABLISHED_SPACETIME_CONSTRAINTS: readonly EstablishedPhysicsConstraint[] = [
  {
    constraintId: 'GR_4D_SUFFICIENT_FOR_CONFIRMED_OBSERVATIONS',
    statement: 'Every experimentally confirmed test of gravity to date (perihelion precession, gravitational lensing, GPS relativistic corrections, LIGO/Virgo gravitational-wave observations) is quantitatively consistent with standard 3+1-dimensional general relativity; none requires an additional spacetime dimension to explain.',
    status: 'FACT',
    source: 'Standard general-relativity literature; LIGO/Virgo waveform-consistency analyses of detected gravitational-wave events.',
  },
  {
    constraintId: 'NO_CONFIRMED_DETECTION_OF_EXTRA_DIMENSIONS',
    statement: 'Dedicated searches for additional spatial dimensions — sub-millimeter tests of the Newtonian inverse-square law, and collider searches for missing-energy signatures consistent with Kaluza-Klein graviton production — have not produced a confirmed detection.',
    status: 'FACT',
    source: 'Short-range gravity torsion-balance experiments (e.g. Eot-Wash group); LHC extra-dimension search literature (ATLAS/CMS missing-transverse-energy analyses).',
  },
  {
    constraintId: 'EXTRA_DIMENSIONS_ARE_THEORETICAL_PROPOSAL',
    statement: 'Additional spacetime dimensions appear as a feature of specific theoretical frameworks (Kaluza-Klein unification, string/M-theory\'s dimensional requirements, braneworld models) proposed to extend established physics, not as a conclusion drawn from confirmed data.',
    status: 'THEORY',
    source: 'Kaluza (1921); Klein (1926); string/M-theory literature.',
  },
  {
    constraintId: 'CTC_SOLUTIONS_EXIST_MATHEMATICALLY',
    statement: 'Certain exact solutions of the Einstein field equations admit closed timelike curves: Godel\'s rotating-universe solution (1949), van Stockum\'s rotating dust cylinder (1937), and Tipler\'s infinite rotating cylinder (1974).',
    status: 'FACT',
    source: 'Godel, K. (1949) Rev. Mod. Phys. 21, 447; van Stockum, W.J. (1937) Proc. R. Soc. Edinb. 57, 135; Tipler, F.J. (1974) Phys. Rev. D 9, 2203.',
  },
  {
    constraintId: 'CTC_SOLUTIONS_REQUIRE_UNPHYSICAL_CONDITIONS',
    statement: 'The known CTC-admitting exact solutions require conditions not observed in nature: an eternally, uniformly rotating cosmological matter distribution (Godel), or an infinite, unbounded rotating mass-energy configuration (Tipler cylinder). Analyses of the realistic, finite-cylinder case have not established that CTCs form.',
    status: 'FACT',
    source: 'Tipler, F.J. (1974) Phys. Rev. D 9, 2203; subsequent finite-cylinder analyses in the general-relativity literature.',
  },
  {
    constraintId: 'CHRONOLOGY_PROTECTION_IS_CONJECTURE',
    statement: 'Hawking\'s chronology protection conjecture proposes that quantum field-theoretic effects (divergent vacuum fluctuations near a would-be CTC) prevent closed timelike curves from forming, but this remains an unproven conjecture, not a theorem derived from a complete theory of quantum gravity.',
    status: 'CONJECTURE',
    source: 'Hawking, S.W. (1992) Phys. Rev. D 46, 603.',
  },
  {
    constraintId: 'TRAVERSABLE_WORMHOLES_REQUIRE_EXOTIC_MATTER',
    statement: 'Morris-Thorne traversable wormhole solutions require a stress-energy distribution that violates the null energy condition ("exotic matter"); no macroscopic, stable source of such matter is known to exist.',
    status: 'FACT',
    source: 'Morris, M.S. and Thorne, K.S. (1988) Am. J. Phys. 56, 395.',
  },
  {
    constraintId: 'ARROW_OF_TIME_ORIGIN_OPEN',
    statement: 'The thermodynamic arrow of time (entropy increase, second law) is a universally observed fact, but why the early universe had anomalously low entropy — the boundary condition that gives the arrow its direction — is an open cosmological question addressed by competing, unconfirmed theoretical proposals.',
    status: 'THEORY',
    source: 'Penrose, R. — the Weyl curvature hypothesis, as one proposed (unconfirmed) resolution; general cosmology literature on the "past hypothesis".',
  },
  {
    constraintId: 'WORMHOLE_SOLUTIONS_EXIST_MATHEMATICALLY',
    statement: 'The maximally extended Schwarzschild solution (the Einstein-Rosen bridge, 1935) mathematically connects two asymptotic regions of spacetime, and Morris-Thorne (1988) constructed static, spherically symmetric solutions of the Einstein field equations that are, in principle, traversable.',
    status: 'FACT',
    source: 'Einstein, A. and Rosen, N. (1935) Phys. Rev. 48, 73; Morris, M.S. and Thorne, K.S. (1988) Am. J. Phys. 56, 395.',
  },
  {
    constraintId: 'NO_CONFIRMED_QUANTUM_GRAVITY_THEORY',
    statement: 'No candidate theory of quantum gravity (e.g. loop quantum gravity, string/M-theory, causal set theory) has been experimentally confirmed or is uniquely selected by data; reconciling general relativity with quantum mechanics remains an open problem in fundamental physics.',
    status: 'FACT',
    source: 'Standard physics literature surveying the problem of quantum gravity (e.g. Rovelli, C. — Quantum Gravity, 2004; Wald, R.M. — General Relativity, 1984, ch. on open problems).',
  },
];

export type ConstraintRelation = 'SUPPORTS' | 'CONTRADICTS' | 'DEPENDS_ON_UNRESOLVED';

export interface ConstraintDependency {
  constraintId: string;
  relation: ConstraintRelation;
}

export interface SpacetimeHypothesisCandidate {
  hypothesisId: string;
  statement: string;
  dependencies: readonly ConstraintDependency[];
  /** Must be false. Set true only to demonstrate the guard rejects it. */
  assertsExtraDimensionExists: boolean;
  /** Must be false. Set true only to demonstrate the guard rejects it. */
  assertsTimeTravelIsPhysicallyPossible: boolean;
  /** Must be false. Set true only to demonstrate the guard rejects it. */
  claimsEinsteinRosenOmission: boolean;
  /** Real, citable results (by constraint id or direct citation) that support this hypothesis, stated plainly. */
  knownSupportingResults: readonly string[];
  /** Real, citable results that count against this hypothesis, if any. Empty when none is known — never omitted to look stronger. */
  counterevidence: readonly string[];
  /** Known unphysical or pathological conditions this hypothesis's supporting solutions require, stated honestly rather than glossed over. */
  pathologicalOrUnphysicalRequirements: readonly string[];
  /** What remains genuinely open even if every dependency here is accepted. */
  unresolvedPoints: readonly string[];
  /** What this hypothesis, if true, would predict — stated as consequences, not as additional claims of fact. */
  predictedConsequences: readonly string[];
  /** The single clearest observation that would weaken or falsify this hypothesis. */
  falsifyingObservation: string;
  /** The experiment or computation that would best discriminate this hypothesis from its competitors. */
  discriminatingTest: string;
}

/**
 * The structural enforcement of the mission's three forbidden premises, plus
 * a referential-integrity check on declared constraint IDs. This is what
 * makes "don't assume X" a property the code cannot violate, not a
 * convention a future edit could quietly break.
 */
export function registerSpacetimeHypothesis(candidate: SpacetimeHypothesisCandidate): SpacetimeHypothesisCandidate {
  if (candidate.assertsExtraDimensionExists) {
    throw new Error(`Hypothesis "${candidate.hypothesisId}" asserts a fifth dimension exists as a premise. This engine may test that idea, never assume it.`);
  }
  if (candidate.assertsTimeTravelIsPhysicallyPossible) {
    throw new Error(`Hypothesis "${candidate.hypothesisId}" asserts time travel is physically possible as a premise. This engine may test that idea, never assume it.`);
  }
  if (candidate.claimsEinsteinRosenOmission) {
    throw new Error(`Hypothesis "${candidate.hypothesisId}" claims Einstein and Rosen omitted something. This engine does not assume prior physics missed something as a premise.`);
  }
  for (const dep of candidate.dependencies) {
    if (!ESTABLISHED_SPACETIME_CONSTRAINTS.some((c) => c.constraintId === dep.constraintId)) {
      throw new Error(`Hypothesis "${candidate.hypothesisId}" depends on unknown constraint "${dep.constraintId}". Declare it in ESTABLISHED_SPACETIME_CONSTRAINTS first — no undeclared physics.`);
    }
  }
  return candidate;
}

export type SpacetimeHypothesisVerdict =
  | 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS'
  | 'SPECULATIVE_NOT_EXCLUDED'
  | 'CONTRADICTS_ESTABLISHED_PHYSICS'
  | 'UNRESOLVED_OPEN_QUESTION';

export interface SpacetimeHypothesisEvaluation {
  hypothesisId: string;
  verdict: SpacetimeHypothesisVerdict;
  reasoning: string;
}

/**
 * Deterministic, constraint-table-driven classification — never free-text
 * inference. Priority order: a CONTRADICTS relation to a FACT is decisive
 * (falsified); next, any dependency whose relation is explicitly
 * DEPENDS_ON_UNRESOLVED or whose constraint is itself a CONJECTURE makes the
 * hypothesis's truth genuinely unresolved; next, resting on a THEORY-level
 * constraint (with no contradiction) is speculative but not excluded;
 * otherwise the hypothesis is supported only by confirmed facts.
 */
export function evaluateSpacetimeHypothesis(candidate: SpacetimeHypothesisCandidate): SpacetimeHypothesisEvaluation {
  const resolved = candidate.dependencies.map((dep) => {
    const constraint = ESTABLISHED_SPACETIME_CONSTRAINTS.find((c) => c.constraintId === dep.constraintId);
    if (!constraint) throw new Error(`Unknown constraint "${dep.constraintId}" — this should have been caught by registerSpacetimeHypothesis.`);
    return { dep, constraint };
  });

  const contradicted = resolved.filter((r) => r.dep.relation === 'CONTRADICTS' && r.constraint.status === 'FACT');
  if (contradicted.length > 0) {
    return {
      hypothesisId: candidate.hypothesisId,
      verdict: 'CONTRADICTS_ESTABLISHED_PHYSICS',
      reasoning: `Contradicts established fact(s): ${contradicted.map((r) => r.constraint.constraintId).join(', ')}.`,
    };
  }

  const unresolved = resolved.find((r) => r.dep.relation === 'DEPENDS_ON_UNRESOLVED' || r.constraint.status === 'CONJECTURE');
  if (unresolved) {
    return {
      hypothesisId: candidate.hypothesisId,
      verdict: 'UNRESOLVED_OPEN_QUESTION',
      reasoning: `Its truth hinges on "${unresolved.constraint.constraintId}", a ${unresolved.constraint.status.toLowerCase()}, not an established fact: "${unresolved.constraint.statement}"`,
    };
  }

  const theoryDependencies = resolved.filter((r) => r.constraint.status === 'THEORY');
  if (theoryDependencies.length > 0) {
    return {
      hypothesisId: candidate.hypothesisId,
      verdict: 'SPECULATIVE_NOT_EXCLUDED',
      reasoning: `Rests on theoretical, unconfirmed proposals: ${theoryDependencies.map((r) => r.constraint.constraintId).join(', ')}. Not contradicted by any confirmed fact, but not required by one either.`,
    };
  }

  return {
    hypothesisId: candidate.hypothesisId,
    verdict: 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS',
    reasoning: `Supported only by confirmed facts: ${resolved.map((r) => r.constraint.constraintId).join(', ')}.`,
  };
}

/**
 * The five candidate positions this pass holds up against the registry —
 * spanning the range the mission asked for (sufficiency of standard
 * spacetime, CTC solutions, wormhole traversability, extra-DOF proposals,
 * and the open reconciliation of causal structure/gravity/QM/the arrow of
 * time). None assumes its own conclusion; each is checkable against the
 * same constraint table, and a sixth position could be added later without
 * touching this evaluator.
 */
export const SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES: readonly SpacetimeHypothesisCandidate[] = [
  registerSpacetimeHypothesis({
    hypothesisId: 'H_NO_EXTRA_DOF_REQUIRED',
    statement: 'Standard 3+1-dimensional general relativity and quantum field theory, with no additional degree of freedom, are sufficient to account for every experimentally confirmed observation of gravity and spacetime structure to date.',
    dependencies: [
      { constraintId: 'GR_4D_SUFFICIENT_FOR_CONFIRMED_OBSERVATIONS', relation: 'SUPPORTS' },
      { constraintId: 'NO_CONFIRMED_DETECTION_OF_EXTRA_DIMENSIONS', relation: 'SUPPORTS' },
    ],
    assertsExtraDimensionExists: false,
    assertsTimeTravelIsPhysicallyPossible: false,
    claimsEinsteinRosenOmission: false,
    knownSupportingResults: [
      'Every confirmed gravitational-wave detection (LIGO/Virgo) is quantitatively consistent with standard 4D GR waveforms.',
      'Solar-system and binary-pulsar tests of GR (perihelion precession, Shapiro delay, pulsar timing) show no confirmed deviation attributable to an extra dimension.',
    ],
    counterevidence: [],
    pathologicalOrUnphysicalRequirements: [],
    unresolvedPoints: [
      'Absence of a confirmed detection is not a proof of absence; a sufficiently small or weakly coupled extra dimension could remain undetected at current experimental sensitivity.',
    ],
    predictedConsequences: [
      'Continued null results in short-range gravity tests and collider missing-energy searches as sensitivity improves.',
    ],
    falsifyingObservation: 'A confirmed, reproducible detection of a deviation from 4D GR/QFT predictions attributable to an additional spacetime dimension.',
    discriminatingTest: 'Sub-millimeter torsion-balance tests of the Newtonian inverse-square law at ever-smaller length scales.',
  }),
  registerSpacetimeHypothesis({
    hypothesisId: 'H_EXTRA_DOF_THEORETICALLY_POSSIBLE_NOT_CONFIRMED',
    statement: 'Some theoretical frameworks (Kaluza-Klein unification, string/M-theory, braneworld models) propose additional, typically compactified, dimensions that could in principle supply a further degree of freedom, but no confirmed experiment requires or has detected one.',
    dependencies: [
      { constraintId: 'EXTRA_DIMENSIONS_ARE_THEORETICAL_PROPOSAL', relation: 'SUPPORTS' },
      { constraintId: 'NO_CONFIRMED_DETECTION_OF_EXTRA_DIMENSIONS', relation: 'SUPPORTS' },
    ],
    assertsExtraDimensionExists: false,
    assertsTimeTravelIsPhysicallyPossible: false,
    claimsEinsteinRosenOmission: false,
    knownSupportingResults: [
      'Kaluza-Klein theory (1921/1926) shows a 5D general-relativistic framework can reproduce 4D gravity plus electromagnetism, as an existence proof that extra dimensions are mathematically consistent, not that nature uses one.',
      'String/M-theory requires additional dimensions for mathematical consistency (typically 10 or 11 total) in its own formalism.',
    ],
    counterevidence: [
      'No collider or astrophysical missing-energy signature consistent with Kaluza-Klein graviton production has been confirmed.',
    ],
    pathologicalOrUnphysicalRequirements: [
      'Compactification to an unobserved extra dimension requires a specific, currently unconstrained compactification scale and mechanism — a free parameter, not a prediction.',
    ],
    unresolvedPoints: [
      'No experiment currently distinguishes between "no extra dimension" and "an extra dimension too small or weakly coupled to have been detected yet".',
    ],
    predictedConsequences: [
      'If realized at an accessible scale, would predict deviations from the inverse-square law at that scale, and Kaluza-Klein excitations of known particles at colliders.',
    ],
    falsifyingObservation: 'This hypothesis is not falsified by absence of evidence; it would be substantially disfavoured by a confirmed null result across all currently proposed compactification scales, without ever being fully excluded for arbitrarily small scales.',
    discriminatingTest: 'LHC (or a future higher-energy collider) missing-transverse-energy searches for Kaluza-Klein graviton production, combined with continued short-range gravity tests.',
  }),
  registerSpacetimeHypothesis({
    hypothesisId: 'H_CHRONOLOGY_PROTECTION_HOLDS',
    statement: 'Nature forbids the physical formation of closed timelike curves via quantum chronology-protection effects, so causality violation is never realized even though certain classical general-relativity solutions admit closed timelike curves mathematically.',
    dependencies: [
      { constraintId: 'CTC_SOLUTIONS_EXIST_MATHEMATICALLY', relation: 'SUPPORTS' },
      { constraintId: 'CTC_SOLUTIONS_REQUIRE_UNPHYSICAL_CONDITIONS', relation: 'SUPPORTS' },
      { constraintId: 'CHRONOLOGY_PROTECTION_IS_CONJECTURE', relation: 'DEPENDS_ON_UNRESOLVED' },
    ],
    assertsExtraDimensionExists: false,
    assertsTimeTravelIsPhysicallyPossible: false,
    claimsEinsteinRosenOmission: false,
    knownSupportingResults: [
      'No closed timelike curve has ever been observed in nature.',
      'Every known exact CTC-admitting solution requires a condition not observed in nature (eternal uniform rotation of all matter in the universe, or an infinite, unbounded rotating mass).',
    ],
    counterevidence: [
      'Godel (1949), van Stockum (1937) and Tipler (1974) show CTCs are not excluded by the Einstein field equations themselves — the prohibition, if real, must come from something beyond classical GR.',
    ],
    pathologicalOrUnphysicalRequirements: [
      'The Godel solution requires the entire universe to be filled with a uniformly rotating dust and is not a model of the observed (non-rotating, expanding) universe.',
      'The Tipler cylinder requires an infinite length; realistic finite-cylinder analyses have not established that CTCs form.',
    ],
    unresolvedPoints: [
      'Hawking\'s chronology protection conjecture has never been proven or disproven from a complete theory of quantum gravity, which does not yet exist (see NO_CONFIRMED_QUANTUM_GRAVITY_THEORY).',
    ],
    predictedConsequences: [
      'If chronology protection holds, any attempt to engineer conditions approaching a CTC should encounter divergent quantum vacuum-fluctuation effects that prevent it, per Hawking\'s original argument.',
    ],
    falsifyingObservation: 'A theoretically consistent, complete quantum-gravity calculation showing vacuum fluctuations do NOT diverge near a would-be CTC, or (far beyond current capability) direct observation of causality violation.',
    discriminatingTest: 'No experiment currently exists at this energy/curvature regime; the discriminating test is theoretical — a completed theory of quantum gravity capable of evaluating vacuum-fluctuation behaviour near a closed causal curve.',
  }),
  registerSpacetimeHypothesis({
    hypothesisId: 'H_WORMHOLE_GEOMETRY_MATHEMATICALLY_POSSIBLE_NOT_TRAVERSABLE_IN_PRACTICE',
    statement: 'Wormhole geometries (the Einstein-Rosen bridge; Morris-Thorne traversable solutions) can mathematically connect distant regions of spacetime within general relativity, but physical traversability requires exotic matter violating the null energy condition, which is not known to exist in the macroscopic, stable form the solutions require.',
    dependencies: [
      { constraintId: 'WORMHOLE_SOLUTIONS_EXIST_MATHEMATICALLY', relation: 'SUPPORTS' },
      { constraintId: 'TRAVERSABLE_WORMHOLES_REQUIRE_EXOTIC_MATTER', relation: 'SUPPORTS' },
    ],
    assertsExtraDimensionExists: false,
    assertsTimeTravelIsPhysicallyPossible: false,
    claimsEinsteinRosenOmission: false,
    knownSupportingResults: [
      'The maximally extended Schwarzschild solution is an exact, well-studied solution of the Einstein field equations.',
      'Morris-Thorne (1988) is a peer-reviewed, mathematically consistent traversable-wormhole solution, explicitly constructed to make the exotic-matter requirement precise and quantifiable.',
    ],
    counterevidence: [],
    pathologicalOrUnphysicalRequirements: [
      'The original Einstein-Rosen/Schwarzschild bridge is non-traversable: it pinches off before any observer could cross it.',
      'Morris-Thorne traversability requires a stress-energy distribution violating the null energy condition, with no known macroscopic, stable source.',
    ],
    unresolvedPoints: [
      'Whether any physical mechanism (quantum effects, e.g. Casimir-like negative energy densities) could ever supply exotic matter in the required macroscopic, stable, non-perturbative form is unresolved.',
    ],
    predictedConsequences: [
      'If a stable macroscopic exotic-matter source were ever found, Morris-Thorne-type geometries provide a concrete, falsifiable target for what a traversable wormhole would have to look like.',
    ],
    falsifyingObservation: 'This hypothesis, as stated, would be falsified only by showing the null-energy-condition requirement itself is wrong for these solutions — a mathematical, not observational, check that has already been extensively verified in the literature; it is not currently in question.',
    discriminatingTest: 'No observational test exists at this stage; the open question is theoretical — whether any known or new quantum field can source the required negative-energy stress tensor macroscopically and stably.',
  }),
  registerSpacetimeHypothesis({
    hypothesisId: 'H_DEEPER_RECONCILING_MODEL_UNRESOLVED',
    statement: 'A deeper model reconciling causal structure, gravity, quantum theory and the thermodynamic arrow of time may exist, but no such model is currently confirmed, uniquely selected by data, or even uniquely proposed — this names an open research direction, not a candidate theory.',
    dependencies: [
      { constraintId: 'NO_CONFIRMED_QUANTUM_GRAVITY_THEORY', relation: 'DEPENDS_ON_UNRESOLVED' },
      { constraintId: 'ARROW_OF_TIME_ORIGIN_OPEN', relation: 'DEPENDS_ON_UNRESOLVED' },
    ],
    assertsExtraDimensionExists: false,
    assertsTimeTravelIsPhysicallyPossible: false,
    claimsEinsteinRosenOmission: false,
    knownSupportingResults: [
      'Multiple independent open problems (quantum gravity, the origin of the arrow of time, the interpretation of quantum measurement in relativistic settings) are each individually well documented as unresolved in the physics literature.',
    ],
    counterevidence: [],
    pathologicalOrUnphysicalRequirements: [],
    unresolvedPoints: [
      'No candidate quantum-gravity theory is experimentally confirmed.',
      'The origin of the universe\'s low initial entropy (and thus the arrow of time\'s direction) has no confirmed resolution.',
      'Whether these open problems are even connected by a single deeper structure, as opposed to being independent open problems, is itself unresolved.',
    ],
    predictedConsequences: [
      'None can be honestly stated: this hypothesis names a research direction, not a model with computable predictions.',
    ],
    falsifyingObservation: 'Not applicable in its current form — a hypothesis with no specific proposed structure cannot be falsified; it can only be superseded once a specific candidate model is proposed and THAT model is tested.',
    discriminatingTest: 'None currently exists; the actionable next step is theoretical model-building, not observation — see the NEXT ACTION this inquiry proposes.',
  }),
];

export interface SpacetimeStructureInquiryResult {
  contractVersion: string;
  question: string;
  constraints: readonly EstablishedPhysicsConstraint[];
  evaluations: readonly SpacetimeHypothesisEvaluation[];
  fact: readonly string[];
  theory: readonly string[];
  assumptions: readonly string[];
  overallConclusion: string;
  distinguishingObservations: readonly string[];
  resultFingerprint: string;
}

function fingerprintOf(input: Record<string, string>): string {
  const json = JSON.stringify(input, Object.keys(input).sort());
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function runSpacetimeStructureInquiry(): SpacetimeStructureInquiryResult {
  const evaluations = SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES.map(evaluateSpacetimeHypothesis);

  const fingerprintInput: Record<string, string> = {};
  for (const e of evaluations) fingerprintInput[e.hypothesisId] = `${e.verdict}|${e.reasoning}`;

  return {
    contractVersion: SPACETIME_STRUCTURE_INQUIRY_VERSION,
    question: 'Do the known equations of physics require or permit an additional degree of freedom / dimension that would coherently link the past, present, and future?',
    constraints: ESTABLISHED_SPACETIME_CONSTRAINTS,
    evaluations,
    fact: [
      'General relativity and quantum field theory in 3+1 dimensions account for every gravitational and spacetime observation confirmed to date.',
      'No experiment has confirmed an additional spacetime dimension.',
      'Certain exact GR solutions (Godel, van Stockum, Tipler) admit closed timelike curves mathematically, under conditions not observed in nature.',
      'The maximally extended Schwarzschild solution and Morris-Thorne solutions mathematically connect distant spacetime regions; traversability requires exotic matter not known to exist macroscopically and stably.',
      'The thermodynamic arrow of time is a universal, confirmed observation.',
      'No candidate theory of quantum gravity is experimentally confirmed.',
    ],
    theory: [
      'Extra-dimensional frameworks (Kaluza-Klein, string/M-theory, braneworld models) are proposed extensions to established physics, not conclusions drawn from confirmed data.',
      'The physical origin of the universe\'s low-entropy initial condition is addressed by competing, unconfirmed theoretical proposals.',
    ],
    assumptions: [
      'This inquiry does not itself perform new physics; it classifies named, published positions against a fixed, declared constraint table. A position not yet named here is simply not yet evaluated, not refuted.',
      'The constraint table is deliberately small and conservative for this first pass; extending it (e.g. with quantum-gravity candidate theories) is future work, not a limitation hidden from the result.',
    ],
    overallConclusion:
      'No known, experimentally confirmed physics currently requires an additional spacetime degree of freedom; standard 3+1-dimensional GR/QFT remains sufficient for every confirmed observation. Extra-dimensional proposals remain theoretically motivated but experimentally unconfirmed. Whether closed timelike curves are fundamentally forbidden (chronology protection) is an open conjecture, not a proven fact. This module draws no conclusion beyond what its declared constraints support, and asserts neither that a fifth dimension exists nor that time travel is possible.',
    distinguishingObservations: [
      'Continued sub-millimeter tests of the Newtonian inverse-square law: a deviation at a specific length scale would be evidence for a compactified extra dimension of that size.',
      'Collider searches for missing-transverse-energy signatures consistent with Kaluza-Klein graviton production, at increasing energy reach.',
      'Gravitational-wave polarization content: standard 4D GR predicts exactly two tensor polarizations; confirmed detection of additional polarization modes would be evidence for extended gravity theories (including some higher-dimensional ones).',
      'A working theory of quantum gravity that either proves or disproves Hawking\'s chronology protection conjecture from first principles, which does not yet exist.',
      'Any theoretical or experimental progress toward a macroscopic, stable exotic-matter source, which would move wormhole traversability from "mathematically defined but unmet requirement" to an actual candidate physical scenario.',
    ],
    resultFingerprint: fingerprintOf(fingerprintInput),
  };
}

export function replaySpacetimeStructureInquiry(saved: SpacetimeStructureInquiryResult): { status: 'MATCH' | 'DRIFT'; reason: string } {
  const recomputed = runSpacetimeStructureInquiry();
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: 'Recomputing the same constraint table and hypothesis set produced different verdicts — a constraint or an evaluation rule changed since the run was saved.' };
  }
  return { status: 'MATCH', reason: '' };
}

export function saveSpacetimeStructureInquiryToMemory(result: SpacetimeStructureInquiryResult): SavedExperiment {
  return saveExperiment({
    labId: 'physics-spacetime-structure-inquiry',
    experimentId: `spacetime-dof-inquiry:${result.resultFingerprint}`,
    experimentName: 'Spacetime degree-of-freedom inquiry — competing positions vs established physics',
    params: {
      constraintCount: result.constraints.length,
      hypothesisCount: result.evaluations.length,
    },
    stats: {
      consistentCount: result.evaluations.filter((e) => e.verdict === 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS').length,
      speculativeCount: result.evaluations.filter((e) => e.verdict === 'SPECULATIVE_NOT_EXCLUDED').length,
      contradictedCount: result.evaluations.filter((e) => e.verdict === 'CONTRADICTS_ESTABLISHED_PHYSICS').length,
      unresolvedCount: result.evaluations.filter((e) => e.verdict === 'UNRESOLVED_OPEN_QUESTION').length,
    },
    analysis: [
      { title: 'Question', kind: 'question', body: result.question },
      ...result.evaluations.map((e) => ({ title: e.hypothesisId, kind: 'hypothesis', body: `${e.verdict} — ${e.reasoning}` })),
      { title: 'Overall conclusion', kind: 'conclusion', body: result.overallConclusion },
      { title: 'Distinguishing observations', kind: 'next-experiment', body: result.distinguishingObservations.join(' | ') },
    ],
    honesty: 'simplified',
    honestyNote:
      'Every constraint is a real, cited, published fact, theory, or named conjecture. Hypotheses are classified purely by their declared logical relationship to that fixed table — never by free-text inference. '
      + 'This inquiry asserts neither that a fifth dimension exists, nor that time travel is possible, nor that Einstein and Rosen omitted anything from their original work.',
    epistemicStatus: `CONSISTENT=${result.evaluations.filter((e) => e.verdict === 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS').length};SPECULATIVE=${result.evaluations.filter((e) => e.verdict === 'SPECULATIVE_NOT_EXCLUDED').length};UNRESOLVED=${result.evaluations.filter((e) => e.verdict === 'UNRESOLVED_OPEN_QUESTION').length}`,
    assumptions: [...result.assumptions],
  });
}
