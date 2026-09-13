import { fnv1a, canonicalJson } from '../events/hash';
import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import { checkAntiHarkingAnchor, type AntiHarkingCheck } from '../experimentFabric/hypothesisLoop';
import {
  fitModelSpec,
  generateModelSpace,
  modelComplexity,
  modelSpecFingerprint,
  renderModelSpec,
  type ModelInput,
  type ModelPoint,
  type ModelSpec,
  type ModelSpaceConstraints,
} from './modelSpace';
import { analyzeResidualStructure, proposeModelsFromResiduals, type ResidualFinding } from './residualStructure';

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
}

export type CampaignStopReason =
  | 'CONVERGENCE'
  | 'NO_INFORMATION_GAIN'
  | 'EXPERIMENT_SPACE_EXHAUSTED'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'ANTI_HARKING_VIOLATION'
  | 'ALL_MODELS_UNFITTABLE';

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
}

export interface CampaignOptions {
  readonly maxRounds?: number;
  readonly maxTerms?: number;
  readonly excludeBases?: ModelSpaceConstraints['excludeBases'];
  /** Fingerprints the caller already knew before the campaign began (anti-HARK anchor). */
  readonly alreadyKnownFingerprints?: readonly string[];
}

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
 * Fals — how many of the live models' PAIRS would be separated (predictions
 * more than `FALSIFICATION_SIGMA_THRESHOLD` sigma apart) if `x` were
 * observed, as a fraction of all pairs. Distinct from `discriminationAt`'s
 * single spread number: a handful of extreme models can dominate that
 * spread while leaving most pairs unseparated, whereas this counts how many
 * pairs a real observation here could actually falsify one member of.
 */
export function falsificationPowerAt(
  x: number,
  fits: readonly { readonly predict: (x: number) => number }[],
  sigmaAtX: number,
): number {
  if (fits.length < 2) return 0;
  const predictions = fits.map((f) => f.predict(x)).filter((v) => Number.isFinite(v));
  if (predictions.length < 2) return 0;
  let pairs = 0;
  let separated = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    for (let j = i + 1; j < predictions.length; j += 1) {
      pairs += 1;
      if (Math.abs(predictions[i]! - predictions[j]!) > FALSIFICATION_SIGMA_THRESHOLD * Math.max(sigmaAtX, 1e-12)) separated += 1;
    }
  }
  return pairs === 0 ? 0 : separated / pairs;
}

/**
 * Redund — how close `x` sits to an already-admitted observation, as a
 * fraction of the laboratory's full candidate span: 0 = as far as any
 * candidate can be from what has already been observed, 1 = adjacent to (or
 * coincident with) an admitted point. High redundancy means observing here
 * would likely repeat, rather than add to, what admitted points already
 * constrain — a SOFTER notion than the hard exact-value filter (`unobserved`
 * below) that only blocks re-selecting the identical x already admitted.
 */
export function redundancyAt(x: number, admittedX: readonly number[], candidateSpan: number): number {
  if (admittedX.length === 0 || candidateSpan <= 0) return 0;
  const nearest = Math.min(...admittedX.map((a) => Math.abs(a - x)));
  return Math.max(0, 1 - nearest / candidateSpan);
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

  const live: LiveModel[] = generateModelSpace(constraints).map((spec) => ({
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
  for (const x of ordered.slice(0, SEED_OBSERVATIONS)) {
    const observed = lab.observe(x);
    if (observed !== null) admitted.push(observed);
  }
  const remaining = ordered.filter((x) => !admitted.some((p) => p.x === x));
  const candidateSpan = Math.max(...lab.candidateX) - Math.min(...lab.candidateX);

  const rounds: CampaignRound[] = [];
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
    const ranked = [...fitted].sort((a, b) => a.rss - b.rss || modelComplexity(a.model.spec) - modelComplexity(b.model.spec));
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
    for (const proposal of proposeModelsFromResiduals(
      best.model.spec,
      { ok: true, rss: best.rss, predict: best.predict, coefficients: best.coefficients },
      admitted,
      { xRange: lab.xRange, maxTerms: constraints.maxTerms + 1 },
    )) {
      const print = modelSpecFingerprint(proposal.spec);
      if (live.some((m) => m.fingerprint === print)) continue;
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
    }

    // --- choose the next experiment: planner score = Sep × (1 + Fals) × (1 − Redund) ---
    const predictors = fitted.map((f) => ({ predict: f.predict }));
    let selectedNextX: number | null = null;
    let discriminationScore: number | null = null;
    let falsificationScore: number | null = null;
    let redundancyScore: number | null = null;
    let plannerScore: number | null = null;
    let selectionReason = 'No unobserved experiment remains in this laboratory.';
    const unobserved = remaining.filter((x) => !admitted.some((p) => p.x === x));
    if (unobserved.length > 0) {
      const sigmaGuess = admitted.reduce((acc, p) => acc + p.sigma, 0) / admitted.length;
      const admittedX = admitted.map((p) => p.x);
      let bestScore = -Infinity;
      let bestSep = 0;
      let bestFals = 0;
      let bestRedund = 0;
      for (const x of unobserved) {
        const sep = discriminationAt(x, predictors, sigmaGuess);
        const fals = falsificationPowerAt(x, predictors, sigmaGuess);
        const redund = redundancyAt(x, admittedX, candidateSpan);
        const combined = sep * (1 + REFINEMENT_WEIGHT * fals) * (1 - REFINEMENT_WEIGHT * redund);
        if (combined > bestScore) {
          bestScore = combined;
          selectedNextX = x;
          bestSep = sep;
          bestFals = fals;
          bestRedund = redund;
        }
      }
      discriminationScore = Number.isFinite(bestSep) ? bestSep : null;
      falsificationScore = Number.isFinite(bestFals) ? bestFals : null;
      redundancyScore = Number.isFinite(bestRedund) ? bestRedund : null;
      plannerScore = Number.isFinite(bestScore) ? bestScore : null;
      selectionReason = selectedNextX === null
        ? 'No candidate experiment produced a finite planner score.'
        : `Chose ${lab.xLabel}=${selectedNextX}: live models' predictions disagree there by ${discriminationScore?.toFixed(3)}× the typical observation sigma (Sep), ${((falsificationScore ?? 0) * 100).toFixed(0)}% of live-model pairs would be separated at ${FALSIFICATION_SIGMA_THRESHOLD}σ if observed here (Fals), and it sits ${((redundancyScore ?? 0) * 100).toFixed(0)}% of the candidate span's worth of redundancy from the nearest admitted point (Redund) — combined planner score ${plannerScore?.toFixed(3)} was the highest among ${unobserved.length} unobserved candidate(s).`;
    }

    const roundFingerprint = fnv1a(canonicalJson({
      round,
      admittedX: admitted.map((p) => p.x),
      ranked: ranked.map((r) => ({ f: r.model.fingerprint, rss: Number(r.rss.toPrecision(12)) })),
      selectedNextX,
    }));
    const antiHarking = checkAntiHarkingAnchor(priorFingerprints, [roundFingerprint]);

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
    });
    priorFingerprints.push(roundFingerprint);

    if (!antiHarking.intact) { stopReason = 'ANTI_HARKING_VIOLATION'; break; }

    if (decisive && best.model.fingerprint === previousWinner && beliefs.get(best.model.fingerprint)!.confidence >= CONVERGENCE_CONFIDENCE) {
      stopReason = 'CONVERGENCE';
      break;
    }
    if (!decisive && previousRatio !== null && rssRatio !== null && Math.abs(rssRatio - previousRatio) < NO_INFORMATION_GAIN_EPSILON) {
      stopReason = 'NO_INFORMATION_GAIN';
      break;
    }
    if (selectedNextX === null) { stopReason = 'EXPERIMENT_SPACE_EXHAUSTED'; break; }

    const observed = lab.observe(selectedNextX);
    if (observed === null) { stopReason = 'EXPERIMENT_SPACE_EXHAUSTED'; break; }
    admitted.push(observed);
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
    assumptions: [
      'Observations are independent and their reported sigmas are correct.',
      'The true relationship lies within the declared model grammar.',
      'Each basis term is linear in its coefficient; nonlinear shape parameters were enumerated, not optimised.',
    ],
    residualFindings: lastResidualFindings,
    nextExperiment: finalRound?.selectedNextX === null || finalRound === null ? null : `${lab.xLabel} = ${finalRound.selectedNextX} (${finalRound.selectionReason})`,
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
    campaignFingerprint: fnv1a(canonicalJson({ labId: lab.labId, rounds: rounds.map((r) => r.roundFingerprint), stopReason, winner })),
  };
}
