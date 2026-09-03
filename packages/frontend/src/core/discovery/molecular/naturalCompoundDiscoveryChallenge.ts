/**
 * FINAL DISCOVERY CHALLENGE — NATURAL-COMPOUND MECHANISTIC RELEVANCE.
 *
 * QUESTION: which natural compounds in the curated pool are mechanistically
 * relevant to a defined reference pharmacology profile (ketamine's NMDA
 * receptor antagonism, used STRICTLY as a mechanism/target reference — never
 * as a target to reproduce, improve on, or substitute for), and which
 * candidate has the strongest source-backed, computationally-checked
 * evidence?
 *
 * THIS IS THE EPISTEMIC REASONING LOOP (epistemicEngine.ts /
 * experimentSelection.ts / epistemicReasoningLoop.ts, all unchanged) applied
 * to a SECOND, non-physics domain, proving the core is genuinely
 * domain-agnostic. It reuses, and does not re-derive:
 *
 *   - the curated candidate pool and its structural cross-validation
 *     (naturalProductCandidatePool.ts);
 *   - real RDKit Tanimoto/scaffold similarity (structuralSimilarity.ts);
 *   - mechanism-level falsification (mechanismFalsification.ts);
 *   - independent-evidence-axis aggregation (independentEvidence.ts);
 *   - the confidence ladder (confidenceLadder.ts) — confidence is earned by
 *     real, distinct evidence axes, never assigned;
 *   - real ADMET-AI batch prediction (admetProvider.ts);
 *   - the real MoleculeCandidate builder (naturalAnalogueCampaign.ts's
 *     `candidateFromCrossValidated`).
 *
 * WHAT IS GENUINELY NEW HERE: instead of running all of the above as one
 * hardcoded pipeline (as `runNaturalAnalogueCampaign`/`runNaturalKetamineDiscovery`
 * already do), this module exposes each candidate's cheap RDKit+literature
 * battery, and the expensive ADMET-AI batch, as SEPARATE, SELECTABLE real
 * experiments. Genesis decides — round by round, from the CURRENT epistemic
 * state — which candidate to investigate next, and whether the expensive
 * ADMET-AI batch is even worth running, rather than executing a fixed
 * sequence. See `runNaturalCompoundDiscoveryChallenge` for the real,
 * observed sequence this produces (never hard-coded as an expectation).
 *
 * ETHICAL BOUNDARY, ENFORCED STRUCTURALLY, NOT JUST IN PROSE: this module
 * never designs a new compound, never optimises potency or "recreational"
 * properties, never proposes a synthesis route, and never asserts that a
 * natural candidate is equivalent to ketamine. The claim node
 * `claim-clinical-equivalence` DEPENDS_ON `unknown-natural-candidate-potency`
 * — an UNKNOWN this module has no way to resolve (no natural candidate has
 * an ingested, same-assay potency measurement) — so that claim is
 * STRUCTURALLY incapable of ever becoming anything but UNRESOLVED, by the
 * same deterministic engine used everywhere else in this project, not by a
 * disclaimer that could be forgotten.
 */
import {
  admetApplicability,
  type AdmetTransport,
} from './admetTransport';
import { admetPropertiesFor, runAdmetBatch } from './admetProvider';
import { candidateFromCrossValidated } from './naturalAnalogueCampaign';
import {
  crossValidateCandidate,
  NATURAL_PRODUCT_CANDIDATE_POOL,
  type CuratedNaturalCandidate,
  type StructuralCrossValidation,
} from './naturalProductCandidatePool';
import { falsifyCandidateMechanism, type MechanismFalsificationReport } from './mechanismFalsification';
import { assessIndependentEvidence, type EvidenceAxisEntry, type IndependentEvidenceAssessment } from './independentEvidence';
import { deriveConfidence, type ComputationalConfidenceLevel, type EvidenceForConfidence } from './confidenceLadder';
import { evaluateStructuralSimilarity, similarityStatement, type StructuralSimilarityResult } from './structuralSimilarity';
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

export const NATURAL_COMPOUND_DISCOVERY_CHALLENGE_VERSION = '1.0.0';

const GRAPH_ID = 'natural-compound-discovery-challenge';
export const QUESTION =
  'Which natural compounds in the curated pool are mechanistically relevant to ketamine\'s NMDA-receptor antagonist mechanism (used strictly as a reference), and which candidate has the strongest source-backed, computationally-checked evidence?';

export const REFERENCE_TARGET_KEYWORDS: readonly string[] = ['nmda'];
export const REFERENCE_SMILES = 'CNC1(CCCCC1=O)c1ccccc1Cl';
export const REFERENCE_NAME = 'ketamine';

/** ADMET-AI is substantially more expensive than the RDKit-only battery (a subprocess that loads a full model, vs. millisecond-scale RDKit calls) — a real, disclosed cost differential, not an arbitrary number. */
const ADMET_BATCH_COST = 5;
const INVESTIGATE_COST = 1;

function hypothesisId(candidateKey: string): string {
  return `hyp-${candidateKey}`;
}
function investigateExperimentId(candidateKey: string): string {
  return `investigate-${candidateKey}`;
}
const ADMET_BATCH_EXPERIMENT_ID = 'admet-batch';
const FACT_NODE_ID = 'fact-ketamine-reference';
const UNKNOWN_NODE_ID = 'unknown-natural-candidate-potency';
const CLAIM_EQUIVALENCE_ID = 'claim-clinical-equivalence';

/**
 * Detects a candidate the pool's OWN authors have explicitly framed as a
 * directional/negative control — reading the pool's declared classification,
 * not inferring a scientific judgment from parsing free-text prose. Every
 * candidate in `naturalProductCandidatePool.ts` intentionally designed as a
 * control names itself as one in its own `mechanismSummary` (see that file's
 * module docstring). A true "NEGATIVE CONTROL" (wrong biological target
 * entirely, e.g. harmaline/MAO-A) is excluded here because
 * `falsifyCandidateMechanism`'s WRONG_TARGET check already rejects it on
 * stronger grounds; this function exists for the narrower, real case of a
 * candidate that shares the reference's target FAMILY but is declared, by
 * its own literature, to act in the opposite direction (e.g. an NMDAR
 * co-agonist/agonist control, not an antagonist analogue).
 */
function hasOppositeDirectionEvidence(candidate: CuratedNaturalCandidate): string | null {
  const lower = candidate.mechanismSummary.toLowerCase();
  if (!lower.includes('control') || lower.includes('negative control')) return null;
  return `${candidate.compoundName}'s own literature summary explicitly frames it as a directional control, not a same-direction antagonist analogue of ${REFERENCE_NAME}: "${candidate.mechanismSummary}"`;
}

function priorityScore(candidate: CuratedNaturalCandidate): number {
  const hasStructure = candidate.structure.kind === 'SMILES_CROSS_VALIDATED';
  return candidate.naturalOccurrenceEvidence.length + candidate.mechanismEvidence.length + (hasStructure ? 1 : 0);
}

function candidatesWithStructure(pool: readonly CuratedNaturalCandidate[]): readonly CuratedNaturalCandidate[] {
  return pool.filter((c) => c.structure.kind === 'SMILES_CROSS_VALIDATED');
}

export function buildInitialNaturalCompoundGraph(pool: readonly CuratedNaturalCandidate[] = NATURAL_PRODUCT_CANDIDATE_POOL): EpistemicGraph {
  const fact = buildEpistemicNode({
    nodeId: FACT_NODE_ID, kind: 'FACT', domainId: 'CHEMISTRY',
    statement: `${REFERENCE_NAME} is an independently, experimentally established NMDA-receptor (uncompetitive, open-channel blocking) antagonist — used here strictly as a mechanism/target reference for comparison, never as a target to reproduce or improve on.`,
    status: 'ESTABLISHED', statusReason: 'Cited, established pharmacology; not re-derived by this module.',
    provenance: ['Anis NA, Berry SC, Burton NR, Lodge D. Br J Pharmacol. 1983;79(2):565-575.', 'naturalKetamineDiscovery.ts:KETAMINE_TARGET_PROFILE'],
  });

  const hypotheses = pool.map((c) => buildEpistemicNode({
    nodeId: hypothesisId(c.candidateKey), kind: 'HYPOTHESIS', domainId: 'CHEMISTRY',
    statement: `${c.compoundName} is mechanistically relevant to ${REFERENCE_NAME}'s NMDA-receptor antagonist mechanism.`,
    status: 'UNRESOLVED', statusReason: 'Not yet investigated.',
    provenance: [`naturalProductCandidatePool.ts:${c.candidateKey}`],
  }));

  const investigateExperiments = pool.map((c) => buildEpistemicNode({
    nodeId: investigateExperimentId(c.candidateKey), kind: 'EXPERIMENT', domainId: 'CHEMISTRY',
    statement: `Run the real, cheap battery for ${c.compoundName}: RDKit structural cross-validation, RDKit Tanimoto/scaffold similarity to ${REFERENCE_NAME}, mechanism-level falsification, and independent-evidence aggregation.`,
    status: 'UNRESOLVED', statusReason: 'Not yet executed.',
    provenance: [`naturalProductCandidatePool.ts:crossValidateCandidate`, 'structuralSimilarity.ts:evaluateStructuralSimilarity', 'mechanismFalsification.ts:falsifyCandidateMechanism'],
  }));

  const admetBatchExperiment = buildEpistemicNode({
    nodeId: ADMET_BATCH_EXPERIMENT_ID, kind: 'EXPERIMENT', domainId: 'CHEMISTRY',
    statement: 'Run a real ADMET-AI batch prediction over every still-open, structurally-confirmed candidate, and re-check mechanism falsification and confidence with that additional independent computational axis.',
    status: 'UNRESOLVED', statusReason: 'Not yet executed.',
    provenance: ['admetProvider.ts:runAdmetBatch'],
  });

  const unknown = buildEpistemicNode({
    nodeId: UNKNOWN_NODE_ID, kind: 'UNKNOWN', domainId: 'CHEMISTRY',
    statement: 'Whether any natural candidate in this pool has a real, ingested, same-assay potency/functional measurement comparable to ketamine\'s own ingested NMDAR IC50.',
    status: 'UNKNOWN', statusReason: 'No such measurement has been ingested for any natural candidate in this runtime.',
    provenance: ['naturalKetamineDiscovery.ts: FUNCTIONAL axis is NOT_ESTABLISHED for every natural candidate'],
    unknownDetail: {
      whatIsUnknown: 'Whether any natural candidate has a real, ingested, same-assay functional/potency measurement at NMDAR comparable to ketamine\'s.',
      whyUnknown: 'PubChem/ChEMBL live lookup is blocked in this runtime, and no independently ingested electrophysiology/binding measurement exists for any candidate in this pool.',
      missingEvidence: ['an independently ingested, same-assay IC50 (or equivalent) measurement for a natural candidate at NMDAR'],
      competingHypothesisIds: pool.map((c) => hypothesisId(c.candidateKey)),
      potentialResolution: 'Obtain/ingest a peer-reviewed electrophysiology or radioligand-binding measurement for a candidate at the NMDA receptor, in an assay comparable to the ingested ketamine reference.',
    },
  });

  const claimEquivalence = buildEpistemicNode({
    nodeId: CLAIM_EQUIVALENCE_ID, kind: 'DERIVED', domainId: 'CHEMISTRY',
    statement: `No natural candidate in this pool is asserted to be a clinical or functional equivalent of ${REFERENCE_NAME}.`,
    status: 'UNRESOLVED', statusReason: 'Depends entirely on the functional-potency UNKNOWN, which this module has no way to resolve.',
    provenance: ['This claim is structurally prevented from resolving — see unknown-natural-candidate-potency.'],
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
    buildEpistemicEdge({ edgeId: 'e-claim-depends-on-unknown', from: CLAIM_EQUIVALENCE_ID, to: UNKNOWN_NODE_ID, relation: 'DEPENDS_ON', rationale: 'A clinical/functional equivalence claim requires the functional-potency comparison this pool cannot supply.' }),
  ];

  return buildEpistemicGraph(GRAPH_ID, [fact, ...hypotheses, ...investigateExperiments, admetBatchExperiment, unknown, claimEquivalence], edges);
}

export interface CandidateFinding {
  candidateKey: string;
  crossValidation: StructuralCrossValidation;
  similarity: StructuralSimilarityResult | null;
  mechanismReport: MechanismFalsificationReport;
  independentEvidence: IndependentEvidenceAssessment;
  confidenceLevel: ComputationalConfidenceLevel;
  admetRan: boolean;
  moleculeCandidate: MoleculeCandidate | null;
}

function citedSources(candidate: CuratedNaturalCandidate): EvidenceForConfidence['independentSources'] {
  return [
    ...candidate.naturalOccurrenceEvidence.map((e) => ({ sourceKey: e.reference, kind: 'LITERATURE' as const, cited: true })),
    ...candidate.mechanismEvidence.map((e) => ({ sourceKey: e.identifier, kind: 'LITERATURE' as const, cited: true })),
  ];
}

/**
 * The cheap, real battery for one candidate: RDKit cross-validation, RDKit
 * similarity (if a structure exists), mechanism-level falsification (without
 * ADMET facts yet), and independent-evidence aggregation. No network call,
 * no fabricated evidence — every field here traces to a real function call.
 */
function investigateCandidate(rdkit: RdkitTransport, candidate: CuratedNaturalCandidate): CandidateFinding {
  const crossValidation = crossValidateCandidate(rdkit, candidate);
  const similarity = candidate.structure.kind === 'SMILES_CROSS_VALIDATED'
    ? evaluateStructuralSimilarity(rdkit, candidate.structure.smiles, REFERENCE_SMILES)
    : null;

  const mechanismReport = falsifyCandidateMechanism({
    candidateKey: candidate.candidateKey,
    reportedTargetFamily: candidate.reportedTargetFamily,
    referenceTargetKeywords: REFERENCE_TARGET_KEYWORDS,
    naturalOccurrenceCited: candidate.naturalOccurrenceEvidence.length > 0,
    mechanismEvidenceCount: candidate.mechanismEvidence.length,
    structuralStatus: crossValidation.status,
    admetToxicitySignals: [],
    admetInDomain: null,
  });

  const oppositeDirection = hasOppositeDirectionEvidence(candidate);
  const axes: EvidenceAxisEntry[] = [
    { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: candidate.naturalOccurrenceEvidence.length > 0, detail: candidate.naturalOccurrenceEvidence.length > 0 ? candidate.naturalOccurrenceEvidence.map((e) => e.reference).join('; ') : 'No natural-occurrence citation.' },
    { axis: 'MECHANISM_LITERATURE', present: candidate.mechanismEvidence.length > 0, detail: candidate.mechanismEvidence.length > 0 ? candidate.mechanismEvidence.map((e) => e.identifier).join('; ') : 'No mechanism citation.' },
    { axis: 'DATABASE_RECORD', present: false, detail: 'PubChem/ChEMBL live lookup is blocked in this runtime (connection refused); no independent database record was retrieved.' },
    { axis: 'STRUCTURAL_COMPUTATION', present: crossValidation.status === 'CONFIRMED', detail: crossValidation.reason },
    { axis: 'ADMET_PREDICTION', present: false, detail: 'Not yet run.' },
    { axis: 'TARGET_DOCKING', present: false, detail: 'Genesis has no docking engine available in this runtime.' },
  ];
  const contradictions = oppositeDirection === null ? [] : [oppositeDirection];
  const independentEvidence = assessIndependentEvidence(candidate.candidateKey, axes, contradictions);

  const confidenceLevel = deriveConfidence({
    hasHypothesis: true,
    independentSources: citedSources(candidate),
    completedComputationalChecks: crossValidation.status === 'CONFIRMED' || crossValidation.status === 'MISMATCH' ? ['RDKIT_STRUCTURAL'] : [],
  });

  const moleculeCandidate = candidate.structure.kind === 'SMILES_CROSS_VALIDATED' ? candidateFromCrossValidated(candidate.candidateKey, candidate.structure.smiles, rdkit) : null;

  return { candidateKey: candidate.candidateKey, crossValidation, similarity, mechanismReport, independentEvidence, confidenceLevel, admetRan: false, moleculeCandidate };
}

function statusFromFinding(finding: CandidateFinding): { status: EpistemicStatus; reason: string } {
  if (finding.mechanismReport.verdict !== 'RETAINED') {
    return { status: 'FALSIFIED', reason: `Mechanism-level falsification rejected this candidate: ${finding.mechanismReport.reason}` };
  }
  if (finding.independentEvidence.contradictions.length > 0) {
    return { status: 'WEAKENED', reason: `Real literature contains directional contradiction(s): ${finding.independentEvidence.contradictions.join(' ')}` };
  }
  if (finding.confidenceLevel >= 4) {
    return {
      status: 'SUPPORTED',
      reason: `Confidence level ${finding.confidenceLevel} (independent computational support: ${finding.independentEvidence.independentAxisCount} evidence axes, ${finding.independentEvidence.evidenceQuality}). This is evidence-structure support, NOT a claim of proven biological equivalence or clinical effect — no functional/potency measurement exists for this candidate in this runtime.`,
    };
  }
  return { status: 'UNRESOLVED', reason: `Confidence level ${finding.confidenceLevel} — retained, not contradicted, but not yet independently computationally corroborated enough to call SUPPORTED.` };
}

/**
 * Builds the domain adapter. Holds a per-run scratchpad of real intermediate
 * findings (structural cross-validation, similarity, mechanism/evidence
 * reports) alongside the graph, because `EpistemicNode`'s status-only
 * contract does not carry structured payloads. The GRAPH remains the sole
 * source of truth for epistemic STATUS — replay only re-applies the
 * already-captured `StatusUpdate`s (see `epistemicEngine.ts`), so this
 * scratchpad never affects replay correctness, only report detail.
 */
export function buildNaturalCompoundDiscoveryAdapter(
  engines: { rdkit: RdkitTransport; admet: AdmetTransport },
  pool: readonly CuratedNaturalCandidate[] = NATURAL_PRODUCT_CANDIDATE_POOL,
): { adapter: ReasoningDomainAdapter; findings: Map<string, CandidateFinding> } {
  const findings = new Map<string, CandidateFinding>();
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
          referenceTargetKeywords: REFERENCE_TARGET_KEYWORDS,
          naturalOccurrenceCited: candidate.naturalOccurrenceEvidence.length > 0,
          mechanismEvidenceCount: candidate.mechanismEvidence.length,
          structuralStatus: priorFinding.crossValidation.status,
          admetToxicitySignals: toxicitySignals,
          admetInDomain: applicability.inDomain,
        });

        const admetPresent = batch.available && admetProps.some((p) => p.value !== null);
        const axes: EvidenceAxisEntry[] = [
          { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: candidate.naturalOccurrenceEvidence.length > 0, detail: candidate.naturalOccurrenceEvidence.map((e) => e.reference).join('; ') },
          { axis: 'MECHANISM_LITERATURE', present: candidate.mechanismEvidence.length > 0, detail: candidate.mechanismEvidence.map((e) => e.identifier).join('; ') },
          { axis: 'DATABASE_RECORD', present: false, detail: 'PubChem/ChEMBL live lookup is blocked in this runtime.' },
          { axis: 'STRUCTURAL_COMPUTATION', present: priorFinding.crossValidation.status === 'CONFIRMED', detail: priorFinding.crossValidation.reason },
          { axis: 'ADMET_PREDICTION', present: admetPresent, detail: admetPresent ? 'ADMET-AI predictions computed.' : batch.available ? 'ADMET-AI ran but produced no value for this candidate.' : batch.reason },
          { axis: 'TARGET_DOCKING', present: false, detail: 'Genesis has no docking engine available in this runtime.' },
        ];
        const oppositeDirection = hasOppositeDirectionEvidence(candidate);
        const contradictions = oppositeDirection === null ? [] : [oppositeDirection];
        const independentEvidence = assessIndependentEvidence(candidate.candidateKey, axes, contradictions);

        const confidenceLevel = deriveConfidence({
          hasHypothesis: true,
          independentSources: citedSources(candidate),
          completedComputationalChecks: [
            ...(priorFinding.crossValidation.status === 'CONFIRMED' || priorFinding.crossValidation.status === 'MISMATCH' ? ['RDKIT_STRUCTURAL'] : []),
            ...(admetPresent ? ['ADMET_AI'] : []),
          ],
        });

        const updatedFinding: CandidateFinding = { ...priorFinding, mechanismReport, independentEvidence, confidenceLevel, admetRan: true };
        findings.set(candidate.candidateKey, updatedFinding);
        const { status, reason } = statusFromFinding(updatedFinding);
        if (status !== 'UNRESOLVED') {
          updates.push({ nodeId: hypothesisId(candidate.candidateKey), newStatus: status, reason, provenance: [`admet-batch:${candidate.candidateKey}`] });
        }
      }

      return { updates, provenance: [`experiment:${ADMET_BATCH_EXPERIMENT_ID}`], narrative: `Ran real ADMET-AI over ${moleculeCandidates.length} still-open, structurally-confirmed candidate(s).` };
    }

    const candidateKey = experimentId.replace('investigate-', '');
    const candidate = byKey.get(candidateKey);
    if (candidate === undefined) throw new Error(`Cannot execute unknown experiment "${experimentId}".`);

    const finding = investigateCandidate(engines.rdkit, candidate);
    findings.set(candidateKey, finding);
    const { status, reason } = statusFromFinding(finding);

    const updates: StatusUpdate[] = [
      { nodeId: experimentId, newStatus: 'ESTABLISHED', reason: `Ran RDKit cross-validation (${finding.crossValidation.status}), similarity (${finding.similarity?.available ? 'available' : 'unavailable'}), mechanism falsification (${finding.mechanismReport.verdict}), and independent-evidence aggregation.`, provenance: [`investigate:${candidateKey}`] },
    ];
    if (status !== 'UNRESOLVED') {
      updates.push({ nodeId: hypothesisId(candidateKey), newStatus: status, reason, provenance: [`investigate:${candidateKey}`] });
    }

    return { updates, provenance: [`experiment:${experimentId}`, `structuralStatus:${finding.crossValidation.status}`], narrative: `Ran the real cheap battery for ${candidate.compoundName}.` };
  }

  return { adapter: { generateCandidates, execute }, findings };
}

export interface NaturalCompoundDiscoveryChallengeResult {
  loopResult: ReasoningLoopResult;
  findings: ReadonlyMap<string, CandidateFinding>;
  pool: readonly CuratedNaturalCandidate[];
}

export function runNaturalCompoundDiscoveryChallenge(
  engines: { rdkit: RdkitTransport; admet: AdmetTransport },
  pool: readonly CuratedNaturalCandidate[] = NATURAL_PRODUCT_CANDIDATE_POOL,
): NaturalCompoundDiscoveryChallengeResult {
  const initial = buildInitialNaturalCompoundGraph(pool);
  const { adapter, findings } = buildNaturalCompoundDiscoveryAdapter(engines, pool);
  const loopResult = runReasoningLoop(QUESTION, initial, adapter, pool.length + 2);
  return { loopResult, findings, pool };
}

export { similarityStatement };

export function unknownExplanation(graph: EpistemicGraph) {
  return explainUnknown(graph, UNKNOWN_NODE_ID);
}

/**
 * THE REQUIRED PER-CLAIM EVIDENCE-TYPE VOCABULARY — distinct from, and
 * layered onto, the engine's own `EpistemicStatus` (SUPPORTED/WEAKENED/
 * FALSIFIED/UNRESOLVED/...). `EpistemicStatus` says what the engine
 * concluded; `EvidenceBasis` says WHAT KIND of support that conclusion
 * rests on. Never a duplicate status system: this is a pure, report-time
 * classification computed from the same real findings, never stored on the
 * graph itself.
 */
export type EvidenceBasis =
  | 'DISCOVERED_COMPUTATIONALLY_SUPPORTED'
  | 'LITERATURE_SUPPORTED'
  | 'DERIVED'
  | 'HYPOTHESIS'
  | 'UNKNOWN'
  | 'BLOCKED'
  | 'NOT_AVAILABLE';

export function classifyEvidenceBasis(finding: CandidateFinding, confidenceLevel: ComputationalConfidenceLevel): EvidenceBasis {
  if (finding.crossValidation.status === 'ENGINE_UNAVAILABLE') return 'NOT_AVAILABLE';
  if (confidenceLevel >= 4) return 'DISCOVERED_COMPUTATIONALLY_SUPPORTED';
  if (confidenceLevel >= 2) return 'LITERATURE_SUPPORTED';
  return 'HYPOTHESIS';
}

export type OverallConclusion =
  | 'CANDIDATE_FOUND_AND_SUPPORTED'
  | 'CANDIDATE_PARTIALLY_SUPPORTED'
  | 'NO_CANDIDATE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXPERIMENT_BLOCKED';

export function deriveOverallConclusion(result: NaturalCompoundDiscoveryChallengeResult): { conclusion: OverallConclusion; reasoning: string } {
  const hypotheses = result.loopResult.finalGraph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
  if (result.loopResult.termination === 'BLOCKED') {
    return { conclusion: 'EXPERIMENT_BLOCKED', reasoning: result.loopResult.terminationReason };
  }
  const supported = hypotheses.filter((n) => n.status === 'SUPPORTED');
  if (supported.length > 0) {
    return { conclusion: 'CANDIDATE_FOUND_AND_SUPPORTED', reasoning: `${supported.length} candidate(s) reached SUPPORTED: ${supported.map((n) => n.nodeId).join(', ')}.` };
  }
  const weakened = hypotheses.filter((n) => n.status === 'WEAKENED');
  if (weakened.length > 0) {
    return { conclusion: 'CANDIDATE_PARTIALLY_SUPPORTED', reasoning: `No candidate reached full SUPPORTED status; ${weakened.length} candidate(s) carry real but directionally-weakened evidence: ${weakened.map((n) => n.nodeId).join(', ')}.` };
  }
  const unresolved = hypotheses.filter((n) => n.status === 'UNRESOLVED');
  if (unresolved.length > 0) {
    return { conclusion: 'INSUFFICIENT_EVIDENCE', reasoning: `${unresolved.length} candidate(s) remain UNRESOLVED with no further real experiment available: ${unresolved.map((n) => n.nodeId).join(', ')}.` };
  }
  return { conclusion: 'NO_CANDIDATE', reasoning: 'Every candidate in the pool was FALSIFIED; none survives with any degree of support.' };
}

export interface DiscoveryChallengeReport {
  question: string;
  hypothesesConsidered: readonly string[];
  whatWasKnown: readonly string[];
  whatWasUnknown: readonly string[];
  candidatesSurvived: readonly { candidateKey: string; status: EpistemicStatus; evidenceBasis: EvidenceBasis; reason: string }[];
  candidatesFalsified: readonly { candidateKey: string; reason: string }[];
  experimentsExecuted: readonly { experimentId: string; narrative: string }[];
  whatChangedPerStep: readonly { stepIndex: number; selectedExperimentId: string | null; changes: readonly string[] }[];
  strongestConclusion: { conclusion: OverallConclusion; reasoning: string };
  remainsUnknown: readonly string[];
  nextExperiment: string;
}

/** Builds the required 12-question answer set, entirely from real, already-computed run data — nothing here is re-derived or asserted independently of the actual loop result. */
export function buildDiscoveryChallengeReport(result: NaturalCompoundDiscoveryChallengeResult): DiscoveryChallengeReport {
  const graph = result.loopResult.finalGraph;
  const hypotheses = graph.nodes.filter((n) => n.kind === 'HYPOTHESIS');

  const candidatesSurvived = hypotheses
    .filter((n) => n.status === 'SUPPORTED' || n.status === 'WEAKENED' || n.status === 'UNRESOLVED')
    .map((n) => {
      const candidateKey = n.nodeId.replace('hyp-', '');
      const finding = result.findings.get(candidateKey);
      const evidenceBasis: EvidenceBasis = finding === undefined ? 'HYPOTHESIS' : classifyEvidenceBasis(finding, finding.confidenceLevel);
      return { candidateKey, status: n.status, evidenceBasis, reason: n.statusReason };
    });

  const candidatesFalsified = hypotheses
    .filter((n) => n.status === 'FALSIFIED')
    .map((n) => ({ candidateKey: n.nodeId.replace('hyp-', ''), reason: n.statusReason }));

  const unknown = explainUnknown(graph, UNKNOWN_NODE_ID);
  const claimNode = graph.nodes.find((n) => n.nodeId === CLAIM_EQUIVALENCE_ID)!;

  const lastStep = result.loopResult.steps[result.loopResult.steps.length - 1];
  const nextExperiment = lastStep?.explanation.nextBestExperiment ?? null;

  return {
    question: result.loopResult.question,
    hypothesesConsidered: hypotheses.map((n) => n.statement),
    whatWasKnown: [
      graph.nodes.find((n) => n.nodeId === FACT_NODE_ID)!.statement,
      ...candidatesSurvived.filter((c) => c.status === 'SUPPORTED').map((c) => `${c.candidateKey}: ${c.reason}`),
    ],
    whatWasUnknown: [unknown.whatIsUnknown, `${claimNode.statement} — ${claimNode.statusReason}`],
    candidatesSurvived,
    candidatesFalsified,
    experimentsExecuted: result.loopResult.steps.filter((s) => s.executed).map((s) => ({ experimentId: s.selectedExperimentId!, narrative: s.explanation.result })),
    whatChangedPerStep: result.loopResult.steps.map((s) => ({ stepIndex: s.stepIndex, selectedExperimentId: s.selectedExperimentId, changes: s.explanation.whatChanged })),
    strongestConclusion: deriveOverallConclusion(result),
    remainsUnknown: [unknown.whatIsUnknown, ...hypotheses.filter((n) => n.status === 'UNRESOLVED').map((n) => `${n.nodeId}: ${n.statusReason}`)],
    nextExperiment: nextExperiment ?? (result.loopResult.termination === 'RESOLVED' ? 'None — every hypothesis reached a real, computed verdict.' : `No further discriminating experiment is available in this pool for the remaining unresolved candidate(s); ${unknown.potentialResolution}`),
  };
}

export function saveNaturalCompoundDiscoveryChallengeToMemory(result: NaturalCompoundDiscoveryChallengeResult): SavedExperiment {
  const finalGraph = result.loopResult.finalGraph;
  const byStatus = (s: EpistemicStatus) => finalGraph.nodes.filter((n) => n.kind === 'HYPOTHESIS' && n.status === s).length;
  return saveExperiment({
    labId: 'natural-compound-discovery-challenge',
    experimentId: `${GRAPH_ID}:${finalGraph.fingerprint}`,
    experimentName: 'Natural-compound discovery challenge (epistemic reasoning loop)',
    params: { candidateCount: result.pool.length, steps: result.loopResult.steps.length },
    stats: { supported: byStatus('SUPPORTED'), weakened: byStatus('WEAKENED'), falsified: byStatus('FALSIFIED'), unresolved: byStatus('UNRESOLVED') },
    analysis: result.loopResult.steps.map((s) => ({ title: `step-${s.stepIndex}`, kind: 'reasoning-step', body: `${s.selectedExperimentId ?? 'none'}: ${s.selection.selectionExplanation}` })),
    honesty: 'simplified',
    honestyNote: 'Every hypothesis status was either established by a real RDKit/ADMET-AI computation or a pure evidence-aggregation function, or propagated deterministically by the shared epistemic engine. No potency, activity, or clinical-equivalence claim is made for any candidate.',
    epistemicStatus: `TERMINATION=${result.loopResult.termination};SUPPORTED=${byStatus('SUPPORTED')};WEAKENED=${byStatus('WEAKENED')};FALSIFIED=${byStatus('FALSIFIED')};UNRESOLVED=${byStatus('UNRESOLVED')}`,
    assumptions: ['Applies the same epistemic engine used for the physics domain, unchanged, to prove domain-agnosticism.', 'PubChem/ChEMBL live lookup is blocked in this runtime; independent database records were never available as an evidence axis.'],
  });
}
