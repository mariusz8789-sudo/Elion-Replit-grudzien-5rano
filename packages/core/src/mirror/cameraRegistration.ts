import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';

export interface CameraDeviceIdentity {
  readonly deviceId: string;
  readonly label: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
}

export interface CameraIntrinsics {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fx: number;
  readonly fy: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CameraDistortion {
  readonly k1: number;
  readonly k2: number;
  readonly p1: number;
  readonly p2: number;
  readonly k3: number;
}

/** World-to-camera rigid transform. Rotation is row-major. */
export interface CameraExtrinsics {
  readonly rotation: readonly [number, number, number, number, number, number, number, number, number];
  readonly translationMeters: readonly [number, number, number];
  readonly worldFrameId: string;
  readonly cameraFrameId: string;
}

export interface CameraCalibrationArtifact {
  readonly calibrationId: string;
  readonly schemaVersion: 'genesis-camera-calibration/1';
  readonly calibrationVersion: string;
  readonly device: CameraDeviceIdentity;
  readonly intrinsics: CameraIntrinsics;
  readonly distortion: CameraDistortion;
  readonly extrinsics: CameraExtrinsics;
  readonly calibratedAt: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly source: 'PHYSICAL_CALIBRATION' | 'PINNED_REFERENCE_FIXTURE';
  readonly provenanceRef: string;
  readonly fingerprint: string;
}

export interface CalibrationCorrespondence {
  readonly pointId: string;
  readonly worldMeters: readonly [number, number, number];
  readonly measuredPixel: readonly [number, number];
}

export interface ReprojectionResidual {
  readonly pointId: string;
  readonly expectedPixel: readonly [number, number] | null;
  readonly measuredPixel: readonly [number, number];
  readonly errorPx: number | null;
}

export interface CameraRegistrationValidation {
  readonly status: 'VALID' | 'INVALID' | 'INSUFFICIENT_POINTS';
  readonly calibrationId: string;
  readonly frameId: string;
  readonly tolerancePx: number;
  readonly rmsErrorPx: number | null;
  readonly maxErrorPx: number | null;
  readonly confidence: number;
  readonly residuals: readonly ReprojectionResidual[];
  readonly physicalValidation: 'PASSED' | 'FAILED' | 'NOT_PERFORMED';
  readonly limitations: readonly string[];
  readonly fingerprint: string;
}

const finite = (value: number): boolean => Number.isFinite(value);

function unsignedCalibration(input: Omit<CameraCalibrationArtifact, 'fingerprint'>): Omit<CameraCalibrationArtifact, 'fingerprint'> {
  if (!input.calibrationId.trim() || !input.calibrationVersion.trim() || !input.device.deviceId.trim() || !input.provenanceRef.trim()) throw new Error('CALIBRATION_IDENTITY_REQUIRED');
  const { widthPx, heightPx, fx, fy, cx, cy } = input.intrinsics;
  if (![widthPx, heightPx, fx, fy, cx, cy].every(finite) || widthPx <= 0 || heightPx <= 0 || fx <= 0 || fy <= 0) throw new Error('INVALID_CAMERA_INTRINSICS');
  if (![...input.extrinsics.rotation, ...input.extrinsics.translationMeters].every(finite)) throw new Error('INVALID_CAMERA_EXTRINSICS');
  if (!Object.values(input.distortion).every(finite)) throw new Error('INVALID_CAMERA_DISTORTION');
  const validFrom = Date.parse(input.validFrom);
  const validUntil = input.validUntil === null ? null : Date.parse(input.validUntil);
  if (!Number.isFinite(validFrom) || (validUntil !== null && (!Number.isFinite(validUntil) || validUntil < validFrom))) throw new Error('INVALID_CALIBRATION_VALIDITY');
  return input;
}

export function createCameraCalibrationArtifact(input: Omit<CameraCalibrationArtifact, 'fingerprint'>): CameraCalibrationArtifact {
  const unsigned = unsignedCalibration(input);
  return Object.freeze({ ...unsigned, fingerprint: sha256hex(stableStringify(unsigned)) });
}

export function verifyCameraCalibrationArtifact(artifact: CameraCalibrationArtifact, atIso: string): Readonly<{ valid: boolean; reasons: readonly string[] }> {
  const reasons: string[] = [];
  try { unsignedCalibration(artifact); } catch (error) { reasons.push(error instanceof Error ? error.message : 'INVALID_CALIBRATION'); }
  const { fingerprint: _fingerprint, ...unsigned } = artifact;
  if (sha256hex(stableStringify(unsigned)) !== artifact.fingerprint) reasons.push('CALIBRATION_FINGERPRINT_MISMATCH');
  const at = Date.parse(atIso);
  if (!Number.isFinite(at)) reasons.push('INVALID_VALIDATION_TIME');
  else {
    if (at < Date.parse(artifact.validFrom)) reasons.push('CALIBRATION_NOT_YET_VALID');
    if (artifact.validUntil !== null && at > Date.parse(artifact.validUntil)) reasons.push('CALIBRATION_EXPIRED');
  }
  return Object.freeze({ valid: reasons.length === 0, reasons });
}

export function projectWorldPoint(artifact: CameraCalibrationArtifact, point: readonly [number, number, number]): readonly [number, number] | null {
  const r = artifact.extrinsics.rotation;
  const t = artifact.extrinsics.translationMeters;
  const x = r[0] * point[0] + r[1] * point[1] + r[2] * point[2] + t[0];
  const y = r[3] * point[0] + r[4] * point[1] + r[5] * point[2] + t[1];
  const z = r[6] * point[0] + r[7] * point[1] + r[8] * point[2] + t[2];
  if (!finite(z) || z <= 0) return null;
  const xn = x / z;
  const yn = y / z;
  const radius2 = xn * xn + yn * yn;
  const { k1, k2, k3, p1, p2 } = artifact.distortion;
  const radial = 1 + k1 * radius2 + k2 * radius2 * radius2 + k3 * radius2 * radius2 * radius2;
  const xd = xn * radial + 2 * p1 * xn * yn + p2 * (radius2 + 2 * xn * xn);
  const yd = yn * radial + p1 * (radius2 + 2 * yn * yn) + 2 * p2 * xn * yn;
  return Object.freeze([artifact.intrinsics.fx * xd + artifact.intrinsics.cx, artifact.intrinsics.fy * yd + artifact.intrinsics.cy]);
}

export function validateCameraRegistration(input: {
  readonly artifact: CameraCalibrationArtifact;
  readonly frameId: string;
  readonly correspondences: readonly CalibrationCorrespondence[];
  readonly tolerancePx: number;
  readonly validatedAt: string;
}): CameraRegistrationValidation {
  if (!input.frameId.trim() || !finite(input.tolerancePx) || input.tolerancePx <= 0) throw new Error('INVALID_REGISTRATION_VALIDATION_INPUT');
  const artifactValidity = verifyCameraCalibrationArtifact(input.artifact, input.validatedAt);
  const residuals = input.correspondences.map((correspondence): ReprojectionResidual => {
    const expectedPixel = projectWorldPoint(input.artifact, correspondence.worldMeters);
    if (expectedPixel === null) return Object.freeze({ pointId: correspondence.pointId, expectedPixel: null, measuredPixel: correspondence.measuredPixel, errorPx: null });
    const errorPx = Math.hypot(expectedPixel[0] - correspondence.measuredPixel[0], expectedPixel[1] - correspondence.measuredPixel[1]);
    return Object.freeze({ pointId: correspondence.pointId, expectedPixel, measuredPixel: correspondence.measuredPixel, errorPx });
  });
  const finiteErrors = residuals.flatMap((residual) => residual.errorPx === null || !finite(residual.errorPx) ? [] : [residual.errorPx]);
  const enough = input.correspondences.length >= 4 && finiteErrors.length === input.correspondences.length;
  const rmsErrorPx = finiteErrors.length === 0 ? null : Math.sqrt(finiteErrors.reduce((sum, value) => sum + value * value, 0) / finiteErrors.length);
  const maxErrorPx = finiteErrors.length === 0 ? null : Math.max(...finiteErrors);
  const status = !enough ? 'INSUFFICIENT_POINTS' : artifactValidity.valid && rmsErrorPx !== null && rmsErrorPx <= input.tolerancePx ? 'VALID' : 'INVALID';
  const confidence = status === 'VALID' && rmsErrorPx !== null ? Math.max(0, Math.min(1, 1 - rmsErrorPx / input.tolerancePx)) : 0;
  const physicalValidation = input.artifact.source === 'PHYSICAL_CALIBRATION' ? (status === 'VALID' ? 'PASSED' : 'FAILED') : 'NOT_PERFORMED';
  const limitations = [
    ...artifactValidity.reasons,
    ...(enough ? [] : ['At least four visible, finite reference correspondences are required.']),
    ...(input.artifact.source === 'PINNED_REFERENCE_FIXTURE' ? ['Deterministic fixture validation is not physical-camera validation.'] : []),
  ];
  const unsigned = { status, calibrationId: input.artifact.calibrationId, frameId: input.frameId, tolerancePx: input.tolerancePx, rmsErrorPx, maxErrorPx, confidence, residuals, physicalValidation, limitations } as const;
  return Object.freeze({ ...unsigned, fingerprint: sha256hex(stableStringify(unsigned)) });
}
