import type { TargetEvidenceRef } from './targetHypothesis';

/** Pack #4 critical excerpt: same-assay human GluN1/GluN2A NMDAR comparison. */
export const KNOWLEDGE_PACK_4_VERSION = '4.0.0-critical-nmdar-excerpt';
export type Pack4ValidationStatus = 'VERIFIED' | 'NOT_EXTRACTED' | 'NOT_AVAILABLE';

export interface KnowledgePack4Record {
  compound: 'Ketamine' | 'Memantine';
  target: 'NMDAR';
  targetSubunit: 'GluN1/GluN2A';
  assay: 'Whole-cell patch-clamp';
  assayType: 'Electrophysiology';
  parameter: 'IC50' | 'Kon' | 'Koff' | 'delta';
  value: string;
  unit: 'µM' | 'M^-1s^-1' | 's^-1' | 'dimensionless';
  model: 'Recombinant';
  species: 'Human';
  cellLine: 'HEK-293';
  mechanism: 'Open-channel blocker; uncompetitive';
  comparability: 'SAME_ASSAY_COMPARABLE';
  source: 'Gilling et al. 2009';
  doi: '10.1016/j.neuropharm.2009.01.012';
  pmid: '19371579';
  year: 2009;
  validationStatus: Pack4ValidationStatus;
  validationReason: string;
  limitations: string;
}

const verifiedReason = 'Genesis independently checked PubMed PMID 19371579: title/authors/year, human GluN1/GluN2A context, HEK-293 electrophysiology, and the exact reported kinetic/potency values. The Pack #4 DOI was corrected from .04.002 to the PubMed DOI .01.012.';

export const KNOWLEDGE_PACK_4_RECORDS: readonly KnowledgePack4Record[] = [
  { compound: 'Memantine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'IC50', value: '0.79', unit: 'µM', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'At -70 mV; abstract reports 0.79±0.02 µM.' },
  { compound: 'Ketamine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'IC50', value: '0.71', unit: 'µM', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'At -70 mV; abstract reports 0.71±0.03 µM.' },
  { compound: 'Memantine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'Kon', value: '0.32×10^6', unit: 'M^-1s^-1', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'Normalized kinetic value as reported in the abstract.' },
  { compound: 'Ketamine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'Kon', value: '0.15×10^6', unit: 'M^-1s^-1', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'Abstract reports 0.15±0.05×10^6 M^-1s^-1.' },
  { compound: 'Memantine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'Koff', value: '0.53', unit: 's^-1', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'Abstract reports 0.53±0.10 s^-1.' },
  { compound: 'Ketamine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'Koff', value: '0.22', unit: 's^-1', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'Abstract reports 0.22±0.05 s^-1.' },
  { compound: 'Memantine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'delta', value: '0.90', unit: 'dimensionless', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'Voltage-dependency parameter; abstract reports 0.90±0.09.' },
  { compound: 'Ketamine', target: 'NMDAR', targetSubunit: 'GluN1/GluN2A', assay: 'Whole-cell patch-clamp', assayType: 'Electrophysiology', parameter: 'delta', value: '0.79', unit: 'dimensionless', model: 'Recombinant', species: 'Human', cellLine: 'HEK-293', mechanism: 'Open-channel blocker; uncompetitive', comparability: 'SAME_ASSAY_COMPARABLE', source: 'Gilling et al. 2009', doi: '10.1016/j.neuropharm.2009.01.012', pmid: '19371579', year: 2009, validationStatus: 'VERIFIED', validationReason: verifiedReason, limitations: 'Voltage-dependency parameter; abstract reports 0.79±0.04.' },
];

export function listKnowledgePack4Records(): readonly KnowledgePack4Record[] { return KNOWLEDGE_PACK_4_RECORDS; }
export function knowledgePack4EvidenceRefs(): readonly TargetEvidenceRef[] {
  return KNOWLEDGE_PACK_4_RECORDS.map((record) => ({ source: 'LITERATURE', identifier: `pmid:${record.pmid}`, establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value} ${record.unit}; ${record.assay}, ${record.cellLine}, ${record.species}.` }));
}
