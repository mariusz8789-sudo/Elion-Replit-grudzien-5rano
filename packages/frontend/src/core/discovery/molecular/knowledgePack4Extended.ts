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

export interface KnowledgePack4ConflictRecord {
  compound: string;
  target: string;
  parameter: string;
  studyA: { source: string; value: string; assay: string; model: string; species: string };
  studyB: { source: string; value: string; assay: string; model: string; species: string };
  comparability: 'NOT_COMPARABLE' | 'CONFLICTING';
  possibleExplanation: string;
}

export const KNOWLEDGE_PACK_4_CONFLICTS: readonly KnowledgePack4ConflictRecord[] = [
  { compound: '(S)-Norketamine', target: 'NMDAR', parameter: 'Ki', studyA: { source: 'Ebert 1997', value: '1.7 µM', assay: '[3H]MK-801 binding', model: 'Rat forebrain membranes', species: 'Rat' }, studyB: { source: 'Moaddel 2013', value: '2.25 µM', assay: '[3H]MK-801 binding', model: 'Rat forebrain membranes', species: 'Rat' }, comparability: 'CONFLICTING', possibleExplanation: 'Different study batches or conditions; retain both values and do not average.' },
  { compound: '(R)-Norketamine', target: 'NMDAR', parameter: 'Ki', studyA: { source: 'Ebert 1997', value: '13 µM', assay: '[3H]MK-801 binding', model: 'Rat forebrain membranes', species: 'Rat' }, studyB: { source: 'Moaddel 2013', value: '26.46 µM', assay: '[3H]MK-801 binding', model: 'Rat forebrain membranes', species: 'Rat' }, comparability: 'CONFLICTING', possibleExplanation: 'Substantial cross-study discrepancy; source conditions must be examined before comparison.' },
];

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

/** Additional Pack #4 entries whose supplied values could not be independently extracted. */
export const KNOWLEDGE_PACK_4_REMAINING_RECORDS: readonly KnowledgePack4ExtendedRecord[] = [
  ...[
    ['3-CMC', 'DAT', 'Monoamine release', 'Release', 'EC50', '26', 'nM'], ['3-CMC', 'NET', 'Monoamine release', 'Release', 'EC50', '19', 'nM'], ['3-CMC', 'SERT', 'Monoamine release', 'Release', 'EC50', '211', 'nM'],
    ['3-CMC', 'DAT', 'Uptake inhibition', 'Functional', 'IC50', '342', 'nM'], ['3-CMC', 'NET', 'Uptake inhibition', 'Functional', 'IC50', '290', 'nM'], ['3-CMC', 'SERT', 'Uptake inhibition', 'Functional', 'IC50', '1194', 'nM'],
  ].map(([compound, target, assay, assayType, parameter, value, unit]) => unverified({ compound, target, assay, assayType, parameter, value, unit, model: 'Not independently confirmed', species: 'Not independently confirmed', cellLine: null, mechanism: 'Supplied Pack #4 claim only', comparability: 'STANDALONE', source: 'Pack #4 / primary source not fully accessible', doi: null, pmid: null, year: null, limitations: 'Primary source was not independently accessible; retain as NOT_EXTRACTED.' })),
  ...[
    ['4-CMC', 'DAT', 'Binding / uptake / release', 'Multiple', 'NOT_AVAILABLE', 'NOT_AVAILABLE', '—'], ['4-CMC', 'NET', 'Binding / uptake / release', 'Multiple', 'NOT_AVAILABLE', 'NOT_AVAILABLE', '—'], ['4-CMC', 'SERT', 'Binding / uptake / release', 'Multiple', 'NOT_AVAILABLE', 'NOT_AVAILABLE', '—'],
    ['3-CMC', 'VMAT2', 'No verified assay in supplied pack', 'None', 'NOT_AVAILABLE', 'NOT_AVAILABLE', '—'], ['4-CMC', 'VMAT2', 'No verified assay in supplied pack', 'None', 'NOT_AVAILABLE', 'NOT_AVAILABLE', '—'],
  ].map(([compound, target, assay, assayType, parameter, value, unit]) => ({ ...unverified({ compound, target, assay, assayType, parameter, value, unit, model: '—', species: '—', cellLine: null, mechanism: 'No claim', comparability: 'NOT_COMPARABLE', source: 'Pack #4', doi: null, pmid: null, year: null, limitations: 'No independently verified primary value is available; no extrapolation performed.' }), validationStatus: 'NOT_AVAILABLE' as const, validationReason: 'No independently verified primary record was available in the supplied Pack #4 materials.' })),
  ...[
    ['Diazepam', 'GABA-A (BDZ site)', 'Radioligand binding', 'Ki', '15–17'], ['Midazolam', 'GABA-A (BDZ site)', 'Radioligand binding', 'Ki', '2–10'], ['Flunitrazepam', 'GABA-A (BDZ site)', 'Radioligand binding', 'Ki', '2–7 (α1/α2/α5); 15 (α3)'], ['Zolpidem', 'GABA-A (BDZ site)', 'Radioligand binding', 'Ki', '17 (α1); 290–360 (α2/α3/α5)'], ['Flumazenil', 'GABA-A (BDZ site)', 'Radioligand binding', 'Ki', '0.5–1.5'],
  ].map(([compound, target, assay, parameter, value]) => unverified({ compound, target, assay, assayType: 'Binding', parameter, value, unit: 'nM', model: 'Native or recombinant tissue as supplied', species: 'Rat', cellLine: null, mechanism: 'BDZ-site ligand', comparability: 'STANDALONE', source: 'Tan et al. 2011 / PMC4020178', doi: null, pmid: null, year: 2011, limitations: 'Pack citation and exact table extraction still require independent primary-source verification.' })),
];

export function listKnowledgePack4RemainingRecords(): readonly KnowledgePack4ExtendedRecord[] { return KNOWLEDGE_PACK_4_REMAINING_RECORDS; }
export function listAllKnowledgePack4ExtendedRecords(): readonly KnowledgePack4ExtendedRecord[] { return [...KNOWLEDGE_PACK_4_EXTENDED_RECORDS, ...KNOWLEDGE_PACK_4_REMAINING_RECORDS]; }

export function listKnowledgePack4ExtendedRecords(): readonly KnowledgePack4ExtendedRecord[] { return KNOWLEDGE_PACK_4_EXTENDED_RECORDS; }
export function knowledgePack4ExtendedEvidenceRefs(): readonly TargetEvidenceRef[] {
  return KNOWLEDGE_PACK_4_EXTENDED_RECORDS.map((record) => ({ source: 'LITERATURE', identifier: record.pmid ? `pmid:${record.pmid}` : record.doi ? `doi:${record.doi}` : `source:${record.source}`, establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value} ${record.unit}; validation=${record.validationStatus}.` }));
}
