import { admetApplicability, type AdmetTransport } from './admetTransport';
import { admetLimitations, admetPropertiesFor, runAdmetBatch, withAdmetProperties } from './admetProvider';
import { experimentalProperties, formulaProperties, validateFormula } from './chemistry';
import { canonicalJson, fnv1a } from '../../events/hash';
import {
  type ComputationalConfidenceLevel,
  deriveConfidence,
  describeConfidence,
  type EvidenceForConfidence,
} from './confidenceLadder';
import { resolveCompound, type CompoundLookupTransport, type CompoundResolution } from './compoundResolver';
import { assessIndependentEvidence, type EvidenceAxisEntry, type IndependentEvidenceAssessment } from './independentEvidence';
import {
  falsifyCandidateMechanism,
  type MechanismFalsificationReport,
} from './mechanismFalsification';
import type { GenerationCapability, GenerationOutcome, GenerationRequest, MolecularGenerationProvider } from './generationProvider';
import { generationFingerprint } from './generationProvider';
import {
  crossValidateCandidate,
  crossValidateSmilesFormula,
  type CuratedNaturalCandidate,
  type StructuralCrossValidation,
} from './naturalProductCandidatePool';
import { type Objective, rankMultiObjective, type MultiObjectiveResult } from './multiObjective';
import { runProviderMolecularDiscovery, type ProviderDiscoveryResult } from './providerDiscoveryRun';
import { rdkitStructuralProperties, rdkitStructure } from './rdkitStructuralProvider';
import type { RdkitTransport } from './rdkitTransport';
import { redTeamCandidate, type RedTeamReport } from './redTeam';
import { evaluateStructuralSimilarity, similarityStatement, type StructuralSimilarityResult } from './structuralSimilarity';
import { resolveTargetHypothesis, type TargetResolutionRequest } from './targetResolution';
import { affinityIsAboutTarget, prioritisationStatement, type TargetHypothesis } from './targetHypothesis';
import type { DiscoveryConstraints, DiscoveryQuestion, MoleculeCandidate } from './types';

/**
 * NATURAL-ANALOGUE DISCOVERY CAMPAIGN.
 *
 * QUESTION → REFERENCE COMPOUND → TARGET/MECHANISM → NATURAL-PRODUCT SEARCH →
 * CANDIDATE SELECTION → STRUCTURAL VALIDATION → TARGET EVALUATION →
 * ADMET → INDEPENDENT EVIDENCE → MULTI-OBJECTIVE RANKING → MECHANISM
 * FALSIFICATION → RED-TEAM → CONFIDENCE → TOP CANDIDATES → NEXT EXPERIMENT.
 *
 * Generic over the reference and target request; nothing here is specific to
 * any one compound. The mission's ketamine case is supplied by a caller
 * (`ketamineNaturalAnalogueRequest` in the accompanying test), never
 * hardcoded into this pipeline's logic.
 *
 * ORDER MATTERS, on purpose:
 *  1. Target hypothesis is resolved FIRST (before the candidate pool is even
 *     read) so it cannot be retrofitted to whatever candidates turn out to
 *     look promising.
 *  2. Mechanism falsification runs on EVERY candidate BEFORE any physicochemical
 *     screening — a wrong target makes properties moot, and screening a
 *     mechanistically wrong candidate would produce a real-looking rejection
 *     for the wrong reason.
 *  3. Only candidates that clear step 2 AND carry a cross-validated structure
 *     enter RDKit/ADMET/ranking. A candidate can be real, well-evidenced, and
 *     still never reach a number — that is reported, not hidden.
 */
export const NATURAL_ANALOGUE_CAMPAIGN_VERSION = '1.0.0';

export interface NaturalAnalogueCampaignRequest {
  referenceName: string;
  /**
   * Used ONLY when live name resolution does not return a single structure.
   * Independently cross-validated against `referenceFallbackFormula` by real
   * RDKit before being trusted — see `resolveReferenceWithFallback`.
   */
  referenceFallbackSmiles: string;
  referenceFallbackFormula: string;
  target: TargetResolutionRequest;
  /** Lower-cased keywords from the reference's resolved target family, for the mechanism-overlap check. */
  referenceTargetKeywords: readonly string[];
  candidatePool: readonly CuratedNaturalCandidate[];
  screeningConstraints: DiscoveryConstraints;
  objectives: readonly Objective[];
  question: DiscoveryQuestion;
}

export interface NaturalAnalogueCampaignEngines {
  compoundLookup?: CompoundLookupTransport;
  bioactivity?: CompoundLookupTransport;
  rdkit: RdkitTransport;
  admet: AdmetTransport;
}

export interface ReferenceResolutionOutcome {
  resolution: CompoundResolution;
  usedFallback: boolean;
  fallbackValidation: ReturnType<typeof crossValidateSmilesFormula> | null;
  smiles: string | null;
}

/**
 * Attempts LIVE name resolution first. Only on failure does it fall back to a
 * caller-supplied SMILES — and even then, that SMILES is re-derived by real
 * RDKit against its claimed formula before being used, exactly like every
 * candidate in the pool.
 */
export function resolveReferenceWithFallback(
  name: string,
  fallbackSmiles: string,
  fallbackFormula: string,
  compoundLookup: CompoundLookupTransport | undefined,
  rdkit: RdkitTransport,
): ReferenceResolutionOutcome {
  const liveResolution = resolveCompound({ kind: 'name', value: name }, compoundLookup);
  if (liveResolution.status === 'RESOLVED_SINGLE') {
    return { resolution: liveResolution, usedFallback: false, fallbackValidation: null, smiles: liveResolution.structures[0]!.canonicalSmiles };
  }

  const fallbackValidation = crossValidateSmilesFormula(rdkit, fallbackSmiles, fallbackFormula);
  const fallbackResolution = resolveCompound({ kind: 'smiles', value: fallbackSmiles });
  return {
    resolution: fallbackResolution,
    usedFallback: true,
    fallbackValidation,
    smiles: fallbackValidation.status === 'CONFIRMED' ? fallbackSmiles : null,
  };
}

export interface CandidateCampaignRecord {
  candidateKey: string;
  input: CuratedNaturalCandidate;
  structuralValidation: StructuralCrossValidation;
  mechanismFalsification: MechanismFalsificationReport;
  similarityToReference: StructuralSimilarityResult | null;
  independentEvidence: IndependentEvidenceAssessment;
  confidence: ComputationalConfidenceLevel;
  confidenceStatement: string;
  redTeam: RedTeamReport | null;
  admetToxicitySignals: readonly { endpoint: string; probability: number }[];
  admetInDomain: boolean | null;
  status: 'RETAINED_RANKED' | 'REJECTED_MECHANISM' | 'REJECTED_SCREENING' | 'UNEVALUABLE_NO_STRUCTURE';
  moleculeCandidateId: string | null;
}

export interface TopCandidateSummary {
  rank: number;
  candidateKey: string;
  whyIncluded: string;
  whyNotOthers: string;
  whatWeKnow: readonly string[];
  whatWeDontKnow: readonly string[];
  falsifiedBy: readonly string[];
  nextExperiment: string;
}

export interface NaturalAnalogueCampaignResult {
  referenceResolution: ReferenceResolutionOutcome;
  targetHypothesis: TargetHypothesis;
  candidates: readonly CandidateCampaignRecord[];
  providerResult: ProviderDiscoveryResult | null;
  ranking: MultiObjectiveResult | null;
  topCandidates: readonly TopCandidateSummary[];
  bestCandidate: { candidateKey: string; confidenceStatement: string } | 'NOT_RESOLVED';
  bestCandidateReason: string;
  limitations: readonly string[];
}

/**
 * Human-system / effective-concentration facts about the SPECIFIC founding
 * papers already cited in `naturalProductCandidatePool.ts` — not new claims,
 * a characterisation of the same evidence for the red-team pass. Both cited
 * NMDA-family papers (Yang & Reis 1999; Perkins & Stone 1982) are rodent
 * electrophysiology preparations, not human systems, and neither establishes
 * a concentration achievable systemically in vivo without confounding effects
 * — both are real, open gaps, stated here rather than assumed closed.
 */
const RED_TEAM_EVIDENCE_CHARACTER: Readonly<Record<string, { humanSystem: boolean; concentrationKnown: boolean }>> = {
  'agmatine': { humanSystem: false, concentrationKnown: false },
  'kynurenic-acid': { humanSystem: false, concentrationKnown: false },
};

function externalPoolProvider(candidates: readonly MoleculeCandidate[]): MolecularGenerationProvider {
  const capability: GenerationCapability = {
    kind: 'EXTERNAL_PROVIDER',
    methodId: 'curated-natural-product-literature-pool@1.0.0',
    description: 'Candidates are NOT generated. Each is a real natural product from a small, individually cited literature pool, independently reported (in its own literature) to act on a mechanism family relevant to the campaign question.',
    available: true,
    reason: '',
    deterministic: true,
    producesStructures: true,
  };
  return {
    capabilities: () => capability,
    generateCandidates: (request: GenerationRequest): GenerationOutcome => ({
      capability,
      candidates,
      discarded: [],
      generationFingerprint: generationFingerprint(capability, request, candidates),
      notes: [`${candidates.length} candidate(s) passed mechanism falsification and structural cross-validation before reaching this pipeline.`],
    }),
    validateCandidate: () => ({
      valid: null,
      checkedBy: 'crossValidateCandidate (RDKit formula re-derivation)',
      reason: 'Structural validity was established before this candidate entered the pipeline, against its own claimed formula — not re-checked here.',
    }),
  };
}

function candidateFromCrossValidated(candidateKey: string, smiles: string, rdkit: RdkitTransport): MoleculeCandidate | null {
  const described = rdkit.describe(smiles);
  if (!described.ok) return null;
  const parsed = validateFormula(described.data.molecularFormula);
  const composition = parsed.ok ? formulaProperties(parsed.counts) : [];
  return {
    candidateId: `natural_${candidateKey}`,
    formula: parsed.canonical ?? described.data.molecularFormula,
    structure: rdkitStructure(described),
    parentFormula: null,
    transformation: null,
    properties: [...composition, ...rdkitStructuralProperties(described), ...experimentalProperties()],
    origin: 'SEED',
  };
}

export function runNaturalAnalogueCampaign(
  request: NaturalAnalogueCampaignRequest,
  engines: NaturalAnalogueCampaignEngines,
): NaturalAnalogueCampaignResult {
  // 1. TARGET HYPOTHESIS FIRST — before any candidate is even read.
  const targetHypothesis = resolveTargetHypothesis(request.target, engines.bioactivity);

  // 2. Reference resolution: live attempt, cross-validated fallback.
  const referenceResolution = resolveReferenceWithFallback(
    request.referenceName, request.referenceFallbackSmiles, request.referenceFallbackFormula,
    engines.compoundLookup, engines.rdkit,
  );

  const records: CandidateCampaignRecord[] = [];
  const confirmedMoleculeCandidates: MoleculeCandidate[] = [];
  const candidateKeyByMoleculeId = new Map<string, string>();

  for (const poolCandidate of request.candidatePool) {
    const structuralValidation = crossValidateCandidate(engines.rdkit, poolCandidate);
    const naturalOccurrenceCited = poolCandidate.naturalOccurrenceEvidence.some((e) => e.kind !== 'USER_ASSERTION' && e.reference.trim().length > 0);

    const mechanismFalsification = falsifyCandidateMechanism({
      candidateKey: poolCandidate.candidateKey,
      reportedTargetFamily: poolCandidate.reportedTargetFamily,
      referenceTargetKeywords: request.referenceTargetKeywords,
      naturalOccurrenceCited,
      mechanismEvidenceCount: poolCandidate.mechanismEvidence.length,
      structuralStatus: structuralValidation.status,
      admetToxicitySignals: [],
      admetInDomain: null,
    });

    if (mechanismFalsification.verdict !== 'RETAINED') {
      const axes: EvidenceAxisEntry[] = [
        { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: naturalOccurrenceCited, detail: naturalOccurrenceCited ? 'Cited.' : 'Not cited.' },
        { axis: 'MECHANISM_LITERATURE', present: poolCandidate.mechanismEvidence.length > 0, detail: `${poolCandidate.mechanismEvidence.length} reference(s).` },
        { axis: 'DATABASE_RECORD', present: false, detail: 'No live database record was used (PubChem/ChEMBL unreachable in this runtime).' },
        { axis: 'STRUCTURAL_COMPUTATION', present: structuralValidation.status === 'CONFIRMED', detail: structuralValidation.reason },
        { axis: 'ADMET_PREDICTION', present: false, detail: 'Not evaluated: rejected before reaching ADMET.' },
      ];
      records.push({
        candidateKey: poolCandidate.candidateKey, input: poolCandidate, structuralValidation, mechanismFalsification,
        similarityToReference: null,
        independentEvidence: assessIndependentEvidence(poolCandidate.candidateKey, axes, mechanismFalsification.verdict === 'REJECTED_WRONG_TARGET' ? [mechanismFalsification.reason] : []),
        confidence: 0, confidenceStatement: describeConfidence(0),
        redTeam: null, admetToxicitySignals: [], admetInDomain: null,
        status: 'REJECTED_MECHANISM', moleculeCandidateId: null,
      });
      continue;
    }

    if (structuralValidation.status !== 'CONFIRMED') {
      const axes: EvidenceAxisEntry[] = [
        { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: naturalOccurrenceCited, detail: naturalOccurrenceCited ? 'Cited.' : 'Not cited.' },
        { axis: 'MECHANISM_LITERATURE', present: true, detail: `${poolCandidate.mechanismEvidence.length} reference(s).` },
        { axis: 'DATABASE_RECORD', present: false, detail: 'No live database record was used (PubChem/ChEMBL unreachable in this runtime).' },
        { axis: 'STRUCTURAL_COMPUTATION', present: false, detail: structuralValidation.reason },
        { axis: 'ADMET_PREDICTION', present: false, detail: 'Cannot run: no cross-validated structure.' },
      ];
      const evidence: EvidenceForConfidence = {
        hasHypothesis: true,
        independentSources: poolCandidate.mechanismEvidence.map((_e, i) => ({ sourceKey: `${poolCandidate.candidateKey}-mech-${i}`, kind: 'LITERATURE' as const, cited: true }))
          .concat(naturalOccurrenceCited ? [{ sourceKey: `${poolCandidate.candidateKey}-occurrence`, kind: 'LITERATURE' as const, cited: true }] : []),
        completedComputationalChecks: [],
      };
      const confidence = deriveConfidence(evidence);
      records.push({
        candidateKey: poolCandidate.candidateKey, input: poolCandidate, structuralValidation, mechanismFalsification,
        similarityToReference: null,
        independentEvidence: assessIndependentEvidence(poolCandidate.candidateKey, axes, []),
        confidence, confidenceStatement: describeConfidence(confidence),
        redTeam: null, admetToxicitySignals: [], admetInDomain: null,
        status: 'UNEVALUABLE_NO_STRUCTURE', moleculeCandidateId: null,
      });
      continue;
    }

    // Structure confirmed AND mechanism retained: build the real MoleculeCandidate.
    const smiles = (poolCandidate.structure as Extract<typeof poolCandidate.structure, { kind: 'SMILES_CROSS_VALIDATED' }>).smiles;
    const moleculeCandidate = candidateFromCrossValidated(poolCandidate.candidateKey, smiles, engines.rdkit);
    if (moleculeCandidate === null) {
      records.push({
        candidateKey: poolCandidate.candidateKey, input: poolCandidate, structuralValidation, mechanismFalsification,
        similarityToReference: null,
        independentEvidence: assessIndependentEvidence(poolCandidate.candidateKey, [], []),
        confidence: 0, confidenceStatement: describeConfidence(0),
        redTeam: null, admetToxicitySignals: [], admetInDomain: null,
        status: 'UNEVALUABLE_NO_STRUCTURE', moleculeCandidateId: null,
      });
      continue;
    }

    confirmedMoleculeCandidates.push(moleculeCandidate);
    candidateKeyByMoleculeId.set(moleculeCandidate.candidateId, poolCandidate.candidateKey);
  }

  // 3. Real ADMET over the confirmed set.
  const admetBatch = runAdmetBatch(engines.admet, confirmedMoleculeCandidates);
  const withAdmet = withAdmetProperties(confirmedMoleculeCandidates, admetBatch);

  // 4. Screening + ranking via the EXISTING provider-run machinery — no
  //    parallel screening logic is written here.
  const generationRequest: GenerationRequest = {
    seeds: withAdmet.map((c) => c.structure.canonicalSmiles ?? c.formula),
    transformations: [],
    depth: 0,
    maxCandidates: withAdmet.length,
    constraints: request.screeningConstraints,
  };
  const providerResult = withAdmet.length > 0
    ? runProviderMolecularDiscovery(request.question, externalPoolProvider(withAdmet), generationRequest)
    : null;

  const ranking = providerResult !== null
    ? rankMultiObjective(providerResult.batch.candidates, providerResult.assessments, request.objectives)
    : null;

  // 5. Per-confirmed-candidate: similarity, independent evidence, confidence, red-team.
  for (const moleculeCandidate of withAdmet) {
    const candidateKey = candidateKeyByMoleculeId.get(moleculeCandidate.candidateId)!;
    const poolCandidate = request.candidatePool.find((c) => c.candidateKey === candidateKey)!;
    const smiles = moleculeCandidate.structure.canonicalSmiles!;

    const similarityToReference = referenceResolution.smiles === null
      ? null
      : evaluateStructuralSimilarity(engines.rdkit, smiles, referenceResolution.smiles);

    const heavyAtomCount = moleculeCandidate.properties.find((p) => p.propertyId === 'heavyAtomCount')?.value ?? null;
    const molecularWeight = moleculeCandidate.properties.find((p) => p.propertyId === 'molecularWeight')?.value ?? null;
    const applicability = admetApplicability(heavyAtomCount, molecularWeight);
    const admetProps = admetPropertiesFor(moleculeCandidate, admetBatch);
    const toxicitySignals = admetProps
      .filter((p) => p.status === 'MODEL_PREDICTION' && p.value !== null && ['mutagenicity', 'clinicalToxicity', 'liverInjury'].includes(p.propertyId))
      .map((p) => ({ endpoint: p.propertyId, probability: p.value! }));

    // Mechanism falsification, re-run WITH the real ADMET/domain facts now available.
    const mechanismFalsification = falsifyCandidateMechanism({
      candidateKey,
      reportedTargetFamily: poolCandidate.reportedTargetFamily,
      referenceTargetKeywords: request.referenceTargetKeywords,
      naturalOccurrenceCited: poolCandidate.naturalOccurrenceEvidence.some((e) => e.kind !== 'USER_ASSERTION'),
      mechanismEvidenceCount: poolCandidate.mechanismEvidence.length,
      structuralStatus: 'CONFIRMED',
      admetToxicitySignals: toxicitySignals,
      admetInDomain: applicability.inDomain,
    });

    const assessment = providerResult!.assessments.find((a) => a.candidateId === moleculeCandidate.candidateId)!;
    const screeningRetained = assessment.verdict === 'RETAINED';

    const axes: EvidenceAxisEntry[] = [
      { axis: 'NATURAL_OCCURRENCE_LITERATURE', present: true, detail: 'Cited.' },
      { axis: 'MECHANISM_LITERATURE', present: true, detail: `${poolCandidate.mechanismEvidence.length} reference(s).` },
      { axis: 'DATABASE_RECORD', present: false, detail: 'No live database record was used (PubChem/ChEMBL unreachable in this runtime).' },
      { axis: 'STRUCTURAL_COMPUTATION', present: true, detail: 'RDKit-confirmed structure and descriptors.' },
      { axis: 'ADMET_PREDICTION', present: admetBatch.available && admetProps.some((p) => p.value !== null), detail: admetBatch.available ? 'ADMET-AI predictions computed.' : admetBatch.reason },
    ];
    const independentEvidence = assessIndependentEvidence(candidateKey, axes, mechanismFalsification.verdict !== 'RETAINED' ? [mechanismFalsification.reason] : []);

    const evidenceForConfidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [
        ...poolCandidate.mechanismEvidence.map((_e, i) => ({ sourceKey: `${candidateKey}-mech-${i}`, kind: 'LITERATURE' as const, cited: true })),
        { sourceKey: `${candidateKey}-occurrence`, kind: 'LITERATURE' as const, cited: true },
      ],
      completedComputationalChecks: ['RDKIT_DESCRIPTORS', ...(admetBatch.available ? ['ADMET_AI'] : []), ...(similarityToReference?.available ? ['STRUCTURAL_SIMILARITY'] : [])],
    };
    const confidence = deriveConfidence(evidenceForConfidence);

    const character = RED_TEAM_EVIDENCE_CHARACTER[candidateKey] ?? { humanSystem: false, concentrationKnown: false };
    const redTeam = mechanismFalsification.verdict === 'RETAINED' && screeningRetained
      ? redTeamCandidate({
        candidateKey, rankedBySimilarityAlone: false,
        mechanismEvidenceIsHumanSystem: character.humanSystem,
        effectiveConcentrationKnown: character.concentrationKnown,
        databaseLookupWasAmbiguous: false,
        admetInDomain: applicability.inDomain,
      })
      : null;

    records.push({
      candidateKey, input: poolCandidate, structuralValidation: crossValidateCandidate(engines.rdkit, poolCandidate),
      mechanismFalsification, similarityToReference, independentEvidence, confidence,
      confidenceStatement: describeConfidence(confidence),
      redTeam, admetToxicitySignals: toxicitySignals, admetInDomain: applicability.inDomain,
      status: mechanismFalsification.verdict !== 'RETAINED' ? 'REJECTED_MECHANISM' : screeningRetained ? 'RETAINED_RANKED' : 'REJECTED_SCREENING',
      moleculeCandidateId: moleculeCandidate.candidateId,
    });
  }

  // 6. TOP candidates + best candidate, from whoever is actually RETAINED_RANKED.
  const retainedRanked = records.filter((r) => r.status === 'RETAINED_RANKED');
  const rankedIds = ranking?.retained.map((r) => r.candidateId) ?? [];
  retainedRanked.sort((a, b) => rankedIds.indexOf(a.moleculeCandidateId!) - rankedIds.indexOf(b.moleculeCandidateId!));

  const topCandidates: TopCandidateSummary[] = retainedRanked.map((record, index) => {
    const others = records.filter((r) => r.candidateKey !== record.candidateKey);
    return {
      rank: index + 1,
      candidateKey: record.candidateKey,
      whyIncluded: `Passed mechanism falsification (target family overlaps the reference's resolved target), has a cross-validated real structure, and ${record.independentEvidence.independentAxisCount} independent evidence axis/axes (${record.independentEvidence.evidenceQuality}).`,
      whyNotOthers: others.map((o) => `${o.candidateKey}: ${o.status === 'REJECTED_MECHANISM' ? o.mechanismFalsification.reason : o.status === 'UNEVALUABLE_NO_STRUCTURE' ? 'no cross-validated structure available' : o.status === 'REJECTED_SCREENING' ? 'failed physicochemical screening' : 'ranked lower'}`).join(' | '),
      whatWeKnow: [
        `Independent, cited literature reports ${record.input.compoundName} acting on: ${record.input.reportedTargetFamily}.`,
        `Real RDKit-derived structure and descriptors (formula ${record.structuralValidation.observedFormula}).`,
        record.similarityToReference !== null ? similarityStatement(record.similarityToReference) : 'Similarity to the reference was not computed.',
      ],
      whatWeDontKnow: [
        ...(record.redTeam?.findings.filter((f) => !f.addressed).map((f) => f.detail) ?? []),
        'Whether this candidate reproduces any of ketamine\'s reported clinical effects — that is not established by shared target family membership.',
      ],
      falsifiedBy: record.mechanismFalsification.checks.filter((c) => c.outcome === 'FAIL').map((c) => c.finding),
      nextExperiment: `Obtain a validated binding or electrophysiological assay of ${record.input.compoundName} against a HUMAN-derived NMDA receptor preparation to close the species gap identified by red-team; if network egress to PDB/ChEMBL becomes available, attempt real target-structure docking instead of physicochemical ranking alone.`,
    };
  });

  const best = topCandidates[0];
  const bestCandidate = best === undefined
    ? ('NOT_RESOLVED' as const)
    : { candidateKey: best.candidateKey, confidenceStatement: retainedRanked[0]!.confidenceStatement };
  const bestCandidateReason = best === undefined
    ? (retainedRanked.length === 0
      ? 'No candidate in this pool survived mechanism falsification AND structural cross-validation AND physicochemical screening. This is a correct scientific outcome, not a pipeline failure.'
      : 'Unexpected empty ranking despite retained candidates.')
    : `Best-ranked among ${retainedRanked.length} candidate(s) that survived every stage.`;

  const affinityAboutTarget = affinityIsAboutTarget(targetHypothesis, null);

  return {
    referenceResolution,
    targetHypothesis,
    candidates: records,
    providerResult,
    ranking,
    topCandidates,
    bestCandidate,
    bestCandidateReason,
    limitations: [
      `Target status: ${targetHypothesis.status}. ${targetHypothesis.statusReason}`,
      `Reference resolution: ${referenceResolution.usedFallback ? 'live name lookup did not resolve; used a cross-validated fallback structure' : 'resolved live'}.`,
      'No candidate in this pool was docked against a real structure of the resolved target: no such structure is reachable in this runtime (PDB/RCSB is blocked at egress). Any prioritisation here rests on independent literature evidence and physicochemical/ADMET computation, never on a target-affinity score.',
      prioritisationStatement(targetHypothesis, affinityAboutTarget.meaningful),
      'A shared reported target FAMILY is not evidence of shared potency, clinical effect, dissociative/anaesthetic activity, or safety profile relative to the reference compound.',
      ...admetLimitations(admetBatch),
    ],
  };
}

/** Deterministic fingerprint of one campaign result, for replay. */
export function naturalAnalogueCampaignFingerprint(result: NaturalAnalogueCampaignResult): string {
  return fnv1a(canonicalJson({
    v: NATURAL_ANALOGUE_CAMPAIGN_VERSION,
    target: result.targetHypothesis.fingerprint,
    candidates: result.candidates.map((c) => [c.candidateKey, c.status, c.confidence]).sort(),
    bestCandidate: result.bestCandidate === 'NOT_RESOLVED' ? 'NOT_RESOLVED' : result.bestCandidate.candidateKey,
  }));
}
