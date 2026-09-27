import { fnv1a } from '../events/hash';
import { buildWalkCameraPath, type CameraPath } from '../temporalCinematic/cameraPath';
import {
  buildSw4EvidenceBundle,
  getSw4RenderState,
  replaySw4EpidemiologyCityScenario,
  type Sw4RenderState,
} from '../worldModel/scenarios/sw4EpidemiologyCity';
import type { WorldEvidenceBundle } from '../worldModel/evidence/worldEvidenceBundle';
import type { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import {
  buildEvidenceField,
  evidenceFieldDivergenceFromEvent,
  type EvidenceFieldDescriptor,
} from '../worldModel/visualization/evidenceField';

export type Sw4ComparisonBranch = 'BASELINE' | 'WORLD_A' | 'WORLD_B' | 'WORLD_C';

export interface DirectedSw4World {
  readonly prompt: string;
  readonly engine: TemporalEngine;
  readonly camera: CameraPath;
  readonly renderState: Sw4RenderState;
  readonly evidence: WorldEvidenceBundle;
  readonly evidenceField: EvidenceFieldDescriptor;
  readonly replayStatus: 'MATCH';
  readonly comparisonBranch: Sw4ComparisonBranch;
}

const COMPARISON_PARAMETERS: Readonly<Record<Sw4ComparisonBranch, {
  readonly interventionDay?: number;
  readonly interventionEffect?: number;
}>> = {
  BASELINE: {},
  WORLD_A: { interventionDay: 8, interventionEffect: 0.35 },
  WORLD_B: { interventionDay: 12, interventionEffect: 0.6 },
  WORLD_C: { interventionDay: 18, interventionEffect: 0.8 },
};

/** Explicit routing only: ordinary city prompts remain owned by the existing World Director. */
export function isSw4WorldPrompt(prompt: string): boolean {
  return /\b(?:sw[\s-]?4|seir|epidemi(?:c|ology|a|iolog|ologicz))\w*\b/i.test(prompt);
}

/**
 * Binds SW-4 to the existing World Director without adding a world, solver, replay system or renderer.
 * The returned engine is the exact canonical engine advanced by the registered RK4 SEIR solver.
 */
export function directSw4World(
  prompt: string,
  comparisonBranch: Sw4ComparisonBranch = 'BASELINE',
): DirectedSw4World {
  const normalized = prompt.trim();
  if (!isSw4WorldPrompt(normalized)) throw new Error('SW4_WORLD_PROMPT_REQUIRED');
  const promptHash = fnv1a(normalized.toLowerCase());
  const seed = Number.parseInt(promptHash, 16) & 0x7fffffff;
  const replay = replaySw4EpidemiologyCityScenario({
    seed,
    worldId: `sw4-city-${promptHash}`,
    populationCount: 50_000,
    ticks: 30,
    dtDays: 1,
    epidemicParams: COMPARISON_PARAMETERS[comparisonBranch],
  });
  if (replay.replay.verdict !== 'MATCH' || !replay.optionsFingerprintMatch) {
    throw new Error(`SW4_REPLAY_MISMATCH:${replay.replay.verdict}`);
  }
  const road = replay.run.engine.graph.listEntities().find((entity) => entity.geometry?.kind === 'ROAD');
  if (!road) throw new Error('SW4_RENDER_ROAD_MISSING');
  const pointsOfInterest = replay.run.engine.graph.listEntities().flatMap((entity) => {
    const geometry = entity.geometry;
    if (geometry?.kind !== 'BUILDING') return [];
    return [{
      x: (geometry.bounds.minX + geometry.bounds.maxX) * 0.5,
      z: (geometry.bounds.minZ + geometry.bounds.maxZ) * 0.5,
    }];
  });
  const evidence = buildSw4EvidenceBundle({
    bundleId: `sw4-world-director-${promptHash}-${comparisonBranch.toLowerCase()}`,
    question: normalized,
    run: replay.run,
    verifyRun: replay.verify,
  });
  const interventionDay = COMPARISON_PARAMETERS[comparisonBranch].interventionDay;
  const divergenceEvent = comparisonBranch === 'BASELINE'
    ? null
    : evidence.eventLog.find((event) => event.timestamp >= (interventionDay ?? 0)) ?? null;
  if (comparisonBranch !== 'BASELINE' && !divergenceEvent) {
    throw new Error(`SW4_DIVERGENCE_EVENT_MISSING:${comparisonBranch}`);
  }
  const evidenceField = buildEvidenceField({
    engine: replay.run.engine,
    evidence,
    branchId: comparisonBranch,
    divergence: divergenceEvent
      ? evidenceFieldDivergenceFromEvent(evidence, divergenceEvent, comparisonBranch)
      : null,
    quality: 'HIGH',
  });
  return {
    prompt: normalized,
    engine: replay.run.engine,
    camera: buildWalkCameraPath(road, { durationSeconds: 18, pointsOfInterest }),
    renderState: getSw4RenderState(replay.run),
    evidence,
    evidenceField,
    replayStatus: 'MATCH',
    comparisonBranch,
  };
}
