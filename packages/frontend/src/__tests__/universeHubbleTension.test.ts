import { describe, expect, it } from 'vitest';
import { universeHubbleTension } from '../labs/experiments/universe-hubbletension';

describe('napięcie Hubble\'a — ExperimentDef', () => {
  it('narracja działa z i bez TRGB, dla różnych poziomów dodatkowej systematyki', () => {
    for (const showTrgb of [true, false]) {
      for (const extraSystematic of [0, 1, 3]) {
        const blocks = universeHubbleTension.narrate(
          { showTrgb, extraSystematic },
          { tensionSigma: 4.9, shoesH0: 73.04, planckH0: 67.4, gapPercent: 8.4 },
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
