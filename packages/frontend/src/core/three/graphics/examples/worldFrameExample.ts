import type * as THREE_NS from 'three';
import { WorldFrameRenderer, type EntityVisualSpec } from '../worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity } from '../worldFrame';
import { createGenesisMaterialPalette } from '../materials';
import { applyValueToEmissive } from '../stateVisualization';
import { CameraRig, type CameraIntent } from '../cameraRig';

/**
 * GENESIS GRAPHICS RUNTIME — Integration Example: WorldFrame → Scene
 * ====================================================================
 *
 * THIS FILE IS A REFERENCE PATTERN, NOT A REAL WORLD. Same status as
 * `heroApparatusExample.ts`: not imported by any route, not registered as a `Sim3D`. It exists to
 * prove `worldFrameRenderer.ts`'s pathway end-to-end with real THREE objects, since neither C1 nor
 * C3 has published the actual `WorldFrame` contract yet (see `worldFrame.ts`'s own doc) — this is
 * the reference integration point until they do, not a second production consumer.
 *
 * A tiny synthetic "world": one generic hub entity whose `risk` scalar rises over time (driving its
 * emissive color via the EXISTING `stateVisualization.ts` utilities — nothing new invented here),
 * a small `'instanced'`-kind population of generic markers that appear one at a time, and — once
 * enough synthetic time has passed — one entity with `grounding: 'NOT_MODELED'`, rendering as the
 * renderer's built-in honest-boundary placeholder instead of fabricated detail.
 *
 * `buildFrameAt(time)` is this example's OWN synthetic frame generator — a stand-in for whatever
 * C1/C3 will eventually supply. A real caller never writes anything like it; they call
 * `renderer.sync(realWorldFrame)` with whatever the world-model layer hands them.
 */

export interface ExampleWorldHandles {
  renderer: WorldFrameRenderer;
  /** Synthetic frame generator for this example only — see the module doc. */
  buildFrameAt(time: number): WorldFrame;
  /**
   * THE multi-scale proof point: the SAME `CameraRig` this engine already ships frames a shot on
   * the hub entity, scaled to ITS `scale` field — moving from a WIDE establishing shot down to a
   * MICRO vantage on the very same entity is just a different `intent`, never a different camera
   * system. This is what "the same camera system must be capable of moving between scales" (the
   * mission's own phrase) means concretely: one `CameraRig`, one `targetRadius` derived from
   * whatever the current entity's real scale is, any intent.
   */
  cameraRig: CameraRig;
  shootCameraAtHub(intent: CameraIntent, cut?: boolean): void;
}

const HUB_POSITION: THREE_NS.Vector3Tuple = [0, 1, 0];
const HUB_RADIUS = 1.2;

export function buildExampleWorld(THREE: typeof THREE_NS, scene: THREE_NS.Scene): ExampleWorldHandles {
  const materials = createGenesisMaterialPalette(THREE);
  const markerGeometry = new THREE.SphereGeometry(0.15, 8, 6);

  const resolveVisual = (entity: WorldFrameEntity): EntityVisualSpec => {
    if (entity.visualHint === 'instanced:marker') {
      return { kind: 'instanced', batchKey: 'markers', geometry: markerGeometry, material: materials.POLISHED_METAL };
    }
    // The generic default: a plain sphere, sized to the entity's own scale, flagged as
    // state-driven so `updateVisual` below knows it owns this material's emissive channel.
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5 * (entity.scale ?? 1), 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
    mesh.userData.stateDriven = true;
    return { kind: 'object', object: mesh };
  };

  const updateVisual = (entity: WorldFrameEntity, object: THREE_NS.Object3D): void => {
    if (!object.userData.stateDriven) return;
    const risk = entity.scalars?.risk;
    if (risk === undefined) return;
    const material = (object as THREE_NS.Mesh).material as THREE_NS.MeshStandardMaterial;
    // Same generic scalar -> emissive mapping every other scene in this engine uses — this example
    // invents no new visualization logic, only wires the existing one into the WorldFrame pathway.
    applyValueToEmissive(material, THREE, risk, { updateBaseColor: true, minIntensity: 0.2, maxIntensity: 0.9 });
  };

  const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual, updateVisual });

  function buildFrameAt(time: number): WorldFrame {
    const entities: WorldFrameEntity[] = [
      // The hub: a real generic entity carrying a generic scalar. This example never claims to
      // know what "risk" scientifically means — it's an opaque named number, same as any WorldFrame
      // entity's `scalars` field is documented to be.
      { id: 'hub', position: HUB_POSITION, scale: HUB_RADIUS, scalars: { risk: Math.min(1, time / 10) } },
    ];

    // A small instanced population appearing gradually — world-space positions (see
    // worldFrameRenderer.ts's own documented limitation: instanced-kind entities don't support
    // parentId, unlike 'object'-kind ones), orbiting the hub's own fixed position by hand instead.
    const markerCount = Math.min(12, Math.floor(time));
    for (let i = 0; i < markerCount; i++) {
      const angle = (i / 12) * Math.PI * 2 + time * 0.2;
      entities.push({
        id: `marker-${i}`,
        visualHint: 'instanced:marker',
        position: [Math.cos(angle) * 2, 1, Math.sin(angle) * 2],
      });
    }

    // Past a point, a genuinely deeper scale exists conceptually but this example has no real
    // state for it — the honest boundary, not an invented structure.
    if (time > 5) {
      entities.push({ id: 'unmodeled-depth', position: [0, 1.9, 0], scale: 0.4, grounding: 'NOT_MODELED' });
    }

    return { time, entities };
  }

  const cameraRig = new CameraRig(THREE, { intent: 'WIDE', target: HUB_POSITION, targetRadius: HUB_RADIUS });

  return {
    renderer,
    buildFrameAt,
    cameraRig,
    shootCameraAtHub(intent, cut = false) {
      const request = { intent, target: HUB_POSITION, targetRadius: HUB_RADIUS };
      if (cut) cameraRig.cut(request);
      else cameraRig.frame(request);
    },
  };
}
