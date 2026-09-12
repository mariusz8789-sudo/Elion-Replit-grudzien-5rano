import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { subscribeScienceMemoryChanges } from '../core/scienceMemoryEvents';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { buildMatrixRelationGraph, edgesFor, EDGE_LABEL, type MatrixEdge, type MatrixRelationGraph } from '../core/agent/matrixRelations';
import { buildEpistemicStateGraph } from '../core/agent/epistemicStateGraph';
import { computeEvidenceImpact } from '../core/agent/evidenceImpact';

/**
 * GENESIS MATRIX — the central workspace, not a memory-record list.
 *
 * Reuses, never duplicates: `listExperiments()` is the SAME Science Memory
 * store `ScientificMemoryScreen.tsx` reads. The docked "Ask Genesis" bar
 * opens the SAME `ScienceChat` instance already mounted globally in
 * `App.tsx` (via `scienceChatBridge.ts`) — there is exactly one chat, one
 * state, one history; this is a second entry point into it, not a second
 * chat. `core/agent/genesisMatrix.ts` + `MatrixPanel` still own the joined
 * view of one live discovery run; this screen is the map ABOVE that, across
 * every persisted domain.
 *
 * STAGE ASSIGNMENT — honest, not fabricated. A record lands in a loop stage
 * only because a real field is present on it:
 *   HYPOTHESIS  — discoveryLoop / hypothesisLoop / parameterInquiry /
 *                 mechanismComposition / worldDiscovery / researchChain
 *   EXPERIMENT  — cyberInvestigation / scenario / counterfactual, or the
 *                 record itself (every SavedExperiment IS a run)
 *   EVIDENCE    — biotech / realExperimentVerification /
 *                 substitutionInvestigation / an attached evidence pack
 *   MEMORY      — every record, always (persistence is the definition)
 * PREDICTION and VERDICT are not separate columns: they are real fields
 * carried INSIDE Hypothesis/Evidence records (a discovery round's own
 * predicted/observed values, a comparison's own verdict) that this map does
 * not re-extract per record — naming them as fabricated top-level buckets
 * with invented counts would be exactly the overclaim this codebase
 * refuses. The legend below states the full conceptual chain in words
 * instead. NEXT ACTION is real navigation, not a generated recommendation:
 * it always shows the actual screens that extend whatever is selected.
 */

export type MatrixKind =
  | 'HYPOTHESIS' | 'WORLD' | 'MODEL' | 'SCENARIO' | 'EVIDENCE'
  | 'CYBER' | 'DECIPHERMENT' | 'RESEARCH_CHAIN' | 'REPLAY' | 'EXPERIMENT';

const KIND_LABEL: Record<MatrixKind, string> = {
  HYPOTHESIS: 'Hypotheses', WORLD: 'Worlds', MODEL: 'Models', SCENARIO: 'Scenarios',
  EVIDENCE: 'Evidence', CYBER: 'Cyber', DECIPHERMENT: 'Decipherment', RESEARCH_CHAIN: 'Research Chain',
  REPLAY: 'Replay', EXPERIMENT: 'Experiment',
};

const KIND_ICON: Record<MatrixKind, string> = {
  HYPOTHESIS: '◆', WORLD: '◇', MODEL: '▣', SCENARIO: '⑂', EVIDENCE: '✓',
  CYBER: '◈', DECIPHERMENT: '📜', RESEARCH_CHAIN: '⛓', REPLAY: '↺', EXPERIMENT: '●',
};

/** Every kind this record honestly carries — never a single forced category. */
export function kindsOf(record: SavedExperiment): MatrixKind[] {
  const kinds: MatrixKind[] = [];
  if (record.discoveryLoop || record.hypothesisLoop || record.parameterInquiry) kinds.push('HYPOTHESIS');
  if (record.worldDiscovery) kinds.push('WORLD');
  if (record.mechanismComposition) kinds.push('MODEL');
  if (record.scenario || record.counterfactual) kinds.push('SCENARIO');
  if (record.biotech || record.realExperimentVerification || record.substitutionInvestigation || record.evidencePackId || record.evidenceChainId) kinds.push('EVIDENCE');
  if (record.cyberInvestigation) kinds.push('CYBER');
  if (record.deciphermentCase) kinds.push('DECIPHERMENT');
  if (record.researchChain) kinds.push('RESEARCH_CHAIN');
  if (record.replayIdentity) kinds.push('REPLAY');
  if (kinds.length === 0) kinds.push('EXPERIMENT');
  return kinds;
}

type LoopStage = 'HYPOTHESIS' | 'EXPERIMENT' | 'EVIDENCE';
const STAGE_KINDS: Record<LoopStage, MatrixKind[]> = {
  HYPOTHESIS: ['HYPOTHESIS', 'WORLD', 'MODEL', 'RESEARCH_CHAIN'],
  EXPERIMENT: ['EXPERIMENT', 'CYBER', 'DECIPHERMENT', 'SCENARIO'],
  EVIDENCE: ['EVIDENCE'],
};
const STAGE_LABEL: Record<LoopStage, string> = { HYPOTHESIS: 'Hypothesis', EXPERIMENT: 'Experiment', EVIDENCE: 'Evidence' };
const STAGE_EMPTY_CTA: Record<LoopStage, { label: string; hash: string }> = {
  HYPOTHESIS: { label: 'Uruchom Discovery Loop w World Engine →', hash: '#/genesis-world' },
  EXPERIMENT: { label: 'Uruchom scenariusz lub eksperyment →', hash: '#/first-person-lab' },
  EVIDENCE: { label: 'Zbuduj dochodzenie w Drug Discovery →', hash: '#/drug' },
};

const NEXT_ACTIONS: { label: string; sub: string; hash: string }[] = [
  { label: 'Drug Discovery', sub: 'Kandydaci, substitution, real evidence rerank', hash: '#/drug' },
  { label: 'World Engine', sub: 'Discovery Loop, WorldGraph, scenariusze', hash: '#/genesis-world' },
  { label: 'Scientific Memory', sub: 'Pełny, surowy zapis każdego przebiegu', hash: '#/memory' },
  { label: 'Discovery Log', sub: 'Chronologia potwierdzeń i obaleń', hash: '#/discovery-log' },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  return `${Math.round(h / 24)} dni temu`;
}

interface DetailTarget { record: SavedExperiment; kinds: MatrixKind[]; }

// ============================================================================
// MATRIX GRAPH (master gap plan P1.4) — a real node/edge graph over the
// SAME `matrixRelations.ts` edges the list view and inspector already use.
// No new relationship engine, no fabricated edges: every line drawn here is
// one of `relations.edges` computed above, and every node is a real
// `SavedExperiment`. Selecting a node in the graph calls the SAME
// `openDetail` the grid/activity feed already use, so the existing
// "Selected Object" inspector panel IS the contextual inspector this graph
// needs — not a second one.
// ============================================================================

interface GraphNodePosition { readonly x: number; readonly y: number; }

/**
 * Deterministic domain-grouped layout: no physics simulation, no
 * randomness, so the SAME set of records always lays out identically.
 * Each domain (`labId`) gets an evenly-spaced point around one large
 * circle; every record in that domain gets its own point on a small circle
 * around its domain's point. Sorting by id keeps the layout stable
 * across re-renders even when records arrive in a different order.
 */
export function computeGraphLayout(nodes: readonly { id: string; labId: string }[]): ReadonlyMap<string, GraphNodePosition> {
  const positions = new Map<string, GraphNodePosition>();
  const domains = [...new Set(nodes.map((n) => n.labId))].sort();
  const DOMAIN_RADIUS = domains.length <= 1 ? 0 : 220;

  domains.forEach((domain, di) => {
    const domainAngle = (di / domains.length) * 2 * Math.PI - Math.PI / 2;
    const cx = DOMAIN_RADIUS * Math.cos(domainAngle);
    const cy = DOMAIN_RADIUS * Math.sin(domainAngle);
    const inDomain = nodes.filter((n) => n.labId === domain).map((n) => n.id).sort();
    const clusterRadius = inDomain.length <= 1 ? 0 : Math.min(100, 20 + inDomain.length * 8);
    inDomain.forEach((id, ni) => {
      const angle = (ni / inDomain.length) * 2 * Math.PI - Math.PI / 2;
      positions.set(id, { x: cx + clusterRadius * Math.cos(angle), y: cy + clusterRadius * Math.sin(angle) });
    });
  });
  return positions;
}

/** Domain cluster centers — used only to draw the faint grouping circle and label, from the SAME layout. */
export function domainCenters(nodes: readonly { id: string; labId: string }[]): readonly { labId: string; x: number; y: number; count: number }[] {
  const domains = [...new Set(nodes.map((n) => n.labId))].sort();
  const DOMAIN_RADIUS = domains.length <= 1 ? 0 : 220;
  return domains.map((labId, di) => {
    const angle = (di / domains.length) * 2 * Math.PI - Math.PI / 2;
    return { labId, x: DOMAIN_RADIUS * Math.cos(angle), y: DOMAIN_RADIUS * Math.sin(angle), count: nodes.filter((n) => n.labId === labId).length };
  });
}

/**
 * Real edge count is 0 → isolated, without exception: the whole point is
 * that this reports exactly what `matrixRelations.ts` proved, nothing more.
 * Extracted as a pure function (same convention as `computeGraphLayout`/
 * `domainCenters` above) so it is directly testable without a DOM.
 */
export function countIsolatedNodes(nodeIds: readonly string[], edges: readonly Pick<MatrixEdge, 'fromId' | 'toId'>[]): number {
  const connected = new Set<string>();
  for (const edge of edges) { connected.add(edge.fromId); connected.add(edge.toId); }
  return nodeIds.filter((id) => !connected.has(id)).length;
}

const EDGE_COLOR: Record<MatrixEdge['kind'], string> = {
  VERIFIES_PREDICTION: '#6ee7a0',
  SHARED_EVIDENCE_PACK: '#7dd3fc',
  SHARED_EVIDENCE_CHAIN: '#a78bfa',
  SAME_REPLAY_CAPSULE: '#f0b35c',
  SAME_EXPERIMENT_RERUN: '#f47c7c',
};

interface MatrixGraphProps {
  readonly nodes: readonly DetailTarget[];
  readonly relations: MatrixRelationGraph;
  readonly selectedId: string | null;
  readonly onSelect: (target: DetailTarget) => void;
}

const GRAPH_VIEW_SIZE = 620;

function MatrixGraph({ nodes, relations, selectedId, onSelect }: MatrixGraphProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const positions = useMemo(() => computeGraphLayout(nodes.map((n) => ({ id: n.record.id, labId: n.record.labId }))), [nodes]);
  const clusters = useMemo(() => domainCenters(nodes.map((n) => ({ id: n.record.id, labId: n.record.labId }))), [nodes]);

  const selectedEdgeIds = useMemo(() => {
    if (!selectedId) return null;
    return new Set(edgesFor(relations, selectedId).map((e) => `${e.kind}:${e.fromId}:${e.toId}`));
  }, [relations, selectedId]);

  /**
   * Triaged from the abandoned `claude/genesis-graphics-engine-v1-wd0r66`
   * branch (never merged — it had drifted ~2300 lines behind main). Its
   * standalone MatrixGraph.tsx/matrixGraphProjection.ts/matrixKinds.ts
   * duplicated this already-live graph and were rejected outright; its
   * self-relation handling was rejected too, because `matrixRelations.ts`'s
   * `j = i + 1` pairing loop makes `fromId === toId` structurally
   * unreachable — there is nothing to render. The one real, low-risk gap it
   * found: a record with zero real edges is currently rendered identically
   * to a well-connected one, so "how much of this memory stands alone" was
   * invisible. This count is that one honest number, computed from data the
   * toolbar already has — no new layout, no second graph.
   */
  const isolatedCount = useMemo(
    () => countIsolatedNodes(nodes.map((n) => n.record.id), relations.edges),
    [nodes, relations],
  );

  const half = GRAPH_VIEW_SIZE / 2 / zoom;
  const viewBox = `${pan.x - half} ${pan.y - half} ${half * 2} ${half * 2}`;

  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.35, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  };
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const scale = GRAPH_VIEW_SIZE / zoom / GRAPH_VIEW_SIZE; // px -> svg-unit factor at current zoom
    setPan({
      x: dragging.current.panX - (e.clientX - dragging.current.startX) / zoom * scale * zoom,
      y: dragging.current.panY - (e.clientY - dragging.current.startY) / zoom * scale * zoom,
    });
  };
  const endDrag = () => { dragging.current = null; };

  if (nodes.length === 0) {
    return <p className="matrix-rail-empty">Brak rekordów, więc graf jest pusty — pojawi się, gdy Genesis zapisze pierwszy przebieg.</p>;
  }

  return (
    <div className="matrix-graph-wrap">
      <div className="matrix-graph-toolbar">
        <button type="button" className="chip-btn" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>Przybliż +</button>
        <button type="button" className="chip-btn" onClick={() => setZoom((z) => Math.max(0.35, z * 0.8))}>Oddal −</button>
        <button type="button" className="chip-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
        <span className="gsc-caption">
          {nodes.length} węzłów · {relations.edges.length} krawędzi realnych · {clusters.length} domen
          {isolatedCount > 0 && <> · {isolatedCount} bez żadnej powiązanej krawędzi</>}
        </span>
      </div>
      <svg
        className="matrix-graph-svg"
        viewBox={viewBox}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label="Graf relacji Matrix — węzły to rzeczywiste rekordy, krawędzie to realne powiązania"
      >
        {clusters.map((c) => (
          <g key={c.labId}>
            <circle cx={c.x} cy={c.y} r={Math.max(30, 20 + c.count * 8) + 14} className="matrix-graph-domain-ring" />
            <text x={c.x} y={c.y - Math.max(30, 20 + c.count * 8) - 20} className="matrix-graph-domain-label" textAnchor="middle">
              {c.labId} ({c.count})
            </text>
          </g>
        ))}
        {relations.edges.map((edge) => {
          const from = positions.get(edge.fromId);
          const to = positions.get(edge.toId);
          if (!from || !to) return null;
          const edgeId = `${edge.kind}:${edge.fromId}:${edge.toId}`;
          const highlighted = selectedEdgeIds?.has(edgeId) ?? false;
          const dimmed = selectedEdgeIds !== null && !highlighted;
          return (
            <line
              key={edgeId}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={EDGE_COLOR[edge.kind]}
              strokeWidth={highlighted ? 2.5 : 1}
              opacity={dimmed ? 0.12 : highlighted ? 1 : 0.55}
              markerEnd={edge.directed ? 'url(#matrix-graph-arrow)' : undefined}
            />
          );
        })}
        <defs>
          <marker id="matrix-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)" />
          </marker>
        </defs>
        {nodes.map(({ record, kinds }) => {
          const pos = positions.get(record.id);
          if (!pos) return null;
          const isSelected = record.id === selectedId;
          return (
            <g
              key={record.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="matrix-graph-node"
              onClick={() => onSelect({ record, kinds })}
              role="button"
              aria-label={record.experimentName || record.experimentId}
            >
              <circle r={isSelected ? 12 : 8} className={isSelected ? 'matrix-graph-node-circle selected' : 'matrix-graph-node-circle'} />
              <text y={isSelected ? 24 : 20} textAnchor="middle" className="matrix-graph-node-label">
                {KIND_ICON[kinds[0] ?? 'EXPERIMENT']}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="gsc-caption matrix-graph-caption">
        Scroll do zoomu, przeciągnij żeby przesunąć. Kolor krawędzi = rodzaj powiązania
        ({Object.values(EDGE_LABEL).join(', ')}). Kliknij węzeł, żeby zobaczyć go w panelu po prawej.
      </p>
    </div>
  );
}

export function GenesisMatrixHub() {
  const [records, setRecords] = useState<readonly SavedExperiment[]>(() => listExperiments());
  useEffect(() => subscribeScienceMemoryChanges(() => setRecords(listExperiments())), []);
  const withKinds = useMemo(() => records.map((r) => ({ record: r, kinds: kindsOf(r) })), [records]);
  const countsByKind = useMemo(() => {
    const counts = new Map<MatrixKind, number>();
    for (const { kinds } of withKinds) for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  }, [withKinds]);

  /** Edges derived ONLY from fields that really link two records — see
      core/agent/matrixRelations.ts. Relations the data cannot support are
      returned as `missing` and rendered below as gaps, never as faint lines. */
  const relations = useMemo(() => buildMatrixRelationGraph(records), [records]);

  /**
   * EPISTEMIC STATE OF THE WHOLE MEMORY — not a second relation engine.
   * `buildEpistemicStateGraph` takes the exact two inputs this screen already
   * has (`records`, and `buildMatrixRelationGraph` for the edges, which it
   * calls itself rather than re-deriving) and adds the one thing the relation
   * graph does not carry: a per-record epistemic status DERIVED from real
   * fields, with the deriving rule attached so the classification is
   * checkable rather than asserted.
   *
   * It was written, tested and unreachable. What it answers — "how much of
   * what we know is OBSERVED, and how much is still SIMULATION" — is the
   * question this workspace exists to make answerable, so it belongs here.
   */
  const epistemicState = useMemo(() => buildEpistemicStateGraph(records), [records]);
  const epistemicByRecordId = useMemo(
    () => new Map(epistemicState.nodes.map((node) => [node.nodeId, node])),
    [epistemicState],
  );
  /** Only the statuses that really occurred — a zero row would be noise, not information. */
  const presentStatuses = useMemo(
    () => Object.entries(epistemicState.statusDistribution).filter(([, count]) => count > 0),
    [epistemicState],
  );

  const [activeKind, setActiveKind] = useState<MatrixKind | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [askInput, setAskInput] = useState('');

  const latest = withKinds[0] ?? null; // listExperiments() sorts newest-first
  const recentFive = withKinds.slice(0, 5);
  const visible = activeKind ? withKinds.filter(({ kinds }) => kinds.includes(activeKind)) : withKinds;
  const ALL_KINDS: MatrixKind[] = ['HYPOTHESIS', 'WORLD', 'MODEL', 'SCENARIO', 'EVIDENCE', 'CYBER', 'DECIPHERMENT', 'RESEARCH_CHAIN', 'REPLAY', 'EXPERIMENT'];

  const submitAsk = () => {
    const text = askInput.trim();
    if (!text) { requestOpenScienceChat(); return; }
    requestOpenScienceChat(text);
    setAskInput('');
  };

  const openDetail = (target: DetailTarget) => setDetail(detail?.record.id === target.record.id ? null : target);

  return (
    <main className="matrix-hub" id="main-content" tabIndex={-1}>
      <header className="matrix-hub-header">
        <div className="matrix-hub-header-text">
          <p className="matrix-hub-eyebrow">GENESIS · SCIENTIFIC OPERATING SYSTEM</p>
          <h1>Matrix</h1>
        </div>
        <div className="matrix-focus-card">
          <span className="matrix-focus-label">CURRENT FOCUS</span>
          {latest ? (
            <>
              <strong className="matrix-focus-title">{latest.record.experimentName || latest.record.experimentId}</strong>
              <span className="matrix-focus-meta">
                {latest.kinds.map((k) => KIND_LABEL[k]).join(' · ')} · {timeAgo(latest.record.createdAt)}
              </span>
            </>
          ) : (
            <>
              <strong className="matrix-focus-title">Brak aktywnego dochodzenia</strong>
              <span className="matrix-focus-meta">Genesis czeka na pierwsze pytanie — zapytaj poniżej albo otwórz jeden z modułów.</span>
            </>
          )}
        </div>
      </header>

      <div className="matrix-ask-bar">
        <span className="matrix-ask-icon" aria-hidden="true">✦</span>
        <input
          className="matrix-ask-input"
          value={askInput}
          onChange={(e) => setAskInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitAsk(); }}
          placeholder='Zapytaj Genesis — np. "Build a coastal hotel in Hong Kong"'
        />
        <button className="matrix-ask-submit" type="button" onClick={submitAsk}>Ask Genesis →</button>
      </div>

      <div className="matrix-workspace">
        <aside className="matrix-rail matrix-rail-left">
          <h2 className="matrix-rail-title">System</h2>
          <nav className="matrix-kind-nav" aria-label="Filtruj wg rodzaju">
            <button className={activeKind === null ? 'matrix-kind-nav-item active' : 'matrix-kind-nav-item'} onClick={() => setActiveKind(null)}>
              <span>Wszystko</span><span className="matrix-kind-count">{records.length}</span>
            </button>
            {ALL_KINDS.filter((k) => (countsByKind.get(k) ?? 0) > 0).map((k) => (
              <button key={k} className={activeKind === k ? 'matrix-kind-nav-item active' : 'matrix-kind-nav-item'} onClick={() => setActiveKind(activeKind === k ? null : k)}>
                <span><span aria-hidden="true">{KIND_ICON[k]}</span> {KIND_LABEL[k]}</span>
                <span className="matrix-kind-count">{countsByKind.get(k)}</span>
              </button>
            ))}
          </nav>

          {/* STAN EPISTEMICZNY — what the memory is made of, counted from the
              records themselves. Each status is derived per record from a real
              field by `epistemicStateGraph.ts`, never read from the free-text
              `epistemicStatus` a writer happened to set. The fingerprint makes
              the whole classification reproducible. */}
          {presentStatuses.length > 0 && (
            <>
              <h2 className="matrix-rail-title">Stan epistemiczny</h2>
              <ul className="matrix-kind-nav" aria-label="Rozkład statusów epistemicznych" data-testid="epistemic-distribution">
                {presentStatuses.map(([status, count]) => (
                  <li key={status} className="matrix-kind-nav-item" data-testid={`epistemic-status-${status}`}>
                    <span>{status}</span><span className="matrix-kind-count">{count}</span>
                  </li>
                ))}
              </ul>
              <p className="matrix-rail-empty">
                {epistemicState.nodeCount} {epistemicState.nodeCount === 1 ? 'rekord' : 'rekordów'} ·{' '}
                {epistemicState.edgeCount} {epistemicState.edgeCount === 1 ? 'powiązanie' : 'powiązań'} · odcisk{' '}
                <span className="mono" data-testid="epistemic-fingerprint">{epistemicState.fingerprint}</span>
              </p>
            </>
          )}

          <h2 className="matrix-rail-title">Recent Activity</h2>
          {recentFive.length === 0 ? (
            <p className="matrix-rail-empty">Jeszcze nic — pierwsza aktywność pojawi się tutaj automatycznie.</p>
          ) : (
            <ul className="matrix-activity-feed">
              {recentFive.map(({ record, kinds }) => (
                <li key={record.id}>
                  <button className="matrix-activity-item" onClick={() => openDetail({ record, kinds })}>
                    <span className="matrix-activity-title">{record.experimentName || record.experimentId}</span>
                    <span className="matrix-activity-time">{timeAgo(record.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="matrix-loop" aria-label="Scientific loop">
          <p className="matrix-loop-legend">
            Hypothesis → Prediction → Experiment → Evidence → Verdict → Memory → Next Action
          </p>
          <div className="matrix-loop-columns">
            {(['HYPOTHESIS', 'EXPERIMENT', 'EVIDENCE'] as LoopStage[]).map((stage, i) => {
              const items = withKinds.filter(({ kinds }) => kinds.some((k) => STAGE_KINDS[stage].includes(k)));
              return (
                <Fragment key={stage}>
                  <div className="matrix-loop-column">
                    <h3 className="matrix-loop-column-title">{STAGE_LABEL[stage]}<span className="matrix-loop-column-count">{items.length}</span></h3>
                    {items.length === 0 ? (
                      <button className="matrix-loop-empty" onClick={() => { window.location.hash = STAGE_EMPTY_CTA[stage].hash; }}>
                        {STAGE_EMPTY_CTA[stage].label}
                      </button>
                    ) : (
                      <div className="matrix-loop-chips">
                        {items.slice(0, 8).map(({ record, kinds }) => (
                          <button key={record.id} className="matrix-loop-chip" onClick={() => openDetail({ record, kinds })}>
                            {record.experimentName || record.experimentId}
                          </button>
                        ))}
                        {items.length > 8 && <span className="matrix-loop-more">+{items.length - 8} więcej</span>}
                      </div>
                    )}
                  </div>
                  {i < 2 && <div className="matrix-loop-arrow" aria-hidden="true">→</div>}
                </Fragment>
              );
            })}
            {/* Memory is not a fourth stage in the row — it is the substrate
                every stage drains into, so the connector points DOWN into a
                full-width column rather than sideways into a wrapped one
                (which left a dangling arrow at the end of the first line). */}
            <div className="matrix-loop-arrow matrix-loop-arrow-down" aria-hidden="true">↓</div>
            <div className="matrix-loop-column matrix-loop-column-memory">
              <h3 className="matrix-loop-column-title">Memory<span className="matrix-loop-column-count">{records.length}</span></h3>
              <p className="matrix-loop-column-note">Każdy przebieg trafia tutaj automatycznie — to jest ta sama Pamięć Naukowa, którą widzisz w kolumnach obok.</p>
              <button className="matrix-loop-empty" onClick={() => { window.location.hash = '#/memory'; }}>Otwórz pełną Pamięć Naukową →</button>
            </div>
          </div>

          {/* THE GRAPH (master gap plan P1.4): real nodes (every SavedExperiment
              on screen), real edges (relations.edges, the SAME graph the
              inspector's "Powiązania" list below already reads), domain-grouped,
              with focus/zoom and a click-through to the SAME "Selected Object"
              panel — not a second inspector. */}
          <div className="matrix-graph-section">
            <h3 className="matrix-rail-title">Graf relacji</h3>
            <MatrixGraph nodes={visible} relations={relations} selectedId={detail?.record.id ?? null} onSelect={openDetail} />
          </div>

          {/* Gaps in the chain, stated as gaps. A graph that quietly omits the
              links it cannot prove reads as a complete picture; naming them is
              the difference between a map and a sales pitch. */}
          {relations.missing.length > 0 && (
            <div className="matrix-missing">
              <h3 className="matrix-rail-title">Brakujące powiązania</h3>
              <ul className="matrix-missing-list">
                {relations.missing.map((gap, i) => (
                  <li key={`${gap.from}:${gap.to}:${i}`}>
                    <span className="matrix-missing-link">{gap.from} → {gap.to}</span>
                    <span className="matrix-missing-reason">{gap.reason}</span>
                    <span className="matrix-missing-detail">{gap.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="matrix-next-actions">
            <h3 className="matrix-rail-title">Next Action</h3>
            <div className="matrix-next-grid">
              {NEXT_ACTIONS.map((a) => (
                <button key={a.hash} className="matrix-next-card" onClick={() => { window.location.hash = a.hash; }}>
                  <strong>{a.label}</strong>
                  <span>{a.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="matrix-rail matrix-rail-right">
          <h2 className="matrix-rail-title">Selected Object</h2>
          {detail ? (
            <div className="matrix-detail-panel">
              <div className="matrix-card-kinds">{detail.kinds.map((k) => <span key={k} className="matrix-kind-tag">{KIND_LABEL[k]}</span>)}</div>
              <h3 className="matrix-detail-title">{detail.record.experimentName || detail.record.experimentId}</h3>
              <p className="matrix-card-meta">{new Date(detail.record.createdAt).toLocaleString()} · lab {detail.record.labId}</p>
              <dl className="matrix-detail-list">
                <div><dt>ID</dt><dd className="mono">{detail.record.id}</dd></div>
                {detail.record.evidencePackId && <div><dt>Evidence pack</dt><dd className="mono">{detail.record.evidencePackId}</dd></div>}
                {Object.entries(detail.record.stats).slice(0, 5).map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{Number.isFinite(value) ? value : String(value)}</dd></div>
                ))}
              </dl>
              {/* STATUS EPISTEMICZNY of this one record, with the rule that
                  produced it. Showing the rule is the point: a status nobody
                  can check is a label, not a classification. */}
              {(() => {
                const node = epistemicByRecordId.get(detail.record.id);
                if (node === undefined) return null;
                return (
                  <>
                    <h4 className="matrix-detail-sub">Status epistemiczny</h4>
                    <p className="matrix-rail-empty" data-testid="epistemic-node-status">
                      <strong>{node.epistemicStatus}</strong> — wyprowadzone z: {node.derivationRule}
                    </p>
                  </>
                );
              })()}

              {/* ZASIĘG DOWODU — how much of the rest of the memory leans on
                  this record, found by walking real reference fields
                  transitively. This is the question "what breaks if this turns
                  out to be wrong", and the relation list below cannot answer
                  it: relations are one hop, dependence is not. */}
              {(() => {
                const impact = computeEvidenceImpact(detail.record.id, records);
                if (impact.dependentExperiments.length === 0) return null;
                return (
                  <>
                    <h4 className="matrix-detail-sub">Zasięg dowodu</h4>
                    <p className="matrix-rail-empty" data-testid="evidence-impact">
                      Zależy od tego rekordu: <strong data-testid="evidence-impact-count">{impact.dependentExperiments.length}</strong>{' '}
                      {impact.dependentExperiments.length === 1 ? 'rekord' : 'rekordów'}
                      {impact.dependentCampaigns.length > 0 && <> (w tym {impact.dependentCampaigns.length} kampanii)</>}
                      {impact.downstreamFalsifiedOrInconclusive.length > 0 && (
                        <> · {impact.downstreamFalsifiedOrInconclusive.length} z nich ma już status FALSIFIED/INCONCLUSIVE/BLOCKED</>
                      )}
                      .
                    </p>
                  </>
                );
              })()}

              {/* Relations — the point of a Matrix. Every row names the field
                  that proves it, so a user can check the claim rather than
                  trust a drawn line. */}
              <h4 className="matrix-detail-sub">Powiązania</h4>
              {edgesFor(relations, detail.record.id).length === 0 ? (
                <p className="matrix-rail-empty">
                  Brak powiązań wyprowadzalnych z danych. Ten rekord nie dzieli evidence packa, chaina ani kapsuły
                  replay z żadnym innym i nic go nie weryfikuje — Genesis nie dorysowuje relacji „na oko".
                </p>
              ) : (
                <ul className="matrix-relation-list">
                  {edgesFor(relations, detail.record.id).map((edge) => {
                    const otherId = edge.fromId === detail.record.id ? edge.toId : edge.fromId;
                    const other = records.find((r) => r.id === otherId);
                    const incoming = edge.toId === detail.record.id && edge.directed;
                    return (
                      <li key={`${edge.kind}:${edge.fromId}:${edge.toId}`}>
                        <button
                          className="matrix-relation-row"
                          onClick={() => { const target = withKinds.find((w) => w.record.id === otherId); if (target) openDetail(target); }}
                          disabled={!other}
                        >
                          <span className="matrix-relation-kind">
                            {edge.directed ? (incoming ? '←' : '→') : '↔'} {EDGE_LABEL[edge.kind]}
                          </span>
                          <span className="matrix-relation-target">{other ? (other.experimentName || other.id) : otherId}</span>
                          <span className="matrix-relation-basis">podstawa: {edge.basis}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="matrix-detail-actions">
                <button className="chip-btn" type="button" onClick={() => { window.location.hash = '#/memory'; }}>Otwórz w Pamięci Naukowej →</button>
                {(detail.record.biotech || detail.record.substitutionInvestigation) && (
                  <button className="chip-btn" type="button" onClick={() => { window.location.hash = '#/drug'; }}>Otwórz w Drug Discovery →</button>
                )}
                {(detail.record.scenario || detail.record.counterfactual || detail.record.worldDiscovery) && (
                  <button className="chip-btn" type="button" onClick={() => { window.location.hash = '#/genesis-world'; }}>Otwórz w World Engine →</button>
                )}
              </div>
            </div>
          ) : (
            <p className="matrix-rail-empty">Kliknij dowolny obiekt w Matrix, żeby zobaczyć jego realne dane i dostępne akcje.</p>
          )}

          <h2 className="matrix-rail-title">Science Chat</h2>
          <button className="matrix-chat-dock" onClick={() => requestOpenScienceChat()}>
            <span>💬 Otwórz Science Chat</span>
            <span className="matrix-chat-dock-sub">Ta sama rozmowa co wszędzie w Genesis — pytania, plany, uruchamianie eksperymentów.</span>
          </button>
        </aside>
      </div>

      <section className="matrix-hub-grid-section" aria-label="Wszystkie rekordy">
        <div className="matrix-hub-grid-header">
          <h2 className="matrix-rail-title">Wszystkie rekordy {activeKind ? `· ${KIND_LABEL[activeKind]}` : ''}</h2>
        </div>
        {visible.length === 0 ? (
          <p className="matrix-hub-empty">Brak rekordów w tej kategorii.</p>
        ) : (
          <div className="matrix-hub-grid">
            {visible.map(({ record, kinds }) => (
              <article key={record.id} className="matrix-card" onClick={() => openDetail({ record, kinds })}>
                <div className="matrix-card-kinds">{kinds.map((k) => <span key={k} className="matrix-kind-tag">{KIND_LABEL[k]}</span>)}</div>
                <h3 className="matrix-card-title">{record.experimentName || record.experimentId}</h3>
                <p className="matrix-card-meta">{timeAgo(record.createdAt)} · lab {record.labId}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
