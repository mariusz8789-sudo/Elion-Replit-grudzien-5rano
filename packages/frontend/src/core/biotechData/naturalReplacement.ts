import { buildPinnedChEMBLAdenosineDiscovery } from './adenosine';
import { buildPinnedChEMBLCaffeineDiscovery } from './chembl';
import { buildPinnedChEMBLTheophyllineDiscovery } from './theophylline';
import { runExperiment } from '../experimentFabric/executor';
import { runFabricCompute, runAdmetPrediction, runQuantumSinglePoint, type ComputeRun } from '../backend/client';
import { EXPERIMENT_FABRIC_VERSION, type ExperimentRun } from '../experimentFabric/types';
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
  canonicalJson,
  fnv1a,
  buildCandidateCombinationHypothesis,
} from '../biotechDiscoveryContract';

export interface NaturalFunctionalReplacementInput {
  referenceCompound?: string;
  target?: string;
  mechanism?: string;
  structure?: string;
  executeHeavyCompute?: boolean;
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
  cheapCompute?: readonly NaturalCheapCompute[];
  heavyCompute?: readonly NaturalHeavyCompute[];
  admetCompute?: readonly NaturalHeavyCompute[];
  quantumCompute?: readonly NaturalHeavyCompute[];
  combinationHypothesis?: ReturnType<typeof buildCandidateCombinationHypothesis>;
  neurobiology?: NaturalNeurobiologyProfile;
}

export interface NaturalSourceRecord {
  name: string; cid: number; formula: string; smiles: string; inchiKey: string;
  molecularWeight: string; source: 'PubChem'; sourceVersion: string; retrievedAt: string;
  atoms3d?: readonly { element: string; x: number; y: number; z: number }[];
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

export interface NaturalNeurobiologyProfile {
  targetId: string; receptor: string; receptorFamily: string; neurotransmitterSystem: string;
  pathway: { label: string; status: 'LITERATURE_SUPPORTED' | 'UNKNOWN'; uncertainty: string };
  mechanism: { label: string; status: 'HYPOTHESIS' | 'UNKNOWN'; uncertainty: string };
  provenance: readonly { source: string; sourceId: string; sourceUrl?: string; sourceVersion?: string }[];
}

export interface NaturalCheapCompute {
  pubchemCid: number; status: ExperimentRun['result']['status']; runId: string;
  runFingerprint: string; outputs: ExperimentRun['result']['outputs'];
  resultOrigin: ExperimentRun['provenance']['resultOrigin']; summary: string;
}

export interface NaturalHeavyCompute {
  pubchemCid: number; modelId: string; modelVersion?: string; engine?: string;
  status: ComputeRun['status'] | 'blocked'; runId?: string; runFingerprint?: string;
  resultOrigin: string; outputs: Readonly<Record<string, string | number | boolean>>;
  summary: string; provenance?: ComputeRun['provenance'];
}

function enrichReportsWithCompute(reports: readonly CandidateDiscoveryReport[], cheap: readonly NaturalCheapCompute[], heavy: readonly NaturalHeavyCompute[], admet: readonly NaturalHeavyCompute[], quantum: readonly NaturalHeavyCompute[], activities: readonly LiveChEMBLActivityRecord[], target?: string): CandidateDiscoveryReport[] {
  return reports.map((report) => {
    const cid = Number(report.candidateId.split(':').pop());
    const runs = [
      ...cheap.filter((run) => run.pubchemCid === cid).map((run) => ({ runtime: 'Experiment Fabric cheap molecular weight', version: EXPERIMENT_FABRIC_VERSION, runId: run.runId, fingerprint: run.runFingerprint, status: run.status, resultOrigin: run.resultOrigin, outputs: run.outputs as Readonly<Record<string, string | number | boolean>> })),
      ...heavy.filter((run) => run.pubchemCid === cid).map((run) => ({ runtime: run.engine ?? run.modelId, version: run.modelVersion, runId: run.runId, fingerprint: run.runFingerprint, status: run.status, resultOrigin: run.resultOrigin, outputs: run.outputs })),
      ...admet.filter((run) => run.pubchemCid === cid).map((run) => ({ runtime: run.engine ?? run.modelId, version: run.modelVersion, runId: run.runId, fingerprint: run.runFingerprint, status: run.status, resultOrigin: run.resultOrigin, outputs: run.outputs })),
      ...quantum.filter((run) => run.pubchemCid === cid).map((run) => ({ runtime: run.engine ?? run.modelId, version: run.modelVersion, runId: run.runId, fingerprint: run.runFingerprint, status: run.status, resultOrigin: run.resultOrigin, outputs: run.outputs })),
    ];
    if (!Number.isFinite(cid) || !report.ranking || runs.length === 0) return report;
    const support = Number((runs.filter((run) => run.status === 'completed' || run.status === 'ok').length / runs.length).toFixed(4));
    const candidateActivities = activities.filter((activity) => activity.pubchemCid === cid);
    const bestAssay = candidateActivities.reduce((best, activity) => Math.max(best, ({ UNKNOWN: 0, LOW: 0.33, MODERATE: 0.66, HIGH: 1 }[activity.assayQuality])), 0);
    const targetRelevance = candidateActivities.length > 0 ? (target && candidateActivities.some((activity) => activity.assayContext.toLowerCase().includes(target.toLowerCase())) ? 1 : 0.5) : 0;
    const evidenceQuality = bestAssay;
    const missingEvidencePenalty = candidateActivities.length === 0 ? 1 : (candidateActivities.some((activity) => activity.assayQuality === 'UNKNOWN') ? 0.5 : 0);
    const score = Number((0.25 * evidenceQuality + 0.2 * targetRelevance + 0.05 * support - 0.1 * missingEvidencePenalty - 0.1 * report.ranking.components.uncertaintyPenalty).toFixed(4));
    const ranking = { ...report.ranking, score, components: { ...report.ranking.components, evidenceQuality, targetRelevance, computeSupport: support, uncertaintyPenalty: Math.max(report.ranking.components.uncertaintyPenalty, missingEvidencePenalty) }, rationale: `${report.ranking.rationale} Score uses explicit ChEMBL assay quality (${bestAssay.toFixed(2)}), target-context relevance (${targetRelevance.toFixed(2)}) and compatible compute support (${support.toFixed(2)}); missing evidence is penalized. Ki/IC50/EC50 remain separate and this is not efficacy or safety.` };
    const unsigned = { ...report, ranking, computeRuns: runs } as Record<string, unknown>;
    delete unsigned.reportId; delete unsigned.provenance; delete unsigned.scientificFingerprint;
    const scientificFingerprint = fnv1a(canonicalJson(unsigned));
    return { ...report, ranking, computeRuns: runs, reportId: `report:${scientificFingerprint}`, scientificFingerprint };
  });
}

const normalize = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

const PUBCHEM_RETRIEVED_AT = '2026-08-29';
const UNIPROT_A1_PROVENANCE = { source: 'UniProt', sourceId: 'UniProtKB:P30542', evidenceType: 'human adenosine A1 receptor target mapping', status: 'LITERATURE_SUPPORTED' as const, uncertainty: 'Target identity mapping does not establish compound efficacy, safety or clinical suitability.', sourceUrl: 'https://rest.uniprot.org/uniprotkb/P30542.json', sourceVersion: 'UniProtKB:P30542', retrievedAt: PUBCHEM_RETRIEVED_AT };
const A1_NEUROBIOLOGY_PROFILE: NaturalNeurobiologyProfile = { targetId: 'chembl:target:CHEMBL318', receptor: 'Adenosine receptor A1', receptorFamily: 'Adenosine receptor family', neurotransmitterSystem: 'Adenosinergic signaling', pathway: { label: 'Adenosinergic signaling pathway', status: 'LITERATURE_SUPPORTED', uncertainty: 'Target mapping does not establish a candidate-specific pathway effect.' }, mechanism: { label: 'Candidate–A1 binding interaction', status: 'HYPOTHESIS', uncertainty: 'Binding evidence does not establish functional mechanism, efficacy or clinical benefit.' }, provenance: [{ source: UNIPROT_A1_PROVENANCE.source, sourceId: UNIPROT_A1_PROVENANCE.sourceId, sourceUrl: UNIPROT_A1_PROVENANCE.sourceUrl, sourceVersion: UNIPROT_A1_PROVENANCE.sourceVersion }] };
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
  const results: Array<NaturalSourceRecord | null> = [];
  for (const [name, cid] of names) {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`;
    try {
      let response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      }
      if (!response.ok) { results.push(null); continue; }
      const row = (await response.json() as { PropertyTable?: { Properties?: Record<string, unknown>[] } }).PropertyTable?.Properties?.[0];
      const smiles = typeof row?.CanonicalSMILES === 'string' ? row.CanonicalSMILES : row?.ConnectivitySMILES;
      if (typeof smiles !== 'string' || typeof row?.InChIKey !== 'string' || typeof row?.MolecularFormula !== 'string' || typeof row?.MolecularWeight !== 'string') { results.push(null); continue; }
      results.push({ name, cid, formula: row.MolecularFormula, smiles, inchiKey: row.InChIKey, molecularWeight: row.MolecularWeight, source: 'PubChem' as const, sourceVersion: `PubChem CID ${cid}`, retrievedAt: today });
    } catch { results.push(null); /* bounded source failure remains visible to the caller */ }
  }
  return results.filter((record): record is NaturalSourceRecord => record !== null);
}

const ELEMENTS: Readonly<Record<number, string>> = { 1: 'H', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 15: 'P', 16: 'S', 17: 'Cl' };
export async function fetchNaturalPubChem3dRecord(record: NaturalSourceRecord, fetchImpl: typeof fetch = fetch): Promise<NaturalSourceRecord> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${record.cid}/record/JSON?record_type=3d`;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return record;
    const compound = (await response.json() as { PC_Compounds?: Array<{ atoms?: { element?: { number?: number[] } }; coords?: Array<{ conformers?: Array<{ x?: number[]; y?: number[]; z?: number[] }> }> }> }).PC_Compounds?.[0];
    const numbers = compound?.atoms?.element?.number;
    const conformer = compound?.coords?.[0]?.conformers?.[0];
    if (!numbers || !conformer?.x || !conformer.y || !conformer.z || numbers.length !== conformer.x.length || numbers.length !== conformer.y.length || numbers.length !== conformer.z.length) return record;
    const atoms3d = numbers.map((number, index) => ({ element: ELEMENTS[number], x: conformer.x![index], y: conformer.y![index], z: conformer.z![index] })).filter((atom): atom is { element: string; x: number; y: number; z: number } => Boolean(atom.element) && [atom.x, atom.y, atom.z].every(Number.isFinite));
    return atoms3d.length === numbers.length ? { ...record, atoms3d } : record;
  } catch { return record; }
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

function runCheapNaturalCompute(records: readonly NaturalSourceRecord[]): NaturalCheapCompute[] {
  return records.map((record) => {
    const run = runExperiment({ contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: `Natural candidate PubChem CID ${record.cid}: compute molecular formula descriptors`, domainId: 'chemistry', operation: 'compute', modelId: 'chem-molecular-weight', parameters: { formula: record.formula } });
    return { pubchemCid: record.cid, status: run.result.status, runId: run.runId, runFingerprint: run.provenance.runFingerprint, outputs: run.result.outputs, resultOrigin: run.provenance.resultOrigin, summary: run.result.summary };
  });
}

async function runHeavyNaturalCompute(records: readonly NaturalSourceRecord[]): Promise<NaturalHeavyCompute[]> {
  return Promise.all(records.map(async (record): Promise<NaturalHeavyCompute> => {
    if (!record.smiles.trim()) return { pubchemCid: record.cid, modelId: 'chem-rdkit-descriptors', status: 'blocked', resultOrigin: 'not-executed', outputs: {}, summary: 'BLOCKED: brak poprawnego SMILES.' };
    try {
      const response = await runFabricCompute({ modelId: 'chem-rdkit-descriptors', inputs: { smiles: record.smiles }, domainId: 'chemistry', sourceText: `PubChem CID ${record.cid}` });
      if (!response.ok) return { pubchemCid: record.cid, modelId: 'chem-rdkit-descriptors', status: 'blocked', resultOrigin: 'engine-unavailable', outputs: {}, summary: `BLOCKED: ${response.error}` };
      const run = response.data.run;
      return { pubchemCid: record.cid, modelId: run.modelId, modelVersion: run.modelVersion, engine: run.engine, status: run.status, runId: run.runId, runFingerprint: run.runId, resultOrigin: run.status === 'ok' ? 'real-engine' : 'engine-error', outputs: run.outputs ?? {}, summary: run.message ?? run.validity ?? `RDKit ${run.status}`, provenance: run.provenance };
    } catch (error) {
      return { pubchemCid: record.cid, modelId: 'chem-rdkit-descriptors', status: 'blocked', resultOrigin: 'request-failed', outputs: {}, summary: `BLOCKED: ${error instanceof Error ? error.message : String(error)}` };
    }
  }));
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
  const cheapCompute = runCheapNaturalCompute(sourceRecords);
  const heavyCompute = input.executeHeavyCompute ? await runHeavyNaturalCompute(sourceRecords.filter((record) => cheapCompute.some((run) => run.pubchemCid === record.cid && run.status === 'completed'))) : undefined;
  const eligible = sourceRecords.filter((record) => cheapCompute.some((run) => run.pubchemCid === record.cid && run.status === 'completed'));
  let admetCompute: NaturalHeavyCompute[] | undefined;
  if (input.executeHeavyCompute) {
    try {
      const response = await runAdmetPrediction(eligible.map((record) => record.smiles));
      if (response.ok) admetCompute = eligible.map((record) => ({ pubchemCid: record.cid, modelId: 'admet-ai', modelVersion: response.data.version, engine: response.data.engine, status: 'ok', runId: response.data.runId, runFingerprint: response.data.runId, resultOrigin: response.data.resultOrigin, outputs: response.data.predictions[record.smiles] ?? {}, summary: 'ADMET-AI MODEL_ESTIMATE; nie jest obserwacją ani dowodem bezpieczeństwa.' }));
      else admetCompute = eligible.map((record) => ({ pubchemCid: record.cid, modelId: 'admet-ai', status: 'blocked', resultOrigin: 'engine-unavailable', outputs: {}, summary: `BLOCKED: ${response.error}` }));
    } catch (error) { admetCompute = eligible.map((record) => ({ pubchemCid: record.cid, modelId: 'admet-ai', status: 'blocked', resultOrigin: 'request-failed', outputs: {}, summary: `BLOCKED: ${error instanceof Error ? error.message : String(error)}` })); }
  }
  const quantumCompute: NaturalHeavyCompute[] = [];
  if (input.executeHeavyCompute) {
    for (const record of eligible) {
      const source3d = await fetchNaturalPubChem3dRecord(record, fetchImpl);
      if (!source3d.atoms3d) {
        quantumCompute.push({ pubchemCid: record.cid, modelId: 'pyscf-singlepoint', status: 'blocked', resultOrigin: 'missing-source-3d', outputs: {}, summary: 'BLOCKED: PubChem did not provide a valid 3D conformer.' });
        continue;
      }
      const response = await runQuantumSinglePoint({ atoms: source3d.atoms3d, charge: 0, spin: 0, basis: 'sto-3g', method: 'RHF' });
      if (response.ok) {
        const outputs = response.data.data;
        quantumCompute.push({ pubchemCid: record.cid, modelId: 'pyscf-singlepoint', modelVersion: String(response.data.meta?.engine ?? '').replace(/^PySCF /, ''), engine: response.data.meta?.engine ? String(response.data.meta.engine) : 'PySCF', status: 'ok', runId: response.data.runId, runFingerprint: fnv1a(canonicalJson(outputs)), resultOrigin: response.data.resultOrigin, outputs, summary: 'PySCF MODEL_ESTIMATE from a PubChem source-backed 3D conformer; not an observation.' });
      } else {
        quantumCompute.push({ pubchemCid: record.cid, modelId: 'pyscf-singlepoint', status: 'blocked', resultOrigin: 'engine-unavailable', outputs: {}, summary: `BLOCKED: ${response.error}` });
      }
    }
  }
  const enrichedReports = enrichReportsWithCompute([...base.reports.filter((r) => !r.candidateId.startsWith('candidate:pubchem:')), ...identityOnlyReports(sourceRecords)], cheapCompute, heavyCompute ?? [], admetCompute ?? [], quantumCompute, liveActivities, input.target);
  const combinationHypothesis = buildCandidateCombinationHypothesis(enrichedReports, input.target ? [input.target] : []);
  return { ...base, liveActivities, candidateWhy: buildCandidateWhy(liveActivities, input.target), cheapCompute, ...(heavyCompute === undefined ? {} : { heavyCompute }), ...(admetCompute === undefined ? {} : { admetCompute }), ...(input.executeHeavyCompute ? { quantumCompute } : {}), ...(combinationHypothesis === undefined ? {} : { combinationHypothesis }), neurobiology: A1_NEUROBIOLOGY_PROFILE, reason: `Pobrano ${sourceRecords.length} realnych rekordów z PubChem, ${liveActivities.length} jawnych rekordów activity z ChEMBL oraz wykonano ${cheapCompute.filter((run) => run.status === 'completed').length} tanich obliczeń${heavyCompute === undefined ? '' : `, ${heavyCompute.filter((run) => run.status === 'ok').length} RDKit heavy runów`}${admetCompute === undefined ? '' : ` i ${admetCompute.filter((run) => run.status === 'ok').length} ADMET-AI runów`}${input.executeHeavyCompute ? ` i ${quantumCompute.filter((run) => run.status === 'ok').length} PySCF runów` : ''}. Ranking zawiera jawny, ograniczony compute-support term; nie jest to efficacy ani safety score. ${base.reason}`, reports: enrichedReports };
}
