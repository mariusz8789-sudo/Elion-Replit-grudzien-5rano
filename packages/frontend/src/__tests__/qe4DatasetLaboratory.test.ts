import { describe, expect, it } from 'vitest';
import { QE4_DATASET_LABORATORY } from '../core/biotechData/qe4DatasetLaboratory';
import { runQe4BrydgesAnalysis } from '../core/biotechData/qe4BrydgesAnalysis';
import { QE4_EVIDENCE_CASE_ID } from '../core/biotechData/qe4EvidenceCase';

/**
 * P0.1 (Discovery Engine seam) — this laboratory must NEVER compute S2 itself.
 * Every test here proves pure delegation to `qe4BrydgesAnalysis.ts`'s already-
 * verified `runQe4BrydgesAnalysis()`, not a second, parallel computation that
 * could silently drift from it.
 */
/**
 * COMPUTED ONCE FOR THE WHOLE FILE, deliberately.
 *
 * `runQe4BrydgesAnalysis()` is a deterministic pure function over a pinned
 * dataset (its own module doc, and `qe4DatasetLaboratory.ts` itself caches it
 * at module level for exactly this reason). Calling it fresh inside five
 * separate `it()` blocks cost ~2s EACH and pushed the heaviest test to 3677ms
 * against vitest's default 5000ms timeout — a 1.36x margin on an idle machine,
 * which is how this file timed out for real under CPU contention. Hoisting
 * changes no assertion: every test still compares the laboratory's output
 * against the analysis's output, exactly as before.
 */
const ANALYSIS = runQe4BrydgesAnalysis();

describe('qe4DatasetLaboratory — DatasetLaboratory contract over the pinned QE4 dataset', () => {
  it('declares its labId as the same identity qe4EvidenceCase.ts already uses', () => {
    expect(QE4_DATASET_LABORATORY.labId).toBe(QE4_EVIDENCE_CASE_ID);
  });

  it('observableSpec() enumerates exactly the real (dataset,T,k) grid the analysis already computed — clean and disorder both', () => {
    const analysis = ANALYSIS;
    const spec = QE4_DATASET_LABORATORY.observableSpec();
    expect(spec).toHaveLength(analysis.cleanPoints.length + analysis.disorderPoints.length);
    for (const p of analysis.cleanPoints) {
      expect(spec.some((s) => s.pointId === `clean:T=${p.t}:k=${p.k}`)).toBe(true);
    }
    for (const p of analysis.disorderPoints) {
      expect(spec.some((s) => s.pointId === `disorder:T=${p.t}:k=${p.k}`)).toBe(true);
    }
  });

  it('run() for a real clean point returns exactly the s2/sigma qe4BrydgesAnalysis.ts already computed for it, never recomputed independently', () => {
    const analysis = ANALYSIS;
    const point = analysis.cleanPoints.find((p) => p.t === 5 && p.k === 5)!;
    const result = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' });
    expect(result.status).toBe('completed');
    expect(result.observation).not.toBeNull();
    expect(result.observation!.value).toBe(point.s2);
    expect(result.observation!.uncertainty).toBe(point.sigma);
    expect(result.observation!.metric).toBe('s2');
  });

  it('run() for a real disorder point returns exactly the analysis-computed value', () => {
    const analysis = ANALYSIS;
    const point = analysis.disorderPoints.find((p) => p.t === 10 && p.k === 5)!;
    const result = QE4_DATASET_LABORATORY.run({ pointId: 'disorder:T=10:k=5' });
    expect(result.status).toBe('completed');
    expect(result.observation!.value).toBe(point.s2);
    expect(result.observation!.uncertainty).toBe(point.sigma);
  });

  it('rejects an undeclared point honestly — no fabricated observation, a stated reason', () => {
    const result = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=999:k=999' });
    expect(result.status).toBe('rejected');
    expect(result.observation).toBeNull();
    expect(result.rejectedReason).not.toBeNull();
    expect(result.rejectedReason).toContain('clean:T=999:k=999');
  });

  it('carries the same dataset provenance (DOI, license, archive checksum) qe4EvidenceCase.ts already carries', () => {
    const analysis = ANALYSIS;
    const result = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' });
    expect(result.provenance.archiveSha256).toBe(analysis.provenance.archiveSha256);
    expect(result.provenance.license).toBe(analysis.provenance.datasetLicense);
    expect(result.provenance.sourceVersion).toContain(analysis.provenance.datasetDoi);
  });

  it('reports the real literal bootstrap seed the analysis actually used, and ignores a caller-supplied seed rather than fabricating seeded behavior it does not have', () => {
    const analysis = ANALYSIS;
    const withoutSeed = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' });
    const withSeed = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' }, 12345);
    expect(withoutSeed.replay.seed).toBe(analysis.provenance.bootstrapSeed);
    expect(withSeed.replay.seed).toBe(analysis.provenance.bootstrapSeed);
    expect(withSeed.observation!.value).toBe(withoutSeed.observation!.value);
  });

  it('is fingerprint-deterministic: same point, same run, same fingerprint; a different point changes it', () => {
    const a = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' });
    const b = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' });
    const c = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=4:k=5' });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });

  it('contractVersion is stamped on every result', () => {
    const result = QE4_DATASET_LABORATORY.run({ pointId: 'clean:T=5:k=5' });
    expect(result.contractVersion).toBe('1.0.0');
  });
});
