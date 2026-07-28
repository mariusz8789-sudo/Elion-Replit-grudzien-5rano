import { GRAPH_NODES, getNode } from '@genesis-os/reasoning/knowledgeGraph';
import { signedPaths, verdictFromPaths } from '@genesis-os/reasoning/inference';
import { edgeStatuses } from '../edgeReview.mjs';
import { currentSnapshot, snapshotEdges, edgeKeyOf } from './store.mjs';

/**
 * L4 — edge criticality: which claim, if wrong, changes the answer?
 *
 * THE PROBLEM THIS SOLVES IS NOT SCIENTIFIC, IT IS ECONOMIC. Genesis reasons
 * over a curated graph that no expert has reviewed, and the ask it currently
 * makes of a visiting scientist is "please review the mechanism graph" — dozens
 * of edges, unranked, for free. That request is too large to accept, which is
 * why the ledger is empty.
 *
 * This turns it into a different request: *these three claims decide what
 * Genesis concludes; the other sixty-three change nothing. Review these three.*
 * Same instrument, a twentieth of the ask, derived rather than asserted.
 *
 * HOW THE COUNTERFACTUAL IS EXACT, NOT APPROXIMATE. `signedPaths` returns each
 * path together with the edges it traverses. Removing an edge therefore kills
 * exactly the paths containing it, and the counterfactual verdict is the real
 * verdict rule (`verdictFromPaths`, shared with `netInfluence`) applied to the
 * surviving subset. Nothing is estimated and no second copy of the rule exists.
 *
 * Paths are computed ONCE per node pair and then re-judged per edge, so the
 * cost is one graph walk per pair rather than one per (pair, edge).
 *
 * WHAT THIS DOES NOT MEASURE, and the report says so in its own words:
 *
 *  - It measures STRUCTURAL DEPENDENCE, not scientific importance. A
 *    load-bearing edge is one the conclusions rest on; that is not a claim that
 *    it is doubtful, novel, or interesting.
 *  - An edge with no dependents is not "safe to ignore". It may simply connect
 *    nothing yet, which is a fact about the graph's sparsity.
 *  - A graph in which nothing is load-bearing is not robust. It is disconnected.
 */

/** How a verdict changed when the edge was removed, worst first. */
export const IMPACTS = ['reversal', 'severance', 'conflict-resolved', 'conflict-created'];

const IMPACT_WEIGHT = {
  // A conclusion that flips sign is the worst case by a distance: the platform
  // would have said the opposite, with the same confidence.
  reversal: 100,
  // A conclusion that disappears is serious but visible — the reader is told
  // there is no known path rather than told something false.
  severance: 40,
  // A conflict appearing or vanishing changes how a reader weighs the answer
  // without changing its direction.
  'conflict-created': 15,
  'conflict-resolved': 15,
};

/** Classify a before/after pair of verdicts. Returns null when nothing changed. */
export function classifyChange(before, after) {
  if (before === after) return null;
  if (after === 'no-known-path') return 'severance';
  if (before === 'no-known-path') {
    // Unreachable: removing an edge cannot create a path. Returning a plausible
    // label here would hide a real bug behind a real-looking finding, which is
    // the worst way for this module to fail.
    throw new Error(
      `classifyChange: a pair with no path before removal reported "${after}" after it. `
      + 'Removing an edge cannot create a path, so this is a bug in the path index, not a finding.',
    );
  }
  if (before === 'conflicting') return 'conflict-resolved';
  if (after === 'conflicting') return 'conflict-created';
  // promotes ↔ counteracts
  return 'reversal';
}

/**
 * Every node pair that has at least one causal path, with its paths cached.
 *
 * Bounded by the curated graph, which is small by design. If the graph ever
 * grows past a few hundred nodes this becomes the thing to make incremental —
 * and the honest signal that it has is this function's own runtime, not a
 * guess made in advance.
 */
function pathIndex(maxHops) {
  const index = [];
  for (const a of GRAPH_NODES) {
    for (const b of GRAPH_NODES) {
      if (a.id === b.id) continue;
      const paths = signedPaths(a.id, b.id, maxHops);
      if (paths.length === 0) continue;
      index.push({ from: a.id, to: b.id, paths, verdict: verdictFromPaths(a.id, b.id, paths).verdict });
    }
  }
  return index;
}

/**
 * For every edge, which conclusions depend on it.
 *
 * `reviewStatus` is folded in at the end rather than into the score: an edge's
 * criticality is a property of the graph, and whether anyone has reviewed it is
 * a property of the ledger. Mixing them would make a reviewed edge look less
 * structurally important than it is.
 */
export function edgeCriticality(db, { maxHops = 4, limit = 50 } = {}) {
  const snapshot = currentSnapshot(db);
  if (!snapshot) {
    throw new Error('edgeCriticality: no graph snapshot. Seed the curated graph first.');
  }

  const index = pathIndex(maxHops);
  const byEdge = new Map();

  for (const pair of index) {
    // Only edges that actually appear on a path to this pair can matter to it.
    const involved = new Set();
    for (const p of pair.paths) for (const e of p.edges) involved.add(edgeKeyOf(e));

    for (const key of involved) {
      const surviving = pair.paths.filter((p) => !p.edges.some((e) => edgeKeyOf(e) === key));
      const after = verdictFromPaths(pair.from, pair.to, surviving).verdict;
      const impact = classifyChange(pair.verdict, after);
      if (!impact) continue;

      if (!byEdge.has(key)) byEdge.set(key, { edgeKey: key, dependents: [], score: 0 });
      const entry = byEdge.get(key);
      entry.dependents.push({
        from: pair.from, to: pair.to,
        fromLabel: getNode(pair.from)?.label ?? pair.from,
        toLabel: getNode(pair.to)?.label ?? pair.to,
        before: pair.verdict, after, impact,
      });
      entry.score += IMPACT_WEIGHT[impact] ?? 0;
    }
  }

  const edges = snapshotEdges(db, snapshot.id);
  const statuses = edgeStatuses(db, edges.map((e) => e.edge_key));
  const rows = edges.map((e) => {
    const found = byEdge.get(e.edge_key);
    const status = statuses[e.edge_key];
    return {
      edgeKey: e.edge_key,
      from: e.from_id, to: e.to_id, kind: e.kind, effect: e.effect,
      mechanism: e.mechanism,
      score: found?.score ?? 0,
      dependents: found?.dependents ?? [],
      dependentCount: found?.dependents.length ?? 0,
      reversals: (found?.dependents ?? []).filter((d) => d.impact === 'reversal').length,
      reviewStatus: status?.status ?? 'unreviewed',
      reviewCount: status?.reviewCount ?? 0,
    };
  });

  rows.sort((a, b) => b.score - a.score || b.dependentCount - a.dependentCount || a.edgeKey.localeCompare(b.edgeKey));

  const loadBearing = rows.filter((r) => r.score > 0);
  return {
    snapshotId: snapshot.id,
    pairsAnalysed: index.length,
    edgesAnalysed: rows.length,
    loadBearing: loadBearing.length,
    inert: rows.length - loadBearing.length,
    edges: rows.slice(0, limit),
    statement:
      `${loadBearing.length} of ${rows.length} curated edges change at least one conclusion when removed; `
      + `${rows.length - loadBearing.length} change none. This measures STRUCTURAL DEPENDENCE, not scientific importance — `
      + 'a load-bearing edge is one the conclusions rest on, which is not a claim that it is doubtful. '
      + 'An edge that changes nothing may simply connect nothing yet, which is a fact about the graph, not about the biology.',
  };
}

/**
 * The review worklist, ordered by how much a verdict would change if the claim
 * were wrong — rather than by how few people have looked at it.
 *
 * This is the difference between asking a scientist to review a graph and
 * asking them to review the three claims that decide its output. `reviewWorklist`
 * in the ledger orders by coverage and stays as it is; the two answer different
 * questions and both are legitimate.
 *
 * Already-confirmed edges are dropped, not down-ranked: an expert's scarce time
 * should not be spent re-confirming what another expert already confirmed at
 * this exact version. Disputed edges are KEPT and promoted, because a disputed
 * load-bearing edge is the most urgent thing in the graph.
 */
export function criticalReviewWorklist(db, { maxHops = 4, limit = 10 } = {}) {
  const analysis = edgeCriticality(db, { maxHops, limit: 10000 });
  const candidates = analysis.edges
    .filter((e) => e.score > 0)
    .filter((e) => e.reviewStatus !== 'confirmed')
    .map((e) => ({
      ...e,
      // A dispute on a load-bearing edge outranks everything: the platform is
      // publishing conclusions that a named expert has already objected to.
      urgency: e.reviewStatus === 'disputed' ? e.score * 2 : e.score,
      why: buildWhy(e),
    }))
    .sort((a, b) => b.urgency - a.urgency);

  return {
    snapshotId: analysis.snapshotId,
    total: candidates.length,
    worklist: candidates.slice(0, limit),
    statement: candidates.length === 0
      ? 'No unreviewed edge changes any conclusion. Either every load-bearing claim has been confirmed, or the graph is too sparse for any single edge to matter — check `loadBearing` before reading this as good news.'
      : `${candidates.length} unreviewed or contested edge(s) change at least one conclusion. Reviewing the top ${Math.min(limit, candidates.length)} `
        + `addresses ${Math.round((candidates.slice(0, limit).reduce((s, c) => s + c.score, 0) / Math.max(1, candidates.reduce((s, c) => s + c.score, 0))) * 100)}% of the total structural dependence in the graph.`,
  };
}

function buildWhy(edge) {
  if (edge.dependentCount === 0) return 'This edge changes no conclusion.';
  const reversals = edge.dependents.filter((d) => d.impact === 'reversal');
  const example = reversals[0] ?? edge.dependents[0];
  const consequence = example.impact === 'reversal'
    ? `Genesis would conclude the OPPOSITE about ${example.fromLabel} → ${example.toLabel} (${example.before} becomes ${example.after}).`
    : example.impact === 'severance'
      ? `Genesis would have no answer at all about ${example.fromLabel} → ${example.toLabel}.`
      : `The reported conflict between paths from ${example.fromLabel} to ${example.toLabel} would ${example.impact === 'conflict-resolved' ? 'disappear' : 'appear'}.`;

  return `If this claim is wrong: ${consequence}`
    + (edge.dependentCount > 1 ? ` It also changes ${edge.dependentCount - 1} other conclusion(s).` : '')
    + (edge.reviewStatus === 'disputed' ? ' An expert has already disputed it, and Genesis is still reasoning through it.' : '');
}
