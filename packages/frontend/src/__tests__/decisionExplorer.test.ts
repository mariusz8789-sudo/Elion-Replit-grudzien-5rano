import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listDecisions,
  addDecision,
  updateDecision,
  deleteDecision,
  resetToExamples,
  galaxyPosition,
  EXAMPLE_DECISIONS,
} from '../core/decisionExplorer';

/**
 * Quantum Decision Explorer — narzędzie narracyjne (nie fizyka), ale
 * trwałość (localStorage) i geometria rozkładu gwiazd (galaxyPosition) są
 * zwykłym, testowalnym kodem jak wszędzie indziej w Genesis OS.
 */

function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listDecisions / persistence', () => {
  it('zwraca przykładowe decyzje, gdy nic nie zapisano', () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const list = listDecisions();
    expect(list.length).toBe(EXAMPLE_DECISIONS.length);
  });

  it('addDecision zapisuje nową decyzję i jest odczytywalna', () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    resetToExamples();
    const before = listDecisions().length;
    addDecision({ label: 'Testowa decyzja', description: 'opis', year: 2024, weight: 6, branches: ['A', 'B'] });
    const after = listDecisions();
    expect(after.length).toBe(before + 1);
    const added = after.find((d) => d.label === 'Testowa decyzja');
    expect(added?.weight).toBe(6);
    expect(added?.branches).toEqual(['A', 'B']);
  });

  it('updateDecision modyfikuje istniejącą decyzję zachowując id', () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    resetToExamples();
    const d = addDecision({ label: 'Do edycji', description: '', year: 2020, weight: 3, branches: [] });
    updateDecision(d.id, { label: 'Po edycji', description: 'nowy opis', year: 2021, weight: 9, branches: ['X'] });
    const found = listDecisions().find((x) => x.id === d.id);
    expect(found?.label).toBe('Po edycji');
    expect(found?.weight).toBe(9);
  });

  it('deleteDecision usuwa dokładnie jedną decyzję', () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    resetToExamples();
    const before = listDecisions();
    deleteDecision(before[0].id);
    const after = listDecisions();
    expect(after.length).toBe(before.length - 1);
    expect(after.find((d) => d.id === before[0].id)).toBeUndefined();
  });

  it('lista jest posortowana chronologicznie po roku', () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    resetToExamples();
    addDecision({ label: 'Najstarsza', description: '', year: 1999, weight: 1, branches: [] });
    const list = listDecisions();
    for (let i = 1; i < list.length; i++) {
      expect(list[i].year).toBeGreaterThanOrEqual(list[i - 1].year);
    }
    expect(list[0].label).toBe('Najstarsza');
  });

  it('waga jest przycinana do zakresu [1,10] przy zapisie nieprawidłowej wartości', () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    resetToExamples();
    addDecision({ label: 'Ekstremalna waga', description: '', year: 2020, weight: 999, branches: [] });
    const found = listDecisions().find((d) => d.label === 'Ekstremalna waga');
    expect(found?.weight).toBe(10);
  });

  it('odporne na uszkodzony zapis w localStorage (nie rzuca, zwraca pustą listę)', () => {
    const storage = makeFakeStorage();
    storage.setItem('genesis-os:decision-explorer/v1', '{not valid json');
    vi.stubGlobal('window', { localStorage: storage });
    expect(() => listDecisions()).not.toThrow();
  });
});

describe('galaxyPosition', () => {
  it('promień rośnie monotonicznie z indeksem (starsze decyzje bliżej centrum)', () => {
    const total = 10;
    let prevR = -1;
    for (let i = 0; i < total; i++) {
      const { radiusFrac } = galaxyPosition(i, total);
      expect(radiusFrac).toBeGreaterThan(prevR);
      prevR = radiusFrac;
    }
  });

  it('kąt używa stałego kroku złotego (phyllotaxis) — różnica między kolejnymi indeksami jest stała', () => {
    const a0 = galaxyPosition(0, 5).angle;
    const a1 = galaxyPosition(1, 5).angle;
    const a2 = galaxyPosition(2, 5).angle;
    expect(a1 - a0).toBeCloseTo(a2 - a1, 9);
  });

  it('nie rzuca dla total=1 (pojedyncza decyzja)', () => {
    expect(() => galaxyPosition(0, 1)).not.toThrow();
    const { radiusFrac } = galaxyPosition(0, 1);
    expect(radiusFrac).toBeGreaterThan(0);
  });
});

describe('EXAMPLE_DECISIONS — integralność danych', () => {
  it('każdy przykład ma etykietę, wagę w [1,10] i co najmniej jedno odgałęzienie', () => {
    for (const d of EXAMPLE_DECISIONS) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.weight).toBeGreaterThanOrEqual(1);
      expect(d.weight).toBeLessThanOrEqual(10);
      expect(d.branches.length).toBeGreaterThan(0);
    }
  });

  it('id-y przykładów są unikalne', () => {
    const ids = new Set(EXAMPLE_DECISIONS.map((d) => d.id));
    expect(ids.size).toBe(EXAMPLE_DECISIONS.length);
  });
});
