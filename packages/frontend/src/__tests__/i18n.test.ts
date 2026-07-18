/**
 * i18n seam (production-grade). Guards the translation layer: EN/PL key parity (a missing
 * translation fails here, never leaks as English-in-Polish), interpolation, per-locale
 * plural selection (Polish one/few/many), key-fallback, and live switching + subscription.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { t, tp, getLocale, setLocale, subscribeLocale, LOCALES } from '../core/i18n';
import { en } from '../core/locales/en';
import { pl } from '../core/locales/pl';

afterEach(() => { setLocale('en'); });

const PLURAL_BASES = ['dash.projects', 'dash.needCount', 'attn.comments', 'attn.awaiting'];
const stripPlural = (k: string) => k.replace(/\.(one|two|few|many|other)$/, '');

describe('translation coverage', () => {
  it('EN and PL cover the same message keys (plural categories may differ by language)', () => {
    const enBase = new Set(Object.keys(en).map(stripPlural));
    const plBase = new Set(Object.keys(pl).map(stripPlural));
    const missingInPl = [...enBase].filter((k) => !plBase.has(k));
    const missingInEn = [...plBase].filter((k) => !enBase.has(k));
    expect(missingInPl, `missing in PL: ${missingInPl.join(', ')}`).toEqual([]);
    expect(missingInEn, `missing in EN: ${missingInEn.join(', ')}`).toEqual([]);
  });

  it('every plural key has the categories its locale requires (EN one/other, PL one/few/many)', () => {
    for (const base of PLURAL_BASES) {
      for (const cat of ['one', 'other']) expect(en[`${base}.${cat}`], `en ${base}.${cat}`).toBeTruthy();
      for (const cat of ['one', 'few', 'many']) expect(pl[`${base}.${cat}`], `pl ${base}.${cat}`).toBeTruthy();
    }
  });

  it('no translation value is empty', () => {
    for (const [k, v] of Object.entries(en)) expect(v.length, `en.${k}`).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(pl)) expect(v.length, `pl.${k}`).toBeGreaterThan(0);
  });

  it('registers every shipped language', () => {
    expect(LOCALES.map((l) => l.code).sort()).toEqual(['en', 'pl']);
  });
});

describe('t()', () => {
  it('translates by active locale and switches live', () => {
    setLocale('en');
    expect(t('common.signOut')).toBe('Sign out');
    setLocale('pl');
    expect(getLocale()).toBe('pl');
    expect(t('common.signOut')).toBe('Wyloguj');
  });

  it('interpolates named params', () => {
    setLocale('en');
    expect(t('dash.greeting.morning', { name: 'Ada' })).toBe('Good morning, Ada');
  });

  it('returns the key itself when unknown (visible miss, never blank)', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });
});

describe('tp() plural selection', () => {
  it('English one/other', () => {
    setLocale('en');
    expect(tp('dash.projects', 1)).toBe('1 project');
    expect(tp('dash.projects', 5)).toBe('5 projects');
  });
  it('Polish one/few/many', () => {
    setLocale('pl');
    expect(tp('dash.projects', 1)).toBe('1 projekt');
    expect(tp('dash.projects', 3)).toBe('3 projekty');
    expect(tp('dash.projects', 5)).toBe('5 projektów');
  });
});

describe('subscription', () => {
  it('notifies subscribers with the new locale and stops after unsubscribe', () => {
    setLocale('en');
    let seen: string | null = null;
    const unsub = subscribeLocale((l) => { seen = l; });
    setLocale('pl');
    expect(seen).toBe('pl');
    unsub();
    setLocale('en');
    expect(seen).toBe('pl'); // no further updates after unsubscribe
  });
});
