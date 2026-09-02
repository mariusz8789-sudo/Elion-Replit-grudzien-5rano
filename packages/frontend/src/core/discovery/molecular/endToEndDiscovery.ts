import { admetLimitations, runAdmetBatch, withAdmetProperties, type AdmetBatchResult } from './admetProvider';
import type { AdmetTransport } from './admetTransport';
import {
  buildCandidateEpistemicState,
  summariseEpistemicStates,
  type CandidateEpistemicState,
  type EpistemicSummary,
} from './candidateEpistemicState';
import { bindResultsToCandidates, type ExperimentalResult, type ResultProvenanceKind } from './experimentalResult';
import { canonicalJson, fnv1a } from '../../events/hash';
import { compareToReferences, type ComparisonProfile, type ReferenceComparisonSet } from './referenceComparison';
import { falsifyBatch, type BatchFalsification } from './falsification';
import { rankMultiObjective, type MultiObjectiveResult, type Objective } from './multiObjective';
import { runMechanismPrerequisites, type MechanismPrerequisiteBatch, type MechanismPrerequisiteSet } from './mechanismPrerequisite';
import { rdkitSmartsEnumeratorProvider } from './enumeratorProviders';
import { runProviderMolecularDiscovery, type ProviderDiscoveryResult } from './providerDiscoveryRun';
import type { RdkitTransport } from './rdkitTransport';
import { screenBatch } from './screening';
import type { DiscoveryQuestion, MoleculeCandidate } from './types';

/**
 * GENESIS END-TO-END MOLECULAR DISCOVERY.
 *
 * QUESTION → REFERENCE IDENTITY → TARGET/MECHANISM → REFERENCE COMPARISON →
 * CANDIDATE GENERATION → RDKit VALIDATION → SCREENING → ADMET →
 * TARGET/MECHANISM FILTERING → FALSIFICATION → PARETO RANKING →
 * DOSSIER → NEXT EXPERIMENT.
 *
 * WHAT THIS MODULE IS, AND WHAT IT DELIBERATELY IS NOT:
 *
 * It is a SEAM, not a second engine. Generation, screening, falsification,
 * ranking, ADMET, similarity and provenance all already existed and are called
 * here unchanged. What did not exist was a path that carries GENERATED
 * candidates — molecules with no literature by construction — all the way
 * through target/mechanism filtering to a ranked, falsifiable, evidence-bound
 * result. That gap is what this closes.
 *
 * ORDER IS LOAD-BEARING:
 *
 *  1. The reference is resolved and compared BEFORE any candidate exists, so
 *     the requirements cannot be retrofitted to whatever gets generated.
 *  2. ADMET runs BEFORE mechanism filtering, because a CNS-exposure
 *     prerequisite needs the prediction to be on the candidate already.
 *  3. Mechanism filtering runs BEFORE ranking, so no candidate that cannot
 *     plausibly express the reference mechanism is ever ranked as if it could.
 *  4. Only candidates that survive every prior stage compete on the Pareto
 *     front, and the front is reported with the objectives it could not
 *     evaluate named.
 *
 * EVERY COUNT IN THE FUNNEL IS AN ARRAY LENGTH FROM A REAL STAGE. Nothing is
 * estimated, and a stage that produced zero reports zero.
 */
export const END_TO_END_DISCOVERY_VERSION = '1.0.0';

export interface EndToEndDiscoveryRequest {
  question: DiscoveryQuestion;
  /** The compound the campaign reasons from. Its structure is re-derived by RDKit, never trusted as given. */
  subject: ComparisonProfile;
  references: readonly ComparisonProfile[];
  /** Necessary structural/exposure conditions for the subject's mechanism to be extrapolable. */
  prerequisites: MechanismPrerequisiteSet;
  /** Reaction SMARTS ids the RDKit worker really implements. */
  transformations: readonly string[];
  depth: number;
  maxCandidates: number;
  objectives: readonly Objective[];
  /**
   * Measurements already known about these structures. They are attached to
   * candidates BEFORE mechanism filtering and ranking, so a real result can
   * actually change the outcome — binding them afterwards would make the loop
   * decorative.
   */
  ingestedResults?: readonly ExperimentalResult[];
}

export interface EndToEndDiscoveryEngines {
  rdkit: RdkitTransport;
  admet: AdmetTransport;
}

export interface ReferenceIdentity {
  name: string;
  declaredSmiles: string;
  expectedFormula: string;
  resolved: boolean;
  canonicalSmiles: string | null;
  molecularFormula: string | null;
  inchiKey: string | null;
  molecularWeight: number | null;
  /** CONFIRMED only when RDKit re-derived the declared formula from the declared structure. */
  formulaCrossCheck: 'CONFIRMED' | 'MISMATCH' | 'NOT_AVAILABLE';
  engine: string;
  reason: string;
}

/**
 * Resolves the reference compound through REAL RDKit and cross-checks the
 * formula it derives against the declared one. A mismatch is reported as a
 * mismatch and the campaign continues with the fact recorded — it is never
 * silently corrected in either direction.
 */
export function resolveReferenceIdentity(transport: RdkitTransport, profile: ComparisonProfile): ReferenceIdentity {
  const detected = transport.detect();
  const engine = detected.available ? detected.engine : `rdkit:unavailable:${transport.transportId}`;

  const base = {
    name: profile.compound,
    declaredSmiles: profile.smiles,
    expectedFormula: profile.expectedFormula,
    engine,
  };

  if (!detected.available) {
    return {
      ...base, resolved: false, canonicalSmiles: null, molecularFormula: null, inchiKey: null,
      molecularWeight: null, formulaCrossCheck: 'NOT_AVAILABLE', reason: detected.reason,
    };
  }

  const described = transport.describe(profile.smiles);
  if (!described.ok) {
    return {
      ...base, resolved: false, canonicalSmiles: null, molecularFormula: null, inchiKey: null,
      molecularWeight: null, formulaCrossCheck: 'NOT_AVAILABLE', reason: `${described.error}: ${described.reason}`,
    };
  }

  const molWt = described.data.values.molWt;
  return {
    ...base,
    resolved: true,
    canonicalSmiles: described.data.canonicalSmiles,
    molecularFormula: described.data.molecularFormula,
    inchiKey: described.data.inchiKey,
    molecularWeight: typeof molWt === 'number' ? molWt : null,
    formulaCrossCheck: described.data.molecularFormula === profile.expectedFormula ? 'CONFIRMED' : 'MISMATCH',
    reason: described.data.molecularFormula === profile.expectedFormula
      ? ''
      : `RDKit derived ${described.data.molecularFormula} from the declared structure, but the profile declared ${profile.expectedFormula}.`,
  };
}

/**
 * The funnel. Every field is the length of a real array produced by a real
 * stage of this run — see `runEndToEndDiscovery` for where each is taken.
 */
export interface DiscoveryFunnel {
  /**
   * Every structure the generator actually produced or touched, INCLUDING the
   * ones it threw away. Without this the funnel starts at "generated" and
   * silently hides duplicates, failed transforms and over-limit products —
   * i.e. it would not conserve.
   */
  attempted: number;
  /** Structures the generator discarded, with the reasons preserved separately. */
  discardedByGenerator: number;
  generated: number;
  rdkitValid: number;
  screeningRetained: number;
  screeningRejected: number;
  screeningNotResolved: number;
  admetEvaluable: number;
  mechanismNotExcluded: number;
  mechanismExcluded: number;
  mechanismUnevaluable: number;
  paretoFront: number;
  /**
   * True when every attempted structure is accounted for at every stage and
   * no stage exceeds the one above it. A false value is a real accounting bug
   * and is surfaced, never smoothed over.
   */
  conserved: boolean;
  conservationNotes: readonly string[];
}

/** Generator discard reasons, counted. Kept out of `generated` but never dropped. */
export interface GeneratorDiscards {
  total: number;
  byReason: Readonly<Record<string, number>>;
}

/**
 * Checks the funnel actually conserves. Each stage must account for exactly
 * the population handed to it — a candidate may not appear in two terminal
 * buckets, and may not disappear between stages.
 */
function checkConservation(funnel: Omit<DiscoveryFunnel, 'conserved' | 'conservationNotes'>): { conserved: boolean; notes: string[] } {
  const notes: string[] = [];

  if (funnel.attempted !== funnel.generated + funnel.discardedByGenerator) {
    notes.push(`attempted (${funnel.attempted}) != generated (${funnel.generated}) + discarded (${funnel.discardedByGenerator}).`);
  }
  const screened = funnel.screeningRetained + funnel.screeningRejected + funnel.screeningNotResolved;
  if (screened !== funnel.generated) {
    notes.push(`screening buckets (${screened}) do not account for all generated candidates (${funnel.generated}).`);
  }
  const mechanism = funnel.mechanismNotExcluded + funnel.mechanismExcluded + funnel.mechanismUnevaluable;
  if (mechanism !== funnel.screeningRetained) {
    notes.push(`mechanism buckets (${mechanism}) do not account for all screening survivors (${funnel.screeningRetained}).`);
  }
  if (funnel.paretoFront > funnel.mechanismNotExcluded) {
    notes.push(`Pareto front (${funnel.paretoFront}) exceeds the population it was computed over (${funnel.mechanismNotExcluded}).`);
  }
  if (funnel.rdkitValid > funnel.generated) {
    notes.push(`RDKit-valid (${funnel.rdkitValid}) exceeds generated (${funnel.generated}).`);
  }

  return { conserved: notes.length === 0, notes };
}

export interface CandidateOutcome {
  candidateId: string;
  formula: string;
  canonicalSmiles: string | null;
  parentFormula: string | null;
  transformation: string | null;
  /** The single stage that decided this candidate's fate. */
  stage: 'SCREENING' | 'MECHANISM_PREREQUISITE' | 'RANKING';
  retained: boolean;
  reason: string;
  onParetoFront: boolean;
}

export interface EndToEndDiscoveryResult {
  contractVersion: string;
  question: DiscoveryQuestion;
  referenceIdentity: ReferenceIdentity;
  referenceComparisons: ReferenceComparisonSet;
  discovery: ProviderDiscoveryResult;
  admet: AdmetBatchResult;
  /**
   * The candidates as they existed when they were filtered and ranked — i.e.
   * WITH their real ADMET predictions attached. `discovery.batch.candidates`
   * holds the pre-ADMET originals, so without this a reader could not inspect
   * the values that actually drove the mechanism filter and the Pareto front.
   */
  evaluatedCandidates: readonly MoleculeCandidate[];
  /** Measurements that bound to a candidate in this run, and those that did not. */
  boundResults: readonly { resultId: string; candidateId: string; kind: ResultProvenanceKind }[];
  unboundResults: readonly { resultId: string; reason: string }[];
  mechanism: MechanismPrerequisiteBatch;
  falsification: BatchFalsification;
  ranking: MultiObjectiveResult;
  funnel: DiscoveryFunnel;
  generatorDiscards: GeneratorDiscards;
  /** One per GENERATED candidate, rejected ones included. */
  epistemicStates: readonly CandidateEpistemicState[];
  epistemicSummary: EpistemicSummary;
  outcomes: readonly CandidateOutcome[];
  topCandidates: readonly CandidateOutcome[];
  limitations: readonly string[];
  resultFingerprint: string;
}

export function runEndToEndDiscovery(
  request: EndToEndDiscoveryRequest,
  engines: EndToEndDiscoveryEngines,
): EndToEndDiscoveryResult {
  // 1-2. REFERENCE IDENTITY, then REFERENCE COMPARISON — both before any
  // candidate exists, so requirements cannot be fitted to the results.
  const referenceIdentity = resolveReferenceIdentity(engines.rdkit, request.subject);
  const referenceComparisons = compareToReferences(engines.rdkit, request.subject, request.references);

  // 3. GENERATION + RDKit VALIDATION + SCREENING, through the existing loop.
  const provider = rdkitSmartsEnumeratorProvider(engines.rdkit);
  const discovery = runProviderMolecularDiscovery(
    request.question,
    provider,
    {
      seeds: [request.subject.smiles],
      transformations: request.transformations,
      depth: request.depth,
      maxCandidates: request.maxCandidates,
      constraints: request.question.constraints,
    },
    { validateCandidates: true, maxValidations: request.maxCandidates },
  );

  const generatedCandidates = discovery.batch.candidates;
  const retainedIds = new Set(discovery.assessments.filter((a) => a.verdict === 'RETAINED').map((a) => a.candidateId));
  const screeningSurvivors = generatedCandidates.filter((c) => retainedIds.has(c.candidateId));

  // 4. ADMET — real predictions, attached to the candidates that survived
  // screening. Candidates the model could not run on keep no ADMET value at
  // all rather than a placeholder.
  const admet = runAdmetBatch(engines.admet, screeningSurvivors, { maxCandidates: request.maxCandidates });
  const admetEnriched = withAdmetProperties(screeningSurvivors, admet);

  // MEASUREMENTS ENTER HERE — after prediction, before any filtering or
  // ranking. A measurement is bound only to the structure it was taken on
  // (by canonical SMILES) and becomes an ordinary property, so the existing
  // ranker treats it like any other value; there is no separate experimental
  // pathway that could be weighted or tuned.
  const binding = bindResultsToCandidates(admetEnriched, request.ingestedResults ?? []);
  const enriched = binding.enriched;

  // 5. TARGET / MECHANISM FILTERING — after ADMET, because exposure
  // prerequisites read predicted values off the candidate.
  const mechanism = runMechanismPrerequisites(engines.rdkit, enriched, request.prerequisites);
  const notExcluded = new Set(mechanism.notExcluded);
  const mechanismSurvivors = enriched.filter((c) => notExcluded.has(c.candidateId));

  // 6. FALSIFICATION over the survivors, against the same declared criteria.
  const survivorAssessments = screenBatch(
    { ...discovery.batch, candidates: mechanismSurvivors },
    request.question.constraints,
  );
  const falsification = falsifyBatch(mechanismSurvivors, survivorAssessments, request.question.constraints);

  // 7. PARETO RANKING — only over candidates that cleared every prior stage.
  const ranking = rankMultiObjective(mechanismSurvivors, survivorAssessments, request.objectives, request.question.constraints);

  const admetEvaluable = admet.available && admet.result !== null && admet.result.ok
    ? enriched.filter((c) => c.structure.canonicalSmiles !== null
      && admet.result !== null && admet.result.ok
      && admet.result.bySmiles[c.structure.canonicalSmiles] !== undefined).length
    : 0;

  const discardedByReason: Record<string, number> = {};
  for (const discard of discovery.batch.discarded) {
    // Reasons carry a payload after the first colon (a SMILES, a count); the
    // prefix is the actual category, so counts stay meaningful.
    const category = discard.reason.split(':')[0] ?? 'unknown';
    discardedByReason[category] = (discardedByReason[category] ?? 0) + 1;
  }
  const generatorDiscards: GeneratorDiscards = {
    total: discovery.batch.discarded.length,
    byReason: discardedByReason,
  };

  const rawFunnel = {
    attempted: generatedCandidates.length + discovery.batch.discarded.length,
    discardedByGenerator: discovery.batch.discarded.length,
    generated: generatedCandidates.length,
    rdkitValid: discovery.structuralValidation.filter((v) => v.valid === true).length,
    screeningRetained: screeningSurvivors.length,
    screeningRejected: discovery.assessments.filter((a) => a.verdict === 'REJECTED').length,
    screeningNotResolved: discovery.assessments.filter((a) => a.verdict === 'NOT_RESOLVED').length,
    admetEvaluable,
    mechanismNotExcluded: mechanism.notExcluded.length,
    mechanismExcluded: mechanism.excluded.length,
    mechanismUnevaluable: mechanism.unevaluable.length,
    paretoFront: ranking.ranked.filter((r) => r.onParetoFront).length,
  };

  const conservation = checkConservation(rawFunnel);
  const funnel: DiscoveryFunnel = { ...rawFunnel, conserved: conservation.conserved, conservationNotes: conservation.notes };

  const outcomes = buildOutcomes(generatedCandidates, discovery, mechanism, ranking);

  // PER-CANDIDATE EPISTEMIC STATE — built for EVERY generated candidate, not
  // only survivors, so a rejected candidate still carries a full account of
  // what was and was not established about it.
  const mechanismById = new Map(mechanism.reports.map((r) => [r.candidateId, r]));
  const outcomeById = new Map(outcomes.map((o) => [o.candidateId, o]));
  const epistemicStates = generatedCandidates.map((candidate) => {
    const outcome = outcomeById.get(candidate.candidateId);
    const enrichedCandidate = enriched.find((e) => e.candidateId === candidate.candidateId) ?? candidate;
    return buildCandidateEpistemicState(enrichedCandidate, mechanismById.get(candidate.candidateId), {
      excluded: outcome !== undefined && !outcome.retained && outcome.stage !== 'RANKING',
      exclusionReason: outcome?.reason ?? '',
    });
  });
  const epistemicSummary = summariseEpistemicStates(epistemicStates);
  const frontIds = new Set(ranking.ranked.filter((r) => r.onParetoFront).map((r) => r.candidateId));

  const resultFingerprint = fnv1a(canonicalJson({
    v: END_TO_END_DISCOVERY_VERSION,
    question: request.question.questionId,
    subject: request.subject.compound,
    discovery: discovery.resultFingerprint,
    boundResultIds: binding.bound.map((b) => b.resultId).sort(),
    mechanism: { notExcluded: [...mechanism.notExcluded].sort(), excluded: [...mechanism.excluded].sort() },
    front: [...frontIds].sort(),
  }));

  return {
    contractVersion: END_TO_END_DISCOVERY_VERSION,
    question: request.question,
    referenceIdentity,
    referenceComparisons,
    discovery,
    admet,
    evaluatedCandidates: enriched,
    boundResults: binding.bound,
    unboundResults: binding.unbound,
    mechanism,
    falsification,
    ranking,
    funnel,
    generatorDiscards,
    epistemicStates,
    epistemicSummary,
    outcomes,
    topCandidates: outcomes.filter((o) => o.onParetoFront),
    limitations: [
      ...mechanism.limitations,
      ...admetLimitations(admet),
      ranking.frontCaveat,
      epistemicSummary.headline,
      `Every candidate in this run was GENERATED by ${discovery.generationCapability.methodId} — a deterministic SMARTS enumerator, not a generative model and not a database search. None of them has any literature, any measured affinity, or any experimental record.`,
      'No candidate here has been shown to act at any target. The strongest statement this run supports about any candidate is that no declared prerequisite excluded it, and that its predicted properties sit on the Pareto front of the declared objectives.',
      'Nothing in this result is a claim of safety, efficacy, clinical equivalence to any reference compound, or fitness for human use.',
    ],
    resultFingerprint,
  };
}

function buildOutcomes(
  candidates: readonly MoleculeCandidate[],
  discovery: ProviderDiscoveryResult,
  mechanism: MechanismPrerequisiteBatch,
  ranking: MultiObjectiveResult,
): readonly CandidateOutcome[] {
  const assessmentById = new Map(discovery.assessments.map((a) => [a.candidateId, a]));
  const mechanismById = new Map(mechanism.reports.map((r) => [r.candidateId, r]));
  const rankedById = new Map(ranking.ranked.map((r) => [r.candidateId, r]));

  return candidates.map((candidate) => {
    const base = {
      candidateId: candidate.candidateId,
      formula: candidate.formula,
      canonicalSmiles: candidate.structure.canonicalSmiles,
      parentFormula: candidate.parentFormula,
      transformation: candidate.transformation,
    };

    const assessment = assessmentById.get(candidate.candidateId);
    if (assessment === undefined || assessment.verdict !== 'RETAINED') {
      const reason = assessment === undefined
        ? 'No screening assessment was produced for this candidate.'
        : assessment.verdict === 'REJECTED'
          ? `Rejected at screening: required criteria failed — ${assessment.failedRequired.join(', ')}.`
          : `Not resolvable at screening: required criteria had no value — ${assessment.unresolvedRequired.join(', ')}.`;
      return { ...base, stage: 'SCREENING' as const, retained: false, reason, onParetoFront: false };
    }

    const mechanismReport = mechanismById.get(candidate.candidateId);
    if (mechanismReport === undefined || mechanismReport.verdict !== 'NOT_EXCLUDED') {
      const reason = mechanismReport === undefined
        ? 'No mechanism prerequisite report was produced for this candidate.'
        : mechanismReport.verdict === 'EXCLUDED'
          ? `Excluded by mechanism prerequisite: ${mechanismReport.exclusionReasons.join(' ')}`
          : `Mechanism prerequisites could not be evaluated: ${mechanismReport.checks.map((c) => c.detail).join(' ')}`;
      return { ...base, stage: 'MECHANISM_PREREQUISITE' as const, retained: false, reason, onParetoFront: false };
    }

    const ranked = rankedById.get(candidate.candidateId);
    if (ranked === undefined) {
      return {
        ...base, stage: 'RANKING' as const, retained: false,
        reason: 'Cleared every filter but was not ranked — no ranking entry was produced.',
        onParetoFront: false,
      };
    }

    return {
      ...base,
      stage: 'RANKING' as const,
      retained: ranked.outcome === 'RETAINED',
      reason: ranked.justification,
      onParetoFront: ranked.onParetoFront,
    };
  });
}
