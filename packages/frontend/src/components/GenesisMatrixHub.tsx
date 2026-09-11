import { Fragment, useMemo, useState } from 'react';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { buildMatrixRelationGraph, edgesFor, EDGE_LABEL } from '../core/agent/matrixRelations';

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
  | 'CYBER' | 'RESEARCH_CHAIN' | 'REPLAY' | 'EXPERIMENT';

const KIND_LABEL: Record<MatrixKind, string> = {
  HYPOTHESIS: 'Hypotheses', WORLD: 'Worlds', MODEL: 'Models', SCENARIO: 'Scenarios',
  EVIDENCE: 'Evidence', CYBER: 'Cyber', RESEARCH_CHAIN: 'Research Chain',
  REPLAY: 'Replay', EXPERIMENT: 'Experiment',
};

const KIND_ICON: Record<MatrixKind, string> = {
  HYPOTHESIS: '◆', WORLD: '◇', MODEL: '▣', SCENARIO: '⑂', EVIDENCE: '✓',
  CYBER: '◈', RESEARCH_CHAIN: '⛓', REPLAY: '↺', EXPERIMENT: '●',
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
  if (record.researchChain) kinds.push('RESEARCH_CHAIN');
  if (record.replayIdentity) kinds.push('REPLAY');
  if (kinds.length === 0) kinds.push('EXPERIMENT');
  return kinds;
}

type LoopStage = 'HYPOTHESIS' | 'EXPERIMENT' | 'EVIDENCE';
const STAGE_KINDS: Record<LoopStage, MatrixKind[]> = {
  HYPOTHESIS: ['HYPOTHESIS', 'WORLD', 'MODEL', 'RESEARCH_CHAIN'],
  EXPERIMENT: ['EXPERIMENT', 'CYBER', 'SCENARIO'],
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
  const ALL_KINDS: MatrixKind[] = ['HYPOTHESIS', 'WORLD', 'MODEL', 'SCENARIO', 'EVIDENCE', 'CYBER', 'RESEARCH_CHAIN', 'REPLAY', 'EXPERIMENT'];

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
