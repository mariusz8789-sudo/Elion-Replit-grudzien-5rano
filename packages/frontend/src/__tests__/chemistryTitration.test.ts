import { describe, expect, it } from 'vitest';
import { chemistryTitration, runTitrationScenario } from '../labs/experiments/chemistry-titration';

describe('miareczkowanie kwas-zasada — ExperimentDef', () => {
  it('narracja działa dla wszystkich kwasów i pełnego zakresu objętości', () => {
    for (const acid of ['acetic', 'formic', 'benzoic', 'hcn']) {
      for (const vb of [0, 5, 12.5, 24, 25, 26, 40, 60]) {
        const blocks = chemistryTitration.narrate(
          { acid, vb },
          { ph: 5, vb, veq: 25, pKa: 4.74 },
        );
        expect(blocks.length).toBeGreaterThan(0);
        for (const block of blocks) {
          expect(block.title.length).toBeGreaterThan(0);
          expect(block.body.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('używa wspólnego solvera bilansu ładunku dla reprodukowalnego runu', () => {
    const result = runTitrationScenario({ acid: 'acetic', vb: 25 });
    expect(runTitrationScenario({ acid: 'acetic', vb: 25 })).toEqual(result);
    expect(result.veq).toBeCloseTo(25, 12);
    expect(result.ph).toBeGreaterThan(7);
    expect(result.pKa).toBeCloseTo(-Math.log10(1.8e-5), 12);
  });

  it('odrzuca kwas lub objętość poza domeną Canvasu', () => {
    expect(() => runTitrationScenario({ acid: 'unknown' })).toThrow('acid');
    expect(() => runTitrationScenario({ vb: 61 })).toThrow('vb');
  });
});
