import { canonicalJson, fnv1a } from '../events/hash';
import type { BiologicalEvidence, BiologicalTarget } from '../biotechDiscoveryContract';
import chemblRecord from './chembl-activity-189031.json';

export const CHEMBL_ACTIVITY_189031_SOURCE_URL = 'https://www.ebi.ac.uk/chembl/api/data/activity/189031.json';
export const CHEMBL_ACTIVITY_189031_RETRIEVED_AT = '2026-08-29';
export const CHEMBL_ACTIVITY_189031_RELEASE = 'ChEMBL_37';

type PinnedChEMBLRecord = typeof chemblRecord;

export interface ChEMBLBioactivityRecord {
  compoundId: string;
  biologicalTarget: BiologicalTarget;
  biologicalEvidence: BiologicalEvidence;
  activity: {
    activityId: number;
    assayId: string;
    type: string;
    relation: string;
    value: string;
    units: string;
    assayContext: string;
  };
  sourceUrl: string;
  sourceVersion: string;
  retrievedAt: string;
  rawResponse: PinnedChEMBLRecord;
  fingerprint: string;
}

function assertPinnedRecord(record: PinnedChEMBLRecord): void {
  if (
    record.source !== 'ChEMBL Web Services' ||
    record.sourceVersion !== CHEMBL_ACTIVITY_189031_RELEASE ||
    record.retrievedAt !== CHEMBL_ACTIVITY_189031_RETRIEVED_AT ||
    record.molecule.moleculeChemblId !== 'CHEMBL113' ||
    record.molecule.pubchemCid !== 2519 ||
    record.target.targetChemblId !== 'CHEMBL318' ||
    record.assay.assayChemblId !== 'CHEMBL876556' ||
    record.activity.activityId !== 189031 ||
    record.activity.standardType !== 'Ki' ||
    record.activity.standardValue !== '41000.0' ||
    record.activity.standardUnits !== 'nM'
  ) {
    throw new Error('Pinned ChEMBL fixture is incomplete or has unexpected identity/activity fields.');
  }
}

export function mapPinnedChEMBLCaffeineA1Activity(): ChEMBLBioactivityRecord {
  const record = chemblRecord as PinnedChEMBLRecord;
  assertPinnedRecord(record);

  const compoundId = `pubchem:CID:${record.molecule.pubchemCid}`;
  const targetId = `chembl:target:${record.target.targetChemblId}`;
  const activityId = `chembl:activity:${record.activity.activityId}`;
  const provenance = {
    source: record.source,
    sourceId: activityId,
    evidenceType: 'curated binding bioactivity record',
    status: 'LITERATURE_SUPPORTED' as const,
    uncertainty: 'This record reports an in vitro binding measurement; it does not establish clinical efficacy, therapeutic benefit or safety.',
    sourceUrl: record.sourceUrl,
    sourceVersion: record.sourceVersion,
    retrievedAt: record.retrievedAt,
  };

  const biologicalTarget: BiologicalTarget = {
    kind: 'biological-target',
    id: targetId,
    namespace: 'chembl',
    label: record.target.prefName,
    status: 'OBSERVED',
    targetType: record.target.targetType,
    provenance: [{ ...provenance, sourceId: `chembl:target:${record.target.targetChemblId}`, evidenceType: 'curated target record' }],
  };
  const biologicalEvidence: BiologicalEvidence = {
    kind: 'biological-evidence',
    id: activityId,
    namespace: 'chembl',
    label: `Caffeine Ki binding record ${record.activity.activityId}`,
    status: 'LITERATURE_SUPPORTED',
    claim: `${compoundId} was measured with ${record.activity.standardType} ${record.activity.standardRelation} ${record.activity.standardValue} ${record.activity.standardUnits} against ${targetId} in assay ${record.assay.assayChemblId}.`,
    subjectIds: [compoundId, targetId],
    provenance: [provenance],
  };
  const scientificRecord = {
    compoundId,
    target: biologicalTarget,
    evidence: biologicalEvidence,
    activity: {
      activityId: record.activity.activityId,
      assayId: record.assay.assayChemblId,
      type: record.activity.standardType,
      relation: record.activity.standardRelation,
      value: record.activity.standardValue,
      units: record.activity.standardUnits,
      assayContext: record.assay.description,
    },
    sourceVersion: record.sourceVersion,
  };

  return {
    compoundId,
    biologicalTarget,
    biologicalEvidence,
    activity: scientificRecord.activity,
    sourceUrl: record.sourceUrl,
    sourceVersion: record.sourceVersion,
    retrievedAt: record.retrievedAt,
    rawResponse: record,
    fingerprint: fnv1a(canonicalJson(scientificRecord)),
  };
}
