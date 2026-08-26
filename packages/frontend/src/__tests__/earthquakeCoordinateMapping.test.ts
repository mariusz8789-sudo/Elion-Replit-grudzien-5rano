import { describe, expect, it } from 'vitest';
import { buildCity } from '../core/world/cityWorld';
import {
  EARTHQUAKE_CITYWORLD_MAPPING,
  fingerprintEarthquakeCoordinateMapping,
  projectEarthquakeToCityOverlay,
  type EarthquakeCoordinateMappingArtifact,
} from '../core/simulationRenderer/earthquakeCoordinateMapping';
import type { EarthquakeWorldStateView } from '../core/hazard/earthquake/earthquakeWorldProjection';

const projection: EarthquakeWorldStateView = {
  schemaVersion: '1.0.0',
  hazardRunId: 'hazard-run-fixture',
  hazardModuleVersion: 'earthquake-scenario-v1',
  generatedAt: 1,
  epicenter: { x: 0, y: 0 },
  magnitude: 5.4,
  notModeled: ['casualties'],
  sites: [
    { siteId: 'site-alpha', assetLabel: 'Fixture Alpha', x: 2, y: 1, severity: 'SEVERE', severityValue: 0.8, uncertaintyLow: 0.7, uncertaintyHigh: 0.9, datasetStatus: 'SCENARIO' },
    { siteId: 'site-bravo', assetLabel: 'Fixture Bravo', x: -3, y: 2, severity: 'MODERATE', severityValue: 0.5, uncertaintyLow: 0.4, uncertaintyHigh: 0.6, datasetStatus: 'SCENARIO' },
    { siteId: 'site-charlie', assetLabel: 'Fixture Charlie', x: 15, y: -10, severity: 'MINOR', severityValue: 0.2, uncertaintyLow: 0.1, uncertaintyHigh: 0.3, datasetStatus: 'SCENARIO' },
    { siteId: 'site-delta', assetLabel: 'Fixture Delta', x: -20, y: 8, severity: 'MINOR', severityValue: 0.1, uncertaintyLow: 0.05, uncertaintyHigh: 0.2, datasetStatus: 'SCENARIO' },
    { siteId: 'site-echo', assetLabel: 'Fixture Echo', x: 60, y: 40, severity: 'MINOR', severityValue: 0.05, uncertaintyLow: 0.01, uncertaintyHigh: 0.1, datasetStatus: 'SCENARIO' },
  ],
};

describe('synthetic Earthquake coordinate mapping', () => {
  it('maps only explicit fixture IDs onto stable existing CityWorld anchors', async () => {
    const layout = buildCity();
    const overlay = await projectEarthquakeToCityOverlay(projection, layout);
    expect(overlay.datasetStatus).toBe('SCENARIO');
    expect(overlay.sites.map((site) => [site.sourceSiteId, site.targetCityWorldLocationId])).toEqual([
      ['site-alpha', 'location:school:1'], ['site-bravo', 'location:shop:0'], ['site-charlie', 'location:hospital:2'], ['site-delta', 'location:park:4'], ['site-echo', 'location:home:5'],
    ]);
    expect(overlay.sites[0]).toMatchObject({ cityX: layout.buildings[1].cx, cityY: layout.buildings[1].cy });
    expect(overlay.notModeled).toEqual(expect.arrayContaining(['real-world geography', 'real facility association', 'CityWorld model coupling']));
  });

  it('is deterministic and fingerprints mapping content with the existing canonical hash primitives', async () => {
    const first = await projectEarthquakeToCityOverlay(projection);
    const second = await projectEarthquakeToCityOverlay(projection);
    expect(first).toEqual(second);
    const changed: EarthquakeCoordinateMappingArtifact = { ...EARTHQUAKE_CITYWORLD_MAPPING, entries: [...EARTHQUAKE_CITYWORLD_MAPPING.entries.slice(0, 4), { sourceSiteId: 'site-echo', targetCityWorldLocationId: 'location:home:6' }] };
    expect(await fingerprintEarthquakeCoordinateMapping(changed)).not.toBe(await fingerprintEarthquakeCoordinateMapping());
  });

  it('rejects missing anchors, non-scenario data and unsupported mapping schemas rather than guessing', async () => {
    await expect(projectEarthquakeToCityOverlay({ ...projection, sites: [{ ...projection.sites[0], datasetStatus: 'OBSERVED' }] })).rejects.toThrow('not SCENARIO');
    await expect(projectEarthquakeToCityOverlay(projection, buildCity(), { ...EARTHQUAKE_CITYWORLD_MAPPING, schemaVersion: '9.9.9' })).rejects.toThrow('Unsupported earthquake mapping schema');
    await expect(projectEarthquakeToCityOverlay({ ...projection, sites: [{ ...projection.sites[0], siteId: 'unmapped' }] })).rejects.toThrow('No explicit CityWorld mapping');
  });

  it('does not mutate CityWorld or the input projection', async () => {
    const layout = buildCity();
    const before = JSON.stringify({ layout, projection });
    await projectEarthquakeToCityOverlay(projection, layout);
    expect(JSON.stringify({ layout, projection })).toBe(before);
  });
});
