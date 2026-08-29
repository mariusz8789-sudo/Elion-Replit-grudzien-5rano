import pubchemRecord from './pubchem-cid-2519.json';
import type { Compound } from '../biotechDiscoveryContract';

export const PUBCHEM_CID_2519_SOURCE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519/property/Title,CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON';
export const PUBCHEM_CID_2519_RETRIEVED_AT = '2026-08-29';

interface PubChemPropertyRow {
  CID: number;
  Title?: string;
  ConnectivitySMILES?: string;
  InChIKey?: string;
  MolecularFormula?: string;
  MolecularWeight?: string;
}

interface PubChemPropertyResponse {
  PropertyTable?: { Properties?: PubChemPropertyRow[] };
}

export interface PubChemMolecularProperties {
  molecularFormula: string;
  molecularWeight: string;
  canonicalSmiles: string;
  inchiKey: string;
}

export interface PubChemCompoundRecord {
  compound: Compound;
  properties: PubChemMolecularProperties;
  sourceUrl: string;
  sourceId: string;
  retrievedAt: string;
}

export function mapPinnedPubChemCaffeine(): PubChemCompoundRecord {
  const response = pubchemRecord as PubChemPropertyResponse;
  const row = response.PropertyTable?.Properties?.[0];
  if (!row || row.CID !== 2519 || !row.Title || !row.ConnectivitySMILES || !row.InChIKey || !row.MolecularFormula || !row.MolecularWeight) {
    throw new Error('Pinned PubChem fixture is incomplete or has an unexpected CID.');
  }
  const sourceId = `pubchem:CID:${row.CID}`;
  const properties: PubChemMolecularProperties = {
    molecularFormula: row.MolecularFormula,
    molecularWeight: row.MolecularWeight,
    canonicalSmiles: row.ConnectivitySMILES,
    inchiKey: row.InChIKey,
  };
  return {
    compound: {
      kind: 'compound', id: sourceId, namespace: 'pubchem', label: row.Title, status: 'OBSERVED',
      structureRef: row.ConnectivitySMILES, parentMaterialIds: [],
      provenance: [{
        source: 'PubChem PUG REST', sourceId, evidenceType: 'chemical identity and property record', status: 'OBSERVED',
        uncertainty: 'Chemical identity/properties only; this record does not establish biological activity or safety.',
        sourceUrl: PUBCHEM_CID_2519_SOURCE_URL, sourceVersion: 'PubChem CID 2519', retrievedAt: PUBCHEM_CID_2519_RETRIEVED_AT,
      }],
    },
    properties,
    sourceUrl: PUBCHEM_CID_2519_SOURCE_URL,
    sourceId,
    retrievedAt: PUBCHEM_CID_2519_RETRIEVED_AT,
  };
}
