/**
 * LaboratoryReadinessScreen (V5) — interactive, REAL RDKit-backed wet-lab hand-off.
 * Enter a SMILES → /api/science/laboratory-readiness computes InChI/InChIKey, mass,
 * physchem properties, structural alerts, predicted off-targets, and PROPOSED
 * in-vitro / in-vivo / clinical plans. Every experimental item is a PROPOSAL_ONLY.
 */
import { useEffect, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { RadarChart } from '../charts/Charts';
import { Icon } from '../Icon';
import { MoleculeViewer } from './MoleculeViewer';
import { buildLabReadiness, type LabReadiness } from '../../core/backend/client';
import { useI18n } from '../../core/i18n';

const EXAMPLES: { nameKey: string; smiles: string }[] = [
  { nameKey: 'asst.ex.aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { nameKey: 'asst.ex.ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1' },
  { nameKey: 'asst.ex.paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1' },
  { nameKey: 'asst.ex.caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
];

export function LaboratoryReadinessScreen() {
  const { t } = useI18n();
  const [smiles, setSmiles] = useState(EXAMPLES[0].smiles);
  const [data, setData] = useState<LabReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = (s: string) => {
    setLoading(true); setErr(null);
    buildLabReadiness(s).then((r) => {
      setLoading(false);
      if (r.ok) setData(r.data); else setErr(r.message);
    });
  };
  // Run once on mount with the default example; `run` is stable enough for this screen.
  useEffect(() => { run(EXAMPLES[0].smiles); }, []);

  const d = data?.dossier;
  const props = d?.properties ?? {};
  const radar = d ? [
    { label: 'Drug-like', value: d.properties.lipinskiPass ? 1 : 0.4 },
    { label: 'logP', value: clamp01((5 - Math.abs(Number(props.logP ?? 3) - 2.5)) / 5) },
    { label: 'TPSA', value: clamp01(1 - Math.abs(Number(props.tpsa ?? 90) - 75) / 140) },
    { label: 'HBD', value: clamp01(1 - Number(props.hbd ?? 2) / 5) },
    { label: 'HBA', value: clamp01(1 - Number(props.hba ?? 5) / 10) },
    { label: 'Csp3', value: clamp01(Number(props.fractionCsp3 ?? 0.3)) },
  ] : [];

  return (
    <DiscoveryShell active="#/lab-readiness" title="Laboratory Readiness" subtitle={t('lr.subtitle')}
      actions={<StatusPill kind="info">COMPUTATIONAL_CANDIDATE · NOT A DRUG</StatusPill>}>
      <Panel title={t('lr.panel.candidate')} icon="molecule">
        <div className="ds-input-row">
          <input value={smiles} onChange={(e) => setSmiles(e.target.value)} placeholder={t('lr.smilesPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') run(smiles); }} spellCheck={false} />
          <button className="ds-btn ds-btn-primary" onClick={() => run(smiles)} disabled={loading}>{loading ? t('asst.busy') : t('asst.analyze')}</button>
        </div>
        <div className="ds-chips">
          {EXAMPLES.map((ex) => { const exName = t(ex.nameKey); return <button key={ex.nameKey} className="ds-chip" onClick={() => { setSmiles(ex.smiles); run(ex.smiles); }}>{exName}</button>; })}
        </div>
      </Panel>

      {err ? <div className="ds-empty ds-mt"><h4>{t('mv.backendDown')}</h4><p>{err}</p></div> : null}
      {loading && !d ? <div className="skeleton ds-mt" style={{ height: 200 }} /> : null}
      {data && data.status !== 'COMPLETED' && !loading ? (
        <div className="ds-empty ds-mt"><Icon name="alert" size={26} className="ds-empty-icon" /><h4>{data.status}</h4><p>{data.reason ?? t('lr.invalidReason')}</p></div>
      ) : null}

      {d ? (
        <>
          <Panel title={t('lr.panel.structure')} icon="molecule" className="ds-mt" right={<StatusPill kind="info">2D / 3D</StatusPill>}>
            <MoleculeViewer smiles={d.identity.smiles} title={d.proposedStructure.molecularFormula} />
          </Panel>

          <div className="ds-grid ds-grid-2 ds-mt">
            <Panel title={t('lr.panel.identity')} icon="target">
              <dl className="ds-defs">
                <div><dt>{t('rep.formula')}</dt><dd>{d.proposedStructure.molecularFormula}</dd></div>
                <div><dt>InChIKey</dt><dd className="ds-mono">{d.identity.inchiKey ?? '—'}</dd></div>
                <div><dt>{t('lr.massAvg')}</dt><dd>{d.mass.averageMolWt.toFixed(2)} g/mol</dd></div>
                <div><dt>{t('lr.massExact')}</dt><dd>{d.mass.exactMolWt.toFixed(4)}</dd></div>
                <div><dt>logP / TPSA</dt><dd>{Number(props.logP).toFixed(2)} / {Number(props.tpsa).toFixed(1)}</dd></div>
                <div><dt>Lipinski</dt><dd>{props.lipinskiPass ? <StatusPill kind="ok">pass</StatusPill> : <StatusPill kind="warn">{Number(props.lipinskiViolations)} {t('rep.viol')}</StatusPill>}</dd></div>
              </dl>
              {d.structuralAlerts && d.structuralAlerts.length > 0 ? (
                <p className="ds-note">{t('lr.alerts')}{d.structuralAlerts.map((a) => a.name).join(', ')}</p>
              ) : <p className="ds-note">{t('lr.noAlerts')}</p>}
            </Panel>
            <Panel title={t('lr.panel.physchem')} icon="chart" right={<StatusPill kind="info">RDKit</StatusPill>}>
              <div style={{ display: 'flex', justifyContent: 'center' }}><RadarChart axes={radar} size={230} /></div>
            </Panel>
          </div>

          <Panel title={t('lr.panel.rationale')} icon="brain" className="ds-mt"><p className="ds-para">{d.rationale}</p></Panel>

          <div className="ds-grid ds-grid-2 ds-mt">
            <Panel title={t('lr.panel.invitro')} icon="flask" right={<StatusPill kind="warn">PROPOSAL</StatusPill>}>
              <ol className="ds-ol">{d.proposedInVitroTests.map((test, i) => <li key={i}>{test}</li>)}</ol>
            </Panel>
            <Panel title={t('lr.panel.invivo')} icon="dna" right={<StatusPill kind="warn">PROPOSAL</StatusPill>}>
              <ol className="ds-ol">{d.proposedInVivoTests.map((test, i) => <li key={i}>{test}</li>)}</ol>
            </Panel>
          </div>

          <Panel title={t('lr.panel.clinical')} icon="clock" className="ds-mt" right={<StatusPill kind="warn">{d.proposedClinicalPlan.status}</StatusPill>}>
            <p className="ds-note">{d.proposedClinicalPlan.note}</p>
            <ol className="ds-ol">{d.proposedClinicalPlan.outline.map((o, i) => <li key={i}>{o}</li>)}</ol>
            <p className="ds-note ds-mt">{d.honesty}</p>
          </Panel>
        </>
      ) : null}
    </DiscoveryShell>
  );
}

function clamp01(x: number) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }
