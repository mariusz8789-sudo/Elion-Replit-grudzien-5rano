import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VISUAL_STATE_PRESETS, resolveVisualStatePresentation, applyVisualState, type CanonicalVisualState } from '../core/three/graphics/visualState';

const ALL_STATES = Object.keys(VISUAL_STATE_PRESETS) as CanonicalVisualState[];

describe('VISUAL_STATE_PRESETS / resolveVisualStatePresentation', () => {
  it('covers all 12 canonical states', () => {
    expect(ALL_STATES.sort()).toEqual([
      'ACTIVE', 'CONTAMINATED', 'CRITICAL', 'DAMAGED', 'FAILURE', 'INACTIVE', 'INFECTED',
      'NORMAL', 'OFFLINE', 'OVERFLOW', 'UNDER_OBSERVATION', 'WARNING',
    ].sort());
  });

  it('resolveVisualStatePresentation matches the raw table', () => {
    for (const state of ALL_STATES) {
      expect(resolveVisualStatePresentation(state)).toBe(VISUAL_STATE_PRESETS[state]);
    }
  });

  it('marks the urgent/hazard states as pulsing and the calm states as not', () => {
    expect(VISUAL_STATE_PRESETS.CRITICAL.pulses).toBe(true);
    expect(VISUAL_STATE_PRESETS.FAILURE.pulses).toBe(true);
    expect(VISUAL_STATE_PRESETS.INFECTED.pulses).toBe(true);
    expect(VISUAL_STATE_PRESETS.CONTAMINATED.pulses).toBe(true);
    expect(VISUAL_STATE_PRESETS.OVERFLOW.pulses).toBe(true);
    expect(VISUAL_STATE_PRESETS.NORMAL.pulses).toBe(false);
    expect(VISUAL_STATE_PRESETS.OFFLINE.pulses).toBe(false);
    expect(VISUAL_STATE_PRESETS.ACTIVE.pulses).toBe(false);
  });
});

describe('applyVisualState', () => {
  it('sets the material emissive color to the state\'s preset color', () => {
    const material = new THREE.MeshStandardMaterial();
    applyVisualState(material, THREE, 'CRITICAL');
    expect(material.emissive.getHex()).toBe(new THREE.Color(VISUAL_STATE_PRESETS.CRITICAL.color).getHex());
  });

  it('leaves the base color untouched unless updateBaseColor is set', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x123456 });
    applyVisualState(material, THREE, 'FAILURE');
    expect(material.color.getHex()).toBe(new THREE.Color(0x123456).getHex());
    applyVisualState(material, THREE, 'FAILURE', { updateBaseColor: true });
    expect(material.color.getHex()).toBe(new THREE.Color(VISUAL_STATE_PRESETS.FAILURE.color).getHex());
  });

  it('a pulsing state boosts emissiveIntensity with pulseIntensity01, a non-pulsing one ignores it', () => {
    const critical = new THREE.MeshStandardMaterial();
    applyVisualState(critical, THREE, 'CRITICAL', { pulseIntensity01: 0 });
    const baseline = critical.emissiveIntensity;
    applyVisualState(critical, THREE, 'CRITICAL', { pulseIntensity01: 1 });
    expect(critical.emissiveIntensity).toBeGreaterThan(baseline);

    const normal = new THREE.MeshStandardMaterial();
    applyVisualState(normal, THREE, 'NORMAL', { pulseIntensity01: 0 });
    const normalBaseline = normal.emissiveIntensity;
    applyVisualState(normal, THREE, 'NORMAL', { pulseIntensity01: 1 });
    expect(normal.emissiveIntensity).toBeCloseTo(normalBaseline); // non-pulsing state: no-op
  });

  it('clamps an out-of-range pulseIntensity01', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(() => applyVisualState(material, THREE, 'CRITICAL', { pulseIntensity01: 5 })).not.toThrow();
    const clampedAt1 = material.emissiveIntensity;
    applyVisualState(material, THREE, 'CRITICAL', { pulseIntensity01: 1 });
    expect(material.emissiveIntensity).toBeCloseTo(clampedAt1);
  });

  it('every canonical state applies without throwing', () => {
    for (const state of ALL_STATES) {
      const material = new THREE.MeshStandardMaterial();
      expect(() => applyVisualState(material, THREE, state)).not.toThrow();
    }
  });
});
