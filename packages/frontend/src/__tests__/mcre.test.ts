import { describe, expect, it } from 'vitest';
import { buildFrictionConflict, evaluateConflict, swameeJain, blasius } from '../core/mcre';

/**
 * MCRE — wykrywanie konfliktu modeli. Weryfikuje, że dla rury GŁADKIEJ obie
 * korelacje są zgodne, a dla rury CHROPOWATEJ realnie się rozjeżdżają (bo
 * Blasius ignoruje chropowatość) — czyli konflikt jest FIZYCZNY, nie wymyślony.
 */
describe('korelacje tarcia', () => {
  it('dla rury gładkiej Swamee–Jain i Blasius są zbliżone', () => {
    const re = 50000;
    const fsj = swameeJain(re, 1e-5); // prawie gładka
    const fbl = blasius(re);
    expect(Math.abs(fsj - fbl) / fbl).toBeLessThan(0.15);
  });

  it('dla dużej chropowatości Swamee–Jain daje istotnie wyższe tarcie niż Blasius', () => {
    const re = 50000;
    const fsj = swameeJain(re, 0.03); // ε/D duże
    const fbl = blasius(re); // ignoruje chropowatość
    expect(fsj).toBeGreaterThan(fbl * 1.3);
  });
});

describe('evaluateConflict', () => {
  it('zgłasza brak konfliktu dla rury gładkiej i konflikt dla chropowatej', () => {
    const conflict = buildFrictionConflict();
    // Q=0.006, D=0.1 → Re≈76k: OBA modele w swojej dziedzinie (5000<Re<10⁵) i rura gładka → zgodne.
    const base = { volumetricFlow: 0.006, pipeDiameter: 0.1, pipeRoughnessMm: 0.001 };
    const smooth = evaluateConflict(conflict, base);
    expect(smooth.conflictDetected).toBe(false);

    const rough = evaluateConflict(conflict, { ...base, pipeRoughnessMm: 3 });
    expect(rough.conflictDetected).toBe(true);
    // Pierwsza rozbieżność to współczynnik tarcia (potem propaguje na stratę).
    expect(rough.firstDivergentId).toBe('frictionFactor');
  });

  it('oznacza dziedziny ważności obu wariantów', () => {
    const conflict = buildFrictionConflict();
    const r = evaluateConflict(conflict, { volumetricFlow: 0.05, pipeDiameter: 0.1, pipeRoughnessMm: 0.5 });
    expect(typeof r.inDomain['swamee-jain']).toBe('boolean');
    expect(typeof r.inDomain['blasius']).toBe('boolean');
  });
});
