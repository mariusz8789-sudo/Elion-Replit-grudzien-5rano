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
  /** Krótkie, subtelne dźwięki UI (patrz core/sound.ts) — jeden przełącznik globalny. */
  soundEnabled: boolean;
  /**
   * Tryb badawczy (Faza 2: Collaborative Scientific Discovery). Domyślnie OFF —
   * domyślną twarzą aplikacji jest produkt edukacyjny (laboratoria + Timeline).
   * Po włączeniu odsłania stos badawczy (Kampania naukowa, Drug Discovery, CDE,
   * MCRE, Projekty chmurowe, Reality Navigator, Machine Pre-Build). NIC nie jest
   * usuwane — flaga tylko decyduje, co jest widoczne na stronie głównej; trasy
   * (#/campaign, #/drug, …) działają zawsze, także z deep-linku.
   */
  researchModeEnabled: boolean;
}

const DEFAULTS: Settings = {
  reducedMotion: false,
  highContrast: false,
  compactNarrator: false,
  analyticsEnabled: true,
  soundEnabled: true,
  researchModeEnabled: false,
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
    soundEnabled: typeof raw?.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULTS.soundEnabled,
    researchModeEnabled: typeof raw?.researchModeEnabled === 'boolean' ? raw.researchModeEnabled : DEFAULTS.researchModeEnabled,
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
  if (typeof document === 'undefined') return; // np. testy jednostkowe bez DOM
  const root = document.documentElement;
  root.classList.toggle('force-reduced-motion', s.reducedMotion);
  root.classList.toggle('high-contrast', s.highContrast);
}

// Zastosuj przy starcie modułu (import w main.tsx, przed pierwszym renderem).
if (typeof document !== 'undefined') applyDocumentFlags(current);
