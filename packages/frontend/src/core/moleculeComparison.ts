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
  if (p.lipinskiPass) parts.push({ label: 'Reguła Lipinskiego', points: 25, max: 25, reason: `spełniona (${p.lipinskiViolations} naruszeń)` });
  else parts.push({ label: 'Reguła Lipinskiego', points: clamp(25 - p.lipinskiViolations * 12, 0, 25), max: 25, reason: `${p.lipinskiViolations} naruszeń Ro5` });

  // LogP (25) — favours 1–3
  const lp = p.logP;
  let lpPts = 5, lpReason = `LogP ${f(lp)} poza korzystnym zakresem`;
  if (lp >= 1 && lp <= 3) { lpPts = 25; lpReason = `LogP ${f(lp)} w idealnym zakresie 1–3`; }
  else if ((lp >= 0 && lp < 1) || (lp > 3 && lp <= 5)) { lpPts = 15; lpReason = `LogP ${f(lp)} akceptowalny`; }
  parts.push({ label: 'Lipofilowość (LogP)', points: lpPts, max: 25, reason: lpReason });

  // TPSA (20) — favours 20–90 (oral), 90–140 acceptable
  const t = p.tpsa;
  let tPts = 5, tReason = `TPSA ${f(t, 1)} Å² poza zakresem absorpcji`;
  if (t >= 20 && t <= 90) { tPts = 20; tReason = `TPSA ${f(t, 1)} Å² sprzyja absorpcji doustnej`; }
  else if (t > 90 && t <= 140) { tPts = 12; tReason = `TPSA ${f(t, 1)} Å² akceptowalna dla absorpcji`; }
  parts.push({ label: 'Polarna powierzchnia (TPSA)', points: tPts, max: 20, reason: tReason });

  // H-bonds (15)
  if (p.hbd <= 5 && p.hba <= 10) parts.push({ label: 'Wiązania wodorowe', points: 15, max: 15, reason: `HBD ${p.hbd} ≤ 5, HBA ${p.hba} ≤ 10` });
  else parts.push({ label: 'Wiązania wodorowe', points: 5, max: 15, reason: `HBD ${p.hbd} / HBA ${p.hba} poza Ro5` });

  // MW (15) — favours 250–500
  const mw = p.molWt;
  let mwPts = 5, mwReason = `MW ${f(mw)} g/mol poza korzystnym zakresem`;
  if (mw >= 250 && mw <= 500) { mwPts = 15; mwReason = `MW ${f(mw)} g/mol w zakresie 250–500`; }
  else if (mw < 250) { mwPts = 10; mwReason = `MW ${f(mw)} g/mol — niska (fragment-like)`; }
  parts.push({ label: 'Masa molowa (MW)', points: mwPts, max: 15, reason: mwReason });

  // Structural alerts (penalty up to −24, tracked as a 0-point line with negative)
  const alertPenalty = clamp(-alerts.length * 8, -24, 0);
  parts.push({ label: 'Alerty strukturalne', points: alertPenalty, max: 0, reason: alerts.length ? `${alerts.length} alert(y): ${alerts.join(', ')}` : 'brak alertów' });

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
    if (p.lipinskiViolations >= 2) reasons.push(`${p.lipinskiViolations} naruszenia reguły Lipinskiego — poważne ryzyko biodostępności doustnej.`);
    if (p.logP > 6) reasons.push(`LogP ${f(p.logP)} > 6 — przewidywana bardzo słaba rozpuszczalność.`);
    if (p.molWt > 700) reasons.push(`MW ${f(p.molWt)} g/mol > 700 — poza typową przestrzenią leków doustnych.`);
    reasons.push('Rekomendacja dotyczy wyłącznie profilu fizykochemicznego — nie przesądza o aktywności.');
    return { verdict: 'REJECT', reasons };
  }
  // HIGH UNCERTAINTY — alerts or LogP near the edge (model estimate)
  if (alerts.length > 0 || p.logP > 5 || p.logP < 0) {
    if (alerts.length) reasons.push(`Alert(y) strukturalne (${alerts.join(', ')}) — wymagają oceny ekspertackiej przed syntezą.`);
    if (p.logP > 5) reasons.push(`LogP ${f(p.logP)} tuż powyżej progu 5, a to oszacowanie modelu (~±0.5) — realna wartość niepewna.`);
    if (p.logP < 0) reasons.push(`LogP ${f(p.logP)} < 0 — silnie hydrofilowy, możliwa słaba permeacja; wartość modelowa niepewna.`);
    reasons.push('Wymagane pomiary rozstrzygające niepewność (rozpuszczalność, permeacja).');
    return { verdict: 'HIGH_UNCERTAINTY', reasons };
  }
  // CONTINUE — strong, clean physicochemical profile
  if (p.lipinskiPass && p.logP >= 0 && p.logP <= 5 && p.tpsa <= 140) {
    reasons.push(`Zgodny z Ro5 (${p.lipinskiViolations} naruszeń), LogP ${f(p.logP)} i TPSA ${f(p.tpsa, 1)} Å² w korzystnych zakresach.`);
    reasons.push('Priorytet do dalszych badań — konieczna walidacja eksperymentalna (ADMET, rozpuszczalność, assay).');
    return { verdict: 'CONTINUE', reasons };
  }
  // NEEDS EXPERIMENTS — the honest default
  reasons.push('Profil bez twardych przeciwwskazań, ale z parametrami wymagającymi pomiaru.');
  reasons.push('Konieczna walidacja eksperymentalna przed decyzją.');
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
  { key: 'molWt', label: 'Masa molowa', unit: 'g/mol', eps: 0.5, interpret: (d, dir) => dir === 'higher' ? `cięższa o ${f(Math.abs(d))} g/mol — bliżej górnego limitu Ro5` : dir === 'lower' ? `lżejsza o ${f(Math.abs(d))} g/mol — więcej miejsca na optymalizację` : 'porównywalna masa' },
  { key: 'logP', label: 'LogP', unit: '', eps: 0.05, interpret: (d, dir) => dir === 'higher' ? `bardziej lipofilowa (+${f(Math.abs(d))}) — lepsza permeacja, większe ryzyko rozpuszczalności` : dir === 'lower' ? `bardziej hydrofilowa (−${f(Math.abs(d))}) — lepsza rozpuszczalność, możliwa słabsza permeacja` : 'porównywalna lipofilowość' },
  { key: 'tpsa', label: 'TPSA', unit: 'Å²', eps: 0.5, interpret: (d, dir) => dir === 'higher' ? `wyższa TPSA (+${f(Math.abs(d), 1)}) — słabsza absorpcja bierna` : dir === 'lower' ? `niższa TPSA (−${f(Math.abs(d), 1)}) — sprzyja absorpcji doustnej` : 'porównywalna TPSA' },
  { key: 'hbd', label: 'Donory H (HBD)', unit: '', eps: 0.5, interpret: (d, dir) => dir === 'equal' ? 'tyle samo donorów H' : `${dir === 'higher' ? 'więcej' : 'mniej'} donorów H (${d > 0 ? '+' : ''}${d})` },
  { key: 'hba', label: 'Akceptory H (HBA)', unit: '', eps: 0.5, interpret: (d, dir) => dir === 'equal' ? 'tyle samo akceptorów H' : `${dir === 'higher' ? 'więcej' : 'mniej'} akceptorów H (${d > 0 ? '+' : ''}${d})` },
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

export const VERDICT_META: Record<Verdict, { label: string; kind: 'ok' | 'warn' | 'info' | 'blocked'; icon: IconName }> = {
  CONTINUE: { label: 'Kontynuuj', kind: 'ok', icon: 'check' },
  NEEDS_EXPERIMENTS: { label: 'Wymaga eksperymentów', kind: 'warn', icon: 'flask' },
  HIGH_UNCERTAINTY: { label: 'Wysoka niepewność', kind: 'info', icon: 'alert' },
  REJECT: { label: 'Odrzuć na teraz', kind: 'blocked', icon: 'block' },
};
