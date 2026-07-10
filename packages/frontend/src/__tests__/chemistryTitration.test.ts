import { describe, expect, it } from 'vitest';
import { chemistryTitration } from '../labs/experiments/chemistry-titration';

describe('miareczkowanie kwas-zasada — ExperimentDef', () => {
  it('narracja działa dla wszystkich kwasów i pełnego zakresu objętości', () => {
    for (const acid of ['acetic', 'formic', 'benzoic', 'hcn']) {
      for (const vb of [0, 5, 12.5, 24, 25, 26, 40, 60]) {
        const blocks = chemistryTitration.narrate(
          { acid, vb },
          { ph: 5, vb, veq: 25, pKa: 4.74 },
        );
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) {
          expect(b.title.length).toBeGreaterThan(0);
          expect(b.body.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
