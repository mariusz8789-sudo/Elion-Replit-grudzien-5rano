import { useMemo, useState } from 'react';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';

/**
 * GENESIS MATRIX HUB — the cross-domain map screen.
 *
 * This is the "rozbuduj istniejący" case: `core/agent/genesisMatrix.ts`
 * already builds a real joined view (World/Time/Space/Experiment/Hypothesis/
 * Model/Observation/Evidence/Replay/NextAction) for ONE live discovery run,
 * and `MatrixPanel` (`GenesisWorldScreen.tsx`) already renders it. Neither is
 * duplicated here. What was missing: a screen that surfaces ALL of Genesis's
 * persisted work — every domain, every shape — as one navigable map, not
 * just one investigation at a time.
 *
 * The data is real, not mocked: `listExperiments()` reads the SAME Science
 * Memory store `ScientificMemoryScreen.tsx` already reads. Every "kind" a
 * card shows is derived from which optional shape field
 * (`SavedExperiment.biotech`/`.discoveryLoop`/`.scenario`/...) is actually
 * present on that record — never invented. A record with no shape field at
 * all is still a real experiment (`labId`/`experimentId`/`params`/`stats`
 * are required on every row), so it is never left uncategorized.
 *
 * Deliberately NOT built here (left to later phases, per the phased plan):
 * a force-directed relationship graph, or per-kind rich visual hierarchies
 * (candidate cards, evidence-strength bars). This is the real navigational
 * skeleton first; the deeper per-type visual language is Phase 3+.
 */

export type MatrixKind =
  | 'HYPOTHESIS' | 'WORLD' | 'MODEL' | 'SCENARIO' | 'EVIDENCE'
  | 'CYBER' | 'RESEARCH_CHAIN' | 'REPLAY' | 'EXPERIMENT';

const KIND_LABEL: Record<MatrixKind, string> = {
  HYPOTHESIS: 'Hypotheses', WORLD: 'Worlds', MODEL: 'Models', SCENARIO: 'Scenarios',
  EVIDENCE: 'Evidence', CYBER: 'Cyber', RESEARCH_CHAIN: 'Research Chain',
  REPLAY: 'Replay', EXPERIMENT: 'Experiment',
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

const ALL_KINDS: MatrixKind[] = ['HYPOTHESIS', 'WORLD', 'MODEL', 'SCENARIO', 'EVIDENCE', 'CYBER', 'RESEARCH_CHAIN', 'REPLAY', 'EXPERIMENT'];

export function GenesisMatrixHub() {
  const records = useMemo(() => listExperiments(), []);
  const [activeKind, setActiveKind] = useState<MatrixKind | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const withKinds = useMemo(() => records.map((r) => ({ record: r, kinds: kindsOf(r) })), [records]);
  const countsByKind = useMemo(() => {
    const counts = new Map<MatrixKind, number>();
    for (const { kinds } of withKinds) for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  }, [withKinds]);
  const visible = activeKind ? withKinds.filter(({ kinds }) => kinds.includes(activeKind)) : withKinds;

  return (
    <main className="matrix-hub" id="main-content" tabIndex={-1}>
      <header className="matrix-hub-header">
        <p className="matrix-hub-eyebrow">GENESIS · SCIENTIFIC OPERATING SYSTEM</p>
        <h1>Matrix</h1>
        <p className="matrix-hub-sub">
          Realna mapa wszystkiego, co Genesis zarejestrował w Scientific Memory — {records.length}{' '}
          {records.length === 1 ? 'pozycja' : 'pozycji'}. Kliknij pozycję, aby zobaczyć jej realne dane;
          pełna interakcja (Evidence → provenance, Experiment → prediction/result) żyje w dedykowanych
          ekranach, do których Matrix prowadzi.
        </p>
      </header>

      <nav className="matrix-hub-filters" aria-label="Filtruj Matrix wg rodzaju">
        <button className={activeKind === null ? 'matrix-filter-chip active' : 'matrix-filter-chip'} onClick={() => setActiveKind(null)}>
          Wszystko · {records.length}
        </button>
        {ALL_KINDS.filter((k) => (countsByKind.get(k) ?? 0) > 0).map((k) => (
          <button key={k} className={activeKind === k ? 'matrix-filter-chip active' : 'matrix-filter-chip'} onClick={() => setActiveKind(k)}>
            {KIND_LABEL[k]} · {countsByKind.get(k) ?? 0}
          </button>
        ))}
      </nav>

      {visible.length === 0 ? (
        <p className="matrix-hub-empty">
          Scientific Memory jest pusta. Uruchom eksperyment, discovery loop, scenariusz albo dochodzenie
          substytucji — pojawi się tutaj automatycznie, bo Matrix czyta ten sam magazyn co Pamięć Naukowa.
        </p>
      ) : (
        <div className="matrix-hub-grid">
          {visible.map(({ record, kinds }) => (
            <article
              key={record.id}
              className={expandedId === record.id ? 'matrix-card expanded' : 'matrix-card'}
              onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
            >
              <div className="matrix-card-kinds">
                {kinds.map((k) => <span key={k} className="matrix-kind-tag">{KIND_LABEL[k]}</span>)}
              </div>
              <h3 className="matrix-card-title">{record.experimentName || record.experimentId}</h3>
              <p className="matrix-card-meta">{new Date(record.createdAt).toLocaleString()} · lab {record.labId}</p>
              {expandedId === record.id && (
                <div className="matrix-card-detail" onClick={(e) => e.stopPropagation()}>
                  <dl className="matrix-detail-list">
                    <div><dt>ID</dt><dd className="mono">{record.id}</dd></div>
                    <div><dt>Experiment ID</dt><dd className="mono">{record.experimentId}</dd></div>
                    {record.evidencePackId && <div><dt>Evidence pack</dt><dd className="mono">{record.evidencePackId}</dd></div>}
                    {record.evidenceChainId && <div><dt>Evidence chain</dt><dd className="mono">{record.evidenceChainId}</dd></div>}
                    {Object.entries(record.stats).slice(0, 6).map(([key, value]) => (
                      <div key={key}><dt>{key}</dt><dd>{Number.isFinite(value) ? value : String(value)}</dd></div>
                    ))}
                  </dl>
                  <div className="matrix-detail-actions">
                    <button className="chip-btn" type="button" onClick={() => { window.location.hash = '#/memory'; }}>
                      Otwórz w Pamięci Naukowej →
                    </button>
                    {(record.biotech || record.substitutionInvestigation) && (
                      <button className="chip-btn" type="button" onClick={() => { window.location.hash = '#/drug'; }}>
                        Otwórz w Drug Discovery →
                      </button>
                    )}
                    {(record.scenario || record.counterfactual) && (
                      <button className="chip-btn" type="button" onClick={() => { window.location.hash = '#/genesis-world'; }}>
                        Otwórz w World Engine →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
