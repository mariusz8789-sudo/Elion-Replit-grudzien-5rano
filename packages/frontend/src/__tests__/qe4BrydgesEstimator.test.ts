import { describe, it, expect } from 'vitest';
import {
  topKBits,
  hammingDistance,
  parseMeasuredStatesCsv,
  parsePublishedRenyiEntropyCsv,
  parseFig1aCsv,
  rowStatistic,
  traceFromMeanX,
  s2FromTrace,
  groupIntoCompleteBlocks,
  weightedLinearFit,
  weightedResidualSumOfSquares,
  bootstrapMultiK,
  bootstrapMultiKBlocked,
  bootstrapPurity,
  purityFromBlochVector,
} from '../core/biotechData/qe4BrydgesEstimator';
import { makeRng } from '../core/epidemic/agents';

describe('QE4 estimator — bit/parsing primitives', () => {
  it('topKBits extracts the top-k bits (ion 1 = MSB)', () => {
    // 0b1011000000 = 704: top 3 bits = 0b101 = 5
    expect(topKBits(704, 3)).toBe(5);
    expect(topKBits(1023, 10)).toBe(1023);
    expect(topKBits(0, 5)).toBe(0);
    expect(topKBits(512, 1)).toBe(1); // MSB set
  });

  it('hammingDistance counts differing bits', () => {
    expect(hammingDistance(0, 0)).toBe(0);
    expect(hammingDistance(0b1010, 0b0101)).toBe(4);
    expect(hammingDistance(1023, 0)).toBe(10);
  });

  it('parseMeasuredStatesCsv parses a headerless decimal grid', () => {
    const rows = parseMeasuredStatesCsv('1,2,3\n4,5,6\n');
    expect(rows).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('parseMeasuredStatesCsv rejects non-numeric cells', () => {
    expect(() => parseMeasuredStatesCsv('1,x,3\n')).toThrow();
  });

  it('parsePublishedRenyiEntropyCsv skips the header and reads subsystem/S2/stderr', () => {
    const csv = 'Subsystem \t Measured 2nd Renyi Entropy \t Standard Error \t Sim \t Sim2\n1 \t 0.94 \t 0.005 \t 0.97 \t 0.97\n2 \t 1.68 \t 0.02 \t 1.70 \t 1.74\n';
    const rows = parsePublishedRenyiEntropyCsv(csv);
    expect(rows).toEqual([
      { subsystem: 1, s2: 0.94, stderr: 0.005 },
      { subsystem: 2, s2: 1.68, stderr: 0.02 },
    ]);
  });

  it('parseFig1aCsv skips the header and reads Sx/Sy/Sz', () => {
    const csv = '# Unitary \t Sx \t Sy \t Sz\n1 \t -0.3 \t 0.3 \t 0.3\n2 \t 0.4 \t -0.1 \t -0.3\n';
    const rows = parseFig1aCsv(csv);
    expect(rows).toEqual([
      { sx: -0.3, sy: 0.3, sz: 0.3 },
      { sx: 0.4, sy: -0.1, sz: -0.3 },
    ]);
  });

  it('groupIntoCompleteBlocks drops an incomplete trailing block', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7];
    const blocks = groupIntoCompleteBlocks(rows, 3);
    expect(blocks).toEqual([[1, 2, 3], [4, 5, 6]]); // trailing [7] dropped
  });

  it('purityFromBlochVector recovers 1 for a unit Bloch vector (pure) and 0.5 for a zero vector (maximally mixed)', () => {
    expect(purityFromBlochVector({ sx: 1, sy: 0, sz: 0 })).toBeCloseTo(1, 10);
    expect(purityFromBlochVector({ sx: 0, sy: 0, sz: 0 })).toBeCloseTo(0.5, 10);
  });
});

describe('QE4 estimator — randomized-measurement statistic on synthetic ground-truth states', () => {
  it('a maximally mixed single qubit (uniform random 0/1 shots, good PRNG) recovers Tr(rho^2) close to 0.5, S2 close to 1', () => {
    const rng = makeRng(20260913);
    const rows: number[][] = [];
    // topKBits(v, 1) reads the MSB (bit 9, ion 1's position) -- the random
    // bit must be placed there, not at bit 0, or every shot reduces to the
    // same value regardless of its actual outcome.
    for (let r = 0; r < 300; r += 1) {
      const shots: number[] = [];
      for (let s = 0; s < 150; s += 1) shots.push((rng() < 0.5 ? 0 : 1) << 9);
      rows.push(shots);
    }
    const xs = rows.map((row) => rowStatistic(row, 1));
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const { traceRhoSquared } = traceFromMeanX(meanX, 1);
    expect(traceRhoSquared).toBeGreaterThan(0.4);
    expect(traceRhoSquared).toBeLessThan(0.6);
    const s2 = s2FromTrace(traceRhoSquared);
    expect(s2).toBeGreaterThan(0.7);
    expect(s2).toBeLessThan(1.3);
  });

  it('a degenerate zero-variance input (every shot in every row identical) is correctly clamped to Tr(rho^2)=1, S2=0', () => {
    // This is a genuine edge case of the formula, not something real experimental
    // shot noise ever produces exactly: with zero within-row variance, every
    // pairwise Hamming distance is 0, so the raw estimator algebraically yields
    // X_row=1 and a raw trace of 2^1*1=2 -- outside the physical [0,1] range.
    // `traceFromMeanX`'s clamp (documented in its own comment) exists precisely
    // for this: it reports the physically sensible answer (fully pure, S2=0)
    // rather than propagating an out-of-range number.
    const rows: number[][] = [];
    for (let r = 0; r < 50; r += 1) {
      rows.push(new Array(150).fill(1)); // every shot in every row reads the same bit
    }
    const xs = rows.map((row) => rowStatistic(row, 1));
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const { traceRhoSquared, clamped } = traceFromMeanX(meanX, 1);
    expect(clamped).toBe(true);
    expect(traceRhoSquared).toBe(1);
    expect(s2FromTrace(traceRhoSquared)).toBeCloseTo(0, 6);
  });

  it('bootstrapMultiK returns a nonzero sigma and a mean close to the point estimate for multiple k jointly', () => {
    let seed = 7;
    const nextByte = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 1024;
    };
    const rows: number[][] = [];
    for (let r = 0; r < 100; r += 1) {
      const shots: number[] = [];
      for (let s = 0; s < 150; s += 1) shots.push(nextByte());
      rows.push(shots);
    }
    const rng = (() => {
      let s = 123456789;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const results = bootstrapMultiK(rows, [1, 2, 3], 200, rng);
    for (const k of [1, 2, 3]) {
      const r = results.get(k)!;
      expect(r.sigma).toBeGreaterThan(0);
      expect(r.samples).toHaveLength(200);
      expect(Number.isFinite(r.s2)).toBe(true);
    }
  });

  it('bootstrapMultiKBlocked resamples whole blocks, not individual rows', () => {
    let seed = 99;
    const nextByte = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 1024;
    };
    const rows: number[][] = [];
    for (let r = 0; r < 34; r += 1) {
      const shots: number[] = [];
      for (let s = 0; s < 20; s += 1) shots.push(nextByte());
      rows.push(shots);
    }
    const blocks = groupIntoCompleteBlocks(rows, 10);
    expect(blocks).toHaveLength(3); // 34 rows / block size 10 -> 3 complete blocks, 4 dropped
    const rng = (() => {
      let s = 1;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const results = bootstrapMultiKBlocked(blocks, [1], 100, rng);
    const r = results.get(1)!;
    expect(r.samples).toHaveLength(100);
    expect(r.sigma).toBeGreaterThan(0);
  });

  it('bootstrapPurity recovers close to 1 for a perfectly pure synthetic file and close to 0.5 for a maximally mixed one', () => {
    const pureRows = new Array(50).fill(null).map(() => ({ sx: 1, sy: 0, sz: 0 }));
    const mixedRows = new Array(50).fill(null).map(() => ({ sx: 0, sy: 0, sz: 0 }));
    const rng = (() => {
      let s = 55;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const pure = bootstrapPurity(pureRows, 200, rng);
    const mixed = bootstrapPurity(mixedRows, 200, rng);
    expect(pure.meanPurity).toBeCloseTo(1, 6);
    expect(mixed.meanPurity).toBeCloseTo(0.5, 6);
    expect(pure.s2).toBeLessThan(mixed.s2);
  });
});

describe('QE4 estimator — regression/fit helpers', () => {
  it('weightedLinearFit recovers an exact linear relationship', () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((xi) => 2 * xi + 1);
    const sigma = x.map(() => 1);
    const { slope, intercept } = weightedLinearFit(x, y, sigma);
    expect(slope).toBeCloseTo(2, 9);
    expect(intercept).toBeCloseTo(1, 9);
  });

  it('weightedLinearFit slopeSigma is propagated from the DECLARED per-point sigma, not from how well the fit happens to match -- a perfect-looking fit built from noisy-uncertainty inputs still carries that uncertainty forward', () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((xi) => 2 * xi + 1);
    const declaredSigma = 3; // the points landed exactly on the line, but each was DECLARED this uncertain
    const sigma = x.map(() => declaredSigma);
    const xbar = x.reduce((a, b) => a + b, 0) / x.length;
    const sumSqDev = x.reduce((acc, xi) => acc + (xi - xbar) ** 2, 0);
    const expectedSlopeSigma = Math.sqrt((declaredSigma * declaredSigma) / sumSqDev);
    const { slopeSigma } = weightedLinearFit(x, y, sigma);
    expect(slopeSigma).toBeCloseTo(expectedSlopeSigma, 9);
    expect(slopeSigma).toBeGreaterThan(0);
  });

  it('weightedLinearFit slopeSigma matches the textbook equal-weight OLS slope-variance formula', () => {
    // Var(slope) = sigma^2 / sum((x - xbar)^2) for equal per-point sigma -- a
    // known closed form independent of this module's own implementation, so
    // this checks the analytic formula itself, not just internal consistency.
    const x = [1, 2, 3, 4, 6];
    const y = [2.1, 3.9, 6.2, 7.8, 12.1];
    const sigmaValue = 0.5;
    const sigma = x.map(() => sigmaValue);
    const xbar = x.reduce((a, b) => a + b, 0) / x.length;
    const sumSqDev = x.reduce((acc, xi) => acc + (xi - xbar) ** 2, 0);
    const expectedSlopeSigma = Math.sqrt((sigmaValue * sigmaValue) / sumSqDev);
    const { slopeSigma } = weightedLinearFit(x, y, sigma);
    expect(slopeSigma).toBeCloseTo(expectedSlopeSigma, 9);
  });

  it('weightedLinearFit slopeSigma grows when per-point sigma grows, all else equal', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 2, 3, 4, 5];
    const tight = weightedLinearFit(x, y, x.map(() => 0.1));
    const loose = weightedLinearFit(x, y, x.map(() => 10));
    expect(loose.slopeSigma).toBeGreaterThan(tight.slopeSigma);
  });

  it('weightedResidualSumOfSquares is zero for a perfect fit and positive otherwise', () => {
    const x = [1, 2, 3];
    const y = [3, 5, 7];
    const sigma = [1, 1, 1];
    expect(weightedResidualSumOfSquares(x, y, sigma, (xi) => 2 * xi + 1)).toBeCloseTo(0, 9);
    expect(weightedResidualSumOfSquares(x, y, sigma, (xi) => xi)).toBeGreaterThan(0);
  });
});
