import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  sampleColorScale, severityColor, applyValueToEmissive, applyFractionToScale,
  AttentionPulse, SEVERITY_COLOR_SCALE, type ColorScaleStop,
} from '../core/three/graphics/stateVisualization';

describe('sampleColorScale', () => {
  const stops: ColorScaleStop[] = [
    { at: 0, color: 0x000000 },
    { at: 1, color: 0xffffff },
  ];

  it('returns the exact stop color at its own position', () => {
    expect(sampleColorScale(THREE, stops, 0).getHex()).toBe(0x000000);
    expect(sampleColorScale(THREE, stops, 1).getHex()).toBe(0xffffff);
  });

  it('interpolates linearly between two stops', () => {
    const mid = sampleColorScale(THREE, stops, 0.5);
    // Midpoint of black->white should be a mid-gray in each channel.
    expect(mid.r).toBeCloseTo(0.5, 1);
    expect(mid.g).toBeCloseTo(0.5, 1);
    expect(mid.b).toBeCloseTo(0.5, 1);
  });

  it('clamps below the first stop and above the last instead of extrapolating', () => {
    expect(sampleColorScale(THREE, stops, -5).getHex()).toBe(0x000000);
    expect(sampleColorScale(THREE, stops, 5).getHex()).toBe(0xffffff);
  });

  it('does not require stops to be pre-sorted', () => {
    const unsorted: ColorScaleStop[] = [{ at: 1, color: 0xffffff }, { at: 0, color: 0x000000 }];
    expect(sampleColorScale(THREE, unsorted, 0).getHex()).toBe(0x000000);
    expect(sampleColorScale(THREE, unsorted, 1).getHex()).toBe(0xffffff);
  });

  it('handles more than two stops, picking the correct segment', () => {
    const three: ColorScaleStop[] = [
      { at: 0, color: 0xff0000 },
      { at: 0.5, color: 0x00ff00 },
      { at: 1, color: 0x0000ff },
    ];
    expect(sampleColorScale(THREE, three, 0.5).getHex()).toBe(0x00ff00);
    // Just past the midpoint should read closer to green than to blue.
    const past = sampleColorScale(THREE, three, 0.6);
    expect(past.g).toBeGreaterThan(past.b);
  });

  it('throws on an empty scale rather than silently returning black', () => {
    expect(() => sampleColorScale(THREE, [], 0.5)).toThrow();
  });
});

describe('severityColor', () => {
  it('reads green at 0, amber near the middle, red at 1 on the default scale', () => {
    const low = severityColor(THREE, 0);
    const high = severityColor(THREE, 1);
    expect(low.getHex()).toBe(SEVERITY_COLOR_SCALE[0]!.color);
    expect(high.getHex()).toBe(SEVERITY_COLOR_SCALE[2]!.color);
  });

  it('clamps out-of-range input', () => {
    expect(severityColor(THREE, -1).getHex()).toBe(severityColor(THREE, 0).getHex());
    expect(severityColor(THREE, 2).getHex()).toBe(severityColor(THREE, 1).getHex());
  });

  it('accepts a caller-supplied scale instead of the default', () => {
    const custom: ColorScaleStop[] = [{ at: 0, color: 0x0000ff }, { at: 1, color: 0xff0000 }];
    expect(severityColor(THREE, 0, custom).getHex()).toBe(0x0000ff);
    expect(severityColor(THREE, 1, custom).getHex()).toBe(0xff0000);
  });
});

describe('applyValueToEmissive', () => {
  it('sets emissive from the value, leaving base color untouched by default', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x123456 });
    applyValueToEmissive(material, THREE, 1);
    expect(material.emissive.getHex()).toBe(severityColor(THREE, 1).getHex());
    expect(material.color.getHex()).toBe(0x123456);
  });

  it('also overwrites base color when updateBaseColor is set', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x123456 });
    applyValueToEmissive(material, THREE, 1, { updateBaseColor: true });
    expect(material.color.getHex()).toBe(severityColor(THREE, 1).getHex());
  });

  it('leaves emissiveIntensity untouched when no intensity bounds are given', () => {
    const material = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.42 });
    applyValueToEmissive(material, THREE, 0.7);
    expect(material.emissiveIntensity).toBe(0.42);
  });

  it('lerps emissiveIntensity between minIntensity/maxIntensity when given', () => {
    const material = new THREE.MeshStandardMaterial();
    applyValueToEmissive(material, THREE, 0.5, { minIntensity: 0, maxIntensity: 2 });
    expect(material.emissiveIntensity).toBeCloseTo(1, 5);
  });

  it('clamps an out-of-range value before mapping', () => {
    const material = new THREE.MeshStandardMaterial();
    applyValueToEmissive(material, THREE, 5);
    expect(material.emissive.getHex()).toBe(severityColor(THREE, 1).getHex());
  });
});

describe('applyFractionToScale', () => {
  it('scales the y axis by default, leaving x/z untouched', () => {
    const object = new THREE.Object3D();
    object.scale.set(2, 2, 2);
    applyFractionToScale(object, 0.5);
    expect(object.scale.y).toBeCloseTo(0.5);
    expect(object.scale.x).toBe(2);
    expect(object.scale.z).toBe(2);
  });

  it('scales all three axes with axis: "xyz"', () => {
    const object = new THREE.Object3D();
    applyFractionToScale(object, 0.75, { axis: 'xyz' });
    expect(object.scale.x).toBeCloseTo(0.75);
    expect(object.scale.y).toBeCloseTo(0.75);
    expect(object.scale.z).toBeCloseTo(0.75);
  });

  it('maps fraction into [min, max] instead of [0, 1] when given', () => {
    const object = new THREE.Object3D();
    applyFractionToScale(object, 0, { min: 0.2, max: 1 });
    expect(object.scale.y).toBeCloseTo(0.2);
    applyFractionToScale(object, 1, { min: 0.2, max: 1 });
    expect(object.scale.y).toBeCloseTo(1);
  });

  it('clamps an out-of-range fraction before mapping', () => {
    const object = new THREE.Object3D();
    applyFractionToScale(object, 5);
    expect(object.scale.y).toBeCloseTo(1);
    applyFractionToScale(object, -5);
    expect(object.scale.y).toBeCloseTo(0);
  });
});

describe('AttentionPulse', () => {
  it('starts inactive with zero intensity', () => {
    const pulse = new AttentionPulse(1);
    expect(pulse.isActive).toBe(false);
    expect(pulse.update(0)).toBe(0);
  });

  it('jumps to full intensity on trigger, then decays to zero over its duration', () => {
    const pulse = new AttentionPulse(1);
    pulse.trigger();
    expect(pulse.update(0)).toBeCloseTo(1);
    expect(pulse.isActive).toBe(true);
    const mid = pulse.update(0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(pulse.update(0.6)).toBe(0);
    expect(pulse.isActive).toBe(false);
  });

  it('re-triggering while active restarts the clock instead of stacking', () => {
    const pulse = new AttentionPulse(1);
    pulse.trigger();
    pulse.update(0.9);
    pulse.trigger();
    expect(pulse.update(0)).toBeCloseTo(1);
  });

  it('decays faster than linear (ease-out), matching a sharp-attack/soft-fade flash', () => {
    const pulse = new AttentionPulse(1);
    pulse.trigger();
    const atQuarter = pulse.update(0.25);
    // Ease-out (1 - t^2): at t=0.25, intensity is 1 - 0.0625 = 0.9375 — well above the linear 0.75.
    expect(atQuarter).toBeGreaterThan(0.75);
  });
});
