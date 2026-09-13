import {
  basisValue,
  DEFAULT_VARIABLE,
  fitModelSpec,
  modelSpecFingerprint,
  normalizeModelSpec,
  renderModelSpec,
  termKey,
  type ModelFit,
  type ModelPoint,
  type ModelSpec,
  type ModelTerm,
} from './modelSpace';

/**
 * RESIDUAL STRUCTURE — turns "this model did not fit perfectly" into a NAMED,
 * measured property of the residuals, and then into concrete new candidate
 * models that address that specific property.
 *
 * THE RULE THIS ENFORCES: a non-zero residual is NOT a reason to invent a
 * hypothesis. Every real measurement has non-zero residuals. A new model is
 * only derived when the residuals carry detectable STRUCTURE the parent model
 * demonstrably fails to explain — curvature, trend, a localized anomaly,
 * variance that grows with x — and each proposed model names the finding that
 * motivated it, so "why does this model exist?" is answered from the record.
 *
 * Every detector is a real computation over the parent's own residuals against
 * real points, with a fixed, disclosed threshold. Reuses `modelSpace.ts` for
 * fitting, identity and mutation; introduces no estimator of its own.
 */

export const RESIDUAL_STRUCTURE_CONTRACT_VERSION = '1.0.0';

export type ResidualStructureKind = 'CURVATURE' | 'TREND' | 'LOCALIZED_ANOMALY' | 'HETEROSCEDASTICITY';

export interface ResidualFinding {
  readonly kind: ResidualStructureKind;
  /** How pronounced the structure is, in the detector's own units. Always > 0 when reported. */
  readonly strength: number;
  /** The x this finding concerns, where the structure is localized; null when it is global. */
  readonly atX: number | null;
  /** Real numbers behind the verdict, for a reader who does not trust the label. */
  readonly evidence: string;
}

export interface ModelProposal {
  readonly spec: ModelSpec;
  readonly motivatedBy: ResidualFinding;
}

/** Below this many points, no detector can distinguish structure from noise, so none reports any. */
const MIN_POINTS_FOR_STRUCTURE = 5;

/** Adding a curvature column must cut the residual-of-residual RSS by at least half to count as real curvature. */
const CURVATURE_RSS_IMPROVEMENT = 0.5;

/** |weighted correlation| of standardized residual with x, above which a systematic trend is reported. */
const TREND_CORRELATION = 0.7;

/** One point's |z| must reach this multiple of the RMS of the others' to count as a localized anomaly. */
const ANOMALY_Z_RATIO = 3;

/** |correlation| of |residual| with x, above which variance is reported as x-dependent. */
const HETEROSCEDASTICITY_CORRELATION = 0.8;

function standardizedResiduals(fit: Extract<ModelFit, { ok: true }>, points: readonly ModelPoint[]): readonly { x: number; z: number }[] {
  return points.map((p) => ({ x: p.x, z: (p.y - fit.predict(p.x)) / Math.max(p.sigma, 1e-12) }));
}

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom < 1e-12 ? 0 : sxy / denom;
}

const RESIDUAL_LINE: ModelSpec = { id: 'residual-line', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: DEFAULT_VARIABLE }], lineage: null };
const RESIDUAL_QUADRATIC: ModelSpec = { id: 'residual-quadratic', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: DEFAULT_VARIABLE }, { basis: 'POWER', variable: DEFAULT_VARIABLE, exponent: 2 }], lineage: null };

/**
 * Names what, if anything, is structurally wrong with `fit`'s residuals.
 * Returns `[]` both when the model genuinely fits and when there are too few
 * points to tell — the honest answers are identical in what they license
 * (no derivation), and the caller is told which by the point count it passed.
 */
export function analyzeResidualStructure(
  parent: ModelSpec,
  fit: Extract<ModelFit, { ok: true }>,
  points: readonly ModelPoint[],
): readonly ResidualFinding[] {
  if (points.length < MIN_POINTS_FOR_STRUCTURE) return [];
  const residuals = standardizedResiduals(fit, points);
  const zs = residuals.map((r) => r.z);
  const xs = residuals.map((r) => r.x);
  const findings: ResidualFinding[] = [];

  // --- CURVATURE: does a quadratic in x explain the residuals far better than a line? ---
  const asPoints: ModelPoint[] = residuals.map((r) => ({ x: r.x, y: r.z, sigma: 1 }));
  const lineOnResidual = fitModelSpec(RESIDUAL_LINE, asPoints);
  const quadOnResidual = fitModelSpec(RESIDUAL_QUADRATIC, asPoints);
  if (lineOnResidual.ok && quadOnResidual.ok && lineOnResidual.rss > 1e-12) {
    const ratio = quadOnResidual.rss / lineOnResidual.rss;
    if (ratio < CURVATURE_RSS_IMPROVEMENT) {
      findings.push({
        kind: 'CURVATURE',
        strength: 1 - ratio,
        atX: null,
        evidence: `Residuals of "${renderModelSpec(parent)}" are themselves curved: a quadratic in x explains them with RSS ${quadOnResidual.rss.toFixed(6)} against ${lineOnResidual.rss.toFixed(6)} for a straight line (ratio ${ratio.toFixed(4)} < ${CURVATURE_RSS_IMPROVEMENT}).`,
      });
    }
  }

  // --- TREND: do residuals drift systematically with x? ---
  const trend = pearson(xs, zs);
  if (Math.abs(trend) > TREND_CORRELATION) {
    findings.push({
      kind: 'TREND',
      strength: Math.abs(trend),
      atX: null,
      evidence: `Standardized residuals correlate with x at r=${trend.toFixed(4)} (|r| > ${TREND_CORRELATION}) — "${renderModelSpec(parent)}" is systematically ${trend > 0 ? 'under' : 'over'}-predicting as x grows.`,
    });
  }

  // --- LOCALIZED_ANOMALY: one point far outside the others' spread ---
  let maxIdx = 0;
  for (let i = 1; i < residuals.length; i += 1) if (Math.abs(zs[i]!) > Math.abs(zs[maxIdx]!)) maxIdx = i;
  const rest = zs.filter((_, i) => i !== maxIdx);
  const restRms = Math.sqrt(rest.reduce((acc, z) => acc + z * z, 0) / Math.max(rest.length, 1));
  if (restRms > 1e-12 && Math.abs(zs[maxIdx]!) >= ANOMALY_Z_RATIO * restRms) {
    findings.push({
      kind: 'LOCALIZED_ANOMALY',
      strength: Math.abs(zs[maxIdx]!) / restRms,
      atX: xs[maxIdx]!,
      evidence: `At x=${xs[maxIdx]} the standardized residual is ${zs[maxIdx]!.toFixed(3)}, which is ${(Math.abs(zs[maxIdx]!) / restRms).toFixed(2)}× the RMS (${restRms.toFixed(3)}) of every other point's — a deviation localized to that point, not spread across the fit.`,
    });
  }

  // --- HETEROSCEDASTICITY: does the spread itself grow with x? ---
  const spread = pearson(xs, zs.map(Math.abs));
  if (Math.abs(spread) > HETEROSCEDASTICITY_CORRELATION) {
    findings.push({
      kind: 'HETEROSCEDASTICITY',
      strength: Math.abs(spread),
      atX: null,
      evidence: `Residual MAGNITUDE correlates with x at r=${spread.toFixed(4)} — the scatter itself is x-dependent, so a single global sigma understates uncertainty at ${spread > 0 ? 'large' : 'small'} x.`,
    });
  }

  return findings;
}

/**
 * Which extra basis terms each kind of structure motivates trying. Always
 * over `DEFAULT_VARIABLE`: residual structure here is detected along the
 * ONE axis this module analyzes (`p.x`), not a multi-variable extension —
 * see `modelSpace.ts`'s own doc comment on `DEFAULT_VARIABLE` for the
 * single- vs multi-variable boundary this file deliberately stays on the
 * single-variable side of.
 */
function termsForFinding(kind: ResidualStructureKind): readonly ModelTerm[] {
  const v = DEFAULT_VARIABLE;
  switch (kind) {
    case 'CURVATURE': return [{ basis: 'POWER', variable: v, exponent: 2 }, { basis: 'LOG', variable: v }, { basis: 'POWER', variable: v, exponent: 0.5 }];
    case 'TREND': return [{ basis: 'LINEAR', variable: v }, { basis: 'POWER', variable: v, exponent: 2 }];
    case 'LOCALIZED_ANOMALY': return [];
    case 'HETEROSCEDASTICITY': return [{ basis: 'LOG', variable: v }, { basis: 'RECIPROCAL', variable: v }];
  }
}

/**
 * Derives new candidate MODELS from whatever structure the parent's residuals
 * actually carry. Returns `[]` when the parent fits — no structure, no
 * derivation — which is the whole point: this cannot manufacture a successor
 * for a model that is already adequate.
 *
 * `LOCALIZED_ANOMALY` deliberately proposes no new model form: a single
 * deviant point is evidence about THAT measurement, not about the functional
 * shape, and bending the model to pass through it would be fitting the noise.
 * It is still reported as a finding so a caller can raise it as a hypothesis
 * about the measurement itself.
 */
export function proposeModelsFromResiduals(
  parent: ModelSpec,
  fit: Extract<ModelFit, { ok: true }>,
  points: readonly ModelPoint[],
  constraints: { readonly xRange: { readonly min: number; readonly max: number }; readonly maxTerms?: number },
): readonly ModelProposal[] {
  const normalized = normalizeModelSpec(parent);
  const parentPrint = modelSpecFingerprint(normalized);
  const maxTerms = constraints.maxTerms ?? normalized.terms.length + 2;
  const present = new Set(normalized.terms.map(termKey));

  const out: ModelProposal[] = [];
  const seen = new Set<string>([parentPrint]);

  for (const finding of analyzeResidualStructure(normalized, fit, points)) {
    for (const term of termsForFinding(finding.kind)) {
      const key = termKey(term);
      if (present.has(key)) continue;
      if (normalized.terms.length + 1 > maxTerms) continue;
      const spec = normalizeModelSpec({
        id: '',
        terms: [...normalized.terms, term],
        lineage: {
          parentFingerprint: parentPrint,
          operator: `RESIDUAL_${finding.kind}`,
          detail: `${finding.evidence} Adding ${key} to address it.`,
        },
      });
      const print = modelSpecFingerprint(spec);
      if (seen.has(print)) continue;
      // Only propose a model that is actually fittable on these very points.
      if (!fitModelSpec(spec, points).ok) continue;
      seen.add(print);
      out.push({ spec: { ...spec, id: `model:${print}` }, motivatedBy: finding });
    }
  }
  return out;
}

/** Re-exported so a caller can evaluate a proposal without importing two modules. */
export { basisValue };
