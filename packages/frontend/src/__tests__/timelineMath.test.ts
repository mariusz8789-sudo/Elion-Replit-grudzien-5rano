import { describe, expect, it } from 'vitest';
import { nearestEpoch, epochBlend } from '../core/timelineMath';
import { TIMELINE_EPOCHS } from '../data/timeline';
import type { TimelineEpoch } from '../data/timeline';

const A: TimelineEpoch = { id: 'a', name: 'A', ageSeconds: 1, scaleMeters: 1, confirmation: 'confirmed', teaser: '', summary: '', color: '#fff' };
const B: TimelineEpoch = { id: 'b', name: 'B', ageSeconds: 100, scaleMeters: 1, confirmation: 'confirmed', teaser: '', summary: '', color: '#fff' };
const C: TimelineEpoch = { id: 'c', name: 'C', ageSeconds: 10_000, scaleMeters: 1, confirmation: 'confirmed', teaser: '', summary: '', color: '#fff' };

describe('nearestEpoch', () => {
  it('wybiera dokładnie trafioną epokę', () => {
    expect(nearestEpoch(100, [A, B, C]).id).toBe('b');
  });

  it('wybiera bliższą epokę w skali logarytmicznej (nie liniowej)', () => {
    // log10(10) = 1, w połowie drogi log10(1)=0 i log10(100)=2 → punkt równoodległy
    expect(nearestEpoch(10, [A, B]).id).toBe('a'); // 10 bliżej A (10x) niż B (10x) — remis, akceptujemy A (redukcja "w lewo")
    expect(nearestEpoch(9, [A, B]).id).toBe('a'); // wyraźnie bliżej A
    expect(nearestEpoch(50, [A, B]).id).toBe('b'); // wyraźnie bliżej B w log-skali
  });
});

describe('epochBlend', () => {
  it('poza zakresem z lewej: mix=0, prev=next=pierwsza epoka', () => {
    const r = epochBlend(0.001, [A, B, C]);
    expect(r.prev.id).toBe('a');
    expect(r.next.id).toBe('a');
    expect(r.mix).toBe(0);
  });

  it('poza zakresem z prawej: mix=0, prev=next=ostatnia epoka', () => {
    const r = epochBlend(1e9, [A, B, C]);
    expect(r.prev.id).toBe('c');
    expect(r.next.id).toBe('c');
    expect(r.mix).toBe(0);
  });

  it('dokładnie na wieku środkowej epoki: trafia w przedział [A,B] z mix=1 (w pełni B)', () => {
    const r = epochBlend(100, [A, B, C]);
    expect(r.prev.id).toBe('a');
    expect(r.next.id).toBe('b');
    expect(r.mix).toBe(1);
  });

  it('w połowie drogi (log-skala) między dwiema epokami: mix≈0.5', () => {
    // log10(A)=0, log10(B)=2 → środek log10=1 → wartość 10
    const r = epochBlend(10, [A, B, C]);
    expect(r.prev.id).toBe('a');
    expect(r.next.id).toBe('b');
    expect(r.mix).toBeCloseTo(0.5, 6);
  });

  it('mix rośnie monotonicznie w obrębie jednego przedziału', () => {
    let prevMix = -1;
    for (const age of [1, 3, 10, 30, 90, 100]) {
      const r = epochBlend(age, [A, B]);
      expect(r.mix).toBeGreaterThanOrEqual(prevMix);
      prevMix = r.mix;
    }
  });
});

describe('TIMELINE_EPOCHS — integralność danych (Discovery Timeline Engine)', () => {
  it('ma dokładnie 15 epok (Big Bang → daleka przyszłość)', () => {
    expect(TIMELINE_EPOCHS.length).toBe(15);
  });

  it('id-y są unikalne', () => {
    const ids = new Set(TIMELINE_EPOCHS.map((e) => e.id));
    expect(ids.size).toBe(TIMELINE_EPOCHS.length);
  });

  it('wiek rośnie ściśle monotonicznie (chronologiczna kolejność tablicy)', () => {
    for (let i = 1; i < TIMELINE_EPOCHS.length; i++) {
      expect(TIMELINE_EPOCHS[i].ageSeconds).toBeGreaterThan(TIMELINE_EPOCHS[i - 1].ageSeconds);
    }
  });

  it('każda epoka ma dodatnią skalę przestrzenną i niepusty opis', () => {
    for (const e of TIMELINE_EPOCHS) {
      expect(e.scaleMeters).toBeGreaterThan(0);
      expect(e.teaser.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeGreaterThan(0);
    }
  });

  it('pierwsza epoka to Wielki Wybuch, ostatnia to daleka przyszłość', () => {
    expect(TIMELINE_EPOCHS[0].id).toBe('big-bang');
    expect(TIMELINE_EPOCHS[TIMELINE_EPOCHS.length - 1].id).toBe('far-future');
  });

  it('epoka "teraz" ma wiek zgodny z przyjętym wiekiem Wszechświata (13,8 mld lat, ±1%)', () => {
    const present = TIMELINE_EPOCHS.find((e) => e.id === 'present')!;
    const expectedYears = 13.8e9;
    const actualYears = present.ageSeconds / 31_557_600;
    expect(actualYears).toBeCloseTo(expectedYears, -8); // rząd wielkości + zgodność do ~1%
    expect(Math.abs(actualYears - expectedYears) / expectedYears).toBeLessThan(0.01);
  });

  it('epoki spekulacyjne (far-future) mają niższy poziom potwierdzenia niż epoki obserwacyjne (first-atoms)', () => {
    const firstAtoms = TIMELINE_EPOCHS.find((e) => e.id === 'first-atoms')!;
    const farFuture = TIMELINE_EPOCHS.find((e) => e.id === 'far-future')!;
    expect(firstAtoms.confirmation).toBe('confirmed');
    expect(farFuture.confirmation).toBe('hypothesis');
  });
});
