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
 * Not a general scene-graph replacement: instances share one geometry and one
 * material. That's the right trade for a large population (bolts/LEDs/
 * knobs, or hundreds of live agents/sensors) that would otherwise cost one
 * draw call each for identical geometry — anything that needs genuinely
 * different geometry/material per element stays a regular `Mesh`.
 *
 * Both COLOR and TRANSFORM can be retuned per-instance after `.build()` via
 * `setInstanceColor`/`setInstanceTransform` — many identical parts (sensor
 * markers, hotspot beacons, a rack of status LEDs, a crowd of agents) that
 * share geometry/material but each need to move or read a different, live
 * value (see `stateVisualization.ts`'s `severityColor`) are exactly
 * instancing's best use case, not a reason to fall back to one `Mesh` per
 * instance. Both use three.js's partial buffer-upload API
 * (`BufferAttribute.addUpdateRange`, see `setInstanceColor`'s own doc) so
 * retuning a handful of instances out of a large population costs GPU
 * upload bytes proportional to the instances actually touched, not the
 * whole population — see `setInstanceColor`/`setInstanceTransform` for the
 * one caveat colored instances require of the material.
 *
 * No native per-instance visibility toggle exists in three.js's
 * `InstancedMesh` — the standard technique is scaling an instance to 0 via
 * `setInstanceTransform` (and remembering its real transform yourself if you
 * need to restore it later). Not built as a stateful show/hide API here
 * because nothing in this engine currently needs restore-after-hide; add one
 * if and when a real consumer does, rather than speculatively.
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
 *
 * Uses `BufferAttribute.addUpdateRange` (three.js's partial-upload API — see
 * `WebGLAttributes.updateBuffer`, which `gl.bufferSubData`s only the ranges named there instead of
 * the whole attribute array when at least one range was added) so retuning one instance out of a
 * population of thousands re-uploads exactly that instance's 3 floats to the GPU, not the entire
 * color buffer. This is a structural fact about which bytes get uploaded — exact, not a timing
 * measurement — verified by reading `WebGLAttributes.js`, the same way `postProcessing.ts`'s pass
 * ordering was verified against `WebGLRenderer.js` (see `README.md` §3).
 */
export function setInstanceColor(mesh: THREE_NS.InstancedMesh, index: number, color: THREE_NS.Color): void {
  if (!mesh.instanceColor) {
    throw new Error('setInstanceColor: this InstancedMesh has no instanceColor attribute — build the InstanceBatch with at least one colored instance first');
  }
  if (index < 0 || index >= mesh.count) {
    throw new Error(`setInstanceColor: index ${index} out of range for a mesh with ${mesh.count} instances`);
  }
  mesh.setColorAt(index, color);
  mesh.instanceColor.addUpdateRange(index * 3, 3);
  mesh.instanceColor.needsUpdate = true;
}

// Reused across every setInstanceTransform() call instead of constructing a fresh Object3D per
// call — see PERFORMANCE.md's "zero unnecessary per-frame allocations" rule; a population of
// thousands of state-driven instances retuning transforms every frame is exactly the pattern that
// rule exists for.
let transformScratch: THREE_NS.Object3D | null = null;

/**
 * Updates one instance's transform after `.build()` — the per-instance-transform capability
 * `InstanceBatch` didn't have at all before this: `.add()` only records a transform before
 * `.build()`, with no way to move a single already-built instance afterward. Necessary for any
 * large, state-driven population (agents, sensors, particles) where the whole point of instancing
 * is to keep the population at one draw call while individual members still move/resize.
 *
 * Same partial-upload technique as `setInstanceColor`: `mesh.instanceMatrix.addUpdateRange` scopes
 * the GPU upload to exactly this instance's 16 floats, not the whole matrix buffer — updating 1 of
 * 10,000 instances costs O(1) upload bytes, not O(n). `rotation` is Euler radians (matching
 * `InstanceBatch.add`'s own convention); `scale` defaults to uniform 1.
 */
export function setInstanceTransform(
  THREE: typeof THREE_NS,
  mesh: THREE_NS.InstancedMesh,
  index: number,
  position: THREE_NS.Vector3Tuple,
  rotation: THREE_NS.Vector3Tuple = [0, 0, 0],
  scale: THREE_NS.Vector3Tuple | number = 1,
): void {
  if (index < 0 || index >= mesh.count) {
    throw new Error(`setInstanceTransform: index ${index} out of range for a mesh with ${mesh.count} instances`);
  }
  if (!transformScratch) transformScratch = new THREE.Object3D();
  transformScratch.position.set(...position);
  transformScratch.rotation.set(...rotation);
  if (typeof scale === 'number') transformScratch.scale.set(scale, scale, scale);
  else transformScratch.scale.set(...scale);
  transformScratch.updateMatrix();
  mesh.setMatrixAt(index, transformScratch.matrix);
  mesh.instanceMatrix.addUpdateRange(index * 16, 16);
  mesh.instanceMatrix.needsUpdate = true;
}
