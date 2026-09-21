/**
 * OPT-IN structural-detail request for the geometry-generation phase
 * (generation/geometry/). Lives in `generation/` (not `specification/`) so
 * `specification/worldSpecification.ts` can import IT — never the reverse
 * — keeping the documented layering intact: `generation/` stays the
 * domain-blind layer `specification/` depends on
 * (see generation/worldBlueprint.ts's own doc on this).
 *
 * Every field is OPTIONAL and additive: a `WorldSpecification` that omits
 * `structuralDetail` entirely never triggers this phase at all (see
 * `compileSpecification`), so every pre-existing template/spec/test keeps
 * its exact current behavior, unconditionally.
 */
export interface StructuralDetailSpec {
  /** Full width/depth in meters of the generated city's overall bounds, centered at the origin. Defaults to 600. */
  citySizeM?: number;
  /** Defaults to 4. */
  districtCount?: number;
  /** Defaults to 4. */
  parcelsPerDistrict?: number;
  /** Hard cap on any generated building's floor count (the building type's own realistic ceiling may cap it further). Defaults to 6. */
  maxFloors?: number;
  /** Rooms generated on EACH side of a floor's central corridor. Defaults to 2. Only consulted when `generateInteriors` is true. */
  roomsPerFloorSide?: number;
  /** Opts into Phase 4 interior generation (floors/rooms/doors/corridors/stairs/elevators/asset slots) for every generated building. Defaults to false — Phase 3 exterior geometry alone when omitted. */
  generateInteriors?: boolean;
  /** Opts into Phase 5 navigation-graph generation (NavNode/NavEdge/NavZone/SpawnPoint/ApproachPoint/InteractionPoint) derived from the generated geometry. Requires `generateInteriors` for indoor navigation to reach rooms — when interiors are off, navigation still covers the outdoor road/building-entrance graph. Defaults to false. */
  generateNavigation?: boolean;
}

export const STRUCTURAL_DETAIL_DEFAULTS = {
  citySizeM: 600,
  districtCount: 4,
  parcelsPerDistrict: 4,
  maxFloors: 6,
  roomsPerFloorSide: 2,
} as const;
