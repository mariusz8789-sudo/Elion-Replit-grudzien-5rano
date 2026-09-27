import { signedPaths, explainPath } from './inference.ts';
import { getNode, edgesTo, type GraphNodeId } from './knowledgeGraph.ts';
import { analyseCancerSafety } from './cancerSafety.ts';
import { getIntervention, type InterventionId } from './interventions.ts';
import type { Hypothesis } from './discovery.ts';

/**
 * Longevity Discovery Platform — Scientific Critic.
 *
 * Every hypothesis the discovery engine produces is challenged before it is
 * shown. Not softened, not hedged — challenged, with the specific reason it
 * might be wrong and the specific experiment that would tell the difference.
 *
 * This is deliberate asymmetry. A system that generates hypotheses and does not
 * attack them is a machine for producing confident nonsense, and the failure mode
 * of computational biology tools is precisely that: plausible-looking output that
 * nobody can argue with because the reasoning is hidden. Here the reasoning is a
 * chain of graph edges, so it can be attacked mechanically — and it is.
 *
 * The critic looks for the failure modes that actually kill hypotheses in this
 * field: unmodelled mediators, sign-without-magnitude reasoning, alternative
 * routes that explain the same observation, circular endpoints, reverse
 * causation, and safety liabilities the hypothesis did not price in.
 */

export type ChallengeSeverity = 'fatal-if-true' | 'major' | 'worth-checking';

export interface Challenge {
  id: string;
  severity: ChallengeSeverity;
  /** What could be wrong. */
  statement: string;
  /** The experiment or observation that would settle it. */
  discriminatingTest: string;
}

export interface CritiqueResult {
  hypothesisId: string;
  challenges: Challenge[];
  /** Other routes in the graph that would explain the same observation. */
  alternativeMechanisms: { statement: string; path: string[] }[];
  /**
   * Plausibility after the critique, 0–100. Each challenge discounts it by a
   * stated amount, so the reduction is auditable rather than a vibe.
   */
  adjustedPlausibility: number;
  /** How the adjustment was reached. */
  adjustmentTrace: { challenge: string; multiplier: number }[];
}

const SEVERITY_DISCOUNT: Record<ChallengeSeverity, number> = {
  'fatal-if-true': 0.55,
  major: 0.75,
  'worth-checking': 0.9,
};

function labelOf(id: GraphNodeId): string {
  return getNode(id)?.label ?? String(id);
}

/**
 * Alternative routes from the hypothesis's first node to its last that do NOT
 * pass through the proposed mediator. Each is a confounder: an observation
 * consistent with the hypothesis is equally consistent with these.
 */
function alternativeRoutes(h: Hypothesis): { statement: string; path: string[] }[] {
  if (h.nodes.length < 3) return [];
  const [from, mediator, ...rest] = h.nodes;
  const to = rest[rest.length - 1] ?? h.nodes[h.nodes.length - 1];
  if (!from || !to || from === to) return [];

  return signedPaths(from, to, 4)
    .filter((p) => !p.edges.some((e) => e.from === mediator || e.to === mediator))
    .slice(0, 3)
    .map((p) => ({
      statement: `${labelOf(from)} could reach ${labelOf(to)} in ${p.hops} hop(s) without involving ${labelOf(mediator)} at all, with net effect "${p.net}".`,
      path: explainPath(p),
    }));
}

/** Is the proposed endpoint downstream of the intervention's own mechanism? */
function isCircularEndpoint(h: Hypothesis): boolean {
  // The canonical case: reprogramming acts on methylation, and the epigenetic
  // clock is built from methylation. The endpoint then partly measures the
  // intervention rather than its consequence.
  const ids = h.nodes.map(String);
  return ids.includes('epigenetic-reprogramming')
    && (ids.includes('yamanaka-factors') || ids.includes('partial-reprogramming'));
}

export function critique(h: Hypothesis): CritiqueResult {
  const challenges: Challenge[] = [];

  // 1. Sign without magnitude — the structural weakness of all graph reasoning.
  challenges.push({
    id: 'magnitude-unknown',
    severity: h.kind === 'safety-offset' ? 'fatal-if-true' : 'major',
    statement:
      'The graph encodes the DIRECTION of every relationship but not its size. Two mechanisms can point opposite ways and differ by orders of magnitude, in which case composing their signs predicts the wrong net outcome.',
    discriminatingTest:
      'Measure the effect size at each step of the chain in the same system and units, then check whether the composition reproduces the observed end-to-end effect.',
  });

  // 2. Chain length — each additional hop is another place for an unmodelled modifier.
  const hops = Math.max(0, h.nodes.length - 1);
  if (hops >= 2) {
    challenges.push({
      id: 'unmodelled-mediator',
      severity: hops >= 3 ? 'major' : 'worth-checking',
      statement: `The reasoning traverses ${hops} links. Each one assumes no unmodelled modifier intervenes — an assumption that gets weaker multiplicatively, not additively, with chain length.`,
      discriminatingTest:
        'Perturb the chain at its midpoint and confirm the downstream effect appears; if it does not, a modifier sits between the steps.',
    });
  }

  // 3. Alternative routes that explain the same observation.
  const alternatives = alternativeRoutes(h);
  if (alternatives.length > 0) {
    challenges.push({
      id: 'alternative-route',
      severity: 'major',
      statement: `The graph contains ${alternatives.length} other route(s) from the start to the end of this hypothesis that bypass the proposed mediator. A positive result would not distinguish this hypothesis from those.`,
      discriminatingTest:
        'Block the proposed mediator specifically. If the effect survives, the mechanism runs through one of the alternative routes instead.',
    });
  }

  // 4. Circular endpoint.
  if (isCircularEndpoint(h)) {
    challenges.push({
      id: 'circular-endpoint',
      severity: 'fatal-if-true',
      statement:
        'The natural endpoint here (an epigenetic clock) is built from the same methylation marks the intervention acts on directly. A clock reading falling is therefore partly guaranteed by the mechanism, independently of whether anything is functionally younger.',
      discriminatingTest:
        'Use a functional endpoint that shares no measurement substrate with the intervention — regenerative capacity, grip strength, or survival — as the primary outcome.',
    });
  }

  // 5. Reverse causation, wherever an observational claim could be inverted.
  challenges.push({
    id: 'reverse-causation',
    severity: 'worth-checking',
    statement:
      'The proposed direction may be inverted: the mechanism treated as upstream could be a consequence of the outcome rather than its cause. Ageing biology has repeatedly reclassified causes as consequences.',
    discriminatingTest:
      'A perturbation experiment in both directions — intervene on the proposed cause and, separately, on the proposed effect, and check which produces movement in the other.',
  });

  // 6. Novelty may mean "already tried and not published".
  if (h.novelty > 80) {
    challenges.push({
      id: 'file-drawer',
      severity: 'worth-checking',
      statement:
        'High novelty here means "no evidence record covers it", which is not the same as "nobody has tried it". An obvious experiment with no published result is often an experiment that produced a null and was never written up.',
      discriminatingTest:
        'Search trial registries and preprint servers for unreported attempts before committing resources to a new one.',
    });
  }

  // 7. Oncogenic liability the hypothesis did not price in.
  for (const node of h.nodes) {
    const intervention = getIntervention(node as InterventionId);
    if (!intervention) continue;
    const safety = analyseCancerSafety(intervention.id);
    if (safety && safety.risks.length > 0) {
      challenges.push({
        id: `oncogenic-${intervention.id}`,
        severity: 'major',
        statement: `${intervention.label} carries ${safety.risks.length} documented route(s) that increase cancer risk (${[...new Set(safety.risks.map((r) => r.axisLabel))].join(', ')}). A hypothesis that ignores this is optimising a benefit while leaving a liability unmeasured.`,
        discriminatingTest:
          'Include an oncogenic endpoint — tumour incidence or clonal expansion — over a horizon long enough for it to appear, not just the efficacy endpoint.',
      });
      break; // one safety challenge per hypothesis is enough to make the point
    }
  }

  // 8. Terminal nodes: nothing downstream is documented, so consequences cannot propagate.
  const terminal = h.nodes.filter((n) => edgesTo(n).length === 0);
  if (terminal.length > 0) {
    challenges.push({
      id: 'isolated-node',
      severity: 'worth-checking',
      statement: `${terminal.map(labelOf).join(', ')} has no documented incoming mechanistic edge, so the graph cannot say what would drive it. The hypothesis assumes a controllable entry point that the model does not describe.`,
      discriminatingTest: 'Establish and validate a means of perturbing that node before designing an experiment that depends on doing so.',
    });
  }

  const adjustmentTrace = challenges.map((c) => ({ challenge: c.id, multiplier: SEVERITY_DISCOUNT[c.severity] }));
  const adjusted = challenges.reduce((p, c) => p * SEVERITY_DISCOUNT[c.severity], h.plausibility);

  return {
    hypothesisId: h.id,
    challenges,
    alternativeMechanisms: alternatives,
    adjustedPlausibility: Math.max(1, Math.round(adjusted)),
    adjustmentTrace,
  };
}

/** Critique a whole set, attaching the challenge statements back onto each hypothesis. */
export function critiqueAll(hypotheses: Hypothesis[]): { hypothesis: Hypothesis; critique: CritiqueResult }[] {
  return hypotheses.map((h) => {
    const result = critique(h);
    return {
      hypothesis: { ...h, challenges: result.challenges.map((c) => c.statement) },
      critique: result,
    };
  });
}

/**
 * Hypotheses that survive their own critique best — highest plausibility AFTER
 * every challenge has been applied, still weighted by novelty. This is the list a
 * researcher should actually read first, and it is deliberately shorter and more
 * pessimistic than the raw generation output.
 */
export function survivingHypotheses(hypotheses: Hypothesis[], limit = 10): { hypothesis: Hypothesis; critique: CritiqueResult; survivalScore: number }[] {
  return critiqueAll(hypotheses)
    .map((x) => ({ ...x, survivalScore: Math.round((x.critique.adjustedPlausibility * x.hypothesis.novelty) / 100) }))
    .sort((a, b) => b.survivalScore - a.survivalScore)
    .slice(0, limit);
}
