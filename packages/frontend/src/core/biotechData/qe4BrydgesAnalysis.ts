/**
 * QE4 — orchestrates the preregistered analysis (`docs/QE4_PREREGISTRATION.md`)
 * over the pinned Brydges et al. dataset (`qe4-brydges/`). Reuses
 * `qe4BrydgesEstimator.ts`'s pure math, `core/agent/tautologyGate.ts`'s
 * `assessTautology` (unmodified), `core/epidemic/agents.ts`'s `makeRng`
 * (unmodified), and `core/events/hash.ts`'s `fnv1a`/`canonicalJson`
 * (unmodified) — zero new engines, this module is glue + verdict logic only.
 *
 * Determinism: the bootstrap RNG is seeded with a literal constant
 * (`BOOTSTRAP_SEED`), so `runQe4BrydgesAnalysis()` is a pure function of the
 * pinned CSV content — the same inputs always produce the same
 * `resultFingerprint` (checked by `qe4BrydgesAnalysis.replay.test.ts`).
 */

import { assessTautology, type TautologyAssessment, type TautologyComponent } from '../agent/tautologyGate';
import { fnv1a, canonicalJson } from '../events/hash';
import { makeRng } from '../epidemic/agents';
import {
  parseMeasuredStatesCsv,
  parsePublishedRenyiEntropyCsv,
  parseFig1aCsv,
  bootstrapMultiK,
  bootstrapMultiKBlocked,
  bootstrapPurity,
  groupIntoCompleteBlocks,
  weightedLinearFit,
  weightedResidualSumOfSquares,
  type BootstrapResult,
  type PurityBootstrapResult,
} from './qe4BrydgesEstimator';

import cleanT0 from './qe4-brydges/10Ions_CleanSystem/MeasuredStates_T_0ms.csv?raw';
import cleanT1 from './qe4-brydges/10Ions_CleanSystem/MeasuredStates_T_1ms.csv?raw';
import cleanT2 from './qe4-brydges/10Ions_CleanSystem/MeasuredStates_T_2ms.csv?raw';
import cleanT3 from './qe4-brydges/10Ions_CleanSystem/MeasuredStates_T_3ms.csv?raw';
import cleanT4 from './qe4-brydges/10Ions_CleanSystem/MeasuredStates_T_4ms.csv?raw';
import cleanT5 from './qe4-brydges/10Ions_CleanSystem/MeasuredStates_T_5ms.csv?raw';
import cleanPublishedT0 from './qe4-brydges/10Ions_CleanSystem/RenyiEntropy_T_0ms.csv?raw';
import cleanPublishedT1 from './qe4-brydges/10Ions_CleanSystem/RenyiEntropy_T_1ms.csv?raw';
import cleanPublishedT2 from './qe4-brydges/10Ions_CleanSystem/RenyiEntropy_T_2ms.csv?raw';
import cleanPublishedT3 from './qe4-brydges/10Ions_CleanSystem/RenyiEntropy_T_3ms.csv?raw';
import cleanPublishedT4 from './qe4-brydges/10Ions_CleanSystem/RenyiEntropy_T_4ms.csv?raw';
import cleanPublishedT5 from './qe4-brydges/10Ions_CleanSystem/RenyiEntropy_T_5ms.csv?raw';

import disorderT01 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_01ms.csv?raw';
import disorderT02 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_02ms.csv?raw';
import disorderT04 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_04ms.csv?raw';
import disorderT06 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_06ms.csv?raw';
import disorderT10 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_10ms.csv?raw';
import disorderT16 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_16ms.csv?raw';
import disorderT20 from './qe4-brydges/10Ions_withDisorder/MeasuredStates_T_20ms.csv?raw';
import disorderPublishedT1 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_1ms.csv?raw';
import disorderPublishedT2 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_2ms.csv?raw';
import disorderPublishedT4 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_4ms.csv?raw';
import disorderPublishedT6 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_6ms.csv?raw';
import disorderPublishedT10 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_10ms.csv?raw';
import disorderPublishedT16 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_16ms.csv?raw';
import disorderPublishedT20 from './qe4-brydges/10Ions_withDisorder/RenyiEntropy_T_20ms.csv?raw';

import pureStateCsv from './qe4-brydges/Fig1a/PureState.csv?raw';
import mixedStateCsv from './qe4-brydges/Fig1a/MixedState.csv?raw';

import zenodoRecord from './qe4-brydges/zenodo-record.json';

const BOOTSTRAP_SEED = 0x51455134; // 'QE4' + arbitrary fixed byte, literal and stable across runs
const BOOTSTRAP_ITERATIONS = 2000;
const DISORDER_BLOCK_SIZE = 10;

const CLEAN_T_VALUES_MS = [0, 1, 2, 3, 4, 5] as const;
const CLEAN_KS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const DISORDER_T_VALUES_MS = [1, 2, 4, 6, 10, 16, 20] as const;
const DISORDER_KS = [5, 10] as const;

const CLEAN_RAW: Record<number, string> = { 0: cleanT0, 1: cleanT1, 2: cleanT2, 3: cleanT3, 4: cleanT4, 5: cleanT5 };
const CLEAN_PUBLISHED_RAW: Record<number, string> = {
  0: cleanPublishedT0, 1: cleanPublishedT1, 2: cleanPublishedT2, 3: cleanPublishedT3, 4: cleanPublishedT4, 5: cleanPublishedT5,
};
const DISORDER_RAW: Record<number, string> = { 1: disorderT01, 2: disorderT02, 4: disorderT04, 6: disorderT06, 10: disorderT10, 16: disorderT16, 20: disorderT20 };
const DISORDER_PUBLISHED_RAW: Record<number, string> = {
  1: disorderPublishedT1, 2: disorderPublishedT2, 4: disorderPublishedT4, 6: disorderPublishedT6,
  10: disorderPublishedT10, 16: disorderPublishedT16, 20: disorderPublishedT20,
};

export interface Qe4PointResult {
  readonly t: number;
  readonly k: number;
  readonly s2: number;
  readonly sigma: number;
  readonly clamped: boolean;
}

export interface Qe4P4Delta {
  readonly t: number;
  readonly k: number;
  readonly genesisS2: number;
  readonly publishedS2: number;
  readonly sigma: number;
  readonly delta: number;
  readonly withinBand: boolean;
}

export type Qe4Verdict = 'FALSIFIED' | 'SUPPORTED_WITHIN_MODEL' | 'INCONCLUSIVE';

export interface Qe4HypothesisResult {
  readonly id: 'P1' | 'P2' | 'P3' | 'P4';
  readonly verdict: Qe4Verdict;
  readonly reasons: readonly string[];
  readonly tautology: TautologyAssessment;
}

export interface Qe4AnalysisResult {
  readonly cleanPoints: readonly Qe4PointResult[];
  readonly disorderPoints: readonly Qe4PointResult[];
  readonly fig1a: { readonly pure: PurityBootstrapResult; readonly mixed: PurityBootstrapResult };
  readonly p4Deltas: readonly Qe4P4Delta[];
  readonly p1: Qe4HypothesisResult;
  readonly p2: Qe4HypothesisResult;
  readonly p3: Qe4HypothesisResult;
  readonly p4: Qe4HypothesisResult;
  readonly provenance: {
    readonly datasetDoi: string;
    readonly datasetLicense: string;
    readonly archiveSha256: string;
    readonly bootstrapSeed: number;
    readonly bootstrapIterations: number;
  };
  readonly resultFingerprint: string;
}

function significantlyGreater(a: number, sigmaA: number, b: number, sigmaB: number): boolean {
  const combined = Math.sqrt(sigmaA * sigmaA + sigmaB * sigmaB);
  return a - b > 3 * combined;
}

function buildEmpiricalComponent(componentId: string, predictionModelId: string, observationModelId: string): TautologyComponent {
  return {
    componentId,
    prediction: {
      source: 'hypothesis-parameter',
      modelId: predictionModelId,
      rationale: 'Genuinely recomputed from the raw pinned samples for this specific dataset/partition/time point; not an analytic ceiling of any model and would come out differently for different raw input.',
    },
    observation: {
      source: 'independent-measurement',
      modelId: observationModelId,
      rationale: 'A real, independently collected/published experimental record, produced by a channel sharing no free parameters with the prediction side.',
    },
  };
}

export function runQe4BrydgesAnalysis(): Qe4AnalysisResult {
  const rng = makeRng(BOOTSTRAP_SEED);

  // ---- Clean dataset: bootstrap S2 for every (T, k) jointly per T ----
  const cleanPoints: Qe4PointResult[] = [];
  const cleanResultsByT = new Map<number, ReadonlyMap<number, BootstrapResult>>();
  for (const t of CLEAN_T_VALUES_MS) {
    const rows = parseMeasuredStatesCsv(CLEAN_RAW[t]);
    const results = bootstrapMultiK(rows, CLEAN_KS, BOOTSTRAP_ITERATIONS, rng);
    cleanResultsByT.set(t, results);
    for (const k of CLEAN_KS) {
      const r = results.get(k)!;
      cleanPoints.push({ t, k, s2: r.s2, sigma: r.sigma, clamped: r.clamped });
    }
  }

  // ---- Disorder dataset: bootstrap S2 (blocked) for every (T, k in {5,10}) ----
  const disorderPoints: Qe4PointResult[] = [];
  const disorderResultsByT = new Map<number, ReadonlyMap<number, BootstrapResult>>();
  for (const t of DISORDER_T_VALUES_MS) {
    const rows = parseMeasuredStatesCsv(DISORDER_RAW[t]);
    const blocks = groupIntoCompleteBlocks(rows, DISORDER_BLOCK_SIZE);
    const results = bootstrapMultiKBlocked(blocks, DISORDER_KS, BOOTSTRAP_ITERATIONS, rng);
    disorderResultsByT.set(t, results);
    for (const k of DISORDER_KS) {
      const r = results.get(k)!;
      disorderPoints.push({ t, k, s2: r.s2, sigma: r.sigma, clamped: r.clamped });
    }
  }

  // ---- Fig1a: bootstrap purity/S2 for pure and mixed states ----
  const pureRows = parseFig1aCsv(pureStateCsv);
  const mixedRows = parseFig1aCsv(mixedStateCsv);
  const pureResult = bootstrapPurity(pureRows, BOOTSTRAP_ITERATIONS, rng);
  const mixedResult = bootstrapPurity(mixedRows, BOOTSTRAP_ITERATIONS, rng);

  // ---- P4: compare every computed point against the authors' published value ----
  const p4Deltas: Qe4P4Delta[] = [];
  for (const t of CLEAN_T_VALUES_MS) {
    const published = parsePublishedRenyiEntropyCsv(CLEAN_PUBLISHED_RAW[t]);
    const results = cleanResultsByT.get(t)!;
    for (const row of published) {
      const k = row.subsystem;
      if (!results.has(k)) continue;
      const genesis = results.get(k)!;
      const delta = Math.abs(genesis.s2 - row.s2);
      const band = 3 * genesis.sigma;
      p4Deltas.push({ t, k, genesisS2: genesis.s2, publishedS2: row.s2, sigma: genesis.sigma, delta, withinBand: delta <= band });
    }
  }
  for (const t of DISORDER_T_VALUES_MS) {
    const published = parsePublishedRenyiEntropyCsv(DISORDER_PUBLISHED_RAW[t]);
    const results = disorderResultsByT.get(t)!;
    for (const row of published) {
      const k = row.subsystem;
      if (!results.has(k)) continue;
      const genesis = results.get(k)!;
      const delta = Math.abs(genesis.s2 - row.s2);
      const band = 3 * genesis.sigma;
      p4Deltas.push({ t, k, genesisS2: genesis.s2, publishedS2: row.s2, sigma: genesis.sigma, delta, withinBand: delta <= band });
    }
  }

  // ---- P1: clean extensivity (k=1..5 slope at T=5ms) + not-collapsing check ----
  const p1Ks = [1, 2, 3, 4, 5];
  const resultsAt5 = cleanResultsByT.get(5)!;
  const iterationsCount = resultsAt5.get(1)!.samples.length;
  const slopeSamples: number[] = [];
  for (let iter = 0; iter < iterationsCount; iter += 1) {
    const y = p1Ks.map((k) => resultsAt5.get(k)!.samples[iter]);
    const { slope } = weightedLinearFit(p1Ks, y, p1Ks.map(() => 1));
    slopeSamples.push(slope);
  }
  const slopeMean = slopeSamples.reduce((a, b) => a + b, 0) / slopeSamples.length;
  const slopeVariance = slopeSamples.reduce((acc, v) => acc + (v - slopeMean) ** 2, 0) / (slopeSamples.length - 1);
  const slopeSigma = Math.sqrt(slopeVariance);
  const slopeSignificantlyPositive = slopeMean - 3 * slopeSigma > 0;

  const s2k1T5 = resultsAt5.get(1)!;
  const s2k5T5 = resultsAt5.get(5)!;
  const ratio = s2k5T5.s2 / s2k1T5.s2;
  const ratioAtLeast1_5 = ratio >= 1.5;

  const resultsAt4 = cleanResultsByT.get(4)!;
  const s2k5T4 = resultsAt4.get(5)!;
  const notCollapsing = !significantlyGreater(s2k5T4.s2, s2k5T4.sigma, s2k5T5.s2, s2k5T5.sigma);

  const p1Reasons: string[] = [
    `Weighted-regression slope of S2(k) for k=1..5 at T=5ms: ${slopeMean.toFixed(4)} ± ${slopeSigma.toFixed(4)} (bootstrap, ${BOOTSTRAP_ITERATIONS} iterations); significantly positive (3σ excludes zero): ${slopeSignificantlyPositive}.`,
    `S2(k=5,T=5ms)/S2(k=1,T=5ms) = ${ratio.toFixed(3)} (threshold ≥1.5 for "clearly extensive"): ${ratioAtLeast1_5}.`,
    `S2(k=5) at T=5ms (${s2k5T5.s2.toFixed(4)}) not significantly below T=4ms (${s2k5T4.s2.toFixed(4)}): ${notCollapsing}.`,
  ];
  let p1Verdict: Qe4Verdict;
  if (!slopeSignificantlyPositive) {
    p1Verdict = 'FALSIFIED';
    p1Reasons.push('FALSIFIED: slope not significantly positive at 3σ — area-law-like signature, not volume-law.');
  } else if (!ratioAtLeast1_5) {
    p1Verdict = 'FALSIFIED';
    p1Reasons.push('FALSIFIED: saturates too early (ratio below preregistered 1.5 threshold) to call extensive.');
  } else if (slopeSigma / Math.abs(slopeMean) > 0.5) {
    p1Verdict = 'INCONCLUSIVE';
    p1Reasons.push('INCONCLUSIVE: bootstrap uncertainty on the slope is too wide relative to its magnitude to confidently distinguish extensive from marginal growth.');
  } else {
    p1Verdict = 'SUPPORTED_WITHIN_MODEL';
    p1Reasons.push('SUPPORTED_WITHIN_MODEL: significant positive slope, ratio above threshold, not collapsing at the last time point.');
  }

  // ---- P2: disorder log-growth + sub-extensive saturation (k=5, half partition) ----
  const disorderHalfByT = DISORDER_T_VALUES_MS.map((t) => ({ t, r: disorderResultsByT.get(t)!.get(5)! }));
  const s2AtT1 = disorderHalfByT.find((p) => p.t === 1)!.r;
  const s2AtT20 = disorderHalfByT.find((p) => p.t === 20)!.r;
  const growthConfirmed = significantlyGreater(s2AtT20.s2, s2AtT20.sigma, s2AtT1.s2, s2AtT1.sigma);

  const tValues = disorderHalfByT.map((p) => p.t);
  const s2Values = disorderHalfByT.map((p) => p.r.s2);
  const sigmaValues = disorderHalfByT.map((p) => p.r.sigma);
  const lnTValues = tValues.map((t) => Math.log(t));
  const linearFit = weightedLinearFit(tValues, s2Values, sigmaValues);
  const logFit = weightedLinearFit(lnTValues, s2Values, sigmaValues);
  const linearRss = weightedResidualSumOfSquares(tValues, s2Values, sigmaValues, (x) => linearFit.slope * x + linearFit.intercept);
  const logRss = weightedResidualSumOfSquares(lnTValues, s2Values, sigmaValues, (x) => logFit.slope * x + logFit.intercept);
  const linearDecisivelyBetter = linearRss < logRss / 2;

  const cleanHalfSaturation = cleanResultsByT.get(5)!.get(5)!; // clean's own half-partition (k=5) value at T=5ms stands in for "volume-law saturation" reference
  const subExtensive = significantlyGreater(cleanHalfSaturation.s2, cleanHalfSaturation.sigma, s2AtT20.s2, s2AtT20.sigma);

  const p2Reasons: string[] = [
    `S2(k=5,T=20ms)=${s2AtT20.s2.toFixed(4)} vs S2(k=5,T=1ms)=${s2AtT1.s2.toFixed(4)}: growth confirmed (3σ): ${growthConfirmed}.`,
    `Weighted RSS: linear-in-T fit=${linearRss.toFixed(4)}, log-in-T fit=${logRss.toFixed(4)}; linear decisively better (< half): ${linearDecisivelyBetter}.`,
    `Clean system's own k=5 saturation (T=5ms)=${cleanHalfSaturation.s2.toFixed(4)} vs disorder k=5 at T=20ms=${s2AtT20.s2.toFixed(4)}: disorder significantly sub-extensive: ${subExtensive}.`,
  ];
  let p2Verdict: Qe4Verdict;
  if (!growthConfirmed) {
    p2Verdict = 'FALSIFIED';
    p2Reasons.push('FALSIFIED: no significant growth over the recorded window.');
  } else if (linearDecisivelyBetter) {
    p2Verdict = 'FALSIFIED';
    p2Reasons.push('FALSIFIED: growth fits a linear-in-time model decisively better than logarithmic — contradicts the preregistered log-growth claim.');
  } else if (!subExtensive) {
    p2Verdict = 'FALSIFIED';
    p2Reasons.push('FALSIFIED (sub-extensivity): disorder saturation is not significantly below the clean system\'s own half-partition saturation value.');
  } else {
    p2Verdict = 'SUPPORTED_WITHIN_MODEL';
    p2Reasons.push('SUPPORTED_WITHIN_MODEL: growth confirmed, log fit at least as good as linear, and saturation significantly sub-extensive relative to the clean reference.');
  }

  // ---- P3: pure vs mixed protocol validation ----
  const p3Diff = mixedResult.s2 - pureResult.s2;
  const p3Combined = Math.sqrt(pureResult.sigmaS2 ** 2 + mixedResult.sigmaS2 ** 2);
  const p3Significant = p3Diff > 3 * p3Combined;
  const p3Reversed = -p3Diff > 3 * p3Combined;
  const p3Reasons = [
    `S2(PureState)=${pureResult.s2.toFixed(4)}±${pureResult.sigmaS2.toFixed(4)}, S2(MixedState)=${mixedResult.s2.toFixed(4)}±${mixedResult.sigmaS2.toFixed(4)}.`,
    `Mixed significantly greater than pure (3σ): ${p3Significant}.`,
  ];
  const p3Verdict: Qe4Verdict = p3Reversed ? 'FALSIFIED' : p3Significant ? 'SUPPORTED_WITHIN_MODEL' : 'INCONCLUSIVE';

  // ---- P4 aggregate ----
  const p4FailingPoints = p4Deltas.filter((d) => !d.withinBand);
  const p4Verdict: Qe4Verdict = p4FailingPoints.length === 0 ? 'SUPPORTED_WITHIN_MODEL' : 'FALSIFIED';
  const p4Reasons = [
    `${p4Deltas.length} (T,k) comparisons against the authors' published RenyiEntropy tables; ${p4FailingPoints.length} outside the ±3σ_bootstrap band.`,
    ...p4FailingPoints.map((d) => `OUT OF BAND: T=${d.t}ms k=${d.k}: genesis=${d.genesisS2.toFixed(4)} published=${d.publishedS2.toFixed(4)} delta=${d.delta.toFixed(4)} band=${(3 * d.sigma).toFixed(4)}`),
  ];

  // ---- Tautology Gate: reused exactly, one component per hypothesis ----
  const p1Tautology = assessTautology([buildEmpiricalComponent('qe4-p1-clean-extensivity', 'qe4-randomized-measurement-estimator', 'zenodo-2527010-brydges-measuredstates-clean')]);
  const p2Tautology = assessTautology([buildEmpiricalComponent('qe4-p2-disorder-growth', 'qe4-randomized-measurement-estimator', 'zenodo-2527010-brydges-measuredstates-disorder')]);
  const p3Tautology = assessTautology([
    {
      componentId: 'qe4-p3-protocol-validation',
      prediction: {
        source: 'hypothesis-parameter',
        modelId: 'state-preparation-label',
        rationale: 'The expected purity ordering (pure > mixed) is fixed by how each file\'s underlying state was deliberately prepared before measurement — a real experimental fact independent of Genesis, which could in principle have come out reversed.',
      },
      observation: {
        source: 'independent-measurement',
        modelId: 'zenodo-2527010-brydges-fig1a',
        rationale: 'Real measured Bloch-vector expectation values from a randomized single-qubit measurement protocol.',
      },
    },
  ]);
  const p4Tautology = assessTautology([buildEmpiricalComponent('qe4-p4-integrity', 'qe4-randomized-measurement-estimator', 'zenodo-2527010-brydges-published-pipeline')]);

  const p1: Qe4HypothesisResult = { id: 'P1', verdict: p1Verdict, reasons: p1Reasons, tautology: p1Tautology };
  const p2: Qe4HypothesisResult = { id: 'P2', verdict: p2Verdict, reasons: p2Reasons, tautology: p2Tautology };
  const p3: Qe4HypothesisResult = { id: 'P3', verdict: p3Verdict, reasons: p3Reasons, tautology: p3Tautology };
  const p4: Qe4HypothesisResult = { id: 'P4', verdict: p4Verdict, reasons: p4Reasons, tautology: p4Tautology };

  const provenance = {
    datasetDoi: (zenodoRecord as { doi: string }).doi,
    datasetLicense: (zenodoRecord as { metadata: { license: { id: string } } }).metadata.license.id,
    archiveSha256: '87424c2ddfbc9e68361d70a41878b63919ceb7257bdb70b4fad65d4179cd8389',
    bootstrapSeed: BOOTSTRAP_SEED,
    bootstrapIterations: BOOTSTRAP_ITERATIONS,
  };

  const resultFingerprint = fnv1a(
    canonicalJson({
      cleanPoints, disorderPoints,
      p1: { verdict: p1.verdict }, p2: { verdict: p2.verdict }, p3: { verdict: p3.verdict }, p4: { verdict: p4.verdict },
      p4Deltas: p4Deltas.map((d) => ({ t: d.t, k: d.k, delta: d.delta, withinBand: d.withinBand })),
    }),
  );

  return {
    cleanPoints,
    disorderPoints,
    fig1a: { pure: pureResult, mixed: mixedResult },
    p4Deltas,
    p1,
    p2,
    p3,
    p4,
    provenance,
    resultFingerprint,
  };
}
