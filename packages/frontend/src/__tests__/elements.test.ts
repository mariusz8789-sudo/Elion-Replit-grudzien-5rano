import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../data/elements';

describe('periodic table data', () => {
  it('has all 118 known elements', () => {
    expect(ELEMENTS.length).toBe(118);
  });

  it('atomic numbers are sequential starting at 1', () => {
    ELEMENTS.forEach((el, i) => expect(el.z).toBe(i + 1));
  });

  it('symbols are unique', () => {
    const symbols = ELEMENTS.map((e) => e.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('every element has a positive atomic mass', () => {
    for (const el of ELEMENTS) {
      expect(el.mass, `${el.symbol} mass`).toBeGreaterThan(0);
    }
  });

  it('grid position falls within an 18-column, 9-row layout', () => {
    for (const el of ELEMENTS) {
      expect(el.col, `${el.symbol} col`).toBeGreaterThanOrEqual(1);
      expect(el.col, `${el.symbol} col`).toBeLessThanOrEqual(18);
      expect(el.row, `${el.symbol} row`).toBeGreaterThanOrEqual(1);
      expect(el.row, `${el.symbol} row`).toBeLessThanOrEqual(9);
    }
  });

  it('shell electron counts sum to the atomic number (neutral atom)', () => {
    for (const el of ELEMENTS) {
      const total = el.shells.reduce((a, b) => a + b, 0);
      expect(total, `${el.symbol} (Z=${el.z}) shells sum`).toBe(el.z);
    }
  });

  it('spot-checks well-known elements', () => {
    const h = ELEMENTS.find((e) => e.symbol === 'H')!;
    expect(h.z).toBe(1);
    expect(h.name).toBe('Wodór');

    const fe = ELEMENTS.find((e) => e.symbol === 'Fe')!;
    expect(fe.z).toBe(26);

    const u = ELEMENTS.find((e) => e.symbol === 'U')!;
    expect(u.z).toBe(92);

    const og = ELEMENTS.find((e) => e.symbol === 'Og')!;
    expect(og.z).toBe(118);
  });
});
