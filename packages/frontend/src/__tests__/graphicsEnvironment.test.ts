import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeSunState, createSkyDome, applyEnvironmentPreset } from '../core/three/graphics/environment';

describe('computeSunState', () => {
  it('reports full darkness at midnight and peak altitude at solar noon', () => {
    const midnight = computeSunState(THREE, 0);
    const noon = computeSunState(THREE, 12);
    expect(midnight.altitude01).toBeLessThan(0.05);
    expect(midnight.timeOfDay).toBe('NIGHT');
    expect(noon.altitude01).toBeGreaterThan(0.95);
    expect(noon.timeOfDay).toBe('DAY');
  });

  it('sun intensity rises monotonically from midnight to noon', () => {
    const samples = [0, 3, 6, 9, 12].map((h) => computeSunState(THREE, h).intensity);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
  });

  it('wraps hour-of-day modulo 24 (25:00 behaves like 1:00)', () => {
    const a = computeSunState(THREE, 25);
    const b = computeSunState(THREE, 1);
    expect(a.altitude01).toBeCloseTo(b.altitude01, 5);
    expect(a.skyZenithColor).toBe(b.skyZenithColor);
  });

  it('the sun direction vector is normalized', () => {
    for (const hour of [0, 4, 8, 12, 16, 20]) {
      const { direction } = computeSunState(THREE, hour);
      const length = Math.hypot(...direction);
      expect(length).toBeCloseTo(1, 5);
    }
  });

  it('deep night is not contaminated by the golden-hour blend the way dusk legitimately is — found via the first production Chromium screenshot of this module (a full-frame orange wash at 9pm)', () => {
    const dusk = computeSunState(THREE, 17.7); // the model's own golden-hour peak (sun just above the horizon)
    const deepNight = computeSunState(THREE, 1); // 1am — should read as neutrally dark, not orange
    const midnight = computeSunState(THREE, 0);
    const duskFogRed = new THREE.Color(dusk.fogColor).r;
    const deepNightFogRed = new THREE.Color(deepNight.fogColor).r;
    // GOLDEN_FOG (0xe0a878) is strongly orange; NIGHT_FOG (0x050a14) is not — a real, large gap in
    // the red channel, not a subtle threshold. The defect made every night hour blend in enough
    // GOLDEN_FOG to read as clearly warm; the fix must make deep night close to pure NIGHT_FOG.
    expect(duskFogRed).toBeGreaterThan(0.35);
    expect(deepNightFogRed).toBeLessThan(0.1);
    // Every deep-night hour reads the same neutrally-dark tone as any other — the defect made
    // every night hour identical to DUSK's own warm tone instead.
    expect(deepNight.skyZenithColor).toBe(midnight.skyZenithColor);
    expect(deepNight.skyZenithColor).not.toBe(dusk.skyZenithColor);
  });

  it('day sky is brighter/cooler than night sky', () => {
    const night = computeSunState(THREE, 0);
    const day = computeSunState(THREE, 12);
    const nightLuma = new THREE.Color(night.skyZenithColor).getHSL({ h: 0, s: 0, l: 0 }).l;
    const dayLuma = new THREE.Color(day.skyZenithColor).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(dayLuma).toBeGreaterThan(nightLuma);
  });
});

describe('createSkyDome', () => {
  it('builds a large BackSide sphere with per-vertex color, drawn behind everything', () => {
    const dome = createSkyDome(THREE, { topColor: 0x3355ff, bottomColor: 0xffddaa, radius: 100 });
    expect(dome.geometry.getAttribute('color')).toBeDefined();
    const material = dome.material as THREE.MeshBasicMaterial;
    expect(material.side).toBe(THREE.BackSide);
    expect(material.vertexColors).toBe(true);
    expect(dome.renderOrder).toBeLessThan(0);
  });

  it('the top of the dome reads closer to topColor than bottomColor, and vice versa', () => {
    const dome = createSkyDome(THREE, { topColor: 0x0000ff, bottomColor: 0xff0000, radius: 50 });
    const position = dome.geometry.attributes.position!;
    const color = dome.geometry.getAttribute('color')!;
    let topIndex = 0;
    let bottomIndex = 0;
    for (let i = 1; i < position.count; i++) {
      if (position.getY(i) > position.getY(topIndex)) topIndex = i;
      if (position.getY(i) < position.getY(bottomIndex)) bottomIndex = i;
    }
    expect(color.getX(topIndex)).toBeLessThan(color.getX(bottomIndex)); // top: less red (blue-ish)
    expect(color.getZ(bottomIndex)).toBeLessThan(color.getZ(topIndex)); // bottom: less blue (red-ish)
  });
});

describe('applyEnvironmentPreset', () => {
  it('OUTDOOR mode adds a sky dome and sets scene.fog', () => {
    const scene = new THREE.Scene();
    const handle = applyEnvironmentPreset(THREE, scene, { mode: 'OUTDOOR', hourOfDay: 14 });
    expect(scene.children).toContain(handle.skyDome);
    expect(scene.fog).not.toBeNull();
    expect(handle.sunState).not.toBeNull();
  });

  it('INDOOR mode touches neither the scene graph nor fog', () => {
    const scene = new THREE.Scene();
    const handle = applyEnvironmentPreset(THREE, scene, { mode: 'INDOOR' });
    expect(scene.children).toHaveLength(0);
    expect(scene.fog).toBeNull();
    expect(handle.skyDome).toBeNull();
    expect(handle.sunState).toBeNull();
  });

  it('dispose() removes the sky dome and clears fog, and is a safe no-op for INDOOR', () => {
    const scene = new THREE.Scene();
    const outdoor = applyEnvironmentPreset(THREE, scene, { mode: 'OUTDOOR' });
    outdoor.dispose();
    expect(scene.children).toHaveLength(0);
    expect(scene.fog).toBeNull();

    const indoor = applyEnvironmentPreset(THREE, scene, { mode: 'INDOOR' });
    expect(() => indoor.dispose()).not.toThrow();
  });
});
