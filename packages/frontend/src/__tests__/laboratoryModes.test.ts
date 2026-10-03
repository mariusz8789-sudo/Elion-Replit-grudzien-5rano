import { describe, expect, it } from 'vitest';
import { LABORATORY_MODES, laboratoryModeOf } from '../core/laboratoryModes';
import { NAV_SECTIONS } from '../core/navigation';

describe('one Laboratory with modes', () => {
  it('has exactly one Laboratory entry in the main navigation', () => {
    // Since the 3 Oct IA the Laboratory is a place in Explore, no longer a mobile tab.
    const main = NAV_SECTIONS.flatMap((s) => s.items).filter((i) => /lab/i.test(i.label));
    expect(main.map((i) => i.id)).toEqual(['scientific-worlds']);
  });
  it('every mode resolves back to itself and the first mode is the canonical entry', () => {
    for (const mode of LABORATORY_MODES) expect(laboratoryModeOf(mode.hash)).toBe(mode.id);
    expect(LABORATORY_MODES[0].hash).toBe('#/scientific-worlds');
    expect(laboratoryModeOf('#/lab-3d')).toBe('scenarios');
  });
});
