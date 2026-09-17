import { describe, expect, it } from 'vitest';
import {
  createPredictionRegistry,
  registerPrediction,
  listPredictions,
  checkPredictionOrdering,
  registryFingerprint,
  type PredictionInput,
} from '../core/agent/predictionRegistry';

const BASE: PredictionInput = {
  predictionId: 'p1', claim: 'the offset is positive', value: 0.42,
  interval: { low: 0.3, high: 0.55 }, discriminatesAgainst: ['null-hypothesis'], frozenAt: 1000,
};

describe('registerPrediction — rejects what would make the prediction worthless', () => {
  it('rejects an empty claim', () => {
    const r = createPredictionRegistry('t');
    expect(() => registerPrediction(r, { ...BASE, claim: '  ' })).toThrow(/claim/i);
  });

  it('rejects low > high', () => {
    const r = createPredictionRegistry('t');
    expect(() => registerPrediction(r, { ...BASE, interval: { low: 1, high: 0 } })).toThrow(/low > high/);
  });

  it('rejects an empty discriminatesAgainst — a trivial prediction proves nothing', () => {
    const r = createPredictionRegistry('t');
    expect(() => registerPrediction(r, { ...BASE, discriminatesAgainst: [] })).toThrow(/discriminatesAgainst/);
  });

  it('rejects re-registering the same predictionId — frozen once', () => {
    const r = createPredictionRegistry('t');
    registerPrediction(r, BASE);
    expect(() => registerPrediction(r, { ...BASE, value: 0.9 })).toThrow(/already registered/);
  });

  it('accepts a well-formed prediction and returns its fingerprint', () => {
    const r = createPredictionRegistry('t');
    const p = registerPrediction(r, BASE);
    expect(p.fingerprint.length).toBeGreaterThan(0);
    expect(listPredictions(r)).toHaveLength(1);
  });
});

describe('checkPredictionOrdering — the P5 gate', () => {
  it('THROWS when checking an outcome against a prediction that was never registered', () => {
    const r = createPredictionRegistry('t');
    expect(() => checkPredictionOrdering(r, { predictionId: 'ghost', observedAt: 2000, observedValue: 0.4 })).toThrow(/ever registered/);
  });

  it('reports FROZEN_BEFORE_OBSERVED when the prediction predates the observation', () => {
    const r = createPredictionRegistry('t');
    registerPrediction(r, BASE);
    const check = checkPredictionOrdering(r, { predictionId: 'p1', observedAt: 2000, observedValue: 0.44 });
    expect(check.ordering).toBe('FROZEN_BEFORE_OBSERVED');
    expect(check.withinInterval).toBe(true);
  });

  it('reports VIOLATED when the observation timestamp is at or before the freeze -- ordering broken', () => {
    const r = createPredictionRegistry('t');
    registerPrediction(r, BASE);
    const atSameTime = checkPredictionOrdering(r, { predictionId: 'p1', observedAt: 1000, observedValue: 0.44 });
    expect(atSameTime.ordering).toBe('VIOLATED');
    const before = checkPredictionOrdering(r, { predictionId: 'p1', observedAt: 500, observedValue: 0.44 });
    expect(before.ordering).toBe('VIOLATED');
  });

  it('reports withinInterval honestly false when the observation misses', () => {
    const r = createPredictionRegistry('t');
    registerPrediction(r, BASE);
    const check = checkPredictionOrdering(r, { predictionId: 'p1', observedAt: 2000, observedValue: 5.0 });
    expect(check.withinInterval).toBe(false);
    expect(check.ordering).toBe('FROZEN_BEFORE_OBSERVED'); // ordering and interval-hit are independent facts
  });
});

describe('fingerprint excludes wall-clock, includes content', () => {
  it('two predictions with identical content but different frozenAt fingerprint identically', () => {
    const r1 = createPredictionRegistry('t');
    const r2 = createPredictionRegistry('t');
    registerPrediction(r1, { ...BASE, frozenAt: 1 });
    registerPrediction(r2, { ...BASE, frozenAt: 999999 });
    expect(registryFingerprint(r1)).toBe(registryFingerprint(r2));
  });

  it('a different claim changes the fingerprint', () => {
    const r1 = createPredictionRegistry('t');
    const r2 = createPredictionRegistry('t');
    registerPrediction(r1, BASE);
    registerPrediction(r2, { ...BASE, claim: 'the offset is negative' });
    expect(registryFingerprint(r1)).not.toBe(registryFingerprint(r2));
  });
});
