/**
 * ScientificMemoryScreen (V5) — real /api/science/memory: own-campaign learning
 * status + the licence-tagged external-knowledge registry (PubMed, ChEMBL,
 * PubChem, BindingDB, PDB, UniProt, DrugBank, Open Targets…). External learning
 * is honestly BLOCKED_BY_RUNTIME here (egress); DrugBank marked licence-gated.
 */
import { useEffect, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import { fetchScientificMemory, type ScientificMemory } from '../../core/backend/client';

export function ScientificMemoryScreen() {
  const [mem, setMem] = useState<ScientificMemory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchScientificMemory().then((r) => r.ok ? setMem(r.data) : setErr(r.message)); }, []);

  if (err) return <DiscoveryShell active="#/scientific-memory" title="Scientific Memory"><div className="ds-empty"><h4>Backend niedostępny</h4><p>{err}</p></div></DiscoveryShell>;
  if (!mem) return <DiscoveryShell active="#/scientific-memory" title="Scientific Memory"><div className="skeleton" style={{ height: 260 }} /></DiscoveryShell>;

  const open = mem.externalSources.filter((s) => !s.license.includes('PROPRIETARY')).length;
  return (
    <DiscoveryShell active="#/scientific-memory" title="Scientific Memory" subtitle="Uczenie z własnych kampanii + rejestr źródeł zewnętrznych (licencje respektowane)"
      actions={<StatusPill kind="blocked">External learning: {mem.externalLearningStatus}</StatusPill>}>
      <div className="ds-grid ds-grid-4">
        <StatCard label="Kampanie (własne)" value={mem.ownCampaigns.campaignsLearnedFrom} sub={mem.ownCampaigns.status} accent="var(--cyan)" />
        <StatCard label="Próbki uczące" value={mem.ownCampaigns.samples} sub="z realnych wyników" accent="var(--violet)" />
        <StatCard label="Źródła zewnętrzne" value={mem.externalSources.length} sub={`${open} otwartych · reszta licencyjna`} accent="var(--gold)" />
        <StatCard label="Polityka nauczona" value={mem.ownCampaigns.learnedPolicy ? 'TAK' : '—'} sub="wymaga ukończonych kampanii" accent="var(--green)" />
      </div>

      <Panel title="Rejestr źródeł wiedzy" icon="memory" className="ds-mt">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Źródło</th><th>Typ</th><th>Licencja</th><th>Zgodność</th><th>Status</th></tr></thead>
            <tbody>
              {mem.externalSources.map((s) => (
                <tr key={s.source}>
                  <td className="ds-strong">{s.source}</td>
                  <td className="ds-dim">{s.kind}</td>
                  <td className="ds-dim">{s.license}</td>
                  <td>{s.license.includes('PROPRIETARY')
                    ? <StatusPill kind="warn"><Icon name="lock" size={11} /> licencja</StatusPill>
                    : <StatusPill kind="ok">otwarte</StatusPill>}</td>
                  <td><StatusPill kind="blocked">{s.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ds-note ds-mt">{mem.honesty}</p>
      </Panel>
    </DiscoveryShell>
  );
}
