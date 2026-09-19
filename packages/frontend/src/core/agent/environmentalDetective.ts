import type { AnalysisProvider, KernelContext } from '@genesis/core/mythos/KernelProviderRegistry.js';
import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { sha256HexSync } from '@genesis/core/knowledge/sha256.js';
import { canonicalJson } from '../events/hash';
import { fitCausalEffect, testParallelPreTrends, type CausalEstimator, type CausalFitResult, type PanelObservation, type ParallelTrendsTestResult } from './causalInference';
import { buildEnvironmentalCaseGraph, type EnvironmentalCaseGraph, type EnvironmentalCaseGraphInput } from './environmentalCaseGraph';

/**
 * ENVIRONMENTAL DIGITAL DETECTIVE — "what changed, when, and does the
 * intervention explain it?" over an environmental measurement series
 * (NO₂, SO₂, PM, a river gauge …), built ON the existing CAP-2 causal
 * inference library (DiD / interrupted time series / synthetic control,
 * placebo and parallel-trend tests) rather than beside it.
 *
 * The detective takes the data it is given and says where it came from:
 * `provenance.kind` is REAL_DATASET (a URL the caller pinned), or SYNTHETIC
 * (a series generated for a test or a demo). It never fetches, never
 * fabricates a series, and its verdict is a MODEL claim about that series:
 * EFFECT_SUGGESTED / NO_EFFECT_DETECTED / INSUFFICIENT_EVIDENCE — a
 * synthetic input can never yield more than INSUFFICIENT_EVIDENCE about the
 * world. Anomalies are robust-z outliers (median / MAD, |z| > 3.5), listed,
 * never explained away. Every report is anchored on the kernel ledger.
 */

export interface EnvironmentalSeries { readonly unit: string; readonly points: readonly { readonly period: number; readonly value: number }[]; }

export interface EnvironmentalCaseInput {
  readonly caseId: string;
  readonly quantity: string;
  readonly measurementUnit: string;
  readonly treated: EnvironmentalSeries;
  readonly controls: readonly EnvironmentalSeries[];
  /** First period at which the intervention applies (inclusive). */
  readonly interventionPeriod: number;
  readonly estimator?: CausalEstimator;
  readonly provenance: { readonly kind: 'REAL_DATASET' | 'SYNTHETIC'; readonly sourceUrl: string; readonly note?: string };
}

export interface EnvironmentalAnomaly { readonly unit: string; readonly period: number; readonly value: number; readonly robustZ: number; }

export type DetectiveVerdict = 'EFFECT_SUGGESTED' | 'NO_EFFECT_DETECTED' | 'INSUFFICIENT_EVIDENCE';

export interface DetectiveReport {
  readonly caseId: string;
  readonly quantity: string;
  readonly measurementUnit: string;
  readonly estimator: CausalEstimator | null;
  readonly causal: CausalFitResult | null;
  readonly parallelTrends: ParallelTrendsTestResult | null;
  readonly anomalies: readonly EnvironmentalAnomaly[];
  readonly preMean: number;
  readonly postMean: number;
  readonly verdict: DetectiveVerdict;
  readonly epistemicStatus: 'MODEL' | 'INSUFFICIENT_EVIDENCE';
  readonly reasons: readonly string[];
  readonly provenance: EnvironmentalCaseInput['provenance'];
  readonly fingerprint: string;
}

const MIN_PRE = 4; const MIN_POST = 3;

function median(v: readonly number[]): number { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mean(v: readonly number[]): number { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; }

/** Robust z-scores against the unit's own median/MAD; the 0.6745 factor makes MAD comparable to a standard deviation. */
export function robustAnomalies(series: EnvironmentalSeries, threshold = 3.5): readonly EnvironmentalAnomaly[] {
  const values = series.points.map((p) => p.value);
  if (values.length < 5) return [];
  const med = median(values); const mad = median(values.map((v) => Math.abs(v - med)));
  if (mad === 0) return [];
  return series.points.map((p) => ({ unit: series.unit, period: p.period, value: p.value, robustZ: +((0.6745 * (p.value - med)) / mad).toFixed(4) })).filter((a) => Math.abs(a.robustZ) > threshold);
}

function toPanel(input: EnvironmentalCaseInput): PanelObservation[] {
  const rows: PanelObservation[] = [];
  for (const s of [input.treated, ...input.controls]) for (const p of s.points) rows.push({ unit: s.unit, period: p.period, outcome: p.value });
  return rows.sort((a, b) => a.period - b.period || (a.unit < b.unit ? -1 : 1));
}

export function investigateEnvironmentalCase(input: EnvironmentalCaseInput): DetectiveReport {
  const reasons: string[] = [];
  const pre = input.treated.points.filter((p) => p.period < input.interventionPeriod).map((p) => p.value);
  const post = input.treated.points.filter((p) => p.period >= input.interventionPeriod).map((p) => p.value);
  const anomalies = [input.treated, ...input.controls].flatMap((s) => robustAnomalies(s));
  const estimator: CausalEstimator = input.estimator ?? (input.controls.length >= 2 ? 'synthetic-control' : input.controls.length === 1 ? 'two-way-fe-did' : 'interrupted-time-series');
  let causal: CausalFitResult; let parallel: ParallelTrendsTestResult | null = null;
  const base = { caseId: input.caseId, quantity: input.quantity, measurementUnit: input.measurementUnit, anomalies, preMean: +mean(pre).toFixed(6), postMean: +mean(post).toFixed(6), provenance: input.provenance };
  if (pre.length < MIN_PRE || post.length < MIN_POST) {
    reasons.push(`too few observations (${pre.length} before, ${post.length} after; need ≥ ${MIN_PRE} and ≥ ${MIN_POST})`);
    return finish({ ...base, estimator: null, causal: null, parallelTrends: null, verdict: 'INSUFFICIENT_EVIDENCE', epistemicStatus: 'INSUFFICIENT_EVIDENCE', reasons });
  }
  if (estimator !== 'interrupted-time-series' && input.controls.length === 0) {
    reasons.push(`${estimator} needs at least one control series`);
    return finish({ ...base, estimator, causal: null, parallelTrends: null, verdict: 'INSUFFICIENT_EVIDENCE', epistemicStatus: 'INSUFFICIENT_EVIDENCE', reasons });
  }
  try {
    const panel = toPanel(input);
    const controls = input.controls.map((c) => c.unit);
    causal = fitCausalEffect({ panel, treatmentUnit: input.treated.unit, controlUnits: controls, cutoffPeriod: input.interventionPeriod, estimator });
    if (controls.length) parallel = testParallelPreTrends(panel, input.treated.unit, controls, input.interventionPeriod);
  } catch (e) {
    reasons.push(`estimator failed: ${e instanceof Error ? e.message : String(e)}`);
    return finish({ ...base, estimator, causal: null, parallelTrends: null, verdict: 'INSUFFICIENT_EVIDENCE', epistemicStatus: 'INSUFFICIENT_EVIDENCE', reasons });
  }
  const [lo, hi] = causal.effect.ci95;
  const excludesZero = lo > 0 || hi < 0;
  const trendsOk = parallel === null || parallel.parallelTrendsHold;
  if (!trendsOk) reasons.push('pre-intervention trends of treated and control series are not parallel; the comparison is not credible');
  if (anomalies.some((a) => a.unit === input.treated.unit && a.period >= input.interventionPeriod)) reasons.push('post-intervention outliers in the treated series; the effect may be driven by single periods');
  let verdict: DetectiveVerdict = excludesZero && trendsOk ? 'EFFECT_SUGGESTED' : !excludesZero && trendsOk ? 'NO_EFFECT_DETECTED' : 'INSUFFICIENT_EVIDENCE';
  let epistemicStatus: DetectiveReport['epistemicStatus'] = verdict === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT_EVIDENCE' : 'MODEL';
  if (input.provenance.kind === 'SYNTHETIC') { reasons.push('SYNTHETIC input: the verdict describes the generated series, not the world'); if (verdict === 'EFFECT_SUGGESTED') { verdict = 'INSUFFICIENT_EVIDENCE'; epistemicStatus = 'INSUFFICIENT_EVIDENCE'; } }
  reasons.push(`${estimator}: effect ${causal.effect.estimate.toFixed(4)} ${input.measurementUnit} (95% CI ${lo.toFixed(4)} … ${hi.toFixed(4)})`);
  return finish({ ...base, estimator, causal, parallelTrends: parallel, verdict, epistemicStatus, reasons });
}

function finish(r: Omit<DetectiveReport, 'fingerprint'>): DetectiveReport {
  return { ...r, fingerprint: sha256HexSync(canonicalJson({ caseId: r.caseId, verdict: r.verdict, estimator: r.estimator, effect: r.causal?.effect ?? null, anomalies: r.anomalies, provenance: r.provenance })) };
}

export interface DetectiveAnalysis { readonly report: DetectiveReport; readonly ledgerContentHash: string; readonly label: 'ENVIRONMENTAL_DETECTIVE_CAUSAL_MODEL'; }
/** D-130: the explainable case graph over a report (request shape `{ caseGraph: EnvironmentalCaseGraphInput }`). */
export interface CaseGraphAnalysis { readonly graph: EnvironmentalCaseGraph; readonly ledgerContentHash: string; readonly label: 'ENVIRONMENTAL_CASE_GRAPH'; }

/** Kernel provider (D-124): every investigation is anchored on the kernel ledger as a model claim. */
export function environmentalDetectiveProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'environmental-detective', capabilities: ['environmental-detective', 'environmental-case-graph'],
    analyze: (_ctx: KernelContext, req: unknown) => {
      if (req && typeof req === 'object' && 'caseGraph' in req) {
        const graph = buildEnvironmentalCaseGraph((req as { caseGraph: EnvironmentalCaseGraphInput }).caseGraph);
        const res = ledger.addRecord({ sourceUrl: `genesis://environmental-detective/${graph.caseId}/case-graph`, sourceTimestamp: null, claim: `Environmental case graph case=${graph.caseId} status=${graph.status} nodes=${graph.nodes.length} signals=${graph.signals.length} counterExplanations=${graph.counterExplanations.length} fingerprint=${graph.fingerprint}`, claimType: 'model', confidence: graph.status === 'CANDIDATE_SITE_FOR_REVIEW' ? 0.5 : 0.2, provenance: { sourceKind: 'dataset', retrievedBy: 'environmental-detective', independentSourceIds: [] } });
        return { graph, ledgerContentHash: res.record.contentHash, label: 'ENVIRONMENTAL_CASE_GRAPH' } satisfies CaseGraphAnalysis;
      }
      const report = investigateEnvironmentalCase(req as EnvironmentalCaseInput);
      const res = ledger.addRecord({ sourceUrl: `genesis://environmental-detective/${report.caseId}`, sourceTimestamp: null, claim: `Environmental detective case=${report.caseId} quantity=${report.quantity} verdict=${report.verdict} estimator=${report.estimator ?? 'none'} effect=${report.causal?.effect.estimate ?? 'none'} anomalies=${report.anomalies.length} provenance=${report.provenance.kind} fingerprint=${report.fingerprint}`, claimType: 'model', confidence: report.epistemicStatus === 'MODEL' ? 0.6 : 0.2, provenance: { sourceKind: 'dataset', retrievedBy: 'environmental-detective', independentSourceIds: [] } });
      return { report, ledgerContentHash: res.record.contentHash, label: 'ENVIRONMENTAL_DETECTIVE_CAUSAL_MODEL' } satisfies DetectiveAnalysis;
    },
  };
}
