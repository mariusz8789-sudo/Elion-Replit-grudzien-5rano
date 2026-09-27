/**
 * MoleculeReport (Stage 4) — the single report screen for the Grounded Chemistry
 * Assistant. Sections: Molecule · Structure (2D/3D) · Molecular Properties · AI
 * Interpretation · Verification. Every claim carries a status badge (RDKit /
 * Grounding Layer / Not Verified) — nothing is shown without one.
 *
 * Pure reuse: MoleculeViewer (2D SVG + 3D), Panel/StatCard/StatusPill/Icon, and the
 * deterministic moleculeInterpretation rules. No new computation or endpoint. The
 * `.print-report` root + print CSS make "Export PDF" a dependency-free browser print.
 */
import { MoleculeViewer } from '../discovery/MoleculeViewer';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import { verificationRows, type MoleculeProps, type InterpretationNote, type VerificationStatus } from '../../core/moleculeInterpretation';
import { buildDecisionReport } from '../../core/scientificDecision';
import { PROVENANCE_KEYS, type ReproMeta } from '../../core/provenance';
import { ScientificDecisionPanel, ResearchSupportPanel, TransparencyPanel, ReproducibilityPanel, ProvenancePanel } from './DecisionReport';
import { useI18n } from '../../core/i18n';

export interface ReportData {
  name: string;
  smiles: string;
  inchiKey: string | null;
  molecularFormula: string;
  props: MoleculeProps;
  notes: InterpretationNote[];
  alerts?: string[]; // RDKit structural-alert names (Stage 5 decision input)
}
export interface AiInterpretation { available: boolean; text?: string; unavailableReason?: string }
/** Reproducibility + provenance context (Stage 5). Optional so pre-Stage-5 saved reports still render. */
export interface ReportMeta { rdkitVersion: string; repro: ReproMeta }

const STATUS_PILL: Record<VerificationStatus, { kind: 'ok' | 'warn' | 'blocked'; labelKey: string; icon: 'check' | 'alert' | 'block' }> = {
  RDKIT: { kind: 'ok', labelKey: 'rep.status.rdkit', icon: 'check' },
  GROUNDING: { kind: 'warn', labelKey: 'rep.status.grounding', icon: 'alert' },
  NOT_VERIFIED: { kind: 'blocked', labelKey: 'rep.status.notVerified', icon: 'block' },
};
const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

export function MoleculeReport({ data, ai, meta, onExport }: { data: ReportData; ai: AiInterpretation; meta?: ReportMeta; onExport?: () => void }) {
  const { t } = useI18n();
  const p = data.props;
  const rows = verificationRows({ inchiKey: data.inchiKey, molecularFormula: data.molecularFormula, props: p, notes: data.notes });
  const decision = buildDecisionReport(p, data.alerts ?? []);

  return (
    <div className="print-report">
      <div className="report-print-title" aria-hidden="true">{t('rep.printTitle')}</div>

      {/* Molecule */}
      <Panel title={t('rep.molecule')} icon="molecule" right={<StatusPill kind="ok"><Icon name="check" size={12} /> RDKit</StatusPill>}>
        <dl className="ds-defs">
          <div><dt>{t('rep.name')}</dt><dd>{data.name || data.molecularFormula}</dd></div>
          <div><dt>{t('rep.formula')}</dt><dd>{data.molecularFormula}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>SMILES</dt><dd className="ds-mono" style={{ wordBreak: 'break-all' }}>{data.smiles}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>InChIKey</dt><dd className="ds-mono">{data.inchiKey ?? '—'}</dd></div>
        </dl>
      </Panel>

      {/* Structure */}
      <Panel title={t('rep.structure')} icon="atom" className="ds-mt" right={<StatusPill kind="ok"><Icon name="check" size={12} /> RDKit</StatusPill>}>
        <MoleculeViewer smiles={data.smiles} title={data.molecularFormula} />
      </Panel>

      {/* Molecular Properties */}
      <Panel title={t('rep.props')} icon="chart" className="ds-mt" right={<StatusPill kind="ok"><Icon name="check" size={12} /> {t('rep.status.rdkit')}</StatusPill>}>
        <div className="ds-grid ds-grid-4">
          <StatCard label="MW" value={`${f(p.molWt)}`} sub="g/mol" accent="var(--cyan)" />
          <StatCard label="LogP" value={f(p.logP)} sub="Crippen" accent="var(--violet)" />
          <StatCard label="TPSA" value={f(p.tpsa, 1)} sub="Å²" accent="var(--gold)" />
          <StatCard label="Lipinski" value={p.lipinskiPass ? 'PASS' : `${p.lipinskiViolations} ${t('rep.viol')}`} sub="Ro5" accent={p.lipinskiPass ? 'var(--green)' : 'var(--red)'} />
          <StatCard label="HBD" value={p.hbd} sub={t('rep.sub.hDonors')} accent="var(--cyan)" />
          <StatCard label="HBA" value={p.hba} sub={t('rep.sub.hAcceptors')} accent="var(--cyan)" />
        </div>
      </Panel>

      {/* Scientific Decision Engine (Stage 5) — what is verified / promising / unknown / needs validation. */}
      <ScientificDecisionPanel decision={decision} />
      <ResearchSupportPanel decision={decision} />

      {/* AI Interpretation */}
      <Panel title={t('rep.ai')} icon="brain" className="ds-mt"
        right={ai.available ? <StatusPill kind="ok">grounded</StatusPill> : <StatusPill kind="blocked">{t('rep.ai.unavailable')}</StatusPill>}>
        {ai.available && ai.text ? (
          <p className="ds-para">{ai.text}</p>
        ) : (
          <div className="ds-callout"><Icon name="alert" size={15} /> {t('rep.ai.notConfigured.a', { reason: ai.unavailableReason ?? t('rep.ai.noKey') })}<strong>{t('rep.ai.notConfigured.b')}</strong>{t('rep.ai.notConfigured.c')}<strong>{t('rep.ai.notConfigured.d')}</strong>{t('rep.ai.notConfigured.e')}</div>
        )}
        <h5 className="ds-sub-h">{t('rep.ai.practical')}</h5>
        <ul className="report-notes">
          {data.notes.map((n, i) => (
            <li key={i}><StatusPill kind="warn"><Icon name="alert" size={11} /> Grounding</StatusPill> {n.text}</li>
          ))}
        </ul>
      </Panel>

      {/* Verification */}
      <Panel title={t('rep.verification')} icon="shield" className="ds-mt" right={<StatusPill kind="info">{t('rep.eachClaimStatus')}</StatusPill>}>
        <div className="ds-table-wrap">
          <table className="ds-table report-verify">
            <thead><tr><th>{t('rep.th.claim')}</th><th>{t('rep.th.value')}</th><th>{t('rep.th.status')}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const s = STATUS_PILL[r.status];
                return (
                  <tr key={i}>
                    <td className="ds-dim">{r.label}</td>
                    <td>{r.value}</td>
                    <td><StatusPill kind={s.kind}><Icon name={s.icon} size={11} /> {t(s.labelKey)}</StatusPill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ds-note ds-mt">{t('rep.legend')}</p>
      </Panel>

      {/* Provenance + Transparency + Reproducibility (Stage 5). */}
      {meta ? <ProvenancePanel keys={PROVENANCE_KEYS} engineVersion={meta.rdkitVersion} timestamp={meta.repro.generatedAt} /> : null}
      <TransparencyPanel decision={decision} />
      {meta ? <ReproducibilityPanel repro={meta.repro} /> : null}

      {onExport ? (
        <div className="report-actions">
          <button className="ds-btn ds-btn-primary" onClick={onExport}><Icon name="book" size={15} /> {t('rep.exportPdf')}</button>
        </div>
      ) : null}
    </div>
  );
}
