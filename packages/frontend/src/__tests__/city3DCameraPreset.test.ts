import { describe, expect, it } from 'vitest';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';

describe('EpidemicCity3DSim — presety jednej kamery', () => {
  it('CITY nie wybiera ani nie tworzy celu, a preset ulicy śledzi istniejącego agenta modelu', () => {
    const scene = new EpidemicCity3DSim({ nAgents: 48, seed: 17 });

    expect(scene.setCameraPreset('city')).toBeNull();
    expect(scene.getCameraPreset()).toBe('city');

    const trackedId = scene.setCameraPreset('street');
    expect(trackedId).not.toBeNull();
    expect(scene.getCameraPreset()).toBe('street');
    expect(scene.getSim().agents().some((agent) => agent.id === trackedId)).toBe(true);
  });

  it('AGENT wybiera rzeczywistego zakażonego lub narażonego, bez niezależnej choreografii', () => {
    const scene = new EpidemicCity3DSim({ nAgents: 64, initialInfected: 3, seed: 23 });

    const trackedId = scene.setCameraPreset('agent');
    const tracked = scene.getSim().agents().find((agent) => agent.id === trackedId);

    expect(tracked).toBeDefined();
    expect(['I', 'E']).toContain(tracked?.state);
    expect(scene.getCameraPreset()).toBe('agent');

    scene.clearSelection();
    expect(scene.getCameraPreset()).toBe('city');
  });
});
