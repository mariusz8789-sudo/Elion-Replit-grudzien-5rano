import { canonicalJson, fnv1a } from '../events/hash';
import { createCandidateDiscoveryReport, rankTherapeuticCandidate, type BiologicalEvidence, type BiologicalTarget, type CandidateDiscoveryReport, type CandidateRanking, type SafetySignal, type TherapeuticCandidate, type TherapeuticHypothesis } from '../biotechDiscoveryContract';
import { mapPinnedPubChemCaffeine, type PubChemCompoundRecord } from './pubchem';
import chemblRecord from './chembl-activity-189031.json';
import { mapPinnedPubChemCaffeineSafety } from './safety';

export const CHEMBL_ACTIVITY_189031_SOURCE_URL = 'https://www.ebi.ac.uk/chembl/api/data/activity/189031.json';
export const CHEMBL_ACTIVITY_189031_RETRIEVED_AT = '2026-08-29';
export const CHEMBL_ACTIVITY_189031_RELEASE = 'ChEMBL_37';

type PinnedChEMBLRecord = typeof chemblRecord;

export interface ChEMBLCaffeineDiscovery {
  record: ChEMBLBioactivityRecord;
  candidate: TherapeuticCandidate;
  ranking: CandidateRanking;
  safety: SafetySignal;
  hypothesis: TherapeuticHypothesis;
  report: CandidateDiscoveryReport;
}

export interface ChEMBLBioactivityRecord {
  compoundId: string;
  compound: PubChemCompoundRecord;
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
  const compound = mapPinnedPubChemCaffeine();
  if (compound.sourceId !== `pubchem:CID:${record.molecule.pubchemCid}`) throw new Error('PubChem/ChEMBL compound identity mismatch.');

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
    compound,
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

/**
 * Builds a research-priority record, not a therapeutic efficacy claim. The
 * candidate status is UNKNOWN and the ranking is explicitly PREDICTION.
 */
export function buildPinnedChEMBLCaffeineDiscovery(): ChEMBLCaffeineDiscovery {
  const record = mapPinnedChEMBLCaffeineA1Activity();
  const safety = mapPinnedPubChemCaffeineSafety();
  const candidate: TherapeuticCandidate = {
    kind: 'therapeutic-candidate',
    id: `candidate:${record.compoundId}:${record.biologicalTarget.id}`,
    namespace: 'genesis-biotech',
    label: 'Caffeine — A1 binding research candidate',
    status: 'UNKNOWN',
    materialId: record.compoundId,
    compoundIds: [record.compoundId],
    targetIds: [record.biologicalTarget.id],
    mechanismIds: [],
    supportingEvidenceIds: [record.biologicalEvidence.id],
    safetySignalIds: [safety.id],
    hypothesisIds: [`hypothesis:candidate:${record.compoundId}:${record.biologicalTarget.id}`],
    provenance: [...record.biologicalEvidence.provenance, ...safety.provenance],
  };
  const ranking = rankTherapeuticCandidate({
    candidate,
    evidenceQuality: 'MODERATE',
    targetRelevance: 0.5,
    safetySignals: [safety],
    uncertaintyPenalty: 1,
  });
  const hypothesisBase: TherapeuticHypothesis = {
    kind: 'therapeutic-hypothesis',
    id: `hypothesis:${candidate.id}`,
    namespace: 'genesis-biotech',
    label: 'Caffeine–A1 interaction requires independent follow-up',
    status: 'HYPOTHESIS',
    claim: 'The pinned ChEMBL binding record supports research follow-up of the caffeine–A1 relationship; it does not establish mechanism, efficacy, therapeutic benefit or safety.',
    candidateId: candidate.id,
    targetIds: candidate.targetIds,
    mechanismIds: [],
    supportingEvidenceIds: candidate.supportingEvidenceIds,
    safetySignalIds: [safety.id],
    provenance: [...record.biologicalEvidence.provenance, ...safety.provenance],
  };
  const hypothesis: TherapeuticHypothesis = {
    ...hypothesisBase,
    provenance: [...hypothesisBase.provenance, { ...record.biologicalEvidence.provenance[0], sourceId: record.biologicalEvidence.id, evidenceType: 'hypothesis derived from curated binding record', status: 'HYPOTHESIS' }],
  };
  const report = createCandidateDiscoveryReport({ candidate, hypothesis, uncertainty: ranking.uncertainty, ranking });
  return { record, candidate, ranking, safety, hypothesis, report };
}
