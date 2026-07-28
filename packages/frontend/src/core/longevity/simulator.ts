import { GRAPH_EDGES, getNode, type GraphEdge, type GraphNodeId } from './knowledgeGraph';
import { transitionPressure, adverseTransitions, beneficialTransitions, type TransitionPressure, type StateInfluence } from './cellStates';

/**
 * Digital Cell Simulator.
 *
 * A researcher states a perturbation — "increase NAD+, decrease mTOR" — and the
 * simulator propagates it through the signed mechanism graph, reporting the
 * predicted DIRECTION of change at every reachable node together with the exact
 * chain that carried it.
 *
 * WHAT THIS IS NOT. It is not a kinetic model, an ODE system or a quantitative
 * prediction. The graph holds signs, not rate constants, so the only defensible
 * output is directional: "this goes up, by this route". Anything numeric beyond a
 * confidence weight would be invented, and inventing it is precisely the failure
 * this platform exists to avoid. Every result therefore carries `magnitudeUnknown`
 * and the UI is expected to say so.
 *
 * WHAT MAKES IT USEFUL ANYWAY. Three things fall out of directional propagation
 * that a researcher cannot easily get by hand:
 *
 *  1. CONFLICTS. When two routes reach the same node with opposite sign, the node
 *     is marked 'conflicted' and both routes are shown. This is where a hidden
 *     modelling assumption lives, and it is the most valuable output here.
 *  2. UNINTENDED CONSEQUENCES. Effects reaching the oncogenic axes are separated
 *     out, so a perturbation chosen for regeneration cannot quietly weaken p53.
 *  3. STATE PRESSURE. The propagated movements feed the cell-state engine, which
 *     reports which transitions the perturbation favours — including transitions
 *     into senescence and cancer.
 *
 * Attenuation with distance is deliberate: a 4-hop consequence is reported with
 * low confidence not because the biology is weaker but because the chain has more
 * places to be wrong.
 */

export type Direction = 'up' | 'down';

export interface Perturbation {
  node: GraphNodeId;
  direction: Direction;
}

export interface PropagatedEffect {
  node: GraphNodeId;
  label: string;
  /** Direction of change, or 'conflicted' when routes disagree. */
  direction: Direction | 'conflicted';
  /** Hops from the nearest perturbation. */
  distance: number;
  /**
   * 0–1. Product of edge honesty along the shortest carrying route, attenuated
   * per hop. Confidence in the CHAIN, not in the size of the effect.
   */
  confidence: number;
  /** True whenever the graph offers no magnitude — which is always. */
  magnitudeUnknown: true;
  /** Every route that reached this node, each with its own sign. */
  routes: { direction: Direction; steps: string[]; confidence: number }[];
  /** Which perturbation(s) this effect descends from. */
  origins: GraphNodeId[];
}

export interface SimulationResult {
  perturbations: Perturbation[];
  /** All reachable nodes with a predicted direction, nearest first. */
  effects: PropagatedEffect[];
  /** Effects landing on the six oncogenic axes — surfaced separately, never buried. */
  oncogenicEffects: PropagatedEffect[];
  /** Nodes reached by routes of opposite sign. */
  conflicts: PropagatedEffect[];
  /** Cell-state transitions the perturbation favours or opposes. */
  statePressures: TransitionPressure[];
  adverse: TransitionPressure[];
  beneficial: TransitionPressure[];
  /** Plain summary. Never says the perturbation works. */
  summary: string;
  /** Bounds of the simulation, always populated. */
  limitations: string[];
}

const HONESTY_WEIGHT: Record<string, number> = {
  exact: 1.0, simplified: 0.7, educational: 0.5, theoretical: 0.35, cinematic: 0.1,
};

/** Per-hop attenuation: each additional link is another chance for the chain to break. */
const HOP_DECAY = 0.75;

function isCausal(e: GraphEdge): boolean {
  return (e.kind === 'mechanistic' || e.kind === 'oncogenic-coupling')
    && (e.effect === 'promotes' || e.effect === 'counteracts');
}

const ONCOGENIC_AXES = new Set<GraphNodeId>([
  'tp53-axis', 'rb-axis', 'oncogene-activation', 'tumour-suppressor-loss', 'genomic-instability', 'immune-surveillance',
]);

const label = (id: GraphNodeId) => getNode(id)?.label ?? String(id);

/** Flip a direction when traversing a counteracting edge. */
function through(direction: Direction, edge: GraphEdge): Direction {
  if (edge.effect === 'counteracts') return direction === 'up' ? 'down' : 'up';
  return direction;
}

function stepText(edge: GraphEdge, incoming: Direction, outgoing: Direction): string {
  const verb = edge.effect === 'promotes' ? 'promotes' : 'counteracts';
  return `${label(edge.from)} ${incoming} → ${label(edge.from)} ${verb} ${label(edge.to)} — ${edge.mechanism} → ${label(edge.to)} ${outgoing}.`;
}

/**
 * Breadth-first propagation from every perturbation simultaneously. Each node
 * accumulates all routes that reach it; a node reached by both an up-route and a
 * down-route is reported as conflicted rather than resolved by majority, because
 * a majority over an unweighted graph is arithmetic dressed as biology.
 */
export function simulate(perturbations: Perturbation[], maxHops = 4): SimulationResult {
  const routesByNode = new Map<GraphNodeId, PropagatedEffect['routes']>();
  const originsByNode = new Map<GraphNodeId, Set<GraphNodeId>>();
  const distanceByNode = new Map<GraphNodeId, number>();

  for (const start of perturbations) {
    // Each perturbation walks independently so that its origin can be tracked.
    const queue: { node: GraphNodeId; direction: Direction; steps: string[]; confidence: number; depth: number; seen: Set<GraphNodeId> }[] = [
      { node: start.node, direction: start.direction, steps: [], confidence: 1, depth: 0, seen: new Set([start.node]) },
    ];

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.depth >= maxHops) continue;

      for (const edge of GRAPH_EDGES) {
        if (edge.from !== cur.node || !isCausal(edge) || cur.seen.has(edge.to)) continue;

        const outgoing = through(cur.direction, edge);
        const confidence = cur.confidence * (HONESTY_WEIGHT[edge.honesty] ?? 0.3) * HOP_DECAY;
        const steps = [...cur.steps, stepText(edge, cur.direction, outgoing)];

        routesByNode.set(edge.to, [...(routesByNode.get(edge.to) ?? []), { direction: outgoing, steps, confidence }]);
        originsByNode.set(edge.to, (originsByNode.get(edge.to) ?? new Set()).add(start.node));
        const depth = cur.depth + 1;
        const known = distanceByNode.get(edge.to);
        if (known === undefined || depth < known) distanceByNode.set(edge.to, depth);

        queue.push({ node: edge.to, direction: outgoing, steps, confidence, depth, seen: new Set([...cur.seen, edge.to]) });
      }
    }
  }

  const perturbedNodes = new Set(perturbations.map((p) => p.node));
  const effects: PropagatedEffect[] = [];

  for (const [node, routes] of routesByNode) {
    // A node the researcher perturbed directly is an input, not a consequence.
    if (perturbedNodes.has(node)) continue;
    const signs = new Set(routes.map((r) => r.direction));
    const best = routes.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    effects.push({
      node, label: label(node),
      direction: signs.size > 1 ? 'conflicted' : best.direction,
      distance: distanceByNode.get(node) ?? 1,
      confidence: Number(best.confidence.toFixed(3)),
      magnitudeUnknown: true,
      routes: routes.sort((a, b) => b.confidence - a.confidence).slice(0, 4),
      origins: [...(originsByNode.get(node) ?? new Set())],
    });
  }

  effects.sort((a, b) => a.distance - b.distance || b.confidence - a.confidence);

  const oncogenicEffects = effects.filter((e) => ONCOGENIC_AXES.has(e.node));
  const conflicts = effects.filter((e) => e.direction === 'conflicted');

  // Feed unambiguous movements into the cell-state engine. Conflicted nodes are
  // deliberately excluded: a node whose direction is unknown cannot be used to
  // argue that a transition is favoured.
  const movements = new Map<StateInfluence, Direction>();
  for (const p of perturbations) movements.set(p.node as StateInfluence, p.direction);
  for (const e of effects) {
    if (e.direction === 'conflicted') continue;
    if (!movements.has(e.node as StateInfluence)) movements.set(e.node as StateInfluence, e.direction);
  }

  const statePressures = transitionPressure(movements);
  const adverse = adverseTransitions(statePressures);
  const beneficial = beneficialTransitions(statePressures);

  return {
    perturbations, effects, oncogenicEffects, conflicts, statePressures, adverse, beneficial,
    summary: buildSummary(perturbations, effects, oncogenicEffects, conflicts, adverse, beneficial),
    limitations: [
      'DIRECTION ONLY. The graph encodes no rate constants, concentrations or timescales, so nothing here is a magnitude and no effect size is implied.',
      'Confidence attenuates per hop because a longer chain has more places to be wrong — it is confidence in the reasoning, not in the biology.',
      'Conflicted nodes are reported, never resolved. Two documented routes of opposite sign mean the answer depends on something the graph does not model.',
      'Only curated edges propagate. A real consequence with no edge in the graph is invisible here, which is not the same as absent.',
      'Cell-state pressures count documented influences. They are not probabilities and imply no timescale for any transition.',
    ],
  };
}

function buildSummary(
  perturbations: Perturbation[], effects: PropagatedEffect[], oncogenic: PropagatedEffect[],
  conflicts: PropagatedEffect[], adverse: TransitionPressure[], beneficial: TransitionPressure[],
): string {
  const inputs = perturbations.map((p) => `${p.direction === 'up' ? '↑' : '↓'} ${label(p.node)}`).join(', ');
  const parts = [`Perturbation: ${inputs}. ${effects.length} downstream node(s) reached.`];

  if (oncogenic.length) {
    const named = oncogenic.map((e) => `${e.label} ${e.direction === 'conflicted' ? '(conflicted)' : e.direction}`).join(', ');
    parts.push(`Reaches ${oncogenic.length} oncogenic axis/axes: ${named}. Whether each movement is protective or dangerous depends on the axis and is stated per finding.`);
  } else {
    parts.push('No documented route reaches an oncogenic axis — an absence of modelled coupling, not a safety result.');
  }

  if (conflicts.length) parts.push(`${conflicts.length} node(s) reached by routes of OPPOSITE sign; those are shown with both routes rather than averaged.`);
  if (beneficial.length) parts.push(`Favours ${beneficial.length} transition(s) toward a desirable state.`);
  if (adverse.length) parts.push(`Also favours ${adverse.length} transition(s) toward an undesirable state (${[...new Set(adverse.map((a) => a.transition.to))].join(', ')}).`);

  parts.push('This is a directional consequence map, not a prediction that the perturbation is beneficial.');
  return parts.join(' ');
}

/**
 * Preset perturbations matching how researchers actually phrase the question.
 * Each maps to graph nodes so the simulator never has to parse free text.
 */
export const PRESET_PERTURBATIONS: { id: string; label: string; perturbations: Perturbation[] }[] = [
  { id: 'nad-up', label: 'Increase NAD+', perturbations: [{ node: 'mitochondrial-dysfunction', direction: 'down' }, { node: 'dna-repair', direction: 'up' }] },
  { id: 'mtor-down', label: 'Decrease mTOR', perturbations: [{ node: 'autophagy', direction: 'up' }] },
  { id: 'autophagy-up', label: 'Increase autophagy', perturbations: [{ node: 'autophagy', direction: 'up' }] },
  { id: 'repair-up', label: 'Increase DNA repair', perturbations: [{ node: 'dna-repair', direction: 'up' }] },
  { id: 'telomerase-on', label: 'Activate telomerase', perturbations: [{ node: 'telomerase', direction: 'up' }] },
  { id: 'senolysis', label: 'Clear senescent cells', perturbations: [{ node: 'cellular-senescence', direction: 'down' }] },
  { id: 'sasp-down', label: 'Suppress SASP', perturbations: [{ node: 'sasp', direction: 'down' }] },
  { id: 'osk', label: 'Partial reprogramming (OSK)', perturbations: [{ node: 'yamanaka-factors', direction: 'up' }, { node: 'epigenetic-reprogramming', direction: 'up' }] },
  {
    id: 'combo-safe', label: 'Combined quality control (autophagy ↑, mitochondrial damage ↓)',
    perturbations: [{ node: 'autophagy', direction: 'up' }, { node: 'mitochondrial-dysfunction', direction: 'down' }],
  },
];
