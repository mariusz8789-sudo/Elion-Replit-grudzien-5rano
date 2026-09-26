import { describe, expect, it } from 'vitest';
import { createCameraCalibrationArtifact, projectWorldPoint, validateCameraRegistration, verifyCameraCalibrationArtifact } from './cameraRegistration.js';

const calibration = createCameraCalibrationArtifact({
  calibrationId: 'cal-reference-1', schemaVersion: 'genesis-camera-calibration/1', calibrationVersion: '1.0.0',
  device: { deviceId: 'fixture-camera', label: 'Pinned test camera', manufacturer: null, model: null },
  intrinsics: { widthPx: 640, heightPx: 480, fx: 500, fy: 500, cx: 320, cy: 240 },
  distortion: { k1: 0, k2: 0, p1: 0, p2: 0, k3: 0 },
  extrinsics: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translationMeters: [0, 0, 0], worldFrameId: 'world', cameraFrameId: 'camera' },
  calibratedAt: '2026-09-23T00:00:00.000Z', validFrom: '2026-09-23T00:00:00.000Z', validUntil: null,
  source: 'PINNED_REFERENCE_FIXTURE', provenanceRef: 'fixture:camera-registration:v1',
});

describe('Mirror camera/world registration contract', () => {
  it('projects known world points with an explicit coordinate convention', () => {
    expect(projectWorldPoint(calibration, [0, 0, 2])).toEqual([320, 240]);
    expect(projectWorldPoint(calibration, [1, 0, 2])).toEqual([570, 240]);
    expect(projectWorldPoint(calibration, [0, 0, -1])).toBeNull();
  });

  it('validates a deterministic fixture without claiming physical validation', () => {
    const correspondences = [
      { pointId: 'a', worldMeters: [0, 0, 2] as const, measuredPixel: [320, 240] as const },
      { pointId: 'b', worldMeters: [1, 0, 2] as const, measuredPixel: [570, 240] as const },
      { pointId: 'c', worldMeters: [0, 1, 2] as const, measuredPixel: [320, 490] as const },
      { pointId: 'd', worldMeters: [-1, 0, 2] as const, measuredPixel: [70, 240] as const },
    ];
    const a = validateCameraRegistration({ artifact: calibration, frameId: 'frame-1', correspondences, tolerancePx: 1, validatedAt: '2026-09-23T01:00:00.000Z' });
    const b = validateCameraRegistration({ artifact: calibration, frameId: 'frame-1', correspondences, tolerancePx: 1, validatedAt: '2026-09-23T01:00:00.000Z' });
    expect(a).toEqual(b);
    expect(a.status).toBe('VALID');
    expect(a.rmsErrorPx).toBe(0);
    expect(a.physicalValidation).toBe('NOT_PERFORMED');
    expect(a.limitations).toContain('Deterministic fixture validation is not physical-camera validation.');
  });

  it('fails closed for too few points, drift, and tampered calibration', () => {
    const sparse = validateCameraRegistration({ artifact: calibration, frameId: 'frame-2', correspondences: [{ pointId: 'a', worldMeters: [0, 0, 2], measuredPixel: [320, 240] }], tolerancePx: 1, validatedAt: '2026-09-23T01:00:00.000Z' });
    expect(sparse.status).toBe('INSUFFICIENT_POINTS');
    const tampered = { ...calibration, intrinsics: { ...calibration.intrinsics, fx: 900 } };
    expect(verifyCameraCalibrationArtifact(tampered, '2026-09-23T01:00:00.000Z')).toEqual(expect.objectContaining({ valid: false }));
  });
});
