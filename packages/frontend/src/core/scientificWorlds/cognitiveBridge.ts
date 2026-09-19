import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { GenesisCognitiveCore, createCognitiveCoreAdapters } from '@genesis/core/cognitive/index.js';
import type { CommandEnvelope, ExperimentProposal, WorldEntity, WorldRelation } from '@genesis/core/cognitive/index.js';
import { canonicalJson, fnv1a } from '../events/hash';
import type { ActionPlan } from './actionPlanner';
import { planActions } from './actionPlanner';
import { createExperimentSession, type ExperimentRunner, type ExperimentSession, type SessionInputs } from './experimentSession';
import type { HumanDigitalTwinManifest } from './humanLab/types';
import type { LabStation } from './labWorld';
import type { CommandCatalog, ParsedCommands } from './worldCommand';

/**
 * SCIENTIFIC WORLDS — THE COGNITIVE CORE ON THE CANONICAL SYSTEMS.
 *
 * The delivered GENESIS Cognitive Core (packages/core/src/cognitive, "AGI-
 * oriented", explicitly not a claim of AGI) is a proposer/planner with
 * adapters. This bridge binds those adapters to what already exists here,
 * and adds the one thing the pack leaves to the host: REAL approval. The
 * pack's CommandPolicy passes a BIOLOGICAL/IRREVERSIBLE command as soon as
 * the command itself says `requiresApproval: true`; here such a command
 * (and every experiment proposal, which the pack marks as needing human
 * approval) is dispatched only with a token a human granted for that exact
 * id. Evidence: the core may append hypotheses and model notes to the
 * kernel ledger; it can never assert an observation or a verified source —
 * only instruments and sessions do that. Commands: `WORLD_COMMAND` text
 * goes through the same parser and planner the chat bar uses; the host
 * decides whether the resulting plan is executed by the agent.
 */

export interface ApprovalToken { readonly subjectId: string; readonly grantedBy: string; readonly tokenId: string; readonly logicalTime: number; }

export interface ApprovalRegistry {
  grant(subjectId: string, grantedBy: string): ApprovalToken;
  has(subjectId: string): boolean;
  revoke(subjectId: string): void;
  list(): readonly ApprovalToken[];
}

export function createApprovalRegistry(): ApprovalRegistry {
  const tokens = new Map<string, ApprovalToken>();
  let clock = 0;
  return {
    grant(subjectId, grantedBy) {
      if (!grantedBy.trim()) throw new Error('APPROVAL_REQUIRES_A_HUMAN_NAME');
      clock += 1;
      const t: ApprovalToken = { subjectId, grantedBy: grantedBy.trim(), tokenId: `apr-${fnv1a(`${subjectId}|${grantedBy}|${clock}`)}`, logicalTime: clock };
      tokens.set(subjectId, t); return t;
    },
    has: (subjectId) => tokens.has(subjectId),
    revoke: (subjectId) => { tokens.delete(subjectId); },
    list: () => [...tokens.values()],
  };
}

export interface CognitiveWorldBinding {
  readonly worldId: string;
  readonly catalog: CommandCatalog;
  readonly stations: readonly LabStation[];
  readonly parse: (text: string, logicalTime: number) => ParsedCommands;
  readonly runner: ExperimentRunner<unknown>;
  readonly ledger: EvidenceLedger;
  readonly manifest?: HumanDigitalTwinManifest;
  /** The host's hook for an accepted WORLD_COMMAND plan (e.g. the agent controller). Not called for refused commands. */
  readonly onPlan?: (plan: ActionPlan) => void;
  readonly defaultSeed?: number;
}

export interface ScientificWorldsCognitiveCore {
  readonly core: GenesisCognitiveCore;
  readonly approvals: ApprovalRegistry;
  readonly sessions: readonly ExperimentSession[];
  readonly plans: readonly ActionPlan[];
  listEntities(): WorldEntity[];
  listRelations(): WorldRelation[];
  /** Pull the world's entities and relations into the core's world model. */
  attach(): Promise<void>;
}

const HIGH_IMPACT: ReadonlySet<CommandEnvelope['safetyClass']> = new Set(['IRREVERSIBLE', 'BIOLOGICAL']);
const PRIMITIVE = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

export function worldEntitiesOf(binding: Pick<CognitiveWorldBinding, 'worldId' | 'stations' | 'manifest'>): { entities: WorldEntity[]; relations: WorldRelation[] } {
  const entities: WorldEntity[] = [{ id: binding.worldId, type: 'WORLD', label: binding.worldId, properties: { stations: binding.stations.length }, tags: ['world'] }];
  const relations: WorldRelation[] = [];
  for (const s of binding.stations) {
    entities.push({ id: s.id, type: 'STATION', label: s.label, properties: { kind: s.kind, experimentId: s.experimentId ?? null, x: s.position.x, z: s.position.z }, tags: ['station', s.kind, s.experimentId ? 'runs-experiment' : 'no-experiment'] });
    relations.push({ subjectId: s.id, relation: 'IN_WORLD', objectId: binding.worldId });
    if (s.experimentId) relations.push({ subjectId: s.id, relation: 'RUNS', objectId: `experiment:${s.experimentId}` });
  }
  if (binding.manifest) {
    for (const n of binding.manifest.nodes) {
      entities.push({ id: n.id, type: `ANATOMY_${n.kind}`, label: n.label, properties: { system: n.system ?? null, y: n.positionMeters.y, epistemic: n.epistemic, assetSlot: n.assetSlot }, tags: ['anatomy', n.kind.toLowerCase(), ...(n.system ? [n.system.toLowerCase()] : [])] });
      if (n.parentId) relations.push({ subjectId: n.id, relation: 'PART_OF', objectId: n.parentId });
    }
  }
  return { entities, relations };
}

export function createScientificWorldsCognitiveCore(binding: CognitiveWorldBinding): ScientificWorldsCognitiveCore {
  const approvals = createApprovalRegistry();
  const sessions: ExperimentSession[] = [];
  const plans: ActionPlan[] = [];
  let logicalTime = 0;
  const stationFor = (id: unknown): LabStation | null => (typeof id === 'string' ? binding.stations.find((s) => s.id === id) ?? null : null);

  const adapters = createCognitiveCoreAdapters({
    async dispatchCommand(command: CommandEnvelope) {
      if (HIGH_IMPACT.has(command.safetyClass) && !approvals.has(command.id)) return { accepted: false, reason: `HUMAN_APPROVAL_REQUIRED:${command.id}` };
      if (command.type === 'WORLD_COMMAND') {
        const text = typeof command.payload.text === 'string' ? command.payload.text : '';
        if (!text.trim()) return { accepted: false, reason: 'WORLD_COMMAND_WITHOUT_TEXT' };
        logicalTime += 1;
        const parsed = binding.parse(text, logicalTime);
        const plan = planActions(parsed.commands, binding.catalog, null);
        if (!plan.steps.length) return { accepted: false, reason: plan.rejected[0]?.reason ?? (parsed.unresolved.length ? `UNRESOLVED:${parsed.unresolved.join(' | ')}` : 'NO_STEPS') };
        plans.push(plan); binding.onPlan?.(plan);
        return { accepted: true, result: { planId: plan.planId, steps: plan.steps.map((s) => s.kind), commandIds: plan.commandIds, unresolved: parsed.unresolved } };
      }
      if (command.type === 'INSPECT_TARGET') {
        const target = worldEntitiesOf(binding).entities.find((e) => e.id === command.payload.targetEntityId);
        return target ? { accepted: true, result: target } : { accepted: false, reason: `UNKNOWN_TARGET:${String(command.payload.targetEntityId)}` };
      }
      return { accepted: false, reason: `UNKNOWN_COMMAND_TYPE:${command.type}` };
    },
    async proposeExperiment(proposal: ExperimentProposal) {
      if (proposal.requiresHumanApproval && !approvals.has(proposal.id)) return { accepted: false, reason: `HUMAN_APPROVAL_REQUIRED:${proposal.id}` };
      const station = stationFor(proposal.intervention.stationId) ?? stationFor(proposal.intervention.variable);
      if (!station || !station.experimentId) return { accepted: false, reason: 'PROPOSAL_NAMES_NO_STATION_WITH_AN_EXPERIMENT' };
      const inputs: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(proposal.intervention)) if (k !== 'variable' && k !== 'mode' && k !== 'stationId' && k !== 'seed' && PRIMITIVE(v)) inputs[k] = v;
      const seed = typeof proposal.intervention.seed === 'number' ? proposal.intervention.seed : (binding.defaultSeed ?? 7);
      try {
        logicalTime += 1;
        const { session } = createExperimentSession({ worldId: binding.worldId, stationId: station.id, experimentId: station.experimentId, seed, inputs: inputs as SessionInputs, logicalTime }, binding.runner);
        sessions.push(session);
        return { accepted: true, sessionId: session.sessionId };
      } catch (e) { return { accepted: false, reason: e instanceof Error ? e.message : String(e) }; }
    },
    async appendEvidence(entry) {
      if (entry.epistemicStatus === 'REAL_OBSERVATION' || entry.epistemicStatus === 'VERIFIED_SOURCE') throw new Error(`COGNITIVE_CORE_CANNOT_ASSERT_${entry.epistemicStatus}`);
      const claimType = entry.epistemicStatus === 'HYPOTHESIS' || entry.epistemicStatus === 'SPECULATIVE' ? 'hypothesis' : 'model';
      const res = binding.ledger.addRecord({ sourceUrl: `genesis://cognitive-core/${binding.worldId}/${entry.kind}/${entry.id}`, sourceTimestamp: null, claim: `${entry.kind} ${entry.id} [${entry.epistemicStatus}] ${canonicalJson(entry.data)}${entry.provenance ? ` provenance=${entry.provenance}` : ''}`, claimType, confidence: 0.5, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-cognitive-core', independentSourceIds: [] } });
      return { id: res.record.id, hash: res.record.contentHash };
    },
    listEntities: async () => worldEntitiesOf(binding).entities,
    listRelations: async () => worldEntitiesOf(binding).relations,
  });
  const core = new GenesisCognitiveCore({ commandBus: adapters.commandBus, experimentFabric: adapters.experimentFabric });
  return {
    core, approvals, sessions, plans,
    listEntities: () => worldEntitiesOf(binding).entities,
    listRelations: () => worldEntitiesOf(binding).relations,
    attach: () => adapters.attach(core),
    /** Exposed for the host: evidence goes through the same gate as everything else. */
    ...({ evidence: adapters.evidence } as object),
  };
}
