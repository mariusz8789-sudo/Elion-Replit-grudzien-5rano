import { canonicalJson, fnv1a } from '../events/hash';
import { buildBiologicalValidationRequest, createCandidateDiscoveryReport, rankTherapeuticCandidate, type BiologicalEvidence, type BiologicalTarget, type CandidateDiscoveryReport, type CandidateRanking, type SafetySignal, type TherapeuticCandidate, type TherapeuticHypothesis } from '../biotechDiscoveryContract';
import record from './chembl-theophylline-activity-109460.json';
import { mapDailyMedTheophyllineAdme, mapDailyMedTheophyllineSafety } from './dailymedSafety';

type PinnedRecord = typeof record;
export const CHEMBL_THEOPHYLLINE_ACTIVITY_109460_SOURCE_URL = record.sourceUrls.activity;

export interface ChEMBLTheophyllineDiscovery {
  record: { compoundId: string; biologicalTarget: BiologicalTarget; biologicalEvidence: BiologicalEvidence; activity: { activityId: number; assayId: string; type: string; relation: string; value: string; units: string; assayContext: string }; sourceUrl: string; sourceVersion: string; retrievedAt: string; fingerprint: string };
  candidate: TherapeuticCandidate;
  ranking: CandidateRanking;
  safety: SafetySignal;
  hypothesis: TherapeuticHypothesis;
  report: CandidateDiscoveryReport;
}

function assertPinned(value: PinnedRecord): void {
  if (value.source !== 'ChEMBL Web Services' || value.sourceVersion !== 'ChEMBL_37' || value.retrievedAt !== '2026-08-29' || value.molecule.moleculeChemblId !== 'CHEMBL1355736' || value.target.targetChemblId !== 'CHEMBL318' || value.assay.assayChemblId !== 'CHEMBL641038' || value.activity.activityId !== 109460 || value.activity.standardType !== 'Ki' || value.activity.standardRelation !== '=' || value.activity.standardValue !== '700.0' || value.activity.standardUnits !== 'nM') throw new Error('Pinned ChEMBL theophylline fixture is incomplete or unexpected.');
}

export function buildPinnedChEMBLTheophyllineDiscovery(): ChEMBLTheophyllineDiscovery {
  assertPinned(record);
  const compoundId = `chembl:molecule:${record.molecule.moleculeChemblId}`;
  const targetId = `chembl:target:${record.target.targetChemblId}`;
  const activityId = `chembl:activity:${record.activity.activityId}`;
  const provenance = { source: record.source, sourceId: activityId, evidenceType: 'curated binding bioactivity record', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'This is an in vitro binding measurement on rat brain membrane; it does not establish clinical efficacy, therapeutic benefit or safety.', sourceUrl: record.sourceUrls.activity, sourceVersion: record.sourceVersion, retrievedAt: record.retrievedAt };
  const biologicalTarget: BiologicalTarget = { kind: 'biological-target', id: targetId, namespace: 'chembl', label: record.target.prefName, status: 'OBSERVED', targetType: record.target.targetType, provenance: [{ ...provenance, sourceId: targetId, sourceUrl: record.sourceUrls.assay, evidenceType: 'curated target record' }] };
  const biologicalEvidence: BiologicalEvidence = { kind: 'biological-evidence', id: activityId, namespace: 'chembl', label: `Theophylline Ki binding record ${record.activity.activityId}`, status: 'LITERATURE_SUPPORTED', claim: `${compoundId} was measured with ${record.activity.standardType} ${record.activity.standardRelation} ${record.activity.standardValue} ${record.activity.standardUnits} against ${targetId} in assay ${record.assay.assayChemblId}.`, subjectIds: [compoundId, targetId], provenance: [provenance] };
  const scientificRecord = { compoundId, targetId, activityId, assayId: record.assay.assayChemblId, value: record.activity.standardValue, units: record.activity.standardUnits, sourceVersion: record.sourceVersion };
  const fingerprint = fnv1a(canonicalJson(scientificRecord));
  const safety: SafetySignal = mapDailyMedTheophyllineSafety();
  const candidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: `candidate:${compoundId}:${targetId}`, namespace: 'genesis-biotech', label: 'Theophylline — A1 binding research candidate', status: 'UNKNOWN', materialId: compoundId, compoundIds: [compoundId], targetIds: [targetId], mechanismIds: [], supportingEvidenceIds: [activityId], safetySignalIds: [safety.id], hypothesisIds: [`hypothesis:candidate:${compoundId}:${targetId}`], provenance: [provenance, ...safety.provenance] };
  const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'MODERATE', targetRelevance: 0.5, safetySignals: [safety], uncertaintyPenalty: 1 });
  const hypothesisBase: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: `hypothesis:${candidate.id}`, namespace: 'genesis-biotech', label: 'Theophylline–A1 interaction requires independent follow-up', status: 'HYPOTHESIS', claim: 'The pinned ChEMBL binding record supports research follow-up of the theophylline–A1 relationship; it does not establish mechanism, efficacy, therapeutic benefit or safety.', candidateId: candidate.id, targetIds: candidate.targetIds, mechanismIds: [], supportingEvidenceIds: candidate.supportingEvidenceIds, safetySignalIds: [safety.id], provenance: [provenance] };
  const hypothesis: TherapeuticHypothesis = { ...hypothesisBase, provenance: [...hypothesisBase.provenance, { ...provenance, sourceId: biologicalEvidence.id, evidenceType: 'hypothesis derived from curated binding record', status: 'HYPOTHESIS' }] };
  const experimentRequest = buildBiologicalValidationRequest({ hypothesisId: hypothesis.id, candidateId: candidate.id, targetIds: candidate.targetIds });
  const report = createCandidateDiscoveryReport({ candidate, hypothesis, ranking, experimentRequest, admeProfile: mapDailyMedTheophyllineAdme(), uncertainty: ranking.uncertainty });
  return { record: { compoundId, biologicalTarget, biologicalEvidence, activity: { activityId: record.activity.activityId, assayId: record.assay.assayChemblId, type: record.activity.standardType, relation: record.activity.standardRelation, value: record.activity.standardValue, units: record.activity.standardUnits, assayContext: record.assay.description }, sourceUrl: record.sourceUrls.activity, sourceVersion: record.sourceVersion, retrievedAt: record.retrievedAt, fingerprint }, candidate, ranking, safety, hypothesis, report };
}
