import type { BiotechAdmeProfile, SafetySignal } from '../biotechDiscoveryContract';

const ADENOSINE_LABEL_URL = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=546642f2-662f-46cf-9d82-5bb3bdcc7677';
const THEOPHYLLINE_LABEL_URL = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5e64036a-ee3e-42e7-9e59-881f88a4e298';
const LABEL_VERSION = 'DailyMed label updated 2026-07';

export function mapDailyMedAdenosineSafety(): SafetySignal {
  return {
    kind: 'safety-signal', id: 'safety:dailymed:adenosine:546642f2', namespace: 'dailymed', label: 'Adenosine label-listed contraindications and warnings', status: 'LITERATURE_SUPPORTED', signalType: 'adverse-effect',
    description: 'The official label lists contraindications including selected conduction disorders or hypersensitivity and warnings including heart block, arrhythmias and bronchoconstriction risk. This is a label summary, not an individual clinical assessment.',
    evidenceQuality: 'HIGH', uncertainty: 'Label-level safety information is product-specific and does not establish suitability for an individual or clinical efficacy of this discovery candidate.',
    provenance: [{ source: 'DailyMed', sourceId: 'dailymed:setid:546642f2-662f-46cf-9d82-5bb3bdcc7677', evidenceType: 'official human prescription drug label safety sections', status: 'LITERATURE_SUPPORTED', sourceUrl: ADENOSINE_LABEL_URL, sourceVersion: LABEL_VERSION, retrievedAt: '2026-08-29' }],
  };
}

export function mapDailyMedAdenosineAdme(): BiotechAdmeProfile {
  return {
    source: 'DailyMed', status: 'LITERATURE_SUPPORTED',
    metrics: [{ name: 'whole-blood half-life', value: '<10', units: 'seconds', context: 'official adenosine injection label; rapid cellular uptake in whole blood' }],
    uncertainty: 'Product-label pharmacokinetic context; not an individual prediction, dose recommendation, efficacy claim or complete ADME profile.',
    provenance: [{ source: 'DailyMed', sourceId: 'dailymed:setid:546642f2-662f-46cf-9d82-5bb3bdcc7677', evidenceType: 'official label pharmacokinetic section', status: 'LITERATURE_SUPPORTED', sourceUrl: ADENOSINE_LABEL_URL, sourceVersion: LABEL_VERSION, retrievedAt: '2026-08-29' }],
  };
}

export function mapDailyMedTheophyllineAdme(): BiotechAdmeProfile {
  return {
    source: 'DailyMed', status: 'LITERATURE_SUPPORTED',
    metrics: [
      { name: 'serum concentration range', value: '5–20', units: 'mcg/mL', context: 'official extended-release theophylline label; concentration-effect relationship' },
      { name: 'steady-state half-life', value: 8.3, units: 'hours', context: 'official label multiple-dose study in normal subjects; mean value' },
      { name: 'clearance', value: 3.5, units: 'L/hour', context: 'official label multiple-dose study population; mean value' },
    ],
    uncertainty: 'Product-label population context with wide intersubject variability; not an individual prediction, dose recommendation, efficacy claim or complete ADME profile.',
    provenance: [{ source: 'DailyMed', sourceId: 'dailymed:setid:5e64036a-ee3e-42e7-9e59-881f88a4e298', evidenceType: 'official label pharmacokinetic section', status: 'LITERATURE_SUPPORTED', sourceUrl: THEOPHYLLINE_LABEL_URL, sourceVersion: LABEL_VERSION, retrievedAt: '2026-08-29' }],
  };
}

export function mapDailyMedTheophyllineSafety(): SafetySignal {
  return {
    kind: 'safety-signal', id: 'safety:dailymed:theophylline:5e64036a', namespace: 'dailymed', label: 'Theophylline label-listed adverse-effect and monitoring signals', status: 'LITERATURE_SUPPORTED', signalType: 'adverse-effect',
    description: 'The official label describes concentration-related increases in adverse reactions above the stated therapeutic range, wide pharmacokinetic variability, and the need for serum-concentration monitoring in specified contexts. This is a label summary, not an individual clinical assessment.',
    evidenceQuality: 'HIGH', uncertainty: 'Label-level safety and pharmacokinetic information is product-specific and does not establish suitability for an individual or clinical efficacy of this discovery candidate.',
    provenance: [{ source: 'DailyMed', sourceId: 'dailymed:setid:5e64036a-ee3e-42e7-9e59-881f88a4e298', evidenceType: 'official human prescription drug label safety and pharmacokinetic sections', status: 'LITERATURE_SUPPORTED', sourceUrl: THEOPHYLLINE_LABEL_URL, sourceVersion: LABEL_VERSION, retrievedAt: '2026-08-29' }],
  };
}
