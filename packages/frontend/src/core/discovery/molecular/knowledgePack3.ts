import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * KIMI KNOWLEDGE PACK #3 — normalized excerpt supplied for Genesis ingestion.
 *
 * These are source-attributed records, not silently VERIFIED records. The pack
 * contains DOI/PMID and assay metadata, but Genesis keeps validation status
 * explicit until each source/value is independently checked against the paper.
 */
export const KNOWLEDGE_PACK_3_VERSION = '3.0.0-excerpt';
export type Pack3ValidationStatus = 'NOT_YET_VERIFIED';
export type Pack3EvidenceKind = 'NEGATIVE' | 'MECHANISTIC_DISTINCTION' | 'PRIMARY_COMPARISON';

export interface KnowledgePack3Record {
  compound: string;
  target: string;
  targetSubunit: string | null;
  assay: string;
  assayType: string;
  parameter: string;
  value: string;
  unit: string | null;
  model: string;
  species: string;
  cellLine: string | null;
  concentration: string | null;
  mechanism: string;
  evidenceType: string;
  comparability: 'SAME_ASSAY_COMPARABLE';
  source: string;
  sourceType: 'Primary';
  doi: string | null;
  pmid: string | null;
  limitations: string;
  notes: string;
  kind: Pack3EvidenceKind;
  validationStatus: Pack3ValidationStatus;
}

const primary = (record: Omit<KnowledgePack3Record, 'sourceType' | 'validationStatus'>): KnowledgePack3Record => ({
  ...record,
  sourceType: 'Primary',
  validationStatus: 'NOT_YET_VERIFIED',
});

export const KNOWLEDGE_PACK_3_RECORDS: readonly KnowledgePack3Record[] = [
  primary({ compound: 'Butylone', target: 'DAT', targetSubunit: 'hDAT', assay: 'HEK293 efflux + monensin', assayType: 'Functional', parameter: 'Release', value: 'NO_RELEASE', unit: null, model: 'HEK293 recombinant', species: 'Human', cellLine: 'HEK293', concentration: '10 µM', mechanism: 'NOT a substrate', evidenceType: 'Negative result', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Saha 2018', doi: '10.1016/j.neuropharm.2017.07.026', pmid: '28755886', limitations: 'Cathinone analog', notes: 'No [³H]MPP⁺ efflux; monensin did not enhance', kind: 'NEGATIVE' }),
  primary({ compound: 'Pentylone', target: 'DAT', targetSubunit: 'hDAT', assay: 'HEK293 efflux + monensin', assayType: 'Functional', parameter: 'Release', value: 'NO_RELEASE', unit: null, model: 'HEK293 recombinant', species: 'Human', cellLine: 'HEK293', concentration: '10 µM', mechanism: 'NOT a substrate', evidenceType: 'Negative result', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Saha 2018', doi: '10.1016/j.neuropharm.2017.07.026', pmid: '28755886', limitations: 'Cathinone analog', notes: 'No [³H]MPP⁺ efflux; monensin did not enhance', kind: 'NEGATIVE' }),
  primary({ compound: 'Memantine', target: 'NMDAR', targetSubunit: null, assay: 'Patch-clamp AMPA/GABA', assayType: 'Functional', parameter: 'IC₅₀', value: 'NO_EFFECT', unit: null, model: 'Superior colliculus neuron', species: 'Rat', cellLine: null, concentration: '8 µM', mechanism: 'No AMPA/GABA block', evidenceType: 'Negative result', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Parsons 1993', doi: null, pmid: '8152525', limitations: '—', notes: 'Current responses to L-AMPA and GABA unaffected', kind: 'NEGATIVE' }),
  primary({ compound: 'Dextromethorphan', target: 'NMDAR', targetSubunit: null, assay: '[³H]TCP displacement', assayType: 'Binding', parameter: 'Ki', value: '780', unit: 'nM', model: 'Rat cortex', species: 'Rat', cellLine: null, concentration: null, mechanism: 'Weak NMDA binding', evidenceType: 'Low affinity', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Parsons 1995', doi: null, pmid: '8570022', limitations: '—', notes: 'Compared to MK-801 (2.6 nM); 300-fold lower affinity', kind: 'NEGATIVE' }),
  primary({ compound: 'Methylphenidate', target: 'SERT', targetSubunit: 'hSERT', assay: 'Uptake inhibition', assayType: 'Functional', parameter: 'Ki', value: '132.43', unit: 'µM', model: 'Intestine 407', species: 'Human', cellLine: 'Intestine 407', concentration: null, mechanism: 'Very weak SERT inhibition', evidenceType: 'Low potency', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Han 2006', doi: '10.1186/1471-2210-6-6', pmid: '16545100', limitations: '—', notes: '2000-fold less potent than at DAT', kind: 'NEGATIVE' }),
  primary({ compound: '4-MMC', target: 'VMAT2', targetSubunit: null, assay: '[³H]DA vesicular uptake', assayType: 'Functional', parameter: 'IC₅₀', value: '223', unit: 'µM', model: 'Human striatal vesicles', species: 'Human', cellLine: null, concentration: null, mechanism: 'Very weak VMAT2 inhibition', evidenceType: 'Low potency', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Pifl 2015', doi: '10.1016/j.ejphar.2015.03.004', pmid: '25771452', limitations: '—', notes: '10-fold weaker than MDMA at VMAT2', kind: 'NEGATIVE' }),
  primary({ compound: 'Diazepam', target: 'GABA-A (α1-mediated)', targetSubunit: 'α1β2γ2', assay: 'Plethysmography α1H101R', assayType: 'Functional in vivo', parameter: 'Effect', value: 'ABOLISHED', unit: null, model: 'α1H101R knock-in mouse', species: 'Mouse', cellLine: null, concentration: null, mechanism: 'α1-subunit required', evidenceType: 'Falsification', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Masneuf 2012', doi: '10.1111/j.1476-5381.2012.01973.x', pmid: '22568656', limitations: '—', notes: 'Respiratory effect abolished in α1H101R mutant', kind: 'NEGATIVE' }),
  primary({ compound: 'Diazepam', target: 'GABA-A (α2-mediated)', targetSubunit: 'α2β3γ2', assay: 'Plethysmography α2H101R', assayType: 'Functional in vivo', parameter: 'Effect', value: 'ABOLISHED', unit: null, model: 'α2H101R knock-in mouse', species: 'Mouse', cellLine: null, concentration: null, mechanism: 'α2-subunit required', evidenceType: 'Falsification', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Masneuf 2012', doi: '10.1111/j.1476-5381.2012.01973.x', pmid: '22568656', limitations: '—', notes: 'Respiratory effect abolished in α2H101R mutant', kind: 'NEGATIVE' }),
  primary({ compound: 'Ketamine', target: 'NMDAR', targetSubunit: 'GluN1/2A', assay: 'Patch-clamp recovery', assayType: 'Functional', parameter: 'Desensitization effect', value: 'ACCELERATES', unit: null, model: 'tsA201 recombinant', species: 'Rat', cellLine: 'tsA201', concentration: null, mechanism: 'Decreases desensitized state occupancy', evidenceType: 'Mechanistic distinction', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Glasgow 2017', doi: '10.1523/JNEUROSCI.0583-17.2017', pmid: '28747362', limitations: '—', notes: 'Opposite to memantine which stabilizes desensitization', kind: 'MECHANISTIC_DISTINCTION' }),
];

export function listKnowledgePack3Records(): readonly KnowledgePack3Record[] { return KNOWLEDGE_PACK_3_RECORDS; }
export function knowledgePack3EvidenceRefs(): readonly TargetEvidenceRef[] {
  return KNOWLEDGE_PACK_3_RECORDS.map((record) => ({
    source: 'LITERATURE',
    identifier: record.doi ? `doi:${record.doi}` : `pmid:${record.pmid}`,
    establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value}; ${record.assay}. Pack validation status: ${record.validationStatus}.`,
  }));
}
export function knowledgePack3RecordsFor(compounds: readonly string[]): readonly KnowledgePack3Record[] {
  const wanted = new Set(compounds.map((compound) => compound.toLowerCase()));
  return KNOWLEDGE_PACK_3_RECORDS.filter((record) => wanted.has(record.compound.toLowerCase()));
}
