import type { HistoricalEntity, HistoricalEntityKind, KnowledgeStatus, TemporalLocationAnchor } from './contracts';

/**
 * ERA KNOWLEDGE BASE — small, explicitly `ESTIMATED` archetypal data, not a
 * historical archive. Genesis has no real historical-records integration
 * (confirmed absent from the repository: no OSM import, no municipal-archive
 * connector, no georeferenced historical-photo corpus). What follows are
 * ILLUSTRATIVE era archetypes an urban-history reference text would broadly
 * agree with for a generic Western/Central-European or North-American city —
 * never a claim about one specific real address. Every entity this file
 * produces carries `knowledgeStatus: 'ESTIMATED'` and a confidence that is
 * never fabricated precision (0.4/0.6/0.8 only).
 *
 * A location NOT in `KNOWN_LOCATIONS` resolves to nothing — `NEEDS_INPUT`,
 * never a silently invented city.
 */

export interface KnownLocation {
  readonly id: string;
  readonly label: string;
  readonly anchor: TemporalLocationAnchor;
}

export const KNOWN_LOCATIONS: readonly KnownLocation[] = [
  { id: 'warsaw', label: 'Warszawa', anchor: { locationId: 'warsaw', label: 'ulica w centrum Warszawy', position: [0, 0, 0], yaw: 0, extentMeters: 120 } },
  { id: 'london', label: 'London', anchor: { locationId: 'london', label: 'a central London street', position: [0, 0, 0], yaw: 0, extentMeters: 120 } },
  { id: 'krakow', label: 'Kraków', anchor: { locationId: 'krakow', label: 'ulica w centrum Krakowa', position: [0, 0, 0], yaw: 0, extentMeters: 120 } },
  { id: 'new-york', label: 'New York', anchor: { locationId: 'new-york', label: 'a Manhattan street', position: [0, 0, 0], yaw: 0, extentMeters: 120 } },
  { id: 'barcelona', label: 'Barcelona', anchor: { locationId: 'barcelona', label: 'a central Barcelona street', position: [0, 0, 0], yaw: 0, extentMeters: 120 } },
];

const LOCATION_ALIASES: Readonly<Record<string, string>> = {
  warszawa: 'warsaw', warszawie: 'warsaw', warsaw: 'warsaw',
  london: 'london', londyn: 'london', londynie: 'london',
  krakow: 'krakow', 'kraków': 'krakow', krakowie: 'krakow',
  'new york': 'new-york', 'nowy jork': 'new-york', 'new-york': 'new-york',
  barcelona: 'barcelona', barcelonie: 'barcelona',
};

export function resolveKnownLocationId(rawText: string): string | null {
  const lowered = rawText.toLowerCase().trim();
  for (const [alias, id] of Object.entries(LOCATION_ALIASES)) {
    if (lowered.includes(alias)) return id;
  }
  return null;
}

export function getKnownLocation(locationId: string): KnownLocation | null {
  return KNOWN_LOCATIONS.find((l) => l.id === locationId) ?? null;
}

interface EraArchetype {
  readonly kind: HistoricalEntityKind;
  readonly label: string;
  readonly validFrom: number;
  readonly validTo?: number;
  readonly confidence: number;
  readonly knowledgeStatus: KnowledgeStatus;
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * One shared archetype table for every known location — the archetypes
 * (a wooden-era tenement, a post-war concrete block, a horse cart, a tram, a
 * modern car) are genuinely generic across the cities above; what differs per
 * city is only the anchor position, not the era timeline. Splitting this per
 * city with no real per-city data behind it would manufacture false
 * specificity, which is exactly what `ESTIMATED` exists to avoid.
 */
const ERA_ARCHETYPES: readonly EraArchetype[] = [
  { kind: 'BUILDING', label: 'wooden tenement', validFrom: 1850, validTo: 1944, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { material: 'wood', style: 'vernacular' } },
  { kind: 'BUILDING', label: 'brick apartment block', validFrom: 1890, validTo: 2026, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { material: 'brick', style: 'historicist' } },
  { kind: 'BUILDING', label: 'post-war concrete block', validFrom: 1948, validTo: 2026, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { material: 'concrete', style: 'modernist' } },
  { kind: 'BUILDING', label: 'glass-curtain office tower', validFrom: 1985, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { material: 'glass_steel', style: 'contemporary' } },
  { kind: 'VEHICLE', label: 'horse-drawn cart', validFrom: 1800, validTo: 1935, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { propulsion: 'animal' } },
  { kind: 'VEHICLE', label: 'electric tram', validFrom: 1900, validTo: 2026, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { propulsion: 'electric_rail' } },
  { kind: 'VEHICLE', label: 'early automobile', validFrom: 1905, validTo: 1945, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { propulsion: 'combustion' } },
  { kind: 'VEHICLE', label: 'mid-century sedan', validFrom: 1946, validTo: 1985, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { propulsion: 'combustion' } },
  { kind: 'VEHICLE', label: 'modern car', validFrom: 1986, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { propulsion: 'combustion_or_electric' } },

  { kind: 'POPULATION', label: 'street population, working-class dress', validFrom: 1850, validTo: 1918, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { density: 'moderate', activity: 'trade_and_errands' } },
  { kind: 'POPULATION', label: 'street population, interwar dress', validFrom: 1919, validTo: 1939, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { density: 'moderate', activity: 'commuting' } },
  { kind: 'POPULATION', label: 'street population, post-war dress', validFrom: 1945, validTo: 1969, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { density: 'high', activity: 'commuting' } },
  { kind: 'POPULATION', label: 'street population, contemporary dress', validFrom: 1990, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { density: 'high', activity: 'mixed' } },

  { kind: 'CLOTHING', label: 'Edwardian street dress', validFrom: 1900, validTo: 1914, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { silhouette: 'long_skirt_high_collar' } },
  { kind: 'CLOTHING', label: 'flapper-era dress', validFrom: 1920, validTo: 1929, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { silhouette: 'dropped_waist' } },
  { kind: 'CLOTHING', label: 'mid-century tailored dress', validFrom: 1946, validTo: 1969, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { silhouette: 'tailored' } },
  { kind: 'CLOTHING', label: 'contemporary casual dress', validFrom: 1995, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { silhouette: 'casual' } },

  { kind: 'INFRASTRUCTURE', label: 'gas street lamp', validFrom: 1850, validTo: 1935, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { utility: 'lighting', power: 'gas' } },
  { kind: 'INFRASTRUCTURE', label: 'electric street lamp', validFrom: 1920, validTo: 2026, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { utility: 'lighting', power: 'electric' } },
  { kind: 'INFRASTRUCTURE', label: 'overhead tram wire', validFrom: 1900, validTo: 2026, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { utility: 'transit_power' } },
  { kind: 'INFRASTRUCTURE', label: 'traffic signal', validFrom: 1930, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { utility: 'traffic_control' } },
  { kind: 'INFRASTRUCTURE', label: 'paved sidewalk', validFrom: 1880, validTo: 2026, confidence: 0.6, knowledgeStatus: 'ESTIMATED', attributes: { utility: 'pedestrian' } },

  { kind: 'ENVIRONMENT', label: 'mature street trees', validFrom: 1850, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { vegetation: 'deciduous_avenue' } },
  { kind: 'ENVIRONMENT', label: 'cobblestone road surface', validFrom: 1850, validTo: 1955, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { surface: 'cobblestone' } },
  { kind: 'ENVIRONMENT', label: 'asphalt road surface', validFrom: 1935, validTo: 2026, confidence: 0.4, knowledgeStatus: 'ESTIMATED', attributes: { surface: 'asphalt' } },
];

/** Deterministic placement in a ring around the anchor — real, fixed, never re-rolled between calls for the same index. */
function placeAt(anchor: TemporalLocationAnchor, index: number, count: number): readonly [number, number, number] {
  const angle = (index / Math.max(1, count)) * Math.PI * 2;
  const radius = anchor.extentMeters * 0.35;
  return [anchor.position[0] + Math.cos(angle) * radius, anchor.position[1], anchor.position[2] + Math.sin(angle) * radius];
}

/**
 * Every archetype whose validity window covers `year`, materialized as
 * `HistoricalEntity` records anchored to `location`. Deterministic: the same
 * (location, year) always yields the same entities in the same positions —
 * required for `resolveEntityAtYear`/interpolation and for replay.
 */
export function entitiesForYear(location: KnownLocation, year: number): readonly HistoricalEntity[] {
  const applicable = ERA_ARCHETYPES.filter((a) => year >= a.validFrom && (a.validTo === undefined || year <= a.validTo));
  return applicable.map((a, i) => ({
    id: `${location.id}:${a.kind.toLowerCase()}:${a.label.replace(/\s+/g, '-')}`,
    kind: a.kind,
    label: a.label,
    position: placeAt(location.anchor, i, applicable.length),
    validity: { validFrom: a.validFrom, validTo: a.validTo },
    provenance: { source: 'historicalEraKnowledgeBase (illustrative archetype table)', knowledgeStatus: a.knowledgeStatus, confidence: a.confidence, generationMethod: 'ERA_LOOKUP' },
    attributes: a.attributes,
  }));
}

/** The full archetype table, independent of any one year — used by the consistency engine to explain WHY an entity is invalid for a requested year. */
export function allArchetypesFor(location: KnownLocation): readonly HistoricalEntity[] {
  return ERA_ARCHETYPES.map((a, i) => ({
    id: `${location.id}:${a.kind.toLowerCase()}:${a.label.replace(/\s+/g, '-')}`,
    kind: a.kind,
    label: a.label,
    position: placeAt(location.anchor, i, ERA_ARCHETYPES.length),
    validity: { validFrom: a.validFrom, validTo: a.validTo },
    provenance: { source: 'historicalEraKnowledgeBase (illustrative archetype table)', knowledgeStatus: a.knowledgeStatus, confidence: a.confidence, generationMethod: 'ERA_LOOKUP' },
    attributes: a.attributes,
  }));
}
