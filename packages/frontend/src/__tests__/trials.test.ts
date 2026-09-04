import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listTrials, saveTrial, duplicateTrial, updateTrial, deleteTrial, diffTrials,
} from '../core/trials';

/**
 * Trial Series (szkielet pętli odkrycia). Weryfikuje trwałość na sfałszowanym
 * localStorage oraz semantykę: numerowanie serii, odbicie z prowieniencją
 * (parentId), zmiana statusu i różnicę „co się zmieniło w wejściach → jakie
 * konsekwencje z tego wynikły".
 */
function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: makeFakeStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const EXP = 'test.exp';

describe('Trial Series — trwałość i numerowanie', () => {
  it('pierwsza próba jest punktem odniesienia, kolejne rosną i utrzymują się', () => {
    const t1 = saveTrial(EXP, { params: { a: 1 }, outputs: { o: 10 } });
    expect(t1.index).toBe(1);
    expect(t1.status).toBe('baseline');
    const t2 = saveTrial(EXP, { params: { a: 2 }, outputs: { o: 20 } });
    expect(t2.index).toBe(2);
    expect(t2.status).toBe('draft');
    const all = listTrials(EXP);
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.index)).toEqual([1, 2]);
  });

  it('serie różnych eksperymentów są rozdzielone', () => {
    saveTrial(EXP, { params: { a: 1 }, outputs: { o: 1 } });
    saveTrial('inny.exp', { params: { b: 5 }, outputs: { p: 9 } });
    expect(listTrials(EXP)).toHaveLength(1);
    expect(listTrials('inny.exp')).toHaveLength(1);
  });
});

describe('Trial Series — odbicie, status, usuwanie', () => {
  it('odbicie kopiuje wejścia i zapisuje prowieniencję rodzica', () => {
    const src = saveTrial(EXP, { params: { a: 3 }, outputs: { o: 30 } });
    const fork = duplicateTrial(EXP, src.id)!;
    expect(fork.parentId).toBe(src.id);
    expect(fork.params).toEqual(src.params);
    expect(fork.status).toBe('draft');
    expect(fork.index).toBe(2);
  });

  it('zmiana statusu i usuwanie utrzymują się', () => {
    const t = saveTrial(EXP, { params: { a: 1 }, outputs: { o: 1 } });
    updateTrial(EXP, t.id, { status: 'promising', note: 'ciekawe' });
    expect(listTrials(EXP)[0].status).toBe('promising');
    expect(listTrials(EXP)[0].note).toBe('ciekawe');
    deleteTrial(EXP, t.id);
    expect(listTrials(EXP)).toHaveLength(0);
  });
});

describe('Trial Series — różnica prób', () => {
  it('pokazuje zmienione wejścia i wynikłe konsekwencje, pomijając identyczne', () => {
    const a = saveTrial(EXP, { params: { x: 1, y: 5 }, outputs: { r: 10, s: 2 } });
    const b = saveTrial(EXP, { params: { x: 3, y: 5 }, outputs: { r: 30, s: 2 } });
    const d = diffTrials(a, b);
    expect(d.params.map((p) => p.key)).toEqual(['x']); // y niezmienione pominięte
    expect(d.params[0]).toMatchObject({ key: 'x', a: 1, b: 3 });
    expect(d.outputs.map((o) => o.key)).toEqual(['r']); // s niezmienione pominięte
    expect(d.outputs[0]).toMatchObject({ key: 'r', a: 10, b: 30 });
  });
});
