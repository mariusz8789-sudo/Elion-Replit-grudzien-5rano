import { buildPinnedChEMBLAdenosineDiscovery } from './adenosine';
import { buildPinnedChEMBLCaffeineDiscovery } from './chembl';
import { buildPinnedChEMBLTheophyllineDiscovery } from './theophylline';
import {
  createCandidateDiscoveryReport,
  rankTherapeuticCandidate,
  type CandidateDiscoveryReport,
  type BiologicalEvidence,
  type CandidateEvidenceQuality,
  type SafetySignal,
  type TherapeuticCandidate,
  type TherapeuticHypothesis,
} from '../biotechDiscoveryContract';

export interface NaturalFunctionalReplacementInput {
  referenceCompound?: string;
  target?: string;
  mechanism?: string;
  structure?: string;
}

export interface NaturalFunctionalReplacementResult {
  status: 'RESOLVED' | 'BLOCKED';
  reason: string;
  reports: readonly CandidateDiscoveryReport[];
  matchedReference?: string;
  target?: string;
}

const normalize = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

const PUBCHEM_RETRIEVED_AT = '2026-08-29';
const PUBCHEM_IDENTITY_RECORDS = [
  ['theobromine', 5429, 'C7H8N4O2', 'CN1C=NC2=C1C(=O)NC(=O)N2C', 'YAPQBXQYLJRXSA-UHFFFAOYSA-N', '180.16'],
  ['paraxanthine', 4687, 'C7H8N4O2', 'CN1C=NC2=C1C(=O)N(C(=O)N2)C', 'QUNWUDVFRNGTCO-UHFFFAOYSA-N', '180.16'],
  ['hypoxanthine', 135398638, 'C5H4N4O', 'C1=NC2=C(N1)C(=O)NC=N2', 'FDGQSTZJBFJUBT-UHFFFAOYSA-N', '136.11'],
  ['xanthine', 1188, 'C5H4N4O2', 'C1=NC2=C(N1)C(=O)NC(=O)N2', 'LRFVTYWOQMYALW-UHFFFAOYSA-N', '152.11'],
  ['inosine', 6021, 'C10H12N4O5', 'C1=NC2=C(C(=O)N1)NC(=N2)N[C@@H]3O[C@H](CO)[C@@H](O)[C@H]3O', 'UGQMRVRFLZREKJ-KQYNXXCUSA-N', '268.23'],
  ['guanosine', 135398744, 'C10H13N5O5', 'C1=NC2=C(N1C3C(C(C(O3)CO)O)O)C(=O)NC(=N2)N', 'NYHBQMYGNZKZBF-KQYNXXCUSA-N', '283.24'],
  ['adenine', 190, 'C5H5N5', 'C1=NC2=C(N1)C(=NC=N2)N', 'GFFGJBXGBJISGV-UHFFFAOYSA-N', '135.13'],
  ['guanine', 764, 'C5H5N5O', 'C1=NC2=C(N1)C(=O)NC(=N2)N', 'CFMUKQNPFXQQGD-UHFFFAOYSA-N', '151.13'],
  ['uric acid', 1175, 'C5H4N4O3', 'C1=NC2=C(N1)C(=O)NC(=O)N2', 'GRIWKWGZBMCZIE-UHFFFAOYSA-N', '168.11'],
] as const;

function identityOnlyReports(): CandidateDiscoveryReport[] {
  return PUBCHEM_IDENTITY_RECORDS.filter(([name]) => name !== 'theobromine').map(([name, cid, formula, smiles, inchiKey, molecularWeight]) => {
    const sourceUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`;
    const provenance = { source: 'PubChem', sourceId: `pubchem:CID:${cid}`, evidenceType: 'compound identity and structure property record', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'Identity/structure only. Target, activity, mechanism, safety and ADME are UNKNOWN for this bounded catalog entry.', sourceUrl, sourceVersion: `PubChem CID ${cid}`, retrievedAt: PUBCHEM_RETRIEVED_AT };
    const evidence: BiologicalEvidence = { kind: 'biological-evidence', id: `evidence:pubchem:${cid}`, namespace: 'pubchem', label: `${name} identity record`, status: 'LITERATURE_SUPPORTED', claim: `${name} is identified by the cited PubChem compound record; no biological target claim is made.`, subjectIds: [`compound:pubchem:${cid}`], provenance: [provenance] };
    const safety: SafetySignal = { kind: 'safety-signal', id: `safety:unknown:pubchem:${cid}`, namespace: 'genesis-biotech', label: `${name} safety unknown`, status: 'UNKNOWN', signalType: 'uncertainty', description: 'No safety conclusion is inferred from this identity-only record.', evidenceQuality: 'UNKNOWN', uncertainty: 'Safety and ADME require dedicated source-backed records.', provenance: [{ ...provenance, sourceId: `safety:unknown:pubchem:${cid}`, evidenceType: 'explicit missing safety/ADME boundary', status: 'UNKNOWN' }] };
    const candidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: `candidate:pubchem:${cid}`, namespace: 'genesis-biotech', label: name, status: 'HYPOTHESIS', materialId: `material:pubchem:${cid}`, compoundIds: [`compound:pubchem:${cid}`], targetIds: [], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], hypothesisIds: [`hypothesis:pubchem:${cid}`], provenance: [{ ...provenance, sourceId: candidateId(cid), evidenceType: 'candidate identity mapped from compound record', status: 'HYPOTHESIS' }] };
    const hypothesis: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: `hypothesis:pubchem:${cid}`, namespace: 'genesis-biotech', label: `${name} requires target/activity validation`, status: 'HYPOTHESIS', claim: `${name} is a research candidate for target-specific follow-up only; identity similarity is not functional replacement.`, candidateId: candidate.id, targetIds: [], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], provenance: [{ ...provenance, sourceId: hypothesisId(cid), evidenceType: 'bounded research hypothesis', status: 'HYPOTHESIS' }] };
    const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'UNKNOWN' as CandidateEvidenceQuality, targetRelevance: 0, safetySignals: [safety], uncertaintyPenalty: 1 });
    return createCandidateDiscoveryReport({ candidate, hypothesis, ranking, uncertainty: `PubChem identity-only profile: formula ${formula}, molecular weight ${molecularWeight}, InChIKey ${inchiKey}, SMILES ${smiles}. Target, mechanism, safety, ADME and efficacy are UNKNOWN.` });
  });
}

const candidateId = (cid: number): string => `candidate:pubchem:${cid}`;
const hypothesisId = (cid: number): string => `hypothesis:pubchem:${cid}`;

function buildChEMBLTheobromineA1Report(): CandidateDiscoveryReport {
  const sourceUrl = 'https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=CHEMBL1114&target_chembl_id=CHEMBL318&limit=5';
  const provenance = { source: 'ChEMBL', sourceId: 'chembl:activity:193161', evidenceType: 'curated A1 receptor binding activity', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'One rat brain cortical membrane binding record is outside the typical range and marked potentially inaccurate by ChEMBL; it does not establish clinical efficacy.', sourceUrl, sourceVersion: 'ChEMBL activity 193161 / assay CHEMBL643484', retrievedAt: PUBCHEM_RETRIEVED_AT };
  const evidence: BiologicalEvidence = { kind: 'biological-evidence', id: 'evidence:chembl:193161', namespace: 'chembl', label: 'Theobromine A1 binding activity', status: 'LITERATURE_SUPPORTED', claim: 'Theobromine has a ChEMBL-recorded Ki of 105000 nM at Adenosine receptor A1 in rat brain cortical membrane assay.', subjectIds: ['compound:chembl:CHEMBL1114', 'target:chembl:CHEMBL318'], provenance: [provenance] };
  const safety: SafetySignal = { kind: 'safety-signal', id: 'safety:unknown:chembl:1114', namespace: 'genesis-biotech', label: 'Theobromine safety/ADME unknown', status: 'UNKNOWN', signalType: 'uncertainty', description: 'This activity record does not supply a safety or ADME conclusion.', evidenceQuality: 'UNKNOWN', uncertainty: 'Safety and ADME require separate authoritative records.', provenance: [{ ...provenance, sourceId: 'safety:unknown:chembl:1114', evidenceType: 'explicit missing safety/ADME boundary', status: 'UNKNOWN' }] };
  const candidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: 'candidate:chembl:CHEMBL1114', namespace: 'genesis-biotech', label: 'Theobromine', status: 'HYPOTHESIS', materialId: 'material:chembl:CHEMBL1114', compoundIds: ['compound:chembl:CHEMBL1114'], targetIds: ['target:chembl:CHEMBL318'], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], hypothesisIds: ['hypothesis:chembl:CHEMBL1114'], provenance: [provenance] };
  const hypothesis: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: 'hypothesis:chembl:CHEMBL1114', namespace: 'genesis-biotech', label: 'Theobromine A1 follow-up', status: 'HYPOTHESIS', claim: 'Theobromine is a source-backed A1 binding candidate for follow-up; the record is weak/uncertain and is not a functional replacement claim.', candidateId: candidate.id, targetIds: candidate.targetIds, mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], provenance: [{ ...provenance, sourceId: hypothesisId(1114), evidenceType: 'bounded research hypothesis', status: 'HYPOTHESIS' }] };
  const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'LOW', targetRelevance: 1, safetySignals: [safety], uncertaintyPenalty: 0.75 });
  return createCandidateDiscoveryReport({ candidate, hypothesis, ranking, uncertainty: 'ChEMBL source record is target/activity-backed but marked outside typical range; independent assay, mechanism, safety, ADME and clinical efficacy remain UNKNOWN.' });
}

export function resolveNaturalFunctionalReplacement(input: NaturalFunctionalReplacementInput): NaturalFunctionalReplacementResult {
  const reference = normalize(input.referenceCompound);
  const target = normalize(input.target);
  const knownReference = reference.includes('caffeine') || reference.includes('kofein') || reference.includes('adenosine') || reference.includes('adenozyn') || reference.includes('theophylline') || reference.includes('teofilin');
  const knownTarget = !target || target === 'a1' || target.includes('adenosine receptor a1') || target.includes('chembl318');
  if (!knownReference || !knownTarget) {
    return {
      status: 'BLOCKED',
      reason: 'Brak kompatybilnego pinned reference profile w dostępnych źródłach; nie wykonano wyszukiwania ani predykcji.',
      reports: [],
      ...(input.referenceCompound?.trim() ? { matchedReference: input.referenceCompound.trim() } : {}),
      ...(input.target?.trim() ? { target: input.target.trim() } : {}),
    };
  }
  const reports = [
    buildPinnedChEMBLCaffeineDiscovery().report,
    buildPinnedChEMBLAdenosineDiscovery().report,
    buildPinnedChEMBLTheophyllineDiscovery().report,
    buildChEMBLTheobromineA1Report(),
    ...identityOnlyReports(),
  ];
  return {
    status: 'RESOLVED',
    reason: 'Dopasowano do istniejącego pinned A1 reference profile; wynik jest research-priority comparison, nie funkcjonalnym zamiennikiem ani dowodem skuteczności.',
    reports,
    matchedReference: input.referenceCompound?.trim() || 'A1 pinned profile',
    target: input.target?.trim() || 'A1',
  };
}
