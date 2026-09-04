import { describe, expect, it } from 'vitest';
import '../labs/index';
import { buildSearchIndex, filterSearchIndex } from '../core/search';
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
});
