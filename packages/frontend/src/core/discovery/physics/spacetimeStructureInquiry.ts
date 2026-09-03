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
 * The three candidate positions this first pass holds up against the
 * registry. None assumes its own conclusion; each is checkable against the
 * same constraint table, and a fourth position could be added later without
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
      'The thermodynamic arrow of time is a universal, confirmed observation.',
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
