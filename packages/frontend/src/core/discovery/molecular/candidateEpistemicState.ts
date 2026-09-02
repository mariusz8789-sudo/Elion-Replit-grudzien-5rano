import type { MoleculeCandidate, MoleculeProperty, PropertyStatus } from './types';
import type { MechanismPrerequisiteReport } from './mechanismPrerequisite';

/**
 * CANDIDATE EPISTEMIC STATE — the machine-readable answer to five questions
 * about ONE candidate:
 *
 *   WHAT DOES GENESIS KNOW?        (experimentally verified / literature)
 *   WHAT DID GENESIS COMPUTE?      (a real engine derived it from structure)
 *   WHAT DOES GENESIS PREDICT?     (a model produced it; it is not a fact)
 *   WHAT WAS DECLARED TO GENESIS?  (an input, not a finding)
 *   WHAT DOES GENESIS NOT KNOW?    (requires an engine, or an experiment)
 *
 * These are kept apart because collapsing them is the specific failure this
 * engine exists to avoid. A model prediction is not a computation; a
 * computation is not a measurement; a measurement in a cell line is not a
 * fact about a person. `PropertyStatus` already encodes the distinction
 * per property — this module rolls it up per CANDIDATE so a reader (or a
 * downstream ranker) can ask "what is actually established about this
 * molecule?" and get a complete, non-overlapping answer.
 *
 * THE SECOND THING THIS MODULE FIXES IS MORE IMPORTANT.
 *
 * A candidate can pass every filter in the pipeline without a single piece of
 * evidence in its favour — it passes because nothing ruled it out. Those are
 * not the same situation, and reporting them identically is how an empty
 * result starts to look like a positive one. `SurvivalBasis` separates them,
 * and for a freshly enumerated molecule the honest verdict is almost always
 * `SURVIVED_ON_ABSENCE_OF_EVIDENCE`.
 *
 * ABSENCE OF EVIDENCE IS NOT EVIDENCE. This module is where that is enforced
 * rather than merely stated in a comment.
 */
export const CANDIDATE_EPISTEMIC_STATE_VERSION = '1.0.0';

/**
 * How a single fact about a candidate came to be believed. Ordered strongest
 * to weakest; `EXPERIMENTALLY_VERIFIED` exists in the vocabulary but NOTHING
 * in this runtime can produce it — no wet-lab result has been ingested for any
 * generated candidate — so it is expected to stay empty, and that emptiness is
 * itself a reported fact rather than a gap in the type.
 */
export type EpistemicClass =
  | 'EXPERIMENTALLY_VERIFIED'
  | 'LITERATURE_SUPPORTED'
  | 'COMPUTED'
  | 'PREDICTED'
  | 'DECLARED_INPUT'
  | 'REQUIRES_EXTERNAL_ENGINE'
  | 'REQUIRES_EXPERIMENT'
  | 'NOT_AVAILABLE';

/**
 * Total, explicit mapping from the property-level status vocabulary. Every
 * `PropertyStatus` has exactly one epistemic class, so no status can slip
 * through unclassified — the compiler enforces completeness.
 */
const CLASS_BY_STATUS: Readonly<Record<PropertyStatus, EpistemicClass>> = {
  ACTUAL_SOURCE: 'LITERATURE_SUPPORTED',
  COMPUTED: 'COMPUTED',
  MODEL_PREDICTION: 'PREDICTED',
  USER_SUPPLIED: 'DECLARED_INPUT',
  TEST_FIXTURE: 'DECLARED_INPUT',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  REQUIRES_EXTERNAL_ENGINE: 'REQUIRES_EXTERNAL_ENGINE',
  REQUIRES_EXPERIMENT: 'REQUIRES_EXPERIMENT',
};

export function epistemicClassOf(status: PropertyStatus): EpistemicClass {
  return CLASS_BY_STATUS[status];
}

export interface EpistemicFact {
  propertyId: string;
  epistemicClass: EpistemicClass;
  value: number | null;
  unit: string;
  /** The engine or source that produced it; null when nothing did. */
  provenance: string | null;
}

/**
 * Why a claim about a candidate stands. `ABSENCE_OF_EVIDENCE` is a
 * first-class value, NOT a synonym for negative evidence and NOT a weak form
 * of positive evidence — it records that nobody has looked.
 */
export type EvidencePolarity = 'POSITIVE_EVIDENCE' | 'NEGATIVE_EVIDENCE' | 'ABSENCE_OF_EVIDENCE';

export interface EvidenceLedgerEntry {
  claim: string;
  polarity: EvidencePolarity;
  basis: string;
}

/**
 * Why a candidate is still in the running after every filter.
 *
 * The distinction between the last two is the scientific point of this whole
 * module: passing a necessary-condition filter is not support.
 */
export type SurvivalBasis =
  | 'EXCLUDED'
  | 'SUPPORTED_BY_POSITIVE_EVIDENCE'
  | 'SURVIVED_ON_ABSENCE_OF_EVIDENCE'
  | 'UNEVALUABLE';

export interface CandidateEpistemicState {
  candidateId: string;
  /** Facts by class. Every property lands in exactly one of these. */
  experimentallyVerified: readonly EpistemicFact[];
  literatureSupported: readonly EpistemicFact[];
  computed: readonly EpistemicFact[];
  predicted: readonly EpistemicFact[];
  declaredInput: readonly EpistemicFact[];
  unknown: readonly EpistemicFact[];
  evidenceLedger: readonly EvidenceLedgerEntry[];
  survivalBasis: SurvivalBasis;
  /** One sentence a person can read, stating exactly what standing this candidate has. */
  standing: string;
}

function toFact(property: MoleculeProperty): EpistemicFact {
  return {
    propertyId: property.propertyId,
    epistemicClass: epistemicClassOf(property.status),
    value: property.value,
    unit: property.unit,
    provenance: property.engine,
  };
}

/**
 * Builds the epistemic state for one candidate.
 *
 * `mechanismReport` is optional because a candidate rejected before the
 * mechanism stage never got one — and that absence is itself represented
 * (`UNEVALUABLE`), never silently treated as a pass.
 */
export function buildCandidateEpistemicState(
  candidate: MoleculeCandidate,
  mechanismReport: MechanismPrerequisiteReport | undefined,
  options: { excluded: boolean; exclusionReason: string },
): CandidateEpistemicState {
  const facts = candidate.properties.map(toFact);
  const byClass = (target: EpistemicClass) => facts.filter((f) => f.epistemicClass === target);

  const unknown = facts.filter((f) =>
    f.epistemicClass === 'REQUIRES_EXPERIMENT'
    || f.epistemicClass === 'REQUIRES_EXTERNAL_ENGINE'
    || f.epistemicClass === 'NOT_AVAILABLE');

  const literatureSupported = byClass('LITERATURE_SUPPORTED');
  const experimentallyVerified = byClass('EXPERIMENTALLY_VERIFIED');
  const predicted = byClass('PREDICTED');
  const computed = byClass('COMPUTED');

  const ledger: EvidenceLedgerEntry[] = [];

  // Structural existence is the one thing a real engine positively established.
  if (candidate.structure.canonicalSmiles !== null && candidate.structure.engine !== null) {
    ledger.push({
      claim: 'This candidate is a chemically valid structure.',
      polarity: 'POSITIVE_EVIDENCE',
      basis: `Canonicalised and sanitised by ${candidate.structure.engine}.`,
    });
  }

  for (const fact of predicted) {
    ledger.push({
      claim: `Predicted ${fact.propertyId} = ${fact.value ?? 'NOT_AVAILABLE'}${fact.unit ? ` ${fact.unit}` : ''}.`,
      polarity: 'ABSENCE_OF_EVIDENCE',
      basis: `Model output from ${fact.provenance ?? 'an unnamed model'}. A prediction is not a measurement, and no measurement of this endpoint exists for this candidate.`,
    });
  }

  if (mechanismReport === undefined) {
    ledger.push({
      claim: 'Mechanism prerequisites for this candidate.',
      polarity: 'ABSENCE_OF_EVIDENCE',
      basis: 'The candidate was decided before the mechanism stage, so no prerequisite was ever tested on it.',
    });
  } else {
    for (const check of mechanismReport.checks) {
      ledger.push({
        claim: `Mechanism prerequisite "${check.prerequisiteId}".`,
        polarity: check.status === 'FAILED'
          ? 'NEGATIVE_EVIDENCE'
          // A MET prerequisite is a necessary condition satisfied. It is not
          // evidence FOR activity, so it is never POSITIVE_EVIDENCE here.
          : 'ABSENCE_OF_EVIDENCE',
        basis: check.status === 'MET'
          ? `Necessary condition satisfied, which excludes nothing and establishes nothing: ${check.detail}`
          : check.detail,
      });
    }
  }

  // Target affinity: the central unknown, stated explicitly for every candidate
  // rather than left to be inferred from a missing property.
  ledger.push({
    claim: 'Binding affinity or functional activity at any target.',
    polarity: 'ABSENCE_OF_EVIDENCE',
    basis: 'No assay has been run on this candidate and no validated predictor for this target is connected to this runtime. REQUIRES_EXPERIMENT.',
  });

  const hasPositive = ledger.some((e) => e.polarity === 'POSITIVE_EVIDENCE'
    && !e.claim.startsWith('This candidate is a chemically valid structure'));
  const hasBiologicalPositive = literatureSupported.length > 0 || experimentallyVerified.length > 0;

  let survivalBasis: SurvivalBasis;
  let standing: string;

  if (options.excluded) {
    survivalBasis = 'EXCLUDED';
    standing = `Excluded: ${options.exclusionReason}`;
  } else if (mechanismReport !== undefined && mechanismReport.verdict === 'UNEVALUABLE') {
    survivalBasis = 'UNEVALUABLE';
    standing = 'Could not be evaluated against the declared prerequisites, so it is untested rather than cleared.';
  } else if (hasBiologicalPositive || hasPositive) {
    survivalBasis = 'SUPPORTED_BY_POSITIVE_EVIDENCE';
    standing = `Carries ${literatureSupported.length} literature-supported and ${experimentallyVerified.length} experimentally verified fact(s) about its biological behaviour.`;
  } else {
    survivalBasis = 'SURVIVED_ON_ABSENCE_OF_EVIDENCE';
    standing =
      'Still in the running only because nothing ruled it out. There is no positive evidence of biological activity for this candidate — '
      + `${computed.length} computed and ${predicted.length} predicted propert(ies), zero measurements, zero literature. `
      + 'Absence of evidence is not evidence.';
  }

  return {
    candidateId: candidate.candidateId,
    experimentallyVerified,
    literatureSupported,
    computed,
    predicted,
    declaredInput: byClass('DECLARED_INPUT'),
    unknown,
    evidenceLedger: ledger,
    survivalBasis,
    standing,
  };
}

export interface EpistemicSummary {
  totalCandidates: number;
  supportedByPositiveEvidence: number;
  survivedOnAbsenceOfEvidence: number;
  excluded: number;
  unevaluable: number;
  /** Counts of facts across the whole batch, by class. */
  factsByClass: Readonly<Record<EpistemicClass, number>>;
  /** The blunt one-line summary of what the batch actually establishes. */
  headline: string;
}

export function summariseEpistemicStates(states: readonly CandidateEpistemicState[]): EpistemicSummary {
  const factsByClass: Record<EpistemicClass, number> = {
    EXPERIMENTALLY_VERIFIED: 0,
    LITERATURE_SUPPORTED: 0,
    COMPUTED: 0,
    PREDICTED: 0,
    DECLARED_INPUT: 0,
    REQUIRES_EXTERNAL_ENGINE: 0,
    REQUIRES_EXPERIMENT: 0,
    NOT_AVAILABLE: 0,
  };

  for (const state of states) {
    for (const group of [state.experimentallyVerified, state.literatureSupported, state.computed, state.predicted, state.declaredInput, state.unknown]) {
      for (const fact of group) factsByClass[fact.epistemicClass]++;
    }
  }

  const supported = states.filter((s) => s.survivalBasis === 'SUPPORTED_BY_POSITIVE_EVIDENCE').length;
  const absence = states.filter((s) => s.survivalBasis === 'SURVIVED_ON_ABSENCE_OF_EVIDENCE').length;

  return {
    totalCandidates: states.length,
    supportedByPositiveEvidence: supported,
    survivedOnAbsenceOfEvidence: absence,
    excluded: states.filter((s) => s.survivalBasis === 'EXCLUDED').length,
    unevaluable: states.filter((s) => s.survivalBasis === 'UNEVALUABLE').length,
    factsByClass,
    headline: supported === 0
      ? `None of the ${states.length} candidate(s) is supported by positive biological evidence. ${absence} survived only because nothing excluded them, and ${factsByClass.EXPERIMENTALLY_VERIFIED} measurement(s) exist across the entire batch.`
      : `${supported} of ${states.length} candidate(s) carry positive biological evidence; ${absence} survived only on absence of evidence.`,
  };
}
