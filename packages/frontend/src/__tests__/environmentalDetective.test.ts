import { describe, expect, it } from 'vitest';
import { environmentalDetectiveProvider, investigateEnvironmentalCase, robustAnomalies, type EnvironmentalCaseInput } from '../core/agent/environmentalDetective';
import { kernelLedger, GENESIS_CYBER_KERNEL_ID } from '../core/agent/cyberReasoningKernel';
import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';

/** Deterministic synthetic panels (a linear congruential noise, seeded) — labelled SYNTHETIC in every case below. */
function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function series(unit: string, seed: number, n: number, base: number, slope: number, step: number, stepAt: number, noise = 0.6) {
  const r = lcg(seed);
  return { unit, points: Array.from({ length: n }, (_, i) => ({ period: i, value: +(base + slope * i + (i >= stepAt ? step : 0) + (r() - 0.5) * noise).toFixed(4) })) };
}
const CUT = 24;
function caseInput(step: number, controls = 3, kind: 'SYNTHETIC' | 'REAL_DATASET' = 'SYNTHETIC'): EnvironmentalCaseInput {
  return { caseId: `no2-${step}`, quantity: 'NO2 monthly mean', measurementUnit: 'µg/m³', treated: series('site-A', 11, 48, 40, -0.05, step, CUT), controls: Array.from({ length: controls }, (_, i) => series(`ctrl-${i}`, 100 + i, 48, 38 + i, -0.05, 0, CUT)), interventionPeriod: CUT, provenance: { kind, sourceUrl: kind === 'SYNTHETIC' ? 'genesis://synthetic/no2-panel' : 'https://uk-air.defra.gov.uk/data/' } };
}

describe('environmental detective — on the CAP-2 causal library, honest about its input', () => {
  it('a synthetic step change is measured (CI excludes 0) but a SYNTHETIC case can never claim more than INSUFFICIENT_EVIDENCE about the world', () => {
    const r = investigateEnvironmentalCase(caseInput(-8));
    expect(r.estimator).toBe('synthetic-control');
    expect(r.causal).not.toBeNull();
    expect(r.causal!.effect.estimate).toBeLessThan(-5);
    expect(r.causal!.effect.ci95[1]).toBeLessThan(0);
    expect(r.parallelTrends?.parallelTrendsHold).toBe(true);
    expect(r.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.epistemicStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.reasons.join(' ')).toContain('SYNTHETIC input');
    expect(r.fingerprint).toBe(investigateEnvironmentalCase(caseInput(-8)).fingerprint);
  });
  it('the same step on a pinned real dataset is EFFECT_SUGGESTED (MODEL); no step is NO_EFFECT_DETECTED; DiD with one control, ITS with none', () => {
    expect(investigateEnvironmentalCase(caseInput(-8, 3, 'REAL_DATASET'))).toMatchObject({ verdict: 'EFFECT_SUGGESTED', epistemicStatus: 'MODEL' });
    expect(investigateEnvironmentalCase(caseInput(0, 3, 'REAL_DATASET')).verdict).toBe('NO_EFFECT_DETECTED');
    expect(investigateEnvironmentalCase(caseInput(-8, 1, 'REAL_DATASET')).estimator).toBe('two-way-fe-did');
    const its = investigateEnvironmentalCase(caseInput(-8, 0, 'REAL_DATASET'));
    expect(its.estimator).toBe('interrupted-time-series'); expect(its.parallelTrends).toBeNull(); expect(its.causal?.slopeChange).toBeDefined();
  });
  it('too few observations → INSUFFICIENT_EVIDENCE with the reason; a DiD without controls is refused; anomalies are robust-z outliers', () => {
    const short = investigateEnvironmentalCase({ ...caseInput(-8), treated: { unit: 'site-A', points: [{ period: 0, value: 1 }, { period: 1, value: 2 }, { period: 24, value: 3 }] } });
    expect(short.verdict).toBe('INSUFFICIENT_EVIDENCE'); expect(short.reasons[0]).toContain('too few observations');
    const noCtrl = investigateEnvironmentalCase({ ...caseInput(-8, 0), estimator: 'two-way-fe-did' });
    expect(noCtrl.reasons[0]).toContain('needs at least one control');
    const spiky = { unit: 'x', points: Array.from({ length: 30 }, (_, i) => ({ period: i, value: i === 17 ? 90 : 40 + (i % 3) })) };
    const a = robustAnomalies(spiky); expect(a.length).toBe(1); expect(a[0]).toMatchObject({ period: 17, value: 90 }); expect(Math.abs(a[0].robustZ)).toBeGreaterThan(3.5);
    expect(robustAnomalies({ unit: 'flat', points: Array.from({ length: 10 }, (_, i) => ({ period: i, value: 5 })) })).toEqual([]);
  });
  it('is a provider of the single kernel and anchors every case on the kernel ledger', () => {
    const p = kernelRegistry.resolve('environmental-detective');
    expect(p?.providerId).toBe('environmental-detective');
    const before = kernelLedger.getActive().length;
    const a = p!.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/test', operatorId: 'T' }, caseInput(-8)) as { ledgerContentHash: string; label: string };
    expect(a.ledgerContentHash).toMatch(/^[0-9a-f]{64}$/); expect(a.label).toBe('ENVIRONMENTAL_DETECTIVE_CAUSAL_MODEL');
    expect(kernelLedger.getActive().length).toBe(before + 1);
    expect(kernelLedger.getActive().at(-1)?.claimType).toBe('model');
    expect(environmentalDetectiveProvider(kernelLedger).capabilities).toEqual(['environmental-detective', 'environmental-case-graph']);
    expect(kernelRegistry.resolve('central-dogma-model')?.providerId).toBe('molecular-biology');
  });
});
