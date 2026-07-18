/**
 * i18n — one source of truth for UI text. Production-grade seam:
 *  - translation FILES only (locales/en.ts, locales/pl.ts), never inline strings here;
 *  - persisted user choice (localStorage) + browser-language default;
 *  - {name}-style interpolation and Intl.PluralRules-based plurals (tp);
 *  - a React hook (useI18n) that re-renders subscribers when the language changes;
 *  - adding a language = one more file + one LOCALES entry (Spanish/German/French/
 *    Arabic/Chinese drop in with no code change here).
 *
 * The existing seam (t / getLocale / setLocale / subscribeLocale) is preserved so no
 * caller breaks; this only extends it.
 */
import { useSyncExternalStore } from 'react';
import { en } from './locales/en';
import { pl } from './locales/pl';

export type Locale = 'pl' | 'en';

/** Registered languages, in switcher order. Add a locale here + a dictionary to ship it. */
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];

type Dictionary = Record<string, string>;
const DICTIONARIES: Record<Locale, Dictionary> = { en, pl };
// Same prefixed key shape as storage.ts, but accessed directly here: i18n initializes at
// module load, and must NOT trip storage.ts's cached availability probe (which would poison
// the localStorage-backed stores when window is stubbed later, e.g. in tests).
const STORAGE_KEY = 'genesis-os:locale/v1';

function isLocale(v: unknown): v is Locale {
  return v === 'pl' || v === 'en';
}

function readSaved(): Locale | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Locale) : null;
  } catch { return null; }
}
function writeSaved(locale: Locale): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locale)); } catch { /* unavailable — in-memory only */ }
}

function detectInitial(): Locale {
  const saved = readSaved();
  if (isLocale(saved)) return saved;
  const nav = typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  return nav.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

let currentLocale: Locale = detectInitial();
const listeners = new Set<(locale: Locale) => void>();
const pluralRules: Record<Locale, Intl.PluralRules> = {
  en: new Intl.PluralRules('en'),
  pl: new Intl.PluralRules('pl'),
};

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === currentLocale) return;
  currentLocale = locale;
  writeSaved(locale);
  listeners.forEach((fn) => fn(currentLocale));
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Translate a key. Falls back active → English → the key itself (a visible miss, never blank). */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = DICTIONARIES[currentLocale][key] ?? en[key] ?? key;
  return interpolate(raw, params);
}

/** Plural-aware translate: picks `${key}.${category}` for the count (one/few/many/other). */
export function tp(key: string, count: number, params: Record<string, string | number> = {}): string {
  const category = pluralRules[currentLocale].select(count);
  const dict = DICTIONARIES[currentLocale];
  const raw = dict[`${key}.${category}`] ?? dict[`${key}.other`] ?? en[`${key}.other`] ?? en[`${key}.one`] ?? key;
  return interpolate(raw, { count, ...params });
}

/**
 * React hook: subscribes to language changes so the component re-renders and re-runs t().
 * Returns the live locale plus the (stable) t/tp/setLocale helpers.
 */
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return { locale, t, tp, setLocale };
}
