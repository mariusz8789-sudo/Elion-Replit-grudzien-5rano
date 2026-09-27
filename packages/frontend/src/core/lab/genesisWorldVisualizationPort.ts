import * as THREE from 'three';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import { getFrameState, queryEntityState } from '../worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../worldModel/bridge/graphicsWorldFrameAdapter';
import { WorldFrameRenderer } from '../three/graphics/worldFrameRenderer';
import type { WorldModelEntity } from '../worldModel/ecs/types';
import type { DeterministicLabRuntime } from './labRuntime';
import type { CanonicalWorldVisualizationPort, RenderProbeResult, WorldEntityState } from './worldVisualizationIntegration';

/**
 * D-140 real-repo binding: `CanonicalWorldVisualizationPort` implemented on the ONE canonical
 * `WorldGraph`/`TemporalEngine` pair (`core/worldModel/ecs/worldGraph.ts`,
 * `core/worldModel/temporal/temporalEngine.ts`) plus the SAME C3->C2 bridge (`bridge/worldFrameState.ts`,
 * `bridge/graphicsWorldFrameAdapter.ts`) and the SAME `WorldFrameRenderer`
 * (`core/three/graphics/worldFrameRenderer.ts`) every other Genesis scientific world already
 * renders through — no second world, no second renderer.
 *
 * The render probe reuses this repo's own established convention for verifying
 * `WorldFrameRenderer` output (see `__tests__/graphicsWorldFrameRenderer.test.ts`): the real `three`
 * package driving a real `WorldFrameRenderer` against a plain `THREE.Group` root, inspected via
 * `getObjectForEntity`/`resolveEntityId` — the exact same mechanism, not a screenshot, since this
 * repo's own renderer tests never require a browser to prove the render is real either.
 *
 * `entity.scale.level` is fixed at `'MESO_LAB'` (the existing lab-scale ScaleDomain) — D-140 does
 * not introduce a new scale tier.
 */

const LABEL_SEPARATOR = '\u0000';

function encodeLabels(labels: Readonly<Record<string, string>>): string {
  return Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(LABEL_SEPARATOR);
}

function decodeLabels(statusLabel: string | undefined): Record<string, string> {
  if (!statusLabel) return {};
  const labels: Record<string, string> = {};
  for (const pair of statusLabel.split(LABEL_SEPARATOR)) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    labels[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return labels;
}

function toWorldEntityState(entity: WorldModelEntity): WorldEntityState {
  const position = entity.spatial?.position ?? { x: 0, y: 0, z: 0 };
  return {
    entityId: entity.id,
    kind: entity.domainBinding?.domainId ?? entity.ref.kind,
    position: [position.x, position.y, position.z],
    scalarState: entity.domainState ?? {},
    labels: decodeLabels(entity.statusLabel),
  };
}

export function createGenesisWorldVisualizationPort(
  deterministic: DeterministicLabRuntime,
): CanonicalWorldVisualizationPort {
  const engine = new TemporalEngine(new WorldGraph(), { label: 'd140-real-laboratory' });
  const renderRoot = new THREE.Group();
  const renderer = new WorldFrameRenderer(THREE, renderRoot);

  return {
    upsertScientificEntity(entityState: WorldEntityState): void {
      const [x, y, z] = entityState.position;
      engine.advance(0, (graph) => {
        if (graph.has(entityState.entityId)) {
          graph.updateEntity(entityState.entityId, {
            spatial: { position: { x, y, z } },
            domainState: { ...entityState.scalarState },
            statusLabel: encodeLabels(entityState.labels),
            domainBinding: { solverId: null, domainId: entityState.kind },
            grounding: 'MODEL_ESTIMATE',
          });
          return;
        }
        graph.addEntity({
          id: entityState.entityId,
          ref: { kind: entityState.kind, id: entityState.entityId },
          label: entityState.kind,
          scale: { level: 'MESO_LAB' },
          spatial: { position: { x, y, z } },
          domainBinding: { solverId: null, domainId: entityState.kind },
          domainState: { ...entityState.scalarState },
          statusLabel: encodeLabels(entityState.labels),
          grounding: 'MODEL_ESTIMATE',
          updatedAtTick: 0,
        });
      });
    },

    readScientificEntity(entityId: string): WorldEntityState | undefined {
      const entity = queryEntityState(engine, entityId);
      return entity ? toWorldEntityState(entity) : undefined;
    },

    renderProbe(entityId: string): RenderProbeResult {
      const frame = getFrameState(engine);
      renderer.sync(toGraphicsWorldFrame(frame));
      const object = renderer.getObjectForEntity(entityId);
      const frameEntity = frame.entities.find((e) => e.id === entityId);
      return {
        entityId,
        visible: object !== null,
        frameFingerprint: deterministic.fingerprint({ tick: frame.tick, entities: frame.entities }),
        renderedScalarState: frameEntity?.scalars ?? {},
      };
    },
  };
}
