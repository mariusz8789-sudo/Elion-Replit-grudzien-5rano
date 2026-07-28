import { useMemo } from 'react';
import {
  GRAPH_NODES, GRAPH_EDGES, neighbourhood,
  type GraphNode, type GraphNodeId, type NodeKind, type EdgeKind,
} from '../../core/longevity/knowledgeGraph';

/**
 * Interactive knowledge graph.
 *
 * Layout is DETERMINISTIC — nodes are placed in columns by kind and ordered
 * within a column by declaration order. No force simulation, no randomness: the
 * same graph draws identically on every render and in every session, so a
 * researcher can point at a position on screen and a colleague sees the same
 * thing. A jittering force layout would make the diagram unciteable.
 *
 * Columns encode the direction of reasoning the platform performs:
 *
 *   strategies  →  mechanisms  →  oncogenic axes
 *                       ↑
 *                  biomarkers (what can actually be measured)
 *
 * Selecting a node dims everything outside its neighbourhood, because drawing all
 * 35 nodes and every edge at once is a hairball nobody can read.
 */

const COLUMN_X: Record<NodeKind, number> = {
  intervention: 90,
  hallmark: 420,
  'cancer-pathway': 760,
  biomarker: 420,
};

const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string }> = {
  mechanistic: { stroke: 'var(--lg-edge-mech)' },
  'oncogenic-coupling': { stroke: 'var(--lg-edge-onco)' },
  targets: { stroke: 'var(--lg-edge-target)', dash: '4 4' },
  measures: { stroke: 'var(--lg-edge-measure)', dash: '2 5' },
};

interface Placed extends GraphNode { x: number; y: number }

function layout(): Placed[] {
  const byKind: Record<NodeKind, GraphNode[]> = {
    intervention: [], hallmark: [], 'cancer-pathway': [], biomarker: [],
  };
  for (const n of GRAPH_NODES) byKind[n.kind].push(n);

  const placed: Placed[] = [];
  const place = (nodes: GraphNode[], x: number, top: number, gap: number) =>
    nodes.forEach((n, i) => placed.push({ ...n, x, y: top + i * gap }));

  place(byKind.intervention, COLUMN_X.intervention, 60, 52);
  place(byKind.hallmark, COLUMN_X.hallmark, 60, 52);
  place(byKind['cancer-pathway'], COLUMN_X['cancer-pathway'], 130, 62);
  // Biomarkers sit below the mechanism column they measure.
  place(byKind.biomarker, COLUMN_X.biomarker, 600, 44);
  return placed;
}

export function LongevityGraph({ selected, onSelect, height = 1040 }: {
  selected: GraphNodeId | null;
  onSelect: (id: GraphNodeId | null) => void;
  height?: number;
}) {
  const nodes = useMemo(layout, []);
  const positions = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const focus = useMemo(() => {
    if (!selected) return null;
    const { incoming, outgoing } = neighbourhood(selected);
    const ids = new Set<GraphNodeId>([selected]);
    for (const e of [...incoming, ...outgoing]) { ids.add(e.from); ids.add(e.to); }
    return { ids, edges: new Set([...incoming, ...outgoing]) };
  }, [selected]);

  const isDim = (id: GraphNodeId) => Boolean(focus && !focus.ids.has(id));

  return (
    <div className="lg-graph-wrap">
      <svg
        className="lg-graph" viewBox={`0 0 1000 ${height}`} role="img"
        aria-label="Longevity knowledge graph: strategies, mechanisms, oncogenic axes and biomarkers"
      >
        <g className="lg-edges">
          {GRAPH_EDGES.map((e, i) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            const dim = focus ? !focus.edges.has(e) : false;
            const style = EDGE_STYLE[e.kind];
            // Curve horizontally so same-column edges (mechanism↔mechanism) stay legible.
            const mx = (a.x + b.x) / 2;
            const bow = a.x === b.x ? 70 : 0;
            const d = `M ${a.x} ${a.y} C ${mx + bow} ${a.y}, ${mx + bow} ${b.y}, ${b.x} ${b.y}`;
            return (
              <path
                key={i} d={d} fill="none" stroke={style.stroke} strokeDasharray={style.dash}
                strokeWidth={e.effect === 'counteracts' ? 2 : 1.4}
                className={`lg-edge${dim ? ' is-dim' : ''}${e.effect === 'counteracts' ? ' is-inhibit' : ''}`}
              >
                <title>{`${e.from} → ${e.to} (${e.effect}) — ${e.mechanism}`}</title>
              </path>
            );
          })}
        </g>
        <g className="lg-nodes">
          {nodes.map((n) => (
            <g
              key={n.id}
              className={`lg-node lg-node-${n.kind}${n.id === selected ? ' is-selected' : ''}${isDim(n.id) ? ' is-dim' : ''}`}
              transform={`translate(${n.x} ${n.y})`}
              onClick={() => onSelect(n.id === selected ? null : n.id)}
              role="button" tabIndex={0}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(n.id === selected ? null : n.id); } }}
              aria-pressed={n.id === selected}
            >
              <rect x={-84} y={-16} width={168} height={32} rx={7} />
              <text x={0} y={4} textAnchor="middle">
                {n.label.length > 24 ? `${n.label.slice(0, 22)}…` : n.label}
              </text>
              <title>{n.summary}</title>
            </g>
          ))}
        </g>
      </svg>
      <div className="lg-legend" aria-hidden="true">
        <span><i className="lg-swatch lg-swatch-intervention" /> strategy</span>
        <span><i className="lg-swatch lg-swatch-hallmark" /> mechanism</span>
        <span><i className="lg-swatch lg-swatch-cancer" /> oncogenic axis</span>
        <span><i className="lg-swatch lg-swatch-biomarker" /> biomarker</span>
        <span><i className="lg-line lg-line-mech" /> mechanistic</span>
        <span><i className="lg-line lg-line-onco" /> oncogenic coupling</span>
        <span><i className="lg-line lg-line-target" /> targets (intent)</span>
        <span><i className="lg-line lg-line-measure" /> measures</span>
        <span>thicker line = counteracts</span>
      </div>
    </div>
  );
}
