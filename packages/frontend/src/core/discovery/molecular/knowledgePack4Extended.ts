import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * Pack #4 extended import. Kimi's statuses are not trusted as Genesis
 * validation. Records below remain NOT_EXTRACTED until the exact primary value
 * is checked; no value is promoted merely because a DOI/PMID was supplied.
 */
export const KNOWLEDGE_PACK_4_EXTENDED_VERSION = '4.0.0-extended-unverified';
export type ExtendedValidationStatus = 'NOT_EXTRACTED' | 'NOT_AVAILABLE';
export type ExtendedComparability = 'SAME_ASSAY_COMPARABLE' | 'STANDALONE' | 'NOT_COMPARABLE';

export interface KnowledgePack4ExtendedRecord {
  compound: string;
  target: string;
  assay: string;
  assayType: string;
  parameter: string;
  value: string;
  unit: string;
  model: string;
  species: string;
  cellLine: string | null;
  mechanism: string;
  comparability: ExtendedComparability;
  source: string;
  doi: string | null;
  pmid: string | null;
  year: number | null;
  validationStatus: ExtendedValidationStatus;
  validationReason: string;
  limitations: string;
}

const unverified = (record: Omit<KnowledgePack4ExtendedRecord, 'validationStatus' | 'validationReason'>): KnowledgePack4ExtendedRecord => ({
  ...record,
  validationStatus: 'NOT_EXTRACTED',
  validationReason: 'Imported from external Pack #4 text; exact primary-source value and metadata are not independently verified by Genesis yet.',
});

const same = 'SAME_ASSAY_COMPARABLE' as const;
const citation = { source: 'Simmler et al. 2013', doi: null, pmid: null, year: 2013 };

export const KNOWLEDGE_PACK_4_EXTENDED_RECORDS: readonly KnowledgePack4ExtendedRecord[] = [
  ...[
    ['(S)-Ketamine', 'NMDAR', '[3H]MK-801 binding', 'Binding', 'Ki', '0.30', 'µM', 'Rat forebrain membranes', 'Rat', 'Active enantiomer'],
    ['(R)-Ketamine', 'NMDAR', '[3H]MK-801 binding', 'Binding', 'Ki', '1.4', 'µM', 'Rat forebrain membranes', 'Rat', 'Enantiomer'],
    ['(S)-Norketamine', 'NMDAR', '[3H]MK-801 binding', 'Binding', 'Ki', '1.7–2.25', 'µM', 'Rat forebrain membranes', 'Rat', 'Conflicting values across studies'],
    ['(R)-Norketamine', 'NMDAR', '[3H]MK-801 binding', 'Binding', 'Ki', '13–26.46', 'µM', 'Rat forebrain membranes', 'Rat', 'Conflicting values across studies'],
    ['(S)-Dehydronorketamine', 'NMDAR', '[3H]MK-801 binding', 'Binding', 'Ki', '38', 'µM', 'Rat forebrain membranes', 'Rat', 'Minimal NMDAR activity'],
    ['(R)-Dehydronorketamine', 'NMDAR', '[3H]MK-801 binding', 'Binding', 'Ki', '74', 'µM', 'Rat forebrain membranes', 'Rat', 'Minimal NMDAR activity'],
    ['(2S,6S)-Hydroxynorketamine', 'NMDAR', 'Whole-cell patch-clamp', 'Electrophysiology', 'IC50', '46', 'µM', 'Recombinant GluN1/GluN2A', 'Human', 'Low potency; different assay from binding records'],
  ].map(([compound, target, assay, assayType, parameter, value, unit, model, species, mechanism]) => unverified({ compound, target, assay, assayType, parameter, value, unit, model, species, cellLine: null, mechanism, comparability: 'NOT_COMPARABLE', ...({ source: 'Moaddel/Ebert/HNK sources', doi: null, pmid: '23446467', year: 2013 }), limitations: 'Cross-study or cross-assay values must not be averaged.' })),
  ...[
    ['3-MMC', 'DAT', 'Monoamine release', 'Release', 'EC50', '27', 'nM'], ['3-MMC', 'NET', 'Monoamine release', 'Release', 'EC50', '27', 'nM'], ['3-MMC', 'SERT', 'Monoamine release', 'Release', 'EC50', '268', 'nM'],
    ['3-MMC', 'DAT', '[125I]RTI-55 displacement', 'Binding', 'Ki', '6.33', 'µM'], ['3-MMC', 'NET', '[125I]RTI-55 displacement', 'Binding', 'Ki', '2.85', 'µM'], ['3-MMC', 'SERT', '[125I]RTI-55 displacement', 'Binding', 'Ki', '7.9', 'µM'],
    ['4-MMC', 'DAT', '[125I]RTI-55 displacement', 'Binding', 'Ki', '4.80', 'µM'], ['4-MMC', 'NET', '[125I]RTI-55 displacement', 'Binding', 'Ki', '11.8', 'µM'], ['4-MMC', 'SERT', '[125I]RTI-55 displacement', 'Binding', 'Ki', '21.0', 'µM'],
    ['4-MMC', 'DAT', 'Uptake inhibition', 'Functional', 'IC50', '0.098', 'µM'], ['4-MMC', 'NET', 'Uptake inhibition', 'Functional', 'IC50', '0.0536', 'µM'], ['4-MMC', 'SERT', 'Uptake inhibition', 'Functional', 'IC50', '0.51', 'µM'],
    ['4-MMC', 'DAT', 'Monoamine release', 'Release', 'EC50', '1.19', 'µM'], ['4-MMC', 'NET', 'Monoamine release', 'Release', 'EC50', '0.41', 'µM'], ['4-MMC', 'SERT', 'Monoamine release', 'Release', 'EC50', '11.9', 'µM'],
    ['4-MMC', 'VMAT2', '[3H]DHTB displacement', 'Binding', 'Ki', '1000', 'µM'], ['4-MMC', 'VMAT2', '[3H]5-HT uptake', 'Functional', 'IC50', '115.7', 'µM'],
  ].map(([compound, target, assay, assayType, parameter, value, unit]) => unverified({ compound, target, assay, assayType, parameter, value, unit, model: 'Human transporter or striatal preparation', species: 'Human', cellLine: 'HEK293', mechanism: 'As stated in supplied Pack #4; not independently validated', comparability: same, ...citation, limitations: 'Exact primary-source extraction remains outstanding; binding, uptake, and release are separate measurements.' })),
];

export function listKnowledgePack4ExtendedRecords(): readonly KnowledgePack4ExtendedRecord[] { return KNOWLEDGE_PACK_4_EXTENDED_RECORDS; }
export function knowledgePack4ExtendedEvidenceRefs(): readonly TargetEvidenceRef[] {
  return KNOWLEDGE_PACK_4_EXTENDED_RECORDS.map((record) => ({ source: 'LITERATURE', identifier: record.pmid ? `pmid:${record.pmid}` : record.doi ? `doi:${record.doi}` : `source:${record.source}`, establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value} ${record.unit}; validation=${record.validationStatus}.` }));
}
