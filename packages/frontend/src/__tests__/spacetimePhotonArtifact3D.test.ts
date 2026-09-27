import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { spacetimePhoton } from '@genesis/core/flagship/spacetimePhoton.js';
import { createSpacetimePhotonArtifact3D, updateSpacetimePhotonArtifact3D } from '../core/three/spacetimePhotonArtifact3D';

function yValues(object: THREE.Object3D): number[] {
  const line = object as THREE.Line<THREE.BufferGeometry>;
  const positions = line.geometry.getAttribute('position');
  return Array.from({ length: positions.count }, (_, index) => positions.getY(index));
}

describe('spacetime photon laboratory artifact', () => {
  it('maps the canonical weak-field result into a visible ray and preserves raw provenance', () => {
    const report = spacetimePhoton({ massKg: 1.989e30, impactParameterM: 6.957e8, emitterDistanceM: 1.496e11, receiverDistanceM: 1.496e11 });
    const root = createSpacetimePhotonArtifact3D(THREE, report);
    const ray = root.getObjectByName('spacetime-solver-ray')!;
    const baseline = root.getObjectByName('spacetime-flat-baseline')!;

    expect(root.userData.canonicalModel).toBe('spacetime-photon-model');
    expect(root.userData.contentHash).toBe(report.contentHash);
    expect(root.userData.deflectionArcsec).toBe(report.deflectionArcsec);
    expect(root.userData.shapiroDelayS).toBe(report.shapiroDelayS);
    expect(root.userData.visualEncoding).toBe('AMPLIFIED_ANGULAR_DEFLECTION');
    expect(Math.max(...yValues(ray))).toBeGreaterThan(Math.max(...yValues(baseline)));
  });

  it('renders a mass-zero report as the flat baseline instead of inventing curvature', () => {
    const report = spacetimePhoton({ massKg: 0, impactParameterM: 6.957e8, emitterDistanceM: 1.496e11, receiverDistanceM: 1.496e11 });
    const root = createSpacetimePhotonArtifact3D(THREE, report);
    expect(root.userData.displayBendMeters).toBe(0);
    expect(yValues(root.getObjectByName('spacetime-solver-ray')!)).toEqual(yValues(root.getObjectByName('spacetime-flat-baseline')!));
  });

  it('moves only a disclosed presentation marker on the solver-defined path', () => {
    const report = spacetimePhoton({ massKg: 1.989e30, impactParameterM: 6.957e8, emitterDistanceM: 1.496e11, receiverDistanceM: 1.496e11 });
    const root = createSpacetimePhotonArtifact3D(THREE, report);
    const marker = root.getObjectByName('spacetime-photon-marker')!;
    const before = marker.position.clone();
    updateSpacetimePhotonArtifact3D(root, 2);
    expect(marker.position.equals(before)).toBe(false);
    expect(marker.userData.motion).toBe('PRESENTATION_PATH_POSITION_NOT_REALTIME_TELEMETRY');
  });
});
