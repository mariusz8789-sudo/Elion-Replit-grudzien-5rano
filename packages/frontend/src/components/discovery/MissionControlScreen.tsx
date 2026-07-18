/**
 * MissionControlScreen — the discovery console home (V5). Aggregates the REAL
 * runtime status of the platform into a KPI dashboard: available engines, compute
 * resources, the agent roster, off-target panel, and knowledge-graph ontology.
 *
 * HONESTY: every number is measured/derived from a live endpoint. Where Genesis
 * has not run a campaign, the metric reads 0 / "—" — never an invented figure.
 * A permanent banner states that no drug has been discovered.
 */
import { useEffect, useState } from 'react';
import { DiscoveryShell, Panel, DISCOVERY_NAV, StatusPill } from './DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import { useI18n } from '../../core/i18n';
import {
  fetchComputeResources, fetchScienceCapabilities, fetchAgentRoles,
  type ComputeResources, type ScienceCapabilities,
} from '../../core/backend/client';

const PIPELINE = [
  { id: 'design', label: 'Design', icon: 'dna' as const, engine: 'RDKit' },
  { id: 'dock', label: 'Docking', icon: 'target' as const, engine: 'AutoDock Vina' },
  { id: 'admet', label: 'ADMET', icon: 'shield' as const, engine: 'ADMET-AI' },
  { id: 'offtarget', label: 'Off-Target', icon: 'alert' as const, engine: 'ADMET-AI' },
  { id: 'md', label: 'MD / MM-GBSA', icon: 'atom' as const, engine: 'OpenMM' },
  { id: 'lab', label: 'Lab Ready', icon: 'flask' as const, engine: 'RDKit' },
];

export function MissionControlScreen() {
  const { t } = useI18n();
  const [res, setRes] = useState<ComputeResources | null>(null);
  const [caps, setCaps] = useState<ScienceCapabilities | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([fetchComputeResources(), fetchScienceCapabilities(), fetchAgentRoles()]).then(([r, c, ro]) => {
      if (!live) return;
      if (r.ok) setRes(r.data);
      if (c.ok) setCaps(c.data);
      if (ro.ok) setRoles(ro.data.roles);
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const engines = caps ? Object.entries(caps.engines) : [];
  const enginesUp = engines.filter(([, e]) => e.available).length;

  return (
    <DiscoveryShell active="#/dashboard" title="Mission Control" subtitle={t('mc.subtitle')}
      actions={<StatusPill kind="info">DID GENESIS FIND A DRUG? <strong>NO</strong></StatusPill>}>
      {loading ? (
        <div className="ds-grid ds-grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}</div>
      ) : (
        <>
          <div className="ds-grid ds-grid-4">
            <StatCard label={t('mc.stat.engines')} value={`${enginesUp}/${engines.length}`} sub="RDKit · ADMET-AI · Vina" accent="var(--green)" />
            <StatCard label={t('mc.stat.cpu')} value={res?.cpu.cores ?? '—'} sub={`RAM ${res ? res.cpu.totalMemGB.toFixed(0) : '—'} GB`} accent="var(--cyan)" />
            <StatCard label={t('mc.stat.agents')} value={roles.length || '—'} sub="rule-based · reasoning blocked" accent="var(--violet)" />
            <StatCard label={t('mc.stat.offtarget')} value={caps?.offTarget.panel.length ?? '—'} sub={t('mc.stat.offtarget.sub')} accent="var(--gold)" />
          </div>

          <div className="ds-grid ds-grid-2" style={{ marginTop: '1rem' }}>
            <Panel title={t('mc.panel.engines')} icon="cpu">
              <ul className="ds-list">
                {engines.map(([name, e]) => (
                  <li key={name} className="ds-list-row">
                    <span className="ds-list-name">{name}</span>
                    {e.available
                      ? <StatusPill kind="ok"><Icon name="check" size={12} /> {e.version ?? 'available'}</StatusPill>
                      : <StatusPill kind="blocked"><Icon name="block" size={12} /> {e.reason ? 'BLOCKED_BY_RUNTIME' : 'blocked'}</StatusPill>}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t('mc.panel.resources')} icon="cpu">
              <div className="ds-resource-grid">
                <ResourceStat label="GPU" ok={res?.gpu.available} detail={res?.gpu.available ? 'CUDA' : t('mc.res.gpu.none')} />
                <ResourceStat label="Docker" ok={res?.docker.available} />
                <ResourceStat label="Kubernetes" ok={res?.kubernetes.available} />
                <ResourceStat label="Slurm HPC" ok={res?.hpcScheduler.slurm} />
                <ResourceStat label={t('mc.res.jobQueue')} ok={res?.jobQueue.available} />
                <ResourceStat label="Distributed" ok={res?.distributedProcessing.available} />
              </div>
              <p className="ds-note ds-mt">{t('mc.note.cores', { cores: res?.cpu.cores ?? '—', ram: res ? res.cpu.totalMemGB.toFixed(1) : '—' })}<code>deploy/genesis-k8s.yaml</code></p>
            </Panel>
          </div>

          <Panel title={t('mc.panel.pipeline')} icon="spark" className="ds-mt">
            <div className="ds-pipeline">
              {PIPELINE.map((s, i) => {
                const eng = caps?.engines[Object.keys(caps.engines).find((k) => k.toLowerCase().includes(s.engine.split(' ')[0].toLowerCase())) ?? ''];
                const blocked = s.id === 'md' && !(eng?.available);
                return (
                  <div key={s.id} className={`ds-pipe-step${blocked ? ' blocked' : ''}`}>
                    <span className="ds-pipe-icon"><Icon name={s.icon} size={18} /></span>
                    <span className="ds-pipe-label">{s.label}</span>
                    <span className="ds-pipe-sub">{blocked ? 'BLOCKED' : s.engine}</span>
                    {i < PIPELINE.length - 1 ? <span className="ds-pipe-arrow" aria-hidden="true">→</span> : null}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title={t('mc.panel.shortcuts')} icon="rocket" className="ds-mt">
            <div className="ds-grid ds-grid-4">
              {DISCOVERY_NAV.filter((n) => n.hash !== '#/dashboard').slice(0, 8).map((n) => (
                <a key={n.hash} href={n.hash} className="ds-quicklink"><Icon name={n.icon} size={20} /><span>{n.labelKey ? t(n.labelKey) : n.label}</span></a>
              ))}
            </div>
          </Panel>
        </>
      )}
    </DiscoveryShell>
  );
}

function ResourceStat({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) {
  const { t } = useI18n();
  return (
    <div className="ds-resource">
      <span className="ds-resource-label">{label}</span>
      <span className={`ds-resource-val ${ok ? 'up' : 'down'}`}>{ok ? t('mc.res.available') : t('mc.res.unavailable')}</span>
      {detail ? <span className="ds-resource-detail">{detail}</span> : null}
    </div>
  );
}
