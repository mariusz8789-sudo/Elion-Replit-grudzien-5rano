import type { HistoricalEntity } from './contracts';
import { entitiesForYear, getKnownLocation } from './historicalEraKnowledgeBase';

/**
 * Named per-domain resolvers over the ONE era archetype table
 * (`historicalEraKnowledgeBase.ts`) — kind-filtered views, not separate data
 * sources. Splitting these into named functions matches how a caller thinks
 * about the problem ("what vehicles existed" vs "what buildings existed")
 * without creating five copies of the same lookup/placement logic.
 */
function resolveKind(locationId: string, year: number, kind: HistoricalEntity['kind']): readonly HistoricalEntity[] {
  const location = getKnownLocation(locationId);
  if (!location) return [];
  return entitiesForYear(location, year).filter((e) => e.kind === kind);
}

export const HistoricalBuildingResolver = { resolveAtYear: (locationId: string, year: number) => resolveKind(locationId, year, 'BUILDING') };
export const HistoricalVehicleResolver = { resolveAtYear: (locationId: string, year: number) => resolveKind(locationId, year, 'VEHICLE') };
export const HistoricalPopulationGenerator = { resolveAtYear: (locationId: string, year: number) => resolveKind(locationId, year, 'POPULATION') };
export const TemporalClothingResolver = { resolveAtYear: (locationId: string, year: number) => resolveKind(locationId, year, 'CLOTHING') };
export const HistoricalInfrastructureResolver = { resolveAtYear: (locationId: string, year: number) => resolveKind(locationId, year, 'INFRASTRUCTURE') };
export const HistoricalEnvironmentResolver = { resolveAtYear: (locationId: string, year: number) => resolveKind(locationId, year, 'ENVIRONMENT') };
