import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLab, getLabs, registerLab } from '../core/registry';
import type { LabDefinition } from '../core/types';

describe('plugin registry', () => {
  it('registers exactly the 10 shipped labs', () => {
    expect(getLabs().length).toBe(10);
    const ids = getLabs().map((l) => l.id).sort();
    expect(ids).toEqual([
      'atom',
      'civilization',
      'discovery',
      'einstein',
      'multiverse',
      'nuclear',
      'particle',
      'quantum',
      'spacetime',
      'universe',
    ]);
  });

  it('getLab returns the registered lab by id', () => {
    const lab = getLab('quantum');
    expect(lab?.id).toBe('quantum');
  });

  it('getLab returns undefined for an unknown id', () => {
    expect(getLab('does-not-exist')).toBeUndefined();
  });

  it('refuses to register a duplicate id', () => {
    const duplicate = { id: 'universe' } as unknown as LabDefinition;
    expect(() => registerLab(duplicate)).toThrow(/już zarejestrowane/);
  });

  it('getLabs() is stable across calls (same underlying registry)', () => {
    expect(getLabs()).toBe(getLabs());
  });
});
