/**
 * Discovery Workspace (V3 Phase 6) — a production scientific surface that displays the REAL runtime
 * status of Genesis's discovery-science layer from GET /api/science/capabilities. No fake dashboards:
 * engine availability comes from live backend detects; unavailable engines and egress-blocked
 * biological sources are shown honestly as BLOCKED. The off-target protein panel, knowledge-graph
 * schema, and biological-source registry are the real definitions the campaign uses.
 */
import { useEffect, useState } from 'react';
import { fetchScienceCapabilities, type ScienceCapabilities } from '../core/backend/client';

function EngineRow({ name, e }: { name: string; e: { available: boolean; version?: string | null; reason?: string | null; canRunComplexMd?: boolean } }) {
  const ok = e.available || e.canRunComplexMd;
  return (
    <div className="sci-engine-row">
      <span className={`mdot ${ok ? 'on' : 'warn'}`} aria-hidden="true" />
      <strong>{name}</strong>
      <span>{ok ? `available${e.version ? ' ' + e.version : ''}` : 'BLOCKED_BY_RUNTIME'}</span>
      {!ok && e.reason ? <em className="sci-reason">{e.reason}</em> : null}
    </div>
  );
}

export function DiscoveryWorkspaceScreen() {
  const [caps, setCaps] = useState<ScienceCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchScienceCapabilities().then((r) => { if (r.ok) setCaps(r.data); else setError(r.error ?? 'unavailable'); });
  }, []);

  if (error) return <div className="empty-state">Nie udało się pobrać statusu nauki: {error}</div>;
  if (!caps) return <div className="empty-state">Ładowanie statusu silników naukowych…</div>;

  return (
    <div className="sci-workspace">
      <p className="section-label">Silniki obliczeniowe (status runtime — realne wykrycie)</p>
      <div className="sci-panel">
        <EngineRow name="RDKit" e={caps.engines.rdkit} />
        <EngineRow name="ADMET-AI" e={caps.engines.admet} />
        <EngineRow name="AutoDock Vina (docking)" e={caps.engines.docking} />
        <EngineRow name="Molecular Dynamics (OpenMM)" e={caps.engines.molecularDynamics} />
        <EngineRow name="MM-GBSA" e={caps.engines.mmGbsa} />
      </div>

      <p className="section-label">Panel off-target ({caps.offTarget.panel.length} białek · {caps.offTarget.epistemicStatus} · {caps.offTarget.source})</p>
      <div className="sci-panel sci-grid">
        {caps.offTarget.panel.map((p) => (
          <div key={p.gene + p.protein} className="sci-chip"><strong>{p.gene}</strong> {p.protein} <em>{p.category}</em></div>
        ))}
      </div>

      <p className="section-label">Knowledge Graph — schemat (provenance wymagane: {caps.knowledgeGraph.provenanceRequired ? 'tak' : 'nie'})</p>
      <div className="sci-panel">
        <div>Węzły: {caps.knowledgeGraph.nodeTypes.join(', ')}</div>
        <div>Krawędzie: {caps.knowledgeGraph.edgeTypes.join(', ')}</div>
      </div>

      <p className="section-label">Zewnętrzne źródła biologiczne (pobieranie na żywo)</p>
      <div className="sci-panel">
        {caps.biologicalSources.map((s) => (
          <div key={s.service} className="sci-engine-row">
            <span className="mdot warn" aria-hidden="true" />
            <strong>{s.service}</strong> <span>{s.kind}</span> <em className="sci-reason">{s.liveRetrieval}</em>
          </div>
        ))}
      </div>

      <p className="footer-note">{caps.honesty}</p>
    </div>
  );
}
