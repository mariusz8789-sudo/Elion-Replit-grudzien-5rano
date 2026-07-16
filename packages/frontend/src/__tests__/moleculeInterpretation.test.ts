/**
 * moleculeInterpretation (Stage 4) — deterministic rule-based notes + verification
 * mapping. Every note is a consequence of a verified value; every displayed fact
 * carries a status (nothing statusless).
 */
import { describe, expect, it } from 'vitest';
import { interpretMolecule, verificationRows, type MoleculeProps } from '../core/moleculeInterpretation';

const ASPIRIN: MoleculeProps = { molWt: 180.159, logP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, lipinskiViolations: 0, lipinskiPass: true };

describe('interpretMolecule', () => {
  it('is deterministic — same input, same notes', () => {
    expect(interpretMolecule(ASPIRIN)).toEqual(interpretMolecule(ASPIRIN));
  });
  it('reports drug-likeness, balanced LogP, good TPSA for aspirin', () => {
    const notes = interpretMolecule(ASPIRIN);
    expect(notes.some((n) => /Lipinskiego/.test(n.text) && /drug-like/.test(n.text))).toBe(true);
    expect(notes.some((n) => n.basis === 'logP' && /Zrównoważona/.test(n.text))).toBe(true);
    expect(notes.some((n) => n.basis === 'tpsa' && /absorpcji doustnej/.test(n.text))).toBe(true);
  });
  it('flags Lipinski violation and high logP', () => {
    const notes = interpretMolecule({ molWt: 620, logP: 6.2, tpsa: 160, hbd: 7, hba: 12, lipinskiViolations: 3, lipinskiPass: false });
    expect(notes.some((n) => /Narusza regułę Lipinskiego/.test(n.text))).toBe(true);
    expect(notes.some((n) => /Wysoka lipofilowość/.test(n.text))).toBe(true);
    expect(notes.some((n) => /słaba permeacja bierna/.test(n.text))).toBe(true);
    expect(notes.some((n) => /poza Ro5/.test(n.text))).toBe(true);
  });
});

describe('verificationRows', () => {
  const rows = verificationRows({ inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', molecularFormula: 'C9H8O4', props: ASPIRIN, notes: interpretMolecule(ASPIRIN) });
  it('marks every RDKit fact as RDKIT and every interpretation note as GROUNDING', () => {
    const facts = rows.filter((r) => r.label !== 'Interpretacja (reguły)');
    expect(facts.every((r) => r.status === 'RDKIT')).toBe(true);
    expect(rows.filter((r) => r.label === 'Interpretacja (reguły)').every((r) => r.status === 'GROUNDING')).toBe(true);
  });
  it('never emits a row without a status', () => {
    expect(rows.every((r) => r.status === 'RDKIT' || r.status === 'GROUNDING' || r.status === 'NOT_VERIFIED')).toBe(true);
  });
  it('surfaces the real InChIKey and formula', () => {
    expect(rows.find((r) => r.label === 'InChIKey')?.value).toBe('BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
    expect(rows.find((r) => r.label === 'Wzór sumaryczny')?.value).toBe('C9H8O4');
  });
});
