/**
 * moleculeInterpretation — deterministic, practical notes derived ONLY from
 * RDKit-verified property values (Grounded Chemistry Assistant, Stage 4).
 *
 * This is NOT AI and NOT a new computation: it is a rule-based reading of numbers
 * RDKit already produced (Lipinski / LogP / TPSA / H-bond thresholds). Every note is
 * a factual consequence of a verified value, so it carries the status "⚠ Verified by
 * Grounding Layer" (grounded in verified facts, not fabricated). Pure + unit-tested.
 */
export interface MoleculeProps {
  molWt: number; logP: number; tpsa: number; hbd: number; hba: number;
  lipinskiViolations: number; lipinskiPass: boolean;
}

export interface InterpretationNote { text: string; basis: string }

const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

/** Rule-based practical notes (concise, no essay, no marketing). */
export function interpretMolecule(p: MoleculeProps): InterpretationNote[] {
  const notes: InterpretationNote[] = [];

  notes.push(p.lipinskiPass
    ? { text: `Zgodny z regułą Lipinskiego (${p.lipinskiViolations} naruszeń) — profil drug-like dla podania doustnego.`, basis: 'lipinskiPass' }
    : { text: `Narusza regułę Lipinskiego (${p.lipinskiViolations} naruszeń) — podwyższone ryzyko słabej biodostępności doustnej.`, basis: 'lipinskiViolations' });

  const logP = p.logP;
  if (logP < 0) notes.push({ text: `Bardzo hydrofilowy (LogP ${f(logP)}) — możliwa słaba permeacja przez błony.`, basis: 'logP' });
  else if (logP <= 3) notes.push({ text: `Zrównoważona lipofilowość (LogP ${f(logP)}) — korzystny zakres.`, basis: 'logP' });
  else if (logP <= 5) notes.push({ text: `Lipofilowy (LogP ${f(logP)}) — dobra permeacja, zwróć uwagę na rozpuszczalność.`, basis: 'logP' });
  else notes.push({ text: `Wysoka lipofilowość (LogP ${f(logP)} > 5) — ryzyko słabej rozpuszczalności.`, basis: 'logP' });

  const tpsa = p.tpsa;
  if (tpsa < 90) notes.push({ text: `TPSA ${f(tpsa, 1)} Å² — sprzyja absorpcji doustnej; potencjał przenikania BBB (< 90).`, basis: 'tpsa' });
  else if (tpsa <= 140) notes.push({ text: `TPSA ${f(tpsa, 1)} Å² — absorpcja doustna prawdopodobna, przenikanie BBB mało prawdopodobne.`, basis: 'tpsa' });
  else notes.push({ text: `TPSA ${f(tpsa, 1)} Å² (> 140) — przewidywana słaba permeacja bierna.`, basis: 'tpsa' });

  notes.push(p.hbd <= 5 && p.hba <= 10
    ? { text: `Donory/akceptory wiązań H w granicach Ro5 (HBD ${p.hbd} ≤ 5, HBA ${p.hba} ≤ 10).`, basis: 'hbd,hba' }
    : { text: `Donory/akceptory wiązań H poza Ro5 (HBD ${p.hbd}, HBA ${p.hba}) — możliwy wpływ na permeację.`, basis: 'hbd,hba' });

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
    rdkit('Wzór sumaryczny', report.molecularFormula),
    rdkit('Masa molowa (MW)', `${f(p.molWt)} g/mol`),
    rdkit('LogP', String(f(p.logP))),
    rdkit('TPSA', `${f(p.tpsa, 1)} Å²`),
    rdkit('HBD / HBA', `${p.hbd} / ${p.hba}`),
    rdkit('Reguła Lipinskiego', p.lipinskiPass ? `pass (${p.lipinskiViolations})` : `${p.lipinskiViolations} naruszeń`),
  ];
  for (const n of report.notes) rows.push({ label: 'Interpretacja (reguły)', value: n.text, status: 'GROUNDING' });
  return rows;
}
