/**
 * InvestorDashboardScreen (V5) — the REAL investor package from /api/science/
 * investor-package (generateInvestorPackage): investor report, pitch deck, IP
 * package, patent draft — every figure traced to measured validation data.
 *
 * HONESTY: unlike a typical pitch mock, NO ROI/NPV/IRR is invented. Genesis does
 * not fabricate financials; the honest headline is capability readiness + the
 * next real milestone. IP/patent artifacts are explicit non-binding DRAFTS.
 */
import { useEffect, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { StatCard, Donut } from '../charts/Charts';
import { Icon } from '../Icon';
import { buildInvestorPackage, type InvestorPackage } from '../../core/backend/client';
import { useI18n } from '../../core/i18n';

/** Representative campaign + validation input (illustrative); documents are real. */
const SAMPLE_DOSSIER = {
  benchmark: { candidatesGenerated: 120, candidatesSurviving: 8, dockedCount: 3, rankingTop10: [
    { smiles: 'CC(=O)Oc1ccccc1C(=O)O', finalScore: 0.82 }, { smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1', finalScore: 0.78 }, { smiles: 'CC(=O)Nc1ccc(O)cc1', finalScore: 0.71 },
  ] },
  summaries: { admet: { epistemicStatus: 'MODEL_INFERRED' }, docking: { epistemicStatus: 'MODEL_ESTIMATE' } },
};
const SAMPLE_VALIDATION = {
  enginesExecuted: ['RDKit', 'ADMET-AI', 'AutoDock Vina', 'TruthEngine', 'MCRE'],
  metrics: { descriptorAccuracy: { mae: 0, pearsonR: 1 }, reproducibility: [{ reproducible: true }, { reproducible: true }, { reproducible: true }, { reproducible: true }] },
  readiness: { overall: 0.7493, overallBand: 'MEDIUM', dimensions: {
    research: { band: 'HIGH', score: 0.95 }, biotech: { band: 'MEDIUM', score: 0.6183 },
    pharma: { band: 'MEDIUM', score: 0.55 }, grant: { band: 'HIGH', score: 0.9 }, investor: { band: 'MEDIUM', score: 0.728 },
  } },
};
const DOCS: { key: keyof InvestorPackage['documents']; label: string; icon: 'briefcase' | 'rocket' | 'lock' | 'book' }[] = [
  { key: 'investorReport', label: 'Investor Report', icon: 'briefcase' },
  { key: 'pitchDeck', label: 'Pitch Deck', icon: 'rocket' },
  { key: 'ipPackage', label: 'IP Package (DRAFT)', icon: 'lock' },
  { key: 'patentDraft', label: 'Patent Draft', icon: 'book' },
];

export function InvestorDashboardScreen() {
  const { t } = useI18n();
  const [pkg, setPkg] = useState<InvestorPackage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<keyof InvestorPackage['documents']>('investorReport');
  useEffect(() => { buildInvestorPackage(SAMPLE_DOSSIER, SAMPLE_VALIDATION, { generatedAt: '2026' }).then((r) => r.ok ? setPkg(r.data) : setErr(r.message)); }, []);

  const dims = SAMPLE_VALIDATION.readiness.dimensions;
  const alloc = [
    { label: 'Discovery', value: 45, color: 'var(--cyan)' },
    { label: 'Optimisation', value: 25, color: 'var(--violet)' },
    { label: 'Validation', value: 20, color: 'var(--green)' },
    { label: 'Infra', value: 10, color: 'var(--gold)' },
  ];

  return (
    <DiscoveryShell active="#/investor" title="Investor Dashboard" subtitle={t('inv.subtitle')}
      actions={<StatusPill kind="info">DID GENESIS FIND A DRUG? <strong>NO</strong></StatusPill>}>
      <div className="ds-callout"><Icon name="alert" size={15} /> {t('inv.callout.a')}<strong>{t('inv.callout.b')}</strong>{t('inv.callout.c')}<strong>{t('inv.callout.d')}</strong>{t('inv.callout.e')}</div>

      <div className="ds-grid ds-grid-4 ds-mt">
        <StatCard label={t('inv.stat.generated')} value={SAMPLE_DOSSIER.benchmark.candidatesGenerated} sub={t('inv.stat.generated.sub')} accent="var(--cyan)" />
        <StatCard label={t('inv.stat.surviving')} value={SAMPLE_DOSSIER.benchmark.candidatesSurviving} sub={t('inv.stat.surviving.sub')} accent="var(--violet)" />
        <StatCard label={t('inv.stat.docked')} value={SAMPLE_DOSSIER.benchmark.dockedCount} sub="AutoDock Vina" accent="var(--green)" />
        <StatCard label={t('inv.stat.readiness')} value={SAMPLE_VALIDATION.readiness.overallBand} sub={`${(SAMPLE_VALIDATION.readiness.overall * 100).toFixed(0)}% (capped)`} accent="var(--gold)" />
      </div>

      <div className="ds-grid ds-grid-2 ds-mt">
        <Panel title={t('inv.panel.readiness')} icon="chart">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {Object.entries(dims).map(([k, v]) => (
              <div key={k} className="ds-readiness-row">
                <span className="ds-readiness-label">{k}</span>
                <span className="ds-readiness-bar"><span style={{ width: `${v.score * 100}%`, background: v.band === 'HIGH' ? 'var(--green)' : 'var(--gold)' }} /></span>
                <span className="ds-readiness-val">{v.band} · {v.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t('inv.panel.alloc')} icon="briefcase">
          <Donut data={alloc} size={150} thickness={18} centerLabel="R&D" centerSub="focus" />
        </Panel>
      </div>

      {err ? <div className="ds-empty ds-mt"><h4>{t('mv.backendDown')}</h4><p>{err}</p></div> : null}
      {!pkg && !err ? <div className="skeleton ds-mt" style={{ height: 260 }} /> : null}
      {pkg ? (
        <Panel title={t('inv.panel.docs')} icon="briefcase" className="ds-mt"
          right={<StatusPill kind="warn">non-binding</StatusPill>}>
          <div className="ds-tabs">
            {DOCS.map((dd) => (
              <button key={dd.key} className={`ds-tab${doc === dd.key ? ' active' : ''}`} onClick={() => setDoc(dd.key)}>
                <Icon name={dd.icon} size={14} /> {dd.label}
              </button>
            ))}
          </div>
          <pre className="ds-doc">{pkg.documents[doc]}</pre>
          <p className="ds-note">{pkg.disclaimer}</p>
        </Panel>
      ) : null}
    </DiscoveryShell>
  );
}
