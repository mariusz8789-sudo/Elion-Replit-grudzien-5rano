import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Scene Composition Primitives
 *
 * Structural/enclosure geometry a world-builder currently has to hand-derive every time: a
 * cylindrical column's `CylinderGeometry` args, a platform's box-vs-disc footprint, a glass
 * chamber's open-ended cylinder convention (proven on the flagship reactor vessel and generalized
 * in `examples/heroApparatusExample.ts`), and — the one genuinely fiddly one — a pipe/conduit run
 * between two arbitrary 3D points, which needs the length AND the rotation that aligns a
 * Y-axis-default `CylinderGeometry` to the direction between them. Getting that quaternion math
 * wrong (or re-deriving it per builder) is exactly the kind of duplicated logic this module exists
 * to remove.
 *
 * Each function returns a plain `THREE.Mesh` — no group wrapping, no material opinion (pass
 * whatever category from `materials.ts` fits: `BRUSHED_METAL` for a column, `SCIENCE_GLASS` for a
 * chamber, `CONCRETE` for a platform). Callers add the mesh to a scene/group and position/parent it
 * however their own composition needs; these are geometry-and-placement primitives, not scene
 * managers.
 *
 * Deliberately NOT built here (yet): room/wall/ceiling/corridor/container/road/terrain. Every one
 * of those would need to prove itself against a real consumer first — the engine's own "no
 * theoretical framework without a consumer" rule (see README.md) — and no low-risk one exists today
 * without rewriting an already-shipped scene's hand-tuned geometry. Column/platform/glass-chamber/
 * pipe all do: this module replaces the equivalent hand-inlined geometry in
 * `examples/heroApparatusExample.ts` directly, in the same change that adds this file.
 */

function assertPositive(value: number, label: string): void {
  if (!(value > 0)) throw new Error(`${label} must be > 0 (got ${value})`);
}

export interface ColumnOptions {
  /** World position of the column's base (the geometry is centered on its own midpoint, so this
   * function offsets it by `height / 2` — callers always think in "where does this stand," not
   * "where's the mesh's local origin"). */
  position: THREE_NS.Vector3Tuple;
  height: number;
  /** Uniform radius top/bottom. Default 0.06m — a slender structural post, matching the frame posts
   * this module generalizes out of `examples/heroApparatusExample.ts`. */
  radius?: number;
  radialSegments?: number;
}

/** A vertical structural column/post — a frame member, a support leg, a conduit riser. */
export function createColumn(THREE: typeof THREE_NS, material: THREE_NS.Material, options: ColumnOptions): THREE_NS.Mesh {
  const radius = options.radius ?? 0.06;
  assertPositive(options.height, 'ColumnOptions.height');
  assertPositive(radius, 'ColumnOptions.radius');
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, options.height, options.radialSegments ?? 12), material);
  mesh.position.set(...options.position);
  mesh.position.y += options.height / 2;
  return mesh;
}

export interface PlatformOptions {
  /** World position of the platform's CENTER (footprint center, vertically centered on `thickness`
   * — same "position is where it visually sits" convention as `createColumn`). */
  position: THREE_NS.Vector3Tuple;
  thickness: number;
  /** `'box'` (default) for a rectangular dais/floor/table surface, `'disc'` for a circular base
   * plate (e.g. an apparatus's round footing). */
  shape?: 'box' | 'disc';
  /** Required when `shape` is `'box'` (or omitted). */
  width?: number;
  /** Required when `shape` is `'box'` (or omitted). */
  depth?: number;
  /** Required when `shape` is `'disc'`. */
  radius?: number;
  radialSegments?: number;
}

/** A flat structural surface — a dais, a table/bench top, an apparatus base plate, a raised floor
 * section. Box or disc footprint; always centered vertically on `thickness` so `position` is where
 * the platform visually sits, not an arbitrary geometry origin. */
export function createPlatform(THREE: typeof THREE_NS, material: THREE_NS.Material, options: PlatformOptions): THREE_NS.Mesh {
  assertPositive(options.thickness, 'PlatformOptions.thickness');
  const shape = options.shape ?? 'box';
  let geometry: THREE_NS.BufferGeometry;
  if (shape === 'disc') {
    if (options.radius === undefined) throw new Error("createPlatform: shape 'disc' requires options.radius");
    assertPositive(options.radius, 'PlatformOptions.radius');
    geometry = new THREE.CylinderGeometry(options.radius, options.radius, options.thickness, options.radialSegments ?? 24);
  } else {
    if (options.width === undefined || options.depth === undefined) {
      throw new Error("createPlatform: shape 'box' requires options.width and options.depth");
    }
    assertPositive(options.width, 'PlatformOptions.width');
    assertPositive(options.depth, 'PlatformOptions.depth');
    geometry = new THREE.BoxGeometry(options.width, options.thickness, options.depth);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...options.position);
  return mesh;
}

export interface GlassChamberOptions {
  /** World position of the chamber's base (same "position is where it stands" convention as
   * `createColumn`). */
  position: THREE_NS.Vector3Tuple;
  height: number;
  /** Defaults to `radiusBottom` if omitted (a straight cylinder) — set both independently for a
   * tapered chamber (a flask/funnel shape). */
  radiusTop?: number;
  radiusBottom?: number;
  /**
   * Open-ended (no top/bottom caps) by default — the proven flagship-vessel convention (see
   * `examples/heroApparatusExample.ts`'s own chamber): a see-through science-glass enclosure reads
   * as a tube you look INTO, and capped ends would show an unwanted disc of glass at the exact
   * point a viewer's eye lands. Pass `false` for a fully sealed vessel.
   */
  openEnded?: boolean;
  radialSegments?: number;
}

/** A cylindrical glass enclosure — a reactor vessel, an observation tube, a sample chamber. Pass a
 * `SCIENCE_GLASS`-category material (see `materials.ts`) for the proven reflective/transmissive
 * look; this function only owns the geometry convention, never the material. */
export function createGlassChamber(THREE: typeof THREE_NS, material: THREE_NS.Material, options: GlassChamberOptions): THREE_NS.Mesh {
  const radiusBottom = options.radiusBottom ?? 0.4;
  const radiusTop = options.radiusTop ?? radiusBottom;
  assertPositive(options.height, 'GlassChamberOptions.height');
  assertPositive(radiusBottom, 'GlassChamberOptions.radiusBottom');
  assertPositive(radiusTop, 'GlassChamberOptions.radiusTop');
  const openEnded = options.openEnded ?? true;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, options.height, options.radialSegments ?? 32, 1, openEnded),
    material,
  );
  mesh.position.set(...options.position);
  mesh.position.y += options.height / 2;
  return mesh;
}

export interface PipeOptions {
  from: THREE_NS.Vector3Tuple;
  to: THREE_NS.Vector3Tuple;
  radius: number;
  radialSegments?: number;
}

/**
 * A straight pipe/conduit/cable run between two arbitrary world points — the one primitive here
 * that isn't just "a named `CylinderGeometry` call." `CylinderGeometry` is Y-axis-aligned by
 * construction; this computes the actual length between `from`/`to` (so the geometry isn't
 * stretched/squashed to fit) and the quaternion that rotates the default Y axis onto the from→to
 * direction, then centers the mesh at the midpoint. Throws on a zero-length pipe (`from` === `to`)
 * rather than silently producing a degenerate, zero-height cylinder.
 */
export function createPipe(THREE: typeof THREE_NS, material: THREE_NS.Material, options: PipeOptions): THREE_NS.Mesh {
  assertPositive(options.radius, 'PipeOptions.radius');
  const start = new THREE.Vector3(...options.from);
  const end = new THREE.Vector3(...options.to);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1e-9) throw new Error('createPipe: from and to must not be the same point (zero-length pipe)');

  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(options.radius, options.radius, length, options.radialSegments ?? 12), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
