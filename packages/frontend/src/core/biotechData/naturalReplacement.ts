import { buildPinnedChEMBLAdenosineDiscovery } from './adenosine';
import { buildPinnedChEMBLCaffeineDiscovery } from './chembl';
import { buildPinnedChEMBLTheophyllineDiscovery } from './theophylline';
import {
  createCandidateDiscoveryReport,
  rankTherapeuticCandidate,
  type CandidateDiscoveryReport,
  type BiotechAdmeProfile,
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

export type ReferenceProfileStatus = 'RESOLVED' | 'PARTIAL' | 'UNKNOWN' | 'BLOCKED';
export interface ReferenceProfile {
  status: ReferenceProfileStatus; query: string; source: 'PubChem' | 'ChEMBL';
  sourceId?: string; title?: string; smiles?: string; inchiKey?: string;
  formula?: string; molecularWeight?: string; sourceUrl?: string;
  uncertainty: string;
}

export interface NaturalFunctionalReplacementResult {
  status: 'RESOLVED' | 'BLOCKED';
  reason: string;
  reports: readonly CandidateDiscoveryReport[];
  matchedReference?: string;
  target?: string;
  liveActivities?: readonly LiveChEMBLActivityRecord[];
  candidateWhy?: readonly NaturalCandidateWhy[];
  referenceProfile?: ReferenceProfile;
}

export interface NaturalSourceRecord {
  name: string; cid: number; formula: string; smiles: string; inchiKey: string;
  molecularWeight: string; source: 'PubChem'; sourceVersion: string; retrievedAt: string;
}

export interface LiveChEMBLActivityRecord {
  pubchemCid: number; compoundId: string; targetId: string; activityId: number; assayId: string;
  type: 'Ki' | 'IC50' | 'EC50'; relation: string; value: string; units: string;
  assayContext: string; assayQuality: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  source: 'ChEMBL'; sourceVersion: string; retrievedAt: string; sourceUrl: string;
}

export interface NaturalCandidateWhy {
  pubchemCid: number; activityCount: number; targetMatchedActivityCount: number;
  assayQualityCounts: Readonly<Record<LiveChEMBLActivityRecord['assayQuality'], number>>;
  measurementTypes: readonly LiveChEMBLActivityRecord['type'][];
  rationale: string; uncertainty: string; provenanceIds: readonly string[];
}

const normalize = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

const PUBCHEM_RETRIEVED_AT = '2026-08-29';
const UNIPROT_A1_PROVENANCE = { source: 'UniProt', sourceId: 'UniProtKB:P30542', evidenceType: 'human adenosine A1 receptor target mapping', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'Target identity mapping does not establish compound efficacy, safety or clinical suitability.', sourceUrl: 'https://rest.uniprot.org/uniprotkb/P30542.json', sourceVersion: 'UniProtKB:P30542', retrievedAt: PUBCHEM_RETRIEVED_AT };
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

function identityOnlyReports(records?: readonly NaturalSourceRecord[]): CandidateDiscoveryReport[] {
  const rows = records
    ? records.map((r) => [r.name, r.cid, r.formula, r.smiles, r.inchiKey, r.molecularWeight] as const)
    : PUBCHEM_IDENTITY_RECORDS.filter(([name]) => !['theobromine', 'paraxanthine'].includes(name));
  return rows.map(([name, cid, formula, smiles, inchiKey, molecularWeight]) => {
    const sourceUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`;
    const provenance = { source: 'PubChem', sourceId: `pubchem:CID:${cid}`, evidenceType: 'compound identity and structure property record', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'Identity/structure only. Target, activity, mechanism, safety and ADME are UNKNOWN for this bounded catalog entry.', sourceUrl, sourceVersion: `PubChem CID ${cid}`, retrievedAt: PUBCHEM_RETRIEVED_AT };
    const evidence: BiologicalEvidence = { kind: 'biological-evidence', id: `evidence:pubchem:${cid}`, namespace: 'pubchem', label: `${name} identity record`, status: 'LITERATURE_SUPPORTED', claim: `${name} is identified by the cited PubChem compound record; no biological target claim is made.`, subjectIds: [`compound:pubchem:${cid}`], provenance: [provenance] };
    const safety: SafetySignal = { kind: 'safety-signal', id: `safety:unknown:pubchem:${cid}`, namespace: 'genesis-biotech', label: `${name} safety unknown`, status: 'UNKNOWN', signalType: 'uncertainty', description: 'No safety conclusion is inferred from this identity-only record.', evidenceQuality: 'UNKNOWN', uncertainty: 'Safety and ADME require dedicated source-backed records.', provenance: [{ ...provenance, sourceId: `safety:unknown:pubchem:${cid}`, evidenceType: 'explicit missing safety/ADME boundary', status: 'UNKNOWN' }] };
    const candidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: `candidate:pubchem:${cid}`, namespace: 'genesis-biotech', label: name, status: 'HYPOTHESIS', materialId: `material:pubchem:${cid}`, compoundIds: [`compound:pubchem:${cid}`], targetIds: [], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], hypothesisIds: [`hypothesis:pubchem:${cid}`], provenance: [{ ...provenance, sourceId: candidateId(cid), evidenceType: 'candidate identity mapped from compound record', status: 'HYPOTHESIS' }] };
    const hypothesis: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: `hypothesis:pubchem:${cid}`, namespace: 'genesis-biotech', label: `${name} requires target/activity validation`, status: 'HYPOTHESIS', claim: `${name} is a research candidate for target-specific follow-up only; identity similarity is not functional replacement.`, candidateId: candidate.id, targetIds: [], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], provenance: [{ ...provenance, sourceId: hypothesisId(cid), evidenceType: 'bounded research hypothesis', status: 'HYPOTHESIS' }] };
    const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'UNKNOWN' as CandidateEvidenceQuality, targetRelevance: 0, safetySignals: [safety], uncertaintyPenalty: 1 });
    return createCandidateDiscoveryReport({ candidate, hypothesis, ranking, admeProfile: unknownAdmeProfile({ ...provenance, uncertainty: 'Identity-only PubChem record supplies no quantitative ADME/PK/Tox evidence.' }), uncertainty: `PubChem identity-only profile: formula ${formula}, molecular weight ${molecularWeight}, InChIKey ${inchiKey}, SMILES ${smiles}. Target, mechanism, safety, ADME and efficacy are UNKNOWN.` });
  });
}

/** Bounded PubChem retrieval; missing/invalid rows are omitted, never invented. */
export async function fetchNaturalPubChemRecords(fetchImpl: typeof fetch = fetch): Promise<NaturalSourceRecord[]> {
  const today = new Date().toISOString().slice(0, 10);
  const names = PUBCHEM_IDENTITY_RECORDS.filter(([name]) => !['theobromine', 'paraxanthine'].includes(name));
  const results: Array<NaturalSourceRecord | null> = await Promise.all(names.map(async ([name, cid]): Promise<NaturalSourceRecord | null> => {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`;
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const row = (await response.json() as { PropertyTable?: { Properties?: Record<string, unknown>[] } }).PropertyTable?.Properties?.[0];
      if (typeof row?.CanonicalSMILES !== 'string' || typeof row?.InChIKey !== 'string' || typeof row?.MolecularFormula !== 'string' || typeof row?.MolecularWeight !== 'string') return null;
      return { name, cid, formula: row.MolecularFormula, smiles: row.CanonicalSMILES, inchiKey: row.InChIKey, molecularWeight: row.MolecularWeight, source: 'PubChem' as const, sourceVersion: `PubChem CID ${cid}`, retrievedAt: today };
    } catch { return null; /* bounded source failure remains visible to the caller */ }
  }));
  return results.filter((record): record is NaturalSourceRecord => record !== null);
}

export async function resolveReferenceProfile(query: string, fetchImpl: typeof fetch = fetch): Promise<ReferenceProfile> {
  const value = query.trim();
  if (!value) return { status: 'UNKNOWN', query: value, source: 'PubChem', uncertainty: 'Brak reference compound; nie wykonano wyszukiwania.' };
  const isChEMBL = /^CHEMBL\d+$/i.test(value);
  const isCid = /^\d+$/.test(value);
  const isInchi = value.startsWith('InChI=') || /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(value);
  const endpoint = isChEMBL ? `https://www.ebi.ac.uk/chembl/api/data/molecule/${encodeURIComponent(value.toUpperCase())}.json` : `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${isCid ? 'cid' : isInchi ? 'inchikey' : value.includes('C') && /[()=#\x5b\x5d]/.test(value) ? 'smiles' : 'name'}/${encodeURIComponent(value)}/property/Title,CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`;
  try {
    const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: 'UNKNOWN', query: value, source: isChEMBL ? 'ChEMBL' : 'PubChem', sourceUrl: endpoint, uncertainty: `Źródło zwróciło HTTP ${response.status}; reference nie został rozstrzygnięty.` };
    const payload = await response.json() as Record<string, unknown>;
    const propertyTable = typeof payload.PropertyTable === 'object' && payload.PropertyTable ? payload.PropertyTable as Record<string, unknown> : undefined;
    const properties = Array.isArray(propertyTable?.Properties) ? propertyTable.Properties : [];
    const row = (isChEMBL ? payload : properties[0]) as Record<string, unknown> | undefined;
    const structures = typeof row?.molecule_structures === 'object' && row.molecule_structures ? row.molecule_structures as Record<string, unknown> : undefined;
    const sourceId = isChEMBL ? (typeof row?.molecule_chembl_id === 'string' ? `chembl:molecule:${row.molecule_chembl_id}` : undefined) : (typeof row?.CID === 'number' ? `pubchem:CID:${row.CID}` : undefined);
    const smiles = isChEMBL ? structures?.canonical_smiles : row?.CanonicalSMILES;
    const inchiKey = isChEMBL ? structures?.standard_inchi_key : row?.InChIKey;
    if (!sourceId || typeof smiles !== 'string' || typeof inchiKey !== 'string') return { status: 'PARTIAL', query: value, source: isChEMBL ? 'ChEMBL' : 'PubChem', sourceId, smiles: typeof smiles === 'string' ? smiles : undefined, inchiKey: typeof inchiKey === 'string' ? inchiKey : undefined, sourceUrl: endpoint, uncertainty: 'Źródło rozpoznało część identity, ale nie dostarczyło kompletnego profilu strukturalnego.' };
    return { status: 'RESOLVED', query: value, source: isChEMBL ? 'ChEMBL' : 'PubChem', sourceId, title: typeof row?.Title === 'string' ? row.Title : undefined, smiles, inchiKey, formula: typeof row?.MolecularFormula === 'string' ? row.MolecularFormula : undefined, molecularWeight: typeof row?.MolecularWeight === 'string' ? row.MolecularWeight : undefined, sourceUrl: endpoint, uncertainty: 'Identity/structure resolved; target, activity, safety, ADME, efficacy and clinical suitability require separate evidence.' };
  } catch { return { status: 'BLOCKED', query: value, source: isChEMBL ? 'ChEMBL' : 'PubChem', sourceUrl: endpoint, uncertainty: 'Bounded reference lookup failed or timed out; no identity was guessed.' }; }
}

const allowedActivityTypes = new Set(['Ki', 'IC50', 'EC50']);
function classifyAssay(row: Record<string, unknown>): LiveChEMBLActivityRecord['assayQuality'] {
  if (typeof row.assay_description !== 'string' || !row.assay_description.trim()) return 'UNKNOWN';
  if (row.assay_organism === 'Homo sapiens' && row.assay_type === 'B') return 'HIGH';
  if (row.assay_type === 'B') return 'MODERATE';
  return 'LOW';
}

/** Retrieves explicit ChEMBL activity rows; measurement types are kept separate. */
export async function fetchNaturalChEMBLActivities(records: readonly NaturalSourceRecord[], fetchImpl: typeof fetch = fetch): Promise<LiveChEMBLActivityRecord[]> {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const results = await Promise.all(records.map(async (record) => {
    const moleculeUrl = `https://www.ebi.ac.uk/chembl/api/data/molecule.json?molecule_structures__standard_inchi_key=${encodeURIComponent(record.inchiKey)}&limit=1`;
    try {
      const moleculeResponse = await fetchImpl(moleculeUrl, { signal: AbortSignal.timeout(8000) });
      if (!moleculeResponse.ok) return [];
      const molecule = (await moleculeResponse.json() as { molecules?: Record<string, unknown>[] }).molecules?.[0];
      const compoundId = typeof molecule?.molecule_chembl_id === 'string' ? molecule.molecule_chembl_id : null;
      if (!compoundId) return [];
      const activityUrl = `https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=${encodeURIComponent(compoundId)}&limit=20`;
      const activityResponse = await fetchImpl(activityUrl, { signal: AbortSignal.timeout(8000) });
      if (!activityResponse.ok) return [];
      return ((await activityResponse.json() as { activities?: Record<string, unknown>[] }).activities ?? []).flatMap((row) => {
        if (!allowedActivityTypes.has(String(row.standard_type)) || typeof row.standard_value !== 'string' || typeof row.standard_units !== 'string' || typeof row.activity_id !== 'number' || typeof row.assay_chembl_id !== 'string' || typeof row.target_chembl_id !== 'string') return [];
        return [{ pubchemCid: record.cid, compoundId, targetId: `chembl:target:${row.target_chembl_id}`, activityId: row.activity_id, assayId: row.assay_chembl_id, type: row.standard_type as LiveChEMBLActivityRecord['type'], relation: typeof row.standard_relation === 'string' ? row.standard_relation : 'UNKNOWN', value: row.standard_value, units: row.standard_units, assayContext: typeof row.assay_description === 'string' ? row.assay_description : 'UNKNOWN', assayQuality: classifyAssay(row), source: 'ChEMBL' as const, sourceVersion: 'ChEMBL Web Services', retrievedAt, sourceUrl: activityUrl }];
      });
    } catch { return []; }
  }));
  return results.flat();
}

function buildCandidateWhy(activities: readonly LiveChEMBLActivityRecord[], target: string | undefined): NaturalCandidateWhy[] {
  const token = normalize(target);
  const grouped = new Map<number, LiveChEMBLActivityRecord[]>();
  activities.forEach((activity) => grouped.set(activity.pubchemCid, [...(grouped.get(activity.pubchemCid) ?? []), activity]));
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([pubchemCid, rows]) => {
    const quality = { HIGH: 0, MODERATE: 0, LOW: 0, UNKNOWN: 0 } as Record<LiveChEMBLActivityRecord['assayQuality'], number>;
    rows.forEach((row) => { quality[row.assayQuality] += 1; });
    const matched = rows.filter((row) => !token || row.targetId.toLowerCase().includes(token) || (token === 'a1' && row.targetId.endsWith('CHEMBL318'))).length;
    return { pubchemCid, activityCount: rows.length, targetMatchedActivityCount: matched, assayQualityCounts: quality, measurementTypes: [...new Set(rows.map((row) => row.type))], rationale: matched > 0 ? 'Wyżej: ChEMBL zawiera jawne activity dla żądanego targetu; typ pomiaru i jakość assay pozostają widoczne.' : 'Niżej: pobrane activity nie pasuje do żądanego targetu.', uncertainty: 'In vitro activity nie ustanawia efficacy, safety, mechanizmu ani przydatności klinicznej.', provenanceIds: rows.map((row) => `chembl:activity:${row.activityId}`) };
  });
}

const candidateId = (cid: number): string => `candidate:pubchem:${cid}`;
const unknownAdmeProfile = (provenance: { source: string; sourceId: string; sourceUrl: string; sourceVersion: string; retrievedAt: string; uncertainty: string }): BiotechAdmeProfile => ({ source: provenance.source === 'PubChem' ? 'PubChem' : 'RDKit', status: 'UNKNOWN', metrics: [{ name: 'ADME/PK/Tox', value: 'UNKNOWN', units: 'status', context: 'No compatible quantitative record admitted' }], uncertainty: provenance.uncertainty, provenance: [{ ...provenance, evidenceType: 'explicit missing ADME/PK/Tox boundary', status: 'UNKNOWN' }] });
const hypothesisId = (cid: number): string => `hypothesis:pubchem:${cid}`;

function buildChEMBLParaxanthineA1Report(): CandidateDiscoveryReport {
  const sourceUrl = 'https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=CHEMBL1158&target_chembl_id=CHEMBL318&limit=5';
  const provenance = { source: 'ChEMBL', sourceId: 'chembl:activity:207399', evidenceType: 'curated A1 receptor binding activity', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'One rat brain cortical membrane binding record is an in vitro measurement and does not establish clinical efficacy, safety or functional replacement.', sourceUrl, sourceVersion: 'ChEMBL activity 207399 / assay CHEMBL643484', retrievedAt: PUBCHEM_RETRIEVED_AT };
  const evidence: BiologicalEvidence = { kind: 'biological-evidence', id: 'evidence:chembl:207399', namespace: 'chembl', label: 'Paraxanthine A1 binding activity', status: 'LITERATURE_SUPPORTED', claim: 'Paraxanthine has a ChEMBL-recorded Ki of 21000 nM at Adenosine receptor A1 in rat brain cortical membrane assay.', subjectIds: ['compound:chembl:CHEMBL1158', 'target:chembl:CHEMBL318'], provenance: [provenance, UNIPROT_A1_PROVENANCE] };
  const safety: SafetySignal = { kind: 'safety-signal', id: 'safety:unknown:chembl:1158', namespace: 'genesis-biotech', label: 'Paraxanthine safety/ADME unknown', status: 'UNKNOWN', signalType: 'uncertainty', description: 'This activity record does not supply a safety or ADME conclusion.', evidenceQuality: 'UNKNOWN', uncertainty: 'Safety and ADME require separate authoritative records.', provenance: [{ ...provenance, sourceId: 'safety:unknown:chembl:1158', evidenceType: 'explicit missing safety/ADME boundary', status: 'UNKNOWN' }] };
  const candidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: 'candidate:chembl:CHEMBL1158', namespace: 'genesis-biotech', label: 'Paraxanthine', status: 'HYPOTHESIS', materialId: 'material:chembl:CHEMBL1158', compoundIds: ['compound:chembl:CHEMBL1158'], targetIds: ['target:chembl:CHEMBL318'], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], hypothesisIds: ['hypothesis:chembl:CHEMBL1158'], provenance: [provenance] };
  const hypothesis: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: 'hypothesis:chembl:CHEMBL1158', namespace: 'genesis-biotech', label: 'Paraxanthine A1 follow-up', status: 'HYPOTHESIS', claim: 'Paraxanthine is a source-backed A1 binding candidate for follow-up; binding is not a functional replacement or efficacy claim.', candidateId: candidate.id, targetIds: candidate.targetIds, mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], provenance: [{ ...provenance, sourceId: hypothesisId(1158), evidenceType: 'bounded research hypothesis', status: 'HYPOTHESIS' }] };
  const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'LOW', targetRelevance: 1, safetySignals: [safety], uncertaintyPenalty: 0.5 });
  return createCandidateDiscoveryReport({ candidate, hypothesis, ranking, admeProfile: unknownAdmeProfile({ ...provenance, uncertainty: 'ChEMBL binding activity record supplies no quantitative ADME/PK/Tox evidence.' }), uncertainty: 'ChEMBL target/activity evidence is in vitro and does not establish mechanism, safety, ADME or clinical efficacy.' });
}

function buildChEMBLTheobromineA1Report(): CandidateDiscoveryReport {
  const sourceUrl = 'https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=CHEMBL1114&target_chembl_id=CHEMBL318&limit=5';
  const provenance = { source: 'ChEMBL', sourceId: 'chembl:activity:193161', evidenceType: 'curated A1 receptor binding activity', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'One rat brain cortical membrane binding record is outside the typical range and marked potentially inaccurate by ChEMBL; it does not establish clinical efficacy.', sourceUrl, sourceVersion: 'ChEMBL activity 193161 / assay CHEMBL643484', retrievedAt: PUBCHEM_RETRIEVED_AT };
  const evidence: BiologicalEvidence = { kind: 'biological-evidence', id: 'evidence:chembl:193161', namespace: 'chembl', label: 'Theobromine A1 binding activity', status: 'LITERATURE_SUPPORTED', claim: 'Theobromine has a ChEMBL-recorded Ki of 105000 nM at Adenosine receptor A1 in rat brain cortical membrane assay.', subjectIds: ['compound:chembl:CHEMBL1114', 'target:chembl:CHEMBL318'], provenance: [provenance, UNIPROT_A1_PROVENANCE] };
  const safety: SafetySignal = { kind: 'safety-signal', id: 'safety:unknown:chembl:1114', namespace: 'genesis-biotech', label: 'Theobromine safety/ADME unknown', status: 'UNKNOWN', signalType: 'uncertainty', description: 'This activity record does not supply a safety or ADME conclusion.', evidenceQuality: 'UNKNOWN', uncertainty: 'Safety and ADME require separate authoritative records.', provenance: [{ ...provenance, sourceId: 'safety:unknown:chembl:1114', evidenceType: 'explicit missing safety/ADME boundary', status: 'UNKNOWN' }] };
  const candidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: 'candidate:chembl:CHEMBL1114', namespace: 'genesis-biotech', label: 'Theobromine', status: 'HYPOTHESIS', materialId: 'material:chembl:CHEMBL1114', compoundIds: ['compound:chembl:CHEMBL1114'], targetIds: ['target:chembl:CHEMBL318'], mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], hypothesisIds: ['hypothesis:chembl:CHEMBL1114'], provenance: [provenance] };
  const hypothesis: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: 'hypothesis:chembl:CHEMBL1114', namespace: 'genesis-biotech', label: 'Theobromine A1 follow-up', status: 'HYPOTHESIS', claim: 'Theobromine is a source-backed A1 binding candidate for follow-up; the record is weak/uncertain and is not a functional replacement claim.', candidateId: candidate.id, targetIds: candidate.targetIds, mechanismIds: [], supportingEvidenceIds: [evidence.id], safetySignalIds: [safety.id], provenance: [{ ...provenance, sourceId: hypothesisId(1114), evidenceType: 'bounded research hypothesis', status: 'HYPOTHESIS' }] };
  const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'LOW', targetRelevance: 1, safetySignals: [safety], uncertaintyPenalty: 0.75 });
  return createCandidateDiscoveryReport({ candidate, hypothesis, ranking, admeProfile: unknownAdmeProfile({ ...provenance, uncertainty: 'ChEMBL binding activity record supplies no quantitative ADME/PK/Tox evidence.' }), uncertainty: 'ChEMBL source record is target/activity-backed but marked outside typical range; independent assay, mechanism, safety, ADME and clinical efficacy remain UNKNOWN.' });
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
  const reports = ([
    buildPinnedChEMBLCaffeineDiscovery().report,
    buildPinnedChEMBLAdenosineDiscovery().report,
    buildPinnedChEMBLTheophyllineDiscovery().report,
    buildChEMBLTheobromineA1Report(),
    buildChEMBLParaxanthineA1Report(),
    ...identityOnlyReports(),
  ]).map((report) => report.admeProfile ? report : { ...report, admeProfile: unknownAdmeProfile({ source: report.provenance[0]?.source ?? 'PubChem', sourceId: report.provenance[0]?.sourceId ?? report.reportId, sourceUrl: report.provenance[0]?.sourceUrl ?? 'https://pubchem.ncbi.nlm.nih.gov/', sourceVersion: report.provenance[0]?.sourceVersion ?? 'bounded report', retrievedAt: report.provenance[0]?.retrievedAt ?? PUBCHEM_RETRIEVED_AT, uncertainty: 'No compatible quantitative ADME/PK/Tox evidence admitted for this report.' }) });
  return {
    status: 'RESOLVED',
    reason: 'Dopasowano do istniejącego pinned A1 reference profile; wynik jest research-priority comparison, nie funkcjonalnym zamiennikiem ani dowodem skuteczności.',
    reports,
    matchedReference: input.referenceCompound?.trim() || 'A1 pinned profile',
    target: input.target?.trim() || 'A1',
  };
}

export async function resolveNaturalFunctionalReplacementFromSources(
  input: NaturalFunctionalReplacementInput,
  fetchImpl: typeof fetch = fetch,
): Promise<NaturalFunctionalReplacementResult> {
  const sourceRecords = await fetchNaturalPubChemRecords(fetchImpl);
  if (sourceRecords.length === 0) {
    return { status: 'BLOCKED', reason: 'PubChem retrieval niedostępny; nie wykonano predykcji ani nie użyto syntetycznego fallbacku.', reports: [], matchedReference: input.referenceCompound?.trim(), target: input.target?.trim() };
  }
  const liveActivities = await fetchNaturalChEMBLActivities(sourceRecords, fetchImpl);
  const base = resolveNaturalFunctionalReplacement(input);
  if (base.status === 'BLOCKED') return base;
  return { ...base, liveActivities, candidateWhy: buildCandidateWhy(liveActivities, input.target), reason: `Pobrano ${sourceRecords.length} realnych rekordów z PubChem oraz ${liveActivities.length} jawnych rekordów activity z ChEMBL. ${base.reason}`, reports: [...base.reports.filter((r) => !r.candidateId.startsWith('candidate:pubchem:')), ...identityOnlyReports(sourceRecords)] };
}
