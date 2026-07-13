import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCandidate, evaluateBatch, candidateSignature, rejectionReasons } from '../core/cde/passport';
import { getAdapter, CDE_ADAPTERS } from '../core/cde/adapters';
import { measurementMarket } from '../core/cde/measurementMarket';
import { recordFailure, recordFailures, listFailures, wasTried, clearFailures } from '../core/cde/failureLibrary';

/**
 * CDE — silnik odkryć na wykonywalnym Grafie Modeli. Testy walidują REALNĄ
 * fizykę (Ziemia ~255 K i utrzymuje atmosferę; Fe-56 ~8,79 MeV/nukleon) oraz
 * uczciwość: naruszenie dziedziny/kryterium daje odrzucenie z jawnym powodem.
 */

const atmos = getAdapter('atmospheric-habitability')!;
const nuclear = getAdapter('nuclear-stability')!;

const EARTH = { stellarLuminositySolar: 1, orbitalDistanceAu: 1, planetAlbedo: 0.3, planetMassEarth: 1, planetRadiusEarth: 1, moleculeMassAmu: 18 };

describe('domain adapters registry', () => {
  it('every adapter reuses a graph and declares criteria', () => {
    expect(CDE_ADAPTERS.length).toBeGreaterThanOrEqual(2);
    for (const a of CDE_ADAPTERS) {
      expect(a.criteria.length).toBeGreaterThan(0);
      expect(typeof a.buildGraph).toBe('function');
    }
  });
});

describe('evaluateCandidate — atmospheric habitability', () => {
  it('Earth-like parameters yield ~255 K and are accepted', () => {
    const p = evaluateCandidate(atmos, { label: 'Ziemia', params: EARTH });
    expect(p.outputs.equilibriumTempK).toBeGreaterThan(240);
    expect(p.outputs.equilibriumTempK).toBeLessThan(270);
    expect(p.accepted).toBe(true);
    expect(p.results.every((r) => r.passed)).toBe(true);
  });

  it('a too-close orbit overheats and is rejected with a reason', () => {
    const p = evaluateCandidate(atmos, { label: 'Piekło', params: { ...EARTH, orbitalDistanceAu: 0.1 } });
    expect(p.outputs.equilibriumTempK).toBeGreaterThan(330);
    expect(p.accepted).toBe(false);
    const reasons = rejectionReasons(p);
    expect(reasons.join(' ')).toMatch(/Temperatura/);
  });

  it('a light molecule on a small warm planet escapes (low Jeans) and is rejected', () => {
    // Wodór (2 amu) na małej planecie — niska λ → nie utrzyma atmosfery.
    const p = evaluateCandidate(atmos, { ...{ label: 'Ucieczka' }, params: { ...EARTH, moleculeMassAmu: 2, planetMassEarth: 0.1, planetRadiusEarth: 0.5 } });
    expect(p.results.find((r) => r.criterion.outputId === 'jeansParameter')?.passed).toBe(false);
    expect(p.accepted).toBe(false);
  });
});

describe('evaluateCandidate — nuclear stability', () => {
  it('Fe-56 has ~8.79 MeV/nucleon and is accepted', () => {
    const p = evaluateCandidate(nuclear, { label: 'Fe-56', params: { protonNumber: 26, neutronNumber: 30 } });
    expect(p.outputs.bindingPerNucleon).toBeGreaterThan(8.6);
    expect(p.outputs.bindingPerNucleon).toBeLessThan(8.9);
    expect(p.accepted).toBe(true);
  });

  it('hydrogen-1 (no binding) is rejected', () => {
    const p = evaluateCandidate(nuclear, { label: 'H-1', params: { protonNumber: 1, neutronNumber: 0 } });
    expect(p.accepted).toBe(false);
    expect(p.outputs.bindingPerNucleon).toBeLessThan(8.4);
  });
});

describe('evaluateBatch', () => {
  it('splits accepted from rejected', () => {
    const batch = evaluateBatch(atmos, [
      { label: 'a', params: EARTH },
      { label: 'b', params: { ...EARTH, orbitalDistanceAu: 0.1 } },
    ]);
    expect(batch.accepted.length).toBe(1);
    expect(batch.rejected.length).toBe(1);
    expect(batch.all.length).toBe(2);
  });
});

describe('candidateSignature', () => {
  it('is order-independent and value-sensitive', () => {
    expect(candidateSignature({ a: 1, b: 2 })).toBe(candidateSignature({ b: 2, a: 1 }));
    expect(candidateSignature({ a: 1 })).not.toBe(candidateSignature({ a: 1.5 }));
  });
});

describe('measurement market', () => {
  it('ranks parameters by influence on the acceptance criteria; shares sum to ~1', () => {
    const listings = measurementMarket(atmos, EARTH);
    expect(listings.length).toBe(atmos.params.length);
    const total = listings.reduce((s, l) => s + l.share, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
    // ranking malejąco
    for (let i = 1; i < listings.length; i++) {
      expect(listings[i - 1].influence).toBeGreaterThanOrEqual(listings[i].influence);
    }
  });
});

describe('failure library (localStorage)', () => {
  function fakeStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
    };
  }
  afterEach(() => vi.unstubAllGlobals());

  it('records rejected passports with reasons and dedupes by signature', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    clearFailures(atmos.id);
    const p = evaluateCandidate(atmos, { label: 'Piekło', params: { ...EARTH, orbitalDistanceAu: 0.1 } });
    const rec = recordFailure(p);
    expect(rec).not.toBe(null);
    expect(rec!.reasons.length).toBeGreaterThan(0);
    expect(listFailures(atmos.id).length).toBe(1);
    // Re-recording same params does not duplicate.
    recordFailure(evaluateCandidate(atmos, { params: { ...EARTH, orbitalDistanceAu: 0.1 } }));
    expect(listFailures(atmos.id).length).toBe(1);
    expect(wasTried(atmos.id, { ...EARTH, orbitalDistanceAu: 0.1 })).not.toBe(null);
  });

  it('does not record accepted passports as failures', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    clearFailures(atmos.id);
    expect(recordFailure(evaluateCandidate(atmos, { params: EARTH }))).toBe(null);
    expect(listFailures(atmos.id).length).toBe(0);
  });

  it('recordFailures counts only newly stored rejections', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    clearFailures(atmos.id);
    const batch = evaluateBatch(atmos, [
      { params: EARTH },
      { params: { ...EARTH, orbitalDistanceAu: 0.1 } },
    ]);
    expect(recordFailures(batch.rejected)).toBe(1);
  });
});
