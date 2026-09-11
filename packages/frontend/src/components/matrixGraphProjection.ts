import type { MatrixEdge, MatrixRelationGraph } from '../core/agent/matrixRelations';
import type { SavedExperiment } from '../core/scienceMemory';
import { kindsOf, primaryKindOf, type MatrixKind } from './matrixKinds';

/**
 * MATRIX GRAPH PROJECTION — a pure, deterministic VIEW of state that already
 * exists. It creates no scientific facts of its own.
 *
 * The chain is strictly one-directional:
 *
 *   listExperiments()            (real Science Memory)
 *     -> kindsOf()               (real Matrix classification, untouched)
 *     -> buildMatrixRelationGraph()  (real relations, the ONLY edge source)
 *     -> projectMatrixGraph()    (this file: geometry + lookup maps)
 *     -> MatrixGraph.tsx         (pixels)
 *
 * ## What this file is NOT allowed to do, and does not do
 *
 * It never derives an edge. Every edge it returns is an object handed to it by
 * `buildMatrixRelationGraph`, carried through unchanged — same `kind`, same
 * `basis`, same `directed`. There is no similarity heuristic, no same-domain
 * rule, no same-lab rule, no proximity rule, no "these look related" rule. If
 * Genesis proves no relation for a record, the record comes out of here
 * `isolated: true` and the renderer must SHOW it, not hide it — an omitted node
 * would misrepresent the memory as better connected than it is.
 *
 * It also never reclassifies a record. `kinds` is `kindsOf()`'s full answer;
 * `primaryKind` exists only so a circle can have one colour, and the inspector
 * always shows the complete list.
 *
 * ## Why a deterministic structural layout and not a force simulation
 *
 * Science Memory is hard-capped at 100 records (`MAX_TOTAL` in
 * `scienceMemory.ts`), so cost is not the deciding factor. Stability is: a
 * force simulation re-seeded on every render makes the same unchanged memory
 * look different each time you open Matrix, which reads as the data having
 * changed. `matrixRelations.ts` already sorts its edges precisely so "the
 * rendered graph never reshuffles between renders"; this layout keeps that
 * promise by being a pure function of (ids, edges) with no randomness, no
 * iteration count and no time input.
 *
 * Nodes are grouped into their real connected components (union-find over the
 * real edges). Each component is laid out on its own ring, and records Genesis
 * cannot link to anything land in a clearly separated band below. So the
 * picture's structure IS the relation structure — clusters are genuinely
 * connected evidence, and the unlinked band is an honest statement about
 * how much of the memory stands alone.
 */

export interface MatrixGraphNode {
  /** `SavedExperiment.id` — the identifier `matrixRelations.ts` edges refer to. */
  readonly id: string;
  /** `experimentName || experimentId`, the same fallback the rest of Matrix uses. */
  readonly label: string;
  /** Every kind `kindsOf()` reported. Never truncated. */
  readonly kinds: readonly MatrixKind[];
  /** Renderer-only colour choice. Never overwrites `kinds`. */
  readonly primaryKind: MatrixKind;
  readonly labId: string;
  readonly createdAt: string;
  /** Number of real relations touching this record. */
  readonly degree: number;
  /** True when Genesis proves no relation at all for this record. */
  readonly isolated: boolean;
  /** Index of the connected component this node belongs to; -1 when isolated. */
  readonly componentIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface MatrixGraphEdge {
  /** The real relation, carried through untouched. */
  readonly edge: MatrixEdge;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface MatrixGraphModel {
  readonly nodes: readonly MatrixGraphNode[];
  readonly edges: readonly MatrixGraphEdge[];
  readonly nodeById: ReadonlyMap<string, MatrixGraphNode>;
  /** id -> ids of every record sharing at least one real relation with it. */
  readonly neighboursById: ReadonlyMap<string, ReadonlySet<string>>;
  readonly isolatedIds: readonly string[];
  readonly componentCount: number;
  /**
   * Edges whose other endpoint is no longer in memory. `matrixRelations.ts`
   * already reports these in `missing` as ENDPOINT_MISSING; they are counted
   * here and NOT drawn, because a line to a node that does not exist would be
   * a line to nowhere.
   */
  readonly danglingEdgeCount: number;
  /**
   * REAL self-relations, kept rather than dropped.
   *
   * Genesis can legitimately produce one: `VERIFIES_PREDICTION` is built as
   * `fromId: record.id, toId: predictionSourceExperimentId`, so a record whose
   * verification points at itself yields `fromId === toId`. A straight line
   * between one point and itself is invisible, so these are not drawn as edges
   * — but they are NOT discarded either. They are listed here, counted in the
   * UI, and shown on the node itself, because a relation Genesis asserted is
   * not the renderer's to delete just because it is awkward to draw.
   */
  readonly selfEdges: readonly MatrixEdge[];
  /** id -> its own self-relations, for the inspector. */
  readonly selfEdgesById: ReadonlyMap<string, readonly MatrixEdge[]>;
  readonly viewBox: { readonly width: number; readonly height: number };
}

/** Layout constants — plain geometry, no tuning knobs pretending to be physics. */
const CANVAS_WIDTH = 1000;
const CLUSTER_MIN_RADIUS = 58;
const CLUSTER_RADIUS_PER_NODE = 11;
const CLUSTER_PADDING = 46;
const ISOLATED_COLUMNS = 8;
const ISOLATED_SPACING_X = 116;
const ISOLATED_SPACING_Y = 74;
const BAND_GAP = 90;

/** Union-find over the REAL edges — the only thing that decides what clusters. */
function connectedComponents(ids: readonly string[], edges: readonly MatrixEdge[]): Map<string, number> {
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, so a long chain of reruns stays cheap.
    let cursor = a;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const edge of edges) {
    if (!parent.has(edge.fromId) || !parent.has(edge.toId)) continue;
    const ra = find(edge.fromId);
    const rb = find(edge.toId);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Group by root, then index components in a deterministic order: biggest
  // first, ties broken by the smallest member id, so the picture is stable.
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const bucket = groups.get(root);
    if (bucket) bucket.push(id);
    else groups.set(root, [id]);
  }
  const ordered = [...groups.values()]
    .filter((members) => members.length > 1)
    .sort((a, b) => b.length - a.length || a.slice().sort()[0]!.localeCompare(b.slice().sort()[0]!));

  const componentOf = new Map<string, number>();
  ordered.forEach((members, index) => {
    for (const id of members) componentOf.set(id, index);
  });
  return componentOf;
}

/**
 * Projects real Science Memory records plus their real relation graph into
 * geometry. Pass the SAME `MatrixRelationGraph` the rest of Matrix already
 * built — this function deliberately does not call `buildMatrixRelationGraph`
 * itself, so there is exactly one relation computation per render and no way
 * for the graph and the list to disagree about what is related.
 */
export function projectMatrixGraph(
  records: readonly SavedExperiment[],
  relations: MatrixRelationGraph,
): MatrixGraphModel {
  const byId = new Map(records.map((record) => [record.id, record]));

  // Only edges whose BOTH ends still exist can be drawn at all.
  const resolvable = relations.edges.filter((e) => byId.has(e.fromId) && byId.has(e.toId));
  const danglingEdgeCount = relations.edges.length - resolvable.length;

  // A self-relation is real but cannot be a line between two points. Split it
  // out so it is preserved and reported rather than silently dropped.
  const selfEdges = resolvable.filter((e) => e.fromId === e.toId);
  const drawable = resolvable.filter((e) => e.fromId !== e.toId);

  const selfEdgesById = new Map<string, MatrixEdge[]>();
  for (const edge of selfEdges) {
    const bucket = selfEdgesById.get(edge.fromId);
    if (bucket) bucket.push(edge);
    else selfEdgesById.set(edge.fromId, [edge]);
  }

  const neighbours = new Map<string, Set<string>>(records.map((r) => [r.id, new Set<string>()]));
  for (const edge of drawable) {
    neighbours.get(edge.fromId)!.add(edge.toId);
    neighbours.get(edge.toId)!.add(edge.fromId);
  }

  const ids = records.map((r) => r.id);
  const componentOf = connectedComponents(ids, drawable);
  const componentCount = componentOf.size === 0 ? 0 : new Set(componentOf.values()).size;

  // --- geometry: one ring per component, then a band of unlinked records.
  const members = new Map<number, string[]>();
  for (const [id, index] of componentOf) {
    const bucket = members.get(index);
    if (bucket) bucket.push(id);
    else members.set(index, [id]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let cursorX = CLUSTER_PADDING;
  let cursorY = CLUSTER_PADDING;
  let rowHeight = 0;

  for (let index = 0; index < componentCount; index += 1) {
    const group = (members.get(index) ?? []).slice().sort((a, b) => a.localeCompare(b));
    const radius = CLUSTER_MIN_RADIUS + group.length * CLUSTER_RADIUS_PER_NODE;
    const diameter = radius * 2;

    if (cursorX + diameter > CANVAS_WIDTH - CLUSTER_PADDING && cursorX > CLUSTER_PADDING) {
      cursorX = CLUSTER_PADDING;
      cursorY += rowHeight + CLUSTER_PADDING;
      rowHeight = 0;
    }

    const cx = cursorX + radius;
    const cy = cursorY + radius;
    group.forEach((id, i) => {
      // A ring is the honest shape for "these are related to each other";
      // it privileges no member and needs no iteration to settle.
      const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
      positions.set(id, {
        x: Math.round((cx + Math.cos(angle) * radius) * 100) / 100,
        y: Math.round((cy + Math.sin(angle) * radius) * 100) / 100,
      });
    });

    cursorX += diameter + CLUSTER_PADDING;
    rowHeight = Math.max(rowHeight, diameter);
  }

  const isolatedIds = ids.filter((id) => !componentOf.has(id)).sort((a, b) => a.localeCompare(b));
  const bandTop = componentCount > 0 ? cursorY + rowHeight + BAND_GAP : CLUSTER_PADDING;
  isolatedIds.forEach((id, i) => {
    const col = i % ISOLATED_COLUMNS;
    const row = Math.floor(i / ISOLATED_COLUMNS);
    positions.set(id, {
      x: CLUSTER_PADDING + col * ISOLATED_SPACING_X,
      y: bandTop + row * ISOLATED_SPACING_Y,
    });
  });

  const nodes: MatrixGraphNode[] = records.map((record) => {
    const pos = positions.get(record.id) ?? { x: CLUSTER_PADDING, y: CLUSTER_PADDING };
    const kinds = kindsOf(record);
    const degree = neighbours.get(record.id)?.size ?? 0;
    return {
      id: record.id,
      label: record.experimentName || record.experimentId,
      kinds,
      primaryKind: primaryKindOf(kinds),
      labId: record.labId,
      createdAt: record.createdAt,
      degree,
      isolated: !componentOf.has(record.id),
      componentIndex: componentOf.get(record.id) ?? -1,
      x: pos.x,
      y: pos.y,
    };
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: MatrixGraphEdge[] = drawable.map((edge) => {
    const a = nodeById.get(edge.fromId)!;
    const b = nodeById.get(edge.toId)!;
    return { edge, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });

  const lastRow = isolatedIds.length === 0 ? 0 : Math.ceil(isolatedIds.length / ISOLATED_COLUMNS);
  const height = Math.max(
    360,
    (isolatedIds.length > 0 ? bandTop + lastRow * ISOLATED_SPACING_Y : cursorY + rowHeight) + CLUSTER_PADDING,
  );

  return {
    nodes,
    edges,
    nodeById,
    neighboursById: neighbours,
    isolatedIds,
    componentCount,
    danglingEdgeCount,
    selfEdges,
    selfEdgesById,
    viewBox: { width: CANVAS_WIDTH, height: Math.round(height) },
  };
}
