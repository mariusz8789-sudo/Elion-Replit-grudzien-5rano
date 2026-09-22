import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { directGenesisWorld, recordDirectedAssetInspection, recordDirectedWorld } from '../core/worldDirector/genesisWorldDirector';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';

describe('Genesis World Director — canonical production adapter', () => {
  it('builds all release presets through WorldSpecification and the canonical graph', () => {
    const laboratory = directGenesisWorld({ preset: 'MODERN_SCIENTIFIC_LAB', populationEnabled: true, light: 'DAY', weather: 'CLEAR', navigation: 'CINEMATIC' });
    const city = directGenesisWorld({ preset: 'MODERN_CITY', populationEnabled: false, light: 'NIGHT', weather: 'RAIN', navigation: 'OBSERVER' });
    const historical = directGenesisWorld({ preset: 'HISTORICAL_RECONSTRUCTION', populationEnabled: true, light: 'DAY', weather: 'FOG', navigation: 'WALK' });

    expect(laboratory.proof.pipeline).toContain('WorldSpecification→compiler→WorldBlueprint→generateWorld→WorldGraph');
    expect(laboratory.presentation).toMatchObject({ viewMode: 'interior', roomType: 'MATERIALS_LAB' });
    expect(laboratory.proof.roomCount).toBeGreaterThan(0);
    expect(laboratory.proof.assetSlotCount).toBeGreaterThan(0);
    expect(laboratory.scene.world.engine.graph.listEntities().some((entity) => entity.geometry?.kind === 'ROOM' && entity.geometry.roomType === 'MATERIALS_LAB')).toBe(true);
    expect(laboratory.scene.world.engine.graph.listEntities().some((entity) => entity.geometry?.kind === 'ASSET_SLOT' && entity.geometry.slotType === 'COMPUTE_STATION')).toBe(true);
    expect(city.presentation.weather).toBe('RAIN_NIGHT');
    expect(city.proof.humanEntityCount).toBe(0);
    expect(historical.proof.humanEntityCount).toBeGreaterThan(0);
    expect(historical.scene.world.engine.graph).toBeInstanceOf(WorldGraph);
    const runtimeIds = new Set(historical.scene.world.engine.graph.listEntities().map((entity) => entity.id));
    expect(historical.scene.world.specified.graph.listEntities().every((entity) => runtimeIds.has(entity.id))).toBe(true);
  });

  it('records execution in the supplied canonical EvidenceLedger and deduplicates identical worlds', () => {
    const ledger = new EvidenceLedger({ now: () => 42 });
    const directed = directGenesisWorld({ preset: 'MODERN_CITY', populationEnabled: false, light: 'DAY', weather: 'CLEAR', navigation: 'WALK' });
    const a = recordDirectedWorld(ledger, directed);
    const b = recordDirectedWorld(ledger, directed);
    expect(a).toBe(b);
    expect(ledger.getActive()).toHaveLength(1);
    expect(ledger.verifyLedger()).toEqual({ ok: true, errors: [] });
  });

  it('records a canonical INSPECT_ENTITY action only for a real generated asset slot', () => {
    const ledger = new EvidenceLedger({ now: () => 43 });
    const directed = directGenesisWorld({ preset: 'MODERN_SCIENTIFIC_LAB', populationEnabled: false, light: 'DAY', weather: 'CLEAR', navigation: 'CINEMATIC' });
    const slot = directed.scene.world.engine.graph.listEntities().find((entity) => entity.geometry?.kind === 'ASSET_SLOT');
    expect(slot?.geometry?.kind).toBe('ASSET_SLOT');
    const hash = recordDirectedAssetInspection(ledger, directed, { entityId: slot!.id, slotType: slot!.geometry!.kind === 'ASSET_SLOT' ? slot!.geometry!.slotType : '' });
    expect(hash).toHaveLength(64);
    expect(ledger.getActive()[0]?.claim).toContain('INSPECT_ENTITY');
    expect(ledger.getActive()[0]?.claim).toContain('scientificResult=UNBOUND');
    expect(() => recordDirectedAssetInspection(ledger, directed, { entityId: directed.proof.worldId, slotType: 'COMPUTE_STATION' })).toThrow(/INVALID_ASSET_SELECTION/);
  });
});
