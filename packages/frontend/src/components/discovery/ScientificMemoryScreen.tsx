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
import { useI18n } from '../../core/i18n';

export function ScientificMemoryScreen() {
  const { t } = useI18n();
  const [mem, setMem] = useState<ScientificMemory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchScientificMemory().then((r) => r.ok ? setMem(r.data) : setErr(r.message)); }, []);

  if (err) return <DiscoveryShell active="#/scientific-memory" title="Scientific Memory"><div className="ds-empty"><h4>{t('mv.backendDown')}</h4><p>{err}</p></div></DiscoveryShell>;
  if (!mem) return <DiscoveryShell active="#/scientific-memory" title="Scientific Memory"><div className="skeleton" style={{ height: 260 }} /></DiscoveryShell>;

  const open = mem.externalSources.filter((s) => !s.license.includes('PROPRIETARY')).length;
  return (
    <DiscoveryShell active="#/scientific-memory" title="Scientific Memory" subtitle={t('sm.subtitle')}
      actions={<StatusPill kind="blocked">External learning: {mem.externalLearningStatus}</StatusPill>}>
      <div className="ds-grid ds-grid-4">
        <StatCard label={t('sm.stat.campaigns')} value={mem.ownCampaigns.campaignsLearnedFrom} sub={mem.ownCampaigns.status} accent="var(--cyan)" />
        <StatCard label={t('sm.stat.samples')} value={mem.ownCampaigns.samples} sub={t('sm.stat.samples.sub')} accent="var(--violet)" />
        <StatCard label={t('sm.stat.external')} value={mem.externalSources.length} sub={t('sm.stat.external.sub', { open })} accent="var(--gold)" />
        <StatCard label={t('sm.stat.policy')} value={mem.ownCampaigns.learnedPolicy ? t('sm.yes') : '—'} sub={t('sm.stat.policy.sub')} accent="var(--green)" />
      </div>

      <Panel title={t('sm.panel.registry')} icon="memory" className="ds-mt">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>{t('sm.th.source')}</th><th>{t('sm.th.type')}</th><th>{t('sm.th.license')}</th><th>{t('sm.th.compliance')}</th><th>{t('sm.th.status')}</th></tr></thead>
            <tbody>
              {mem.externalSources.map((s) => (
                <tr key={s.source}>
                  <td className="ds-strong">{s.source}</td>
                  <td className="ds-dim">{s.kind}</td>
                  <td className="ds-dim">{s.license}</td>
                  <td>{s.license.includes('PROPRIETARY')
                    ? <StatusPill kind="warn"><Icon name="lock" size={11} /> {t('sm.licensed')}</StatusPill>
                    : <StatusPill kind="ok">{t('sm.open')}</StatusPill>}</td>
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
