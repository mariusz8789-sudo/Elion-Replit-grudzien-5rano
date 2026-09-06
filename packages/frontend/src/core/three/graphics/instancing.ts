import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Instancing
 *
 * The facility kit places hundreds of small repeated parts (bolt heads, LED
 * dots, valve knobs, gauge bodies) as decoration. Building each as its own
 * `Mesh` costs one draw call per instance for geometry that never changes
 * per-instance beyond a transform — pure overhead. `InstanceBatch` collects
 * transforms for a single (geometry, material) pair and bakes them into one
 * `InstancedMesh` on `.build()`, so a hundred bolts cost exactly one draw
 * call instead of a hundred.
 *
 * Not a general scene-graph replacement: instances share one material and
 * cannot be moved individually afterward. That's the right trade for static
 * greebles (bolts/LEDs/knobs) that never move once placed — anything the
 * simulation needs to update per-frame (fluid level, hologram) stays a
 * regular `Mesh`.
 *
 * Per-instance COLOR is the one exception `InstanceBatch` does support after
 * `.build()` — many identical parts (sensor markers, hotspot beacons, a rack
 * of status LEDs) that share geometry/material but each need to read a
 * different, live value (see `stateVisualization.ts`'s `severityColor`) are
 * exactly instancing's best use case, not a reason to fall back to one
 * `Mesh` per instance. Pass a `color` to `.add()` and retune it later with
 * `setInstanceColor` — see both for the one caveat this requires of the
 * material.
 */
export class InstanceBatch {
  private readonly THREE: typeof THREE_NS;
  private readonly geometry: THREE_NS.BufferGeometry;
  private readonly material: THREE_NS.Material;
  private readonly matrices: THREE_NS.Matrix4[] = [];
  private readonly colors: THREE_NS.Color[] = [];
  private hasColors = false;
  private readonly dummy: THREE_NS.Object3D;

  constructor(THREE: typeof THREE_NS, geometry: THREE_NS.BufferGeometry, material: THREE_NS.Material) {
    this.THREE = THREE;
    this.geometry = geometry;
    this.material = material;
    this.dummy = new THREE.Object3D();
  }

  get count(): number {
    return this.matrices.length;
  }

  /**
   * Records one instance transform. Rotation is Euler (radians); scale defaults to uniform 1.
   * `color` is optional per-instance tint (see the module doc above) — instances that omit it
   * default to white (no tint) once ANY instance in the batch provides one, so mixing colored and
   * uncolored instances in one batch is safe.
   */
  add(
    position: THREE_NS.Vector3Tuple,
    rotation: THREE_NS.Vector3Tuple = [0, 0, 0],
    scale: THREE_NS.Vector3Tuple | number = 1,
    color?: THREE_NS.ColorRepresentation,
  ): this {
    this.dummy.position.set(...position);
    this.dummy.rotation.set(...rotation);
    if (typeof scale === 'number') this.dummy.scale.set(scale, scale, scale);
    else this.dummy.scale.set(...scale);
    this.dummy.updateMatrix();
    this.matrices.push(this.dummy.matrix.clone());
    if (color !== undefined) this.hasColors = true;
    this.colors.push(new this.THREE.Color(color ?? 0xffffff));
    return this;
  }

  /**
   * Bakes the recorded instances into one `InstancedMesh` and adds it to `scene`. Returns `null`
   * when nothing was ever added, so callers don't need to special-case an empty batch.
   *
   * If any instance was given a `color`, this sets `material.vertexColors = true` on the material
   * passed to the constructor — required for `instanceColor` to actually tint anything, per
   * three.js. That mutates the material in place, so use a batch-dedicated material (or a
   * `.clone()`) when colors are involved, not one also shared by geometry that shouldn't tint.
   */
  build(scene: THREE_NS.Scene, castShadow = false): THREE_NS.InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const mesh = new this.THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    this.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    if (this.hasColors) {
      (this.material as THREE_NS.Material & { vertexColors: boolean }).vertexColors = true;
      this.colors.forEach((color, i) => mesh.setColorAt(i, color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.castShadow = castShadow;
    scene.add(mesh);
    return mesh;
  }
}

/**
 * Updates one instance's color after `.build()` — for a value that changes over the scene's
 * lifetime (a sensor going critical, a hotspot's severity rising), typically fed by
 * `stateVisualization.ts`'s `severityColor`/`sampleColorScale`. Requires the mesh to have been
 * built with at least one instance colored (an `instanceColor` attribute must already exist) —
 * throws with a clear message otherwise rather than silently doing nothing.
 */
export function setInstanceColor(mesh: THREE_NS.InstancedMesh, index: number, color: THREE_NS.Color): void {
  if (!mesh.instanceColor) {
    throw new Error('setInstanceColor: this InstancedMesh has no instanceColor attribute — build the InstanceBatch with at least one colored instance first');
  }
  mesh.setColorAt(index, color);
  mesh.instanceColor.needsUpdate = true;
}
