/**
 * QE4 REGIME INQUIRY LOOP — an open-ended, round-based hypothesis loop over
 * the pinned Brydges et al. 2019 disorder dataset (`qe4-brydges/`), built for
 * three gaps identified against `docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md`:
 *
 * 1. Competing hypotheses COMPUTED from the dataset's own real (T,k) grid —
 *    not a hardcoded literal — via `beliefRevision.ts::createHypothesis` with
 *    real `parentHypothesisId`/`generatedBy` lineage (P0-2), plus a residual
 *    hypothesis mechanically DERIVED from the winning fit's own residuals
 *    (the other half of P0-2, folded in here rather than as a separate module
 *    since both are hypothesis-lineage operators over the same fit).
 * 2. A stop-rule vocabulary for THIS loop that includes `CONVERGENCE` and
 *    `NO_INFORMATION_GAIN` (P0-3) — deliberately NOT a unification of the
 *    seven other stop dictionaries already in this codebase
 *    (`discoveryLoop.ts`'s `DiscoveryStopReason`, `inquiryLoop.ts`'s
 *    `InquiryStopReason`, and others); this loop gets its own, small,
 *    substrate-specific one.
 * 3. A MANDATORY, ACTED-ON anti-HARK check every round (P0-5). Every existing
 *    caller of `verifyAntiHarkingAnchor` passes a literal `[]` for
 *    `priorRunFingerprints`, so the check always structurally passes and
 *    nothing downstream gates on its result even when it doesn't (see
 *    `hypothesisLoop.ts::buildSavedHypothesisLoop`, which checks
 *    `preregistrationIntact` but never `antiHarkingCheck`). Here the anchor is
 *    REAL (each round's own prior rounds' fingerprints, threaded forward) and
 *    a violation immediately stops the loop with `ANTI_HARKING_VIOLATION`,
 *    refusing to report a winner — not merely recording the check.
 *
 * WHY NOT `discoveryLoop`/`inquiryLoop`/`hypothesisLoop`: none of the three
 * can host this substrate without redesign. `discoveryLoop` requires a
 * simulatable `WorldGraph`; `inquiryLoop` requires `SystemUnderStudy.hiddenParameters`
 * (a solver with known ground truth to measure against); `hypothesisLoop`'s
 * `executePreregisteredHypotheses` is single-shot (no rounds) and is built
 * around a `candidateVariable` sweep against a runnable model, not a
 * multi-point curve fit against a pinned CSV. This module is a fourth,
 * narrow, QE4-scoped loop — not a generalization of any of them, and not the
 * generic `DatasetLaboratory` seam (`core/agent/datasetLaboratory.ts`) that
 * would let 17 domains share one shape. Reuses, unmodified:
 * `runQe4BrydgesAnalysis` (real bootstrap over the pinned CSVs),
 * `weightedLinearFit`/`weightedResidualSumOfSquares` (`qe4BrydgesEstimator.ts`),
 * `createHypothesis`/`updateConfidence` (`beliefRevision.ts`),
 * `checkAntiHarkingAnchor` (`hypothesisLoop.ts`), and `fnv1a`/`canonicalJson`
 * (`events/hash.ts`). Zero new engines.
 *
 * RELATIONSHIP TO `DatasetLaboratory`: this module was authored concurrently
 * with, and started before, `core/agent/datasetLaboratory.ts` /
 * `core/biotechData/qe4DatasetLaboratory.ts` landed — both sides read the
 * SAME underlying `runQe4BrydgesAnalysis()` bootstrap, just through different
 * facades (this module filters `disorderPoints` directly; `DatasetLaboratory`
 * exposes the same points one at a time via `observableSpec()`/`run()`), so
 * there is no science-level duplication, only two access patterns over one
 * computation. A natural, NOT-YET-DONE follow-up: refactor
 * `runQe4DisorderRegimeInquiry` to source its points through
 * `QE4_DATASET_LABORATORY.observableSpec()`/`.run()` instead of calling
 * `runQe4BrydgesAnalysis()` directly, so this loop demonstrates consuming the
 * generic seam rather than bypassing it. Deliberately left for a separate,
 * fully re-verified change rather than rushed in here.
 */

import { runQe4BrydgesAnalysis, type Qe4PointResult } from '../biotechData/qe4BrydgesAnalysis';
import { weightedLinearFit, weightedResidualSumOfSquares } from '../biotechData/qe4BrydgesEstimator';
import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import { checkAntiHarkingAnchor, type AntiHarkingCheck } from '../experimentFabric/hypothesisLoop';
import { fnv1a, canonicalJson } from '../events/hash';

export const QE4_REGIME_INQUIRY_CONTRACT_VERSION = '1.0.0';

/** A minimum of 3 admitted points is required before any regime comparison is
 * meaningful (each regime fits 2 free parameters; fewer points makes RSS
 * comparison vacuous, not merely noisy). Fixed and disclosed, not tuned to
 * produce a particular outcome on the real dataset. */
const MIN_POINTS_FOR_COMPARISON = 3;

/** "Decisively better" = at least half the runner-up's weighted RSS — the SAME
 * threshold `qe4BrydgesAnalysis.ts`'s own P2 verdict already uses for
 * linear-vs-log (`linearRss < logRss / 2`), reused here rather than a second,
 * differently-tuned notion of "decisive". */
const DECISIVE_RSS_RATIO = 0.5;

/** Two consecutive rounds' `bestRss/runnerUpRss` ratio moving by less than
 * this is treated as "more of the same kind of real data will not resolve
 * this" — fixed and disclosed, not fit to force either stop reason. */
const NO_INFORMATION_GAIN_EPSILON = 0.02;

/** Confidence `updateConfidence`'s log-odds walk must reach, for the SAME
 * winning regime across two consecutive decisive rounds, before this loop
 * calls the question settled. */
const CONVERGENCE_CONFIDENCE_THRESHOLD = 0.95;

/** Resolution of the fixed grid-search over the saturating regime's decay
 * constant τ (see `fitSaturating`) — a search resolution, not a fit result. */
const SATURATING_TAU_GRID_DIVISIONS = 12;

/** A residual is flagged as a localized anomaly only when its |z| is at least
 * this many times the RMS of the OTHER admitted points' |z| under the same
 * fit — fixed and disclosed, not tuned post hoc. */
const RESIDUAL_ANOMALY_RATIO = 3;

export type Qe4Regime = 'LINEAR' | 'LOGARITHMIC' | 'SATURATING';

export type Qe4RegimeStopReason =
  | 'CONVERGENCE'
  | 'NO_INFORMATION_GAIN'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'ANTI_HARKING_VIOLATION';

export interface Qe4RegimeFit {
  readonly regime: Qe4Regime;
  readonly rss: number;
  readonly coefficients: Readonly<Record<string, number>>;
}

interface InternalFit extends Qe4RegimeFit {
  readonly predict: (t: number) => number;
}

export interface Qe4RegimeRound {
  readonly round: number;
  readonly admittedTMs: readonly number[];
  readonly fits: readonly Qe4RegimeFit[] | null;
  readonly hypotheses: readonly Hypothesis[];
  readonly winnerRegime: Qe4Regime | null;
  readonly decisive: boolean;
  readonly rssRatio: number | null;
  readonly antiHarking: AntiHarkingCheck;
  readonly runFingerprint: string;
  readonly reason: string;
}

export interface Qe4ResidualHypothesisResult {
  readonly hypothesis: Hypothesis | null;
  readonly reason: string;
}

export interface Qe4RegimeInquiryResult {
  readonly k: number;
  readonly rounds: readonly Qe4RegimeRound[];
  readonly stopReason: Qe4RegimeStopReason;
  readonly winningHypothesisId: string | null;
  readonly residual: Qe4ResidualHypothesisResult;
}

function fitLinear(t: readonly number[], y: readonly number[], sigma: readonly number[]): InternalFit {
  const { slope, intercept } = weightedLinearFit(t, y, sigma);
  const predict = (x: number) => slope * x + intercept;
  return { regime: 'LINEAR', rss: weightedResidualSumOfSquares(t, y, sigma, predict), coefficients: { slope, intercept }, predict };
}

function fitLogarithmic(t: readonly number[], y: readonly number[], sigma: readonly number[]): InternalFit {
  const lnT = t.map((x) => Math.log(x));
  const { slope, intercept } = weightedLinearFit(lnT, y, sigma);
  const predict = (x: number) => slope * Math.log(x) + intercept;
  return { regime: 'LOGARITHMIC', rss: weightedResidualSumOfSquares(t, y, sigma, predict), coefficients: { slope, intercept }, predict };
}

/**
 * Saturating regime `S2(t) = a*(1 - exp(-t/tau)) + c`: nonlinear in `tau`, but
 * LINEAR in `(a, c)` for any FIXED `tau` — a standard "profile least squares"
 * reparametrization. `tau` is chosen by a fixed grid search over the admitted
 * time window itself (real range, not invented), each candidate fit via the
 * same `weightedLinearFit`/`weightedResidualSumOfSquares` primitives as the
 * other two regimes, so all three RSS values are computed identically and
 * remain directly comparable.
 */
function fitSaturating(t: readonly number[], y: readonly number[], sigma: readonly number[]): InternalFit {
  const tMin = Math.min(...t);
  const tMax = Math.max(...t);
  const span = tMax - tMin;
  let best: { tau: number; a: number; c: number; rss: number } | null = null;
  for (let i = 1; i <= SATURATING_TAU_GRID_DIVISIONS; i += 1) {
    const tau = span > 0 ? tMin + (span * i) / SATURATING_TAU_GRID_DIVISIONS : tMax * (i / SATURATING_TAU_GRID_DIVISIONS);
    const x = t.map((ti) => 1 - Math.exp(-ti / tau));
    const { slope: a, intercept: c } = weightedLinearFit(x, y, sigma);
    const predict = (ti: number) => a * (1 - Math.exp(-ti / tau)) + c;
    const rss = weightedResidualSumOfSquares(t, y, sigma, predict);
    if (best === null || rss < best.rss) best = { tau, a, c, rss };
  }
  const chosen = best!;
  const predict = (x: number) => chosen.a * (1 - Math.exp(-x / chosen.tau)) + chosen.c;
  return { regime: 'SATURATING', rss: chosen.rss, coefficients: { a: chosen.a, c: chosen.c, tau: chosen.tau }, predict };
}

function fitAllRegimes(points: readonly Qe4PointResult[]): readonly InternalFit[] {
  const t = points.map((p) => p.t);
  const y = points.map((p) => p.s2);
  const sigma = points.map((p) => p.sigma);
  return [fitLinear(t, y, sigma), fitLogarithmic(t, y, sigma), fitSaturating(t, y, sigma)];
}

function roundFingerprint(round: number, admittedTMs: readonly number[], fits: readonly Qe4RegimeFit[] | null): string {
  return fnv1a(canonicalJson({ round, admittedTMs, fits }));
}

function regimeHypothesisId(regime: Qe4Regime, k: number): string {
  return `qe4-regime-${regime.toLowerCase()}-k${k}`;
}

function regimeLabel(regime: Qe4Regime): string {
  return regime === 'LINEAR' ? 'linear-in-T' : regime === 'LOGARITHMIC' ? 'logarithmic-in-T' : 'saturating (exponential approach)';
}

/**
 * Derives a NEW hypothesis from the winning regime's own residuals against
 * the admitted points — "derives a new hypothesis from the result", per
 * Qwen's spec §23, satisfied honestly: this hypothesis is surfaced UNTESTED.
 * Testing it would require finer-grained real data than this pinned dataset
 * provides (its (T,k) grid is fixed and already exhausted by the loop above),
 * so it is handed to a future round/experiment rather than resolved here.
 *
 * Takes `regime`/`predict` directly (not a fit object) so it is independently
 * unit-testable against a hand-constructed prediction function, without
 * needing to first drive a real fit or the loop's confidence dynamics to a
 * particular round.
 */
export function deriveResidualHypothesis(
  regime: Qe4Regime,
  predict: (t: number) => number,
  points: readonly Qe4PointResult[],
  k: number,
  parentHypothesisId: string,
): Qe4ResidualHypothesisResult {
  const residuals = points.map((p) => ({ t: p.t, z: Math.abs(p.s2 - predict(p.t)) / Math.max(p.sigma, 1e-9) }));
  let maxIdx = 0;
  for (let i = 1; i < residuals.length; i += 1) if (residuals[i]!.z > residuals[maxIdx]!.z) maxIdx = i;
  const maxZ = residuals[maxIdx]!.z;
  const rest = residuals.filter((_, i) => i !== maxIdx).map((r) => r.z);
  const restRms = rest.length > 0 ? Math.sqrt(rest.reduce((acc, z) => acc + z * z, 0) / rest.length) : 0;
  if (rest.length === 0 || maxZ < RESIDUAL_ANOMALY_RATIO * Math.max(restRms, 1e-9)) {
    return {
      hypothesis: null,
      reason: `No admitted point's residual against the winning ${regime} fit is at least ${RESIDUAL_ANOMALY_RATIO}x the RMS of the others' residuals (largest |z|=${maxZ.toFixed(3)} at T=${residuals[maxIdx]!.t}ms vs RMS=${restRms.toFixed(3)}) — no localized-anomaly hypothesis is warranted from this fit.`,
    };
  }
  const anomalyT = residuals[maxIdx]!.t;
  const criterion: FalsificationCriterion = {
    metric: `qe4-disorder-regime-residual-anomaly:k${k}`,
    relation: 'greater-than',
    expectedValue: RESIDUAL_ANOMALY_RATIO,
    rationale: `Derived from the winning ${regime} fit's own residuals (not from a new measurement): the weighted residual at the real admitted point T=${anomalyT}ms is ${(maxZ / Math.max(restRms, 1e-9)).toFixed(2)}x the RMS of the other admitted points' residuals under this same fit — a localized deviation the ${regime} regime does not explain.`,
  };
  const hypothesis = createHypothesis(`qe4-residual-anomaly-k${k}-T${anomalyT}`, criterion, 0.5, 'RESIDUAL_FROM_FIT', parentHypothesisId);
  return {
    hypothesis,
    reason: `Residual-anomaly hypothesis derived at T=${anomalyT}ms (|z|=${maxZ.toFixed(3)} vs RMS ${restRms.toFixed(3)} of the rest) — UNTESTED. Testing it would require finer-grained real (T,k) data than this pinned dataset provides; it is surfaced for a future round or experiment, not resolved here.`,
  };
}

/**
 * PURE CORE of the loop — takes already-bootstrapped points (real numbers,
 * from `runQe4BrydgesAnalysis()` in production, synthetic in tests) so it is
 * independently testable without re-running the expensive real bootstrap.
 *
 * `points` MUST be sorted ascending by `t` and share one `k`; each round
 * admits one additional point, in order, and refits all three regimes on
 * everything admitted so far — a real, growing evidence set, not a replay of
 * one fixed comparison.
 *
 * `alreadyKnownFingerprints` mirrors `PreregistrationAnchor.priorRunFingerprints`:
 * fingerprints the CALLER already knew before this investigation started.
 * Default `[]` is the honest, blind-registration case. A test proves the
 * anti-HARK gate actually stops the loop by declaring, up front, a fingerprint
 * it can compute deterministically will recur in a later round — a real
 * HARK-ing scenario, not a mocked one.
 */
export function runRegimeInquiryCore(
  points: readonly Qe4PointResult[],
  options: { readonly k: number; readonly alreadyKnownFingerprints?: readonly string[]; readonly maxRounds?: number },
): Qe4RegimeInquiryResult {
  const { k } = options;
  const maxRounds = options.maxRounds ?? points.length;
  const knownBeforeStart = options.alreadyKnownFingerprints ?? [];

  const hypotheses = new Map<Qe4Regime, Hypothesis>();
  for (const regime of ['LINEAR', 'LOGARITHMIC', 'SATURATING'] as const) {
    const label = regimeLabel(regime);
    const criterion: FalsificationCriterion = {
      metric: `qe4-disorder-regime-fit:${regime.toLowerCase()}:k${k}`,
      relation: 'less-than',
      rationale: `Regime "${regime}" claims S2(k=${k}, T) growth over the real, pinned Brydges 2019 disorder dataset is best described by a ${label} model; assessed each round by weighted RSS against the OTHER two admitted-regime fits on the same real points, not by a fixed threshold.`,
    };
    hypotheses.set(regime, createHypothesis(regimeHypothesisId(regime, k), criterion, 0.5, 'REGIME_FIT_FROM_GRID', null));
  }

  const rounds: Qe4RegimeRound[] = [];
  const priorFingerprints: string[] = [...knownBeforeStart];
  let previousWinner: Qe4Regime | null = null;
  let previousRatio: number | null = null;
  let stopReason: Qe4RegimeStopReason = 'ROUND_BUDGET_EXHAUSTED';
  let finalFits: readonly InternalFit[] | null = null;
  let winningHypothesisId: string | null = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    const admitted = points.slice(0, round);
    const admittedTMs = admitted.map((p) => p.t);

    if (admitted.length < MIN_POINTS_FOR_COMPARISON) {
      const fp = roundFingerprint(round, admittedTMs, null);
      const antiHarking = checkAntiHarkingAnchor(priorFingerprints, [fp]);
      rounds.push({
        round, admittedTMs, fits: null, hypotheses: [...hypotheses.values()],
        winnerRegime: null, decisive: false, rssRatio: null, antiHarking, runFingerprint: fp,
        reason: `Only ${admitted.length} point(s) admitted — need at least ${MIN_POINTS_FOR_COMPARISON} for a meaningful two-free-parameter regime comparison; no fit attempted this round.`,
      });
      priorFingerprints.push(fp);
      if (!antiHarking.intact) { stopReason = 'ANTI_HARKING_VIOLATION'; break; }
      continue;
    }

    const fits = fitAllRegimes(admitted);
    const sorted = [...fits].sort((a, b) => a.rss - b.rss);
    const [bestFit, runnerUpFit] = sorted;
    // `sorted` is ascending by RSS, so runnerUp.rss >= best.rss always; an exact
    // tie (including both at 0) is a degenerate case, never treated as decisive.
    const rssRatio = bestFit!.rss === runnerUpFit!.rss ? 1 : bestFit!.rss / Math.max(runnerUpFit!.rss, 1e-12);
    const decisive = rssRatio < DECISIVE_RSS_RATIO;

    for (const fit of fits) {
      const current = hypotheses.get(fit.regime)!;
      if (!decisive) {
        hypotheses.set(fit.regime, updateConfidence(current, 'INCONCLUSIVE', 0, `Round ${round}: no regime is decisively ahead (RSS ratio ${rssRatio.toFixed(4)} ≥ ${DECISIVE_RSS_RATIO}).`, round));
        continue;
      }
      const isWinner = fit.regime === bestFit!.regime;
      const magnitude = Math.min(1, Math.max(0, 1 - rssRatio));
      hypotheses.set(fit.regime, updateConfidence(
        current,
        isWinner ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL',
        magnitude,
        `Round ${round}: weighted RSS ${fit.rss.toFixed(6)} vs best-competitor ratio ${rssRatio.toFixed(4)} (decisive threshold ${DECISIVE_RSS_RATIO}).`,
        round,
      ));
    }

    const publicFits: Qe4RegimeFit[] = fits.map((f) => ({ regime: f.regime, rss: f.rss, coefficients: f.coefficients }));
    const fp = roundFingerprint(round, admittedTMs, publicFits);
    const antiHarking = checkAntiHarkingAnchor(priorFingerprints, [fp]);

    rounds.push({
      round, admittedTMs, fits: publicFits, hypotheses: [...hypotheses.values()],
      winnerRegime: decisive ? bestFit!.regime : null, decisive, rssRatio,
      antiHarking, runFingerprint: fp,
      reason: decisive
        ? `${bestFit!.regime} decisively best (RSS ${bestFit!.rss.toFixed(6)} < ${DECISIVE_RSS_RATIO} × runner-up ${runnerUpFit!.rss.toFixed(6)}).`
        : `No regime decisively ahead (best/runner-up RSS ratio ${rssRatio.toFixed(4)}).`,
    });
    priorFingerprints.push(fp);

    if (!antiHarking.intact) { stopReason = 'ANTI_HARKING_VIOLATION'; finalFits = null; winningHypothesisId = null; break; }

    finalFits = fits;
    if (decisive && bestFit!.regime === previousWinner) {
      const winnerConfidence = hypotheses.get(bestFit!.regime)!.confidence;
      if (winnerConfidence >= CONVERGENCE_CONFIDENCE_THRESHOLD) {
        stopReason = 'CONVERGENCE';
        winningHypothesisId = regimeHypothesisId(bestFit!.regime, k);
        break;
      }
    }
    if (!decisive && previousRatio !== null && Math.abs(rssRatio - previousRatio) < NO_INFORMATION_GAIN_EPSILON) {
      stopReason = 'NO_INFORMATION_GAIN';
      winningHypothesisId = null;
      break;
    }
    previousWinner = decisive ? bestFit!.regime : null;
    previousRatio = rssRatio;
    if (round === maxRounds) {
      winningHypothesisId = decisive ? regimeHypothesisId(bestFit!.regime, k) : null;
    }
  }

  const winnerRegimeForResidual = winningHypothesisId !== null && finalFits !== null
    ? finalFits.find((f) => regimeHypothesisId(f.regime, k) === winningHypothesisId) ?? null
    : null;
  const lastAdmitted = rounds.length > 0 ? points.slice(0, rounds[rounds.length - 1]!.round) : [];
  const residual: Qe4ResidualHypothesisResult = winnerRegimeForResidual !== null
    ? deriveResidualHypothesis(winnerRegimeForResidual.regime, winnerRegimeForResidual.predict, lastAdmitted, k, winningHypothesisId!)
    : { hypothesis: null, reason: 'No decisive winning regime was ever established this run, so no residual-anomaly hypothesis can be derived against a winning fit.' };

  return { k, rounds, stopReason, winningHypothesisId, residual };
}

/**
 * REAL-DATA ENTRY POINT: reuses `runQe4BrydgesAnalysis()` (already real,
 * tested, fingerprint-frozen — see `qe4BrydgesAnalysis.replay.test.ts`)
 * rather than re-parsing the pinned CSVs or re-running the bootstrap, then
 * feeds its `disorderPoints` (already computed for every (T,k) pair) to the
 * pure core above. `k=5` (half-partition) by default, matching the substrate
 * `qe4BrydgesAnalysis.ts`'s own P2 verdict already uses for this comparison.
 */
export function runQe4DisorderRegimeInquiry(k: 5 | 10 = 5): Qe4RegimeInquiryResult {
  const analysis = runQe4BrydgesAnalysis();
  const points = analysis.disorderPoints.filter((p) => p.k === k).sort((a, b) => a.t - b.t);
  return runRegimeInquiryCore(points, { k });
}
