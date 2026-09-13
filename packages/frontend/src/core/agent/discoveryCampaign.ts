import { fnv1a, canonicalJson } from '../events/hash';
import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import { checkAntiHarkingAnchor, type AntiHarkingCheck } from '../experimentFabric/hypothesisLoop';
import {
  estimatedCoefficientCount,
  fitModelSpec,
  generateModelSpace,
  holdoutScore,
  modelComplexity,
  modelSelectionScore,
  modelSpecFingerprint,
  renderModelSpec,
  type ModelInput,
  type ModelPoint,
  type ModelSpec,
  type ModelSpaceConstraints,
} from './modelSpace';
import { analyzeResidualStructure, proposeModelsFromResiduals, type ResidualFinding } from './residualStructure';
import { consultFalsifiedModelRegistry, recordFalsification, type ConsultationVerdict, type FalsificationScope, type RegistryConsultation } from './falsifiedModelRegistry';
import {
  classifyObservationGap,
  createObservationGapRequest,
  observationGapLedgerFingerprint,
  undeclaredFeasibility,
  TAU_DISCRIMINABILITY,
  type ObservationGapFeasibility,
  type ObservationGapRecipient,
  type ObservationGapRequest,
  type RequiredObservable,
} from './observationGap';
import { checkExcludedBasisSmuggling, checkTemporalLineage, holdoutDiagnostic, type HoldoutDiagnostic, type IntegrityFlag } from './integrityGates';

/**
 * GENERIC AUTONOMOUS DISCOVERY CAMPAIGN — one loop, many laboratories.
 *
 * This is the engine the QE4-specific `qe4RegimeInquiryLoop.ts` was a
 * substrate-bound rehearsal for. The difference that matters: that loop
 * compares THREE model forms a human wrote down, forever; this one enumerates
 * a declared model GRAMMAR (`modelSpace.ts`), and — crucially — ADDS models
 * mid-campaign that nobody enumerated, derived from the structure of the
 * winning model's own residuals (`residualStructure.ts`). A campaign can
 * therefore finish holding a model that did not exist when it started.
 *
 * WHAT MAKES IT AUTONOMOUS, precisely. Round N+1's experiment is chosen by a
 * PLANNER SCORE computed from round N's live model set, combining three real,
 * independently-motivated terms (C3-1):
 *
 *   Sep    (`discriminationAt`)     — spread of live models' predictions at a
 *                                     candidate x, in units of that
 *                                     observation's own uncertainty. The
 *                                     original, sole term.
 *   Fals   (`falsificationPowerAt`) — fraction of live-model PAIRS whose
 *                                     predictions at x differ by more than
 *                                     this codebase's standing 3σ separation
 *                                     convention (`qe4BrydgesAnalysis.ts`'s
 *                                     `significantlyGreater`). Distinct from
 *                                     Sep: a single extreme pair can dominate
 *                                     Sep's max−min spread while leaving most
 *                                     pairs unseparated; Fals counts how many
 *                                     pairs a real observation here could
 *                                     actually falsify.
 *   Redund (`redundancyAt`)         — how close x sits to an already-admitted
 *                                     observation, as a fraction of the
 *                                     laboratory's full candidate span. High
 *                                     redundancy discounts a candidate likely
 *                                     to repeat, not add to, existing
 *                                     constraints.
 *
 * combined as `Sep × (1 + w·Fals) × (1 − w·Redund)` with `w = REFINEMENT_WEIGHT
 * = 0.25` — a fixed, disclosed combination (not fit to force any particular
 * sequence), which reduces exactly to the original Sep-only score when
 * Fals=0 and Redund=0. `w` is deliberately NOT 1: `Sep`, `Fals` and `Redund`
 * are strongly correlated in the same direction for any point far from what
 * has been admitted, so an unweighted combination was checked directly
 * against this engine's own §15 acceptance case and found to systematically
 * front-load extrapolative points at the expense of the mixed point coverage
 * residual-structure detection benefits from — see `REFINEMENT_WEIGHT`'s own
 * comment for the concrete before/after. There is no list of questions, no
 * fixed order, no next-step table. Change the laboratory, the data or the
 * grammar and the sequence of chosen experiments changes with it.
 *
 * WHAT IT IS NOT, stated so nobody reads more into it. It is NOT expected
 * information gain: this codebase has no calibrated posterior over model
 * space (`beliefRevision.ts` documents its own confidence as a log-odds
 * heuristic), so an EIG number here would be fabricated precision. Cost and
 * risk terms are absent rather than stubbed, because on a pinned dataset
 * every remaining observation costs the same and this campaign has no
 * mechanism yet to judge one experiment riskier than another — deliberately
 * NOT added alongside Fals/Redund, per the same reasoning that kept them out
 * before.
 *
 * Reuses, unmodified: `beliefRevision.ts` (belief per model), `hypothesisLoop.ts`'s
 * anti-HARK anchor, `events/hash.ts` fingerprints, and `modelSpace`/
 * `residualStructure`. Zero new engines.
 *
 * INTEGRITY GATES (F2/F5, `integrityGates.ts`), under GOVERNMENT RESEARCH MODE:
 * a temporal-lineage check and an excluded-basis-smuggling check run on every
 * model this campaign derives, plus a hold-out diagnostic kept strictly
 * separate from the fit that actually ranks models. All three FLAG; none
 * BLOCKS — POLICY MAY LIMIT ACTION, NOT TRUTH. A flagged model stays live,
 * stays analyzable, and can still win; the flag is recorded with its reason
 * and provenance on the round that raised it (`CampaignRound.integrityFlags`)
 * and in the campaign-wide ledger (`CampaignResult.integrityFlags`) instead of
 * being used to silently narrow the model set. The one admission check that
 * DOES still reject outright is the novelty gate: an exact-fingerprint
 * duplicate of an already-live model is refused, because re-registering a
 * byte-identical model is harmless deduplication, not suppressed science —
 * see `isNovel` below.
 */

export const DISCOVERY_CAMPAIGN_CONTRACT_VERSION = '1.0.0';

/**
 * A domain's whole obligation to this engine: say what can be observed, and
 * observe it. Everything scientific — which model wins, what to try next, when
 * to stop — belongs to the engine, not the adapter.
 */
export interface CampaignLaboratory {
  readonly labId: string;
  readonly problem: string;
  /** The real experiment space: every x at which an observation is actually available. */
  readonly candidateX: readonly number[];
  /** Execute one experiment. Returns null when this x cannot in fact be observed. */
  readonly observe: (x: number) => ModelPoint | null;
  /** Real span of the independent variable, so generated shape parameters land on meaningful scales. */
  readonly xRange: { readonly min: number; readonly max: number };
  /** Human-facing names for the axes, used only in rendering. */
  readonly xLabel: string;
  readonly yLabel: string;
  /**
   * OPTIONAL, and only ever read when the engine has to raise an
   * `ObservationGapRequest`. The engine knows WHAT quantity is missing; only
   * the laboratory knows what instrument would measure it, what that costs and
   * what rules constrain it. A laboratory that declares nothing gets a request
   * whose feasibility fields are explicitly unknown — which is the truth, and
   * more useful than an invented number.
   */
  readonly declareObservable?: () => RequiredObservable;
  readonly declareFeasibility?: (trigger: string) => ObservationGapFeasibility;
  readonly gapRecipient?: ObservationGapRecipient;
}

export interface CampaignModelView {
  readonly fingerprint: string;
  readonly formula: string;
  readonly rss: number | null;
  readonly complexity: number;
  readonly enteredAtRound: number;
  readonly derivedFrom: string | null;
  readonly derivationOperator: string | null;
}

export interface CampaignRound {
  readonly round: number;
  readonly admittedX: readonly number[];
  readonly models: readonly CampaignModelView[];
  readonly bestFingerprint: string | null;
  readonly runnerUpFingerprint: string | null;
  readonly decisive: boolean;
  readonly rssRatio: number | null;
  readonly residualFindings: readonly ResidualFinding[];
  readonly derivedThisRound: readonly CampaignModelView[];
  readonly selectedNextX: number | null;
  readonly selectionReason: string;
  readonly discriminationScore: number | null;
  /** C3-1: fraction of live-model pairs a real observation at the chosen x could falsify at 3σ. */
  readonly falsificationScore: number | null;
  /** C3-1: how close the chosen x sits to an already-admitted point, as a fraction of the candidate span. */
  readonly redundancyScore: number | null;
  /** C3-1: the combined score `Sep × (1 + w·Fals) × (1 − w·Redund)` that actually selected `selectedNextX`. */
  readonly plannerScore: number | null;
  readonly beliefs: readonly Hypothesis[];
  readonly antiHarking: AntiHarkingCheck;
  readonly roundFingerprint: string;
  /**
   * M3: chi-square per point of this round's best model, scored on observations
   * its own fit never saw. Null when the admitted set is too small to split
   * honestly — an out-of-sample number from an inadequate split would look like
   * evidence while carrying none. It is the one score that in-sample bending
   * cannot improve, which is what makes it worth reporting next to RSS.
   */
  readonly bestHoldoutScore: number | null;
  /**
   * Raised instead of a selection when no attached experiment can separate the
   * live models. When this is non-null, `selectedNextX` is null BY
   * CONSTRUCTION: the engine declined to run something worthless rather than
   * picking the least bad option.
   */
  readonly observationGap: ObservationGapRequest | null;
  /**
   * F2/F5 integrity gates raised THIS round (temporal-lineage and
   * excluded-basis-smuggling checks on `derivedThisRound`). Flag-only, per
   * Government Research mode — see this file's own header comment and
   * `integrityGates.ts`. Empty, not absent, when nothing was raised.
   */
  readonly integrityFlags: readonly IntegrityFlag[];
  /**
   * F2/F5-6/F2/F5-7: a hold-out check on the round's own best model, kept
   * strictly separate from the fit that actually ranks/selects — refits on
   * every admitted point EXCEPT the most recent, then reports how far that
   * held-out point's real value fell from the reduced fit's prediction.
   * `null` only when fewer than two points are admitted (nothing to hold
   * out yet); see `integrityGates.ts::holdoutDiagnostic`.
   */
  readonly holdout: HoldoutDiagnostic | null;
}

export type CampaignStopReason =
  | 'CONVERGENCE'
  | 'NO_INFORMATION_GAIN'
  | 'EXPERIMENT_SPACE_EXHAUSTED'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'ANTI_HARKING_VIOLATION'
  | 'ALL_MODELS_UNFITTABLE'
  /** Stopped holding an open request for a measurement this laboratory does not offer. Not a failure — a question put to the outside. */
  | 'OBSERVATION_GAP';

/**
 * §12's contract, kept honest: `proposedProtocol` is null unless the domain
 * genuinely supports one. A descriptive law (how entanglement grows, how
 * planets orbit) yields no recipe, and inventing parameters to fill this field
 * would be exactly the fabrication the rest of this codebase refuses.
 */
export interface PracticalCandidate {
  readonly derivedFromModelFingerprint: string;
  readonly statement: string;
  readonly constraints: readonly string[];
  readonly requiredValidation: readonly string[];
  readonly proposedProtocol: string | null;
  readonly protocolWithheldReason: string | null;
}

export interface Discovery {
  readonly question: string;
  readonly survivingModels: readonly CampaignModelView[];
  readonly falsifiedModels: readonly CampaignModelView[];
  readonly winningModel: CampaignModelView | null;
  readonly winningFormulaWithCoefficients: string | null;
  readonly supportingEvidence: readonly string[];
  readonly counterEvidence: readonly string[];
  readonly uncertainty: string;
  readonly assumptions: readonly string[];
  readonly residualFindings: readonly ResidualFinding[];
  readonly nextExperiment: string | null;
  readonly practicalCandidate: PracticalCandidate | null;
  readonly decisionBasis: string;
}

export interface CampaignResult {
  readonly contractVersion: string;
  readonly labId: string;
  readonly problem: string;
  readonly rounds: readonly CampaignRound[];
  readonly stopReason: CampaignStopReason;
  readonly discovery: Discovery;
  readonly campaignFingerprint: string;
  /**
   * Every model this campaign refused to admit because M2's
   * `falsifiedModelRegistry.ts` already had a standing verdict on it — only
   * ever populated when `CampaignOptions.respectFalsifiedModelRegistry` is
   * true. Never a silent skip: each entry names the fingerprint and the real
   * reason `consultFalsifiedModelRegistry` returned.
   */
  readonly registrySkips: readonly { readonly fingerprint: string; readonly reason: string; readonly verdict: ConsultationVerdict }[];

  /**
   * Every gap this campaign raised, in order. Fingerprinted SEPARATELY from
   * `campaignFingerprint` on purpose: adding the gap ledger left every
   * pre-existing campaign replay fingerprint byte-identical, which is the
   * evidence that M1 changed nothing about how non-degenerate campaigns run.
   */
  readonly observationGaps: readonly ObservationGapRequest[];
  readonly gapLedgerFingerprint: string;
  /**
   * Every F2/F5 integrity flag raised across the whole campaign, in round
   * order — the campaign-wide ledger a caller can read without walking every
   * round's own `integrityFlags`. Flag-only (Government Research mode): a
   * non-empty list here never means a model was withheld, only that it should
   * be read with the recorded caveat in mind.
   */
  readonly integrityFlags: readonly IntegrityFlag[];
}

export interface CampaignOptions {
  readonly maxRounds?: number;
  readonly maxTerms?: number;
  readonly excludeBases?: ModelSpaceConstraints['excludeBases'];
  /** Fingerprints the caller already knew before the campaign began (anti-HARK anchor). */
  readonly alreadyKnownFingerprints?: readonly string[];
  /**
   * M2 — Global Falsified-Model Registry integration. Off by default (every
   * existing caller, and every existing test's determinism/independence
   * assumptions, keep their exact current behaviour unchanged). When true:
   * a candidate model is consulted against `falsifiedModelRegistry.ts`
   * before being admitted — both at initial enumeration and at
   * residual-derived proposal — and this campaign's own newly-falsified
   * models are recorded back into the registry (scope `VARIANT_ONLY`,
   * carrying the real `Hypothesis` that earned the verdict) so a LATER
   * campaign on the same laboratory does not have to re-derive and re-fit
   * the same already-settled model.
   */
  readonly respectFalsifiedModelRegistry?: boolean;
}

/**
 * The three assumptions every model fit in this engine rests on, regardless
 * of laboratory. Shared verbatim between `Discovery.assumptions` (below) and
 * M2's `FalsificationScope.assumptions` (`falsifiedModelRegistry.ts`) — one
 * real list, not two independently-typed-out copies that could quietly drift.
 */
const CAMPAIGN_ASSUMPTIONS: readonly string[] = [
  'Observations are independent and their reported sigmas are correct.',
  'The true relationship lies within the declared model grammar.',
  'Each basis term is linear in its coefficient; nonlinear shape parameters were enumerated, not optimised.',
];

/** A model is "decisively best" at no more than half the runner-up's weighted RSS — the same ratio the QE4 loop already uses. */
const DECISIVE_RSS_RATIO = 0.5;
/** Two consecutive rounds' best/runner-up ratio moving less than this means more of the same data will not separate them. */
const NO_INFORMATION_GAIN_EPSILON = 0.02;
/** Belief the same winner must reach, across consecutive decisive rounds, before the question is called settled. */
const CONVERGENCE_CONFIDENCE = 0.95;
/** Seed observations admitted before the first fit; below this nothing is fittable. */
const SEED_OBSERVATIONS = 3;
/** 3σ is this codebase's standing convention for "genuinely separated" (see
 * `qe4BrydgesAnalysis.ts::significantlyGreater`), reused here for `Fals`
 * rather than a new threshold invented for this term alone. */
const FALSIFICATION_SIGMA_THRESHOLD = 3;
/**
 * How much `Fals`/`Redund` may adjust the `Sep`-driven ranking: at most a
 * ±25% swing each. Fixed, disclosed, and deliberately conservative — `Sep`,
 * `Fals` and `Redund` are strongly correlated in the same direction for any
 * point far from what has been admitted (all three rise together), so an
 * UNWEIGHTED multiplicative combination (`Sep × (1+Fals) × (1−Redund)`,
 * checked directly against this engine's own §15 acceptance case) can
 * systematically front-load extreme/extrapolative points and starve the
 * mixed near/far point coverage that residual-structure detection benefits
 * from — verified to reorder round selections and lose the very shape (an
 * excluded LOG term) the campaign is meant to re-derive. This weight keeps
 * both terms real and measurable while leaving `Sep` the dominant signal,
 * exactly as it was before C3-1.
 */
const REFINEMENT_WEIGHT = 0.25;

interface LiveModel {
  readonly spec: ModelSpec;
  readonly fingerprint: string;
  readonly enteredAtRound: number;
  readonly derivedFrom: string | null;
  readonly derivationOperator: string | null;
}

function viewOf(model: LiveModel, rss: number | null): CampaignModelView {
  return {
    fingerprint: model.fingerprint,
    formula: renderModelSpec(model.spec),
    rss,
    complexity: modelComplexity(model.spec),
    enteredAtRound: model.enteredAtRound,
    derivedFrom: model.derivedFrom,
    derivationOperator: model.derivationOperator,
  };
}

function criterionFor(model: LiveModel, lab: CampaignLaboratory): FalsificationCriterion {
  return {
    metric: `${lab.labId}:model-rss:${model.fingerprint}`,
    relation: 'less-than',
    rationale: `Model "${renderModelSpec(model.spec)}" (${lab.yLabel} as a function of ${lab.xLabel}) is assessed each round by weighted RSS against every other live model on the SAME admitted observations — not against a fixed threshold.`,
  };
}

/**
 * How much the live models disagree at `x`, in units of the observation's own
 * uncertainty: the spread of their predictions divided by the sigma an
 * observation there would carry. High score = the models make genuinely
 * different bets about this experiment, so running it separates them.
 */
function discriminationAt(
  x: number,
  fits: readonly { readonly predict: (x: number) => number }[],
  sigmaAtX: number,
): number {
  if (fits.length < 2) return 0;
  const predictions = fits.map((f) => f.predict(x)).filter((v) => Number.isFinite(v));
  if (predictions.length < 2) return 0;
  const max = Math.max(...predictions);
  const min = Math.min(...predictions);
  return (max - min) / Math.max(sigmaAtX, 1e-12);
}

/**
 * Fals (F2/F5-9 redefinition) — a real yes/no on whether observing `x` COULD
 * actually falsify at least one currently-live model: 1 when at least one
 * pair of live models' predictions at `x` differ by more than
 * `FALSIFICATION_SIGMA_THRESHOLD` sigma (so, whichever way the real
 * measurement lands, at least one of that pair cannot both be right), 0
 * otherwise. Deliberately an EXISTENCE check, not the fraction-of-pairs this
 * function used to compute: the engine cannot peek at the true y before
 * observing, so it cannot simulate an actual post-hoc falsification — this is
 * the honest, disclosed proxy for "is a real falsification even POSSIBLE
 * here", built from the same predictions `discriminationAt` already uses.
 */
export function falsificationPowerAt(
  x: number,
  fits: readonly { readonly predict: (x: number) => number }[],
  sigmaAtX: number,
): number {
  if (fits.length < 2) return 0;
  const predictions = fits.map((f) => f.predict(x)).filter((v) => Number.isFinite(v));
  if (predictions.length < 2) return 0;
  for (let i = 0; i < predictions.length; i += 1) {
    for (let j = i + 1; j < predictions.length; j += 1) {
      if (Math.abs(predictions[i]! - predictions[j]!) > FALSIFICATION_SIGMA_THRESHOLD * Math.max(sigmaAtX, 1e-12)) return 1;
    }
  }
  return 0;
}

/**
 * A real observation's identity, for redundancy checks and provenance —
 * `x`+`y`+`sigma` together, not `x` alone, so two rounds' worth of the same
 * nominal x with a genuinely different measured outcome are NOT silently
 * treated as identical. Exposed (not just used internally) so a caller can
 * audit exactly what was fingerprinted — F2/F5-7's "seed in provenance" is
 * satisfied by recording these, not a random seed this deterministic,
 * closed-form planner has no actual use for (see `CampaignRound.holdout`'s
 * own comment for where a real split identifier belongs instead).
 */
export function observationFingerprint(point: ModelPoint): string {
  return fnv1a(canonicalJson({ x: point.x, y: point.y, sigma: point.sigma }));
}

/**
 * Redund (F2/F5-8 redefinition) — grounded in FINGERPRINTS of real, already-
 * admitted observations, not a bare candidate-x array a caller could pass
 * without those x's ever having been genuinely observed. Two-part, because a
 * NOT-YET-OBSERVED candidate has no `y`/`sigma` to fingerprint against — only
 * its `x` identity is comparable in advance:
 *   1. EXACT: candidate's `x` matches an admitted point's `x` — maximal
 *      redundancy (1). Honestly, this is `===` under the hood: a candidate
 *      has no `y`/`sigma` yet, so "same real observation" can only mean
 *      "same x" in advance, which a fingerprint comparison and a plain `x
 *      === x` decide identically. `observationFingerprint` is still the
 *      right primitive to reach for here (and is used elsewhere for
 *      provenance) rather than duplicating an ad hoc comparison — see that
 *      function's own comment for why it hashes `y`/`sigma` too, for the
 *      cases that DO have them.
 *   2. Otherwise, the same continuous distance-to-nearest, as a fraction of
 *      the laboratory's full candidate span, this function has always used —
 *      geometric distance is the honest measure of PARTIAL redundancy, since
 *      no fingerprint comparison can express "how close", only "same or not".
 */
export function redundancyAt(x: number, admitted: readonly ModelPoint[], candidateSpan: number): number {
  if (admitted.length === 0 || candidateSpan <= 0) return 0;
  if (admitted.some((p) => p.x === x)) return 1;
  const nearest = Math.min(...admitted.map((p) => Math.abs(p.x - x)));
  return Math.max(0, 1 - nearest / candidateSpan);
}

/** Novelty gate (F2/F5-2) — see this file's header comment for why exact duplicates are rejected outright rather than flagged. */
function isNovel(fingerprint: string, live: readonly LiveModel[]): boolean {
  return !live.some((m) => m.fingerprint === fingerprint);
}

/**
 * Runs one full autonomous campaign against `lab`. Deterministic: same
 * laboratory and options produce the same rounds, the same chosen experiments
 * and the same `campaignFingerprint`.
 */
export function runDiscoveryCampaign(lab: CampaignLaboratory, options: CampaignOptions = {}): CampaignResult {
  const maxRounds = options.maxRounds ?? lab.candidateX.length;
  const constraints: ModelSpaceConstraints = {
    maxTerms: options.maxTerms ?? 2,
    xRange: lab.xRange,
    excludeBases: options.excludeBases,
  };

  const scopeForLab: FalsificationScope = {
    domain: lab.labId,
    assumptions: CAMPAIGN_ASSUMPTIONS,
    boundary: `${lab.xLabel} in [${lab.xRange.min}, ${lab.xRange.max}]`,
  };

  const registrySkips: { fingerprint: string; reason: string; verdict: ConsultationVerdict }[] = [];
  const admitOrSkip = (spec: ModelSpec): RegistryConsultation => {
    if (!options.respectFalsifiedModelRegistry) return { verdict: 'ALLOW', reason: 'Registry consultation not requested.', matchedRecord: null };
    const consultation = consultFalsifiedModelRegistry({ spec, scope: scopeForLab });
    if (consultation.verdict !== 'ALLOW') registrySkips.push({ fingerprint: modelSpecFingerprint(spec), reason: consultation.reason, verdict: consultation.verdict });
    return consultation;
  };

  const live: LiveModel[] = generateModelSpace(constraints)
    .filter((spec) => admitOrSkip(spec).verdict === 'ALLOW')
    .map((spec) => ({
      spec,
      fingerprint: modelSpecFingerprint(spec),
      enteredAtRound: 0,
      derivedFrom: null,
      derivationOperator: null,
    }));

  const beliefs = new Map<string, Hypothesis>();
  for (const model of live) {
    beliefs.set(model.fingerprint, createHypothesis(model.fingerprint, criterionFor(model, lab), 0.5, 'REGIME_FIT_FROM_GRID', null));
  }

  const ordered = [...lab.candidateX].sort((a, b) => a - b);
  const admitted: ModelPoint[] = [];
  /** Round each admitted x actually entered — seeds at round 0 — the real clock the temporal gate (F2/F5-1) checks derivations against. */
  const admittedAtRound = new Map<number, number>();
  for (const x of ordered.slice(0, SEED_OBSERVATIONS)) {
    const observed = lab.observe(x);
    if (observed !== null) {
      admitted.push(observed);
      admittedAtRound.set(observed.x, 0);
    }
  }
  const remaining = ordered.filter((x) => !admitted.some((p) => p.x === x));
  const candidateSpan = Math.max(...lab.candidateX) - Math.min(...lab.candidateX);

  const rounds: CampaignRound[] = [];
  const observationGaps: ObservationGapRequest[] = [];
  const priorFingerprints: string[] = [...(options.alreadyKnownFingerprints ?? [])];
  let stopReason: CampaignStopReason = 'ROUND_BUDGET_EXHAUSTED';
  let previousWinner: string | null = null;
  let previousRatio: number | null = null;
  let lastResidualFindings: readonly ResidualFinding[] = [];
  let lastFitByFingerprint = new Map<string, { rss: number; predict: (input: ModelInput) => number; coefficients: readonly number[] }>();

  for (let round = 1; round <= maxRounds; round += 1) {
    const fitted: { model: LiveModel; rss: number; predict: (input: ModelInput) => number; coefficients: readonly number[] }[] = [];
    for (const model of live) {
      const fit = fitModelSpec(model.spec, admitted);
      if (fit.ok) fitted.push({ model, rss: fit.rss, predict: fit.predict, coefficients: fit.coefficients });
    }
    if (fitted.length === 0) {
      stopReason = 'ALL_MODELS_UNFITTABLE';
      break;
    }
    lastFitByFingerprint = new Map(fitted.map((f) => [f.model.fingerprint, { rss: f.rss, predict: f.predict, coefficients: f.coefficients }]));

    // Rank: lowest weighted RSS wins; a tie is broken toward the simpler model.
    /*
     * M3 PARSIMONY. Ranking by raw weighted RSS always favours the more complex
     * model, because an extra free coefficient can only lower it — which is how
     * an engine talks itself into an elaborate model that has merely absorbed
     * noise. Ranking is therefore by `modelSelectionScore` (chi-square plus
     * k·ln(n)); RSS is still reported unchanged, so raw fit quality stays
     * visible next to the penalised comparison, and `modelComplexity` remains
     * the final tie-break it always was.
     */
    const selectionScoreOf = (entry: { model: LiveModel; rss: number }): number =>
      modelSelectionScore(entry.rss, estimatedCoefficientCount(entry.model.spec), admitted.length);
    const ranked = [...fitted].sort(
      (a, b) => selectionScoreOf(a) - selectionScoreOf(b) || a.rss - b.rss || modelComplexity(a.model.spec) - modelComplexity(b.model.spec),
    );
    const best = ranked[0]!;
    const runnerUp = ranked[1] ?? null;
    const rssRatio = runnerUp === null ? null : best.rss === runnerUp.rss ? 1 : best.rss / Math.max(runnerUp.rss, 1e-12);
    const decisive = rssRatio !== null && rssRatio < DECISIVE_RSS_RATIO;

    for (const entry of fitted) {
      const current = beliefs.get(entry.model.fingerprint)!;
      if (!decisive) {
        beliefs.set(entry.model.fingerprint, updateConfidence(current, 'INCONCLUSIVE', 0, `Round ${round}: no model is decisively ahead (best/runner-up RSS ratio ${rssRatio === null ? 'n/a' : rssRatio.toFixed(4)}).`, round));
        continue;
      }
      const isWinner = entry.model.fingerprint === best.model.fingerprint;
      beliefs.set(entry.model.fingerprint, updateConfidence(
        current,
        isWinner ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL',
        Math.min(1, Math.max(0, 1 - rssRatio!)),
        `Round ${round}: weighted RSS ${entry.rss.toFixed(6)}; best/runner-up ratio ${rssRatio!.toFixed(4)} (decisive below ${DECISIVE_RSS_RATIO}).`,
        round,
      ));
    }

    // --- residual structure of the CURRENT best, and models derived from it ---
    const residualFindings = analyzeResidualStructure(best.model.spec, { ok: true, rss: best.rss, predict: best.predict, coefficients: best.coefficients }, admitted);
    lastResidualFindings = residualFindings;
    const derivedThisRound: CampaignModelView[] = [];
    const integrityFlagsThisRound: IntegrityFlag[] = [];
    /** Latest round any point CURRENTLY admitted actually entered — what any model derived from residuals over `admitted` this round is really "after". */
    const residualObservationRound = Math.max(0, ...admitted.map((p) => admittedAtRound.get(p.x) ?? 0));
    for (const proposal of proposeModelsFromResiduals(
      best.model.spec,
      { ok: true, rss: best.rss, predict: best.predict, coefficients: best.coefficients },
      admitted,
      { xRange: lab.xRange, maxTerms: constraints.maxTerms + 1 },
    )) {
      const print = modelSpecFingerprint(proposal.spec);
      // Novelty gate (F2/F5-2): the one admission check that still REJECTS
      // outright — an exact-fingerprint duplicate of an already-live model is
      // harmless deduplication, not suppressed science (see this file's own
      // header comment). Every other integrity concern below FLAGS instead.
      if (!isNovel(print, live)) continue;
      if (admitOrSkip(proposal.spec).verdict !== 'ALLOW') continue;
      const entering: LiveModel = {
        spec: proposal.spec,
        fingerprint: print,
        enteredAtRound: round,
        derivedFrom: best.model.fingerprint,
        derivationOperator: proposal.spec.lineage?.operator ?? `RESIDUAL_${proposal.motivatedBy.kind}`,
      };
      live.push(entering);
      beliefs.set(print, createHypothesis(print, criterionFor(entering, lab), 0.5, 'RESIDUAL_FROM_FIT', best.model.fingerprint));
      derivedThisRound.push(viewOf(entering, null));

      const temporalFlag = checkTemporalLineage(entering, residualObservationRound, round);
      if (temporalFlag !== null) integrityFlagsThisRound.push(temporalFlag);
      const smugglingFlag = checkExcludedBasisSmuggling(proposal.spec, options.excludeBases, print, round);
      if (smugglingFlag !== null) integrityFlagsThisRound.push(smugglingFlag);
    }

    const predictors = fitted.map((f) => ({ predict: f.predict }));
    const unobserved = remaining.filter((x) => !admitted.some((p) => p.x === x));
    const sigmaGuess = admitted.length > 0 ? admitted.reduce((acc, p) => acc + p.sigma, 0) / admitted.length : 0;

    /*
     * M1 — the level-3 boundary, gated STRICTLY BEFORE ranking (F2/F5-10).
     * `discriminationScore` here is the BEST Sep achievable by ANY unobserved
     * candidate, computed independently of Fals/Redund — never the Sep of
     * whichever candidate the C3-1 combined score happens to prefer. Gate
     * membership must not depend on the refined ranking: a campaign could
     * otherwise raise a false gap (or miss a real one) purely because Fals/
     * Redund pushed the combined-score winner to a candidate with a
     * different Sep than the true best-available one. Whether an experiment
     * can discriminate AT ALL is a property of raw measurement uncertainty,
     * not of how novel or falsifying the eventually-CHOSEN candidate is.
     */
    const discriminationScore: number | null = unobserved.length === 0
      ? null
      : (() => {
        const maxSep = Math.max(...unobserved.map((x) => discriminationAt(x, predictors, sigmaGuess)));
        return Number.isFinite(maxSep) ? maxSep : null;
      })();

    const gapTrigger = classifyObservationGap({ unobservedCount: unobserved.length, bestDiscriminability: discriminationScore });
    let observationGap: ObservationGapRequest | null = null;
    let selectionReason = 'No unobserved experiment remains in this laboratory.';
    if (gapTrigger !== null) {
      // Converged questions need no further measurement: the models already separated.
      const alreadySettled = decisive && best.model.fingerprint === previousWinner && beliefs.get(best.model.fingerprint)!.confidence >= CONVERGENCE_CONFIDENCE;
      if (!alreadySettled) {
        observationGap = createObservationGapRequest({
          campaignId: lab.labId,
          round,
          liveHypothesisIds: fitted.map((f) => f.model.fingerprint),
          unobservedCount: unobserved.length,
          bestDiscriminability: discriminationScore,
          trigger: gapTrigger,
          requiredObservable: lab.declareObservable?.() ?? {
            quantity: lab.yLabel,
            unit: 'UNDECLARED',
            instrumentClass: 'UNDECLARED',
          },
          feasibility: lab.declareFeasibility?.(gapTrigger)
            ?? undeclaredFeasibility(`Laboratory "${lab.labId}" declares no instrument feasibility, so cost, lead time and availability are unknown rather than estimated.`),
          requestedFrom: lab.gapRecipient ?? 'HUMAN',
        });
        selectionReason = observationGap.rationale;
      }
    }

    // --- ranking (C3-1): only reached once the pre-ranking gate has passed ---
    let selectedNextX: number | null = null;
    let falsificationScore: number | null = null;
    let redundancyScore: number | null = null;
    let plannerScore: number | null = null;
    if (observationGap === null && unobserved.length > 0) {
      let bestScore = -Infinity;
      let bestCandidateX: number | null = null;
      let bestSep = 0;
      let bestFals = 0;
      let bestRedund = 0;
      for (const x of unobserved) {
        const sep = discriminationAt(x, predictors, sigmaGuess);
        const fals = falsificationPowerAt(x, predictors, sigmaGuess);
        const redund = redundancyAt(x, admitted, candidateSpan);
        const combined = sep * (1 + REFINEMENT_WEIGHT * fals) * (1 - REFINEMENT_WEIGHT * redund);
        if (combined > bestScore) {
          bestScore = combined;
          bestCandidateX = x;
          bestSep = sep;
          bestFals = fals;
          bestRedund = redund;
        }
      }
      falsificationScore = bestFals;
      redundancyScore = bestRedund;
      plannerScore = Number.isFinite(bestScore) ? bestScore : null;
      if (bestCandidateX !== null) {
        selectedNextX = bestCandidateX;
        selectionReason = `Chose ${lab.xLabel}=${selectedNextX}: live models' predictions disagree there by ${bestSep.toFixed(3)}× the typical observation sigma (Sep, above the ${TAU_DISCRIMINABILITY}σ floor below which an experiment cannot discriminate), Fals=${bestFals} (a real falsification of at least one live model is${bestFals === 1 ? '' : ' not'} possible here), and it sits ${((bestRedund) * 100).toFixed(0)}% of the way to fully redundant with the nearest admitted point (Redund) — combined planner score ${plannerScore?.toFixed(3)} was the highest among ${unobserved.length} unobserved candidate(s).`;
      } else {
        selectionReason = 'No candidate experiment produced a finite planner score.';
      }
    }

    const roundFingerprint = fnv1a(canonicalJson({
      round,
      admittedX: admitted.map((p) => p.x),
      ranked: ranked.map((r) => ({ f: r.model.fingerprint, rss: Number(r.rss.toPrecision(12)) })),
      selectedNextX,
    }));
    const antiHarking = checkAntiHarkingAnchor(priorFingerprints, [roundFingerprint]);
    const holdout = holdoutDiagnostic(best.model.spec, admitted);

    rounds.push({
      round,
      admittedX: admitted.map((p) => p.x),
      models: ranked.map((r) => viewOf(r.model, r.rss)),
      bestFingerprint: best.model.fingerprint,
      runnerUpFingerprint: runnerUp?.model.fingerprint ?? null,
      decisive,
      rssRatio,
      residualFindings,
      derivedThisRound,
      selectedNextX,
      selectionReason,
      discriminationScore,
      falsificationScore,
      redundancyScore,
      plannerScore,
      beliefs: [...beliefs.values()],
      antiHarking,
      roundFingerprint,
      observationGap,
      integrityFlags: integrityFlagsThisRound,
      holdout,
      bestHoldoutScore: holdoutScore(best.model.spec, admitted),
    });
    priorFingerprints.push(roundFingerprint);
    if (observationGap !== null) observationGaps.push(observationGap);

    if (!antiHarking.intact) { stopReason = 'ANTI_HARKING_VIOLATION'; break; }

    if (decisive && best.model.fingerprint === previousWinner && beliefs.get(best.model.fingerprint)!.confidence >= CONVERGENCE_CONFIDENCE) {
      stopReason = 'CONVERGENCE';
      break;
    }
    if (!decisive && previousRatio !== null && rssRatio !== null && Math.abs(rssRatio - previousRatio) < NO_INFORMATION_GAIN_EPSILON) {
      stopReason = 'NO_INFORMATION_GAIN';
      break;
    }
    /*
     * A gap raised over a NON-EMPTY remaining space is the new stop: there are
     * experiments left, and the engine is declining all of them because none
     * discriminates. Exhaustion keeps its own long-standing reason — "nothing
     * left to run" and "what is left is worthless" are different facts and are
     * reported as different facts.
     */
    if (observationGap !== null && unobserved.length > 0) { stopReason = 'OBSERVATION_GAP'; break; }
    if (selectedNextX === null) { stopReason = 'EXPERIMENT_SPACE_EXHAUSTED'; break; }

    const observed = lab.observe(selectedNextX);
    if (observed === null) { stopReason = 'EXPERIMENT_SPACE_EXHAUSTED'; break; }
    admitted.push(observed);
    admittedAtRound.set(observed.x, round);
    admitted.sort((a, b) => a.x - b.x);

    previousWinner = decisive ? best.model.fingerprint : null;
    previousRatio = rssRatio;
  }

  const finalRound = rounds[rounds.length - 1] ?? null;
  const winner = finalRound?.bestFingerprint ?? null;
  const winnerModel = winner === null ? null : live.find((m) => m.fingerprint === winner) ?? null;
  const winnerFit = winner === null ? null : lastFitByFingerprint.get(winner) ?? null;

  const surviving = finalRound === null ? [] : finalRound.models.filter((m) => (beliefs.get(m.fingerprint)?.confidence ?? 0) >= 0.5);
  const falsified = finalRound === null ? [] : finalRound.models.filter((m) => (beliefs.get(m.fingerprint)?.confidence ?? 0) < 0.5);

  // Computed here (not only in the return statement below) so M2 can log the
  // real run identity as `falsifiedBy.campaignId` — the SAME fingerprint the
  // caller receives on `CampaignResult.campaignFingerprint`, not a second one.
  const campaignFingerprint = fnv1a(canonicalJson({ labId: lab.labId, rounds: rounds.map((r) => r.roundFingerprint), stopReason, winner }));

  if (options.respectFalsifiedModelRegistry && finalRound !== null) {
    for (const view of falsified) {
      const hypothesis = beliefs.get(view.fingerprint);
      const model = live.find((m) => m.fingerprint === view.fingerprint);
      if (!hypothesis || !model || hypothesis.status !== 'FALSIFIED_WITHIN_PROTOCOL') continue;
      if (consultFalsifiedModelRegistry({ spec: model.spec, scope: scopeForLab }).verdict === 'ALLOW') {
        recordFalsification({
          spec: model.spec,
          scope: scopeForLab,
          // A single campaign's own RSS comparison only supports "worse than
          // its rivals in THIS laboratory" — never a universal claim — so
          // automatic recording never reaches for NEVER or COMPONENT.
          reusableAs: 'VARIANT_ONLY',
          evidence: hypothesis,
          campaignId: campaignFingerprint,
          round: finalRound.round,
          observationIds: finalRound.admittedX.map((x) => `${lab.labId}:x=${x}`),
        });
      } // else: already standing (append-only, no need to pile up a duplicate entry every re-run).
    }
  }

  const winningFormulaWithCoefficients = winnerModel === null || winnerFit === null
    ? null
    : `${renderModelSpec(winnerModel.spec)}   with  [${winnerFit.coefficients.map((c) => c.toPrecision(6)).join(', ')}]`;

  const practicalCandidate: PracticalCandidate | null = winnerModel === null ? null : {
    derivedFromModelFingerprint: winnerModel.fingerprint,
    statement: `Within this laboratory's observed range of ${lab.xLabel} (${lab.xRange.min}–${lab.xRange.max}), ${lab.yLabel} is best described by ${renderModelSpec(winnerModel.spec)}.`,
    constraints: [
      `Established only over the observed range of ${lab.xLabel}; extrapolation beyond it is not supported by this campaign.`,
      `Rests on the declared model grammar (${constraints.maxTerms} terms max); a form outside that grammar was never a candidate.`,
    ],
    requiredValidation: [
      'Independent observations at values this campaign did not admit.',
      'Replication of the underlying measurements by an independent pipeline.',
    ],
    proposedProtocol: null,
    protocolWithheldReason:
      'This campaign established a DESCRIPTIVE relationship, not an intervention. No manipulable parameter was varied by the engine, so no actionable protocol follows from it; emitting one would mean inventing parameters this evidence does not contain.',
  };

  const discovery: Discovery = {
    question: lab.problem,
    survivingModels: surviving,
    falsifiedModels: falsified,
    winningModel: winnerModel === null ? null : viewOf(winnerModel, winnerFit?.rss ?? null),
    winningFormulaWithCoefficients,
    supportingEvidence: finalRound === null ? [] : [
      `${finalRound.admittedX.length} real observations admitted at ${lab.xLabel} = [${finalRound.admittedX.join(', ')}].`,
      finalRound.decisive
        ? `Best model's weighted RSS is ${finalRound.rssRatio!.toFixed(4)}× the runner-up's, below the ${DECISIVE_RSS_RATIO} decisiveness threshold.`
        : `No model separated decisively (best/runner-up RSS ratio ${finalRound.rssRatio === null ? 'n/a' : finalRound.rssRatio.toFixed(4)}).`,
    ],
    counterEvidence: lastResidualFindings.map((f) => f.evidence),
    uncertainty: winnerFit === null
      ? 'No fittable model, so no uncertainty statement is meaningful.'
      : `Weighted RSS ${winnerFit.rss.toFixed(6)} over ${admitted.length} points; per-point sigma came from the laboratory, not from this engine.`,
    assumptions: CAMPAIGN_ASSUMPTIONS,
    residualFindings: lastResidualFindings,
    /*
     * When the campaign ended holding an open gap, the honest answer to "what
     * next?" is the MISSING MEASUREMENT, not null and not an experiment from a
     * list that cannot settle anything.
     */
    nextExperiment: finalRound === null
      ? null
      : finalRound.observationGap !== null
        ? `REQUESTED OBSERVATION (not available in this laboratory): ${finalRound.observationGap.requiredObservable.quantity} [${finalRound.observationGap.requiredObservable.unit}] via ${finalRound.observationGap.requiredObservable.instrumentClass} — ${finalRound.observationGap.rationale}`
        : finalRound.selectedNextX === null
          ? null
          : `${lab.xLabel} = ${finalRound.selectedNextX} (${finalRound.selectionReason})`,
    practicalCandidate,
    decisionBasis: finalRound === null
      ? 'No round completed.'
      : `Stopped with ${stopReason} after ${rounds.length} round(s). ${finalRound.selectionReason}`,
  };

  return {
    contractVersion: DISCOVERY_CAMPAIGN_CONTRACT_VERSION,
    labId: lab.labId,
    problem: lab.problem,
    rounds,
    stopReason,
    discovery,
    campaignFingerprint,
    registrySkips,
    observationGaps,
    gapLedgerFingerprint: observationGapLedgerFingerprint(observationGaps),
    integrityFlags: rounds.flatMap((r) => r.integrityFlags),
  };
}
