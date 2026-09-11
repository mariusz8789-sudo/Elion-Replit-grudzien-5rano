import { Fragment, useMemo, useState } from 'react';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { buildMatrixRelationGraph, edgesFor, EDGE_LABEL, type MatrixRelationGraph } from '../core/agent/matrixRelations';

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

const ALL_KINDS: MatrixKind[] = ['HYPOTHESIS', 'WORLD', 'MODEL', 'SCENARIO', 'EVIDENCE', 'CYBER', 'DECIPHERMENT', 'RESEARCH_CHAIN', 'REPLAY', 'EXPERIMENT'];

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

/**
 * MATRIX GRAPH — Etap 3: turns the list of records above into an actual map
 * of the scientific process, not a second copy of it. Every node here is one
 * of the SAME `withKinds` items the list view already computed; every edge
 * is a SAME `relations.edges` entry from `matrixRelations.ts` — no second
 * relation engine, no invented edge kind, no force-directed physics claiming
 * a precision this data doesn't have. Layout is a plain deterministic grid
 * (column = primary kind, row = chronological order within it) so the
 * picture never reshuffles between renders. Clicking a node calls the SAME
 * `onSelect` (= `openDetail`) the list/loop views already use, so selection,
 * the relations list, and Next Action all come for free instead of being a
 * second inspector.
 */
const GRAPH_COLUMN_WIDTH = 190;
const GRAPH_ROW_HEIGHT = 60;
const GRAPH_NODE_RADIUS = 14;
const GRAPH_PADDING = 36;

interface GraphLayout {
  readonly columns: readonly MatrixKind[];
  readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  readonly width: number;
  readonly height: number;
}

/** Exported so the layout logic (grouping, chronological order, column filtering) is testable
 * directly, the same convention `kindsOf` already uses in this file. */
export function buildGraphLayout(items: readonly { record: SavedExperiment; kinds: MatrixKind[] }[]): GraphLayout {
  const byColumn = new Map<MatrixKind, { record: SavedExperiment; kinds: MatrixKind[] }[]>();
  for (const item of items) {
    const column = item.kinds[0];
    const bucket = byColumn.get(column);
    if (bucket) bucket.push(item);
    else byColumn.set(column, [item]);
  }
  // Oldest first within a column — a stable order, not a fabricated ranking.
  for (const bucket of byColumn.values()) bucket.sort((a, b) => a.record.createdAt.localeCompare(b.record.createdAt));
  const columns = ALL_KINDS.filter((k) => byColumn.has(k));

  const positions = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  columns.forEach((column, columnIndex) => {
    const bucket = byColumn.get(column)!;
    maxRows = Math.max(maxRows, bucket.length);
    bucket.forEach((item, rowIndex) => {
      positions.set(item.record.id, {
        x: GRAPH_PADDING + columnIndex * GRAPH_COLUMN_WIDTH,
        y: GRAPH_PADDING + 20 + rowIndex * GRAPH_ROW_HEIGHT,
      });
    });
  });

  const width = GRAPH_PADDING * 2 + Math.max(0, columns.length - 1) * GRAPH_COLUMN_WIDTH + GRAPH_NODE_RADIUS * 2;
  const height = GRAPH_PADDING * 2 + 20 + Math.max(0, maxRows - 1) * GRAPH_ROW_HEIGHT + GRAPH_NODE_RADIUS * 2;
  return { columns, positions, width: Math.max(width, 200), height: Math.max(height, 160) };
}

interface MatrixGraphViewProps {
  readonly items: readonly { record: SavedExperiment; kinds: MatrixKind[] }[];
  readonly relations: MatrixRelationGraph;
  readonly selectedId: string | null;
  readonly onSelect: (target: DetailTarget) => void;
}

function MatrixGraphView({ items, relations, selectedId, onSelect }: MatrixGraphViewProps) {
  const layout = useMemo(() => buildGraphLayout(items), [items]);
  const visibleIds = useMemo(() => new Set(items.map((i) => i.record.id)), [items]);
  // Only draw an edge when BOTH ends are actually on screen (e.g. still visible under the active
  // kind filter) — a line to an invisible node would be worse than no line.
  const visibleEdges = useMemo(
    () => relations.edges.filter((e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId)),
    [relations, visibleIds],
  );
  const selectedEdgeKeys = useMemo(
    () => new Set(selectedId ? edgesFor(relations, selectedId).map((e) => `${e.kind}:${e.fromId}:${e.toId}`) : []),
    [relations, selectedId],
  );
  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of relations.edges) { set.add(e.fromId); set.add(e.toId); }
    return set;
  }, [relations]);
  const isolatedCount = items.filter((i) => !connectedIds.has(i.record.id)).length;

  return (
    <div className="mx-graph-wrap">
      <svg
        className="mx-graph-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Genesis Matrix — graf relacji między zapisanymi przebiegami"
      >
        {layout.columns.map((column, columnIndex) => (
          <text key={column} className="mx-graph-col-label" x={GRAPH_PADDING + columnIndex * GRAPH_COLUMN_WIDTH} y={14}>
            {KIND_LABEL[column]}
          </text>
        ))}
        <g className="mx-graph-edges">
          {visibleEdges.map((edge) => {
            const from = layout.positions.get(edge.fromId);
            const to = layout.positions.get(edge.toId);
            if (!from || !to) return null;
            const key = `${edge.kind}:${edge.fromId}:${edge.toId}`;
            const active = selectedEdgeKeys.has(key);
            return <line key={key} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`mx-graph-edge${active ? ' mx-graph-edge-active' : ''}`} />;
          })}
        </g>
        <g className="mx-graph-nodes">
          {items.map(({ record, kinds }) => {
            const pos = layout.positions.get(record.id);
            if (!pos) return null;
            const isolated = !connectedIds.has(record.id);
            const active = record.id === selectedId;
            return (
              <g
                key={record.id}
                className={`mx-graph-node${active ? ' mx-graph-node-active' : ''}${isolated ? ' mx-graph-node-isolated' : ''}`}
                transform={`translate(${pos.x},${pos.y})`}
                onClick={() => onSelect({ record, kinds })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ record, kinds }); } }}
                tabIndex={0}
                role="button"
                aria-label={`${record.experimentName || record.id}${isolated ? ' — bez powiązań' : ''}`}
              >
                <circle r={GRAPH_NODE_RADIUS} />
                <text className="mx-graph-node-icon" textAnchor="middle" dy="0.35em">{KIND_ICON[kinds[0]]}</text>
              </g>
            );
          })}
        </g>
      </svg>
      {isolatedCount > 0 && (
        <p className="mx-graph-isolated-note">
          {isolatedCount} {isolatedCount === 1 ? 'obiekt bez wykrywalnych powiązań' : 'obiektów bez wykrywalnych powiązań'} — pokazane
          normalnie (obwódka kreskowana), nie ukryte i nie dorysowane na siłę.
        </p>
      )}
    </div>
  );
}

export function GenesisMatrixHub() {
  const records = useMemo(() => listExperiments(), []);
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

  const [activeKind, setActiveKind] = useState<MatrixKind | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [askInput, setAskInput] = useState('');

  const latest = withKinds[0] ?? null; // listExperiments() sorts newest-first
  const recentFive = withKinds.slice(0, 5);
  const visible = activeKind ? withKinds.filter(({ kinds }) => kinds.includes(activeKind)) : withKinds;
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

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
          <div className="mx-view-toggle" role="group" aria-label="Widok">
            <button type="button" className={viewMode === 'list' ? 'mx-view-toggle-btn active' : 'mx-view-toggle-btn'} onClick={() => setViewMode('list')}>Lista</button>
            <button type="button" className={viewMode === 'graph' ? 'mx-view-toggle-btn active' : 'mx-view-toggle-btn'} onClick={() => setViewMode('graph')}>Graf</button>
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="matrix-hub-empty">Brak rekordów w tej kategorii.</p>
        ) : viewMode === 'graph' ? (
          <MatrixGraphView items={visible} relations={relations} selectedId={detail?.record.id ?? null} onSelect={openDetail} />
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
