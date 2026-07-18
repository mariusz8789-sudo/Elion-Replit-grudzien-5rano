/**
 * moleculeComparison (Stage 6) — the molecule SELECTION engine.
 *
 * Scientists compare candidates; they rarely analyse one. This module ranks a set of
 * molecules, compares them to a reference, buckets them into a portfolio and issues a
 * prioritisation verdict — using ONLY descriptors RDKit already computed (MW, LogP,
 * TPSA, HBD, HBA, Lipinski, structural alerts). It never invents biological activity,
 * efficacy or experimental outcomes. The score is an explicit *physicochemical
 * developability* score, not a prediction of whether a molecule works.
 *
 * Hard rules (mandated): no new engine, no biology, no efficacy, no AI. Every ranking
 * and every verdict explains itself from the descriptors that produced it. Pure +
 * deterministic + unit-tested.
 */
import type { MoleculeProps } from './moleculeInterpretation';
import type { IconName } from '../components/Icon';
import { GROUNDING_VERSION } from './provenance';
import { t } from './i18n';

/**
 * Version tag for this scoring algorithm — parallels GROUNDING_VERSION. Bump it whenever the
 * point weights, thresholds, or verdict rules below change, so a Scientific Snapshot can record
 * exactly which ranking logic produced it (a version bump alone explains a re-ranked portfolio,
 * distinguishing it from a genuine change in molecule data).
 */
export const SCORING_VERSION = 'genesis-scoring/1';

export interface Candidate {
  id: string;
  name: string;
  smiles: string;
  props: MoleculeProps;
  alerts: string[];
}

/** One transparent contribution to the developability score. */
export interface ScorePart { label: string; points: number; max: number; reason: string }

export interface Scored { score: number; parts: ScorePart[] }

export type Verdict = 'CONTINUE' | 'NEEDS_EXPERIMENTS' | 'HIGH_UNCERTAINTY' | 'REJECT';

export interface Decision {
  verdict: Verdict;
  reasons: string[]; // descriptor-grounded justifications
}

export interface RankedCandidate extends Candidate {
  rank: number;
  scored: Scored;
  decision: Decision;
  strengths: string[];
  weaknesses: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

/**
 * Physicochemical developability score (0–100) from verified descriptors only.
 * Transparent: every point is attributed to a named rule with a reason. This scores
 * *drug-likeness / developability*, NOT biological activity or efficacy.
 */
export function developabilityScore(p: MoleculeProps, alerts: string[] = []): Scored {
  const parts: ScorePart[] = [];

  // Lipinski (25)
  if (p.lipinskiPass) parts.push({ label: t('score.lipinski.label'), points: 25, max: 25, reason: t('score.lipinski.pass', { v: p.lipinskiViolations }) });
  else parts.push({ label: t('score.lipinski.label'), points: clamp(25 - p.lipinskiViolations * 12, 0, 25), max: 25, reason: t('score.lipinski.fail', { v: p.lipinskiViolations }) });

  // LogP (25) — favours 1–3
  const lp = p.logP;
  let lpPts = 5, lpReason = t('score.logp.out', { v: f(lp) });
  if (lp >= 1 && lp <= 3) { lpPts = 25; lpReason = t('score.logp.ideal', { v: f(lp) }); }
  else if ((lp >= 0 && lp < 1) || (lp > 3 && lp <= 5)) { lpPts = 15; lpReason = t('score.logp.ok', { v: f(lp) }); }
  parts.push({ label: t('score.logp.label'), points: lpPts, max: 25, reason: lpReason });

  // TPSA (20) — favours 20–90 (oral), 90–140 acceptable
  const tp = p.tpsa;
  let tPts = 5, tReason = t('score.tpsa.out', { v: f(tp, 1) });
  if (tp >= 20 && tp <= 90) { tPts = 20; tReason = t('score.tpsa.oral', { v: f(tp, 1) }); }
  else if (tp > 90 && tp <= 140) { tPts = 12; tReason = t('score.tpsa.ok', { v: f(tp, 1) }); }
  parts.push({ label: t('score.tpsa.label'), points: tPts, max: 20, reason: tReason });

  // H-bonds (15)
  if (p.hbd <= 5 && p.hba <= 10) parts.push({ label: t('score.hbond.label'), points: 15, max: 15, reason: t('score.hbond.ok', { hbd: p.hbd, hba: p.hba }) });
  else parts.push({ label: t('score.hbond.label'), points: 5, max: 15, reason: t('score.hbond.out', { hbd: p.hbd, hba: p.hba }) });

  // MW (15) — favours 250–500
  const mw = p.molWt;
  let mwPts = 5, mwReason = t('score.mw.out', { v: f(mw) });
  if (mw >= 250 && mw <= 500) { mwPts = 15; mwReason = t('score.mw.ideal', { v: f(mw) }); }
  else if (mw < 250) { mwPts = 10; mwReason = t('score.mw.low', { v: f(mw) }); }
  parts.push({ label: t('score.mw.label'), points: mwPts, max: 15, reason: mwReason });

  // Structural alerts (penalty up to −24, tracked as a 0-point line with negative)
  const alertPenalty = clamp(-alerts.length * 8, -24, 0);
  parts.push({ label: t('score.alerts.label'), points: alertPenalty, max: 0, reason: alerts.length ? t('score.alerts.some', { n: alerts.length, list: alerts.join(', ') }) : t('score.alerts.none') });

  const raw = parts.reduce((s, x) => s + x.points, 0);
  return { score: clamp(Math.round(raw), 0, 100), parts };
}

/** Strengths / weaknesses derived from the scored parts (descriptor-grounded). */
export function strengthsWeaknesses(scored: Scored): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const part of scored.parts) {
    if (part.max > 0 && part.points >= part.max * 0.8) strengths.push(`${part.label}: ${part.reason}`);
    else if (part.points < 0 || (part.max > 0 && part.points <= part.max * 0.4)) weaknesses.push(`${part.label}: ${part.reason}`);
  }
  return { strengths, weaknesses };
}

/**
 * Prioritisation verdict from descriptors ONLY. This is a physicochemical triage, not
 * a claim about whether the molecule is active or safe — every path ultimately needs
 * experimental validation. High LogP-driven uncertainty is surfaced because LogP is a
 * model estimate (~±0.5).
 */
export function decisionFor(p: MoleculeProps, alerts: string[] = []): Decision {
  const reasons: string[] = [];
  // REJECT — hard physicochemical liabilities
  if (p.lipinskiViolations >= 2 || p.logP > 6 || p.molWt > 700) {
    if (p.lipinskiViolations >= 2) reasons.push(t('decision.reject.lipinski', { v: p.lipinskiViolations }));
    if (p.logP > 6) reasons.push(t('decision.reject.logp', { v: f(p.logP) }));
    if (p.molWt > 700) reasons.push(t('decision.reject.mw', { v: f(p.molWt) }));
    reasons.push(t('decision.reject.note'));
    return { verdict: 'REJECT', reasons };
  }
  // HIGH UNCERTAINTY — alerts or LogP near the edge (model estimate)
  if (alerts.length > 0 || p.logP > 5 || p.logP < 0) {
    if (alerts.length) reasons.push(t('decision.uncertain.alerts', { list: alerts.join(', ') }));
    if (p.logP > 5) reasons.push(t('decision.uncertain.logpHigh', { v: f(p.logP) }));
    if (p.logP < 0) reasons.push(t('decision.uncertain.logpLow', { v: f(p.logP) }));
    reasons.push(t('decision.uncertain.note'));
    return { verdict: 'HIGH_UNCERTAINTY', reasons };
  }
  // CONTINUE — strong, clean physicochemical profile
  if (p.lipinskiPass && p.logP >= 0 && p.logP <= 5 && p.tpsa <= 140) {
    reasons.push(t('decision.continue.profile', { v: p.lipinskiViolations, logp: f(p.logP), tpsa: f(p.tpsa, 1) }));
    reasons.push(t('decision.continue.note'));
    return { verdict: 'CONTINUE', reasons };
  }
  // NEEDS EXPERIMENTS — the honest default
  reasons.push(t('decision.needs.profile'));
  reasons.push(t('decision.needs.note'));
  return { verdict: 'NEEDS_EXPERIMENTS', reasons };
}

/** Rank a set by developability score (desc). Ties broken by fewer alerts, then MW. */
export function rankCandidates(candidates: Candidate[]): RankedCandidate[] {
  const scored = candidates.map((c) => {
    const s = developabilityScore(c.props, c.alerts);
    const sw = strengthsWeaknesses(s);
    return { ...c, scored: s, decision: decisionFor(c.props, c.alerts), strengths: sw.strengths, weaknesses: sw.weaknesses };
  });
  scored.sort((a, b) => b.scored.score - a.scored.score || a.alerts.length - b.alerts.length || a.props.molWt - b.props.molWt);
  return scored.map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Top reasons a candidate ranks where it does (WHY), from its strongest score parts. */
export function rankingWhy(c: RankedCandidate): string[] {
  const positives = [...c.scored.parts].filter((p) => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 2).map((p) => p.reason);
  const negatives = c.scored.parts.filter((p) => p.points < 0 || (p.max > 0 && p.points <= p.max * 0.4)).map((p) => p.reason);
  return [...positives.map((r) => `+ ${r}`), ...negatives.map((r) => `− ${r}`)];
}

/* ---------------- Reference comparison ---------------- */

export type Direction = 'higher' | 'lower' | 'equal';
export interface DescriptorDiff {
  key: string; label: string; unit: string;
  candidate: number; reference: number; delta: number; direction: Direction;
  interpretation: string; // what the difference MEANS (not just the number)
}

interface DescMeta { key: keyof MoleculeProps; label: string; unit: string; eps: number; interpret: (delta: number, dir: Direction) => string }

const DESC: DescMeta[] = [
  { key: 'molWt', label: 'Masa molowa', unit: 'g/mol', eps: 0.5, interpret: (d, dir) => dir === 'higher' ? t('desc.mw.higher', { v: f(Math.abs(d)) }) : dir === 'lower' ? t('desc.mw.lower', { v: f(Math.abs(d)) }) : t('desc.mw.equal') },
  { key: 'logP', label: 'LogP', unit: '', eps: 0.05, interpret: (d, dir) => dir === 'higher' ? t('desc.logp.higher', { v: f(Math.abs(d)) }) : dir === 'lower' ? t('desc.logp.lower', { v: f(Math.abs(d)) }) : t('desc.logp.equal') },
  { key: 'tpsa', label: 'TPSA', unit: 'Å²', eps: 0.5, interpret: (d, dir) => dir === 'higher' ? t('desc.tpsa.higher', { v: f(Math.abs(d), 1) }) : dir === 'lower' ? t('desc.tpsa.lower', { v: f(Math.abs(d), 1) }) : t('desc.tpsa.equal') },
  { key: 'hbd', label: 'Donory H (HBD)', unit: '', eps: 0.5, interpret: (d, dir) => dir === 'equal' ? t('desc.hbd.equal') : t('desc.hbd.diff', { cmp: dir === 'higher' ? t('desc.more') : t('desc.less'), v: `${d > 0 ? '+' : ''}${d}` }) },
  { key: 'hba', label: 'Akceptory H (HBA)', unit: '', eps: 0.5, interpret: (d, dir) => dir === 'equal' ? t('desc.hba.equal') : t('desc.hba.diff', { cmp: dir === 'higher' ? t('desc.more') : t('desc.less'), v: `${d > 0 ? '+' : ''}${d}` }) },
];

/** Interpreted differences of a candidate vs a reference molecule. */
export function differencesVsReference(candidate: MoleculeProps, reference: MoleculeProps): DescriptorDiff[] {
  return DESC.map((m) => {
    const cv = Number(candidate[m.key]);
    const rv = Number(reference[m.key]);
    const delta = cv - rv;
    const direction: Direction = Math.abs(delta) <= m.eps ? 'equal' : delta > 0 ? 'higher' : 'lower';
    return { key: String(m.key), label: m.label, unit: m.unit, candidate: cv, reference: rv, delta, direction, interpretation: m.interpret(f(delta) as number, direction) };
  });
}

/* ---------------- Portfolio ---------------- */

export interface Portfolio {
  best: RankedCandidate[];
  needsValidation: RankedCandidate[];
  rejected: RankedCandidate[];
  worst: RankedCandidate[];
}

/** Bucket a ranked set into a portfolio view. */
export function portfolioBuckets(ranked: RankedCandidate[]): Portfolio {
  const rejected = ranked.filter((c) => c.decision.verdict === 'REJECT');
  const best = ranked.filter((c) => c.decision.verdict === 'CONTINUE');
  const needsValidation = ranked.filter((c) => c.decision.verdict === 'NEEDS_EXPERIMENTS' || c.decision.verdict === 'HIGH_UNCERTAINTY');
  const worst = [...ranked].slice(-Math.min(3, ranked.length)).reverse(); // lowest-scoring tail
  return { best, needsValidation, rejected, worst };
}

/* ---------------- Scientific matrix (heatmap) ---------------- */

export type Favorability = number; // 0 (poor) … 1 (favourable)

export interface MatrixCell { key: string; label: string; value: number; display: string; favorability: Favorability }
export interface MatrixRow { id: string; name: string; rank: number; score: number; verdict: Verdict; cells: MatrixCell[] }

/** Per-descriptor favourability (0–1) using the same honest bands as the score. */
export function descriptorFavorability(key: string, v: number): Favorability {
  switch (key) {
    case 'molWt': return v >= 250 && v <= 500 ? 1 : v < 250 ? 0.65 : v <= 700 ? 0.4 : 0.15;
    case 'logP': return v >= 1 && v <= 3 ? 1 : v >= 0 && v <= 5 ? 0.6 : v <= 6 ? 0.35 : 0.1;
    case 'tpsa': return v >= 20 && v <= 90 ? 1 : v <= 140 ? 0.6 : 0.25;
    case 'hbd': return v <= 5 ? 1 : 0.35;
    case 'hba': return v <= 10 ? 1 : 0.35;
    case 'lipinskiViolations': return v === 0 ? 1 : v === 1 ? 0.55 : 0.15;
    case 'alerts': return v === 0 ? 1 : v === 1 ? 0.5 : 0.2;
    default: return 0.5;
  }
}

const MATRIX_COLS: { key: string; label: string; unit: string; get: (c: RankedCandidate) => number }[] = [
  { key: 'molWt', label: 'MW', unit: '', get: (c) => c.props.molWt },
  { key: 'logP', label: 'LogP', unit: '', get: (c) => c.props.logP },
  { key: 'tpsa', label: 'TPSA', unit: '', get: (c) => c.props.tpsa },
  { key: 'hbd', label: 'HBD', unit: '', get: (c) => c.props.hbd },
  { key: 'hba', label: 'HBA', unit: '', get: (c) => c.props.hba },
  { key: 'lipinskiViolations', label: 'Ro5 viol.', unit: '', get: (c) => c.props.lipinskiViolations },
  { key: 'alerts', label: 'Alerty', unit: '', get: (c) => c.alerts.length },
];

export const MATRIX_COLUMNS = MATRIX_COLS.map((c) => ({ key: c.key, label: c.label }));

/** Build the heatmap matrix (rows = molecules, cols = descriptors + flags). */
export function buildMatrix(ranked: RankedCandidate[]): MatrixRow[] {
  return ranked.map((c) => ({
    id: c.id, name: c.name, rank: c.rank, score: c.scored.score, verdict: c.decision.verdict,
    cells: MATRIX_COLS.map((col) => {
      const value = col.get(c);
      const display = col.key === 'tpsa' ? String(f(value, 1)) : col.key === 'logP' || col.key === 'molWt' ? String(f(value)) : String(value);
      return { key: col.key, label: col.label, value, display, favorability: descriptorFavorability(col.key, value) };
    }),
  }));
}

/* ---------------- Decision Trace (Stage 7) ---------------- */

export interface DecisionTrace {
  rank: number;
  score: number;
  verdict: Verdict;
  descriptorsUsed: string[];                              // every score part's descriptor
  rulesTriggered: { label: string; reason: string; points: number }[]; // parts that added points
  positives: string[];                                   // the "+" lines of the WHY column
  negatives: string[];                                   // the "−" lines of the WHY column
  rejectedRules: { label: string; reason: string }[];    // parts that scored poorly / penalised
  verdictReasons: string[];
  groundingStatus: string;
}

/**
 * Decision Trace — a PROJECTION of data already produced by rankCandidates/rankingWhy.
 * It recomputes NOTHING: positives/negatives are exactly the Stage 6 "WHY (+/−)" lines,
 * descriptors/rules come straight from the score parts. One source of truth.
 */
export function decisionTrace(c: RankedCandidate): DecisionTrace {
  const why = rankingWhy(c); // the SAME explanation used by the ranking table
  return {
    rank: c.rank,
    score: c.scored.score,
    verdict: c.decision.verdict,
    descriptorsUsed: c.scored.parts.map((p) => p.label),
    rulesTriggered: c.scored.parts.filter((p) => p.points > 0).map((p) => ({ label: p.label, reason: p.reason, points: p.points })),
    positives: why.filter((w) => w.startsWith('+')),
    negatives: why.filter((w) => w.startsWith('−')),
    rejectedRules: c.scored.parts.filter((p) => p.points < 0 || (p.max > 0 && p.points <= p.max * 0.4)).map((p) => ({ label: p.label, reason: p.reason })),
    verdictReasons: c.decision.reasons,
    groundingStatus: t('score.grounding', { version: GROUNDING_VERSION }),
  };
}

export const VERDICT_META: Record<Verdict, { label: string; kind: 'ok' | 'warn' | 'info' | 'blocked'; icon: IconName }> = {
  CONTINUE: { label: 'Kontynuuj', kind: 'ok', icon: 'check' },
  NEEDS_EXPERIMENTS: { label: 'Wymaga eksperymentów', kind: 'warn', icon: 'flask' },
  HIGH_UNCERTAINTY: { label: 'Wysoka niepewność', kind: 'info', icon: 'alert' },
  REJECT: { label: 'Odrzuć na teraz', kind: 'blocked', icon: 'block' },
};
