import { readJSON, writeJSON } from './storage';

/**
 * Ustawienia użytkownika — wyłącznie lokalne (localStorage), zero backendu.
 * Prosty magazyn z subskrypcją: komponenty wołają useSettings() (patrz
 * hooks poniżej) zamiast prop-drillingu przez całe drzewo aplikacji.
 */

export interface Settings {
  /** Wymusza prefers-reduced-motion niezależnie od ustawień systemowych. */
  reducedMotion: boolean;
  /** Wyższy kontrast tekstu/obramowań dla słabszego wzroku. */
  highContrast: boolean;
  /** Gęstszy układ panelu Narratora (mniejszy tekst, mniej odstępów). */
  compactNarrator: boolean;
  /** Lokalne, anonimowe liczniki użycia (patrz core/analytics.ts) — możliwe do wyłączenia. */
  analyticsEnabled: boolean;
}

const DEFAULTS: Settings = {
  reducedMotion: false,
  highContrast: false,
  compactNarrator: false,
  analyticsEnabled: true,
};

const KEY = 'settings/v1';

// localStorage jest edytowalny poza aplikacją (DevTools, ręczna zmiana klucza) —
// każde pole jest więc walidowane osobno zamiast ufać całemu zapisanemu obiektowi.
function sanitize(raw: Partial<Settings> | null | undefined): Settings {
  return {
    reducedMotion: typeof raw?.reducedMotion === 'boolean' ? raw.reducedMotion : DEFAULTS.reducedMotion,
    highContrast: typeof raw?.highContrast === 'boolean' ? raw.highContrast : DEFAULTS.highContrast,
    compactNarrator: typeof raw?.compactNarrator === 'boolean' ? raw.compactNarrator : DEFAULTS.compactNarrator,
    analyticsEnabled: typeof raw?.analyticsEnabled === 'boolean' ? raw.analyticsEnabled : DEFAULTS.analyticsEnabled,
  };
}

let current: Settings = sanitize(readJSON<Partial<Settings> | null>(KEY, null));
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  writeJSON(KEY, current);
  listeners.forEach((fn) => fn(current));
  applyDocumentFlags(current);
}

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Odzwierciedla ustawienia jako klasy na <html>, żeby CSS mógł na nie reagować globalnie. */
export function applyDocumentFlags(s: Settings): void {
  const root = document.documentElement;
  root.classList.toggle('force-reduced-motion', s.reducedMotion);
  root.classList.toggle('high-contrast', s.highContrast);
}

// Zastosuj przy starcie modułu (import w main.tsx, przed pierwszym renderem).
if (typeof document !== 'undefined') applyDocumentFlags(current);
