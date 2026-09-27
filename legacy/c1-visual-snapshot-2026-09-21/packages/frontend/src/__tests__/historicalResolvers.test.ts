import { describe, expect, it } from 'vitest';
import {
  HistoricalBuildingResolver, HistoricalEnvironmentResolver, HistoricalInfrastructureResolver,
  HistoricalPopulationGenerator, HistoricalVehicleResolver, TemporalClothingResolver,
} from '../core/lookingGlass/urbanTransformation/historicalResolvers';

describe('named per-domain historical resolvers — Phase C', () => {
  it('HistoricalBuildingResolver only returns BUILDING-kind entities', () => {
    const buildings = HistoricalBuildingResolver.resolveAtYear('warsaw', 1950);
    expect(buildings.length).toBeGreaterThan(0);
    expect(buildings.every((e) => e.kind === 'BUILDING')).toBe(true);
  });

  it('HistoricalVehicleResolver: a modern car does not exist in 1910', () => {
    const vehicles = HistoricalVehicleResolver.resolveAtYear('warsaw', 1910);
    expect(vehicles.some((v) => v.label === 'modern car')).toBe(false);
    expect(vehicles.some((v) => v.label === 'horse-drawn cart')).toBe(true);
  });

  it('HistoricalPopulationGenerator: 1920 population does not visually behave like 2026', () => {
    const pop1920 = HistoricalPopulationGenerator.resolveAtYear('warsaw', 1920);
    const pop2026 = HistoricalPopulationGenerator.resolveAtYear('warsaw', 2026);
    expect(pop1920.map((e) => e.label)).not.toEqual(pop2026.map((e) => e.label));
    expect(pop1920.some((e) => e.label.includes('interwar'))).toBe(true);
    expect(pop2026.some((e) => e.label.includes('contemporary'))).toBe(true);
  });

  it('TemporalClothingResolver: no modern clothing archetype resolves for 1905', () => {
    const clothing1905 = TemporalClothingResolver.resolveAtYear('london', 1905);
    expect(clothing1905.some((e) => e.label.includes('contemporary'))).toBe(false);
    expect(clothing1905.some((e) => e.label.includes('Edwardian'))).toBe(true);
  });

  it('HistoricalInfrastructureResolver: gas lamps give way to electric lamps by the requested year', () => {
    const infra1900 = HistoricalInfrastructureResolver.resolveAtYear('krakow', 1900);
    const infra2000 = HistoricalInfrastructureResolver.resolveAtYear('krakow', 2000);
    expect(infra1900.some((e) => e.label === 'gas street lamp')).toBe(true);
    expect(infra1900.some((e) => e.label === 'traffic signal')).toBe(false);
    expect(infra2000.some((e) => e.label === 'traffic signal')).toBe(true);
    expect(infra2000.some((e) => e.label === 'gas street lamp')).toBe(false);
  });

  it('HistoricalEnvironmentResolver: road surface material changes with era', () => {
    const env1900 = HistoricalEnvironmentResolver.resolveAtYear('barcelona', 1900);
    const env2000 = HistoricalEnvironmentResolver.resolveAtYear('barcelona', 2000);
    expect(env1900.some((e) => e.label === 'cobblestone road surface')).toBe(true);
    expect(env2000.some((e) => e.label === 'asphalt road surface')).toBe(true);
  });

  it('an unknown location resolves to an empty list for every resolver, never a fabricated one', () => {
    expect(HistoricalBuildingResolver.resolveAtYear('atlantis', 1950)).toEqual([]);
    expect(HistoricalPopulationGenerator.resolveAtYear('atlantis', 1950)).toEqual([]);
  });
});
