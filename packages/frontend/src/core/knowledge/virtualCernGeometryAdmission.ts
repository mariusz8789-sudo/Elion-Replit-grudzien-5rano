import { canonicalJson, fnv1a } from '../events/hash';

/**
 * Admission contract for a future CERN geometry source artifact.
 *
 * This module never parses geometry, stores bytes, alters World State, or
 * authorizes rendering. A complete manifest can only become a pending source
 * candidate; a separate audited backend ingestion must hash and retain the
 * original bytes before any renderer can consume it.
 */
export const VIRTUAL_CERN_GEOMETRY_ADMISSION_VERSION = '1.0.0';

export type VirtualCernGeometryCoverage =
  | 'ACCELERATOR_COMPLEX'
  | 'LHC_RING'
  | 'DETECTOR_CAVERN'
  | 'EXPERIMENT_HALL'
  | 'SURFACE_SITE';

export type VirtualCernGeometryAdmissionStatus =
  | 'REJECTED_INCOMPLETE_PROVENANCE'
  | 'ACCEPTED_PENDING_FILE_VERIFICATION';

export interface VirtualCernGeometryArtifactDescriptor {
  mediaType: 'model/gltf-binary' | 'model/gltf+json' | 'application/geo+json' | 'application/vnd.autodesk.fbx' | 'application/octet-stream';
  sha256: string;
  byteLength: number;
  fileName: string;
}

export interface VirtualCernGeometrySourceCandidate {
  sourceTitle: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  publisher: string;
  coverage: VirtualCernGeometryCoverage;
  coverageStatement: string;
  crs: string;
  linearUnit: 'm' | 'mm';
  declaredHorizontalAccuracyMeters: number;
  declaredVerticalAccuracyMeters?: number;
  artifact: VirtualCernGeometryArtifactDescriptor;
  licenseId: string;
  licenseEvidenceUrl: string;
  commercialRenderingPermitted: boolean;
  accessVerifiedAt: string;
}

export interface VirtualCernGeometryAdmissionManifest {
  contractVersion: string;
  admissionId: string;
  status: VirtualCernGeometryAdmissionStatus;
  candidate: VirtualCernGeometrySourceCandidate;
  provenanceRequirements: readonly string[];
  fileVerificationRequired: readonly string[];
  rendererIntegration: 'BLOCKED_PENDING_FILE_VERIFICATION';
  limitation: string;
}

const SHA256 = /^[a-f0-9]{64}$/i;
const ALLOWED_MEDIA_TYPES = new Set<VirtualCernGeometryArtifactDescriptor['mediaType']>([
  'model/gltf-binary',
  'model/gltf+json',
  'application/geo+json',
  'application/vnd.autodesk.fbx',
  'application/octet-stream',
]);

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isDate(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function clean(value: string): string {
  return value.trim();
}

/** Returns human-reviewable gate failures; it does not infer absent rights or geometry metadata. */
export function validateVirtualCernGeometrySourceCandidate(
  candidate: VirtualCernGeometrySourceCandidate,
): readonly string[] {
  const failures: string[] = [];
  if (!clean(candidate.sourceTitle) || !clean(candidate.publisher) || !clean(candidate.coverageStatement)) {
    failures.push('source title, publisher and coverage statement are required');
  }
  if (!isHttpsUrl(candidate.sourceUrl) || !isHttpsUrl(candidate.licenseEvidenceUrl)) {
    failures.push('sourceUrl and licenseEvidenceUrl must be HTTPS URLs');
  }
  if (!isDate(candidate.sourcePublishedAt) || !isDate(candidate.accessVerifiedAt)) {
    failures.push('sourcePublishedAt and accessVerifiedAt must be explicit valid timestamps');
  }
  if (!clean(candidate.crs) || candidate.crs.toUpperCase() === 'UNKNOWN') {
    failures.push('declared CRS is required; UNKNOWN is not admissible');
  }
  if (!Number.isFinite(candidate.declaredHorizontalAccuracyMeters) || candidate.declaredHorizontalAccuracyMeters <= 0 || candidate.declaredHorizontalAccuracyMeters > 1) {
    failures.push('declared horizontal accuracy must be > 0 and ≤ 1 metre for a 1:1 geometry candidate');
  }
  if (candidate.declaredVerticalAccuracyMeters !== undefined && (!Number.isFinite(candidate.declaredVerticalAccuracyMeters) || candidate.declaredVerticalAccuracyMeters <= 0 || candidate.declaredVerticalAccuracyMeters > 1)) {
    failures.push('declared vertical accuracy, when supplied, must be > 0 and ≤ 1 metre');
  }
  if (!clean(candidate.licenseId) || !candidate.commercialRenderingPermitted) {
    failures.push('an explicit licence ID and commercial-rendering permission are required');
  }
  if (!ALLOWED_MEDIA_TYPES.has(candidate.artifact.mediaType) || !clean(candidate.artifact.fileName)) {
    failures.push('artifact requires an allowed media type and file name');
  }
  if (!SHA256.test(candidate.artifact.sha256)) {
    failures.push('artifact requires a SHA-256 hash');
  }
  if (!Number.isInteger(candidate.artifact.byteLength) || candidate.artifact.byteLength <= 0) {
    failures.push('artifact byteLength must be a positive integer');
  }
  return failures;
}

/**
 * Records a candidate only. Even a complete candidate remains blocked until the
 * original file is acquired by a separate source-artifact store, re-hashed, and
 * audited against the recorded descriptor.
 */
export function createVirtualCernGeometryAdmissionManifest(
  candidate: VirtualCernGeometrySourceCandidate,
): VirtualCernGeometryAdmissionManifest {
  const normalizedCandidate: VirtualCernGeometrySourceCandidate = {
    ...candidate,
    sourceTitle: clean(candidate.sourceTitle),
    publisher: clean(candidate.publisher),
    coverageStatement: clean(candidate.coverageStatement),
    crs: clean(candidate.crs),
    licenseId: clean(candidate.licenseId),
    artifact: {
      ...candidate.artifact,
      fileName: clean(candidate.artifact.fileName),
      sha256: candidate.artifact.sha256.toLowerCase(),
    },
  };
  const failures = validateVirtualCernGeometrySourceCandidate(normalizedCandidate);
  const status: VirtualCernGeometryAdmissionStatus = failures.length === 0
    ? 'ACCEPTED_PENDING_FILE_VERIFICATION'
    : 'REJECTED_INCOMPLETE_PROVENANCE';
  const seed = { contractVersion: VIRTUAL_CERN_GEOMETRY_ADMISSION_VERSION, status, candidate: normalizedCandidate, failures };
  return {
    contractVersion: VIRTUAL_CERN_GEOMETRY_ADMISSION_VERSION,
    admissionId: `virtual_cern_geometry_admission_${fnv1a(canonicalJson(seed))}`,
    status,
    candidate: normalizedCandidate,
    provenanceRequirements: [
      'official or rights-holder source URL',
      'source publication date and access verification date',
      'licence ID and evidence of commercial renderer permission',
      'declared CRS, linear unit and ≤1 m positional accuracy',
      'coverage statement',
      'original artifact SHA-256 and byte length',
    ],
    fileVerificationRequired: [
      'persist original bytes in the project source-artifact store',
      'recompute SHA-256 and compare with the admission descriptor',
      'verify content type, file size and source-scope metadata',
      'record RBAC-scoped artifact version before a renderer review',
    ],
    rendererIntegration: 'BLOCKED_PENDING_FILE_VERIFICATION',
    limitation: status === 'REJECTED_INCOMPLETE_PROVENANCE'
      ? `Candidate is not admissible: ${failures.join('; ')}.`
      : 'Candidate metadata is complete, but no original geometry bytes have been acquired and re-verified. Renderer integration remains prohibited.',
  };
}

/** A candidate manifest is never proof that renderer input is available. */
export function canRenderAdmittedVirtualCernGeometry(
  _manifest: VirtualCernGeometryAdmissionManifest,
): false {
  return false;
}
