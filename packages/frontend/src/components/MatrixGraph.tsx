import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDGE_LABEL, type MatrixEdgeKind } from '../core/agent/matrixRelations';
import { KIND_ICON, KIND_LABEL, type MatrixKind } from './matrixKinds';
import type { MatrixGraphModel, MatrixGraphNode } from './matrixGraphProjection';

/**
 * MATRIX GRAPH — the visual projection of the Genesis relation graph.
 *
 * This component draws; it does not decide. Every circle is a real
 * `SavedExperiment`, every line is a real `MatrixEdge` from
 * `matrixRelations.ts` carrying its own `basis`, and the geometry arrives
 * pre-computed from `matrixGraphProjection.ts`. There is no layout physics
 * here, no relation inference, and no second store.
 *
 * ## The honesty rules it enforces visually
 *
 *  - A record Genesis cannot link to anything is drawn in its own labelled
 *    band, never dropped. An empty-looking graph that quietly hid its
 *    unconnected half would be the most flattering possible lie about the
 *    memory, which is exactly what the rest of this codebase refuses.
 *  - Every edge exposes its `basis` on hover (SVG `<title>`), so a drawn line
 *    can be checked rather than trusted.
 *  - Selecting a node dims what it is NOT related to instead of hiding it, so
 *    the absence of a relation stays as visible as its presence.
 *
 * Rendered as inline SVG rather than canvas on purpose: it is server-render
 * safe (this repo's component tests run through `renderToStaticMarkup` with no
 * DOM), every node stays a real focusable `<g>` for keyboard and screen-reader
 * users, and at this repo's hard cap of 100 records there is no performance
 * reason to reach for canvas.
 */

const KIND_COLOR_VAR: Record<MatrixKind, string> = {
  HYPOTHESIS: 'var(--gold)',
  WORLD: 'var(--cyan)',
  MODEL: 'var(--violet)',
  SCENARIO: 'var(--violet)',
  EVIDENCE: 'var(--green)',
  CYBER: 'var(--red)',
  DECIPHERMENT: 'var(--gold)',
  RESEARCH_CHAIN: 'var(--cyan)',
  REPLAY: 'var(--text-dim)',
  EXPERIMENT: 'var(--text-dim)',
};

/** Directed relations are the loop actually closing, so they read strongest. */
const EDGE_EMPHASIS: Record<MatrixEdgeKind, boolean> = {
  VERIFIES_PREDICTION: true,
  SHARED_EVIDENCE_PACK: false,
  SHARED_EVIDENCE_CHAIN: false,
  SAME_REPLAY_CAPSULE: false,
  SAME_EXPERIMENT_RERUN: false,
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3;
const NODE_RADIUS = 13;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Truncated for the label under a node; the inspector always shows the full text. */
function shortLabel(label: string): string {
  return label.length <= 22 ? label : `${label.slice(0, 21)}…`;
}

export interface MatrixGraphProps {
  readonly model: MatrixGraphModel;
  readonly selectedId: string | null;
  readonly onSelect: (node: MatrixGraphNode) => void;
  /** Clearing the selection — background click and Escape both route here. */
  readonly onClearSelection: () => void;
}

export function MatrixGraph({ model, selectedId, onSelect, onClearSelection }: MatrixGraphProps): JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const movedRef = useRef(false);

  // Escape clears the selection. Bound to the window because the SVG may not
  // hold focus after a pointer interaction.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClearSelection(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClearSelection]);

  const neighbours = selectedId ? model.neighboursById.get(selectedId) ?? new Set<string>() : null;

  /** Which kinds actually occur — the legend never advertises an empty category. */
  const presentKinds = useMemo(() => {
    const seen = new Set<MatrixKind>();
    for (const node of model.nodes) seen.add(node.primaryKind);
    return [...seen];
  }, [model.nodes]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-graph-node]')) return; // let the node take the click
    movedRef.current = false;
    dragState.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pan.x, pan.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 3 || Math.abs(e.clientY - drag.y) > 3) movedRef.current = true;
    setPan({ x: drag.panX + (e.clientX - drag.x) / zoom, y: drag.panY + (e.clientY - drag.y) / zoom });
  }, [zoom]);

  const endDrag = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const wasDragging = dragState.current !== null;
    dragState.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // A click on empty canvas clears the selection; a pan does not, or every
    // drag would wipe what the user was inspecting.
    if (wasDragging && !movedRef.current && !(e.target as Element).closest('[data-graph-node]')) {
      onClearSelection();
    }
  }, [onClearSelection]);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  }, []);

  const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const { width, height } = model.viewBox;

  if (model.nodes.length === 0) {
    return (
      <div className="matrix-graph-empty" data-testid="matrix-graph-empty">
        <p>
          Pamięć Naukowa jest pusta, więc graf nie ma czego pokazać. Uruchom dowolny eksperyment —
          każdy przebieg trafia tutaj automatycznie i pojawi się jako węzeł.
        </p>
      </div>
    );
  }

  return (
    <div className="matrix-graph" data-testid="matrix-graph">
      <div className="matrix-graph-toolbar">
        <div className="matrix-graph-stats">
          <span><strong>{model.nodes.length}</strong> rekordów</span>
          <span><strong>{model.edges.length}</strong> realnych relacji</span>
          <span><strong>{model.componentCount}</strong> połączonych grup</span>
          <span className="matrix-graph-stat-isolated"><strong>{model.isolatedIds.length}</strong> bez powiązań</span>
          {/* Relations that exist but cannot be drawn are REPORTED, never
              quietly discarded — the count is the honest alternative to a
              picture that silently omits part of the data. */}
          {model.selfEdges.length > 0 && (
            <span className="matrix-graph-stat-note" data-testid="matrix-graph-selfedge-count">
              <strong>{model.selfEdges.length}</strong> relacji do samego siebie (nie da się narysować jako linii)
            </span>
          )}
          {model.danglingEdgeCount > 0 && (
            <span className="matrix-graph-stat-note" data-testid="matrix-graph-dangling-count">
              <strong>{model.danglingEdgeCount}</strong> relacji z brakującym drugim końcem
            </span>
          )}
        </div>
        <div className="matrix-graph-controls">
          <button type="button" className="chip-btn" onClick={() => setZoom((z) => clampZoom(z / 1.2))} aria-label="Oddal">−</button>
          <span className="matrix-graph-zoom mono">{Math.round(zoom * 100)}%</span>
          <button type="button" className="chip-btn" onClick={() => setZoom((z) => clampZoom(z * 1.2))} aria-label="Przybliż">+</button>
          <button type="button" className="chip-btn" onClick={reset} data-testid="matrix-graph-reset">Reset widoku</button>
        </div>
      </div>

      <svg
        className="matrix-graph-canvas"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Graf relacji Matrix: ${model.nodes.length} rekordów, ${model.edges.length} relacji`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <defs>
          <marker id="mx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cyan)" />
          </marker>
        </defs>

        <g transform={`scale(${zoom}) translate(${pan.x} ${pan.y})`}>
          {/* --- relations: one line per real MatrixEdge, never anything else --- */}
          <g className="matrix-graph-edges">
            {model.edges.map(({ edge, x1, y1, x2, y2 }) => {
              const touchesSelection = selectedId !== null && (edge.fromId === selectedId || edge.toId === selectedId);
              const dimmed = selectedId !== null && !touchesSelection;
              return (
                <line
                  key={`${edge.kind}:${edge.fromId}:${edge.toId}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  className={[
                    'matrix-graph-edge',
                    EDGE_EMPHASIS[edge.kind] ? 'matrix-graph-edge-strong' : '',
                    touchesSelection ? 'matrix-graph-edge-active' : '',
                    dimmed ? 'matrix-graph-edge-dim' : '',
                  ].filter(Boolean).join(' ')}
                  markerEnd={edge.directed ? 'url(#mx-arrow)' : undefined}
                  data-edge-kind={edge.kind}
                >
                  {/* The proof, one hover away — a line you can check. */}
                  <title>{`${EDGE_LABEL[edge.kind]} — podstawa: ${edge.basis}`}</title>
                </line>
              );
            })}
          </g>

          {/* --- records --- */}
          <g className="matrix-graph-nodes">
            {model.nodes.map((node) => {
              const isSelected = node.id === selectedId;
              const isNeighbour = neighbours?.has(node.id) ?? false;
              const dimmed = selectedId !== null && !isSelected && !isNeighbour;
              const selfCount = model.selfEdgesById.get(node.id)?.length ?? 0;
              return (
                <g
                  key={node.id}
                  data-graph-node={node.id}
                  data-testid={`matrix-graph-node-${node.id}`}
                  className={[
                    'matrix-graph-node',
                    isSelected ? 'matrix-graph-node-selected' : '',
                    isNeighbour ? 'matrix-graph-node-neighbour' : '',
                    dimmed ? 'matrix-graph-node-dim' : '',
                    node.isolated ? 'matrix-graph-node-isolated' : '',
                  ].filter(Boolean).join(' ')}
                  transform={`translate(${node.x} ${node.y})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(node)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node); } }}
                >
                  <title>
                    {`${node.label}\n${node.kinds.map((k) => KIND_LABEL[k]).join(' · ')}\n${
                      node.isolated ? 'Brak powiązań wyprowadzalnych z danych' : `${node.degree} powiązań`
                    }${selfCount > 0 ? `\n${selfCount} relacja do samego siebie` : ''}`}
                  </title>
                  <circle
                    r={NODE_RADIUS + Math.min(6, node.degree)}
                    fill={KIND_COLOR_VAR[node.primaryKind]}
                    className="matrix-graph-node-circle"
                  />
                  {/* A self-relation cannot be a line between two points, so it is
                      drawn ON the node instead of being dropped. */}
                  {selfCount > 0 && (
                    <circle
                      r={NODE_RADIUS + Math.min(6, node.degree) + 5}
                      className="matrix-graph-node-selfring"
                      data-testid={`matrix-graph-selfring-${node.id}`}
                    />
                  )}
                  <text className="matrix-graph-node-glyph" textAnchor="middle" dy="4">{KIND_ICON[node.primaryKind]}</text>
                  <text className="matrix-graph-node-label" textAnchor="middle" y={NODE_RADIUS + Math.min(6, node.degree) + 14}>
                    {shortLabel(node.label)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Naming the band is the point: it says how much of the memory Genesis
              genuinely cannot link, instead of letting a sparse corner imply it. */}
          {model.isolatedIds.length > 0 && (
            <text className="matrix-graph-band-label" x={16} y={(model.nodeById.get(model.isolatedIds[0]!)?.y ?? 0) - 34}>
              BEZ POWIĄZAŃ — {model.isolatedIds.length} {model.isolatedIds.length === 1 ? 'rekord' : 'rekordów'}, których dane z niczym nie łączą
            </text>
          )}
        </g>
      </svg>

      <div className="matrix-graph-legend">
        {presentKinds.map((kind) => (
          <span key={kind} className="matrix-graph-legend-item">
            <span className="matrix-graph-legend-dot" style={{ background: KIND_COLOR_VAR[kind] }} aria-hidden="true" />
            {KIND_LABEL[kind]}
          </span>
        ))}
        <span className="matrix-graph-legend-note">
          Każda linia to realna relacja z <code>matrixRelations.ts</code> — najedź, żeby zobaczyć pole, które ją dowodzi.
          {model.danglingEdgeCount > 0 && ` ${model.danglingEdgeCount} relacji nie narysowano: ich drugi koniec zniknął z pamięci.`}
        </span>
      </div>
    </div>
  );
}
