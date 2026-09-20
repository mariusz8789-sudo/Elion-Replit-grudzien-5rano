import { describe, expect, it } from 'vitest';
import {
  assertRegenerativeBayPlacement,
  assertRegenerativeBayUnique,
  createCanonicalRegenerativeBayStation,
  regenerativeBayEquipmentItems,
} from './regenerativeMedicineBayIntegration';
import { REGENERATIVE_BAY_EXPERIMENTS, createRegenerativeBayStation } from './regenerativeMedicineBay';
import { createInitialRegenerativeBayRuntime, stepRegenerativeBayRuntime } from './regenerativeMedicineBayRuntime';

describe('regenerative bay integration adapters', () => {
  it('finds a deterministic placement inside supplied experimental room bounds', () => {
    const room = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
    const station = createCanonicalRegenerativeBayStation({ room, obstacles: [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }] });
    assertRegenerativeBayPlacement(room, station);
    expect(station.id).toBe('station:regenerative-medicine');
  });

  it('exposes all six equipment contracts through the existing equipment shape', () => {
    expect(regenerativeBayEquipmentItems()).toHaveLength(6);
    expect(regenerativeBayEquipmentItems().every((x) => x.operational)).toBe(true);
  });

  it('rejects duplicate canonical station registrations', () => {
    const station = createRegenerativeBayStation({ position: { x: 0, z: 0 }, facing: 0 });
    expect(() => assertRegenerativeBayUnique([station])).not.toThrow();
    expect(() => assertRegenerativeBayUnique([station, station])).toThrow('REGENERATIVE_BAY_STATION_COUNT:2');
  });

  it('keeps one station while exposing five canonical experiment ids', () => {
    const station = createRegenerativeBayStation({ position: { x: 0, z: 0 }, facing: 0 });
    expect(station.experimentIds).toEqual(REGENERATIVE_BAY_EXPERIMENTS);
    expect(station.experimentAliases.map((x) => x.experimentId)).toEqual(REGENERATIVE_BAY_EXPERIMENTS);
  });

  it('drives deterministic sensor state without wall-clock timers', () => {
    const a = stepRegenerativeBayRuntime(createInitialRegenerativeBayRuntime('twin-1', 'twin-1'), 10);
    const b = stepRegenerativeBayRuntime(createInitialRegenerativeBayRuntime('twin-1', 'twin-1'), 10);
    expect(a).toEqual(b);
    expect(a.logicalTick).toBe(10);
  });
});
