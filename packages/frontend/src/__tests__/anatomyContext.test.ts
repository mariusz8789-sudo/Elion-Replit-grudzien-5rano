import { describe, expect, it } from 'vitest';
import { anatomyContextOf, discoveryContextFor, epistemicOf, focusLevel, FOCUS_PATH } from '../core/three/anatomyContext';
import { EXPLORE_BODY } from '../core/three/anatomyExplore';
import { buildCellModel, createHistologySlide } from '../core/scientificWorlds/humanLab/histology';

describe('Human Explorer focus path and discovery hooks', () => {
  it('reads one path from the body to the microscope', () => {
    expect(FOCUS_PATH).toEqual(['BODY', 'REGION', 'ORGAN', 'STRUCTURE', 'TISSUE', 'CELL', 'MICROSCOPY']);
    expect(focusLevel(EXPLORE_BODY, null)).toBe('BODY');
    const organ = { level: 'ORGAN', regionId: 'chest', organId: 'heart', structure: null } as const;
    const slide = createHistologySlide('S', 'CARDIAC');
    expect(focusLevel(organ, { kind: 'histology', slide, cell: buildCellModel(slide, 1) })).toBe('TISSUE');
  });
  it('shows nothing invented: every discovery field is empty and says why', () => {
    const d = discoveryContextFor(anatomyContextOf({ level: 'ORGAN', regionId: 'chest', organId: 'heart', structure: null }, null));
    expect(Object.values(d).map((a) => a.status)).toEqual(['NOT_YET_AVAILABLE', 'NOT_YET_AVAILABLE', 'NOT_YET_AVAILABLE', 'NOT_YET_AVAILABLE', 'NOT_YET_AVAILABLE', 'NOT_YET_MEASURED']);
    expect(anatomyContextOf(EXPLORE_BODY, null).targetIds).toEqual([]);
    expect(epistemicOf('MICROSCOPY')).toBe('MODEL');
  });
});
