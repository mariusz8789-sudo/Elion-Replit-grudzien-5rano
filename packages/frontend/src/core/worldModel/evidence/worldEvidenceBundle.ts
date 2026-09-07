import { canonicalJson, fnv1a } from '../../events/hash';
import type { GenesisEvent } from '../../events/genesisEvent';
import {
  entityRef,
  GENESIS_RO_CRATE_CONTEXT,
  RO_CRATE_EVIDENCE_PACK_VERSION,
  stableId,
  type GenesisRoCrate,
  type RoCrateGraphNode,
} from '../../experimentFabric/evidencePackRoCrate';
import { computeReplayVerdict, type ReplayVerdict } from '../../matrixFoundation/replayVerdict';
import type { WorldState } from '../../world/scientificWorldState';
import { collectScalars } from '../bridge/worldFrameState';
import type { BranchComparison } from '../bridge/worldFrameState';
import type { GroundingLevel } from '../ecs/types';
import { getCausalAncestry } from '../queries/worldQueries';
import type { TemporalEngine } from '../temporal/temporalEngine';

/**
 * EVIDENCE BUNDLE FOR A WORLDGRAPH SCENARIO.
 *
 * `experimentFabric/evidencePackRoCrate.ts` already exports real RO-Crate
 * JSON-LD, but it is fed by `hypothesisLoop`'s `ScientificEvidencePack` —
 * a different engine from the one the flagship flood scenario actually runs
 * on (`WorldGraph` + `TemporalEngine`, via `genesisScientificCity3.ts`).
 * Nothing exported what that scenario really produces: a `WorldState`, a
 * chronological event log, a causal chain, a baseline-vs-intervention branch
 * comparison, and a replay verdict.
 *
 * ## What this reuses rather than rebuilds
 *
 * The SERIALISATION FORMAT, not a copy of it: `@context`, the `@id`
 * conventions, and the protocol/input/activity/result node vocabulary all
 * come from `evidencePackRoCrate.ts`'s own exported primitives
 * (`GENESIS_RO_CRATE_CONTEXT`, `stableId`, `entityRef`,
 * `RO_CRATE_EVIDENCE_PACK_VERSION`). A consumer that can read one Genesis
 * RO-Crate can read this one.
 *
 * The alternative — building a synthetic `ScientificEvidencePack` and
 * calling the existing exporter — was rejected deliberately: a WorldGraph
 * scenario has no honest value for that pack's `protocol.arms`,
 * `repetitionsPerArm` or per-run `runFingerprint`, so it would have meant
 * inventing fields to satisfy a shape. Sharing the primitives keeps one
 * format with two honest sources.
 *
 * The REPLAY VOCABULARY is likewise reused, not re-coined:
 * `matrixFoundation/replayVerdict.ts` already defines
 * `MATCH | DRIFT | BLOCKED | NOT_REPRODUCIBLE` together with the rule that
 * a missing record or missing input can never be a silent pass.
 * `NOT_REPRODUCIBLE` is this codebase's existing name for "we did not
 * verify this", so no fourth synonym is introduced here.
 *
 * ## What this never does
 *
 * It runs no solver, forks no branch, and computes no physics. Every value
 * it carries was produced by something else and is passed through: the
 * `WorldState` a real tick produced, the events a real journal recorded,
 * the diff a real `compareBranches` computed, the verdict
 * `computeReplayVerdict` returned for fingerprints a caller actually
 * compared. Where a caller supplies nothing, the bundle says so rather than
 * filling the gap.
 */
export const WORLD_EVIDENCE_BUNDLE_CONTRACT_VERSION = '1.0.0';

/**
 * A limitation of the EXPORT itself, discovered by testing this exporter and
 * reported rather than hidden. It is kept separate from a scenario's
 * scientific limitations because it is a property of the engine, not of the
 * physics.
 *
 * Genesis solvers mint event identifiers from a module-global step counter
 * (`chem-evt:substance:s1:1:<n>`), so building the same scenario twice
 * inside one process yields event ids differing in that counter. The
 * SCIENCE is fully deterministic — same scalars, same fingerprints, same
 * event types, timestamps, causes and causal structure — but a byte-for-byte
 * identical re-export requires a fresh process.
 *
 * Rather than renaming ids at export (a provenance document must not rename
 * the things it documents) or silently ignoring it,
 * `scientificContentFingerprint` gives a consumer a stable identity over
 * everything except those volatile identifiers, so two exports can be
 * verified equivalent even when their ids differ.
 */
export const EVENT_ID_VOLATILITY_LIMITATION =
  'Event identifiers carry a process-global step counter, so re-exporting the same scenario within one process ' +
  'produces different event ids. All scientific content is deterministic; compare `scientificContentFingerprint` ' +
  'rather than raw bytes when checking two exports for equivalence.';

// ---------------------------------------------------------------------------
// Per-element scientific classification.
// ---------------------------------------------------------------------------

/**
 * The three-way disclosure the bundle reports per element. This is a
 * PROJECTION of the `GroundingLevel` every entity already carries, never a
 * second honesty scale:
 *
 * - `REAL` — a real domain solver advanced this entity, whether its update
 *   is exact (`GROUNDED_EXACT`) or an empirical/approximate published model
 *   (`MODEL_ESTIMATE`). The original level travels alongside so the
 *   distinction is never lost.
 * - `APPROXIMATION` — no domain solver ran; a generic procedural heuristic
 *   advanced it (`PROCEDURAL_APPROXIMATION`).
 * - `NOT_MODELLED` — the entity carries no domain binding at all
 *   (`UNGROUNDED_APPROXIMATION`): nothing modelled it, and the bundle says
 *   so rather than presenting it as a result.
 */
export type ElementClassification = 'REAL' | 'APPROXIMATION' | 'NOT_MODELLED';

export function classifyGrounding(grounding: GroundingLevel): ElementClassification {
  switch (grounding) {
    case 'GROUNDED_EXACT':
    case 'MODEL_ESTIMATE':
      return 'REAL';
    case 'PROCEDURAL_APPROXIMATION':
      return 'APPROXIMATION';
    default:
      return 'NOT_MODELLED';
  }
}

export interface ClassifiedElement {
  readonly entityId: string;
  readonly label: string;
  readonly classification: ElementClassification;
  /** The underlying `GroundingLevel` this classification projects — carried so nothing is lost in the projection. */
  readonly grounding: GroundingLevel;
  readonly solverId: string | null;
  readonly domainId: string | null;
}

/** Classifies every entity currently in an engine's graph, sorted by id so the bundle is deterministic. */
export function classifyWorldElements(engine: TemporalEngine): readonly ClassifiedElement[] {
  return engine.graph
    .listEntities()
    .map((entity) => ({
      entityId: entity.id,
      label: entity.label,
      classification: classifyGrounding(entity.grounding),
      grounding: entity.grounding,
      solverId: entity.domainBinding?.solverId ?? null,
      domainId: entity.domainBinding?.domainId ?? null,
    }))
    .sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Replay, over the vocabulary matrixFoundation already defines.
// ---------------------------------------------------------------------------

export interface BundleReplay {
  readonly verdict: ReplayVerdict;
  /** The fingerprint recorded for the original run, or null when nothing was recorded to compare against. */
  readonly recordedFingerprint: string | null;
  /** The fingerprint recomputed from an independent re-execution, or null when no verification run was supplied. */
  readonly recomputedFingerprint: string | null;
  readonly message: string;
}

/**
 * A deterministic fingerprint of an engine's world at its current head: the
 * solver-produced scalars of every entity, in id order. Uses the same
 * `collectScalars` projection `worldModelReplay.ts` already compares on, so
 * two independent paths to "did this reproduce" agree on what is being
 * compared.
 */
export function worldStateFingerprint(engine: TemporalEngine): string {
  const scalars = engine.graph
    .listEntities()
    .map((entity) => [entity.id, collectScalars(entity)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return fnv1a(canonicalJson(scalars));
}

/**
 * The bundle's replay claim. `verifyEngine` is an INDEPENDENTLY rebuilt and
 * re-executed engine; when a caller does not supply one, the verdict is
 * `NOT_REPRODUCIBLE` — this never reports MATCH for a check nobody ran.
 * The decision itself is `computeReplayVerdict`'s, not a second copy of the
 * same if/else chain.
 */
export function buildBundleReplay(engine: TemporalEngine, verifyEngine?: TemporalEngine, blockedReason?: string | null): BundleReplay {
  const recordedFingerprint = worldStateFingerprint(engine);
  const recomputedFingerprint = verifyEngine ? worldStateFingerprint(verifyEngine) : null;
  const verdict = computeReplayVerdict({
    inputsAvailable: verifyEngine !== undefined,
    recordFound: true,
    recordedFingerprint,
    recomputedFingerprint: recomputedFingerprint ?? '',
    blockedReason: blockedReason ?? null,
  });
  const message =
    verdict === 'MATCH'
      ? `Independently rebuilt and re-executed to tick ${engine.tick}; every solver-produced scalar matched.`
      : verdict === 'DRIFT'
        ? `An independent rebuild diverged from this run at tick ${engine.tick}. Reported as a real reproducibility failure, not smoothed over.`
        : verdict === 'BLOCKED'
          ? `Replay was blocked before any comparison could be made: ${blockedReason}`
          : 'No independent re-execution was supplied, so reproducibility was NOT verified. This is an absence of evidence, not evidence of a match.';
  return { verdict, recordedFingerprint, recomputedFingerprint, message };
}

// ---------------------------------------------------------------------------
// The bundle itself.
// ---------------------------------------------------------------------------

export interface BundleArm {
  /** Which branch of the real `TemporalEngine` this arm ran on. */
  readonly branchId: string;
  readonly label: string;
  readonly parentBranchId: string | null;
  readonly forkedAtTick: number | null;
  readonly headTick: number;
  /** The real `WorldState` this arm's own execution produced. */
  readonly worldState: WorldState;
  readonly worldStateFingerprint: string;
}

export interface BundleCausalChain {
  /** The event whose ancestry was traced. */
  readonly ofEventId: string;
  /** `[the event itself, ..., its root cause]`, exactly as `getCausalAncestry` returns it. */
  readonly chain: readonly GenesisEvent[];
}

export interface WorldEvidenceBundleInput {
  readonly bundleId: string;
  /** The user's own question or hypothesis, verbatim. Never inferred from the run. */
  readonly question: string;
  readonly worldId: string;
  readonly domainId: string;
  /** The baseline arm — what the world does with no intervention. */
  readonly baseline: { engine: TemporalEngine; worldState: WorldState };
  /** The intervention arm, when the scenario has one. A bundle with only a baseline is still a valid bundle. */
  readonly intervention?: { engine: TemporalEngine; worldState: WorldState; description: string };
  /** The real `compareBranches` output for the two arms, when both exist. */
  readonly comparison?: BranchComparison;
  /** Events whose causal ancestry should be traced into the bundle. */
  readonly causalChainEventIds?: readonly string[];
  /** An independently rebuilt and re-executed engine, when the caller actually ran one. */
  readonly verifyEngine?: TemporalEngine;
  readonly replayBlockedReason?: string | null;
  /** Known limitations, supplied by the caller (e.g. a `solverCapability` caveat). Never invented here. */
  readonly limitations?: readonly string[];
  /** Deterministic seed, when the scenario has one. `null` means the run is deterministic by construction with no seed. */
  readonly seed?: number | null;
}

export interface WorldEvidenceBundle {
  readonly contractVersion: string;
  readonly bundleId: string;
  readonly question: string;
  readonly worldId: string;
  readonly domainId: string;
  readonly seed: number | null;
  /** Every solver that really advanced an entity in this world, deduplicated and sorted. */
  readonly solvers: readonly { readonly solverId: string; readonly domainId: string }[];
  readonly classification: readonly ClassifiedElement[];
  /** Chronological across the whole run: sorted by timestamp, ties broken by event id so the order is total and reproducible. */
  readonly eventLog: readonly GenesisEvent[];
  readonly causalChains: readonly BundleCausalChain[];
  readonly baseline: BundleArm;
  readonly intervention: (BundleArm & { readonly description: string }) | null;
  /** Entities whose state actually differs between the arms — the answer to "what did the intervention change". */
  readonly changedEntityIds: readonly string[];
  readonly comparedAtTick: number | null;
  readonly replay: BundleReplay;
  readonly limitations: readonly string[];
  /** Ids the `WorldState` itself declared unmodelled — passed through, never re-derived. */
  readonly notModelled: readonly string[];
  /** Limitations of the EXPORT mechanism itself, as opposed to the scenario's science. */
  readonly exportLimitations: readonly string[];
  /**
   * A fingerprint over everything scientifically meaningful in this bundle,
   * EXCLUDING volatile identifiers (event ids, branch ids). Two runs of the
   * same scenario agree here even when their raw exports differ byte-wise —
   * see `EVENT_ID_VOLATILITY_LIMITATION`.
   */
  readonly scientificContentFingerprint: string;
}

/**
 * Everything that must match for two exports to be the same science, with
 * every process-local identifier deliberately left out: event ids and branch
 * ids are excluded, while event TYPES, timestamps, causes and the causal
 * structure are all included.
 */
function scientificContent(bundle: Omit<WorldEvidenceBundle, 'scientificContentFingerprint' | 'exportLimitations'>): unknown {
  return {
    question: bundle.question,
    worldId: bundle.worldId,
    domainId: bundle.domainId,
    seed: bundle.seed,
    solvers: bundle.solvers,
    classification: bundle.classification,
    events: bundle.eventLog.map((event) => ({
      type: event.type,
      timestamp: event.timestamp,
      cause: event.cause,
      source: event.source,
      affectedEntities: event.affectedEntities,
      parameters: event.parameters,
    })),
    causalChainShapes: bundle.causalChains.map((chain) => chain.chain.map((event) => `${event.type}@${event.timestamp}`)),
    baselineFingerprint: bundle.baseline.worldStateFingerprint,
    interventionFingerprint: bundle.intervention?.worldStateFingerprint ?? null,
    changedEntityIds: bundle.changedEntityIds,
    comparedAtTick: bundle.comparedAtTick,
    replayVerdict: bundle.replay.verdict,
    recordedFingerprint: bundle.replay.recordedFingerprint,
    recomputedFingerprint: bundle.replay.recomputedFingerprint,
    limitations: bundle.limitations,
    notModelled: bundle.notModelled,
  };
}

function armOf(engine: TemporalEngine, worldState: WorldState): BundleArm {
  const info = engine.describe();
  return {
    branchId: info.branchId,
    label: info.label,
    parentBranchId: info.parentBranchId,
    forkedAtTick: info.forkedAtTick,
    headTick: info.headTick,
    worldState,
    worldStateFingerprint: worldStateFingerprint(engine),
  };
}

/** Chronological order with a deterministic tiebreak, so two identical runs always produce the same log. */
function chronological(events: readonly GenesisEvent[]): readonly GenesisEvent[] {
  return [...events].sort((a, b) => (a.timestamp !== b.timestamp ? a.timestamp - b.timestamp : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Assembles the bundle from data the scenario already produced. Runs
 * nothing: every field is either passed through from a real execution, or
 * an explicit statement that the caller supplied nothing.
 */
export function buildWorldEvidenceBundle(input: WorldEvidenceBundleInput): WorldEvidenceBundle {
  const classification = classifyWorldElements(input.baseline.engine);
  const solverMap = new Map<string, { solverId: string; domainId: string }>();
  for (const element of classification) {
    if (element.solverId && element.domainId) solverMap.set(`${element.solverId}|${element.domainId}`, { solverId: element.solverId, domainId: element.domainId });
  }

  const activeEngine = input.intervention?.engine ?? input.baseline.engine;
  const eventLog = chronological(activeEngine.journal.allEvents());
  const causalChains: BundleCausalChain[] = (input.causalChainEventIds ?? []).map((ofEventId) => ({
    ofEventId,
    chain: getCausalAncestry(activeEngine, ofEventId),
  }));

  const changedEntityIds = input.comparison
    ? input.comparison.entityDiffs.filter((diff) => !diff.equal).map((diff) => diff.id).sort()
    : [];

  const core = {
    contractVersion: WORLD_EVIDENCE_BUNDLE_CONTRACT_VERSION,
    bundleId: input.bundleId,
    question: input.question,
    worldId: input.worldId,
    domainId: input.domainId,
    seed: input.seed ?? null,
    solvers: [...solverMap.values()].sort((a, b) => (a.solverId < b.solverId ? -1 : a.solverId > b.solverId ? 1 : 0)),
    classification,
    eventLog,
    causalChains,
    baseline: armOf(input.baseline.engine, input.baseline.worldState),
    intervention: input.intervention
      ? { ...armOf(input.intervention.engine, input.intervention.worldState), description: input.intervention.description }
      : null,
    changedEntityIds,
    comparedAtTick: input.comparison?.tick ?? null,
    replay: buildBundleReplay(input.baseline.engine, input.verifyEngine, input.replayBlockedReason),
    limitations: input.limitations ?? [],
    notModelled: input.baseline.worldState.notModeled ?? [],
  } as const;

  return {
    ...core,
    exportLimitations: [EVENT_ID_VOLATILITY_LIMITATION],
    scientificContentFingerprint: fnv1a(canonicalJson(scientificContent(core))),
  };
}

// ---------------------------------------------------------------------------
// RO-Crate projection — the SAME format `evidencePackRoCrate.ts` emits,
// built from its own exported primitives.
// ---------------------------------------------------------------------------

function bundleNodeId(bundleId: string): string {
  return `#evidence-bundle/${stableId(bundleId)}`;
}

function protocolNodeId(bundleId: string): string {
  return `#protocol/${stableId(bundleId)}`;
}

/**
 * Node ids are derived from the arm's ROLE and its content fingerprint, not
 * from `branchId`. `TemporalEngine` assigns branch ids from a process-global
 * counter, so the same scenario exported twice in different processes (or
 * after other branches were created) would otherwise produce different
 * `@id`s for identical science — unacceptable in a document whose purpose is
 * provenance. This matches the convention `evidencePackRoCrate.ts` already
 * documents for its own nodes ("content-hash-derived and therefore already
 * collision-safe"). The real, volatile `branchId` is still carried, as a
 * property where it belongs.
 */
function armNodeIds(role: string, fingerprint: string): { input: string; activity: string; result: string } {
  const key = stableId(`${role}-${fingerprint}`);
  return { input: `#input/${key}`, activity: `#run/${key}`, result: `#result/${key}` };
}

function armNodes(bundle: WorldEvidenceBundle, arm: BundleArm, protocolId: string, role: string, description: string | null): RoCrateGraphNode[] {
  const { input: inputId, activity: activityIdValue, result: resultId } = armNodeIds(role, arm.worldStateFingerprint);
  return [
    {
      '@id': inputId,
      '@type': ['prov:Entity', 'Dataset'],
      name: `Construction and conditions for ${role} branch ${arm.branchId}`,
      'genesis:branchId': arm.branchId,
      'genesis:parentBranchId': arm.parentBranchId,
      'genesis:forkedAtTick': arm.forkedAtTick,
      'genesis:seed': bundle.seed,
      'genesis:worldId': bundle.worldId,
      'genesis:domainId': bundle.domainId,
      ...(description === null ? {} : { 'genesis:interventionDescription': description }),
    },
    {
      '@id': activityIdValue,
      '@type': 'prov:Activity',
      name: `Genesis world-model run on branch ${arm.branchId} (${role})`,
      'prov:used': [entityRef(protocolId), entityRef(inputId)],
      'genesis:branchId': arm.branchId,
      'genesis:role': role,
      'genesis:headTick': arm.headTick,
      'genesis:contractVersion': arm.worldState.contractVersion,
      'genesis:solvers': bundle.solvers,
      'genesis:deterministic': bundle.seed === null,
    },
    {
      '@id': resultId,
      '@type': ['prov:Entity', 'Dataset'],
      name: `World state at tick ${arm.worldState.tick} on branch ${arm.branchId}`,
      'prov:wasGeneratedBy': entityRef(activityIdValue),
      'genesis:tick': arm.worldState.tick,
      'genesis:worldStateFingerprint': arm.worldStateFingerprint,
      'genesis:entities': arm.worldState.entities,
      'genesis:relations': arm.worldState.relations,
      'genesis:observations': arm.worldState.observations,
      'genesis:notModeled': arm.worldState.notModeled,
    },
  ];
}

/**
 * Projects the bundle into the same RO-Crate JSON-LD document shape
 * `exportEvidencePackRoCrate` produces — same `@context`, same
 * protocol/input/activity/result vocabulary, same `@id` conventions — but
 * sourced from the world model rather than from a `ScientificEvidencePack`.
 */
export function exportWorldEvidenceBundleRoCrate(bundle: WorldEvidenceBundle): GenesisRoCrate {
  const protocolId = protocolNodeId(bundle.bundleId);
  const bundleId = bundleNodeId(bundle.bundleId);

  const armGraphNodes: RoCrateGraphNode[] = [
    ...armNodes(bundle, bundle.baseline, protocolId, 'baseline', null),
    ...(bundle.intervention ? armNodes(bundle, bundle.intervention, protocolId, 'intervention', bundle.intervention.description) : []),
  ];

  const eventLogId = `#event-log/${stableId(bundle.bundleId)}`;
  const causalChainId = `#causal-chain/${stableId(bundle.bundleId)}`;
  const comparisonId = `#comparison/${stableId(bundle.bundleId)}`;

  const graph: RoCrateGraphNode[] = [];

  graph.push({
    '@id': './',
    '@type': 'Dataset',
    name: `Genesis Evidence Bundle: ${bundle.bundleId}`,
    hasPart: [
      entityRef(bundleId),
      entityRef(protocolId),
      entityRef(eventLogId),
      entityRef(causalChainId),
      ...(bundle.intervention ? [entityRef(comparisonId)] : []),
      ...armGraphNodes.map((node) => entityRef(node['@id'])),
    ],
    'genesis:roCrateProfileVersion': RO_CRATE_EVIDENCE_PACK_VERSION,
  });

  graph.push({
    '@id': bundleId,
    '@type': ['CreativeWork', 'prov:Entity'],
    name: `Genesis World Evidence Bundle ${bundle.bundleId}`,
    identifier: bundle.bundleId,
    'prov:wasDerivedFrom': entityRef(protocolId),
    'genesis:contractVersion': bundle.contractVersion,
    'genesis:worldId': bundle.worldId,
    'genesis:domainId': bundle.domainId,
    'genesis:classification': bundle.classification,
    'genesis:replayVerdict': bundle.replay.verdict,
    'genesis:replayMessage': bundle.replay.message,
    'genesis:recordedFingerprint': bundle.replay.recordedFingerprint,
    'genesis:recomputedFingerprint': bundle.replay.recomputedFingerprint,
    'genesis:limitations': bundle.limitations,
    'genesis:exportLimitations': bundle.exportLimitations,
    'genesis:scientificContentFingerprint': bundle.scientificContentFingerprint,
    'genesis:notModeled': bundle.notModelled,
  });

  graph.push({
    '@id': protocolId,
    '@type': ['prov:Entity', 'CreativeWork'],
    name: `Genesis world-model scenario protocol ${bundle.bundleId}`,
    identifier: bundle.bundleId,
    'genesis:question': bundle.question,
    'genesis:worldId': bundle.worldId,
    'genesis:domainId': bundle.domainId,
    'genesis:solvers': bundle.solvers,
    'genesis:seed': bundle.seed,
  });

  graph.push({
    '@id': eventLogId,
    '@type': ['prov:Entity', 'Dataset'],
    name: `Chronological event log for ${bundle.bundleId}`,
    'genesis:eventCount': bundle.eventLog.length,
    'genesis:events': bundle.eventLog,
  });

  graph.push({
    '@id': causalChainId,
    '@type': ['prov:Entity', 'Dataset'],
    name: `Causal chains for ${bundle.bundleId}`,
    'genesis:causalChains': bundle.causalChains,
  });

  if (bundle.intervention) {
    graph.push({
      '@id': comparisonId,
      '@type': ['prov:Entity', 'Dataset'],
      name: `Baseline vs intervention comparison for ${bundle.bundleId}`,
      'prov:wasDerivedFrom': [
        entityRef(armNodeIds('baseline', bundle.baseline.worldStateFingerprint).result),
        entityRef(armNodeIds('intervention', bundle.intervention.worldStateFingerprint).result),
      ],
      'genesis:comparedAtTick': bundle.comparedAtTick,
      'genesis:baselineBranchId': bundle.baseline.branchId,
      'genesis:interventionBranchId': bundle.intervention.branchId,
      'genesis:interventionDescription': bundle.intervention.description,
      'genesis:changedEntityIds': bundle.changedEntityIds,
      'genesis:changedEntityCount': bundle.changedEntityIds.length,
    });
  }

  graph.push(...armGraphNodes);

  return { '@context': GENESIS_RO_CRATE_CONTEXT, '@graph': graph };
}

/** Deterministic, machine-readable serialisation — the same `canonicalJson` the existing exporter uses. */
export function serializeWorldEvidenceBundleRoCrate(bundle: WorldEvidenceBundle): string {
  return canonicalJson(exportWorldEvidenceBundleRoCrate(bundle));
}

/** The bundle itself as canonical JSON, for a consumer that wants the native shape rather than the RO-Crate projection. */
export function serializeWorldEvidenceBundle(bundle: WorldEvidenceBundle): string {
  return canonicalJson(bundle);
}
