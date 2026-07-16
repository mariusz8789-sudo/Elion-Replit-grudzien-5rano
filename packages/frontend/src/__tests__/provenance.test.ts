/**
 * provenance (Stage 5) — every descriptor exposes honest provenance metadata, and the
 * analysis hash is reproducible (same molecule + same RDKit version → same hash) so a
 * second scientist can confirm the run. Report IDs are unique.
 */
import { describe, expect, it } from 'vitest';
import { descriptorProvenance, canonicalJSON, analysisHash, newReportId, PROVENANCE_KEYS, GROUNDING_VERSION } from '../core/provenance';

const CTX = { engineVersion: '2026.03.3', timestamp: 1_700_000_000_000 };

describe('descriptorProvenance', () => {
  it('returns provenance for every known descriptor and null for unknown', () => {
    for (const k of PROVENANCE_KEYS) {
      const p = descriptorProvenance(k, CTX);
      expect(p).toBeTruthy();
      expect(p!.engine).toBe('RDKit');
      expect(p!.engineVersion).toBe('2026.03.3');
      expect(p!.source).toMatch(/RDKit/);
      expect(['HIGH', 'MEDIUM', 'MODEL_ESTIMATE']).toContain(p!.confidence);
    }
    expect(descriptorProvenance('nope', CTX)).toBeNull();
  });

  it('classifies LogP as a MEDIUM-confidence empirical model', () => {
    const p = descriptorProvenance('logP', CTX)!;
    expect(p.confidence).toBe('MEDIUM');
    expect(p.confidenceNote).toMatch(/±0\.5/);
    expect(p.algorithm).toMatch(/Crippen/);
  });

  it('marks exact/topological descriptors as HIGH confidence and deterministic', () => {
    for (const k of ['molWt', 'tpsa', 'hbd', 'hba', 'inchiKey', 'molecularFormula']) {
      const p = descriptorProvenance(k, CTX)!;
      expect(p.confidence).toBe('HIGH');
      expect(p.reproducibility).toBe('DETERMINISTIC');
    }
  });
});

describe('canonicalJSON', () => {
  it('is key-order independent', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
    expect(canonicalJSON({ a: 1, b: { d: 4, c: 3 } })).toBe('{"a":1,"b":{"c":3,"d":4}}');
  });
});

describe('analysisHash', () => {
  const input = { canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', properties: { molWt: 180.16, logP: 1.31, lipinskiPass: true }, rdkitVersion: '2026.03.3' };

  it('produces a stable 64-char hex SHA-256 for identical input', async () => {
    const a = await analysisHash(input);
    const b = await analysisHash({ ...input });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the molecule or RDKit version changes', async () => {
    const base = await analysisHash(input);
    expect(await analysisHash({ ...input, rdkitVersion: '2025.09.1' })).not.toBe(base);
    expect(await analysisHash({ ...input, inchiKey: 'DIFFERENT-KEY' })).not.toBe(base);
  });
});

describe('newReportId', () => {
  it('is unique and well-formed', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newReportId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^GEN-\d{4}-[A-Z0-9]+-[A-F0-9]{6}$/);
  });
});

describe('GROUNDING_VERSION', () => {
  it('matches the server grounding contract version', () => {
    expect(GROUNDING_VERSION).toBe('genesis-grounding/1');
  });
});
