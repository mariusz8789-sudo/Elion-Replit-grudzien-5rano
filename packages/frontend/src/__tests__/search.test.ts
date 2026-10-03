import { describe, expect, it } from 'vitest';
import '../labs/index';
import { buildDestinationIndex, buildSearchIndex, filterSearchIndex } from '../core/search';
import { getLabs } from '../core/registry';

describe('search index', () => {
  it('includes one base entry per lab plus one per experiment', () => {
    const index = buildSearchIndex();
    const labs = getLabs();
    const expectedCount = labs.reduce((sum, l) => sum + 1 + (l.experiments?.length ?? 0), 0);
    expect(index.length).toBe(expectedCount);
    // Every lab must contribute at least its base entry.
    for (const lab of labs) {
      expect(index.some((e) => e.labId === lab.id && e.expId === '__base')).toBe(true);
    }
  });

  it('filters case-insensitively and ignores Polish diacritics', () => {
    const index = buildSearchIndex();
    const byAscii = filterSearchIndex(index, 'splatanie');
    const byDiacritic = filterSearchIndex(index, 'Splątanie');
    expect(byAscii.length).toBeGreaterThan(0);
    expect(byAscii.map((e) => `${e.labId}/${e.expId}`)).toEqual(byDiacritic.map((e) => `${e.labId}/${e.expId}`));
    expect(byAscii.some((e) => e.labId === 'quantum' && e.expId === 'chsh')).toBe(true);
  });

  it('returns an empty array for a blank query', () => {
    const index = buildSearchIndex();
    expect(filterSearchIndex(index, '')).toEqual([]);
    expect(filterSearchIndex(index, '   ')).toEqual([]);
  });

  it('returns no results for a query matching nothing', () => {
    const index = buildSearchIndex();
    expect(filterSearchIndex(index, 'xyzzy-nonexistent-query')).toEqual([]);
  });

  it('finds CERN, drugs and the human atlas, which are screens, not plugin labs', () => {
    const index = buildDestinationIndex();
    // Order follows the navigation (main places first) since destinations derive from core/navigation.ts.
    expect(filterSearchIndex(index, 'cern').map((e) => e.hash).sort()).toEqual(['#/cern-complex', '#/physics/cms-z']);
    expect(filterSearchIndex(index, 'leki').map((e) => e.hash)).toContain('#/drug');
    expect(filterSearchIndex(index, 'mózg').map((e) => e.hash)).toContain('#/human-biology-lab');
  });

  it('every main navigation place with a route is a search destination, with its menu name', async () => {
    const { NAV_SECTIONS } = await import('../core/navigation');
    const hashes = buildDestinationIndex().map((e) => e.hash);
    for (const item of NAV_SECTIONS.flatMap((s) => s.items)) {
      if (item.hash && item.hash !== '#/') expect(hashes, item.id).toContain(item.hash);
    }
    expect(buildDestinationIndex('en').find((e) => e.hash === '#/flight-control')?.labName).toBe('Science Flight Control');
    expect(filterSearchIndex(buildDestinationIndex(), 'hypothesis').map((e) => e.hash)).toContain('#/inquiry');
  });

  it('finds the Reality Navigator by plain words in Polish and English', () => {
    const index = buildDestinationIndex();
    for (const query of ['orbita', 'reality navigator', 'zapis sceny']) {
      expect(filterSearchIndex(index, query).some((e) => e.hash === '#/reality'), query).toBe(true);
    }
  });
});
