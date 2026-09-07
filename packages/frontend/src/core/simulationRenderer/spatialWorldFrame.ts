import type { ProjectedSpatialFeature, SpatialWorldOverlay } from './spatialOverlay';
import type { WorldFrame, WorldFrameEntity } from '../three/graphics/worldFrame';

/**
 * GENESIS — OSM spatial data → canonical `WorldFrame` (Graphics V2, Sprint A)
 * ============================================================================
 *
 * THE BRIDGE THAT WAS MISSING. `experimentFabric/spatialImport.ts` already imports real, licensed,
 * provenance-carrying OSM data, and `simulationRenderer/spatialOverlay.ts` already projects it into
 * world coordinates — but that pathway ended at the OLD `simulationRenderer` city renderer. Nothing
 * connected it to `three/graphics/worldFrameRenderer.ts`, the canonical renderer. This module is
 * that connection, and nothing more: overlay in, `WorldFrame` out.
 *
 * It is deliberately NOT a second GIS importer, a second projection, or a second renderer. It calls
 * neither — it consumes what `createSpatialWorldOverlay` already produced.
 *
 * WHY IT LIVES HERE AND NOT IN `three/graphics/`: `graphicsArchitectureBoundary.test.ts` forbids
 * `three/graphics/**` from importing anything outside the graphics layer. So the mapping lives on the
 * data side and imports C2's `WorldFrame` TYPE only — exactly the arrangement
 * `worldModel/bridge/graphicsWorldFrameAdapter.ts` already uses for C3. The rendering half is
 * `three/graphics/spatialFeatureBridge.ts`, which reads only `visualHint`/`scalars` and never knows
 * OSM exists.
 *
 * HONESTY, PER `SOLVER_DATA_CONTRACT.md`:
 *  - `WorldFrameEntity` carries a transform and flat numeric scalars. It has NO polygon or polyline
 *    channel (that document's own gap 3). A building footprint is therefore reduced to its centroid
 *    plus its real axis-aligned extent, and a road to a series of straight segments. **The positions
 *    and extents are real measured OSM geometry; the box/quad shape drawn from them is an
 *    approximation of the true outline.** That distinction is carried in the data, not just in prose:
 *    see `footprintMeasured`/`heightMeasured`/`widthMeasured` below.
 *  - Every scalar is named with its unit (Rule 2). Distances are metres, provided the caller sized
 *    the overlay with `metricOverlaySize` (below) — which is the only reason that helper exists.
 *  - Entity ids are the real OSM `sourceId`, so they are stable across frames (Rule 4).
 *  - Nothing is invented. A building with no real height information gets NO `heightM` scalar and is
 *    marked `grounding: 'DERIVED'`; the renderer then knows it is choosing a height, not reading one.
 */

/** Visual hints this bridge emits. The rendering side keys off exactly these. */
export const OSM_BUILDING_HINT = 'osm:building';
export const OSM_ROAD_HINT = 'osm:road-segment';
export const OSM_WATER_HINT = 'osm:water';
export const OSM_RAIL_HINT = 'osm:rail-segment';

/** Metres per degree of latitude — the WGS84 mean; good to ~0.5% over a city-sized extract. */
const METRES_PER_DEGREE_LAT = 111_320;

/**
 * The overlay size, in METRES, that a given lon/lat bbox really spans — pass this into
 * `createSpatialWorldOverlay` so its projected units ARE metres and every scalar this module emits is
 * a real measurement rather than an arbitrary unit. Longitude degrees shrink with latitude, hence the
 * cosine term; over a few streets the flat-earth approximation is far below OSM's own positional
 * error, and it is documented here rather than hidden.
 */
export function metricOverlaySize(bbox: readonly [number, number, number, number]): { worldWidth: number; worldHeight: number } {
  const [west, south, east, north] = bbox;
  const midLatRad = (((south + north) / 2) * Math.PI) / 180;
  return {
    worldWidth: Math.abs(east - west) * METRES_PER_DEGREE_LAT * Math.cos(midLatRad),
    worldHeight: Math.abs(north - south) * METRES_PER_DEGREE_LAT,
  };
}

export interface SpatialWorldFrameOptions {
  /** Opaque frame time, passed straight through to `WorldFrame.time`. Default 0. */
  time?: number;
  /**
   * Recentre so the overlay's middle sits at the world origin. Default true — an overlay's own
   * coordinates start at a corner, which would put an entire imported district off to one side of
   * whatever scene it is dropped into.
   */
  center?: boolean;
  /** Skip road/rail segments shorter than this, in overlay units. Default 1 — OSM ways carry many
   * sub-metre vertices whose individual segments are not worth an entity each. */
  minSegmentLength?: number;
  /** Hard cap per layer, applied after filtering, as a blunt safety valve against importing a bbox
   * far larger than intended. Omit for no cap. */
  maxFeaturesPerLayer?: number;
}

function centroidAndExtent(coordinates: readonly (readonly [number, number])[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let sumX = 0, sumY = 0;
  for (const [x, y] of coordinates) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    sumX += x; sumY += y;
  }
  const count = coordinates.length;
  return {
    centreX: sumX / count, centreY: sumY / count,
    width: maxX - minX, depth: maxY - minY,
  };
}

/** Real height from real tags only. `height` is metres outright; `building:levels` is a real count
 * that still needs a storey height to become metres, so the two are distinguished by
 * `measured` rather than silently merged. Returns null when OSM says nothing about height. */
function heightFromTags(tags: Readonly<Record<string, string>>): { metres: number; measured: boolean } | null {
  const explicit = Number.parseFloat(tags.height ?? '');
  if (Number.isFinite(explicit) && explicit > 0) return { metres: explicit, measured: true };
  const levels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) return { metres: levels * 3.1, measured: false };
  return null;
}

/** Real width from real tags only: an explicit `width`, or a real `lanes` count at 3.2 m a lane.
 * Anything else returns null and the renderer must choose — and know that it chose. */
function widthFromTags(tags: Readonly<Record<string, string>>): { metres: number; measured: boolean } | null {
  const explicit = Number.parseFloat(tags.width ?? '');
  if (Number.isFinite(explicit) && explicit > 0) return { metres: explicit, measured: true };
  const lanes = Number.parseFloat(tags.lanes ?? '');
  if (Number.isFinite(lanes) && lanes > 0) return { metres: lanes * 3.2, measured: false };
  return null;
}

function buildingEntity(
  feature: ProjectedSpatialFeature,
  offsetX: number,
  offsetY: number,
): WorldFrameEntity | null {
  if (feature.geometry.coordinates.length < 3) return null;
  const { centreX, centreY, width, depth } = centroidAndExtent(feature.geometry.coordinates);
  if (!(width > 0) || !(depth > 0)) return null;

  const height = heightFromTags(feature.tags);
  const scalars: Record<string, number> = {
    footprintWidthM: width,
    footprintDepthM: depth,
    // The centroid and extent are computed from real imported geometry; the BOX drawn from them is
    // not the real outline. 1 = these numbers came from real OSM vertices.
    footprintMeasured: 1,
  };
  if (height) {
    scalars.heightM = height.metres;
    scalars.heightMeasured = height.measured ? 1 : 0;
  }

  return {
    id: feature.sourceId,
    position: [centreX - offsetX, 0, centreY - offsetY],
    scalars,
    // Real footprint AND real height information -> MODELED. Real footprint but the height will have
    // to be chosen by the renderer -> DERIVED, so nothing downstream mistakes a picked height for a
    // surveyed one.
    grounding: height ? 'MODELED' : 'DERIVED',
    visualHint: OSM_BUILDING_HINT,
    visible: true,
  };
}

function segmentEntities(
  feature: ProjectedSpatialFeature,
  hint: string,
  offsetX: number,
  offsetY: number,
  minSegmentLength: number,
): WorldFrameEntity[] {
  const out: WorldFrameEntity[] = [];
  const width = widthFromTags(feature.tags);
  const points = feature.geometry.coordinates;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < minSegmentLength) continue;
    const scalars: Record<string, number> = { lengthM: length };
    if (width) {
      scalars.widthM = width.metres;
      scalars.widthMeasured = width.measured ? 1 : 0;
    }
    out.push({
      // Stable and unique per segment, derived from the real way id plus the vertex index.
      id: `${feature.sourceId}#${i}`,
      position: [(x1 + x2) / 2 - offsetX, 0, (y1 + y2) / 2 - offsetY],
      // Heading of the segment in the XZ plane. Overlay +y maps to world +z, so a segment running
      // north (decreasing y) points at -z.
      rotation: [0, Math.atan2(dx, dy), 0],
      scalars,
      // The centreline is real surveyed geometry. Whether the CARRIAGEWAY WIDTH is real depends on
      // the tags — carried in `widthMeasured` above rather than assumed here.
      grounding: 'MODELED',
      visualHint: hint,
      visible: true,
    });
  }
  return out;
}

/**
 * Converts a projected OSM overlay into a canonical `WorldFrame` that `WorldFrameRenderer.sync()`
 * consumes directly. Deterministic, pure, and does not mutate `overlay`.
 *
 * Entity ordering is stable (layer order, then the overlay's own feature order, then vertex index),
 * which the renderer's incremental instanced path requires — see `SOLVER_DATA_CONTRACT.md` Rule 4.
 */
export function buildSpatialWorldFrame(overlay: SpatialWorldOverlay, options: SpatialWorldFrameOptions = {}): WorldFrame {
  const center = options.center ?? true;
  const offsetX = center ? overlay.worldWidth / 2 : 0;
  const offsetY = center ? overlay.worldHeight / 2 : 0;
  const minSegmentLength = options.minSegmentLength ?? 1;
  const cap = options.maxFeaturesPerLayer;

  const entities: WorldFrameEntity[] = [];

  const buildings: WorldFrameEntity[] = [];
  for (const feature of overlay.layers.buildings) {
    const entity = buildingEntity(feature, offsetX, offsetY);
    if (entity) buildings.push(entity);
  }
  entities.push(...(cap === undefined ? buildings : buildings.slice(0, cap)));

  for (const [layer, hint] of [
    ['roads', OSM_ROAD_HINT],
    ['rail', OSM_RAIL_HINT],
    ['water', OSM_WATER_HINT],
  ] as const) {
    const layerEntities: WorldFrameEntity[] = [];
    for (const feature of overlay.layers[layer]) {
      layerEntities.push(...segmentEntities(feature, hint, offsetX, offsetY, minSegmentLength));
    }
    entities.push(...(cap === undefined ? layerEntities : layerEntities.slice(0, cap)));
  }

  return { time: options.time ?? 0, entities };
}
