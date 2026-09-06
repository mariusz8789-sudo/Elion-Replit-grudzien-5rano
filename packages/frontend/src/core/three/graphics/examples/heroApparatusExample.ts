import type * as THREE_NS from 'three';
import { createGenesisMaterialPalette, createEmissiveInstrumentMaterial } from '../materials';
import { InstanceBatch } from '../instancing';
import { createHeroLight } from '../lighting';
import { applyShadowPolicy } from '../shadowPolicy';
import type { DepthOfFieldSettings } from '../postProcessing';
import { applyValueToEmissive, applyFractionToScale } from '../stateVisualization';

/**
 * GENESIS GRAPHICS RUNTIME — Integration Example: a hero apparatus
 * ==================================================================
 *
 * THIS FILE IS A REFERENCE PATTERN, NOT A SECOND LAB. It is not imported by
 * any route or registered as a `Sim3D`. It exists to show — in one place,
 * generically — how the rendering-layer pieces in `graphics/*` are meant to
 * compose:
 *
 *   Genesis PBR material  → `createGenesisMaterialPalette` / `createEmissiveInstrumentMaterial`
 *   Instance batching     → `InstanceBatch` (the bolt ring)
 *   Hero lighting role    → `createHeroLight`
 *   Shadow policy         → `applyShadowPolicy` (with a `forceCast` override)
 *   Optional DOF          → a `DepthOfFieldSettings` value the caller can hand to
 *                           `setupGraphicsPipeline` when they know the shot's focus distance
 *   Scientific state hook → `updateVisualState(fraction, status)`, itself built on
 *                           `stateVisualization.ts`'s `applyFractionToScale`/`applyValueToEmissive`
 *                           instead of hand-rolled `.setHex()`/`.scale.y =` calls
 *
 * The geometry here (a cylinder chamber, a box frame, some bolts) is
 * deliberately generic filler — it is NOT the flagship reactor vessel, and
 * this function is NOT a replacement for `labScene3D.ts`'s hero apparatus.
 * A world-builder assembling the REAL flagship apparatus should follow this
 * *pattern*, not import this *file*.
 */

export type ExampleVisualStatus = 'idle' | 'nominal' | 'warning' | 'critical';

/** Maps the discrete status vocabulary onto `stateVisualization.ts`'s continuous 0..1 severity
 * scale — the same "how concerning is this" axis a numeric value (an Rt, an occupancy fraction)
 * would use directly, so a status enum and a raw measurement can share one color language instead
 * of each scene inventing its own status→color table by hand. */
const STATUS_SEVERITY: Record<ExampleVisualStatus, number> = {
  idle: 0,
  nominal: 0.15,
  warning: 0.6,
  critical: 1,
};

export interface ExampleHeroApparatusOptions {
  /** World position the apparatus sits at — everything (geometry, lighting, camera-relevant
   * anchors) is built relative to this, never to a hardcoded room coordinate. */
  position: THREE_NS.Vector3Tuple;
  /** Rough physical scale (meters) — lets the same builder produce a benchtop instrument or a
   * room-filling reactor without the caller re-deriving proportions by hand. */
  scale?: number;
}

export interface ExampleHeroApparatusHandles {
  group: THREE_NS.Group;
  /**
   * THE scientific-state → visual-state hook. Call this with values already computed by the real
   * simulation/discovery layer — `fraction` (0..1, e.g. a fill level or completion amount) and
   * `status` (a coarse health/severity bucket). This function never invents a number: it only
   * ever reads what it's given, exactly like `labScene3D.ts`'s `syncScene` does for the real
   * vessel's `vesselFraction`/`vesselStatus`.
   */
  updateVisualState(fraction: number, status: ExampleVisualStatus): void;
  /** A focus-distance hint for the hero framing, useful for wiring `DepthOfFieldSettings` when a
   * cinematic camera cuts to a close-up on this object — see the module doc above. */
  suggestedDofSettings(cameraDistance: number): DepthOfFieldSettings;
}

/**
 * Assembles one generic hero apparatus at `opts.position`, wiring together every rendering-layer
 * subsystem a real one would need. Returns handles for runtime state updates.
 */
export function buildExampleHeroApparatus(
  THREE: typeof THREE_NS,
  scene: THREE_NS.Scene,
  opts: ExampleHeroApparatusOptions,
): ExampleHeroApparatusHandles {
  const scale = opts.scale ?? 1;
  const group = new THREE.Group();
  group.position.set(...opts.position);
  group.scale.setScalar(scale);
  scene.add(group);

  // --- Genesis PBR material palette: one shared instance per category, reused across every part
  // that's physically that kind of surface. ---
  const materials = createGenesisMaterialPalette(THREE);

  // --- STRUCTURE: a frame + base built from the shared metal/composite categories. ---
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 24), materials.TECH_COMPOSITE);
  base.position.y = 0.06;
  group.add(base);

  const frameGeo = new THREE.BoxGeometry(0.06, 1.4, 0.06);
  const framePositions: THREE_NS.Vector3Tuple[] = [[0.45, 0.7, 0], [-0.45, 0.7, 0], [0, 0.7, 0.45], [0, 0.7, -0.45]];
  for (const pos of framePositions) {
    const post = new THREE.Mesh(frameGeo, materials.BRUSHED_METAL);
    post.position.set(...pos);
    group.add(post);
  }

  // --- CORE / CHAMBER: the Genesis science-glass look — reflective by default, exactly the
  // treatment proven on the flagship reactor vessel. ---
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 1.1, 32, 1, true), materials.SCIENCE_GLASS);
  chamber.position.y = 0.75;
  group.add(chamber);

  // The "fill" — a simple standard-material cylinder inside the chamber, scaled/colored by
  // updateVisualState exactly like the real vessel's fluid mesh.
  const fillMaterial = new THREE.MeshStandardMaterial({ roughness: 0.3 });
  applyValueToEmissive(fillMaterial, THREE, STATUS_SEVERITY.idle, { updateBaseColor: true, minIntensity: 0.25, maxIntensity: 0.6 });
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1, 24), fillMaterial);
  fill.position.y = 0.2;
  fill.scale.y = 0.001;
  fill.name = 'exampleApparatusFill';
  group.add(fill);

  // --- INSTANCING: a bolt ring around the chamber's base flange — one InstancedMesh, one draw
  // call, regardless of bolt count. Uses POLISHED_METAL, the same category real hardware would. ---
  const boltGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.025, 6);
  const boltBatch = new InstanceBatch(THREE, boltGeo, materials.POLISHED_METAL);
  const boltCount = 16;
  for (let i = 0; i < boltCount; i++) {
    const angle = (i / boltCount) * Math.PI * 2;
    boltBatch.add([Math.cos(angle) * 0.41, 0.2, Math.sin(angle) * 0.41]);
  }
  const boltMesh = boltBatch.build(scene, false);
  if (boltMesh) group.add(boltMesh); // reparent into the apparatus group so it moves/scales with it

  // --- INSTRUMENTATION: a small but functionally important status light. Deliberately BELOW the
  // shadow policy's size threshold — this is exactly the case `forceCast` exists for. ---
  const statusLightMaterial = createEmissiveInstrumentMaterial(THREE, { color: 0x5a6786, intensity: 0.9 });
  const statusLight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), statusLightMaterial);
  statusLight.position.set(0, 1.35, 0.42);
  group.add(statusLight);

  // --- HERO LIGHTING ROLE: "this is the hero apparatus" — one call for a coherent, already-tuned
  // KEY+RIM treatment, instead of hand-placing and re-tuning a SpotLight+PointLight pair. ---
  createHeroLight(THREE, scene, {
    target: [opts.position[0], opts.position[1] + 0.75 * scale, opts.position[2]],
    keyDistance: 3 * scale,
    rimDistance: 1.5 * scale,
  });

  // --- SHADOW POLICY: run once, after every part above has been added. In a world with multiple
  // builders (facility + several hero objects), hoist this single call to run after ALL of them,
  // not once per builder — see graphics/PERFORMANCE.md. Called here only because this example is
  // self-contained. ---
  applyShadowPolicy(THREE, scene, { forceCast: [statusLight] });

  return {
    group,
    updateVisualState(fraction, status) {
      const clamped = Math.max(0, Math.min(1, fraction));
      // stateVisualization.ts's applyFractionToScale only owns the scale half of "fill grows from
      // a fixed base" — it has no opinion on keeping the mesh anchored to that base as it grows,
      // since not every fraction-driven scale is a bottom-anchored fill (a gauge needle, a bar
      // chart column growing from its own center wouldn't want this). That positioning stays this
      // example's own domain knowledge, same as the real vessel's fluid mesh.
      applyFractionToScale(fill, clamped, { axis: 'y', min: 0.001 });
      fill.position.y = 0.2 + (clamped * 1) / 2;
      const severity = STATUS_SEVERITY[status];
      applyValueToEmissive(fillMaterial, THREE, severity, { updateBaseColor: true, minIntensity: 0.25, maxIntensity: 0.6 });
      applyValueToEmissive(statusLightMaterial, THREE, severity, { minIntensity: 0.6, maxIntensity: 1.1 });
    },
    suggestedDofSettings(cameraDistance) {
      return { enabled: true, focusDistance: cameraDistance, blurStrength: 0.3 };
    },
  };
}
