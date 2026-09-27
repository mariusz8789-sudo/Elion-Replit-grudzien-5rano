import { describe, expect, it } from 'vitest';
import {
  canRenderAdmittedVirtualCernGeometry,
  createVirtualCernGeometryAdmissionManifest,
  validateVirtualCernGeometrySourceCandidate,
  type VirtualCernGeometrySourceCandidate,
} from '../core/knowledge/virtualCernGeometryAdmission';

const completeCandidate: VirtualCernGeometrySourceCandidate = {
  sourceTitle: 'Licensed CERN LHC ring engineering geometry',
  sourceUrl: 'https://example.cern.ch/geometry/lhc-ring-v1',
  sourcePublishedAt: '2026-08-22T00:00:00.000Z',
  publisher: 'CERN',
  coverage: 'LHC_RING',
  coverageStatement: 'Verified centreline, service tunnels and IP1/IP2/IP5/IP8 reference positions.',
  crs: 'EPSG:2056',
  linearUnit: 'm',
  declaredHorizontalAccuracyMeters: 0.25,
  declaredVerticalAccuracyMeters: 0.5,
  artifact: {
    mediaType: 'application/geo+json',
    sha256: 'a'.repeat(64),
    byteLength: 12_345,
    fileName: 'lhc-ring-v1.geojson',
  },
  licenseId: 'CERN-geometry-commercial-grant-2026',
  licenseEvidenceUrl: 'https://example.cern.ch/licenses/lhc-commercial-rendering',
  commercialRenderingPermitted: true,
  accessVerifiedAt: '2026-08-22T01:00:00.000Z',
};

describe('Virtual CERN Geometry Asset Admission', () => {
  it('rejects a source that lacks the essential 1:1 provenance gates', () => {
    const incomplete = {
      ...completeCandidate,
      crs: 'UNKNOWN',
      commercialRenderingPermitted: false,
      artifact: { ...completeCandidate.artifact, sha256: 'not-a-hash', byteLength: 0 },
    };
    const failures = validateVirtualCernGeometrySourceCandidate(incomplete);
    const manifest = createVirtualCernGeometryAdmissionManifest(incomplete);
    expect(failures.length).toBeGreaterThanOrEqual(3);
    expect(manifest.status).toBe('REJECTED_INCOMPLETE_PROVENANCE');
    expect(manifest.rendererIntegration).toBe('BLOCKED_PENDING_FILE_VERIFICATION');
    expect(canRenderAdmittedVirtualCernGeometry(manifest)).toBe(false);
  });

  it('accepts complete source metadata only as pending original-file verification', () => {
    const manifest = createVirtualCernGeometryAdmissionManifest(completeCandidate);
    expect(manifest.status).toBe('ACCEPTED_PENDING_FILE_VERIFICATION');
    expect(manifest.candidate.artifact.sha256).toBe('a'.repeat(64));
    expect(manifest.candidate.crs).toBe('EPSG:2056');
    expect(manifest.fileVerificationRequired).toContain('persist original bytes in the project source-artifact store');
    expect(manifest.rendererIntegration).toBe('BLOCKED_PENDING_FILE_VERIFICATION');
    expect(canRenderAdmittedVirtualCernGeometry(manifest)).toBe(false);
  });

  it('is deterministic for the same complete provenance record', () => {
    const first = createVirtualCernGeometryAdmissionManifest(completeCandidate);
    const second = createVirtualCernGeometryAdmissionManifest({ ...completeCandidate, artifact: { ...completeCandidate.artifact } });
    expect(second.admissionId).toBe(first.admissionId);
  });
});
