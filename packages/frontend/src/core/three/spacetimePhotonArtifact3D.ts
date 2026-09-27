import type * as THREE_NS from 'three';
import type { SpacetimePhotonReport } from '@genesis/core/flagship/spacetimePhoton.js';

const PATH_SAMPLES = 48;

function pathPoints(THREE: typeof THREE_NS, bend: number): THREE_NS.Vector3[] {
  return Array.from({ length: PATH_SAMPLES }, (_, index) => {
    const t = index / (PATH_SAMPLES - 1);
    const x = -1.32 + t * 2.64;
    // The endpoints are shared with the flat baseline. The solver's signed
    // deflection controls the direction and magnitude of the displayed bow.
    const y = 1.58 + bend * Math.sin(Math.PI * t);
    return new THREE.Vector3(x, y, -0.34);
  });
}

/**
 * Presentation adapter for the canonical weak-field photon report.
 * Geometry is driven only by the sealed solver output. The angular difference
 * is amplified so an arcsecond-scale result is visible at room scale; raw
 * values and the amplification disclosure stay attached to the object graph.
 */
export function createSpacetimePhotonArtifact3D(
  THREE: typeof THREE_NS,
  report: SpacetimePhotonReport,
): THREE_NS.Group {
  const root = new THREE.Group();
  root.name = 'artifact:spacetime';

  const signedBend = Math.sign(report.deflectionRad) * Math.min(0.52, Math.abs(report.deflectionArcsec) * 0.24);
  const trustworthy = report.regime === 'WEAK_FIELD';
  root.userData = {
    canonicalModel: 'spacetime-photon-model',
    contentHash: report.contentHash,
    epistemicStatus: report.label,
    regime: report.regime,
    shapiroDelayS: report.shapiroDelayS,
    deflectionArcsec: report.deflectionArcsec,
    curvatureProxy: report.curvatureProxy,
    visualEncoding: 'AMPLIFIED_ANGULAR_DEFLECTION',
    displayBendMeters: signedBend,
    presentationTimeOnly: true,
  };

  const baselinePoints = pathPoints(THREE, 0);
  const modelPoints = pathPoints(THREE, signedBend);
  const baseline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(baselinePoints),
    new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.48 }),
  );
  baseline.name = 'spacetime-flat-baseline';
  baseline.userData.model = 'MASS_ZERO_BASELINE';
  root.add(baseline);

  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(modelPoints),
    new THREE.LineBasicMaterial({ color: trustworthy ? 0x7dd3fc : 0xff9a3c, transparent: true, opacity: 0.96 }),
  );
  ray.name = 'spacetime-solver-ray';
  ray.userData.sourceValue = report.deflectionArcsec;
  ray.userData.unit = 'arcsec';
  root.add(ray);

  const bodyScale = 0.16 + Math.min(0.13, Math.sqrt(Math.max(0, report.curvatureProxy)) * 45);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(bodyScale, 24, 18),
    new THREE.MeshStandardMaterial({
      color: 0x05070c,
      emissive: trustworthy ? 0x2563eb : 0x9a3412,
      emissiveIntensity: 0.55,
      metalness: 0.72,
      roughness: 0.2,
    }),
  );
  body.name = 'spacetime-lensing-mass-model';
  body.position.set(0, 1.23, -0.36);
  body.userData.visualScale = 'NOT_TO_SCALE';
  body.userData.schwarzschildRadiusM = report.schwarzschildRadiusM;
  root.add(body);

  const lensRing = new THREE.Mesh(
    new THREE.TorusGeometry(bodyScale * 1.65, 0.012, 8, 48),
    new THREE.MeshBasicMaterial({ color: trustworthy ? 0x38bdf8 : 0xff9a3c, transparent: true, opacity: 0.62 }),
  );
  lensRing.name = 'spacetime-curvature-indicator';
  lensRing.position.copy(body.position);
  lensRing.userData.visualScale = 'CURVATURE_PROXY_NORMALIZED_FOR_DISPLAY';
  root.add(lensRing);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7dd3fc, emissiveIntensity: 2.4 }),
  );
  marker.name = 'spacetime-photon-marker';
  marker.position.copy(modelPoints[0]);
  marker.userData.motion = 'PRESENTATION_PATH_POSITION_NOT_REALTIME_TELEMETRY';
  root.add(marker);

  return root;
}

/** Moves the presentation marker along the already-computed solver path. */
export function updateSpacetimePhotonArtifact3D(root: THREE_NS.Group, elapsedSeconds: number): void {
  const marker = root.getObjectByName('spacetime-photon-marker');
  if (!marker) return;
  const bend = typeof root.userData.displayBendMeters === 'number' ? root.userData.displayBendMeters : 0;
  const t = (elapsedSeconds * 0.18) % 1;
  marker.position.set(-1.32 + t * 2.64, 1.58 + bend * Math.sin(Math.PI * t), -0.34);
}
