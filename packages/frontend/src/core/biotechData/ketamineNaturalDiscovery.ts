import {
  buildBiologicalValidationRequest,
  canonicalJson,
  compareCandidateDiscoveryReports,
  createCandidateDiscoveryReport,
  fnv1a,
  type BiotechProvenance,
  type BiologicalEvidence,
  type BiologicalTarget,
  type CandidateDiscoveryReport,
  type CandidateComparison,
  type CandidateRanking,
  type Compound,
  type SafetySignal,
  type TherapeuticCandidate,
  type TherapeuticHypothesis,
} from '../biotechDiscoveryContract';

export type KetamineEvidenceLevel = 'DIRECT_MEASUREMENT' | 'LITERATURE_SUPPORTED' | 'STRUCTURE_ONLY' | 'UNKNOWN' | 'REQUIRES_EXPERIMENT';

export interface KetamineReferenceMechanismProfile {
  referenceCompound: { name: string; pubchemCid: number; canonicalSmiles: string; inchiKey: string };
  primaryTarget: { label: string; targetId: string; status: 'LITERATURE_SUPPORTED'; uncertainty: string };
  mechanism: { label: string; status: 'LITERATURE_SUPPORTED'; uncertainty: string };
  functionalContext: { label: string; status: 'LITERATURE_SUPPORTED'; uncertainty: string };
  provenance: readonly BiotechProvenance[];
}

export interface KetamineEvidenceAxes {
  structural: KetamineEvidenceLevel;
  target: KetamineEvidenceLevel;
  functional: KetamineEvidenceLevel;
  mechanistic: KetamineEvidenceLevel;
  physicochemical: KetamineEvidenceLevel;
  admet: KetamineEvidenceLevel;
  evidenceQuality: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
}

export interface KetamineNaturalCandidate {
  name: string;
  pubchemCid: number;
  canonicalSmiles: string;
  inchiKey: string;
  formula: string;
  molecularWeight: number;
  naturalOccurrence: string;
  naturalOccurrenceStatus: 'LITERATURE_SUPPORTED';
  axes: KetamineEvidenceAxes;
  evidence: readonly { id: string; claim: string; level: KetamineEvidenceLevel; assayContext?: string; value?: string; units?: string; provenance: BiotechProvenance }[];
  falsification: readonly string[];
  uncertainty: string;
}

export interface KetamineNextExperiment {
  candidateIds: readonly string[];
  title: string;
  whatItTests: string;
  supports: string;
  falsifies: string;
  assayRequirements: readonly string[];
  status: 'REQUIRES_EXPERIMENT';
  uncertainty: string;
}

export interface KetamineNaturalDiscoveryResult {
  reference: KetamineReferenceMechanismProfile;
  candidates: readonly KetamineNaturalCandidate[];
  reports: readonly CandidateDiscoveryReport[];
  comparison: CandidateComparison;
  topCandidateIds: readonly string[];
  nextExperiment: KetamineNextExperiment;
  status: 'RESOLVED' | 'NOT_ENOUGH_EVIDENCE';
  claimCeiling: 'TARGET_SUPPORTED_CANDIDATE' | 'FUNCTIONALLY_SUPPORTED_CANDIDATE' | 'NOT_ENOUGH_EVIDENCE';
  uncertainty: string;
  scientificFingerprint: string;
}

const PUBCHEM_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid';
const KETAMINE_REVIEW = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5148235/';
const NATURAL_NMDAR_REVIEW = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3817734/';
const TRODUSQUEMINE_STUDY = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12220853/';
const AGMATINE_STUDY = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8255568/';
const RETRIEVED_AT = '2026-08-30';

const reference: KetamineReferenceMechanismProfile = {
  referenceCompound: { name: 'Ketamine', pubchemCid: 3821, canonicalSmiles: 'CNC1(CCCCC1=O)C2=CC=CC=C2Cl', inchiKey: 'YQEZLKZALYSWHR-UHFFFAOYSA-N' },
  primaryTarget: { label: 'N-methyl-D-aspartate receptor (NMDAR)', targetId: 'target:nmdar', status: 'LITERATURE_SUPPORTED', uncertainty: 'The target relationship is literature-supported; target involvement does not establish any candidate’s clinical efficacy.' },
  mechanism: { label: 'Noncompetitive, use-dependent open-channel block of NMDARs', status: 'LITERATURE_SUPPORTED', uncertainty: 'Ketamine has additional proposed targets and mechanisms; this profile deliberately does not reduce all ketamine pharmacology to one pathway.' },
  functionalContext: { label: 'Ion-channel antagonism with assay-, subtype-, voltage- and activation-context dependence', status: 'LITERATURE_SUPPORTED', uncertainty: 'The reference review discusses molecular and cellular effects but does not supply a universal mechanistic equivalence criterion for natural compounds.' },
  provenance: [{ source: 'PMC', sourceId: 'PMCID:PMC5148235 / PMID:27807158', evidenceType: 'ketamine NMDAR mechanism review', status: 'LITERATURE_SUPPORTED', sourceUrl: KETAMINE_REVIEW, sourceVersion: 'J Neurosci 2016;36:11158-11164', retrievedAt: RETRIEVED_AT }],
};

const target: BiologicalTarget = {
  kind: 'biological-target', id: 'target:nmdar', namespace: 'genesis-biotech', label: 'N-methyl-D-aspartate receptor (NMDAR)', status: 'LITERATURE_SUPPORTED', targetType: 'ionotropic glutamate receptor', provenance: reference.provenance,
};

function pubchemProvenance(cid: number): BiotechProvenance {
  return { source: 'PubChem', sourceId: `pubchem:CID:${cid}`, evidenceType: 'compound identity and structure', status: 'LITERATURE_SUPPORTED', sourceUrl: `${PUBCHEM_URL}/${cid}/property/Title,CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`, sourceVersion: `PubChem CID ${cid}`, retrievedAt: RETRIEVED_AT };
}

function literatureProvenance(sourceId: string, url: string, evidenceType: string): BiotechProvenance {
  return { source: 'PMC', sourceId, evidenceType, status: 'LITERATURE_SUPPORTED', sourceUrl: url, sourceVersion: sourceId, retrievedAt: RETRIEVED_AT };
}

const candidates: readonly KetamineNaturalCandidate[] = [
  {
    name: 'Trodusquemine', pubchemCid: 9917968, canonicalSmiles: 'CC(C)C(CCC(C)C1CCC2C1(CCC3C2C(CC4C3(CCC(C4)NCCCNCCCCNCCCN)C)O)C)OS(=O)(=O)O', inchiKey: 'WUJVPODXELZABP-FWJXURDUSA-N', formula: 'C37H72N4O5S', molecularWeight: 685.1,
    naturalOccurrence: 'Natural aminosterol originally isolated from dogfish shark (Squalus acanthias).', naturalOccurrenceStatus: 'LITERATURE_SUPPORTED',
    axes: { structural: 'UNKNOWN', target: 'DIRECT_MEASUREMENT', functional: 'DIRECT_MEASUREMENT', mechanistic: 'LITERATURE_SUPPORTED', physicochemical: 'STRUCTURE_ONLY', admet: 'UNKNOWN', evidenceQuality: 'HIGH' },
    evidence: [{ id: 'evidence:trodusquemine:nmdar-ic50', claim: 'Trodusquemine inhibits NMDA-induced ion currents in primary neurons after membrane pre-incubation.', level: 'DIRECT_MEASUREMENT', assayContext: 'Electrophysiological patch clamp in primary neurons', value: '5', units: 'nM IC50', provenance: literatureProvenance('PMCID:PMC12220853 / PMID:40123295', TRODUSQUEMINE_STUDY, 'primary functional NMDAR inhibition study') }],
    falsification: ['No inhibition in a blinded, pre-registered NMDAR functional assay under the reported membrane pre-incubation context.', 'Activity depends on a different receptor or membrane effect after appropriate receptor-selectivity controls.', 'A replicated assay shows no reproducible concentration-response relationship.'],
    uncertainty: 'Strongest current candidate in this bounded pool for direct NMDAR functional evidence, but no ketamine-equivalence, clinical efficacy, CNS exposure or safety conclusion is established.',
  },
  {
    name: 'Agmatine', pubchemCid: 199, canonicalSmiles: 'C(CCN=C(N)N)CN', inchiKey: 'QYPPJABKJHAVHS-UHFFFAOYSA-N', formula: 'C5H14N4', molecularWeight: 130.19,
    naturalOccurrence: 'Endogenous polyamine-related metabolite reported in mammalian nervous-system research.', naturalOccurrenceStatus: 'LITERATURE_SUPPORTED',
    axes: { structural: 'UNKNOWN', target: 'DIRECT_MEASUREMENT', functional: 'LITERATURE_SUPPORTED', mechanistic: 'LITERATURE_SUPPORTED', physicochemical: 'STRUCTURE_ONLY', admet: 'UNKNOWN', evidenceQuality: 'MODERATE' },
    evidence: [{ id: 'evidence:agmatine:glun2b', claim: 'Agmatine preferentially antagonizes GluN2B-containing NMDARs in integrated preclinical pharmacology.', level: 'DIRECT_MEASUREMENT', assayContext: 'Preclinical pharmacological study with GluN2B-containing NMDAR dependence', provenance: literatureProvenance('PMCID:PMC8255568 / PMID:34112870', AGMATINE_STUDY, 'agmatine NMDAR pharmacology study') }],
    falsification: ['No NMDAR-dependent effect after appropriate GluN2B and pathway controls.', 'Observed effects are fully explained by non-NMDAR targets or nonspecific toxicity.', 'A comparable functional assay fails to reproduce the reported antagonism.'],
    uncertainty: 'Target and preclinical functional evidence are not a demonstration of ketamine-like open-channel kinetics, antidepressant efficacy or clinical substitutability.',
  },
  {
    name: 'Curcumin', pubchemCid: 969516, canonicalSmiles: 'COC1=C(C=CC(=C1)C=CC(=O)CC(=O)C=CC2=CC(=C(C=C2)O)OC)O', inchiKey: 'VFLDPWHFBUODDF-FCXRPNKRSA-N', formula: 'C21H20O6', molecularWeight: 368.4,
    naturalOccurrence: 'Constituent of Curcuma longa (turmeric).', naturalOccurrenceStatus: 'LITERATURE_SUPPORTED',
    axes: { structural: 'UNKNOWN', target: 'LITERATURE_SUPPORTED', functional: 'LITERATURE_SUPPORTED', mechanistic: 'UNKNOWN', physicochemical: 'STRUCTURE_ONLY', admet: 'UNKNOWN', evidenceQuality: 'MODERATE' },
    evidence: [{ id: 'evidence:curcumin:nmda-calcium', claim: 'Curcumin reduced NMDA-elicited intracellular Ca2+ increase and neuronal injury in rat retinal neurons.', level: 'LITERATURE_SUPPORTED', assayContext: 'Rat retinal neuron NMDA stimulation and intracellular calcium/cell-death endpoints', provenance: literatureProvenance('PMCID:PMC3817734 / PMID:24276380', NATURAL_NMDAR_REVIEW, 'reviewed natural-compound NMDAR functional evidence') }],
    falsification: ['The effect disappears with receptor-specific controls or is absent in direct NMDAR functional recordings.', 'Protection is explained by antioxidant or downstream cytoprotective effects without NMDAR modulation.'],
    uncertainty: 'Functional protection against NMDA-associated injury is not equivalent to ketamine’s open-channel block or to a direct target interaction.',
  },
  {
    name: 'Isoliquiritigenin', pubchemCid: 638278, canonicalSmiles: 'C1=CC(=CC=C1C=CC(=O)C2=C(C=C(C=C2)O)O)O', inchiKey: 'DXDRHHKMWQZJHT-FPYGCLRLSA-N', formula: 'C15H12O4', molecularWeight: 256.25,
    naturalOccurrence: 'Flavonoid constituent reported in licorice-related herbal material.', naturalOccurrenceStatus: 'LITERATURE_SUPPORTED',
    axes: { structural: 'UNKNOWN', target: 'LITERATURE_SUPPORTED', functional: 'LITERATURE_SUPPORTED', mechanistic: 'LITERATURE_SUPPORTED', physicochemical: 'STRUCTURE_ONLY', admet: 'UNKNOWN', evidenceQuality: 'MODERATE' },
    evidence: [{ id: 'evidence:isoliquiritigenin:nmdar', claim: 'Isoliquiritigenin was reported among herbal constituents with NMDA receptor binding and follow-up neuronal Ca2+ effects.', level: 'LITERATURE_SUPPORTED', assayContext: 'Receptor-binding screening and neuronal NMDA-related Ca2+ follow-up', provenance: literatureProvenance('PMCID:PMC3817734 / PMID:24276380', NATURAL_NMDAR_REVIEW, 'reviewed natural-compound NMDAR binding and functional evidence') }],
    falsification: ['A direct receptor-selective assay fails to reproduce target engagement.', 'The neuronal effect is absent after controlling for nonspecific membrane, antioxidant or cytotoxic effects.'],
    uncertainty: 'The cited review does not establish ketamine-like channel kinetics, subtype profile, CNS exposure or clinical effect.',
  },
  {
    name: 'Squalamine', pubchemCid: 72495, canonicalSmiles: 'CC(C)C(CCC(C)C1CCC2C1(CCC3C2C(CC4C3(CCC(C4)NCCCNCCCCN)C)O)C)OS(=O)(=O)O', inchiKey: 'UIRKNQLZZXALBI-MSVGPLKSSA-N', formula: 'C34H65N3O5S', molecularWeight: 628.0,
    naturalOccurrence: 'Natural aminosterol originally isolated from dogfish shark (Squalus acanthias).', naturalOccurrenceStatus: 'LITERATURE_SUPPORTED',
    axes: { structural: 'UNKNOWN', target: 'UNKNOWN', functional: 'UNKNOWN', mechanistic: 'UNKNOWN', physicochemical: 'STRUCTURE_ONLY', admet: 'UNKNOWN', evidenceQuality: 'LOW' },
    evidence: [{ id: 'evidence:squalamine:natural-aminosterol', claim: 'Squalamine is a natural aminosterol discussed as structurally related to trodusquemine; this record does not promote that relationship into NMDAR activity.', level: 'LITERATURE_SUPPORTED', provenance: literatureProvenance('PMCID:PMC12220853 / PMID:40123295', TRODUSQUEMINE_STUDY, 'natural aminosterol identity and structural context') }],
    falsification: ['A direct NMDAR assay is negative after controlling for exposure and membrane partitioning; this would leave the candidate as natural identity/structure only.'],
    uncertainty: 'Natural occurrence and structural context are source-backed, but candidate-specific NMDAR target/function evidence is not admitted here.',
  },
];

function makeReport(candidate: KetamineNaturalCandidate): CandidateDiscoveryReport {
  const candidateId = `candidate:ketamine-natural:pubchem:${candidate.pubchemCid}`;
  const compoundId = `compound:pubchem:${candidate.pubchemCid}`;
  const materialId = `material:natural:${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const mechanismId = `mechanism:nmdar:${candidate.pubchemCid}`;
  const hypothesisId = `hypothesis:ketamine-natural:${candidate.pubchemCid}`;
  const pubchem = pubchemProvenance(candidate.pubchemCid);
  const evidenceRecords: BiologicalEvidence[] = candidate.evidence.map((evidence) => ({ kind: 'biological-evidence', id: evidence.id, namespace: 'genesis-biotech', label: evidence.claim, status: evidence.level === 'DIRECT_MEASUREMENT' ? 'OBSERVED' : 'LITERATURE_SUPPORTED', claim: evidence.claim, subjectIds: [compoundId, target.id], provenance: [evidence.provenance] }));
  const safety: SafetySignal = { kind: 'safety-signal', id: `safety:unknown:ketamine-natural:${candidate.pubchemCid}`, namespace: 'genesis-biotech', label: `${candidate.name} safety unknown in this comparison`, status: 'UNKNOWN', signalType: 'uncertainty', description: 'No clinical safety conclusion is inferred from this NMDAR evidence comparison.', evidenceQuality: 'UNKNOWN', uncertainty: 'Dedicated ADMET, exposure and clinical safety evidence is not admitted by this bounded case.', provenance: [pubchem] };
  const compound: Compound = { kind: 'compound', id: compoundId, namespace: 'genesis-biotech', label: candidate.name, status: 'LITERATURE_SUPPORTED', structureRef: candidate.canonicalSmiles, parentMaterialIds: [materialId], provenance: [pubchem] };
  const mechanism = { kind: 'mechanism' as const, id: mechanismId, namespace: 'genesis-biotech', label: `${candidate.name}–NMDAR relationship`, status: 'HYPOTHESIS' as const, targetIds: [target.id], description: `${candidate.name} has a source-backed NMDAR-related record at the stated evidence level. This is not a claim of ketamine-equivalent channel kinetics, downstream mechanism or efficacy.`, provenance: candidate.evidence.map((evidence) => evidence.provenance) };
  const therapeuticCandidate: TherapeuticCandidate = { kind: 'therapeutic-candidate', id: candidateId, namespace: 'genesis-biotech', label: candidate.name, status: 'HYPOTHESIS', materialId, compoundIds: [compound.id], targetIds: candidate.axes.target === 'UNKNOWN' ? [] : [target.id], mechanismIds: [mechanism.id], supportingEvidenceIds: evidenceRecords.map((record) => record.id), safetySignalIds: [safety.id], hypothesisIds: [hypothesisId], provenance: [pubchem, ...candidate.evidence.map((evidence) => evidence.provenance)] };
  const hypothesis: TherapeuticHypothesis = { kind: 'therapeutic-hypothesis', id: hypothesisId, namespace: 'genesis-biotech', label: `${candidate.name} as a ketamine-like NMDAR research analogue`, status: 'HYPOTHESIS', claim: `${candidate.name} is a natural research candidate with the listed NMDAR evidence axes; mechanistic similarity to ketamine remains bounded by the evidence and unknown axes.`, candidateId, targetIds: therapeuticCandidate.targetIds, mechanismIds: [mechanism.id], supportingEvidenceIds: therapeuticCandidate.supportingEvidenceIds, safetySignalIds: [safety.id], provenance: [pubchem, ...candidate.evidence.map((evidence) => evidence.provenance)] };
  const evidenceScore = { HIGH: 1, MODERATE: 0.66, LOW: 0.33, UNKNOWN: 0 }[candidate.axes.evidenceQuality];
  const targetRelevance = candidate.axes.target === 'DIRECT_MEASUREMENT' ? 1 : candidate.axes.target === 'LITERATURE_SUPPORTED' ? 0.66 : 0;
  const uncertaintyPenalty = Number(((Object.values(candidate.axes).filter((value) => value === 'UNKNOWN' || value === 'REQUIRES_EXPERIMENT').length / 7)).toFixed(4));
  const ranking: CandidateRanking = { candidateId, score: Number((0.5 * evidenceScore + 0.35 * targetRelevance - 0.15 * uncertaintyPenalty).toFixed(4)), components: { evidenceQuality: evidenceScore, targetRelevance, safetyPenalty: 0, uncertaintyPenalty }, rationale: 'Deterministic research-priority ordering uses only declared evidence quality, target evidence and uncertainty. It is not efficacy, probability, safety or proof of ketamine equivalence.', uncertainty: candidate.uncertainty, epistemicStatus: 'PREDICTION' };
  const experimentRequest = buildBiologicalValidationRequest({ hypothesisId, candidateId, targetIds: therapeuticCandidate.targetIds });
  return createCandidateDiscoveryReport({ candidate: therapeuticCandidate, hypothesis, experimentRequest, ranking, admeProfile: { source: 'PubChem', status: 'UNKNOWN', metrics: [{ name: 'ADMET', value: 'UNKNOWN', units: '', context: 'No candidate-specific ADMET evidence admitted in this bounded case.' }], uncertainty: candidate.uncertainty, provenance: [pubchem] }, uncertainty: `${candidate.uncertainty} Falsification criteria: ${candidate.falsification.join(' ')}` });
}

export function runKetamineNaturalDiscovery(): KetamineNaturalDiscoveryResult {
  const reports = candidates.map(makeReport);
  const comparison = compareCandidateDiscoveryReports(reports);
  const topCandidateIds = comparison.rows.filter((row) => row.rank <= 2).map((row) => row.candidateId);
  const nextExperiment: KetamineNextExperiment = { candidateIds: topCandidateIds, title: 'Pre-registered NMDAR functional comparison against ketamine', whatItTests: 'Whether top natural candidates produce reproducible, concentration-dependent NMDAR inhibition under a shared receptor construct, agonist, membrane pre-incubation and electrophysiological readout.', supports: 'A candidate-specific concentration-response relationship with receptor-selective controls and a kinetic profile that is compatible with the declared hypothesis.', falsifies: 'No reproducible target-specific inhibition, activity only under nonspecific toxicity/membrane disruption, or a kinetic/selectivity profile inconsistent with the hypothesis.', assayRequirements: ['shared NMDAR construct/subtype and agonist conditions', 'electrophysiological current or validated functional calcium readout', 'concentration-response with independent replicates', 'vehicle, positive-control ketamine and receptor-selectivity controls'], status: 'REQUIRES_EXPERIMENT', uncertainty: 'No cost, duration, availability or success probability is inferred. This is a protocol-level discriminator, not a performed experiment.' };
  const basis = { reference, candidates, reports, comparison, topCandidateIds, nextExperiment, claimCeiling: 'FUNCTIONALLY_SUPPORTED_CANDIDATE' as const };
  return { ...basis, status: 'RESOLVED', uncertainty: 'This bounded case identifies the strongest evidence-supported natural NMDAR research candidates in the admitted pool. It does not establish ketamine replacement, clinical efficacy, safety, CNS exposure or experimental validation.', scientificFingerprint: fnv1a(canonicalJson(basis)) };
}

export function ketamineNaturalDiscoverySummary(result = runKetamineNaturalDiscovery()): string {
  const top = result.comparison.rows.slice(0, 3).map((row) => `${row.rank}. ${result.candidates.find((candidate) => row.candidateId.endsWith(String(candidate.pubchemCid)))?.name ?? row.candidateId} (${row.score}; ${row.epistemicStatus})`);
  return [`KETAMINE-LIKE NATURAL DISCOVERY — ${result.status}`, `Reference mechanism: ${result.reference.mechanism.label} · ${result.reference.primaryTarget.label}`, `Top research-priority candidates: ${top.join('; ')}`, `Claim ceiling: ${result.claimCeiling}`, `Next experiment: ${result.nextExperiment.title} · ${result.nextExperiment.status}`, result.uncertainty].join('\n');
}
