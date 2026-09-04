import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixtureDir = fileURLToPath(new URL('../../../../docs/evidence/usgs/', import.meta.url));
const rawPath = resolve(fixtureDir, 'USGS-01646500-00060-2026-08-20.json');
const metadataPath = resolve(fixtureDir, 'USGS-01646500-monitoring-location.json');
const normalizedPath = resolve(fixtureDir, 'USGS-01646500-00060-normalized-observation.json');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const read = (path: string) => readFileSync(path, 'utf8');

function replayFingerprint(rawText: string, metadataText: string, normalizedText: string) {
  const normalized = JSON.parse(normalizedText) as {
    source: Record<string, unknown>;
    observations: unknown[];
    provenance: Record<string, unknown>;
  };
  return sha256(JSON.stringify({
    rawPayloadSha256: sha256(rawText),
    metadataSha256: sha256(metadataText),
    source: { ...normalized.source, rawPayloadSha256: undefined, metadataSha256: undefined },
    observations: normalized.observations,
    transformId: normalized.provenance.transformId,
    transformVersion: normalized.provenance.transformVersion,
  }));
}

describe('USGS contract-only observation fixture', () => {
  it('preserves a real station, series, units, timestamps and quality fields', () => {
    const raw = JSON.parse(read(rawPath)) as {
      features: Array<{ properties: Record<string, string | null> }>;
    };
    const normalized = JSON.parse(read(normalizedPath)) as {
      observationStatus: string;
      source: Record<string, unknown>;
      observations: Array<Record<string, unknown>>;
      provenance: Record<string, unknown>;
    };

    expect(normalized.observationStatus).toBe('PUBLIC_REAL_DATA');
    expect(normalized.source.monitoringLocationId).toBe('USGS-01646500');
    expect(normalized.source.parameterCode).toBe('00060');
    expect(normalized.source.sourceUnit).toBe('ft^3/s');
    expect(normalized.source.normalizedUnit).toBe('m^3/s');
    expect(normalized.source.approvalStatus).toBe('Provisional');
    expect(raw.features).toHaveLength(10);
    expect(raw.features.every((feature) => feature.properties.monitoring_location_id === 'USGS-01646500')).toBe(true);
    expect(raw.features.every((feature) => feature.properties.parameter_code === '00060')).toBe(true);
    expect(raw.features.every((feature) => feature.properties.unit_of_measure === 'ft^3/s')).toBe(true);
    expect(raw.features.every((feature) => feature.properties.time)).toBe(true);
    expect(normalized.observations[0].time).toBe('2026-08-20T00:00:00+00:00');
    expect(normalized.observations.at(-1)?.time).toBe('2026-08-20T00:45:00+00:00');
    expect(normalized.provenance.replayInput).toContain('Pinned raw payload only');
  });

  it('replays deterministically from pinned files and never needs a network fetch', () => {
    const raw = read(rawPath);
    const metadata = read(metadataPath);
    const normalized = read(normalizedPath);
    const normalizedAgain = read(normalizedPath);

    expect(sha256(raw)).toBe('df142e9ebbee2c82d73ae2f1b0c3fd749e6d9f74336f8bc1b1d616bc0e51776f');
    expect(sha256(metadata)).toBe('252094dd79c6527e3ea14cde454a82cf27d9d78f7426f2e74570348f9a95b034');
    expect(replayFingerprint(raw, metadata, normalized)).toBe(replayFingerprint(raw, metadata, normalizedAgain));
  });

  it.each([
    ['payload', (value: string) => value.replace('"value": "2850"', '"value": "2851"')],
    ['station', (value: string) => value.replaceAll('USGS-01646500', 'USGS-01646501')],
    ['unit', (value: string) => value.replaceAll('ft^3/s', 'm^3/s')],
    ['time range', (value: string) => value.replace('2026-08-20T00:45:00+00:00', '2026-08-21T00:45:00+00:00')],
    ['transform version', (value: string) => value.replace('"transformVersion": "1.0.0"', '"transformVersion": "1.0.1"')],
  ])('detects tampered %s as replay drift', (_label, mutate) => {
    const original = read(normalizedPath);
    const originalRaw = read(rawPath);
    const originalMetadata = read(metadataPath);
    const mutatedRaw = _label === 'payload' ? mutate(originalRaw) : originalRaw;
    const mutatedNormalized = _label === 'payload' ? original : mutate(original);
    expect(replayFingerprint(mutatedRaw, originalMetadata, mutatedNormalized)).not.toBe(
      replayFingerprint(originalRaw, originalMetadata, original),
    );
  });

  it('does not claim model compatibility when observation is only an exogenous flow input', () => {
    const normalized = JSON.parse(read(normalizedPath)) as { provenance: Record<string, unknown> };
    expect(normalized.provenance.genesisModelComparisonStatus).toBe('VERIFY_REQUIRED');
    expect(normalized.provenance.genesisModelComparisonReason).toContain('does not predict stream discharge');
  });
});
