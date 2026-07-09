import { describe, expect, it } from 'vitest';
import { registerDataSource, getDataSource, getDataSources } from '../core/dataSource';

describe('data source registry', () => {
  it('registers and retrieves a source by id', () => {
    registerDataSource({
      id: 'test-source-a',
      label: 'Testowe źródło A',
      citation: { label: 'Test Institute', confirmation: 'confirmed' },
      isSynthetic: false,
      load: () => [1, 2, 3],
    });
    const src = getDataSource<number[]>('test-source-a');
    expect(src?.load()).toEqual([1, 2, 3]);
    expect(src?.isSynthetic).toBe(false);
  });

  it('refuses to register a duplicate id', () => {
    registerDataSource({
      id: 'test-source-b',
      label: 'B',
      citation: { label: 'X', confirmation: 'speculation' },
      isSynthetic: true,
      load: () => null,
    });
    expect(() =>
      registerDataSource({
        id: 'test-source-b',
        label: 'B2',
        citation: { label: 'Y', confirmation: 'confirmed' },
        isSynthetic: false,
        load: () => null,
      }),
    ).toThrow(/już zarejestrowane/);
  });

  it('getDataSource returns undefined for an unknown id', () => {
    expect(getDataSource('does-not-exist')).toBeUndefined();
  });

  it('getDataSources lists every registered source', () => {
    registerDataSource({
      id: 'test-source-c',
      label: 'C',
      citation: { label: 'Z', confirmation: 'hypothesis' },
      isSynthetic: true,
      load: () => null,
    });
    const ids = getDataSources().map((s) => s.id);
    expect(ids).toContain('test-source-a');
    expect(ids).toContain('test-source-c');
  });
});
