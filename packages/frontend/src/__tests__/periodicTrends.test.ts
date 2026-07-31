import { describe, expect, it } from 'vitest';
import { PERIODIC_TRENDS } from '../data/periodicTrends';
import { ELEMENTS } from '../data/elements';

describe('trendy okresowe: dane', () => {
  it('każdy wpis odpowiada realnemu, zarejestrowanemu Z (1-36)', () => {
    for (const [key, point] of Object.entries(PERIODIC_TRENDS)) {
      expect(Number(key)).toBe(point.z);
      expect(point.z).toBeGreaterThanOrEqual(1);
      expect(point.z).toBeLessThanOrEqual(36);
    }
  });

  it('każde Z z danych odpowiada pierwiastkowi z data/elements.ts o tym samym Z', () => {
    for (const point of Object.values(PERIODIC_TRENDS)) {
      const el = ELEMENTS.find((e) => e.z === point.z);
      expect(el, `element for Z=${point.z}`).toBeDefined();
    }
  });

  it('energia jonizacji jest zawsze dodatnia', () => {
    for (const point of Object.values(PERIODIC_TRENDS)) {
      expect(point.ionizationKJ).toBeGreaterThan(0);
    }
  });

  it('promień atomowy, gdy podany, jest dodatni i w rozsądnym zakresie (10-300 pm)', () => {
    for (const point of Object.values(PERIODIC_TRENDS)) {
      if (point.radiusPm == null) continue;
      expect(point.radiusPm).toBeGreaterThan(10);
      expect(point.radiusPm).toBeLessThan(300);
    }
  });

  it('gazy szlachetne (He, Ne, Ar) świadomie nie mają promienia empirycznego', () => {
    for (const z of [2, 10, 18]) {
      expect(PERIODIC_TRENDS[z].radiusPm).toBeNull();
    }
  });

  it('promień maleje wzdłuż okresu 2 (Li→F, ten sam mechanizm co Z_eff)', () => {
    const period2 = [3, 4, 5, 6, 7, 9]; // Li,Be,B,C,N,F (Ne bez wartości)
    let prev = Infinity;
    for (const z of period2) {
      const r = PERIODIC_TRENDS[z].radiusPm!;
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });

  it('promień rośnie w dół grupy 1. (metale alkaliczne: Li<Na<K)', () => {
    const li = PERIODIC_TRENDS[3].radiusPm!;
    const na = PERIODIC_TRENDS[11].radiusPm!;
    const k = PERIODIC_TRENDS[19].radiusPm!;
    expect(li).toBeLessThan(na);
    expect(na).toBeLessThan(k);
  });

  it('energia jonizacji generalnie rośnie wzdłuż okresu 2 (Li→Ne, z realnym wyjątkiem Be>B i N>O)', () => {
    // Odstępstwa Be>B i N>O są realnymi, dobrze udokumentowanymi anomaliami
    // (stabilność podpowłoki w pełni/połowicznie zapełnionej) — test
    // sprawdza tylko skrajne wartości, nie monotoniczność krok po kroku.
    expect(PERIODIC_TRENDS[10].ionizationKJ).toBeGreaterThan(PERIODIC_TRENDS[3].ionizationKJ); // Ne > Li
    expect(PERIODIC_TRENDS[9].ionizationKJ).toBeGreaterThan(PERIODIC_TRENDS[3].ionizationKJ); // F > Li
  });

  it('energia jonizacji maleje w dół grupy 1. (metale alkaliczne: Li>Na>K>Rb>Cs oczekiwane dla Li>Na>K)', () => {
    const li = PERIODIC_TRENDS[3].ionizationKJ;
    const na = PERIODIC_TRENDS[11].ionizationKJ;
    const k = PERIODIC_TRENDS[19].ionizationKJ;
    expect(li).toBeGreaterThan(na);
    expect(na).toBeGreaterThan(k);
  });

  it('gazy szlachetne mają najwyższą energię jonizacji w swoim okresie', () => {
    expect(PERIODIC_TRENDS[2].ionizationKJ).toBeGreaterThan(PERIODIC_TRENDS[1].ionizationKJ); // He > H
    expect(PERIODIC_TRENDS[10].ionizationKJ).toBeGreaterThan(PERIODIC_TRENDS[9].ionizationKJ); // Ne > F
    expect(PERIODIC_TRENDS[18].ionizationKJ).toBeGreaterThan(PERIODIC_TRENDS[17].ionizationKJ); // Ar > Cl
  });
});
