/**
 * dossierProps — the single mapping from an RDKit lab-readiness dossier to the
 * MoleculeProps used across the product (Assistant, Compare, Campaigns). Extracted so
 * there is ONE source of truth for reading verified descriptors — never recomputed.
 */
import type { LabReadiness } from './backend/client';
import type { MoleculeProps } from './moleculeInterpretation';

export function propsFromDossier(d: NonNullable<LabReadiness['dossier']>): MoleculeProps {
  const pr = d.properties;
  return {
    molWt: Number(d.mass.averageMolWt), logP: Number(pr.logP), tpsa: Number(pr.tpsa),
    hbd: Number(pr.hbd), hba: Number(pr.hba),
    lipinskiViolations: Number(pr.lipinskiViolations), lipinskiPass: Boolean(pr.lipinskiPass),
  };
}
