import { INTERVENTIONS, type InterventionId } from './interventions';
import { appraiseIntervention, type InterventionAppraisal } from './appraisal';
import { analyseCancerSafety } from './cancerSafety';
import { analyseSafeRegeneration } from './safeRegeneration';
import { hubRanking } from './inference';
import { nextExperiments } from './discovery';
import type { EvidenceRecord } from './evidence';

/**
 * Scientific Discovery Score.
 *
 * One ranking of research directions from six quantities the platform already
 * computes separately: evidence quality, novelty, cancer risk, uncertainty,
 * translational difficulty and potential impact.
 *
 * WHY COMBINE THEM AT ALL. Separately they are honest and unusable — a director
 * choosing between programmes cannot hold six rankings at once. Combined naively
 * they become a black box, which is worse. The compromise here is that the score
 * is a WEIGHTED SUM WITH PUBLISHED WEIGHTS, every component is returned with its
 * own value and rationale, and the weights are exported so a lab that disagrees
 * can substitute its own and re-rank. The number is a summary of the components,
 * never a substitute for them.
 *
 * TWO COMPONENTS ARE DELIBERATELY NEGATIVE. Cancer risk and uncertainty subtract.
 * A ranking in which more unknowns never cost anything would reward ignorance,
 * and this field has enough of that already.
 *
 * `potentialImpact` is the only component not derived from evidence, because no
 * evidence about impact exists before the work is done. It is computed from graph
 * structure — how many mechanisms a strategy touches and how connected they are —
 * which is a statement about REACH, not about benefit. That distinction is stated
 * in the component's own rationale so it cannot be quietly read as efficacy.
 */

export interface ScoreComponent {
  factor: string;
  /** Raw component value, 0–100. */
  value: number;
  /** Weight applied. Negative for components that should subtract. */
  weight: number;
  /** value × weight. */
  contribution: number;
  rationale: string;
}

/** Published weights. Exported so they can be criticised and replaced. */
export const SCORE_WEIGHTS = {
  evidenceQuality: 0.2,
  novelty: 0.15,
  potentialImpact: 0.25,
  translationalFeasibility: 0.2,
  cancerRisk: -0.15,
  uncertainty: -0.05,
} as const;

export interface DiscoveryScore {
  interventionId: InterventionId;
  label: string;
  /** 0–100 after clamping. A summary of the components below, nothing more. */
  score: number;
  components: ScoreComponent[];
  /** The single component most responsible for the ranking position. */
  dominatedBy: string;
  /** What would most raise this score, derived from the weakest weighted component. */
  wouldImproveMostBy: string;
  appraisal: InterventionAppraisal;
  /** Plain reading of the position. Never states that the strategy works. */
  interpretation: string;
}

/**
 * Reach through the mechanism graph: how many mechanisms a strategy targets and
 * how connected those mechanisms are. High reach means a result here informs more
 * of the map — and equally that an off-target effect propagates further.
 */
function potentialImpact(interventionId: InterventionId): { value: number; rationale: string } {
  const intervention = INTERVENTIONS.find((i) => i.id === interventionId)!;
  const hubs = hubRanking();
  const totalDegree = intervention.targets.reduce((sum, t) => sum + (hubs.find((h) => h.id === t)?.total ?? 0), 0);
  const maxPossible = Math.max(...INTERVENTIONS.map((iv) =>
    iv.targets.reduce((s, t) => s + (hubs.find((h) => h.id === t)?.total ?? 0), 0)));
  const value = maxPossible > 0 ? Math.round((totalDegree / maxPossible) * 100) : 0;
  return {
    value,
    rationale: `Targets ${intervention.targets.length} mechanism(s) with ${totalDegree} combined causal edges. This measures REACH through the graph — how much of the map a result would inform — and is explicitly not a prediction of benefit. High reach also means off-target effects propagate further.`,
  };
}

export function scoreIntervention(interventionId: InterventionId, records: EvidenceRecord[]): DiscoveryScore | null {
  const intervention = INTERVENTIONS.find((i) => i.id === interventionId);
  const appraisal = appraiseIntervention(interventionId, records);
  const safety = analyseCancerSafety(interventionId);
  const regeneration = analyseSafeRegeneration(interventionId);
  if (!intervention || !appraisal || !safety || !regeneration) return null;

  // Novelty here is the inverse of how heavily the strategy is already evidenced —
  // a well-studied strategy is a smaller discovery opportunity, whatever its merit.
  const noveltyValue = Math.max(0, Math.round(100 * Math.exp(-appraisal.recordCount / 4)));
  const impact = potentialImpact(interventionId);

  // Cancer risk uses the safe-regeneration cost, which counts only routes that
  // weaken tumour suppression — the failure mode this platform exists to catch.
  const cancerRiskValue = Math.min(100, Math.round(regeneration.suppressionCost * 25 + safety.risks.length * 8));

  const components: ScoreComponent[] = [
    {
      factor: 'Evidence quality', value: appraisal.bestStrength, weight: SCORE_WEIGHTS.evidenceQuality,
      contribution: 0,
      rationale: appraisal.recordCount === 0
        ? 'No evidence records on file, so this scores zero — an empty file, not a negative result.'
        : `Best single record scores ${appraisal.bestStrength}/100 for support of its own conclusion in its own system (human relevance is scored separately, at ${appraisal.bestHumanRelevance}/100).`,
    },
    {
      factor: 'Novelty', value: noveltyValue, weight: SCORE_WEIGHTS.novelty, contribution: 0,
      rationale: `${appraisal.recordCount} record(s) on file. Novelty falls as evidence accumulates — a well-studied strategy is a smaller discovery opportunity regardless of how promising it is.`,
    },
    {
      factor: 'Potential impact', value: impact.value, weight: SCORE_WEIGHTS.potentialImpact, contribution: 0,
      rationale: impact.rationale,
    },
    {
      factor: 'Translational feasibility', value: Math.max(0, 100 - appraisal.translationalDifficulty.score),
      weight: SCORE_WEIGHTS.translationalFeasibility, contribution: 0,
      rationale: `Inverse of translational difficulty (${appraisal.translationalDifficulty.score}/100, band "${appraisal.translationalDifficulty.band}"), driven by ${appraisal.translationalDifficulty.drivers.map((d) => d.factor.toLowerCase()).join(', ')}.`,
    },
    {
      factor: 'Cancer risk', value: cancerRiskValue, weight: SCORE_WEIGHTS.cancerRisk, contribution: 0,
      rationale: `${safety.risks.length} documented route(s) increase cancer risk; weighted suppression cost ${regeneration.suppressionCost}. SUBTRACTS from the score — a direction that quietly trades tumour suppression for function should not outrank one that does not.`,
    },
    {
      factor: 'Uncertainty', value: appraisal.uncertainty, weight: SCORE_WEIGHTS.uncertainty, contribution: 0,
      rationale: `${appraisal.uncertainty}/100 of the evidence a decision would need is missing. SUBTRACTS, so that unstudied directions cannot outrank studied ones merely by having no bad news yet.`,
    },
  ];

  for (const c of components) c.contribution = Number((c.value * c.weight).toFixed(2));

  // Normalise onto 0–100 using the positive weight mass, so the scale is stable
  // regardless of how the weights are later edited.
  const positiveWeight = Object.values(SCORE_WEIGHTS).filter((w) => w > 0).reduce((a, b) => a + b, 0);
  const raw = components.reduce((s, c) => s + c.contribution, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw / positiveWeight)));

  const dominant = [...components].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
  const weakestPositive = components
    .filter((c) => c.weight > 0)
    .sort((a, b) => (a.value * a.weight) - (b.value * b.weight))[0];

  return {
    interventionId, label: intervention.label, score, components,
    dominatedBy: dominant.factor,
    wouldImproveMostBy: buildImprovement(weakestPositive, appraisal, records, interventionId),
    appraisal,
    interpretation: buildInterpretation(intervention.label, score, dominant, cancerRiskValue, appraisal),
  };
}

function buildImprovement(
  weakest: ScoreComponent, appraisal: InterventionAppraisal, records: EvidenceRecord[], id: InterventionId,
): string {
  if (weakest.factor === 'Evidence quality') {
    const next = nextExperiments(records, [id], 1)[0];
    return next
      ? `Raise evidence quality. The highest-value single study available is ${next.tierLabel.toLowerCase()} measuring ${next.outcomeLabel.toLowerCase()} against ${next.hallmarkLabel} — it would retire ${next.uncertaintyReduction} points of uncertainty.`
      : 'Raise evidence quality — no further study in the candidate set would change the appraisal.';
  }
  if (weakest.factor === 'Translational feasibility') {
    const top = appraisal.translationalDifficulty.drivers.sort((a, b) => b.contribution - a.contribution)[0];
    return `Reduce translational difficulty. The largest driver is "${top?.factor}" — ${top?.explanation}`;
  }
  if (weakest.factor === 'Potential impact') {
    return 'Reach is structural and cannot be raised by more evidence. Only extending the strategy to additional mechanisms, or curating edges that are genuinely missing from the graph, would change it.';
  }
  return `Improve ${weakest.factor.toLowerCase()} — currently the weakest weighted contribution.`;
}

function buildInterpretation(
  label: string, score: number, dominant: ScoreComponent, cancerRisk: number, appraisal: InterventionAppraisal,
): string {
  const parts = [`${label} scores ${score}/100, dominated by ${dominant.factor.toLowerCase()} (${dominant.contribution > 0 ? '+' : ''}${dominant.contribution}).`];
  if (cancerRisk > 50) parts.push('Cancer risk is a large negative contributor here — the direction trades tumour suppression for function, and the score reflects that.');
  if (appraisal.recordCount === 0) parts.push('No evidence records exist, so evidence quality contributes nothing and the position rests on structure and safety alone.');
  parts.push('This ranks a RESEARCH DIRECTION by how much it is worth investigating. It is not a claim that the strategy works, and it is not clinical guidance.');
  return parts.join(' ');
}

/** Score and rank every strategy. */
export function rankDiscoveryDirections(records: EvidenceRecord[]): DiscoveryScore[] {
  return INTERVENTIONS
    .map((i) => scoreIntervention(i.id, records))
    .filter((s): s is DiscoveryScore => s !== null)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/**
 * Re-rank under a caller's own weights. Exists so a reviewer can test whether a
 * conclusion survives a different value system — if the ranking inverts when
 * cancer risk is weighted more heavily, that is worth knowing before funding it.
 */
export function rankWithWeights(records: EvidenceRecord[], weights: Partial<typeof SCORE_WEIGHTS>): DiscoveryScore[] {
  const merged = { ...SCORE_WEIGHTS, ...weights };
  const positiveWeight = Object.values(merged).filter((w) => w > 0).reduce((a, b) => a + b, 0) || 1;
  const keyByFactor: Record<string, keyof typeof SCORE_WEIGHTS> = {
    'Evidence quality': 'evidenceQuality', Novelty: 'novelty', 'Potential impact': 'potentialImpact',
    'Translational feasibility': 'translationalFeasibility', 'Cancer risk': 'cancerRisk', Uncertainty: 'uncertainty',
  };

  return rankDiscoveryDirections(records)
    .map((s) => {
      const components = s.components.map((c) => {
        const weight = merged[keyByFactor[c.factor]] ?? c.weight;
        return { ...c, weight, contribution: Number((c.value * weight).toFixed(2)) };
      });
      const raw = components.reduce((sum, c) => sum + c.contribution, 0);
      return { ...s, components, score: Math.max(0, Math.min(100, Math.round(raw / positiveWeight))) };
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
