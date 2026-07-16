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

export interface ReportData {
  name: string;
  smiles: string;
  inchiKey: string | null;
  molecularFormula: string;
  props: MoleculeProps;
  notes: InterpretationNote[];
}
export interface AiInterpretation { available: boolean; text?: string; unavailableReason?: string }

const STATUS_PILL: Record<VerificationStatus, { kind: 'ok' | 'warn' | 'blocked'; label: string; icon: 'check' | 'alert' | 'block' }> = {
  RDKIT: { kind: 'ok', label: 'Verified by RDKit', icon: 'check' },
  GROUNDING: { kind: 'warn', label: 'Verified by Grounding Layer', icon: 'alert' },
  NOT_VERIFIED: { kind: 'blocked', label: 'Not Verified', icon: 'block' },
};
const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

export function MoleculeReport({ data, ai, onExport }: { data: ReportData; ai: AiInterpretation; onExport?: () => void }) {
  const p = data.props;
  const rows = verificationRows({ inchiKey: data.inchiKey, molecularFormula: data.molecularFormula, props: p, notes: data.notes });

  return (
    <div className="print-report">
      <div className="report-print-title" aria-hidden="true">Verified Computational Report — Genesis</div>

      {/* Molecule */}
      <Panel title="Molecule" icon="molecule" right={<StatusPill kind="ok"><Icon name="check" size={12} /> RDKit</StatusPill>}>
        <dl className="ds-defs">
          <div><dt>Nazwa</dt><dd>{data.name || data.molecularFormula}</dd></div>
          <div><dt>Wzór</dt><dd>{data.molecularFormula}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>SMILES</dt><dd className="ds-mono" style={{ wordBreak: 'break-all' }}>{data.smiles}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>InChIKey</dt><dd className="ds-mono">{data.inchiKey ?? '—'}</dd></div>
        </dl>
      </Panel>

      {/* Structure */}
      <Panel title="Structure" icon="atom" className="ds-mt" right={<StatusPill kind="ok"><Icon name="check" size={12} /> RDKit</StatusPill>}>
        <MoleculeViewer smiles={data.smiles} title={data.molecularFormula} />
      </Panel>

      {/* Molecular Properties */}
      <Panel title="Molecular Properties" icon="chart" className="ds-mt" right={<StatusPill kind="ok"><Icon name="check" size={12} /> Verified by RDKit</StatusPill>}>
        <div className="ds-grid ds-grid-4">
          <StatCard label="MW" value={`${f(p.molWt)}`} sub="g/mol" accent="var(--cyan)" />
          <StatCard label="LogP" value={f(p.logP)} sub="Crippen" accent="var(--violet)" />
          <StatCard label="TPSA" value={f(p.tpsa, 1)} sub="Å²" accent="var(--gold)" />
          <StatCard label="Lipinski" value={p.lipinskiPass ? 'PASS' : `${p.lipinskiViolations} viol.`} sub="Ro5" accent={p.lipinskiPass ? 'var(--green)' : 'var(--red)'} />
          <StatCard label="HBD" value={p.hbd} sub="donory H" accent="var(--cyan)" />
          <StatCard label="HBA" value={p.hba} sub="akceptory H" accent="var(--cyan)" />
        </div>
      </Panel>

      {/* AI Interpretation */}
      <Panel title="AI Interpretation" icon="brain" className="ds-mt"
        right={ai.available ? <StatusPill kind="ok">grounded</StatusPill> : <StatusPill kind="blocked">AI niedostępne</StatusPill>}>
        {ai.available && ai.text ? (
          <p className="ds-para">{ai.text}</p>
        ) : (
          <div className="ds-callout"><Icon name="alert" size={15} /> Interpretacja modelu AI nie jest skonfigurowana w tym wdrożeniu ({ai.unavailableReason ?? 'brak klucza modelu'}). Genesis <strong>nie pokazuje interpretacji AI bez modelu</strong>. Poniżej praktyczne wnioski wyprowadzone <strong>deterministycznie z faktów RDKit</strong> (Grounding Layer).</div>
        )}
        <h5 className="ds-sub-h">Praktyczne wnioski (reguły na zweryfikowanych faktach)</h5>
        <ul className="report-notes">
          {data.notes.map((n, i) => (
            <li key={i}><StatusPill kind="warn"><Icon name="alert" size={11} /> Grounding</StatusPill> {n.text}</li>
          ))}
        </ul>
      </Panel>

      {/* Verification */}
      <Panel title="Verification" icon="shield" className="ds-mt" right={<StatusPill kind="info">każde twierdzenie ma status</StatusPill>}>
        <div className="ds-table-wrap">
          <table className="ds-table report-verify">
            <thead><tr><th>Twierdzenie</th><th>Wartość</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const s = STATUS_PILL[r.status];
                return (
                  <tr key={i}>
                    <td className="ds-dim">{r.label}</td>
                    <td>{r.value}</td>
                    <td><StatusPill kind={s.kind}><Icon name={s.icon} size={11} /> {s.label}</StatusPill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ds-note ds-mt">✅ Verified by RDKit — obliczone realnym silnikiem. ⚠ Verified by Grounding Layer — wyprowadzone deterministycznie z faktów RDKit. ❌ Not Verified — niepotwierdzone (nie pokazujemy takich wartości jako faktów).</p>
      </Panel>

      {onExport ? (
        <div className="report-actions">
          <button className="ds-btn ds-btn-primary" onClick={onExport}><Icon name="book" size={15} /> Export PDF</button>
        </div>
      ) : null}
    </div>
  );
}
