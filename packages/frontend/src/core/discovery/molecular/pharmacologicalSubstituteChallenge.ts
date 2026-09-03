/**
 * MECHANISTIC SUBSTITUTE CHALLENGE — natural/lower-harm candidates scored
 * against a reference pharmacology profile by a 7-axis, weighted Mechanistic
 * Match Score, with a 95% acceptance threshold.
 *
 * CONCRETE CASE BUILT HERE: alprazolam (Xanax) — a GABA-A receptor,
 * benzodiazepine-binding-site, positive allosteric modulator, used STRICTLY
 * as a mechanism/target reference for comparison. This module never designs
 * a new compound, never optimises potency, dependence, or any "recreational"
 * property, and never proposes a synthesis route for a controlled substance.
 * Its only output is a mechanistic comparison against real, cited natural
 * candidates — the same discipline `naturalCompoundDiscoveryChallenge.ts`
 * already applies to ketamine.
 *
 * REUSES, DOES NOT RE-DERIVE (nothing in `epistemicEngine.ts`,
 * `experimentSelection.ts`, or `epistemicReasoningLoop.ts` is modified):
 *   - the epistemic reasoning loop, unchanged;
 *   - `crossValidateCandidate` / `naturalProductCandidatePool.ts`'s
 *     `CuratedNaturalCandidate` contract (reused for a second, real pool —
 *     see gabaBenzodiazepineCandidatePool.ts);
 *   - `evaluateStructuralSimilarity` (structuralSimilarity.ts);
 *   - `falsifyCandidateMechanism` (mechanismFalsification.ts) — its
 *     WRONG_TARGET check is reused AS THE COMPUTED targetMatch axis of the
 *     Mechanistic Match Score, rather than re-deriving target overlap;
 *   - `assessIndependentEvidence` (independentEvidence.ts);
 *   - `deriveConfidence` (confidenceLadder.ts);
 *   - real ADMET-AI batch prediction (admetProvider.ts);
 *   - `candidateFromCrossValidated` (naturalAnalogueCampaign.ts).
 *
 * WHAT IS GENUINELY NEW: `mechanisticMatchScore.ts` (the weighted 7-axis
 * formula and 95% threshold) and this module's wiring of it into the
 * existing reasoning loop as the SUPPORTED gate, replacing the confidence-
 * ladder-only threshold `naturalCompoundDiscoveryChallenge.ts` uses. Six of
 * the seven axes (mechanism/direction/assay/quantitative/selectivity/safety)
 * are declared from real literature per candidate below, honestly tagged
 * with their evidence basis; the seventh (target match) is COMPUTED from
 * the real, existing WRONG_TARGET mechanism check, never hand-declared.
 *
 * HONESTY LIMIT, DISCLOSED: no formal knowledge-pack ingestion of a
 * verified, structured alprazolam-vs-candidate quantitative binding
 * measurement exists in this runtime (unlike ketamine's ingested Gilling
 * 2009 IC50). The ASSAY_MATCH and QUANTITATIVE_COMPARABILITY axes are
 * therefore UNKNOWN for every candidate here — contributing zero to the
 * score but never reported as a negative finding. This mathematically caps
 * the achievable score at 80% (100% minus the unknown 10%+10%) until that
 * ingestion work is done — a real, structural reason a 95% threshold is not
 * reachable yet, not evidence any candidate mechanistically fails.
 */
import { admetApplicability, type AdmetTransport } from './admetTransport';
import { admetPropertiesFor, runAdmetBatch } from './admetProvider';
import { candidateFromCrossValidated } from './naturalAnalogueCampaign';
import {
  crossValidateCandidate,
  type CuratedNaturalCandidate,
  type StructuralCrossValidation,
} from './naturalProductCandidatePool';
import { GABA_BENZODIAZEPINE_CANDIDATE_POOL } from './gabaBenzodiazepineCandidatePool';
import { falsifyCandidateMechanism, type MechanismFalsificationReport } from './mechanismFalsification';
import { assessIndependentEvidence, type EvidenceAxisEntry, type IndependentEvidenceAssessment } from './independentEvidence';
import { deriveConfidence, type ComputationalConfidenceLevel } from './confidenceLadder';
import { evaluateStructuralSimilarity, type StructuralSimilarityResult } from './structuralSimilarity';
import {
  computeMechanisticMatchScore,
  MECHANISTIC_MATCH_THRESHOLD,
  type MechanisticAxisInput,
  type MechanisticMatchInputs,
  type MechanisticMatchResult,
} from '../mechanisticMatchScore';
import type { MoleculeCandidate } from './types';
import type { RdkitTransport } from './rdkitTransport';
import {
  buildEpistemicEdge,
  buildEpistemicGraph,
  buildEpistemicNode,
  explainUnknown,
  type EpistemicGraph,
  type EpistemicStatus,
  type StatusUpdate,
} from '../epistemicEngine';
import { runReasoningLoop, type ReasoningDomainAdapter, type ReasoningExecutionResult, type ReasoningLoopResult } from '../epistemicReasoningLoop';
import type { CandidateExperimentSpec } from '../experimentSelection';
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';

export const PHARMACOLOGICAL_SUBSTITUTE_CHALLENGE_VERSION = '1.0.0';

export interface PharmacologicalReference {
  name: string;
  smiles: string;
  targetKeywords: readonly string[];
  targetDescription: string;
  mechanismDescription: string;
  citation: string;
}

/** The six axes declared per candidate from real literature; targetMatch is always COMPUTED, never declared here. */
export type DeclaredMechanisticAxes = Omit<MechanisticMatchInputs, 'targetMatch'>;

export interface MechanisticSubstituteChallengeConfig {
  reference: PharmacologicalReference;
  pool: readonly CuratedNaturalCandidate[];
  axisInputsByCandidateKey: Readonly<Record<string, DeclaredMechanisticAxes>>;
  question: string;
}

// ---------------------------------------------------------------------------
// THE CONCRETE CASE: alprazolam (Xanax) vs a real, curated GABA-A pool.
// ---------------------------------------------------------------------------

/** SMILES cross-checked against this repository's real RDKit worker in this session: resolves to canonical formula C17H13ClN4, MW 308.08 (monoisotopic) — matches alprazolam's real, well-established composition. */
export const ALPRAZOLAM_REFERENCE: PharmacologicalReference = {
  name: 'alprazolam',
  smiles: 'Cc1nnc2n1-c1ccc(Cl)cc1C(c1ccccc1)=NC2',
  targetKeywords: ['gaba'],
  targetDescription: 'GABA-A receptor (benzodiazepine binding site)',
  mechanismDescription: 'Positive allosteric modulator: potentiates GABA-gated chloride currents at the GABA-A receptor benzodiazepine binding site.',
  citation: 'Established benzodiazepine-class pharmacology (triazolobenzodiazepine); used here strictly as a mechanism/target reference, never as a target to reproduce or improve.',
};

const DECLARED_AXES: Readonly<Record<string, DeclaredMechanisticAxes>> = {
  apigenin: {
    mechanismMatch: { grade: 'PARTIAL', basis: 'LITERATURE_SUPPORTED', rationale: 'Reported as a central benzodiazepine-site ligand, but described (Viola 1995) as behaviourally dissociable from full benzodiazepine agonism (no reported sedation/myorelaxation at anxiolytic doses) — a real, but only partial, mechanistic match.' },
    directionMatch: { grade: 'MATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Both are positive-direction (facilitatory) ligands at the GABA-A/benzodiazepine complex, not antagonists.' },
    assayMatch: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested, structured, comparable-assay record exists for apigenin vs alprazolam in this runtime.' },
    quantitativeComparability: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested Ki/IC50 pack exists for apigenin vs alprazolam in this runtime.' },
    selectivity: { grade: 'PARTIAL', basis: 'LITERATURE_SUPPORTED', rationale: 'Apigenin has other well-documented pharmacological targets (e.g. kinase, aromatase modulation) beyond GABA-A, so selectivity is lower than expected of a purpose-built ligand.' },
    safetyAdvantage: { grade: 'MATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Cited study reports anxiolytic-like effect without the sedative/myorelaxant/amnestic profile of classical benzodiazepines at tested doses — a real, documented (if not comprehensively characterised in humans) safety-relevant finding.' },
  },
  chrysin: {
    mechanismMatch: { grade: 'PARTIAL', basis: 'LITERATURE_SUPPORTED', rationale: 'Reported central benzodiazepine-site ligand (Wolfman 1994), similarly described without the full classical benzodiazepine behavioural profile — partial mechanistic match.' },
    directionMatch: { grade: 'MATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Positive-direction ligand at the GABA-A/benzodiazepine complex, consistent direction with the reference.' },
    assayMatch: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested, structured, comparable-assay record exists for chrysin vs alprazolam in this runtime.' },
    quantitativeComparability: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested Ki/IC50 pack exists for chrysin vs alprazolam in this runtime.' },
    selectivity: { grade: 'PARTIAL', basis: 'LITERATURE_SUPPORTED', rationale: 'Chrysin has other documented targets (e.g. aromatase inhibition) and well-documented poor oral bioavailability, lowering effective selectivity/exposure relative to a purpose-built ligand.' },
    safetyAdvantage: { grade: 'MATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Cited study reports anxiolytic-like activity without the classical benzodiazepine sedative/muscle-relaxant profile at tested doses.' },
  },
  honokiol: {
    mechanismMatch: { grade: 'PARTIAL', basis: 'LITERATURE_SUPPORTED', rationale: 'Reported positive modulator of GABA-A receptor activity, but the specific binding site relative to the classical benzodiazepine site is not clearly established in the cited literature — a real but incompletely characterised mechanistic match.' },
    directionMatch: { grade: 'MATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Positive (facilitatory) modulation, consistent direction with the reference.' },
    assayMatch: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested, structured, comparable-assay record exists for honokiol vs alprazolam in this runtime.' },
    quantitativeComparability: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested Ki/IC50 pack exists for honokiol vs alprazolam in this runtime.' },
    selectivity: { grade: 'MISMATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Honokiol carries numerous other well-documented pharmacological activities (anti-inflammatory, anti-tumour pathways among others), making it a comparatively non-selective compound relative to the reference.' },
    safetyAdvantage: { grade: 'MATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Cited study reports anxiolytic-like activity specifically without the diazepam-like sedative/motor-impairing side-effect profile.' },
  },
  'valerenic-acid': {
    mechanismMatch: { grade: 'PARTIAL', basis: 'CONFLICTING', rationale: 'Khom et al. 2007 report valerenic acid acting at a GABA-A beta-subunit-specific site distinct from the classical benzodiazepine alpha/gamma interface site — a related but structurally different mechanism.' },
    directionMatch: { grade: 'PARTIAL', basis: 'CONFLICTING', rationale: 'The cited study\'s own title reports valerenic acid BOTH potentiating AND inhibiting GABA-A receptors depending on subunit composition — a genuine, disclosed directional conflict, not a clean single-direction match.' },
    assayMatch: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested, structured, comparable-assay record exists for valerenic acid vs alprazolam in this runtime.' },
    quantitativeComparability: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested Ki/IC50 pack exists for valerenic acid vs alprazolam in this runtime.' },
    selectivity: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No cross-validated structure exists for this candidate in this runtime, so no computational selectivity assessment (RDKit/ADMET) could be attempted.' },
    safetyAdvantage: { grade: 'PARTIAL', basis: 'LITERATURE_SUPPORTED', rationale: 'Valerian root has a long documented history of traditional use as a mild sedative without benzodiazepine-like dependence liability, though rigorous comparative human safety data is limited.' },
  },
  curcumin: {
    mechanismMatch: { grade: 'MISMATCH', basis: 'LITERATURE_SUPPORTED', rationale: 'Best-established mechanisms (NF-kB/COX-2 inhibition, Nrf2 antioxidant pathway) are unrelated to GABA-A receptor pharmacology.' },
    directionMatch: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'Direction of action at an unrelated target is not meaningfully comparable to the reference\'s GABA-A mechanism.' },
    assayMatch: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested, structured, comparable-assay record exists.' },
    quantitativeComparability: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'No ingested Ki/IC50 pack exists.' },
    selectivity: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'Not meaningfully assessed once the target itself does not match.' },
    safetyAdvantage: { grade: 'UNKNOWN', basis: 'NOT_AVAILABLE', rationale: 'Not meaningfully assessed once the target itself does not match.' },
  },
};

export const ALPRAZOLAM_SUBSTITUTE_CHALLENGE: MechanisticSubstituteChallengeConfig = {
  reference: ALPRAZOLAM_REFERENCE,
  pool: GABA_BENZODIAZEPINE_CANDIDATE_POOL,
  axisInputsByCandidateKey: DECLARED_AXES,
  question:
    'Which natural compounds in the curated GABA-A pool reach a Mechanistic Match Score of at least 95% against alprazolam\'s GABA-A benzodiazepine-site positive-allosteric-modulator mechanism (used strictly as a reference), as a step toward identifying a potentially lower-harm natural alternative — never a claim of clinical equivalence?',
};

// ---------------------------------------------------------------------------
// GENERIC MACHINERY — parameterised over ANY PharmacologicalReference + pool.
// ---------------------------------------------------------------------------

const ADMET_BATCH_COST = 5;
const INVESTIGATE_COST = 1;

function hypothesisId(candidateKey: string): string { return `hyp-${candidateKey}`; }
function investigateExperimentId(candidateKey: string): string { return `investigate-${candidateKey}`; }
const ADMET_BATCH_EXPERIMENT_ID = 'admet-batch';
const FACT_NODE_ID = 'fact-reference';
const UNKNOWN_NODE_ID = 'unknown-quantitative-comparability';
const CLAIM_EQUIVALENCE_ID = 'claim-clinical-equivalence';
const GRAPH_ID = 'pharmacological-substitute-challenge';

function priorityScore(candidate: CuratedNaturalCandidate): number {
  const hasStructure = candidate.structure.kind === 'SMILES_CROSS_VALIDATED';
  return candidate.naturalOccurrenceEvidence.length + candidate.mechanismEvidence.length + (hasStructure ? 1 : 0);
}

function candidatesWithStructure(pool: readonly CuratedNaturalCandidate[]): readonly CuratedNaturalCandidate[] {
  return pool.filter((c) => c.structure.kind === 'SMILES_CROSS_VALIDATED');
}

function citedSources(candidate: CuratedNaturalCandidate) {
  return [
    ...candidate.naturalOccurrenceEvidence.map((e) => ({ sourceKey: e.reference, kind: 'LITERATURE' as const, cited: true })),
    ...candidate.mechanismEvidence.map((e) => ({ sourceKey: e.identifier, kind: 'LITERATURE' as const, cited: true })),
  ];
}

export function buildInitialSubstituteChallengeGraph(config: MechanisticSubstituteChallengeConfig): EpistemicGraph {
  const { reference, pool } = config;
  const fact = buildEpistemicNode({
    nodeId: FACT_NODE_ID, kind: 'FACT', domainId: 'CHEMISTRY',
    statement: `${reference.name} is an established ${reference.targetDescription} — ${reference.mechanismDescription} Used here strictly as a mechanism/target reference for comparison, never as a target to reproduce or improve on.`,
    status: 'ESTABLISHED', statusReason: reference.citation,
    provenance: [`reference:${reference.name}`],
  });

  const hypotheses = pool.map((c) => buildEpistemicNode({
    nodeId: hypothesisId(c.candidateKey), kind: 'HYPOTHESIS', domainId: 'CHEMISTRY',
    statement: `${c.compoundName} reaches a Mechanistic Match Score of at least ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% against ${reference.name}'s mechanism.`,
    status: 'UNRESOLVED', statusReason: 'Not yet investigated.',
    provenance: [`candidatePool:${c.candidateKey}`],
  }));

  const investigateExperiments = pool.map((c) => buildEpistemicNode({
    nodeId: investigateExperimentId(c.candidateKey), kind: 'EXPERIMENT', domainId: 'CHEMISTRY',
    statement: `Run the real cheap battery for ${c.compoundName}: RDKit structural cross-validation, RDKit similarity to ${reference.name}, mechanism-level falsification (computes the real TARGET_MATCH axis), independent-evidence aggregation, and the Mechanistic Match Score.`,
    status: 'UNRESOLVED', statusReason: 'Not yet executed.',
    provenance: ['naturalProductCandidatePool.ts:crossValidateCandidate', 'mechanismFalsification.ts:falsifyCandidateMechanism', 'mechanisticMatchScore.ts:computeMechanisticMatchScore'],
  }));

  const admetBatchExperiment = buildEpistemicNode({
    nodeId: ADMET_BATCH_EXPERIMENT_ID, kind: 'EXPERIMENT', domainId: 'CHEMISTRY',
    statement: 'Run a real ADMET-AI batch prediction over every still-open, structurally-confirmed candidate, and re-check mechanism falsification with that additional real toxicity-signal axis.',
    status: 'UNRESOLVED', statusReason: 'Not yet executed.',
    provenance: ['admetProvider.ts:runAdmetBatch'],
  });

  const unknown = buildEpistemicNode({
    nodeId: UNKNOWN_NODE_ID, kind: 'UNKNOWN', domainId: 'CHEMISTRY',
    statement: `Whether any candidate has a real, ingested, same-assay quantitative binding measurement (Ki/IC50) comparable to ${reference.name}'s.`,
    status: 'UNKNOWN', statusReason: 'No formal knowledge-pack ingestion of a verified, structured comparable measurement exists for this reference in this runtime.',
    provenance: ['pharmacologicalSubstituteChallenge.ts: ASSAY_MATCH and QUANTITATIVE_COMPARABILITY axes are UNKNOWN for every candidate'],
    unknownDetail: {
      whatIsUnknown: `Whether any candidate has a real, ingested, same-assay quantitative binding measurement comparable to ${reference.name}'s.`,
      whyUnknown: 'No formal knowledge-pack ingestion pipeline (of the kind built for ketamine\'s Gilling 2009 IC50) exists yet for this reference; live database lookup is blocked in this runtime.',
      missingEvidence: ['an independently ingested, same-assay Ki/IC50 (or equivalent) measurement for a candidate against the reference target'],
      competingHypothesisIds: pool.map((c) => hypothesisId(c.candidateKey)),
      potentialResolution: 'Ingest a peer-reviewed radioligand-binding or electrophysiology measurement pack for one or more candidates against the reference target, in an assay comparable to how the reference itself is characterised — the same discipline already used for ketamine\'s ingested NMDAR measurement.',
    },
  });

  const claimEquivalence = buildEpistemicNode({
    nodeId: CLAIM_EQUIVALENCE_ID, kind: 'DERIVED', domainId: 'CHEMISTRY',
    statement: `No candidate in this pool is asserted to be a clinical or functional equivalent or substitute for ${reference.name}.`,
    status: 'UNRESOLVED', statusReason: 'Depends entirely on the quantitative-comparability UNKNOWN, which this module has no way to resolve without new data ingestion.',
    provenance: ['This claim is structurally prevented from resolving — see unknown-quantitative-comparability.'],
  });

  const edges = [
    ...pool.flatMap((c) => [
      buildEpistemicEdge({ edgeId: `e-tests-${c.candidateKey}`, from: investigateExperimentId(c.candidateKey), to: hypothesisId(c.candidateKey), relation: 'TESTS', rationale: 'The cheap battery evaluates this hypothesis directly.' }),
      buildEpistemicEdge({ edgeId: `e-derived-${c.candidateKey}`, from: hypothesisId(c.candidateKey), to: FACT_NODE_ID, relation: 'DERIVED_FROM', rationale: 'The hypothesis is framed relative to the established reference mechanism.' }),
    ]),
    ...candidatesWithStructure(pool).map((c) => buildEpistemicEdge({
      edgeId: `e-admet-tests-${c.candidateKey}`, from: ADMET_BATCH_EXPERIMENT_ID, to: hypothesisId(c.candidateKey), relation: 'TESTS',
      rationale: 'ADMET-AI can only run on candidates with a real, cross-validated structure.',
    })),
    buildEpistemicEdge({ edgeId: 'e-claim-depends-on-unknown', from: CLAIM_EQUIVALENCE_ID, to: UNKNOWN_NODE_ID, relation: 'DEPENDS_ON', rationale: 'A clinical/functional equivalence or substitution claim requires the quantitative comparison this pool cannot supply.' }),
  ];

  return buildEpistemicGraph(GRAPH_ID, [fact, ...hypotheses, ...investigateExperiments, admetBatchExperiment, unknown, claimEquivalence], edges);
}

export interface SubstituteCandidateFinding {
  candidateKey: string;
  crossValidation: StructuralCrossValidation;
  similarity: StructuralSimilarityResult | null;
  mechanismReport: MechanismFalsificationReport;
  independentEvidence: IndependentEvidenceAssessment;
  confidenceLevel: ComputationalConfidenceLevel;
  mechanisticMatch: MechanisticMatchResult;
  admetRan: boolean;
  moleculeCandidate: MoleculeCandidate | null;
}

/** The targetMatch axis is COMPUTED from the real WRONG_TARGET check — never hand-declared. */
function computedTargetMatchAxis(mechanismReport: MechanismFalsificationReport): MechanisticAxisInput {
  const check = mechanismReport.checks.find((c) => c.checkId === 'WRONG_TARGET')!;
  return {
    grade: check.outcome === 'PASS' ? 'MATCH' : 'MISMATCH',
    basis: 'COMPUTATIONALLY_SUPPORTED',
    rationale: `Computed from the real target-family keyword-overlap check: ${check.finding}`,
  };
}

function investigateSubstituteCandidate(
  rdkit: RdkitTransport,
  candidate: CuratedNaturalCandidate,
  config: MechanisticSubstituteChallengeConfig,
): SubstituteCandidateFinding {
  const crossValidation = crossValidateCandidate(rdkit, candidate);
  const similarity = candidate.structure.kind === 'SMILES_CROSS_VALIDATED'
    ? evaluateStructuralSimilarity(rdkit, candidate.structure.smiles, config.reference.smiles)
    : null;

  const mechanismReport = falsifyCandidateMechanism({
    candidateKey: candidate.candidateKey,
    reportedTargetFamily: candidate.reportedTargetFamily,
    referenceTargetKeywords: config.reference.targetKeywords,
    naturalOccurrenceCited: candidate.naturalOccurrenceEvidence.length > 0,
    mechanismEvidenceCount: candidate.mechanismEvidence.length,
    structuralStatus: crossValidation.status,
    admetToxicitySignals: [],
    admetInDomain: null,
  });

  const axes: EvidenceAxisEntry[] = [
    { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: candidate.naturalOccurrenceEvidence.length > 0, detail: candidate.naturalOccurrenceEvidence.map((e) => e.reference).join('; ') || 'None.' },
    { axis: 'MECHANISM_LITERATURE', present: candidate.mechanismEvidence.length > 0, detail: candidate.mechanismEvidence.map((e) => e.identifier).join('; ') || 'None.' },
    { axis: 'DATABASE_RECORD', present: false, detail: 'PubChem/ChEMBL live lookup is blocked in this runtime; no independent database record was retrieved.' },
    { axis: 'STRUCTURAL_COMPUTATION', present: crossValidation.status === 'CONFIRMED', detail: crossValidation.reason },
    { axis: 'ADMET_PREDICTION', present: false, detail: 'Not yet run.' },
    { axis: 'TARGET_DOCKING', present: false, detail: 'Genesis has no docking engine available in this runtime.' },
  ];
  const independentEvidence = assessIndependentEvidence(candidate.candidateKey, axes, []);

  const confidenceLevel = deriveConfidence({
    hasHypothesis: true,
    independentSources: citedSources(candidate),
    completedComputationalChecks: crossValidation.status === 'CONFIRMED' || crossValidation.status === 'MISMATCH' ? ['RDKIT_STRUCTURAL'] : [],
  });

  const declared = config.axisInputsByCandidateKey[candidate.candidateKey];
  if (declared === undefined) throw new Error(`No declared mechanistic axis inputs for candidate "${candidate.candidateKey}".`);
  const mechanisticMatch = computeMechanisticMatchScore(candidate.candidateKey, config.reference.name, {
    targetMatch: computedTargetMatchAxis(mechanismReport),
    ...declared,
  });

  const moleculeCandidate = candidate.structure.kind === 'SMILES_CROSS_VALIDATED' ? candidateFromCrossValidated(candidate.candidateKey, candidate.structure.smiles, rdkit) : null;

  return { candidateKey: candidate.candidateKey, crossValidation, similarity, mechanismReport, independentEvidence, confidenceLevel, mechanisticMatch, admetRan: false, moleculeCandidate };
}

/**
 * SUPPORTED requires the Mechanistic Match Score to clear the declared 95%
 * threshold — this is the substitute-challenge's acceptance gate, replacing
 * the confidence-ladder-only rule `naturalCompoundDiscoveryChallenge.ts`
 * uses. Mechanism-level falsification and real directional conflicts still
 * take priority: a wrong-target candidate is FALSIFIED regardless of score,
 * and a candidate whose own literature reports direction conflict is
 * WEAKENED, never silently scored past that into SUPPORTED.
 */
function statusFromSubstituteFinding(finding: SubstituteCandidateFinding): { status: EpistemicStatus; reason: string } {
  if (finding.mechanismReport.verdict !== 'RETAINED') {
    return { status: 'FALSIFIED', reason: `Mechanism-level falsification rejected this candidate: ${finding.mechanismReport.reason}` };
  }
  const conflicting = finding.mechanisticMatch.axes.filter((a) => a.basis === 'CONFLICTING');
  if (conflicting.length > 0) {
    return { status: 'WEAKENED', reason: `Real literature reports conflicting/context-dependent evidence on ${conflicting.map((a) => a.axis).join(', ')}: ${conflicting.map((a) => a.rationale).join(' ')}` };
  }
  if (finding.mechanisticMatch.meetsThreshold) {
    return {
      status: 'SUPPORTED',
      reason: `Mechanistic Match Score ${finding.mechanisticMatch.totalScorePercent.toFixed(1)}% meets the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% threshold. This is a mechanistic comparison score, NOT a claim of clinical efficacy or proven pharmacological equivalence — no functional/potency measurement exists for this candidate in this runtime.`,
    };
  }
  return {
    status: 'UNRESOLVED',
    reason: `Mechanistic Match Score ${finding.mechanisticMatch.totalScorePercent.toFixed(1)}% does not yet meet the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% threshold (${(finding.mechanisticMatch.unknownWeight * 100).toFixed(1)} percentage point(s) unresolved due to missing evidence, not counted as refutation).`,
  };
}

export function buildMechanisticSubstituteChallengeAdapter(
  config: MechanisticSubstituteChallengeConfig,
  engines: { rdkit: RdkitTransport; admet: AdmetTransport },
): { adapter: ReasoningDomainAdapter; findings: Map<string, SubstituteCandidateFinding> } {
  const { pool } = config;
  const findings = new Map<string, SubstituteCandidateFinding>();
  const byKey = new Map(pool.map((c) => [c.candidateKey, c]));

  function generateCandidates(graph: EpistemicGraph): readonly CandidateExperimentSpec[] {
    const specs: CandidateExperimentSpec[] = [];
    for (const candidate of pool) {
      const node = graph.nodes.find((n) => n.nodeId === investigateExperimentId(candidate.candidateKey))!;
      if (node.status !== 'UNRESOLVED') continue;
      specs.push({
        experimentId: investigateExperimentId(candidate.candidateKey),
        targetHypothesisIds: [hypothesisId(candidate.candidateKey)],
        predictions: { [hypothesisId(candidate.candidateKey)]: priorityScore(candidate) },
        cost: INVESTIGATE_COST,
        costReasoning: 'Real RDKit calls and pure-computation evidence checks are cheap and fast.',
      });
    }
    const admetNode = graph.nodes.find((n) => n.nodeId === ADMET_BATCH_EXPERIMENT_ID)!;
    if (admetNode.status === 'UNRESOLVED') {
      specs.push({
        experimentId: ADMET_BATCH_EXPERIMENT_ID,
        targetHypothesisIds: candidatesWithStructure(pool).map((c) => hypothesisId(c.candidateKey)),
        predictions: {},
        cost: ADMET_BATCH_COST,
        costReasoning: 'ADMET-AI loads a full predictive model per run — substantially more expensive than the RDKit-only battery.',
        scoringMode: 'COVERAGE',
      });
    }
    return specs;
  }

  function execute(experimentId: string, graph: EpistemicGraph): ReasoningExecutionResult {
    if (experimentId === ADMET_BATCH_EXPERIMENT_ID) {
      const stillOpen = candidatesWithStructure(pool).filter((c) => graph.nodes.find((n) => n.nodeId === hypothesisId(c.candidateKey))!.status === 'UNRESOLVED');
      const moleculeCandidates = stillOpen.map((c) => findings.get(c.candidateKey)?.moleculeCandidate).filter((m): m is MoleculeCandidate => m !== null && m !== undefined);
      const batch = runAdmetBatch(engines.admet, moleculeCandidates);

      const updates: StatusUpdate[] = [{ nodeId: ADMET_BATCH_EXPERIMENT_ID, newStatus: 'ESTABLISHED', reason: batch.available ? `ADMET-AI ran over ${batch.calledWith.length} candidate(s).` : `ADMET-AI was not available: ${batch.reason}`, provenance: [`admet:available=${batch.available}`] }];

      for (const candidate of stillOpen) {
        const priorFinding = findings.get(candidate.candidateKey)!;
        const molecule = priorFinding.moleculeCandidate;
        if (molecule === null) continue;
        const admetProps = admetPropertiesFor(molecule, batch);
        const toxicitySignals = admetProps
          .filter((p) => p.status === 'MODEL_PREDICTION' && p.value !== null && ['mutagenicity', 'clinicalToxicity', 'liverInjury'].includes(p.propertyId))
          .map((p) => ({ endpoint: p.propertyId, probability: p.value! }));
        const heavyAtomCount = molecule.properties.find((p) => p.propertyId === 'heavyAtomCount')?.value ?? null;
        const molecularWeight = molecule.properties.find((p) => p.propertyId === 'molecularWeight')?.value ?? null;
        const applicability = admetApplicability(heavyAtomCount, molecularWeight);

        const mechanismReport = falsifyCandidateMechanism({
          candidateKey: candidate.candidateKey,
          reportedTargetFamily: candidate.reportedTargetFamily,
          referenceTargetKeywords: config.reference.targetKeywords,
          naturalOccurrenceCited: candidate.naturalOccurrenceEvidence.length > 0,
          mechanismEvidenceCount: candidate.mechanismEvidence.length,
          structuralStatus: priorFinding.crossValidation.status,
          admetToxicitySignals: toxicitySignals,
          admetInDomain: applicability.inDomain,
        });

        const declared = config.axisInputsByCandidateKey[candidate.candidateKey]!;
        const mechanisticMatch = computeMechanisticMatchScore(candidate.candidateKey, config.reference.name, {
          targetMatch: computedTargetMatchAxis(mechanismReport),
          ...declared,
        });

        const confidenceLevel = deriveConfidence({
          hasHypothesis: true,
          independentSources: citedSources(candidate),
          completedComputationalChecks: [
            ...(priorFinding.crossValidation.status === 'CONFIRMED' || priorFinding.crossValidation.status === 'MISMATCH' ? ['RDKIT_STRUCTURAL'] : []),
            ...(batch.available && admetProps.some((p) => p.value !== null) ? ['ADMET_AI'] : []),
          ],
        });

        const updatedFinding: SubstituteCandidateFinding = { ...priorFinding, mechanismReport, confidenceLevel, mechanisticMatch, admetRan: true };
        findings.set(candidate.candidateKey, updatedFinding);
        const { status, reason } = statusFromSubstituteFinding(updatedFinding);
        if (status !== 'UNRESOLVED') {
          updates.push({ nodeId: hypothesisId(candidate.candidateKey), newStatus: status, reason, provenance: [`admet-batch:${candidate.candidateKey}`] });
        }
      }

      return { updates, provenance: [`experiment:${ADMET_BATCH_EXPERIMENT_ID}`], narrative: `Ran real ADMET-AI over ${moleculeCandidates.length} still-open, structurally-confirmed candidate(s).` };
    }

    const candidateKey = experimentId.replace('investigate-', '');
    const candidate = byKey.get(candidateKey);
    if (candidate === undefined) throw new Error(`Cannot execute unknown experiment "${experimentId}".`);

    const finding = investigateSubstituteCandidate(engines.rdkit, candidate, config);
    findings.set(candidateKey, finding);
    const { status, reason } = statusFromSubstituteFinding(finding);

    const updates: StatusUpdate[] = [
      { nodeId: experimentId, newStatus: 'ESTABLISHED', reason: `Ran RDKit cross-validation (${finding.crossValidation.status}), mechanism falsification (${finding.mechanismReport.verdict}), and Mechanistic Match Score (${finding.mechanisticMatch.totalScorePercent.toFixed(1)}%).`, provenance: [`investigate:${candidateKey}`] },
    ];
    if (status !== 'UNRESOLVED') {
      updates.push({ nodeId: hypothesisId(candidateKey), newStatus: status, reason, provenance: [`investigate:${candidateKey}`] });
    }

    return { updates, provenance: [`experiment:${experimentId}`, `structuralStatus:${finding.crossValidation.status}`, `mms:${finding.mechanisticMatch.totalScorePercent.toFixed(1)}%`], narrative: `Ran the real cheap battery for ${candidate.compoundName}.` };
  }

  return { adapter: { generateCandidates, execute }, findings };
}

export interface MechanisticSubstituteChallengeResult {
  config: MechanisticSubstituteChallengeConfig;
  loopResult: ReasoningLoopResult;
  findings: ReadonlyMap<string, SubstituteCandidateFinding>;
}

export function runMechanisticSubstituteChallenge(
  config: MechanisticSubstituteChallengeConfig,
  engines: { rdkit: RdkitTransport; admet: AdmetTransport },
): MechanisticSubstituteChallengeResult {
  const initial = buildInitialSubstituteChallengeGraph(config);
  const { adapter, findings } = buildMechanisticSubstituteChallengeAdapter(config, engines);
  const loopResult = runReasoningLoop(config.question, initial, adapter, config.pool.length + 2);
  return { config, loopResult, findings };
}

export type FinalDiscoveryResult =
  | 'CANDIDATE_FOUND_ABOVE_95'
  | 'CANDIDATE_PARTIALLY_SUPPORTED'
  | 'NO_CANDIDATE_ABOVE_THRESHOLD'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXPERIMENT_BLOCKED'
  | 'UNRESOLVED';

/**
 * "Jeśli żaden kandydat nie osiąga 95% — Genesis mówi wprost:
 * NO_CANDIDATE_ABOVE_THRESHOLD." This function's priority order matches
 * that literally: the 95% threshold is the deciding question, not whether
 * any individual candidate happened to end up WEAKENED or FALSIFIED along
 * the way (those facts are still fully reported — see
 * `candidatesFalsified` / per-candidate status in `SubstituteChallengeReport`
 * — they just do not override the headline verdict about the threshold).
 * `CANDIDATE_PARTIALLY_SUPPORTED` is reserved for a real, meaningfully close
 * near-miss (best real score >= 80%, an explicit, disclosed cut rather than
 * an arbitrary one) with no disqualifying falsification.
 */
const PARTIAL_SUPPORT_BAND = 0.80;

export function deriveFinalDiscoveryResult(result: MechanisticSubstituteChallengeResult): { result: FinalDiscoveryResult; reasoning: string } {
  const hypotheses = result.loopResult.finalGraph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
  if (result.loopResult.termination === 'BLOCKED') {
    return { result: 'EXPERIMENT_BLOCKED', reasoning: result.loopResult.terminationReason };
  }
  const supported = hypotheses.filter((n) => n.status === 'SUPPORTED');
  if (supported.length > 0) {
    return { result: 'CANDIDATE_FOUND_ABOVE_95', reasoning: `${supported.length} candidate(s) reached the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% Mechanistic Match Score threshold: ${supported.map((n) => n.nodeId).join(', ')}.` };
  }
  if (result.findings.size === 0) {
    return { result: 'INSUFFICIENT_EVIDENCE', reasoning: 'No candidate was actually investigated in this run.' };
  }

  const retained = [...result.findings.values()].filter((f) => f.mechanismReport.verdict === 'RETAINED');
  const falsifiedCount = hypotheses.filter((n) => n.status === 'FALSIFIED').length;
  const weakenedCount = hypotheses.filter((n) => n.status === 'WEAKENED').length;

  if (retained.length === 0) {
    return { result: 'NO_CANDIDATE_ABOVE_THRESHOLD', reasoning: `Every candidate was FALSIFIED at the mechanism-falsification stage (${falsifiedCount} candidate(s)); none reached the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% threshold.` };
  }
  const best = retained.reduce((a, b) => (b.mechanisticMatch.totalScore > a.mechanisticMatch.totalScore ? b : a));
  const contextSuffix = `${falsifiedCount} falsified, ${weakenedCount} weakened by conflicting evidence.`;

  if (best.mechanisticMatch.totalScore >= PARTIAL_SUPPORT_BAND) {
    return {
      result: 'CANDIDATE_PARTIALLY_SUPPORTED',
      reasoning: `No candidate reached ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}%, but the closest, ${best.candidateKey}, reached ${best.mechanisticMatch.totalScorePercent.toFixed(1)}% (${(best.mechanisticMatch.unknownWeight * 100).toFixed(1)} percentage point(s) unresolved due to missing evidence, not refutation). ${contextSuffix}`,
    };
  }
  return {
    result: 'NO_CANDIDATE_ABOVE_THRESHOLD',
    reasoning: `No candidate reached the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% Mechanistic Match Score threshold. Closest: ${best.candidateKey} at ${best.mechanisticMatch.totalScorePercent.toFixed(1)}% (${(best.mechanisticMatch.unknownWeight * 100).toFixed(1)} percentage point(s) unresolved due to missing evidence, not refutation). ${contextSuffix}`,
  };
}

export function unknownExplanation(graph: EpistemicGraph) {
  return explainUnknown(graph, UNKNOWN_NODE_ID);
}

export interface SubstituteChallengeReport {
  question: string;
  referenceProfile: PharmacologicalReference;
  hypothesesConsidered: readonly string[];
  candidatesEvaluated: readonly { candidateKey: string; mechanisticMatchPercent: number; status: EpistemicStatus }[];
  candidatesAbove95: readonly { candidateKey: string; mechanisticMatchPercent: number; whyItSurvived: string }[];
  candidatesFalsified: readonly { candidateKey: string; reason: string }[];
  experimentsExecuted: readonly { experimentId: string; narrative: string }[];
  whatChangedPerStep: readonly { stepIndex: number; selectedExperimentId: string | null; changes: readonly string[] }[];
  strongestConclusion: { result: FinalDiscoveryResult; reasoning: string };
  remainsUnknown: readonly string[];
  remainsBlocked: readonly string[];
  nextExperiment: string;
}

/** Builds the required report entirely from real, already-computed run data. */
export function buildSubstituteChallengeReport(result: MechanisticSubstituteChallengeResult): SubstituteChallengeReport {
  const graph = result.loopResult.finalGraph;
  const hypotheses = graph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
  const unknown = explainUnknown(graph, UNKNOWN_NODE_ID);

  const candidatesEvaluated = hypotheses.map((n) => {
    const candidateKey = n.nodeId.replace('hyp-', '');
    const finding = result.findings.get(candidateKey);
    return { candidateKey, mechanisticMatchPercent: finding?.mechanisticMatch.totalScorePercent ?? 0, status: n.status };
  });

  const candidatesAbove95 = hypotheses
    .filter((n) => n.status === 'SUPPORTED')
    .map((n) => {
      const candidateKey = n.nodeId.replace('hyp-', '');
      const finding = result.findings.get(candidateKey)!;
      return { candidateKey, mechanisticMatchPercent: finding.mechanisticMatch.totalScorePercent, whyItSurvived: n.statusReason };
    });

  const candidatesFalsified = hypotheses.filter((n) => n.status === 'FALSIFIED').map((n) => ({ candidateKey: n.nodeId.replace('hyp-', ''), reason: n.statusReason }));

  const lastStep = result.loopResult.steps[result.loopResult.steps.length - 1];

  return {
    question: result.loopResult.question,
    referenceProfile: result.config.reference,
    hypothesesConsidered: hypotheses.map((n) => n.statement),
    candidatesEvaluated,
    candidatesAbove95,
    candidatesFalsified,
    experimentsExecuted: result.loopResult.steps.filter((s) => s.executed).map((s) => ({ experimentId: s.selectedExperimentId!, narrative: s.explanation.result })),
    whatChangedPerStep: result.loopResult.steps.map((s) => ({ stepIndex: s.stepIndex, selectedExperimentId: s.selectedExperimentId, changes: s.explanation.whatChanged })),
    strongestConclusion: deriveFinalDiscoveryResult(result),
    remainsUnknown: [unknown.whatIsUnknown, ...hypotheses.filter((n) => n.status === 'UNRESOLVED').map((n) => `${n.nodeId}: ${n.statusReason}`)],
    remainsBlocked: hypotheses.filter((n) => n.status === 'BLOCKED').map((n) => `${n.nodeId}: ${n.statusReason}`),
    nextExperiment: lastStep?.explanation.nextBestExperiment ?? unknown.potentialResolution,
  };
}

export function saveSubstituteChallengeToMemory(result: MechanisticSubstituteChallengeResult): SavedExperiment {
  const finalGraph = result.loopResult.finalGraph;
  const byStatus = (s: EpistemicStatus) => finalGraph.nodes.filter((n) => n.kind === 'HYPOTHESIS' && n.status === s).length;
  return saveExperiment({
    labId: 'pharmacological-substitute-challenge',
    experimentId: `${GRAPH_ID}:${result.config.reference.name}:${finalGraph.fingerprint}`,
    experimentName: `Mechanistic substitute challenge — ${result.config.reference.name}`,
    params: { reference: result.config.reference.name, candidateCount: result.config.pool.length, steps: result.loopResult.steps.length, threshold: MECHANISTIC_MATCH_THRESHOLD },
    stats: { supported: byStatus('SUPPORTED'), weakened: byStatus('WEAKENED'), falsified: byStatus('FALSIFIED'), unresolved: byStatus('UNRESOLVED') },
    analysis: [...result.findings.values()].map((f) => ({ title: f.candidateKey, kind: 'mechanistic-match', body: `${f.mechanisticMatch.totalScorePercent.toFixed(1)}% (unknown ${(f.mechanisticMatch.unknownWeight * 100).toFixed(1)}pp)` })),
    honesty: 'simplified',
    honestyNote: 'Every Mechanistic Match Score axis is either computed from a real check (target match) or declared from real cited literature with an honest evidence-basis tag; ASSAY_MATCH and QUANTITATIVE_COMPARABILITY are UNKNOWN for every candidate because no formal knowledge-pack ingestion of comparable quantitative data exists yet for this reference. No candidate is claimed to be a clinical or functional substitute for the reference.',
    epistemicStatus: `TERMINATION=${result.loopResult.termination};SUPPORTED=${byStatus('SUPPORTED')};WEAKENED=${byStatus('WEAKENED')};FALSIFIED=${byStatus('FALSIFIED')};UNRESOLVED=${byStatus('UNRESOLVED')}`,
    assumptions: ['Applies the same epistemic engine used for physics and the ketamine/NMDA challenge, unchanged.', 'The 95% Mechanistic Match Score threshold is a mechanistic comparison score, never a clinical efficacy claim.'],
  });
}
