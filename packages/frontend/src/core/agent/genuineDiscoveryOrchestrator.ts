import { fnv1a, canonicalJson } from '../events/hash';
import { modelSpecFingerprint, normalizeModelSpec, type ModelSpec } from './modelSpace';
import type { OrchestratorCampaignRecord } from './campaignOrchestrator';
import {
  classifyDiscoveryStatus,
  assertValidDiscoveryStatus,
  makeEvidenceRef,
  type DiscoveryRecord,
  type NoveltyEvidence,
  type MatchedPriorArt,
  type SearchedCorpusEntry,
  type IndependentReplicationRecord,
  type DiscoveryChainLink,
} from './discoveryContracts';
import { runLiteratureLayer, overallFromLiteratureLayer, type LiteratureSearchClient } from './literatureNoveltyAdapter';
import { freezeBeforeReplication, runReplication, type ReplicationDataset } from './discoveryReplicationEngine';
import { runSelfFalsificationBattery, type StructuralDeclaration } from './selfFalsificationBattery';

/**
 * PHASE F, Krok 8+10 — GENUINE DISCOVERY ORCHESTRATOR: THE CAPSTONE.
 *
 * Composes every Phase F module built so far (Kroki 1, 3, 4, 5) around a
 * real Phase E `OrchestratorCampaignRecord` (Kroki 1-5, unmodified) into
 * the sequence the mandate calls the discovery track: NOVELTY (L1-L6) ->
 * REPLICATION -> SELF-FALSIFICATION -> `DiscoveryStatus`. This file
 * computes NO science itself — every number it touches was already
 * computed by a module built in an earlier Krok.
 *
 * SCOPE, DISCLOSED: Krok 7 (discovery strategies A-G) and Krok 9 (the
 * L0-L5 benchmark suite) were NOT built this session — this orchestrator
 * runs on whatever `CampaignResult` Phase E's own engine already produced
 * (residual/gap/survivor-driven, per directionFinder.ts's existing 4
 * sources), not a purpose-built anomaly/scaling/cross-domain detector.
 */

export const GENUINE_DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION = '1.0.0';

function findSpecForFingerprint(specs: readonly ModelSpec[], fingerprint: string): ModelSpec | null {
  return specs.find((s) => modelSpecFingerprint(normalizeModelSpec(s)) === fingerprint) ?? null;
}

export interface GenuineDiscoveryPipelineInput {
  readonly campaign: OrchestratorCampaignRecord;
  /** Empty array is legitimate (no sources declared) — `runLiteratureLayer` reports NO_ACCESS honestly for it. */
  readonly literatureClients: readonly LiteratureSearchClient[];
  readonly matchThreshold: number;
  readonly discoveryDataset: { readonly datasetId: string; readonly points: readonly { readonly x: number; readonly y: number; readonly sigma: number }[] };
  readonly replicationDataset: ReplicationDataset | null;
  readonly rivalSpec: ModelSpec;
  readonly structuralDeclaration: StructuralDeclaration;
  readonly numberOfHypothesesTested: number;
  readonly multipleTestingCorrectionApplied: boolean;
}

function combineNovelty(
  internalLevel: 'UNKNOWN' | 'NOT_NEW' | 'POSSIBLY_NOVEL' | 'NOVEL_WITHIN_CHECKED_CORPUS',
  internalReason: string,
  l5: Awaited<ReturnType<typeof runLiteratureLayer>>,
  l6: Awaited<ReturnType<typeof runLiteratureLayer>>,
  matchThreshold: number,
): NoveltyEvidence {
  const searchedCorpus: SearchedCorpusEntry[] = [
    { name: 'noveltyGate(L1-L4: internal memory/preregistration/pinned-datasets/declared-anchors)', version: '1', timestamp: new Date(0).toISOString(), queryFingerprint: fnv1a(canonicalJson({ internalLevel })), coverageEstimate: 'as checked by campaignOrchestrator.ts::labelCampaign' },
    l5.corpusEntry,
    l6.corpusEntry,
  ];

  if (internalLevel === 'NOT_NEW') {
    const matched: MatchedPriorArt = { ref: makeEvidenceRef('internal-memory-match', 'internal', internalReason), similarity: 1, matchedClaim: internalReason };
    return {
      l1InternalMemory: internalLevel, l2PreregisteredCorpus: internalLevel, l3PinnedPublicDatasets: internalLevel, l4DeclaredAnchors: internalLevel,
      l5ExternalLiteratureSearch: 'NOT_RUN', l6PostDiscoveryRecheck: 'NOT_RUN',
      overall: 'KNOWN', searchedCorpus, matchedPriorArt: [matched], unresolvedMatches: [], limitations: [], confidence: 1,
    };
  }

  const l5Overall = overallFromLiteratureLayer(l5, matchThreshold);
  const l6Overall = overallFromLiteratureLayer(l6, matchThreshold);
  const l5Matches = l5.status === 'OK' ? l5.matches : [];
  const l6Matches = l6.status === 'OK' ? l6.matches : [];
  const strongMatches = [...l5Matches, ...l6Matches].filter((m) => m.similarity >= matchThreshold);

  let overall: NoveltyEvidence['overall'];
  const limitations: string[] = [];
  if (strongMatches.length > 0) {
    overall = 'KNOWN';
  } else if (l5Overall === 'NO_ACCESS' || l6Overall === 'NO_ACCESS') {
    overall = 'NO_ACCESS';
    limitations.push('External literature search (L5) and/or the post-discovery recheck (L6) could not reach any declared source — novelty cannot be established beyond internal memory alone.');
  } else {
    overall = 'NO_KNOWN_PRIOR_FOUND';
    limitations.push(`Bounded to the checked corpus only (${searchedCorpus.map((c) => c.name).join('; ')}) — "not found here" is not a claim of novelty against all of science.`);
  }

  return {
    l1InternalMemory: internalLevel, l2PreregisteredCorpus: internalLevel, l3PinnedPublicDatasets: internalLevel, l4DeclaredAnchors: internalLevel,
    l5ExternalLiteratureSearch: l5Overall, l6PostDiscoveryRecheck: l6Overall,
    overall, searchedCorpus,
    matchedPriorArt: strongMatches,
    unresolvedMatches: [...l5Matches, ...l6Matches].filter((m) => m.similarity > 0 && m.similarity < matchThreshold).map((m) => m.matchedClaim),
    limitations,
    confidence: overall === 'NO_KNOWN_PRIOR_FOUND' ? 0.6 : overall === 'KNOWN' ? 1 : 0,
  };
}

/**
 * Runs the full genuine-discovery pipeline for one already-computed
 * `OrchestratorCampaignRecord`. Returns `null` only when the campaign has
 * no winning model to assess at all (nothing for this pipeline to run on).
 */
export async function runGenuineDiscoveryPipeline(input: GenuineDiscoveryPipelineInput): Promise<DiscoveryRecord | null> {
  const { campaign } = input;
  const winner = campaign.result.discovery.winningModel;
  if (winner === null) return null;
  const spec = findSpecForFingerprint(campaign.result.liveModelSpecs, winner.fingerprint);
  if (spec === null) return null;

  const query = { text: campaign.result.problem };
  const l5 = await runLiteratureLayer(input.literatureClients, query, 'L5');
  const l6 = await runLiteratureLayer(input.literatureClients, query, 'L6');
  const noveltyEvidence = combineNovelty(campaign.noveltyAssessment.level, campaign.noveltyAssessment.reason, l5, l6, input.matchThreshold);

  let replication: IndependentReplicationRecord | null = null;
  if (noveltyEvidence.overall === 'NO_KNOWN_PRIOR_FOUND' && input.replicationDataset !== null) {
    const freeze = freezeBeforeReplication(spec, winner.rss ?? 0);
    replication = runReplication({
      freeze,
      hypothesisSpec: spec,
      discoveryEffect: winner.rss ?? 0,
      discoveryDataset: input.discoveryDataset,
      replicationDataset: input.replicationDataset,
    });
  }

  const selfFalsification = runSelfFalsificationBattery({
    hypothesisSpec: spec,
    rivalSpec: input.rivalSpec,
    points: input.discoveryDataset.points,
    tautologyComponents: [],
    discoveryDataset: input.discoveryDataset,
    replicationDataset: input.replicationDataset,
    freeze: replication !== null ? freezeBeforeReplication(spec, winner.rss ?? 0) : null,
    replicationRetrievedAt: input.replicationDataset?.retrievedAt ?? null,
    numberOfHypothesesTested: input.numberOfHypothesesTested,
    multipleTestingCorrectionApplied: input.multipleTestingCorrectionApplied,
    declared: input.structuralDeclaration,
  });

  const status = classifyDiscoveryStatus({
    noveltyEvidence,
    replication,
    selfFalsification,
    hasConflictingEvidence: false,
    accessDeclared: true,
  });

  if (status === 'DISCOVERY') {
    assertValidDiscoveryStatus({ status, noveltyEvidence, replication, selfFalsification });
  }

  const chain: DiscoveryChainLink = {
    observationId: `${campaign.result.labId}:final-round`,
    anomalyId: campaign.direction?.originatingResidual ? `${campaign.result.labId}:residual` : null,
    gapStatement: campaign.direction?.question ?? campaign.result.problem,
    hypothesisId: `${campaign.result.labId}:winner`,
    modelId: winner.fingerprint,
    predictionId: fnv1a(canonicalJson({ formula: winner.formula })),
  };

  const record: Omit<DiscoveryRecord, 'recordId' | 'outcomeFingerprint' | 'replayHandle'> = {
    campaignId: campaign.result.labId,
    directionId: campaign.direction?.id ?? 'seed',
    status,
    strategy: 'RESIDUAL',
    anomaly: null,
    chain: [chain],
    preregFreeze: { hypothesisFingerprint: modelSpecFingerprint(normalizeModelSpec(spec)), predictionFingerprint: fnv1a(canonicalJson({ formula: winner.formula })), frozenAt: 0 },
    noveltyEvidence,
    replication,
    selfFalsification,
    graphRootId: campaign.result.campaignFingerprint,
    externalValidation: 'NOT_SOUGHT',
  };
  const outcomeFingerprint = fnv1a(canonicalJson(record));

  return { ...record, recordId: outcomeFingerprint, outcomeFingerprint, replayHandle: campaign.result.campaignFingerprint };
}
