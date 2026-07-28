import {
  GRAPH_EDGES, GRAPH_NODES, edgesFrom, getNode, nodesOfKind,
  type GraphEdge, type GraphNodeId,
} from './knowledgeGraph.ts';
import type { HallmarkId } from './hallmarks.ts';

/**
 * Longevity Discovery Platform — inference engine.
 *
 * Deterministic reasoning over the unified graph. Nothing here is generative in
 * the language-model sense: every conclusion is a graph-theoretic fact plus a
 * stated rule, and every result carries the exact edge chain that produced it.
 * If a reader disagrees with a conclusion, they can point at the edge they
 * dispute. That is the whole design goal — no black box, no hallucinated step.
 *
 * THE CORE OPERATION IS SIGN ALGEBRA. Mechanistic edges are signed: `promotes`
 * (+) or `counteracts` (−). Along a path the signs multiply, so the net effect
 * is `counteracts` when the path contains an ODD number of counteracting edges
 * and `promotes` otherwise. Two paths between the same pair with opposite net
 * sign are not noise to be averaged — they are a detected CONFLICTING MECHANISM,
 * which is one of the most useful things a reasoning system can hand a biologist.
 */

export type NetEffect = 'promotes' | 'counteracts';

export interface SignedPath {
  from: GraphNodeId;
  to: GraphNodeId;
  edges: GraphEdge[];
  /** Product of edge signs along the path. */
  net: NetEffect;
  hops: number;
  /**
   * Weakest honesty level anywhere on the path (0–1). A chain is only as
   * defensible as its least established link, so we take the minimum, never a mean.
   */
  confidence: number;
}

/** Honesty level → numeric weight. Deliberately coarse and stated, not tuned. */
const HONESTY_WEIGHT: Record<string, number> = {
  exact: 1.0,
  simplified: 0.7,
  educational: 0.5,
  theoretical: 0.35,
  cinematic: 0.1,
};

function edgeWeight(e: GraphEdge): number {
  return HONESTY_WEIGHT[e.honesty] ?? 0.3;
}

/** Only signed, causal edges participate in influence reasoning. */
function isCausal(e: GraphEdge): boolean {
  return (e.kind === 'mechanistic' || e.kind === 'oncogenic-coupling')
    && (e.effect === 'promotes' || e.effect === 'counteracts');
}

function netOf(edges: GraphEdge[]): NetEffect {
  const negatives = edges.filter((e) => e.effect === 'counteracts').length;
  return negatives % 2 === 1 ? 'counteracts' : 'promotes';
}

/**
 * Every simple causal path from → to, up to `maxHops`. Depth-first with an
 * explicit visited set, so the senescence↔SASP feedback loop cannot produce an
 * infinite walk. Paths are returned shortest-first.
 */
export function signedPaths(from: GraphNodeId, to: GraphNodeId, maxHops = 4): SignedPath[] {
  const out: SignedPath[] = [];
  const walk = (node: GraphNodeId, path: GraphEdge[], visited: Set<GraphNodeId>) => {
    if (path.length >= maxHops) return;
    for (const e of edgesFrom(node)) {
      if (!isCausal(e) || visited.has(e.to)) continue;
      const next = [...path, e];
      if (e.to === to) {
        out.push({
          from, to, edges: next, net: netOf(next), hops: next.length,
          confidence: Math.min(...next.map(edgeWeight)),
        });
        continue; // do not walk through the target — that would be a different question
      }
      visited.add(e.to);
      walk(e.to, next, visited);
      visited.delete(e.to);
    }
  };
  walk(from, [], new Set([from]));
  return out.sort((a, b) => a.hops - b.hops || b.confidence - a.confidence);
}

export interface InfluenceVerdict {
  from: GraphNodeId;
  to: GraphNodeId;
  /** 'conflicting' when documented paths disagree in sign — surfaced, never averaged. */
  verdict: 'promotes' | 'counteracts' | 'conflicting' | 'no-known-path';
  promotingPaths: SignedPath[];
  counteractingPaths: SignedPath[];
  /** Confidence of the best-supported path in the majority direction (0–1). */
  confidence: number;
  /** Human-readable chain of reasoning for the leading path. */
  explanation: string[];
}

/** Explain one path as a numbered chain of mechanism statements. */
export function explainPath(path: SignedPath): string[] {
  return path.edges.map((e, i) => {
    const a = getNode(e.from)?.label ?? e.from;
    const b = getNode(e.to)?.label ?? e.to;
    const arrow = e.effect === 'promotes' ? 'drives' : 'opposes';
    return `${i + 1}. ${a} ${arrow} ${b} — ${e.mechanism}`;
  });
}

/**
 * Net influence of one node on another across ALL documented paths. When paths
 * disagree the verdict is 'conflicting' and both sets are returned: the honest
 * answer to "does A help or hurt B?" is sometimes "the literature encodes both,
 * and here is each route".
 */
export function netInfluence(from: GraphNodeId, to: GraphNodeId, maxHops = 4): InfluenceVerdict {
  const paths = signedPaths(from, to, maxHops);
  const promoting = paths.filter((p) => p.net === 'promotes');
  const counteracting = paths.filter((p) => p.net === 'counteracts');

  let verdict: InfluenceVerdict['verdict'];
  if (paths.length === 0) verdict = 'no-known-path';
  else if (promoting.length > 0 && counteracting.length > 0) verdict = 'conflicting';
  else if (promoting.length > 0) verdict = 'promotes';
  else verdict = 'counteracts';

  const leading = (promoting.length >= counteracting.length ? promoting : counteracting)[0] ?? paths[0];
  return {
    from, to, verdict,
    promotingPaths: promoting,
    counteractingPaths: counteracting,
    confidence: leading ? leading.confidence : 0,
    explanation: leading ? explainPath(leading) : [],
  };
}

/* ------------------------- structural discovery ------------------------- */

export interface OpenTriad {
  a: GraphNodeId;
  b: GraphNodeId;
  c: GraphNodeId;
  /** The two documented edges. */
  via: [GraphEdge, GraphEdge];
  /** Sign the composed relation would carry if the missing link exists. */
  impliedEffect: NetEffect;
  /** Weakest link of the two known edges (0–1). */
  confidence: number;
}

/**
 * Open triads: A→B and B→C are documented, but no direct A→C edge is. This is the
 * classic literature-based-discovery pattern (Swanson's ABC model) applied to a
 * curated mechanism graph rather than to raw text — which is why it cannot invent
 * a relationship that no curator ever asserted.
 *
 * An open triad is NOT a finding. It is a structurally motivated place to look,
 * and the hypothesis engine turns it into a testable statement with its reasoning
 * chain attached.
 */
export function openTriads(): OpenTriad[] {
  const causal = GRAPH_EDGES.filter(isCausal);
  const direct = new Set(causal.map((e) => `${e.from}->${e.to}`));
  const out: OpenTriad[] = [];
  for (const ab of causal) {
    for (const bc of causal) {
      if (bc.from !== ab.to) continue;
      if (bc.to === ab.from) continue;            // 2-cycle, not a triad
      if (direct.has(`${ab.from}->${bc.to}`)) continue; // already documented
      out.push({
        a: ab.from, b: ab.to, c: bc.to, via: [ab, bc],
        impliedEffect: netOf([ab, bc]),
        confidence: Math.min(edgeWeight(ab), edgeWeight(bc)),
      });
    }
  }
  // Deduplicate on (a,c) keeping the best-supported route.
  const best = new Map<string, OpenTriad>();
  for (const t of out) {
    const key = `${t.a}->${t.c}`;
    const cur = best.get(key);
    if (!cur || t.confidence > cur.confidence) best.set(key, t);
  }
  return [...best.values()].sort((x, y) => y.confidence - x.confidence);
}

export interface StructuralGap {
  nodeId: GraphNodeId;
  label: string;
  kind: 'unmeasurable' | 'untargeted' | 'unassessed-for-cancer' | 'terminal';
  why: string;
}

/**
 * Places where the graph itself is incomplete. Each is an actionable statement
 * about the FIELD, not about a study: "this mechanism has no biomarker" is a real
 * research gap regardless of how many papers exist.
 */
export function structuralGaps(): StructuralGap[] {
  const gaps: StructuralGap[] = [];
  const hallmarks = nodesOfKind('hallmark');

  for (const h of hallmarks) {
    const measuredBy = GRAPH_EDGES.filter((e) => e.kind === 'measures' && e.to === h.id);
    if (measuredBy.length === 0) {
      gaps.push({ nodeId: h.id, label: h.label, kind: 'unmeasurable',
        why: 'No biomarker in the graph reads this mechanism out, so no intervention against it can currently be evaluated in a subject.' });
    }
    const targetedBy = GRAPH_EDGES.filter((e) => e.kind === 'targets' && e.to === h.id);
    if (targetedBy.length === 0) {
      gaps.push({ nodeId: h.id, label: h.label, kind: 'untargeted',
        why: 'No intervention strategy in the registry is aimed at this mechanism — an unworked part of the problem.' });
    }
    const cancerLinked = GRAPH_EDGES.filter((e) => e.kind === 'oncogenic-coupling' && e.from === h.id);
    if (cancerLinked.length === 0) {
      gaps.push({ nodeId: h.id, label: h.label, kind: 'unassessed-for-cancer',
        why: 'This mechanism has no documented coupling to the oncogenic axis. That is a gap in the safety model, not evidence of safety.' });
    }
    const downstream = edgesFrom(h.id).filter(isCausal);
    if (downstream.length === 0) {
      gaps.push({ nodeId: h.id, label: h.label, kind: 'terminal',
        why: 'Nothing downstream is documented: the graph cannot propagate a consequence from this mechanism.' });
    }
  }
  return gaps;
}

export interface InteractionStrength {
  a: HallmarkId;
  b: HallmarkId;
  /** Number of documented causal paths in either direction, up to the hop limit. */
  pathCount: number;
  /** Shortest path length found. */
  shortestHops: number;
  /** Σ over paths of confidence / hops — dense short well-established coupling scores highest. */
  coupling: number;
  bidirectional: boolean;
  conflicting: boolean;
}

/**
 * Which mechanisms interact most strongly. Coupling rewards short, well-established,
 * numerous routes; a single 4-hop theoretical chain scores near zero. `conflicting`
 * marks pairs whose routes disagree in sign, which is precisely where a modelling
 * assumption is doing hidden work.
 */
export function interactionMatrix(maxHops = 3): InteractionStrength[] {
  const hallmarks = nodesOfKind('hallmark').map((n) => n.id as HallmarkId);
  const out: InteractionStrength[] = [];
  for (let i = 0; i < hallmarks.length; i++) {
    for (let j = i + 1; j < hallmarks.length; j++) {
      const ab = signedPaths(hallmarks[i], hallmarks[j], maxHops);
      const ba = signedPaths(hallmarks[j], hallmarks[i], maxHops);
      const all = [...ab, ...ba];
      if (all.length === 0) continue;
      const signs = new Set(all.map((p) => p.net));
      out.push({
        a: hallmarks[i], b: hallmarks[j],
        pathCount: all.length,
        shortestHops: Math.min(...all.map((p) => p.hops)),
        coupling: all.reduce((sum, p) => sum + p.confidence / p.hops, 0),
        bidirectional: ab.length > 0 && ba.length > 0,
        conflicting: signs.size > 1,
      });
    }
  }
  return out.sort((x, y) => y.coupling - x.coupling);
}

export interface FeedbackLoop {
  nodes: GraphNodeId[];
  edges: GraphEdge[];
  /** A loop with an even number of counteracting edges amplifies; odd damps. */
  kind: 'amplifying' | 'damping';
  confidence: number;
}

/**
 * Directed cycles in the causal subgraph. Amplifying loops are where a small
 * perturbation can run away — the senescence→SASP→senescence loop is the canonical
 * example and is exactly why senescent burden is self-accelerating.
 */
export function feedbackLoops(maxLength = 4): FeedbackLoop[] {
  const found = new Map<string, FeedbackLoop>();
  const causal = GRAPH_EDGES.filter(isCausal);
  const starts = [...new Set(causal.map((e) => e.from))];

  const walk = (start: GraphNodeId, node: GraphNodeId, path: GraphEdge[], visited: Set<GraphNodeId>) => {
    if (path.length >= maxLength) return;
    for (const e of edgesFrom(node)) {
      if (!isCausal(e)) continue;
      if (e.to === start && path.length >= 1) {
        const edges = [...path, e];
        const nodes = edges.map((x) => x.from);
        // Canonical key so the same cycle discovered from a different entry point collapses.
        const key = [...nodes].sort().join('|');
        if (!found.has(key)) {
          found.set(key, {
            nodes, edges,
            kind: netOf(edges) === 'promotes' ? 'amplifying' : 'damping',
            confidence: Math.min(...edges.map(edgeWeight)),
          });
        }
        continue;
      }
      if (visited.has(e.to)) continue;
      visited.add(e.to);
      walk(start, e.to, [...path, e], visited);
      visited.delete(e.to);
    }
  };

  for (const s of starts) walk(s, s, [], new Set([s]));
  return [...found.values()].sort((a, b) => b.confidence - a.confidence || a.edges.length - b.edges.length);
}

/**
 * Nodes with the most causal edges — the mechanisms the graph says are most
 * connected. Useful for "where would an intervention have the broadest reach",
 * and equally for "where would an off-target effect propagate furthest".
 */
export function hubRanking(): { id: GraphNodeId; label: string; inDegree: number; outDegree: number; total: number }[] {
  return GRAPH_NODES
    .filter((n) => n.kind === 'hallmark' || n.kind === 'cancer-pathway')
    .map((n) => {
      const inDegree = GRAPH_EDGES.filter((e) => isCausal(e) && e.to === n.id).length;
      const outDegree = GRAPH_EDGES.filter((e) => isCausal(e) && e.from === n.id).length;
      return { id: n.id, label: n.label, inDegree, outDegree, total: inDegree + outDegree };
    })
    .sort((a, b) => b.total - a.total);
}
