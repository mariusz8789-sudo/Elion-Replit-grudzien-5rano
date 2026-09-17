import { describe, expect, it } from 'vitest';
import type { ModelPoint, ModelSpec } from '../core/agent/modelSpace';
import {
  freezeBeforeReplication,
  runReplication,
  detectDatasetOverlap,
  assertFreezePrecedesDataset,
  datasetFingerprint,
  type ReplicationDataset,
} from '../core/agent/discoveryReplicationEngine';

const LINEAR_SPEC: ModelSpec = { id: 'test', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }], lineage: null };

function linearPoints(xs: readonly number[], slope: number, intercept: number, sigma: number, noiseSeed = 1): ModelPoint[] {
  // Deterministic pseudo-noise (no Math.random) so the fixture is reproducible.
  let state = noiseSeed;
  const noise = () => {
    state = (state * 48271) % 2147483647;
    return ((state / 2147483647) - 0.5) * 2 * sigma;
  };
  return xs.map((x) => ({ x, y: intercept + slope * x + noise(), sigma }));
}

function pureNoisePoints(xs: readonly number[], sigma: number, noiseSeed = 7): ModelPoint[] {
  let state = noiseSeed;
  const noise = () => {
    state = (state * 48271) % 2147483647;
    return ((state / 2147483647) - 0.5) * 2 * sigma;
  };
  return xs.map((x) => ({ x, y: noise() * 10, sigma }));
}

describe('freezeBeforeReplication — step 1, must precede any replication-data read', () => {
  it('produces a deterministic fingerprint for the same hypothesis + prediction', () => {
    const a = freezeBeforeReplication(LINEAR_SPEC, 3.0);
    const b = freezeBeforeReplication(LINEAR_SPEC, 3.0);
    expect(a.hypothesisFingerprint).toBe(b.hypothesisFingerprint);
    expect(a.predictionFingerprint).toBe(b.predictionFingerprint);
  });

  it('a different predicted effect produces a different prediction fingerprint', () => {
    const a = freezeBeforeReplication(LINEAR_SPEC, 3.0);
    const b = freezeBeforeReplication(LINEAR_SPEC, 5.0);
    expect(a.predictionFingerprint).not.toBe(b.predictionFingerprint);
  });
});

describe('AC5 — replication on the identical dataset is refused', () => {
  it('runReplication throws when discovery and replication datasets are byte-identical', () => {
    const points = linearPoints([1, 2, 3, 4, 5], 3, 2, 0.05);
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'same', points, disjointnessProof: 'HELD_OUT_SPLIT', retrievedAt: freeze.frozenAt + 1000 };
    expect(() =>
      runReplication({ freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'same', points }, replicationDataset: dataset }),
    ).toThrow(/disjoint/i);
  });
});

describe('AC6 — a replication dataset contaminated with the discovery\'s own points is refused', () => {
  it('detectDatasetOverlap finds the shared point(s)', () => {
    const discoveryPoints = linearPoints([1, 2, 3, 4, 5], 3, 2, 0.05);
    const replicationPoints = [...linearPoints([11, 12, 13], 3, 2, 0.05, 99), discoveryPoints[0]!];
    const overlap = detectDatasetOverlap(discoveryPoints, replicationPoints);
    expect(overlap.overlapCount).toBe(1);
  });

  it('runReplication refuses when overlap is present, even with different dataset ids and different overall fingerprints', () => {
    const discoveryPoints = linearPoints([1, 2, 3, 4, 5], 3, 2, 0.05);
    const replicationPoints = [...linearPoints([11, 12, 13, 14, 15], 3, 2, 0.05, 99), discoveryPoints[2]!];
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'replication-contaminated', points: replicationPoints, disjointnessProof: 'DIFFERENT_TIME_WINDOW', retrievedAt: freeze.frozenAt + 1000 };
    expect(datasetFingerprint(dataset)).not.toBe(datasetFingerprint({ datasetId: 'discovery', points: discoveryPoints }));
    expect(() =>
      runReplication({ freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'discovery', points: discoveryPoints }, replicationDataset: dataset }),
    ).toThrow(/contamination/i);
  });
});

describe('AC7 — a hypothesis "frozen" after the replication data was already retrieved is a hidden HARK, refused', () => {
  it('assertFreezePrecedesDataset throws when frozenAt is at or after retrievedAt', () => {
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    expect(() => assertFreezePrecedesDataset(freeze, { retrievedAt: freeze.frozenAt - 1 })).toThrow(/precede/i);
    expect(() => assertFreezePrecedesDataset(freeze, { retrievedAt: freeze.frozenAt })).toThrow(/precede/i);
  });

  it('does not throw when the freeze genuinely precedes the dataset', () => {
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    expect(() => assertFreezePrecedesDataset(freeze, { retrievedAt: freeze.frozenAt + 1000 })).not.toThrow();
  });

  it('runReplication itself refuses a retroactive freeze', () => {
    const points = linearPoints([1, 2, 3, 4, 5], 3, 2, 0.05);
    const replicationPoints = linearPoints([11, 12, 13, 14, 15], 3, 2, 0.05, 99);
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'repl', points: replicationPoints, disjointnessProof: 'DIFFERENT_TIME_WINDOW', retrievedAt: freeze.frozenAt - 500 };
    expect(() =>
      runReplication({ freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'disc', points }, replicationDataset: dataset }),
    ).toThrow(/precede/i);
  });
});

describe('a real, clean replication -> REPLICATED, adversarial attacks withstood', () => {
  it('recovers a real slope on disjoint data and withstands both adversarial attempts', () => {
    const discoveryPoints = linearPoints(Array.from({ length: 10 }, (_, i) => i + 1), 3, 2, 0.05, 1);
    const replicationPoints = linearPoints(Array.from({ length: 10 }, (_, i) => i + 101), 3, 2, 0.05, 2);
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'repl-clean', points: replicationPoints, disjointnessProof: 'DIFFERENT_TIME_WINDOW', retrievedAt: freeze.frozenAt + 1000 };

    const record = runReplication({ freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'disc-clean', points: discoveryPoints }, replicationDataset: dataset });

    expect(record.result).toBe('REPLICATED');
    expect(record.effectComparison.replicationEffect).toBeCloseTo(3, 0);
    expect(record.effectComparison.agreementWithinUncertainty).toBe(true);
    expect(record.adversarialAttempts.length).toBe(2);
    for (const attempt of record.adversarialAttempts) {
      expect(attempt.result).toBe('WITHSTOOD');
    }
    expect(record.frozenBeforeReplicationAccess).toBe(true);
    expect(record.outcomeFingerprint.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same inputs produce the same outcome fingerprint', () => {
    const discoveryPoints = linearPoints(Array.from({ length: 10 }, (_, i) => i + 1), 3, 2, 0.05, 1);
    const replicationPoints = linearPoints(Array.from({ length: 10 }, (_, i) => i + 101), 3, 2, 0.05, 2);
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'repl-det', points: replicationPoints, disjointnessProof: 'DIFFERENT_TIME_WINDOW', retrievedAt: freeze.frozenAt + 1000 };
    const input = { freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'disc-det', points: discoveryPoints }, replicationDataset: dataset };
    const a = runReplication(input);
    const b = runReplication(input);
    expect(a.outcomeFingerprint).toBe(b.outcomeFingerprint);
  });
});

describe('a spurious claim -> FAILED, caught by disagreement or by the adversarial attacks', () => {
  it('pure-noise replication data disagrees with a real discovery effect -> FAILED', () => {
    const discoveryPoints = linearPoints(Array.from({ length: 10 }, (_, i) => i + 1), 3, 2, 0.05, 1);
    const replicationPoints = pureNoisePoints(Array.from({ length: 10 }, (_, i) => i + 101), 0.5, 3);
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'repl-noise', points: replicationPoints, disjointnessProof: 'DIFFERENT_TIME_WINDOW', retrievedAt: freeze.frozenAt + 1000 };

    const record = runReplication({ freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'disc-noise', points: discoveryPoints }, replicationDataset: dataset });

    expect(record.result).toBe('FAILED');
    expect(record.effectComparison.agreementWithinUncertainty).toBe(false);
  });

  it('when fitting genuinely fails on the replication data, the record is FAILED, never fabricated', () => {
    // A single point cannot fit a 2-term model — fitModelSpec must refuse.
    const discoveryPoints = linearPoints([1, 2, 3], 3, 2, 0.05);
    const freeze = freezeBeforeReplication(LINEAR_SPEC, 3);
    const dataset: ReplicationDataset = { datasetId: 'repl-toofew', points: [{ x: 500, y: 1502, sigma: 0.05 }], disjointnessProof: 'DIFFERENT_TIME_WINDOW', retrievedAt: freeze.frozenAt + 1000 };
    const record = runReplication({ freeze, hypothesisSpec: LINEAR_SPEC, discoveryEffect: 3, discoveryDataset: { datasetId: 'disc-toofew', points: discoveryPoints }, replicationDataset: dataset });
    expect(record.result).toBe('FAILED');
    expect(Number.isNaN(record.effectComparison.replicationEffect)).toBe(true);
  });
});
