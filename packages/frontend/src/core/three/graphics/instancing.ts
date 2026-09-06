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
 * simulation needs to update per-frame (fluid level, status color, hologram)
 * stays a regular `Mesh`.
 */
export class InstanceBatch {
  private readonly THREE: typeof THREE_NS;
  private readonly geometry: THREE_NS.BufferGeometry;
  private readonly material: THREE_NS.Material;
  private readonly matrices: THREE_NS.Matrix4[] = [];
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

  /** Records one instance transform. Rotation is Euler (radians); scale defaults to uniform 1. */
  add(
    position: THREE_NS.Vector3Tuple,
    rotation: THREE_NS.Vector3Tuple = [0, 0, 0],
    scale: THREE_NS.Vector3Tuple | number = 1,
  ): this {
    this.dummy.position.set(...position);
    this.dummy.rotation.set(...rotation);
    if (typeof scale === 'number') this.dummy.scale.set(scale, scale, scale);
    else this.dummy.scale.set(...scale);
    this.dummy.updateMatrix();
    this.matrices.push(this.dummy.matrix.clone());
    return this;
  }

  /** Bakes the recorded instances into one `InstancedMesh` and adds it to `scene`. Returns `null`
   * when nothing was ever added, so callers don't need to special-case an empty batch. */
  build(scene: THREE_NS.Scene, castShadow = false): THREE_NS.InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const mesh = new this.THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    this.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    scene.add(mesh);
    return mesh;
  }
}
