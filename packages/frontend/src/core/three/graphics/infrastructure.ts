import type * as THREE_NS from 'three';
import { createColumn, createPipe, createPlatform } from './primitives';

/**
 * GENESIS GRAPHICS RUNTIME — Infrastructure Assembly (pump / pipe / valve)
 * ==========================================================================
 *
 * City Infrastructure Integration 1.0 — the first reusable composite built from
 * `primitives.ts`'s own pieces (`createColumn`, `createPlatform`, `createPipe`) rather than a new
 * one-off hand-built mesh. Same boundary as every other graphics-runtime module: this file owns
 * GEOMETRY AND COMPOSITION ONLY — a `PumpAssemblyOptions.position` and `pipeRuns` are numbers a
 * caller supplies, never a decision this module makes about what a pump IS, where it stands, or
 * what it connects to (that is Looking Glass's/the world-builder's job, reading a REAL WorldFrame
 * entity's own position and its real `feedsInto` relationship target).
 *
 * A pump is a fused housing (a body + a smaller motor drum on top, `createColumn` twice at
 * different radii), two connection flanges (short wide `createColumn` discs) where real pipe runs
 * attach, and a stubby analog gauge face (a thin disc via `createPlatform`) — all mounted on a
 * concrete plinth (`createPlatform`, disc). A valve is a short wide body plus a perpendicular
 * handle stem, both `createPipe` calls (a valve is geometrically just two pipes: one along the
 * line's own axis, one crossing it). Every sub-part is returned by reference in `.parts` so a
 * caller's `updateVisual` hook can drive material/emissive state (`visualState.ts`) or animation
 * (`graphics/animation.ts`'s `createRotator`, for a spinning motor) per part, per entity, without
 * this module knowing anything about WHY.
 */

export interface PumpAssemblyOptions {
  /** World position of the pump's base — same "position is where it stands" convention as
   * `createColumn`/`createGlassChamber`. */
  position: THREE_NS.Vector3Tuple;
  bodyMaterial: THREE_NS.Material;
  motorMaterial: THREE_NS.Material;
  plinthMaterial: THREE_NS.Material;
  valveMaterial: THREE_NS.Material;
  pipeMaterial: THREE_NS.Material;
  /** One real pipe run per downstream/upstream connection this pump actually has (e.g. one run per
   * `feedsInto`/`loads` relationship edge) — geometry endpoints only, supplied by the caller from
   * REAL entity positions. Omit for a pump with no rendered connection yet. */
  pipeRuns?: readonly { to: THREE_NS.Vector3Tuple; radius?: number }[];
  bodyRadius?: number;
  bodyHeight?: number;
}

export interface PumpAssemblyHandle {
  group: THREE_NS.Group;
  parts: {
    plinth: THREE_NS.Object3D;
    body: THREE_NS.Object3D;
    motor: THREE_NS.Object3D;
    gauge: THREE_NS.Object3D;
    flanges: readonly THREE_NS.Object3D[];
    pipes: readonly THREE_NS.Object3D[];
  };
}

/** A technical pump-station assembly: plinth, housing, motor, connection flanges, an analog gauge
 * face, and one real pipe run per real connection this pump has. Body/motor/pipe/valve materials
 * are the caller's own choice (pass a `createPBRMaterial` category from `materials.ts` — e.g.
 * `PAINTED_METAL` for the body, `BRUSHED_METAL` for the motor/pipes, `POLISHED_METAL` for a valve)
 * so this module stays a pure geometry/composition primitive, same rule as `primitives.ts`. */
export function createPumpAssembly(THREE: typeof THREE_NS, options: PumpAssemblyOptions): PumpAssemblyHandle {
  const [px, py, pz] = options.position;
  const bodyRadius = options.bodyRadius ?? 0.55;
  const bodyHeight = options.bodyHeight ?? 1.1;
  const group = new THREE.Group();

  const plinth = createPlatform(THREE, options.plinthMaterial, {
    position: [px, py + 0.06, pz], thickness: 0.12, shape: 'disc', radius: bodyRadius * 1.35,
  });
  const body = createColumn(THREE, options.bodyMaterial, {
    position: [px, py + 0.12, pz], height: bodyHeight, radius: bodyRadius, radialSegments: 20,
  });
  const motor = createColumn(THREE, options.motorMaterial, {
    position: [px, py + 0.12 + bodyHeight, pz], height: bodyHeight * 0.42, radius: bodyRadius * 0.6, radialSegments: 16,
  });
  const gauge = createPlatform(THREE, options.motorMaterial, {
    position: [px + bodyRadius + 0.02, py + 0.12 + bodyHeight * 0.55, pz], thickness: 0.04, shape: 'disc', radius: 0.14,
  });
  gauge.rotation.z = Math.PI / 2;

  const flangeHeight = py + 0.12 + bodyHeight * 0.3;
  const flanges: THREE_NS.Object3D[] = [];
  const pipes: THREE_NS.Object3D[] = [];
  for (const run of options.pipeRuns ?? []) {
    const radius = run.radius ?? 0.09;
    const connectionPoint: THREE_NS.Vector3Tuple = [px + bodyRadius * 0.9, flangeHeight, pz];
    const flange = createColumn(THREE, options.pipeMaterial, {
      position: connectionPoint, height: radius * 2.4, radius: radius * 1.6, radialSegments: 16,
    });
    flange.rotation.x = Math.PI / 2;
    flange.position.y -= radius * 1.2;
    flanges.push(flange);
    const pipe = createPipe(THREE, options.pipeMaterial, { from: connectionPoint, to: run.to, radius, radialSegments: 12 });
    pipes.push(pipe);
    group.add(flange, pipe);
  }

  group.add(plinth, body, motor, gauge);
  return { group, parts: { plinth, body, motor, gauge, flanges, pipes } };
}

export interface ValveAssemblyOptions {
  /** World position of the valve's center. */
  position: THREE_NS.Vector3Tuple;
  /** Pipe-axis direction the valve body sits along (a unit-ish vector; normalized internally). */
  axis: THREE_NS.Vector3Tuple;
  bodyMaterial: THREE_NS.Material;
  handleMaterial: THREE_NS.Material;
  bodyRadius?: number;
  bodyLength?: number;
}

export interface ValveAssemblyHandle {
  group: THREE_NS.Group;
  parts: { body: THREE_NS.Object3D; handle: THREE_NS.Object3D };
}

/** A valve: a short wide body along the pipe's own axis, plus a perpendicular handle stem —
 * geometrically two `createPipe` calls, no new primitive needed. */
export function createValveAssembly(THREE: typeof THREE_NS, options: ValveAssemblyOptions): ValveAssemblyHandle {
  const bodyRadius = options.bodyRadius ?? 0.14;
  const bodyLength = options.bodyLength ?? bodyRadius * 3;
  const axis = new THREE.Vector3(...options.axis).normalize();
  const center = new THREE.Vector3(...options.position);
  const half = axis.clone().multiplyScalar(bodyLength / 2);
  const from: THREE_NS.Vector3Tuple = center.clone().sub(half).toArray() as THREE_NS.Vector3Tuple;
  const to: THREE_NS.Vector3Tuple = center.clone().add(half).toArray() as THREE_NS.Vector3Tuple;
  const body = createPipe(THREE, options.bodyMaterial, { from, to, radius: bodyRadius, radialSegments: 16 });

  // Handle stem perpendicular to the pipe axis — pick an arbitrary perpendicular via a cross
  // product with a non-parallel helper vector, same "no degenerate direction" guard `createPipe`
  // itself enforces on from/to.
  const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perpendicular = axis.clone().cross(helper).normalize();
  const handleLength = bodyRadius * 2.6;
  const handleFrom: THREE_NS.Vector3Tuple = center.toArray() as THREE_NS.Vector3Tuple;
  const handleTo: THREE_NS.Vector3Tuple = center.clone().addScaledVector(perpendicular, handleLength).toArray() as THREE_NS.Vector3Tuple;
  const handle = createPipe(THREE, options.handleMaterial, { from: handleFrom, to: handleTo, radius: bodyRadius * 0.22, radialSegments: 10 });

  const group = new THREE.Group();
  group.add(body, handle);
  return { group, parts: { body, handle } };
}
