import { afterEach, describe, expect, it } from 'vitest';
import { t, getLocale, setLocale, subscribeLocale } from '../core/i18n';

afterEach(() => {
  setLocale('pl');
});

describe('i18n', () => {
  it('defaults to Polish', () => {
    expect(getLocale()).toBe('pl');
    expect(t('nav.search')).toBe('Szukaj');
  });

  it('returns the key itself when no translation exists anywhere (visible, not silent)', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('falls back to Polish when the active locale is missing a key', () => {
    setLocale('en');
    // en dictionary is intentionally empty today — every key must fall back.
    expect(t('nav.settings')).toBe('Ustawienia');
  });

  it('notifies subscribers when the locale changes', () => {
    let seen: string | null = null;
    const unsub = subscribeLocale((l) => {
      seen = l;
    });
    setLocale('en');
    expect(seen).toBe('en');
    unsub();
    setLocale('pl');
    expect(seen).toBe('en'); // unsubscribed — no further updates
  });
});
