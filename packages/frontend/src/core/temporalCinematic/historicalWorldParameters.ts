import { fnv1a } from '../events/hash';
import type { StructuralDetailSpec } from '../worldModel/generation/geometry/structuralDetailSpec';
import type { WorldSpecification } from '../worldModel/specification/worldSpecification';
import { resolveEraProfile } from './historicalEra';

/**
 * TEMPORAL CINEMATIC ENGINE — PLACE → WORLD SPECIFICATION.
 *
 * Builds a `WorldSpecification` (the SAME contract every other Genesis
 * world already compiles from — `specification/compiler.ts`, unchanged) for
 * one `(place, year)` pair, reusing the existing `CITY` template plus the
 * existing `structuralDetail` opt-in geometry hook. No new compiler, no new
 * generator: this module's entire job is choosing the RIGHT INPUT NUMBERS
 * for the existing pipeline.
 *
 * DETERMINISM ACROSS YEARS FOR THE SAME PLACE — the mechanism that makes
 * "show the same street in 1900 and 2026" answerable at all:
 * `generation/geometry/roadGenerator.ts::generateRoadNetwork` places
 * roads/intersections as a PURE function of `citySizeM`/district grid shape
 * — never the rng, never the year. This module fixes `citySizeM`,
 * `districtCount`, and `parcelsPerDistrict` from `place` ALONE (never
 * `year`), so the two worlds' road networks are laid out identically
 * (same count, same positions, same index order) — only `maxFloors`
 * (`historicalEra.ts`) varies with `year`, which affects building HEIGHT
 * (and, via the existing floor-count rng roll, nothing else — building
 * TYPE draws are unaffected by the cap; see
 * `generation/geometry/buildingGenerator.ts`'s own doc on why the rng draw
 * always happens regardless of the cap). This is what lets
 * `cameraPath.ts`/`temporalCinematicEngine.ts::compareSameStreetAcrossYears`
 * point at "the Nth generated road" in both compiled worlds and get the
 * exact same (start, end) — the same physical street location — while the
 * skyline around it honestly differs by era.
 */

const PLACE_CITY_SIZE_MIN_M = 400;
const PLACE_CITY_SIZE_MAX_M = 900;
const PLACE_DISTRICT_COUNT_MIN = 3;
const PLACE_DISTRICT_COUNT_MAX = 6;
const PLACE_PARCELS_PER_DISTRICT_MIN = 3;
const PLACE_PARCELS_PER_DISTRICT_MAX = 6;

function hashToUnitInterval(input: string): number {
  return parseInt(fnv1a(input), 16) / 0xffffffff;
}

/** Deterministic pure function of `place` alone — the same place name always yields the same structural counts, regardless of year, caller, or run. Never a claim about the REAL geography of `place`: an honest placeholder shape, not a geodata lookup. */
export interface PlaceGeographyProfile {
  readonly citySizeM: number;
  readonly districtCount: number;
  readonly parcelsPerDistrict: number;
  readonly seed: number;
}

export function resolvePlaceGeography(place: string): PlaceGeographyProfile {
  const normalized = place.trim().toLowerCase();
  const u1 = hashToUnitInterval(`${normalized}:citySize`);
  const u2 = hashToUnitInterval(`${normalized}:districtCount`);
  const u3 = hashToUnitInterval(`${normalized}:parcelsPerDistrict`);
  return {
    citySizeM: Math.round(PLACE_CITY_SIZE_MIN_M + u1 * (PLACE_CITY_SIZE_MAX_M - PLACE_CITY_SIZE_MIN_M)),
    districtCount: PLACE_DISTRICT_COUNT_MIN + Math.floor(u2 * (PLACE_DISTRICT_COUNT_MAX - PLACE_DISTRICT_COUNT_MIN + 1)),
    parcelsPerDistrict: PLACE_PARCELS_PER_DISTRICT_MIN + Math.floor(u3 * (PLACE_PARCELS_PER_DISTRICT_MAX - PLACE_PARCELS_PER_DISTRICT_MIN + 1)),
    seed: parseInt(fnv1a(`${normalized}:seed`), 16),
  };
}

export interface HistoricalWorldRequest {
  readonly place: string;
  readonly year: number;
  /** Opts into Phase 5 navigation-graph generation (needed only if a caller wants NAV_NODE-based pathing rather than the straight-road sampling `cameraPath.ts` uses by default). Defaults to false — kept off by default to keep generation fast for a cinematic preview. */
  readonly generateNavigation?: boolean;
}

/** Deterministic, collision-safe world id for one (place, year) request — never reused across a different place or year. */
export function historicalWorldId(place: string, year: number): string {
  return `historical:${place.trim().toLowerCase().replace(/\s+/g, '-')}:${year}`;
}

/**
 * Builds the `WorldSpecification` for `request`. Throws nothing itself —
 * `compileSpecification`/`generateSpecifiedWorld` (called by
 * `temporalCinematicEngine.ts`) perform the real validation this
 * specification must pass, exactly like every other Genesis world.
 */
export function buildHistoricalWorldSpecification(request: HistoricalWorldRequest): WorldSpecification {
  const geography = resolvePlaceGeography(request.place);
  const era = resolveEraProfile(request.year);
  const structuralDetail: StructuralDetailSpec = {
    citySizeM: geography.citySizeM,
    districtCount: geography.districtCount,
    parcelsPerDistrict: geography.parcelsPerDistrict,
    maxFloors: era.maxFloors,
    generateInteriors: false,
    generateNavigation: request.generateNavigation ?? false,
  };

  return {
    worldId: historicalWorldId(request.place, request.year),
    seed: geography.seed,
    worldType: ['CITY'],
    scale: 'MACRO_CITY',
    structuralDetail,
    provenanceNote: `Procedural era heuristic (${era.label}, cap ${era.maxFloors} floors) for "${request.place}" in ${request.year} — NOT a real historical reconstruction; no historical dataset backs this world. See historicalEra.ts.`,
  };
}
