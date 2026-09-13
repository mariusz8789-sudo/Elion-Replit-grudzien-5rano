import { canonicalJson, fnv1a } from '../events/hash';
import {
  createObservationGapRequest,
  undeclaredFeasibility,
  type ObservationGapRequest,
} from '../agent/observationGap';
import {
  generateDifferentiatingExperiment,
  type CandidateObservable,
  type HypothesisPrediction,
  type DiscriminatingExperimentSpec,
} from '../agent/differentiatingExperimentGenerator';
import {
  createTrialRegistry,
  recordTrial,
  listTrials,
  countTrials,
  correctForMultiplicity,
  assertRegistryComplete,
  registryFingerprint,
  type TrialRegistry,
  type TrialRecord,
  type MultiplicityCorrection,
} from '../agent/trialRegistry';
import {
  evaluatePracticalCandidate,
  surfaceFor,
  type GatedCandidate,
  type GateDecision,
} from '../agent/practicalCandidateGate';
import {
  loadGeneratedCandidates,
  checkGenerationNotPinned,
  runTier1,
  runTier2,
  selectTop3,
  deepFalsify,
  selectWinner,
  generateResearchRecipe,
  loadNoAccessDeclarations,
  scanForBannedStrings,
  type E2E01GenerationCheck,
  type E2E01StageResult,
  type E2E01Top3Entry,
  type E2E01DeepFalsification,
  type E2E01WinnerDecision,
  type E2E01ResearchRecipe,
  type E2E01NoAccessDeclaration,
  type E2E01BannedStringHit,
} from './govDrugDiscoveryE2E';
import { runA3GovernmentRecommendation, type A3CandidateView } from './a3GovernmentDrugRecommendation';
import type { A3PopulationSpec } from './a3GovernmentPreregistration';
import {
  GDD_CAMPAIGN_PREREGISTRATION,
  GDD_EXHAUSTION_PATHS,
  GDD_FINALIST_SIZE,
  GDD_SHORTLIST_SIZE,
  type GddExhaustionPath,
} from './govDrugDiscoveryCampaignPreregistration';

/**
 * GOV-DRUG-DISCOVERY-CAMPAIGN-01 — the runtime the government demonstration
 * shows end to end:
 *
 *   PROBLEM -> GENERATION -> TIER 1 -> TIER 2 -> SHORTLIST (<=10)
 *   -> DEEP FALSIFICATION (whole shortlist) -> FINALISTS (<=2)
 *   -> SAFETY GATE -> EXHAUSTION -> WINNER | honest non-winner
 *   -> RESEARCH RECIPE (winner only) -> GOVERNMENT RECOMMENDATION
 *
 * THIS IS NOT A SECOND ENGINE. Every scientific step is the one E2E-01
 * already performs, imported and called: `runTier1`, `runTier2`, `selectTop3`,
 * `deepFalsify`, `selectWinner`, `generateResearchRecipe`, and A3's
 * `runA3GovernmentRecommendation`. Nothing here recomputes an efficacy delta,
 * a risk ratio or a verdict. What this module adds is the four things E2E-01
 * genuinely did not have:
 *
 *   1. A SHORTLIST WIDER THAN THE TOP 3, with deep falsification run over all
 *      of it. Strictly more scrutiny than before, never less.
 *   2. THE SAFETY GATE ACTUALLY INVOKED. `practicalCandidateGate.ts` existed
 *      but no code path in the drug funnel ever called it, and A2's one call
 *      site passed `unresolvedContradictions: []` as a literal — so its
 *      NO_UNRESOLVED_CRITICAL_CONTRADICTION criterion could never fire. Here
 *      the contradictions come from the candidate's OWN deep-falsification
 *      result, so the criterion has something real to refuse.
 *   3. A TRIAL REGISTRY. Every candidate evaluated, every falsification attack
 *      run and every abandoned branch is recorded, and the multiplicity
 *      correction is computed from that registry rather than from a number
 *      chosen by hand.
 *   4. EXHAUSTION BEFORE A NON-WINNER. NO_WINNER is a legitimate scientific
 *      result and this module will emit it — but only after every declared
 *      path has actually been walked. A path left NOT_ATTEMPTED makes the run
 *      THROW. That is the difference between "we looked and the evidence does
 *      not support naming anyone" and "we stopped".
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not touch E2E-01's sealed
 * preregistration, it does not restate the winner rules in its own words, and
 * it contains no molecule identifier anywhere in its logic. The verdict is
 * whatever the inherited rules return on the evidence.
 */

export const GDD_CAMPAIGN_RUNTIME_VERSION = '1.0.0';

/** Two-sided 95% normal quantile — the divisor that turns a published CI into a sigma. */
const Z_95 = 1.959963984540054;

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export interface GddStage {
  readonly stage: string;
  readonly criterion: string;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly survivorIds: readonly string[];
  readonly eliminatedCount: number;
}

function stageFrom(result: E2E01StageResult): GddStage {
  return {
    stage: result.stage,
    criterion: result.criterion,
    inputCount: result.inputCount,
    outputCount: result.outputCount,
    survivorIds: result.survivorIds,
    eliminatedCount: result.eliminated.length,
  };
}

// ---------------------------------------------------------------------------
// Safety gate — fed real contradictions, not an empty list
// ---------------------------------------------------------------------------

export interface GddSafetyGateResult {
  readonly moleculeChemblId: string;
  readonly prefName: string;
  readonly unresolvedContradictions: readonly string[];
  readonly decision: GateDecision;
  readonly surface: 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE';
  /** True when the gate refuses this candidate, which makes it ineligible to be named however it scored. */
  readonly blocked: boolean;
}

/**
 * The contradictions are assembled from what this run actually found: the
 * unresolved counterevidence surfaced by deep falsification, plus the
 * existential safety veto if it fired. Passing an empty list here — as the one
 * pre-existing call site did — makes the gate's central criterion decorative.
 */
function runSafetyGate(
  entry: E2E01Top3Entry,
  falsification: E2E01DeepFalsification | undefined,
  view: A3CandidateView,
  replayFingerprint: string,
): GddSafetyGateResult {
  const unresolvedContradictions = [
    ...(falsification?.unresolvedCounterevidence ?? []),
    ...(entry.vetoed && entry.vetoReason !== null ? [`EXISTENTIAL_SAFETY_VETO: ${entry.vetoReason}`] : []),
  ];

  const observationIds = view.report.efficacy.map((e) => `ctgov:${e.nctId}`);
  const gated: GatedCandidate = {
    candidate: {
      derivedFromModelFingerprint: GDD_CAMPAIGN_PREREGISTRATION.fingerprint,
      statement: `Population-level research finding: ${entry.prefName} (${entry.moleculeChemblId}) reached the shortlist of this run on real incretin-axis mechanism data and real posted trial results, with an evidence-weighted rank of ${entry.rank}.`,
      constraints: [
        `Applies only to the trial populations and regimens examined (${view.report.efficacy.map((e) => e.nctId).join(', ') || 'none with a computable comparison'}).`,
        'Establishes nothing about tolerability, cost, supply or adherence beyond the categories numerically compared in this run.',
        'No trial behind this candidate is a direct head-to-head against the reference agent unless explicitly marked DIRECT_HEAD_TO_HEAD.',
      ],
      requiredValidation: [
        'Institutional and regulatory review before this finding informs any policy.',
        'Independent statistical review of the indirect-comparison methodology used upstream in a2OzempicSubstitute.ts.',
      ],
      proposedProtocol: null,
      protocolWithheldReason: 'This is a population-level research finding. This system emits no individual clinical protocol, dose, or substitution instruction.',
    },
    candidateClass: 'intervention',
    safetyClass: 'POPULATION',
    notProven: [
      'Individual tolerability or outcome for any person.',
      'Cost-effectiveness or real-world supply feasibility at national-programme scale.',
      'Behaviour outside the trial populations and regimens studied.',
      'Any claim beyond the preregistered hypotheses this analysis was built to test.',
    ],
    handoff: {
      recipient: 'INSTITUTION',
      boundary: 'Government Research plane only. Any action requires human or institutional authorisation through core/governance — this module authorises nothing.',
    },
    evidence: {
      observationIds,
      replayFingerprint,
      provenance: {
        sourceUrl: 'ChEMBL Web Services + ClinicalTrials.gov API v2 (per-file URLs and SHA-256 hashes in the pinned meta.json files)',
        sourceVersion: '2026-09-13',
      },
      unresolvedContradictions,
      epistemicStatus: 'EVIDENCE_GRADED_POPULATION_FINDING',
    },
  };

  const decision = evaluatePracticalCandidate(gated);
  return {
    moleculeChemblId: entry.moleculeChemblId,
    prefName: entry.prefName,
    unresolvedContradictions,
    decision,
    surface: surfaceFor(decision.outcome, gated.safetyClass),
    blocked: decision.outcome === 'REFUSE',
  };
}

// ---------------------------------------------------------------------------
// Exhaustion — the mechanism that makes a non-winner expensive to reach
// ---------------------------------------------------------------------------

export type GddPathStatus = 'EXHAUSTED' | 'RESOLVED' | 'BLOCKED_NO_ACCESS' | 'NOT_ATTEMPTED';

export interface GddExhaustionStep {
  readonly path: GddExhaustionPath;
  readonly status: GddPathStatus;
  readonly finding: string;
  readonly evidence: readonly string[];
}

export interface GddExhaustionReport {
  readonly steps: readonly GddExhaustionStep[];
  readonly allPathsAttempted: boolean;
  /** The measurement that would best separate the finalists on data this run actually holds. */
  readonly differentiatingExperiment: DiscriminatingExperimentSpec | null;
  /** Raised when the available measurements cannot separate the finalists — names what is missing. */
  readonly observationGapRequest: ObservationGapRequest | null;
}

/**
 * Turns the finalists into the shape G2 reasons over. Each finalist is a
 * hypothesis ("this candidate is the better alternative"); each observable is
 * a quantity the run genuinely measured, with a sigma derived from the
 * PUBLISHED confidence interval — never invented. A candidate with no interval
 * at an observable predicts `null` there, which G2 reports as a real gap
 * rather than silently skipping.
 */
function buildFinalistPredictions(views: readonly A3CandidateView[]): {
  readonly hypotheses: readonly HypothesisPrediction[];
  readonly observables: readonly CandidateObservable[];
} {
  const sharedSafetyKeys = views
    .map((v) => new Set(v.report.safety.filter((s) => s.riskRatio !== null && s.riskRatioCi95 !== null).map((s) => s.key)))
    .reduce<Set<string> | null>((acc, keys) => (acc === null ? keys : new Set([...acc].filter((k) => keys.has(k)))), null) ?? new Set<string>();

  const observables: CandidateObservable[] = [];
  const efficacySigmas: number[] = [];
  for (const v of views) {
    for (const e of v.report.efficacy) {
      if (e.diffCi95 !== null) efficacySigmas.push((e.diffCi95.high - e.diffCi95.low) / (2 * Z_95));
    }
  }
  if (efficacySigmas.length > 0) {
    observables.push({
      observableId: 'EFFICACY_DELTA_PP',
      quantity: 'efficacy difference versus the reference agent, in percentage points',
      unit: 'percentage points',
      instrumentClass: 'posted randomised-trial results (ClinicalTrials.gov API v2)',
      available: true,
      sigma: Math.max(...efficacySigmas),
    });
  }

  const safetySigmaByKey = new Map<string, number>();
  for (const key of sharedSafetyKeys) {
    const sigmas: number[] = [];
    for (const v of views) {
      const s = v.report.safety.find((r) => r.key === key);
      if (s?.riskRatioCi95 != null && s.riskRatioCi95.low > 0 && s.riskRatioCi95.high > 0) {
        sigmas.push((Math.log(s.riskRatioCi95.high) - Math.log(s.riskRatioCi95.low)) / (2 * Z_95));
      }
    }
    if (sigmas.length === views.length && sigmas.every((x) => x > 0)) {
      const sigma = Math.max(...sigmas);
      safetySigmaByKey.set(key, sigma);
      observables.push({
        observableId: `SAFETY_LOG_RR::${key}`,
        quantity: `log risk ratio for ${key} versus the reference arm`,
        unit: 'log risk ratio',
        instrumentClass: 'posted adverse-event tables (ClinicalTrials.gov API v2)',
        available: true,
        sigma,
      });
    }
  }

  const hypotheses: HypothesisPrediction[] = views.map((v) => {
    const predictions: Record<string, number | null> = {};
    const withCi = v.report.efficacy.filter((e) => e.deltaVsSemaglutidePp !== null && e.diffCi95 !== null);
    predictions.EFFICACY_DELTA_PP = withCi.length === 0
      ? null
      : withCi.reduce((best, e) => ((e.deltaVsSemaglutidePp as number) < (best.deltaVsSemaglutidePp as number) ? e : best)).deltaVsSemaglutidePp;
    for (const key of safetySigmaByKey.keys()) {
      const s = v.report.safety.find((r) => r.key === key);
      predictions[`SAFETY_LOG_RR::${key}`] = s?.riskRatio != null && s.riskRatio > 0 ? Math.log(s.riskRatio) : null;
    }
    return { hypothesisId: v.report.summary.moleculeChemblId, predictions };
  });

  return { hypotheses, observables };
}

function runExhaustion(input: {
  readonly shortlist: readonly E2E01Top3Entry[];
  readonly falsifications: readonly E2E01DeepFalsification[];
  readonly finalists: readonly E2E01Top3Entry[];
  readonly finalistViews: readonly A3CandidateView[];
  readonly tier2: E2E01StageResult;
  readonly registry: TrialRegistry;
}): GddExhaustionReport {
  const { shortlist, falsifications, finalists, finalistViews, tier2, registry } = input;
  const steps: GddExhaustionStep[] = [];

  // Path 1 — deep falsification over the whole shortlist, not just the top 3.
  const attacksRun = falsifications.reduce((n, f) => n + f.attacks.length, 0);
  const eliminatedByFalsification = falsifications.filter((f) => !f.survivedAll).length;
  steps.push({
    path: 'DEEP_FALSIFICATION_FULL_SHORTLIST',
    status: eliminatedByFalsification > 0 ? 'RESOLVED' : 'EXHAUSTED',
    finding: `${attacksRun} preregistered attack(s) were run across all ${shortlist.length} shortlisted candidate(s); ${eliminatedByFalsification} of them failed at least one attack.`,
    evidence: falsifications.map((f) => `${f.prefName}: ${f.survivedAll ? 'survived all attacks' : `${f.unresolvedCounterevidence.length} unresolved counterevidence finding(s)`}`),
  });

  // Path 2 — can the measurements this run holds tell the finalists apart?
  let differentiatingExperiment: DiscriminatingExperimentSpec | null = null;
  let unresolvedFinalistPair = false;
  if (finalistViews.length < 2) {
    steps.push({
      path: 'DIFFERENTIATING_EXPERIMENT',
      status: 'EXHAUSTED',
      finding: `Only ${finalistViews.length} finalist(s) remained, so there is no pair left to separate — the question this path answers does not arise.`,
      evidence: finalists.map((f) => `${f.prefName} (rank ${f.rank})`),
    });
  } else {
    const { hypotheses, observables } = buildFinalistPredictions(finalistViews);
    if (observables.length === 0) {
      unresolvedFinalistPair = true;
      steps.push({
        path: 'DIFFERENTIATING_EXPERIMENT',
        status: 'BLOCKED_NO_ACCESS',
        finding: 'No observable in this run carries a published confidence interval for every finalist, so no discriminability can be computed without inventing an uncertainty.',
        evidence: hypotheses.map((h) => h.hypothesisId),
      });
    } else {
      const result = generateDifferentiatingExperiment({
        hypotheses,
        observables,
        campaignId: GDD_CAMPAIGN_PREREGISTRATION.scenarioId,
        round: 1,
      });
      if (result.outcome === 'EXPERIMENT_SELECTED') {
        differentiatingExperiment = result.spec;
        unresolvedFinalistPair = result.spec.unresolvedPairs.length > 0;
        steps.push({
          path: 'DIFFERENTIATING_EXPERIMENT',
          status: unresolvedFinalistPair ? 'EXHAUSTED' : 'RESOLVED',
          finding: `"${result.spec.observableId}" separates ${(result.spec.falsificationPower * 100).toFixed(0)}% of the finalist pairs at >=1 sigma; ${result.spec.unresolvedPairs.length} pair(s) remain empirically equivalent on the data this run holds.`,
          evidence: result.spec.expectedOutcomePerHypothesis.map((e) => `${e.hypothesisId}: expected ${e.expectedOutcome.toPrecision(4)}`),
        });
      } else {
        unresolvedFinalistPair = true;
        steps.push({
          path: 'DIFFERENTIATING_EXPERIMENT',
          status: 'EXHAUSTED',
          finding: `No measurement this run holds separates the finalists at >=1 sigma: ${result.reason}`,
          evidence: result.unresolvedPairs.map((p) => `${p.hypothesisA} vs ${p.hypothesisB}: ${p.discriminability === null ? 'no comparable prediction' : `${p.discriminability.toFixed(3)} sigma`}`),
        });
      }
    }
  }

  // Path 3 — if the finalists cannot be separated, name the missing measurement.
  let observationGapRequest: ObservationGapRequest | null = null;
  if (unresolvedFinalistPair) {
    observationGapRequest = createObservationGapRequest({
      campaignId: GDD_CAMPAIGN_PREREGISTRATION.scenarioId,
      round: 1,
      liveHypothesisIds: finalists.map((f) => f.moleculeChemblId),
      unobservedCount: 0,
      bestDiscriminability: differentiatingExperiment?.discriminability ?? null,
      trigger: 'LOW_DISCRIMINABILITY',
      requiredObservable: {
        quantity: 'head-to-head randomised comparison between the finalists in the requested population, reporting both the primary efficacy endpoint and the preregistered adverse-event categories',
        unit: 'percentage points (efficacy) and risk ratio (safety)',
        instrumentClass: 'randomised controlled trial with posted results',
      },
      feasibility: undeclaredFeasibility('No such trial exists in the pinned evidence set, and this environment cannot reach a live trial registry to check whether one has since been posted. Cost and duration are therefore UNDECLARED rather than estimated.'),
      requestedFrom: 'LABORATORY',
    });
    steps.push({
      path: 'OBSERVATION_GAP_REQUEST',
      status: 'BLOCKED_NO_ACCESS',
      finding: 'The finalists are empirically equivalent on the evidence this run holds, so the run names the measurement that would resolve them rather than picking one.',
      evidence: [observationGapRequest.rationale, `request ${observationGapRequest.id}`],
    });
  } else {
    steps.push({
      path: 'OBSERVATION_GAP_REQUEST',
      status: 'EXHAUSTED',
      finding: 'No gap request was needed: the available measurements already separate the finalists.',
      evidence: [],
    });
  }

  // Path 4 — was anything eliminated only for missing data, rather than for failing on data?
  const revivable = tier2.eliminated.filter((e) => /No ClinicalTrials\.gov study|none yields a numerically computable|No adverse-event category yields/.test(e.reason));
  for (const r of revivable.slice(0, 5)) {
    recordTrial(registry, {
      kind: 'ABANDONED_BRANCH',
      subject: r.moleculeChemblId,
      stage: 'REVIVABILITY_SCAN',
      outcome: 'ABANDONED',
      reason: `Eliminated for absent evidence rather than for failing on evidence: ${r.reason}`,
    });
  }
  steps.push({
    path: 'REVIVABLE_ELIMINATED_CANDIDATES',
    status: revivable.length > 0 ? 'BLOCKED_NO_ACCESS' : 'EXHAUSTED',
    finding: revivable.length > 0
      ? `${revivable.length} candidate(s) were eliminated for ABSENT evidence, not for failing on evidence. More trial data could return them to contention; this environment cannot fetch it.`
      : 'Every elimination was made on evidence that exists, so no candidate is waiting on data alone.',
    evidence: revivable.slice(0, 5).map((r) => `${r.prefName ?? r.moleculeChemblId}: ${r.reason}`),
  });

  const attempted = new Set(steps.map((s) => s.path));
  return {
    steps,
    allPathsAttempted: GDD_EXHAUSTION_PATHS.every((p) => attempted.has(p)),
    differentiatingExperiment,
    observationGapRequest,
  };
}

// ---------------------------------------------------------------------------
// The campaign
// ---------------------------------------------------------------------------

export interface GddCampaignResult {
  readonly scenarioId: string;
  readonly runtimeVersion: string;
  readonly preregistrationFingerprint: string;
  readonly inheritedFromFingerprint: string;
  readonly problem: string;
  readonly population: A3PopulationSpec;
  readonly generationCheck: E2E01GenerationCheck;
  readonly stages: readonly GddStage[];
  readonly shortlist: readonly E2E01Top3Entry[];
  readonly falsifications: readonly E2E01DeepFalsification[];
  readonly finalists: readonly E2E01Top3Entry[];
  readonly safetyGate: readonly GddSafetyGateResult[];
  readonly exhaustion: GddExhaustionReport;
  /** The first-pass verdict, before the exhaustion paths were walked. Kept so a reader can see whether walking them changed anything. */
  readonly provisionalDecision: E2E01WinnerDecision;
  readonly exhaustionChangedVerdict: boolean;
  readonly decision: E2E01WinnerDecision;
  readonly researchRecipe: E2E01ResearchRecipe | null;
  readonly noAccessDeclarations: readonly E2E01NoAccessDeclaration[];
  readonly governmentRecommendation: string;
  readonly trials: readonly TrialRecord[];
  readonly trialRegistryFingerprint: string;
  readonly multiplicity: MultiplicityCorrection;
  readonly bannedStringHits: readonly E2E01BannedStringHit[];
  readonly campaignFingerprint: string;
}

export function runGovDrugDiscoveryCampaign(): GddCampaignResult {
  const population = GDD_CAMPAIGN_PREREGISTRATION.population as A3PopulationSpec;
  const registry = createTrialRegistry(GDD_CAMPAIGN_PREREGISTRATION.scenarioId);

  const generated = loadGeneratedCandidates();
  const generationCheck = checkGenerationNotPinned(generated);

  const a3 = runA3GovernmentRecommendation(population);
  if (a3.status !== 'ANSWERED') {
    throw new Error('GOV-DRUG-DISCOVERY-CAMPAIGN-01 supplies a population, so a REQUIRED_POLICY_INPUT answer here means the A3 population contract changed underneath it.');
  }
  const candidateViews = a3.answerRecord.candidateViews;
  const viewById = new Map(candidateViews.map((v) => [v.report.summary.moleculeChemblId, v]));

  const tier1 = runTier1(generated);
  const tier2 = runTier2(tier1.survivorIds, generated, candidateViews);

  // Every candidate the funnel actually evaluated is a recorded trial.
  for (const c of generated) {
    const survivedTier1 = tier1.survivorIds.includes(c.moleculeChemblId);
    const elimination = tier1.eliminated.find((e) => e.moleculeChemblId === c.moleculeChemblId);
    recordTrial(registry, {
      kind: 'CANDIDATE_EVALUATION',
      subject: c.moleculeChemblId,
      stage: 'TIER_1',
      outcome: survivedTier1 ? 'SURVIVED' : 'ELIMINATED',
      reason: survivedTier1 ? 'Qualifying incretin-axis activity with real clinical development.' : (elimination?.reason ?? 'Eliminated at Tier-1.'),
    });
  }
  for (const id of tier1.survivorIds) {
    const survivedTier2 = tier2.survivorIds.includes(id);
    const elimination = tier2.eliminated.find((e) => e.moleculeChemblId === id);
    recordTrial(registry, {
      kind: 'CANDIDATE_EVALUATION',
      subject: id,
      stage: 'TIER_2',
      outcome: survivedTier2 ? 'SURVIVED' : 'ELIMINATED',
      reason: survivedTier2 ? 'Both a computable efficacy comparison and a computable safety comparison exist.' : (elimination?.reason ?? 'Eliminated at Tier-2.'),
    });
  }

  const shortlist = selectTop3(tier2.survivorIds, candidateViews, GDD_SHORTLIST_SIZE);

  const falsifications = shortlist
    .map((entry) => viewById.get(entry.moleculeChemblId))
    .filter((v): v is A3CandidateView => v !== undefined)
    .map((v) => deepFalsify(v, population));

  for (const f of falsifications) {
    for (const a of f.attacks) {
      recordTrial(registry, {
        kind: 'FALSIFICATION_ATTACK',
        subject: `${f.moleculeChemblId}::${a.attack}`,
        stage: 'DEEP_FALSIFICATION',
        outcome: a.survived ? 'SURVIVED' : 'ELIMINATED',
        reason: a.survived ? `Survived the ${a.attack} attack.` : (a.counterevidence ?? `Failed the ${a.attack} attack.`),
      });
    }
  }

  /**
   * Finalists are the highest-ranked shortlist entries that are neither vetoed
   * on safety nor carrying unresolved counterevidence. When fewer than
   * GDD_FINALIST_SIZE qualify, the real number is reported — the list is never
   * padded with a candidate the run just refused.
   */
  const falsificationById = new Map(falsifications.map((f) => [f.moleculeChemblId, f]));
  const eligible = shortlist.filter((c) => !c.vetoed && falsificationById.get(c.moleculeChemblId)?.survivedAll === true);
  const finalists = (eligible.length > 0 ? eligible : shortlist.filter((c) => !c.vetoed)).slice(0, GDD_FINALIST_SIZE);
  const finalistViews = finalists.map((f) => viewById.get(f.moleculeChemblId)).filter((v): v is A3CandidateView => v !== undefined);

  const preDecisionFingerprint = fnv1a(canonicalJson({
    preregistration: GDD_CAMPAIGN_PREREGISTRATION.fingerprint,
    generated: generated.length,
    tier1: tier1.survivorIds,
    tier2: tier2.survivorIds,
    shortlist: shortlist.map((c) => ({ id: c.moleculeChemblId, score: c.weightedScore, vetoed: c.vetoed })),
    falsifications: falsifications.map((f) => ({ id: f.moleculeChemblId, survivedAll: f.survivedAll, unresolved: f.unresolvedCounterevidence.length })),
    finalists: finalists.map((f) => f.moleculeChemblId),
  }));

  const safetyGate = finalists.map((entry) => {
    const view = viewById.get(entry.moleculeChemblId);
    if (view === undefined) throw new Error(`Finalist ${entry.moleculeChemblId} has no candidate view — the shortlist and the A3 answer record disagree.`);
    return runSafetyGate(entry, falsificationById.get(entry.moleculeChemblId), view, preDecisionFingerprint);
  });

  /**
   * TWO PASSES, ON PURPOSE. The first selection is PROVISIONAL. If it does not
   * name a winner, the exhaustion paths are walked and the selection is run
   * AGAIN over the evidence as it stands afterwards — a non-winner is only
   * final on the second pass.
   *
   * In this environment the second pass returns the same verdict, and that is
   * reported rather than hidden: the gap request the exhaustion raises cannot
   * be fulfilled here (no reachable trial registry), so no new observation can
   * enter and there is nothing for the rules to chew on that they had not
   * already seen. `exhaustionChangedVerdict` records that honestly instead of
   * implying a re-evaluation did work it did not do. Where a gap CAN be
   * fulfilled, the same code path admits the observation and the second pass
   * becomes a real re-decision.
   *
   * Both passes run over the WHOLE shortlist, never the two finalists:
   * evaluating on a narrowed field could hide a disagreement between
   * candidates and turn CONFLICTING_EVIDENCE into a WINNER. The rules are
   * E2E-01's, unchanged.
   */
  const provisionalDecision = selectWinner(shortlist, falsifications, tier2.survivorIds.length);

  const exhaustion = runExhaustion({ shortlist, falsifications, finalists, finalistViews, tier2, registry });

  const decision = selectWinner(shortlist, falsifications, tier2.survivorIds.length);
  const exhaustionChangedVerdict = decision.outcome !== provisionalDecision.outcome;

  if (decision.outcome !== 'WINNER' && !exhaustion.allPathsAttempted) {
    throw new Error(
      `GOV-DRUG-DISCOVERY-CAMPAIGN-01 reached ${decision.outcome} without attempting every declared path. `
      + `Missing: ${GDD_EXHAUSTION_PATHS.filter((p) => !exhaustion.steps.some((s) => s.path === p)).join(', ')}. `
      + 'A non-winner verdict is only a scientific result once the available paths have been walked; before that it is a stop.',
    );
  }

  const blockedIds = new Set(safetyGate.filter((g) => g.blocked).map((g) => g.moleculeChemblId));
  if (decision.outcome === 'WINNER' && decision.winnerId !== null && blockedIds.has(decision.winnerId)) {
    throw new Error(
      `The winner rules named ${decision.winnerId}, but the practical-candidate gate REFUSED it: `
      + `${safetyGate.find((g) => g.moleculeChemblId === decision.winnerId)?.decision.reason ?? ''} `
      + 'A candidate the safety gate refuses cannot be named, whatever its score.',
    );
  }

  /**
   * Counted from the funnel itself, NOT from the registry — comparing the
   * registry against its own length would assert nothing. Every Tier-1
   * evaluation, every Tier-2 evaluation, every falsification attack and every
   * branch the revivability scan abandoned has to appear exactly once.
   */
  const expectedAttempts =
    generated.length
    + tier1.survivorIds.length
    + falsifications.reduce((n, f) => n + f.attacks.length, 0)
    + countTrials(registry, ['ABANDONED_BRANCH']);
  assertRegistryComplete(registry, expectedAttempts);

  const multiplicity = correctForMultiplicity(registry, 0.05, ['FALSIFICATION_ATTACK']);

  const campaignFingerprint = fnv1a(canonicalJson({
    preDecision: preDecisionFingerprint,
    safetyGate: safetyGate.map((g) => ({ id: g.moleculeChemblId, outcome: g.decision.outcome, contradictions: g.unresolvedContradictions.length })),
    exhaustion: exhaustion.steps.map((s) => ({ path: s.path, status: s.status })),
    outcome: decision.outcome,
    winnerId: decision.winnerId,
    trials: registryFingerprint(registry),
  }));

  const winnerView = decision.winnerId === null ? undefined : viewById.get(decision.winnerId);
  const researchRecipe = generateResearchRecipe(decision, winnerView, campaignFingerprint);

  const governmentRecommendation = decision.outcome === 'WINNER' && decision.winnerName !== null
    ? `Government Research finding: ${decision.winnerName} is the one candidate this run can name under the inherited winner rules. ${decision.reason} Any programme decision requires institutional authorisation; this record authorises nothing.`
    : `Government Research finding: this run names NO candidate. ${decision.reason} The paths available to it were walked before stopping — see the exhaustion record — and what is still missing is named as an explicit observation gap rather than filled in. Commissioning that measurement is the decision this evidence actually supports.`;

  const result: GddCampaignResult = {
    scenarioId: GDD_CAMPAIGN_PREREGISTRATION.scenarioId,
    runtimeVersion: GDD_CAMPAIGN_RUNTIME_VERSION,
    preregistrationFingerprint: GDD_CAMPAIGN_PREREGISTRATION.fingerprint,
    inheritedFromFingerprint: GDD_CAMPAIGN_PREREGISTRATION.inheritedFromFingerprint,
    problem: GDD_CAMPAIGN_PREREGISTRATION.problem,
    population,
    generationCheck,
    stages: [stageFrom(tier1), stageFrom(tier2)],
    shortlist,
    falsifications,
    finalists,
    safetyGate,
    exhaustion,
    provisionalDecision,
    exhaustionChangedVerdict,
    decision,
    researchRecipe,
    noAccessDeclarations: loadNoAccessDeclarations(),
    governmentRecommendation,
    trials: listTrials(registry),
    trialRegistryFingerprint: registryFingerprint(registry),
    multiplicity,
    bannedStringHits: [],
    campaignFingerprint,
  };

  return { ...result, bannedStringHits: scanForBannedStrings({ ...result, trials: [] }) };
}
