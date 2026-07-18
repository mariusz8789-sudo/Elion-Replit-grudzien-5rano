/**
 * KnowledgeGraph — interactive node-link visualisation (V5). Renders a real graph
 * from typed nodes + provenance-bearing edges using the deterministic layout in
 * ./graphLayout. Hovering a node highlights its edges; a legend maps colours to
 * node/edge types. Pure SVG, theme-aware, no external library.
 */
import { useMemo, useState } from 'react';
import { layoutGraph, type GNode, type GEdge } from './graphLayout';
import { useI18n } from '../../core/i18n';

export const NODE_COLORS: Record<string, string> = {
  Target: '#5cd6e8', Molecule: '#a78bfa', Compound: '#a78bfa', Ligand: '#8b7ff5',
  Disease: '#f47c7c', Pathway: '#6ee7a0', Publication: '#f0b35c', Evidence: '#f0b35c',
  Gene: '#7dd3fc', Protein: '#38bdf8', Structure: '#c4b5fd', Trial: '#fb923c',
};
const nodeColor = (t: string) => NODE_COLORS[t] ?? '#8d97b4';

export function KnowledgeGraph({ nodes, edges, width = 640, height = 420 }: {
  nodes: GNode[]; edges: GEdge[]; width?: number; height?: number;
}) {
  const { t } = useI18n();
  const positioned = useMemo(() => layoutGraph(nodes, edges, { width, height }), [nodes, edges, width, height]);
  const posById = useMemo(() => new Map(positioned.map((p) => [p.id, p])), [positioned]);
  const [hover, setHover] = useState<string | null>(null);
  const usedTypes = useMemo(() => [...new Set(nodes.map((n) => n.type))], [nodes]);

  if (nodes.length === 0) {
    return <div className="ds-empty"><h4>{t('kg.empty.title')}</h4><p>{t('kg.empty.body')}</p></div>;
  }

  return (
    <div className="kg-wrap">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="graf wiedzy" className="kg-svg" preserveAspectRatio="xMidYMid meet">
        <g>
          {edges.map((e, i) => {
            const a = posById.get(e.source), b = posById.get(e.target);
            if (!a || !b) return null;
            const active = hover === e.source || hover === e.target;
            return (
              <g key={i} opacity={hover && !active ? 0.15 : 1}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? 'var(--cyan)' : 'var(--border-strong)'} strokeWidth={active ? 1.8 : 1} />
                {active && e.label ? (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} textAnchor="middle" fontSize="0.58rem" fill="var(--text-dim)">{e.label}</text>
                ) : null}
              </g>
            );
          })}
          {positioned.map((p) => {
            const active = !hover || hover === p.id;
            const r = 7 + Math.min(6, edges.filter((e) => e.source === p.id || e.target === p.id).length);
            return (
              <g key={p.id} transform={`translate(${p.x} ${p.y})`} opacity={active ? 1 : 0.3}
                onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
                <circle r={r} fill={nodeColor(p.type)} fillOpacity={0.9} stroke="var(--bg)" strokeWidth="1.5" />
                <text y={r + 11} textAnchor="middle" fontSize="0.62rem" fill="var(--text)" style={{ pointerEvents: 'none' }}>{p.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="kg-legend">
        {usedTypes.map((t) => (
          <span key={t} className="kg-legend-item"><span className="kg-dot" style={{ background: nodeColor(t) }} />{t}</span>
        ))}
      </div>
    </div>
  );
}
