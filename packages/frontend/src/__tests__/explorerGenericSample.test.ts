import { describe, expect, it } from 'vitest';
import { EXPLORER_ORGANS } from '../core/scientificWorlds/humanExplorer';
import { microCaption } from '../components/AnatomySelectionHUD';
import { createHistologySlide, buildCellModel } from '../core/scientificWorlds/humanLab/histology';
import { setLocale } from '../core/i18n';

describe('generic tissue samples are labelled, never silent', () => {
  it('flags exactly the organs without their own tissue model', () => {
    const generic = EXPLORER_ORGANS.filter((o) => o.genericSample).map((o) => o.organId).sort();
    expect(generic).toEqual(['left-kidney', 'right-kidney', 'small-intestine', 'stomach']);
    for (const o of EXPLORER_ORGANS) expect(o.genericSample === true).toBe(o.tissue === 'EPITHELIUM');
  });
  it('says "próbka ogólna" beside a generic slide and nothing beside an organ-specific one', () => {
    setLocale('pl');
    const slide = createHistologySlide('SPEC-1', 'EPITHELIUM');
    const cell = buildCellModel(slide, 7);
    expect(microCaption({ kind: 'histology', slide, cell }, true)?.title).toContain('próbka ogólna, nie z tego narządu');
    const heart = createHistologySlide('SPEC-2', 'CARDIAC');
    expect(microCaption({ kind: 'histology', slide: heart, cell: buildCellModel(heart, 7) })?.title).not.toContain('ogólna');
  });
});
