import { INTERVENTIONS, getIntervention, modulationOf, type InterventionId } from './interventions.ts';
import { analyseCancerSafety, type AxisFinding } from './cancerSafety.ts';
import { getNode, type CancerNodeId } from './knowledgeGraph.ts';
import type { HallmarkId } from './hallmarks.ts';

/**
 * Safe Regeneration Engine — the platform's central question, made computable.
 *
 *   "Can biological age be reversed without increasing cancer risk?"
 *
 * The question is not rhetorical and it is not answerable in general. What IS
 * answerable, from a signed mechanism graph, is a sharper and more useful
 * version of it:
 *
 *   For each strategy, does the route that restores regenerative capacity run
 *   through the same machinery as the route that suppresses tumours — and if so,
 *   in which direction?
 *
 * This matters because the field's central difficulty is not that rejuvenation
 * and cancer are both risky. It is that they are frequently THE SAME MECHANISM
 * READ IN TWO DIRECTIONS. Senescent arrest is a tumour barrier. Telomerase is the
 * immortalisation step. Proliferative capacity is the substrate transformation
 * needs. A strategy that restores youthful function by relieving these is not
 * incidentally risky; it is risky by construction.
 *
 * So the engine separates two quantities that are usually conflated:
 *
 *   regenerationGain   documented routes by which the strategy restores tissue
 *   suppressionCost    documented routes by which it weakens tumour suppression
 *
 * A strategy in the "safe window" gains regeneration WITHOUT paying suppression
 * cost. That set may be small or empty — and if it is empty, saying so plainly is
 * the honest answer to the central question as the evidence currently stands.
 */

/** The axes whose activity protects against transformation. */
const PROTECTIVE_AXES: CancerNodeId[] = ['tp53-axis', 'rb-axis', 'immune-surveillance'];

/** Mechanisms whose increase constitutes restored tissue function. */
const REGENERATIVE_MECHANISMS: HallmarkId[] = ['stem-cell-rejuvenation', 'dna-repair', 'autophagy', 'mitochondrial-dysfunction'];

export interface RegenerationRoute {
  mechanism: HallmarkId;
  mechanismLabel: string;
  /** Direction the strategy pushes it. */
  direction: 'increase' | 'decrease';
  /** Whether that push restores or further degrades regenerative capacity. */
  restores: boolean;
  reasoning: string[];
}

export interface SuppressionCost {
  axis: CancerNodeId;
  axisLabel: string;
  viaMechanism: HallmarkId;
  /** The full composed chain from the safety engine. */
  reasoning: string[];
  confidence: AxisFinding['confidence'];
}

export type SafetyWindow =
  /** Restores tissue with no documented weakening of tumour suppression. */
  | 'in-window'
  /** Restores tissue but pays a documented suppression cost. */
  | 'trades-off'
  /** Weakens tumour suppression without a documented regenerative gain. */
  | 'cost-without-gain'
  /** Neither effect is documented — nothing computed, not a clean result. */
  | 'not-assessable';

export interface SafeRegenerationProfile {
  interventionId: InterventionId;
  label: string;
  window: SafetyWindow;
  regenerationRoutes: RegenerationRoute[];
  suppressionCosts: SuppressionCost[];
  /** Routes that STRENGTHEN tumour suppression — the rare and valuable case. */
  suppressionGains: SuppressionCost[];
  /** Count of restoring routes minus degrading ones. */
  regenerationGain: number;
  /** Weighted count of documented suppression-weakening routes. */
  suppressionCost: number;
  verdict: string;
}

const COST_WEIGHT: Record<AxisFinding['confidence'], number> = { exact: 1.0, simplified: 0.6, theoretical: 0.3 };

function regenerationRoutes(interventionId: InterventionId): RegenerationRoute[] {
  const intervention = getIntervention(interventionId);
  if (!intervention) return [];
  const out: RegenerationRoute[] = [];

  for (const mechanism of intervention.targets) {
    if (!REGENERATIVE_MECHANISMS.includes(mechanism)) continue;
    const direction = modulationOf(interventionId, mechanism);
    if (!direction) continue; // no declared sign → nothing to compose, refuse to guess

    // 'mitochondrial-dysfunction' is named for the DAMAGE, so decreasing it is the
    // restoring direction; the other three are named for the CAPACITY, so
    // increasing them restores. Getting this inversion wrong would silently flip
    // the verdict for every mitochondrial strategy.
    const namedForDamage = mechanism === 'mitochondrial-dysfunction';
    const restores = namedForDamage ? direction === 'decrease' : direction === 'increase';

    out.push({
      mechanism, mechanismLabel: getNode(mechanism)?.label ?? mechanism, direction, restores,
      reasoning: [
        `${intervention.label} is intended to ${direction} ${getNode(mechanism)?.label ?? mechanism}.`,
        namedForDamage
          ? 'That mechanism is named for the damage it describes, so decreasing it is the restoring direction.'
          : 'That mechanism is named for the capacity it describes, so increasing it is the restoring direction.',
        restores
          ? 'This route therefore restores tissue function, in direction only — no magnitude is encoded.'
          : 'This route moves regenerative capacity in the degrading direction.',
      ],
    });
  }
  return out;
}

/**
 * Full profile for one strategy. Deterministic and total: strategies with nothing
 * documented return 'not-assessable' rather than being quietly omitted, because
 * an unstudied strategy looking clean is exactly the failure mode to avoid.
 */
export function analyseSafeRegeneration(interventionId: InterventionId): SafeRegenerationProfile | null {
  const intervention = getIntervention(interventionId);
  if (!intervention) return null;

  const routes = regenerationRoutes(interventionId);
  const safety = analyseCancerSafety(interventionId);

  const toCost = (f: AxisFinding): SuppressionCost => ({
    axis: f.axis, axisLabel: f.axisLabel, viaMechanism: f.viaHallmark,
    reasoning: f.reasoning, confidence: f.confidence,
  });

  // A suppression COST is a route that lowers activity on a protective axis.
  const costs = (safety?.findings ?? [])
    .filter((f) => PROTECTIVE_AXES.includes(f.axis) && f.axisDirection === 'lowers')
    .map(toCost);
  // A suppression GAIN raises a protective axis — rare, and worth surfacing.
  const gains = (safety?.findings ?? [])
    .filter((f) => PROTECTIVE_AXES.includes(f.axis) && f.axisDirection === 'raises')
    .map(toCost);

  const regenerationGain = routes.filter((r) => r.restores).length - routes.filter((r) => !r.restores).length;
  const suppressionCost = costs.reduce((s, c) => s + COST_WEIGHT[c.confidence], 0);

  let window: SafetyWindow;
  if (routes.length === 0 && costs.length === 0 && gains.length === 0) window = 'not-assessable';
  else if (regenerationGain > 0 && suppressionCost === 0) window = 'in-window';
  else if (regenerationGain > 0) window = 'trades-off';
  else if (suppressionCost > 0) window = 'cost-without-gain';
  else window = 'not-assessable';

  return {
    interventionId, label: intervention.label, window,
    regenerationRoutes: routes, suppressionCosts: costs, suppressionGains: gains,
    regenerationGain, suppressionCost: Number(suppressionCost.toFixed(2)),
    verdict: buildVerdict(intervention.label, window, regenerationGain, costs, gains),
  };
}

function buildVerdict(label: string, window: SafetyWindow, gain: number, costs: SuppressionCost[], gains: SuppressionCost[]): string {
  const parts: string[] = [];
  switch (window) {
    case 'in-window':
      parts.push(`${label} has ${gain} documented route(s) restoring tissue function and NO documented route weakening p53, RB or immune surveillance.`);
      parts.push('That places it inside the safety window as the graph currently stands — which is a statement about documented couplings, not a safety finding.');
      break;
    case 'trades-off':
      parts.push(`${label} restores tissue function by ${gain} documented route(s), but pays a cost on ${[...new Set(costs.map((c) => c.axisLabel))].join(', ')}.`);
      parts.push('The gain and the cost travel through the same machinery, so they cannot be separated by tuning exposure alone. Whether the trade is worth making is an empirical question this platform cannot answer.');
      break;
    case 'cost-without-gain':
      parts.push(`${label} weakens ${[...new Set(costs.map((c) => c.axisLabel))].join(', ')} without a documented regenerative gain in this graph.`);
      parts.push('That may reflect missing curation rather than a genuinely poor strategy — check the mechanism coverage before concluding anything.');
      break;
    default:
      parts.push(`Neither a regenerative route nor a suppression cost is documented for ${label}. Nothing was computed; this is an absence of analysis.`);
  }
  if (gains.length) {
    parts.push(`It also STRENGTHENS ${[...new Set(gains.map((g) => g.axisLabel))].join(', ')}, which is uncommon and worth noting.`);
  }
  parts.push('Direction only — the graph encodes no magnitudes, so a small cost and a large one are indistinguishable here.');
  return parts.join(' ');
}

export function analyseAllSafeRegeneration(): SafeRegenerationProfile[] {
  const order: Record<SafetyWindow, number> = { 'in-window': 0, 'trades-off': 1, 'not-assessable': 2, 'cost-without-gain': 3 };
  return INTERVENTIONS
    .map((i) => analyseSafeRegeneration(i.id))
    .filter((p): p is SafeRegenerationProfile => p !== null)
    .sort((a, b) => order[a.window] - order[b.window] || b.regenerationGain - a.regenerationGain || a.suppressionCost - b.suppressionCost);
}

export interface CentralQuestionAnswer {
  /** Strategies that restore tissue with no documented suppression cost. */
  inWindow: SafeRegenerationProfile[];
  tradeOffs: SafeRegenerationProfile[];
  /** Combinations where one strategy's suppression cost is offset by another's gain. */
  offsetCombinations: { a: InterventionId; b: InterventionId; axis: CancerNodeId; reasoning: string[] }[];
  /** The honest, plainly stated answer as the evidence currently stands. */
  statement: string;
  derivation: string[];
}

/**
 * The central question, answered over everything the platform holds.
 *
 * The answer is deliberately allowed to be "nothing qualifies". A discovery
 * platform that can never return an empty set is not measuring anything.
 */
export function answerCentralQuestion(): CentralQuestionAnswer {
  const all = analyseAllSafeRegeneration();
  const inWindow = all.filter((p) => p.window === 'in-window');
  const tradeOffs = all.filter((p) => p.window === 'trades-off');

  // A combination is interesting when one strategy raises a protective axis that
  // the other lowers — the only structural route to keeping the gain and dropping
  // the cost, and a hypothesis rather than a recommendation.
  const offsetCombinations: CentralQuestionAnswer['offsetCombinations'] = [];
  for (const cost of tradeOffs) {
    for (const other of all) {
      if (other.interventionId === cost.interventionId) continue;
      for (const c of cost.suppressionCosts) {
        const gain = other.suppressionGains.find((g) => g.axis === c.axis);
        if (!gain) continue;
        offsetCombinations.push({
          a: cost.interventionId, b: other.interventionId, axis: c.axis,
          reasoning: [
            `${cost.label} lowers activity on ${c.axisLabel} via ${getNode(c.viaMechanism)?.label ?? c.viaMechanism}, which is its suppression cost.`,
            `${other.label} raises activity on the same axis via ${getNode(gain.viaMechanism)?.label ?? gain.viaMechanism}.`,
            'If the two effects are comparable in size, the combination could retain the regenerative gain while restoring the tumour barrier.',
            'MAGNITUDES ARE NOT ENCODED. Opposite directions do not imply cancelling sizes, and this is the proposal’s central weakness.',
          ],
        });
      }
    }
  }

  const derivation = [
    `Analysed ${all.length} strategies. For each, separated documented routes that restore tissue function from documented routes that weaken p53, RB or immune surveillance.`,
    `${inWindow.length} strategy/strategies restore function with no documented suppression cost; ${tradeOffs.length} restore function but pay one.`,
    offsetCombinations.length
      ? `${offsetCombinations.length} combination(s) exist in which one strategy raises a protective axis the other lowers.`
      : 'No combination was found in which one strategy raises a protective axis that another lowers.',
  ];

  const statement = inWindow.length === 0
    ? 'As the graph currently stands, NO registered strategy restores tissue function without a documented route weakening tumour suppression. That is the honest answer to the central question at present — it reflects the state of documented mechanism, and the most valuable next work is either to find a mechanism that separates the two or to establish that they cannot be separated.'
    : `${inWindow.length} strategy/strategies (${inWindow.map((p) => p.label).join(', ')}) restore tissue function with no DOCUMENTED route weakening p53, RB or immune surveillance. This is an absence of documented coupling, not a demonstration of safety: each still requires the oncogenic endpoints listed in its safety profile.`;

  return { inWindow, tradeOffs, offsetCombinations, statement, derivation };
}
