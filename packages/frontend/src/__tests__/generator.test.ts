import { describe, it, expect, beforeEach } from 'vitest';
import { normalize, resolveQuery } from '../core/generator/resolve';
import { registerRecipe, getRecipes, _resetRecipes } from '../core/generator/recipe';
import { registerCatalog } from '../core/generator/catalog';

describe('generator: normalize', () => {
  it('strips Polish diacritics and punctuation, lowercases', () => {
    expect(normalize('Dylatacja CZASU przy prędkości bliskiej światła!')).toBe(
      'dylatacja czasu przy predkosci bliskiej swiatla',
    );
    expect(normalize('Zbuduj most Einsteina-Rosena')).toBe('zbuduj most einsteina rosena');
    expect(normalize('  wiele   spacji  ')).toBe('wiele spacji');
  });
});

describe('generator: resolveQuery against a tiny fixture registry', () => {
  beforeEach(() => {
    _resetRecipes();
    registerRecipe({
      id: 'orbit', title: 'Orbita', category: 'cosmology',
      aliases: ['orbita', 'masa gwiazdy'], labId: 'universe', honesty: 'exact', summary: '',
    });
    registerRecipe({
      id: 'chaos', title: 'Chaos', category: 'math',
      aliases: ['chaos', 'atraktor lorenza'], labId: 'universe', honesty: 'exact', summary: '',
    });
  });

  it('returns null best when nothing matches (never fabricates a model)', () => {
    const r = resolveQuery('zupełnie niezwiązane zdanie o kanapkach');
    expect(r.best).toBeNull();
    expect(r.alternatives).toEqual([]);
  });

  it('matches a single keyword', () => {
    const r = resolveQuery('pokaz chaos');
    expect(r.best?.recipe.id).toBe('chaos');
    expect(r.best?.matched).toContain('chaos');
  });

  it('a multi-word alias phrase scores by specificity (word count)', () => {
    // "masa gwiazdy" is a 2-word alias -> weight 2 when the exact phrase appears.
    const r = resolveQuery('jaka jest masa gwiazdy w tym ukladzie');
    expect(r.best?.recipe.id).toBe('orbit');
    expect(r.best?.score).toBeGreaterThanOrEqual(2);
  });
});

describe('generator: real catalog integrity', () => {
  beforeEach(() => {
    _resetRecipes();
    registerCatalog();
  });

  it('registers a non-trivial catalog, all pointing at real labs', () => {
    const recipes = getRecipes();
    expect(recipes.length).toBeGreaterThanOrEqual(15);
    const knownLabs = new Set(['universe', 'spacetime', 'einstein', 'quantum', 'chemistry', 'civilization', 'biology']);
    for (const r of recipes) {
      expect(knownLabs.has(r.labId), `recipe ${r.id} -> unknown lab ${r.labId}`).toBe(true);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.aliases.length).toBeGreaterThan(0);
    }
  });

  it('recipe ids are unique', () => {
    const ids = getRecipes().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves the flagship natural-language prompts from the directive', () => {
    const cases: [string, string][] = [
      ['Zasymuluj dylatację czasu przy prędkości bliskiej światła', 'time-dilation'],
      ['Zasymuluj paradoks bliźniąt', 'twin-paradox'],
      ['Pokaż powstawanie czarnej dziury', 'black-hole'],
      ['Pokaż paradoks Fermiego', 'fermi-paradox'],
      ['Pokaż, co stanie się z orbitą planety, jeśli zwiększymy masę gwiazdy 2 razy', 'orbit-star-mass'],
      ['atraktor Lorenza', 'lorenz'],
      ['problem trzech ciał', 'three-body'],
      ['soczewkowanie grawitacyjne', 'gravitational-lensing'],
      ['zasymuluj epidemię na fikcyjnej wyspie', 'epidemic-sir'],
      ['pokaż epidemię na lotnisku z agentami', 'epidemic-airport'],
      ['model agentowy epidemii', 'epidemic-airport'],
    ];
    for (const [prompt, expectedId] of cases) {
      const r = resolveQuery(prompt);
      expect(r.best?.recipe.id, `prompt "${prompt}" should resolve to ${expectedId}`).toBe(expectedId);
    }
  });

  it('disambiguates island (compartmental) vs airport (agent-based) epidemic', () => {
    expect(resolveQuery('epidemia na wyspie').best?.recipe.id).toBe('epidemic-sir');
    expect(resolveQuery('epidemia na lotnisku').best?.recipe.id).toBe('epidemic-airport');
    expect(resolveQuery('kwarantanna i izolacja na lotnisku').best?.recipe.id).toBe('epidemic-airport');
  });
});
