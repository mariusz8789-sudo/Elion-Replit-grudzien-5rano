/**
 * moleculeInterpretation — deterministic, practical notes derived ONLY from
 * RDKit-verified property values (Grounded Chemistry Assistant, Stage 4).
 *
 * This is NOT AI and NOT a new computation: it is a rule-based reading of numbers
 * RDKit already produced (Lipinski / LogP / TPSA / H-bond thresholds). Every note is
 * a factual consequence of a verified value, so it carries the status "⚠ Verified by
 * Grounding Layer" (grounded in verified facts, not fabricated). Pure + unit-tested.
 */
import { t } from './i18n';

export interface MoleculeProps {
  molWt: number; logP: number; tpsa: number; hbd: number; hba: number;
  lipinskiViolations: number; lipinskiPass: boolean;
}

export interface InterpretationNote { text: string; basis: string }

const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

/** Rule-based practical notes (concise, no essay, no marketing). Text via the i18n seam. */
export function interpretMolecule(p: MoleculeProps): InterpretationNote[] {
  const notes: InterpretationNote[] = [];

  notes.push(p.lipinskiPass
    ? { text: t('mi.lipinski.pass', { viol: p.lipinskiViolations }), basis: 'lipinskiPass' }
    : { text: t('mi.lipinski.fail', { viol: p.lipinskiViolations }), basis: 'lipinskiViolations' });

  const logP = p.logP;
  if (logP < 0) notes.push({ text: t('mi.logp.veryHydrophilic', { logP: f(logP) }), basis: 'logP' });
  else if (logP <= 3) notes.push({ text: t('mi.logp.balanced', { logP: f(logP) }), basis: 'logP' });
  else if (logP <= 5) notes.push({ text: t('mi.logp.lipophilic', { logP: f(logP) }), basis: 'logP' });
  else notes.push({ text: t('mi.logp.high', { logP: f(logP) }), basis: 'logP' });

  const tpsa = p.tpsa;
  if (tpsa < 90) notes.push({ text: t('mi.tpsa.low', { tpsa: f(tpsa, 1) }), basis: 'tpsa' });
  else if (tpsa <= 140) notes.push({ text: t('mi.tpsa.mid', { tpsa: f(tpsa, 1) }), basis: 'tpsa' });
  else notes.push({ text: t('mi.tpsa.high', { tpsa: f(tpsa, 1) }), basis: 'tpsa' });

  notes.push(p.hbd <= 5 && p.hba <= 10
    ? { text: t('mi.hbond.inRo5', { hbd: p.hbd, hba: p.hba }), basis: 'hbd,hba' }
    : { text: t('mi.hbond.outRo5', { hbd: p.hbd, hba: p.hba }), basis: 'hbd,hba' });

  return notes;
}

export type VerificationStatus = 'RDKIT' | 'GROUNDING' | 'NOT_VERIFIED';
export interface VerificationRow { label: string; value: string; status: VerificationStatus }

/** Map every displayed fact to its verification status — nothing is shown without one. */
export function verificationRows(report: {
  inchiKey: string | null; molecularFormula: string; props: MoleculeProps; notes: InterpretationNote[];
}): VerificationRow[] {
  const p = report.props;
  const rdkit = (label: string, value: string): VerificationRow => ({ label, value, status: 'RDKIT' });
  const rows: VerificationRow[] = [
    rdkit('InChIKey', report.inchiKey ?? '—'),
    rdkit(t('mi.row.formula'), report.molecularFormula),
    rdkit(t('mi.row.molWt'), `${f(p.molWt)} g/mol`),
    rdkit('LogP', String(f(p.logP))),
    rdkit('TPSA', `${f(p.tpsa, 1)} Å²`),
    rdkit('HBD / HBA', `${p.hbd} / ${p.hba}`),
    rdkit(t('mi.row.lipinski'), p.lipinskiPass ? t('mi.row.lipinski.pass', { viol: p.lipinskiViolations }) : t('mi.row.lipinski.fail', { viol: p.lipinskiViolations })),
  ];
  for (const n of report.notes) rows.push({ label: t('mi.row.interpretation'), value: n.text, status: 'GROUNDING' });
  return rows;
}
