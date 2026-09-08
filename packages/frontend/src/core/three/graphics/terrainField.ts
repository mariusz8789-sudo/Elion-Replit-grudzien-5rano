import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Terrain Field
 *
 * A real spatial-field renderer: turns a regular elevation grid plus one real per-cell numeric
 * value (or "no data") into a single displaced, vertex-colored mesh. Built because three C3 domains
 * now share the exact same grid shape (`TerrainHeightfield` — cols/rows/cellSizeM/elevationsM, row-
 * major) with real per-cell fields worth seeing: `floodInundation.ts`'s inundation depth,
 * `wildfireSpread.ts`'s fire arrival time, `landslide.ts`'s factor-of-safety/runout velocity — and
 * NONE of them had anywhere to render, at all (`core/three/` had zero references to
 * `TerrainHeightfield` before this file). This is the one shared piece, not three one-off terrain
 * meshes.
 *
 * DOMAIN-BLIND BY CONSTRUCTION (`graphicsArchitectureBoundary.test.ts` forbids `graphics/**` from
 * importing `worldModel/**`): this module never imports `TerrainHeightfield` itself, only a
 * structurally-matching `{ cols, rows, cellSizeM, elevationsM }` shape — the same "take the plain
 * shape, not the domain type" convention `moleculeAdapterBridge.ts` uses for `WorldFrameEntity`. A
 * caller (a scene file, outside `graphics/`) imports the real domain type and passes its fields
 * through; this module has no idea what a flood, a fire, or a landslide is.
 *
 * HONESTY RULE THIS MODULE ENFORCES: `cellValueOf` may return `null` for a cell with no real value
 * (an unreached fire cell — `arrivalTimeS === Infinity`, a flood cell with zero depth, any cell
 * outside a runout path) — those cells render in `noDataColor`, a distinct terrain hue, NEVER
 * extrapolated onto the severity color scale. Coloring an unreached cell as if it had a low-severity
 * REAL reading (green, "safe") would fabricate a measurement that was never taken; `noDataColor`
 * reads as neutral ground, not as a claim of safety.
 */

/** The minimal shape this module needs from a heightfield — matches `TerrainHeightfield`
 * (`worldModel/domains/floodInundation.ts`) structurally without importing it. */
export interface HeightfieldLike {
  readonly cols: number;
  readonly rows: number;
  /** Ground sample spacing, metres. */
  readonly cellSizeM: number;
  /** Row-major, length `cols * rows`, metres above the terrain's own datum. */
  readonly elevationsM: ArrayLike<number>;
}

export interface TerrainFieldOptions {
  /** Scene units per metre of horizontal grid spacing. Default 1 (1 world unit = 1 metre). */
  worldScale?: number;
  /** Vertical exaggeration applied to `elevationsM` — real terrain relief is often too subtle to
   * read at a legible camera distance without it. Default 1 (no exaggeration). */
  heightScale?: number;
  /** Real per-cell value at `cellIndex` (row-major, matching `elevationsM`'s own indexing), or
   * `null` for a cell with no real reading — see the module doc's HONESTY RULE. Required: a terrain
   * field with no value function would just be bare elevation, better served by a plain material. */
  cellValueOf: (cellIndex: number) => number | null;
  /** Maps a real (non-null) per-cell value to a color — typically `severityColor` from
   * `stateVisualization.ts` fed a value already normalized to [0,1] by the caller, since only the
   * caller knows this domain's real value range (an arrival time in seconds and a factor-of-safety
   * ratio have nothing in common numerically). */
  colorOfValue: (THREE: typeof THREE_NS, value: number) => THREE_NS.Color;
  /** Color for a `null` cell (see HONESTY RULE) — a muted, clearly-not-severity-scale terrain tone
   * by default, distinguishable from anything `colorOfValue` would ever return. */
  noDataColor?: number;
}

export interface TerrainFieldMesh {
  readonly mesh: THREE_NS.Mesh;
  /** Re-reads `cellValueOf` and re-applies vertex colors without rebuilding geometry — call after
   * the real field changes (e.g. a re-solved wildfire spread), never rebuild the whole mesh just to
   * show a new time step. */
  updateColors(): void;
  dispose(): void;
}

const DEFAULT_NO_DATA_COLOR = 0x3a4a3a;

/**
 * Builds one real, displaced, vertex-colored mesh from a heightfield-shaped grid plus a real
 * per-cell value function. `PlaneGeometry(width, height, cols-1, rows-1)`'s own vertex order is
 * already row-major (iy outer, ix inner) — exactly `elevationsM`'s indexing — so cell index i
 * addresses vertex i directly with no re-indexing.
 */
export function buildTerrainFieldMesh(THREE: typeof THREE_NS, terrain: HeightfieldLike, options: TerrainFieldOptions): TerrainFieldMesh {
  const { cols, rows, cellSizeM, elevationsM } = terrain;
  if (cols < 2 || rows < 2) throw new Error(`buildTerrainFieldMesh: terrain must be at least 2x2 (got ${cols}x${rows})`);
  const worldScale = options.worldScale ?? 1;
  const heightScale = options.heightScale ?? 1;
  const noDataColor = options.noDataColor ?? DEFAULT_NO_DATA_COLOR;

  const width = (cols - 1) * cellSizeM * worldScale;
  const depth = (rows - 1) * cellSizeM * worldScale;
  const geometry = new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1);
  geometry.rotateX(-Math.PI / 2); // lies flat in XZ, +Y up — the standard "ground plane" convention every other scene in this engine uses.

  const positions = geometry.getAttribute('position') as THREE_NS.BufferAttribute;
  const vertexCount = cols * rows;
  if (positions.count !== vertexCount) {
    throw new Error(`buildTerrainFieldMesh: PlaneGeometry produced ${positions.count} vertices, expected ${vertexCount} — segment/grid mismatch`);
  }
  for (let i = 0; i < vertexCount; i++) {
    positions.setY(i, elevationsM[i] * heightScale * worldScale);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const colors = new Float32Array(vertexCount * 3);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'genesis-terrain-field';

  const applyColors = () => {
    const scratch = new THREE.Color();
    for (let i = 0; i < vertexCount; i++) {
      const value = options.cellValueOf(i);
      if (value === null || !Number.isFinite(value)) scratch.setHex(noDataColor);
      else scratch.copy(options.colorOfValue(THREE, value));
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  applyColors();

  return {
    mesh,
    updateColors: applyColors,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
