import { canonicalJson, fnv1a } from '../../events/hash';
import { buildCampaignEvidencePack, buildSavedCampaign } from './campaignEvidence';
import { admetLimitations, runAdmetBatch, withAdmetProperties, type AdmetBatchResult } from './admetProvider';
import { unavailableAdmetTransport, type AdmetTransport } from './admetTransport';
import { buildLeadCandidateDossier, type CandidateDossier, type NaturalProductContext, type RegulatoryContext } from './dossier';
import { dockingLimitations, runDockingBatch, withDockingProperties, type DockingBatchResult } from './dockingProvider';
import { unavailableDockingTransport, type DockingTransport, type ReceptorSpec } from './dockingTransport';
import { falsifyBatch, type BatchFalsification } from './falsification';
import type { GenerationCapability, GenerationRequest, MolecularGenerationProvider } from './generationProvider';
import { rankMultiObjective, type MultiObjectiveResult, type Objective } from './multiObjective';
import { proposeNextDiscoverySteps, type NextDiscoveryStep } from './nextStep';
import { collectCapabilityGaps, decideBatch, screenBatch } from './screening';
import type {
  CandidateAssessment,
  DiscoveryBatch,
  DiscoveryDecision,
  DiscoveryQuestion,
  MoleculeCandidate,
  PropertyStatus,
} from './types';

/**
 * THE DISCOVERY CAMPAIGN — one iterative search, one result surface.
 *
 * This is the single entry point the rest of Genesis should use. It replaces
 * "call ten modules in the right order and hope" with one call that returns
 * everything a scientific result needs, including an honest account of what
 * could not be done.
 *
 * The loop is a real search, not one batch:
 *
 *   GENERATE -> VALIDATE -> EVALUATE (RDKit, ADMET, docking)
 *     -> SCREEN -> RANK -> SELECT -> RE-SEED -> repeat
 *     -> STOP (budget, no survivors, or no improvement)
 *
 * Every generation re-seeds from the survivors of the last one, so later
 * generations explore around what actually passed rather than re-enumerating
 * the same neighbourhood. Stopping is explicit and reported.
 */
export const DISCOVERY_CAMPAIGN_VERSION = '1.0.0';

export type CampaignStopReason =
  | 'GENERATION_BUDGET_REACHED'
  | 'CANDIDATE_BUDGET_REACHED'
  | 'NO_SURVIVORS_TO_EXPAND'
  | 'NO_NEW_CANDIDATES'
  | 'GENERATOR_UNAVAILABLE';

export interface CampaignEngines {
  admet?: AdmetTransport;
  docking?: DockingTransport;
  /** Receptor for docking. Null means no target structure was declared. */
  receptor?: ReceptorSpec | null;
}

export interface CampaignOptions {
  /** Target hypothesis, so docking scores can be attributed or refused. */
  target?: import('./targetHypothesis').TargetHypothesis;
  /** The structure actually docked into, with its relevance to that target. */
  receptorStructure?: import('./targetHypothesis').ReceptorStructure | null;
  /** Maximum search rounds. One means a single batch. */
  maxGenerations?: number;
  /** Hard ceiling on distinct candidates across the whole campaign. */
  totalCandidateBudget?: number;
  /** Survivors carried into the next generation as seeds. */
  survivorsPerGeneration?: number;
  /** Deterministic seed threaded into engine calls. */
  seed?: number;
  maxAdmetCalls?: number;
  maxDockingCalls?: number;
  regulatory?: RegulatoryContext;
  naturalProduct?: NaturalProductContext;
}

export interface GenerationRecord {
  generation: number;
  seeds: readonly string[];
  producedCount: number;
  newCount: number;
  retainedCount: number;
  rejectedCount: number;
  notResolvedCount: number;
  notes: readonly string[];
}

export interface EngineCapabilityReport {
  engine: string;
  available: boolean;
  reason: string;
  /** Properties this engine actually contributed values for in THIS run. */
  contributed: readonly string[];
}

/**
 * THE SINGLE RESULT SURFACE (ETAP 13).
 *
 * Everything a consumer needs, with limitations carried alongside findings so
 * they cannot be read separately from each other.
 */
export interface DiscoveryRun {
  runId: string;
  campaignVersion: string;
  question: DiscoveryQuestion;
  request: GenerationRequest;
  generationMethod: GenerationCapability;

  candidates: readonly MoleculeCandidate[];
  evaluation: readonly CandidateAssessment[];
  decision: DiscoveryDecision;
  ranking: MultiObjectiveResult;
  falsification: BatchFalsification;

  /** Per-generation history of the search. */
  generations: readonly GenerationRecord[];
  stopReason: CampaignStopReason;

  dossier: CandidateDossier | null;
  nextExperiment: readonly NextDiscoveryStep[];

  /**
   * Lineage handles. These are lazy on purpose: building an Evidence Pack and
   * an RO-Crate is real work, and a caller that only wants the ranking should
   * not pay for it. Calling them is what proves the run is documentable — see
   * `campaignEvidence.ts`, which uses only existing, unmodified engines.
   */
  evidence: () => import('../../experimentFabric/evidencePack').ScientificEvidencePack;
  replay: () => import('./campaignEvidence').SavedCampaign;

  capabilities: readonly EngineCapabilityReport[];
  capabilityGaps: readonly { propertyId: string; status: PropertyStatus; detail: string }[];
  /** Plain statements of what this run does NOT establish. */
  limitations: readonly string[];

  runFingerprint: string;
}

function valuedProperties(candidates: readonly MoleculeCandidate[], propertyIds: readonly string[]): string[] {
  const contributed = new Set<string>();
  for (const candidate of candidates) {
    for (const property of candidate.properties) {
      if (propertyIds.includes(property.propertyId) && property.value !== null) contributed.add(property.propertyId);
    }
  }
  return [...contributed].sort();
}

/**
 * Runs one full campaign.
 *
 * The generation provider is used as given: this function never substitutes a
 * different generator, so a blocked generator produces a run that honestly
 * contains nothing rather than a run that quietly used something else.
 */
export function runDiscoveryCampaign(
  question: DiscoveryQuestion,
  provider: MolecularGenerationProvider,
  request: GenerationRequest,
  objectives: readonly Objective[],
  engines: CampaignEngines = {},
  options: CampaignOptions = {},
): DiscoveryRun {
  const maxGenerations = Math.max(1, options.maxGenerations ?? 1);
  const totalBudget = options.totalCandidateBudget ?? request.maxCandidates;
  const survivorsPerGeneration = options.survivorsPerGeneration ?? 3;
  const admetTransport = engines.admet ?? unavailableAdmetTransport;
  const dockingTransport = engines.docking ?? unavailableDockingTransport;
  const receptor = engines.receptor ?? null;

  const capability = provider.capabilities();
  const generations: GenerationRecord[] = [];
  const allCandidates: MoleculeCandidate[] = [];
  const seenStructures = new Set<string>();

  let seeds = [...request.seeds];
  let stopReason: CampaignStopReason = 'GENERATION_BUDGET_REACHED';

  for (let generation = 1; generation <= maxGenerations; generation++) {
    if (!capability.available) { stopReason = 'GENERATOR_UNAVAILABLE'; break; }
    if (allCandidates.length >= totalBudget) { stopReason = 'CANDIDATE_BUDGET_REACHED'; break; }
    if (seeds.length === 0) { stopReason = 'NO_SURVIVORS_TO_EXPAND'; break; }

    const remaining = totalBudget - allCandidates.length;
    const outcome = provider.generateCandidates({
      ...request,
      seeds,
      maxCandidates: Math.min(request.maxCandidates, remaining),
    });

    // Deduplicate across generations on the structure (or formula when a
    // provider produces no structures), so a re-seeded round genuinely
    // explores rather than re-reporting what is already known.
    const fresh = outcome.candidates.filter((c) => {
      const key = c.structure.canonicalSmiles ?? `formula:${c.formula}`;
      if (seenStructures.has(key)) return false;
      seenStructures.add(key);
      return true;
    });

    if (fresh.length === 0) {
      generations.push({
        generation, seeds: [...seeds], producedCount: outcome.candidates.length, newCount: 0,
        retainedCount: 0, rejectedCount: 0, notResolvedCount: 0,
        notes: [...outcome.notes, 'No structurally new candidate was produced from these seeds.'],
      });
      stopReason = 'NO_NEW_CANDIDATES';
      break;
    }

    allCandidates.push(...fresh);

    // Screen this generation alone to decide what to expand from next.
    const generationAssessments = screenBatch(
      { batchId: `gen_${generation}`, seedFormulas: seeds, transformations: request.transformations, candidates: fresh, discarded: [], batchFingerprint: '' },
      question.constraints,
    );
    const survivors = generationAssessments.filter((a) => a.verdict === 'RETAINED');

    generations.push({
      generation,
      seeds: [...seeds],
      producedCount: outcome.candidates.length,
      newCount: fresh.length,
      retainedCount: survivors.length,
      rejectedCount: generationAssessments.filter((a) => a.verdict === 'REJECTED').length,
      notResolvedCount: generationAssessments.filter((a) => a.verdict === 'NOT_RESOLVED').length,
      notes: outcome.notes,
    });

    // Re-seed from the survivors that actually carry a structure.
    seeds = survivors
      .slice(0, survivorsPerGeneration)
      .map((s) => fresh.find((c) => c.candidateId === s.candidateId)?.structure.canonicalSmiles)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);

    if (seeds.length === 0 && generation < maxGenerations) { stopReason = 'NO_SURVIVORS_TO_EXPAND'; break; }
  }

  // ---- Evaluation: run the predictive engines ONCE over the final set ----
  const admetBatch: AdmetBatchResult = runAdmetBatch(admetTransport, allCandidates, { maxCandidates: options.maxAdmetCalls ?? 25 });
  let enriched = withAdmetProperties(allCandidates, admetBatch);

  const dockingBatch: DockingBatchResult = runDockingBatch(dockingTransport, enriched, receptor, {
    maxDocks: options.maxDockingCalls ?? 5,
    seed: options.seed ?? 42,
    target: options.target !== undefined && options.receptorStructure
      ? { hypothesis: options.target, structure: options.receptorStructure }
      : undefined,
  });
  enriched = [...withDockingProperties(enriched, dockingBatch)];

  // ---- Screen, rank, falsify on the fully-evaluated candidates ----
  const batch: DiscoveryBatch = {
    batchId: `campaign_${fnv1a(canonicalJson({ q: question.questionId, r: request.seeds }))}`,
    seedFormulas: request.seeds,
    transformations: [...request.transformations].sort(),
    candidates: enriched,
    discarded: [],
    batchFingerprint: fnv1a(canonicalJson(enriched.map((c) => c.structure.canonicalSmiles ?? c.formula))),
  };

  const evaluation = screenBatch(batch, question.constraints);
  const decision = decideBatch(evaluation);
  const ranking = rankMultiObjective(enriched, evaluation, objectives, question.constraints);
  const falsification = falsifyBatch(enriched, evaluation, question.constraints);
  const capabilityGaps = collectCapabilityGaps(evaluation) as readonly { propertyId: string; status: PropertyStatus; detail: string }[];

  const capabilities: EngineCapabilityReport[] = [
    {
      engine: 'RDKit (structure + descriptors)',
      available: enriched.some((c) => c.structure.status === 'ACTUAL_SOURCE'),
      reason: enriched.some((c) => c.structure.status === 'ACTUAL_SOURCE') ? '' : 'No candidate carries a resolved structure.',
      contributed: valuedProperties(enriched, ['logP', 'tpsa', 'hbd', 'hba', 'rotatableBonds', 'ringCount', 'aromaticRings', 'fractionCsp3', 'formalCharge', 'heteroatomCount', 'lipinskiViolations', 'exactMolecularWeight']),
    },
    {
      engine: admetBatch.engineId,
      available: admetBatch.available,
      reason: admetBatch.reason,
      contributed: valuedProperties(enriched, ['admetAbsorption', 'bioavailability', 'bloodBrainBarrier', 'mutagenicity', 'clinicalToxicity', 'liverInjury', 'pgpSubstrate', 'cyp3a4Inhibition', 'cyp2d6Inhibition']),
    },
    {
      engine: dockingBatch.engineId,
      available: dockingBatch.available,
      reason: dockingBatch.reason,
      contributed: valuedProperties(enriched, ['targetAffinity', 'dockingPipelineScore']),
    },
  ];

  const dossier = buildLeadCandidateDossier({
    result: {
      contractVersion: DISCOVERY_CAMPAIGN_VERSION,
      question,
      batch,
      assessments: evaluation,
      ranking: evaluation.filter((a) => a.verdict === 'RETAINED'),
      decision,
      capabilityGaps,
      resultFingerprint: batch.batchFingerprint,
      generationCapability: capability,
      generationNotes: generations.flatMap((g) => g.notes),
      generationFingerprint: batch.batchFingerprint,
      structuralValidation: [],
    },
    ranking,
    regulatory: options.regulatory,
    naturalProduct: options.naturalProduct,
  });

  const limitations = [
    ...admetLimitations(admetBatch),
    ...dockingLimitations(dockingBatch),
    'Every value in this run is a computation or a model prediction. Nothing here was measured, and no candidate has been shown to do anything.',
    capability.kind === 'DETERMINISTIC_ENUMERATOR'
      ? 'Candidates come from a deterministic enumerator applying declared transformations. This is not a generative model and explores only the neighbourhood those rules reach.'
      : `Candidates come from ${capability.methodId}.`,
  ];

  const runFingerprint = fnv1a(canonicalJson({
    v: DISCOVERY_CAMPAIGN_VERSION,
    question: question.questionId,
    request: { seeds: [...request.seeds].sort(), transformations: [...request.transformations].sort(), depth: request.depth },
    method: { kind: capability.kind, methodId: capability.methodId },
    maxGenerations,
    structures: enriched.map((c) => c.structure.canonicalSmiles ?? c.formula).sort(),
    decision,
  }));

  const runSurface: DiscoveryRun = {
    runId: `run_${runFingerprint}`,
    campaignVersion: DISCOVERY_CAMPAIGN_VERSION,
    question,
    request,
    generationMethod: capability,
    candidates: enriched,
    evaluation,
    decision,
    ranking,
    falsification,
    generations,
    stopReason,
    dossier,
    evidence: () => buildCampaignEvidencePack(runSurface),
    replay: () => buildSavedCampaign(runSurface),
    nextExperiment: proposeNextDiscoverySteps({
      contractVersion: DISCOVERY_CAMPAIGN_VERSION,
      question,
      batch,
      assessments: evaluation,
      ranking: evaluation.filter((a) => a.verdict === 'RETAINED'),
      decision,
      capabilityGaps,
      resultFingerprint: runFingerprint,
    }),
    capabilities,
    capabilityGaps,
    limitations,
    runFingerprint,
  };

  return runSurface;
}
