import { describe, expect, it } from 'vitest';
import {
  classifyObservationGap,
  compareObservationGapReplay,
  createObservationGapRequest,
  fulfilObservationGap,
  observationGapLedgerFingerprint,
  undeclaredFeasibility,
  TAU_DISCRIMINABILITY,
  TAU_ZERO_SPREAD,
  type ObservationGapRequest,
} from '../core/agent/observationGap';

const OBSERVABLE = { quantity: 'S2 at an unobserved time', unit: 'dimensionless', instrumentClass: 'trapped-ion simulator' };

function request(overrides: Partial<Parameters<typeof createObservationGapRequest>[0]> = {}): ObservationGapRequest {
  return createObservationGapRequest({
    campaignId: 'lab-1',
    round: 3,
    liveHypothesisIds: ['m-b', 'm-a'],
    unobservedCount: 2,
    bestDiscriminability: 0.4,
    trigger: 'LOW_DISCRIMINABILITY',
    requiredObservable: OBSERVABLE,
    feasibility: undeclaredFeasibility('test laboratory declares nothing'),
    requestedFrom: 'HUMAN',
    ...overrides,
  });
}

describe('observationGap — classification is the whole decision', () => {
  it('names NO_ATTACHED_EXPERIMENT when nothing is left to run', () => {
    expect(classifyObservationGap({ unobservedCount: 0, bestDiscriminability: 99 })).toBe('NO_ATTACHED_EXPERIMENT');
  });

  it('names ZERO_SPREAD when the live models predict identical values, distinct from merely-low', () => {
    expect(classifyObservationGap({ unobservedCount: 4, bestDiscriminability: 0 })).toBe('ZERO_SPREAD');
    expect(classifyObservationGap({ unobservedCount: 4, bestDiscriminability: TAU_ZERO_SPREAD / 2 })).toBe('ZERO_SPREAD');
  });

  it('names LOW_DISCRIMINABILITY strictly between zero and one sigma', () => {
    expect(classifyObservationGap({ unobservedCount: 4, bestDiscriminability: 0.5 })).toBe('LOW_DISCRIMINABILITY');
    expect(classifyObservationGap({ unobservedCount: 4, bestDiscriminability: TAU_DISCRIMINABILITY - 1e-6 })).toBe('LOW_DISCRIMINABILITY');
  });

  it('returns null — no gap, let the existing selector work — at or above one sigma', () => {
    expect(classifyObservationGap({ unobservedCount: 4, bestDiscriminability: TAU_DISCRIMINABILITY })).toBeNull();
    expect(classifyObservationGap({ unobservedCount: 4, bestDiscriminability: 12.67 })).toBeNull();
  });

  it('treats a non-finite score as nothing to run rather than as a passing score', () => {
    expect(classifyObservationGap({ unobservedCount: 3, bestDiscriminability: Number.NaN })).toBe('NO_ATTACHED_EXPERIMENT');
    expect(classifyObservationGap({ unobservedCount: 3, bestDiscriminability: null })).toBe('NO_ATTACHED_EXPERIMENT');
  });
});

describe('observationGap — the request itself', () => {
  it('carries every field a reader needs to act on it, and states the threshold it was judged against', () => {
    const r = request();
    expect(r.requiredObservable.quantity.length).toBeGreaterThan(0);
    expect(r.requiredObservable.instrumentClass.length).toBeGreaterThan(0);
    expect(r.feasibility.basis.length).toBeGreaterThan(20);
    expect(r.threshold).toBe(TAU_DISCRIMINABILITY);
    expect(r.trigger).toBe('LOW_DISCRIMINABILITY');
    expect(r.rationale).toContain('sigma');
    expect(r.status).toBe('OPEN');
    expect(r.custody).toBeNull();
  });

  it('reports unknown feasibility as unknown instead of inventing a cost', () => {
    const r = request();
    expect(r.feasibility.costEstimate).toBeNull();
    expect(r.feasibility.available).toBeNull();
    expect(r.feasibility.timeEstimate).toBeNull();
  });

  it('has no execute path: the request object exposes no function whatsoever', () => {
    const r = request();
    for (const value of Object.values(r)) expect(typeof value).not.toBe('function');
  });

  it('is deterministic — same inputs, same id and fingerprint, so a replay MATCHes', () => {
    expect(compareObservationGapReplay(request(), request())).toBe('MATCH');
    expect(request().id).toBe(request().id);
  });

  it('is order-independent in its live model set but sensitive to the science', () => {
    const a = request({ liveHypothesisIds: ['m-a', 'm-b'] });
    const b = request({ liveHypothesisIds: ['m-b', 'm-a'] });
    expect(compareObservationGapReplay(a, b)).toBe('MATCH');
    expect(compareObservationGapReplay(a, request({ trigger: 'ZERO_SPREAD' }))).toBe('DRIFT');
    expect(compareObservationGapReplay(a, request({ round: 4 }))).toBe('DRIFT');
  });
});

describe('observationGap — fulfilment, custody and epistemic status', () => {
  const custody = {
    steps: [
      { handledBy: 'Innsbruck trapped-ion group', action: 'ran the requested time point', at: '2026-09-13T09:00:00Z' },
      { handledBy: 'campaign operator', action: 'transcribed the value and its bootstrap sigma', at: '2026-09-13T10:00:00Z' },
    ],
    provenance: 'REAL_EXPERIMENTAL' as const,
    dataset: null,
  };

  it('classifies supplied data as OBSERVATION — there is no code path to FACT', () => {
    const result = fulfilObservationGap(request(), { custody, value: 1.93, sigma: 0.11, at: 24 });
    expect('ok' in result).toBe(false);
    if ('ok' in result) return;
    expect(result.epistemicStatus).toBe('OBSERVATION');
    expect(result.request.status).toBe('FULFILLED');
    expect(result.request.custody?.steps).toHaveLength(2);
  });

  it('keeps the request fingerprint stable from OPEN through FULFILLED, so the round that raised it still matches', () => {
    const open = request();
    const result = fulfilObservationGap(open, { custody, value: 1.93, sigma: 0.11, at: 24 });
    if ('ok' in result) throw new Error('expected fulfilment');
    expect(compareObservationGapReplay(open, result.request)).toBe('MATCH');
  });

  it('fulfilment fingerprint is deterministic and covers the value, sigma and custody', () => {
    const first = fulfilObservationGap(request(), { custody, value: 1.93, sigma: 0.11, at: 24 });
    const same = fulfilObservationGap(request(), { custody, value: 1.93, sigma: 0.11, at: 24 });
    const other = fulfilObservationGap(request(), { custody, value: 1.94, sigma: 0.11, at: 24 });
    if ('ok' in first || 'ok' in same || 'ok' in other) throw new Error('expected fulfilment');
    expect(first.fulfilmentFingerprint).toBe(same.fulfilmentFingerprint);
    expect(first.fulfilmentFingerprint).not.toBe(other.fulfilmentFingerprint);
  });

  it('refuses data with no chain of custody rather than accepting an unauditable observation', () => {
    const result = fulfilObservationGap(request(), { custody: { ...custody, steps: [] }, value: 1.93, sigma: 0.11, at: 24 });
    expect('ok' in result && result.ok === false).toBe(true);
  });

  it('refuses a value without a real uncertainty', () => {
    for (const bad of [0, -1, Number.NaN]) {
      const result = fulfilObservationGap(request(), { custody, value: 1.93, sigma: bad, at: 24 });
      expect('ok' in result && result.ok === false).toBe(true);
    }
  });
});

describe('observationGap — ledger', () => {
  it('fingerprints a campaign\'s gaps in order, and an empty ledger is still a defined value', () => {
    const a = request({ round: 1 });
    const b = request({ round: 2 });
    expect(observationGapLedgerFingerprint([a, b])).toBe(observationGapLedgerFingerprint([a, b]));
    expect(observationGapLedgerFingerprint([a, b])).not.toBe(observationGapLedgerFingerprint([b, a]));
    expect(observationGapLedgerFingerprint([]).length).toBeGreaterThan(0);
  });
});
