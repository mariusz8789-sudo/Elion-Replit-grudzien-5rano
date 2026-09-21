import { describe, expect, it } from 'vitest';
import { checkSceneConsistency, checkSequenceConsistency } from '../core/lookingGlass/urbanTransformation/sceneConsistencyEngine';
import type { HistoricalEntity } from '../core/lookingGlass/urbanTransformation/contracts';

function fakeVehicle(label: string, validFrom: number, validTo?: number): HistoricalEntity {
  return {
    id: `test:vehicle:${label}`, kind: 'VEHICLE', label, position: [0, 0, 0],
    validity: { validFrom, validTo },
    provenance: { source: 'test fixture', knowledgeStatus: 'ESTIMATED', confidence: 0.6, generationMethod: 'ERA_LOOKUP' },
    attributes: {},
  };
}

describe('SceneConsistencyEngine — literal anachronism examples from the brief', () => {
  it('year=1910 + a Tesla-class entity (validFrom 2012) -> INVALID_TEMPORAL_ENTITY', () => {
    const tesla = fakeVehicle('Tesla Model S', 2012);
    const result = checkSceneConsistency([tesla], 1910);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('INVALID_TEMPORAL_ENTITY');
    expect(result.violations[0].entityId).toBe(tesla.id);
  });

  it('year=1970 + a smartphone-era entity (validFrom 2007) -> INVALID_TEMPORAL_ENTITY', () => {
    const smartphone = { ...fakeVehicle('smartphone', 2007), kind: 'BUILDING' as const };
    const result = checkSceneConsistency([smartphone], 1970);
    expect(result.ok).toBe(false);
    expect(result.violations[0].reason).toContain('2007');
  });

  it('an entity within its own validity window produces no violation', () => {
    const tram = fakeVehicle('electric tram', 1900, 2026);
    const result = checkSceneConsistency([tram], 1950);
    expect(result).toEqual({ ok: true, violations: [] });
  });

  it('an entity with no validTo (still standing) is valid at the upper edge of the supported range', () => {
    const modernBuilding = { ...fakeVehicle('glass tower', 1985), kind: 'BUILDING' as const };
    expect(checkSceneConsistency([modernBuilding], 2026).ok).toBe(true);
  });

  it('checkSequenceConsistency aggregates violations across an entire multi-year sequence', () => {
    const tesla = fakeVehicle('Tesla Model S', 2012);
    const tram = fakeVehicle('electric tram', 1900, 2026);
    const result = checkSequenceConsistency([
      { entities: [tram], year: 1910 },
      { entities: [tesla], year: 1910 },
      { entities: [tram, tesla], year: 2020 },
    ]);
    // Tesla is invalid at 1910 (once) but valid at 2020, tram is valid throughout.
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
