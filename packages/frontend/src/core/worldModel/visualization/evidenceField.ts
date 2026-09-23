import { canonicalJson, fnv1a } from '../../events/hash';
import type { GenesisEvent } from '../../events/genesisEvent';
import type { WorldEvidenceBundle } from '../evidence/worldEvidenceBundle';
import { entityId, type GroundingLevel, type ScaleDomain, type WorldModelEntity } from '../ecs/types';
import type { TemporalEngine } from '../temporal/temporalEngine';

export type EvidenceFieldQuality = 'LOW' | 'MEDIUM' | 'HIGH';
export type EvidenceFieldReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED' | 'NOT_REPRODUCIBLE';
export type EvidenceFieldEpistemic = 'DIRECT_STATE' | 'DERIVED_MODEL' | 'SIMULATION' | 'VISUAL_CONTEXT_ONLY';

export interface EvidenceFieldDivergence {
  readonly eventId: string;
  readonly tick: number;
  readonly branchId: string;
  readonly changedEntityIds: readonly string[];
  readonly parameterChange?: Readonly<Record<string, unknown>>;
  readonly provenanceRef: string;
}

export interface EvidenceFieldNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly scale: ScaleDomain;
  readonly epistemic: EvidenceFieldEpistemic;
  readonly position: readonly [number, number, number];
  readonly magnitude: number;
  readonly changed: boolean;
}

export interface EvidenceFieldEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: 'HIERARCHY' | 'RELATIONSHIP';
}

export interface EvidenceFieldDescriptor {
  readonly contractVersion: '1.0.0';
  readonly worldId: string;
  readonly worldFingerprint: string;
  readonly tick: number;
  readonly branchId: string;
  readonly seed: number;
  readonly replayStatus: EvidenceFieldReplayStatus;
  readonly evidenceRefs: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly nodes: readonly EvidenceFieldNode[];
  readonly edges: readonly EvidenceFieldEdge[];
  readonly divergence: EvidenceFieldDivergence | null;
  /** Scientific/topological identity. Deliberately excludes quality tier. */
  readonly fieldFingerprint: string;
  readonly quality: EvidenceFieldQuality;
  readonly presentation: {
    readonly haloSegments: number;
    readonly lineOpacity: number;
    readonly pointDetail: number;
  };
  readonly disclosure: 'VISUALIZATION_ONLY_NOT_EVIDENCE';
}

/** Converts an event already present in the canonical Evidence bundle into a traceable visual divergence. */
export function evidenceFieldDivergenceFromEvent(
  evidence: WorldEvidenceBundle,
  event: GenesisEvent,
  branchId: string,
): EvidenceFieldDivergence {
  if (!evidence.eventLog.some((candidate) => candidate.id === event.id)) {
    throw new Error(`EVIDENCE_FIELD_EVENT_NOT_IN_BUNDLE:${event.id}`);
  }
  return {
    eventId: event.id,
    tick: event.timestamp,
    branchId,
    changedEntityIds: event.affectedEntities.map(entityId).sort(),
    parameterChange: event.parameters,
    provenanceRef: evidence.scientificContentFingerprint,
  };
}

const SCALE_INDEX: Readonly<Record<ScaleDomain, number>> = {
  PLANET: 0, REGION: 1, MACRO_CITY: 2, DISTRICT: 3, PARCEL: 4, BUILDING: 5,
  FLOOR: 6, ROOM: 7, MESO_LAB: 8, MICRO_MOLECULAR: 9, NANO_ATOMIC: 10,
};

function unitHash(value: string): number {
  return Number.parseInt(fnv1a(value), 16) / 0xffffffff;
}

function epistemicOf(grounding: GroundingLevel): EvidenceFieldEpistemic {
  if (grounding === 'GROUNDED_EXACT') return 'DIRECT_STATE';
  if (grounding === 'MODEL_ESTIMATE') return 'SIMULATION';
  if (grounding === 'PROCEDURAL_APPROXIMATION') return 'DERIVED_MODEL';
  return 'VISUAL_CONTEXT_ONLY';
}

function magnitudeOf(entity: WorldModelEntity): number {
  const values = Object.values(entity.domainState ?? {}).filter(Number.isFinite).map(Math.abs);
  if (values.length === 0) return 0.25;
  const max = Math.max(...values);
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.min(1, Math.log10(1 + sum) / Math.max(1, Math.log10(1 + max * values.length)));
}

function presentationFor(quality: EvidenceFieldQuality): EvidenceFieldDescriptor['presentation'] {
  if (quality === 'HIGH') return { haloSegments: 24, lineOpacity: 0.68, pointDetail: 2 };
  if (quality === 'MEDIUM') return { haloSegments: 12, lineOpacity: 0.52, pointDetail: 1 };
  return { haloSegments: 6, lineOpacity: 0.38, pointDetail: 0 };
}

/**
 * Projects the existing WorldGraph/Evidence/Replay state into a deterministic visual descriptor.
 * It computes no scientific result and stores no parallel state.
 */
export function buildEvidenceField(input: {
  readonly engine: TemporalEngine;
  readonly evidence: WorldEvidenceBundle;
  readonly branchId?: string;
  readonly quality?: EvidenceFieldQuality;
  readonly divergence?: EvidenceFieldDivergence | null;
}): EvidenceFieldDescriptor {
  const quality = input.quality ?? 'HIGH';
  // TemporalEngine's branch-N is deliberately process-local (see
  // BRANCH_LABEL_VOLATILITY_LIMITATION). Use a semantic identity unless the
  // comparison caller explicitly supplies WORLD_A/B/C.
  const branchId = input.branchId ?? 'BASELINE';
  const seed = input.evidence.seed ?? 0;
  const changed = new Set(input.divergence?.changedEntityIds ?? input.evidence.changedEntityIds);
  const entities = [...input.engine.graph.listEntities()].sort((a, b) => a.id.localeCompare(b.id));
  const nodes = entities.map((entity): EvidenceFieldNode => {
    const level = SCALE_INDEX[entity.scale.level];
    const angle = unitHash(`${seed}|${entity.id}|angle`) * Math.PI * 2;
    const radialJitter = unitHash(`${seed}|${entity.id}|radius`) * 1.8;
    const divergenceOffset = changed.has(entity.id)
      ? (unitHash(`${input.divergence?.eventId ?? 'changed'}|${entity.id}`) - 0.5) * 2.4
      : 0;
    const radius = 5 + level * 1.45 + radialJitter + divergenceOffset;
    return {
      id: entity.id,
      parentId: entity.scale.parentEntityId ?? null,
      scale: entity.scale.level,
      epistemic: epistemicOf(entity.grounding),
      position: [
        Number((Math.cos(angle) * radius).toFixed(6)),
        Number((0.5 + level * 0.72 + (unitHash(`${seed}|${entity.id}|height`) - 0.5) * 0.6).toFixed(6)),
        Number((Math.sin(angle) * radius).toFixed(6)),
      ],
      magnitude: Number(magnitudeOf(entity).toFixed(6)),
      changed: changed.has(entity.id),
    };
  });
  const hierarchyEdges = nodes.flatMap((node): EvidenceFieldEdge[] => node.parentId ? [{
    id: `hierarchy:${node.parentId}->${node.id}`,
    from: node.parentId,
    to: node.id,
    kind: 'HIERARCHY',
  }] : []);
  const relationshipEdges = [...input.engine.graph.listRelationships()]
    .map((relationship): EvidenceFieldEdge => ({
      id: `relationship:${relationship.kind}:${relationship.from}->${relationship.to}`,
      from: relationship.from,
      to: relationship.to,
      kind: 'RELATIONSHIP',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...hierarchyEdges, ...relationshipEdges].sort((a, b) => a.id.localeCompare(b.id));
  const evidenceRefs = [input.evidence.bundleId, input.evidence.scientificContentFingerprint];
  const provenanceRefs = input.evidence.eventLog.map((event) => event.id).sort();
  const scientificTopology = {
    worldId: input.evidence.worldId,
    worldFingerprint: input.evidence.baseline.worldStateFingerprint,
    tick: input.engine.tick,
    branchId,
    seed,
    replayStatus: input.evidence.replay.verdict,
    evidenceRefs,
    provenanceRefs,
    nodes,
    edges,
    divergence: input.divergence ?? null,
  };
  return {
    contractVersion: '1.0.0',
    ...scientificTopology,
    fieldFingerprint: fnv1a(canonicalJson(scientificTopology)),
    quality,
    presentation: presentationFor(quality),
    disclosure: 'VISUALIZATION_ONLY_NOT_EVIDENCE',
  };
}
