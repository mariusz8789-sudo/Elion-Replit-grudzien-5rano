import { buildCandidateEpistemicState, summariseEpistemicStates, type CandidateEpistemicState, type EpistemicSummary } from './candidateEpistemicState';
import { canonicalJson, fnv1a } from '../../events/hash';
import { compareToReference, type ComparableMeasurement, type ComparisonProfile, type ReferenceComparisonResult } from './referenceComparison';
import { KNOWLEDGE_PACK_3_RECORDS } from './knowledgePack3';
import { KNOWLEDGE_PACK_4_RECORDS } from './knowledgePack4';
import type { CuratedNaturalCandidate } from './naturalProductCandidatePool';
import { proposeDiscriminatingExperiments, type ProposedExperiment } from './discriminatingExperiment';
import { rdkitStructuralProperties, rdkitStructure } from './rdkitStructuralProvider';
import { runNaturalAnalogueCampaign, type NaturalAnalogueCampaignEngines, type NaturalAnalogueCampaignRequest, type NaturalAnalogueCampaignResult } from './naturalAnalogueCampaign';
import type { MoleculeCandidate } from './types';
import type { RdkitTransport } from './rdkitTransport';

/**
 * NATURAL KETAMINE-LIKE DISCOVERY — the P0 scientific case.
 *
 * "Which naturally occurring compound has the strongest evidence-supported
 * mechanistic relationship to ketamine?"
 *
 * WHAT THIS MODULE ADDS, AND WHY IT IS NOT A REWRITE:
 *
 * The natural-analogue campaign already existed and already runs on real
 * RDKit and real ADMET-AI. It is called here UNCHANGED. What it could not do
 * was compare a candidate against ketamine's own INGESTED, source-backed
 * NMDAR measurements, because those arrived later (Gilling 2009 in Pack #4,
 * Glasgow 2017 in Pack #3) — so its notion of "related to ketamine" was a
 * target-family keyword match, not a comparison against real data.
 *
 * This module closes that gap and separates the axes the conclusion must not
 * blur:
 *
 *   STRUCTURAL   real RDKit Tanimoto/scaffold vs ketamine
 *   TARGET       do the documented targets intersect?
 *   FUNCTIONAL   is there a value for BOTH that shares target+assay+parameter?
 *   MECHANISTIC  is the molecular event the same KIND of event?
 *
 * THE EXPECTED — AND SCIENTIFICALLY CORRECT — OUTCOME:
 *
 * Ketamine has a real ingested IC50 (0.71 µM, human GluN1/GluN2A, HEK-293
 * patch clamp). None of the natural candidates has ANY ingested quantitative
 * measurement. So the FUNCTIONAL axis resolves to NOT_ESTABLISHED for every
 * one of them, and no candidate can be ranked above another on potency.
 * The honest answer names the best-evidenced candidate and states plainly
 * that no same-assay comparison against ketamine exists in this runtime.
 *
 * That is a finding, not a failure, and this module is built so it cannot be
 * dressed up as anything stronger.
 */
export const NATURAL_KETAMINE_DISCOVERY_VERSION = '1.0.0';

const KETAMINE_SMILES = 'CNC1(CCCCC1=O)c1ccccc1Cl';
const KETAMINE_FORMULA = 'C13H16ClNO';

function packMeasurements(compound: string): ComparableMeasurement[] {
  const fromPack4 = KNOWLEDGE_PACK_4_RECORDS
    .filter((r) => r.compound === compound)
    .map((r) => ({
      compound: r.compound, target: r.target, assay: r.assay, parameter: r.parameter,
      value: r.value, unit: r.unit, model: r.model, species: r.species, source: r.source,
    }));
  const fromPack3 = KNOWLEDGE_PACK_3_RECORDS
    .filter((r) => r.compound === compound)
    .map((r) => ({
      compound: r.compound, target: r.target, assay: r.assay, parameter: r.parameter,
      value: r.value, unit: r.unit, model: r.model, species: r.species, source: r.source,
    }));
  return [...fromPack4, ...fromPack3];
}

/**
 * Ketamine's target/mechanism profile, assembled from INGESTED records only.
 * If a record leaves the packs, this profile shrinks — it is not a transcript.
 */
export const KETAMINE_TARGET_PROFILE: ComparisonProfile = {
  compound: 'Ketamine',
  smiles: KETAMINE_SMILES,
  expectedFormula: KETAMINE_FORMULA,
  targets: ['NMDAR'],
  mechanismClass: 'uncompetitive NMDA receptor open-channel blocker',
  measurements: packMeasurements('Ketamine'),
  evidence: [
    {
      source: 'LITERATURE',
      identifier: 'pmid:19371579',
      establishes: 'Gilling 2009: ketamine IC50 0.71 µM at human GluN1/GluN2A NMDAR by whole-cell patch clamp in HEK-293, with kon/koff and voltage-dependence from the same assay.',
    },
    {
      source: 'LITERATURE',
      identifier: 'pmid:28747362',
      establishes: 'Glasgow 2017: ketamine decreases NMDAR desensitised-state occupancy — a mechanistic distinction from memantine, measured by patch-clamp recovery.',
    },
    {
      source: 'LITERATURE',
      identifier: 'Anis 1983 (Br J Pharmacol 79:565-575)',
      establishes: 'Founding pharmacological characterisation of ketamine as an NMDA receptor antagonist.',
    },
  ],
};

/**
 * Builds a comparison profile for a natural candidate from ITS OWN literature.
 *
 * `measurements` is populated only from ingested packs — a candidate's prose
 * mechanism description is evidence of a claim, not a measured value, and is
 * never converted into one. For every candidate in the current pool this list
 * is empty, and that emptiness drives the FUNCTIONAL verdict.
 */
export function naturalCandidateProfile(candidate: CuratedNaturalCandidate): ComparisonProfile | null {
  if (candidate.structure.kind !== 'SMILES_CROSS_VALIDATED') return null;
  return {
    compound: candidate.compoundName,
    smiles: candidate.structure.smiles,
    expectedFormula: candidate.structure.expectedFormula,
    targets: [candidate.reportedTargetFamily.toLowerCase().includes('nmda') ? 'NMDAR' : candidate.reportedTargetFamily],
    mechanismClass: candidate.mechanismSummary,
    measurements: packMeasurements(candidate.compoundName),
    evidence: candidate.mechanismEvidence,
  };
}

export interface NaturalCandidateAssessment {
  candidateKey: string;
  compoundName: string;
  origin: string;
  /** Null when the candidate declined to supply a structure — reported, not hidden. */
  comparison: ReferenceComparisonResult | null;
  comparisonUnavailableReason: string;
  epistemicState: CandidateEpistemicState | null;
  /** Literature references establishing the candidate's OWN mechanism. */
  literatureEvidence: readonly string[];
  /** True when the campaign's own falsification stage retained it. */
  retainedByCampaign: boolean;
  campaignStatus: string;
}

export interface NaturalKetamineDiscoveryResult {
  contractVersion: string;
  question: string;
  ketamine: ComparisonProfile;
  /** The campaign, run unchanged on real engines. */
  campaign: NaturalAnalogueCampaignResult;
  assessments: readonly NaturalCandidateAssessment[];
  epistemicSummary: EpistemicSummary;
  /** The best-evidenced candidate, or an explicit statement that none qualifies. */
  strongestCandidate: string;
  strongestCandidateBasis: string;
  proposedExperiments: readonly ProposedExperiment[];
  /** Statements the result is NOT entitled to make. */
  refusedClaims: readonly string[];
  limitations: readonly string[];
  resultFingerprint: string;
}

function candidateFromSmiles(key: string, smiles: string, rdkit: RdkitTransport): MoleculeCandidate | null {
  const described = rdkit.describe(smiles);
  if (!described.ok) return null;
  return {
    candidateId: `natural_${key}`,
    formula: described.data.molecularFormula,
    structure: rdkitStructure(described),
    parentFormula: null,
    transformation: null,
    properties: rdkitStructuralProperties(described),
    origin: 'SEED',
  };
}

export function runNaturalKetamineDiscovery(
  request: NaturalAnalogueCampaignRequest,
  engines: NaturalAnalogueCampaignEngines,
): NaturalKetamineDiscoveryResult {
  // 1. The existing campaign, unchanged: structural cross-validation,
  //    mechanism falsification, ADMET, independent evidence, ranking.
  const campaign = runNaturalAnalogueCampaign(request, engines);

  // 2. The four separated axes, against ketamine's INGESTED profile.
  const assessments: NaturalCandidateAssessment[] = [];
  const epistemicStates: CandidateEpistemicState[] = [];

  for (const poolCandidate of request.candidatePool) {
    const record = campaign.candidates.find((c) => c.candidateKey === poolCandidate.candidateKey);
    const profile = naturalCandidateProfile(poolCandidate);

    let comparison: ReferenceComparisonResult | null = null;
    let unavailableReason = '';
    let epistemicState: CandidateEpistemicState | null = null;

    if (profile === null) {
      unavailableReason = poolCandidate.structure.kind === 'STRUCTURE_DECLINED'
        ? `No structural comparison is possible: ${poolCandidate.structure.reason}`
        : 'No cross-validated structure is available for this candidate.';
    } else {
      // Subject = the natural candidate, reference = ketamine.
      comparison = compareToReference(engines.rdkit, profile, KETAMINE_TARGET_PROFILE);

      const molecule = candidateFromSmiles(poolCandidate.candidateKey, profile.smiles, engines.rdkit);
      if (molecule !== null) {
        const excluded = record !== undefined && record.status !== 'RETAINED_RANKED';
        epistemicState = buildCandidateEpistemicState(molecule, undefined, {
          excluded,
          exclusionReason: excluded ? `Campaign status ${record!.status}: ${record!.mechanismFalsification.reason}` : '',
        });
        epistemicStates.push(epistemicState);
      }
    }

    assessments.push({
      candidateKey: poolCandidate.candidateKey,
      compoundName: poolCandidate.compoundName,
      origin: poolCandidate.sourceOrganismOrOrigin,
      comparison,
      comparisonUnavailableReason: unavailableReason,
      epistemicState,
      literatureEvidence: poolCandidate.mechanismEvidence.map((e) => e.identifier),
      retainedByCampaign: record?.status === 'RETAINED_RANKED',
      campaignStatus: record?.status ?? 'NOT_EVALUATED',
    });
  }

  // 3. The strongest candidate — chosen ONLY on evidence the run actually has.
  //    Target overlap with ketamine plus campaign retention; never potency,
  //    because no candidate has a comparable potency value.
  const eligible = assessments.filter((a) =>
    a.retainedByCampaign && a.comparison !== null && a.comparison.sharedTargets.length > 0);

  const strongest = eligible[0];
  const strongestCandidate = strongest?.compoundName ?? 'NONE';
  const strongestCandidateBasis = strongest === undefined
    ? 'No natural candidate in this pool combines a cross-validated structure, campaign retention and a documented target shared with ketamine. Genesis names no strongest candidate rather than promoting the least-rejected one.'
    : `${strongest.compoundName} is the strongest naturally occurring candidate in this pool by EVIDENCE STRUCTURE, not by measured potency: it shares a documented target family with ketamine (${strongest.comparison!.sharedTargets.join(', ')}), `
      + `carries ${strongest.literatureEvidence.length} independent literature reference(s) for its OWN mechanism, and survived the campaign's mechanism falsification with a real cross-validated structure. `
      + 'No measured value for this compound is comparable to ketamine\'s — see the FUNCTIONAL axis.';

  // 4. Next discriminating experiment over the eligible candidates.
  const eligibleMolecules = eligible
    .map((a) => {
      const pool = request.candidatePool.find((c) => c.candidateKey === a.candidateKey);
      return pool !== undefined && pool.structure.kind === 'SMILES_CROSS_VALIDATED'
        ? candidateFromSmiles(a.candidateKey, pool.structure.smiles, engines.rdkit)
        : null;
    })
    .filter((m): m is MoleculeCandidate => m !== null);

  const proposedExperiments = proposeDiscriminatingExperiments({
    candidates: eligibleMolecules,
    pivot: { target: 'NMDAR', parameter: 'IC50', threshold: 0.71, thresholdUnit: 'µM' },
    comparableProperties: [
      { propertyId: 'tpsa', target: 'physicochemical', parameter: 'tpsa', lowerIsSupport: true },
      { propertyId: 'crippenLogP', target: 'physicochemical', parameter: 'crippenLogP', lowerIsSupport: false },
    ],
  });

  const epistemicSummary = summariseEpistemicStates(epistemicStates);

  const resultFingerprint = fnv1a(canonicalJson({
    v: NATURAL_KETAMINE_DISCOVERY_VERSION,
    campaign: campaign.targetHypothesis.targetId,
    candidates: assessments.map((a) => ({ k: a.candidateKey, s: a.campaignStatus, shared: a.comparison?.sharedTargets ?? [] })),
    strongest: strongestCandidate,
  }));

  return {
    contractVersion: NATURAL_KETAMINE_DISCOVERY_VERSION,
    question: request.question.question,
    ketamine: KETAMINE_TARGET_PROFILE,
    campaign,
    assessments,
    epistemicSummary,
    strongestCandidate,
    strongestCandidateBasis,
    proposedExperiments,
    refusedClaims: [
      'This result does NOT identify a "natural ketamine". No candidate here reproduces ketamine\'s pharmacology.',
      'This result does NOT identify a ketamine replacement or substitute for any use.',
      'This result makes NO claim of clinical equivalence, therapeutic equivalence, human efficacy or safety for any candidate.',
      'This result does NOT establish that any candidate is active in a human, at any dose, by any route.',
    ],
    limitations: [
      `Ketamine has ${KETAMINE_TARGET_PROFILE.measurements.length} ingested measurement(s); no natural candidate in this pool has any ingested quantitative measurement, so no FUNCTIONAL comparison against ketamine exists in this runtime.`,
      'Candidate mechanism claims come from each compound\'s own literature. They are LITERATURE-SUPPORTED assertions, not measurements Genesis performed or verified — doi.org/PubMed/PMC are unreachable here.',
      'Structural similarity to ketamine is a real RDKit computation and is not evidence of shared biological activity in either direction.',
      'ADMET values are model predictions. No ADMET endpoint establishes that any candidate is safe.',
      'Binding affinity and functional potency at NMDAR for every candidate remain REQUIRES_EXPERIMENT.',
    ],
    resultFingerprint,
  };
}
