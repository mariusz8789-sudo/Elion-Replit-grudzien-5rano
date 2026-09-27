import { describe, expect, it } from 'vitest';
import { TARGET_ANATOMY_CAVEAT_PL, listTargetAnatomy, targetAnatomy, targetAnatomyRoute } from '../core/liveExperiment/targetAnatomy';
import type { OrganSystemId } from '../core/scientificWorlds/humanLab/types';

const SYSTEMS: readonly OrganSystemId[] = ['INTEGUMENTARY', 'SKELETAL', 'MUSCULAR', 'NERVOUS', 'ENDOCRINE', 'CARDIOVASCULAR', 'LYMPHATIC', 'RESPIRATORY', 'DIGESTIVE', 'URINARY', 'REPRODUCTIVE', 'IMMUNE'];

describe('targetAnatomy — where a docked target sits in the body', () => {
  it('maps the shipped imatinib target (ABL1_1IEP) to the blood-forming tissue, with its public record', () => {
    const abl1 = targetAnatomy('ABL1_1IEP');
    expect(abl1).not.toBeNull();
    expect(abl1!.system).toBe('CARDIOVASCULAR');
    expect(abl1!.alsoSystems).toContain('SKELETAL');
    expect(abl1!.sitePl).toContain('szpik');
    expect(abl1!.basis).toContain('P00519');
  });

  it('gives no location for a target it has no record of — the UI must say so, never guess an organ', () => {
    expect(targetAnatomy('UNKNOWN_TARGET')).toBeNull();
    expect(targetAnatomy(null)).toBeNull();
    expect(targetAnatomy(undefined)).toBeNull();
    expect(targetAnatomy('')).toBeNull();
  });

  it('every entry names a twin system, a Polish site and a public basis, and never claims drug action', () => {
    for (const entry of listTargetAnatomy()) {
      expect(SYSTEMS).toContain(entry.system);
      for (const s of entry.alsoSystems) expect(SYSTEMS).toContain(s);
      expect(entry.sitePl.length).toBeGreaterThan(10);
      expect(entry.basis).toMatch(/UniProt P\d{5}/);
      expect(entry.sitePl.toLowerCase()).not.toMatch(/działa|leczy|symulac/);
    }
    expect(TARGET_ANATOMY_CAVEAT_PL).toContain('nie symulacja działania leku');
  });

  it('routes to the biology lab with the target id in the query', () => {
    expect(targetAnatomyRoute('ABL1_1IEP')).toBe('#/human-biology-lab?target=ABL1_1IEP');
  });
});
