/**
 * Bezpieczny dostęp do localStorage.
 *
 * localStorage rzuca wyjątek w trybie prywatnym Safari (iOS) przy pełnym
 * dysku i bywa wyłączony politykami przeglądarki — bez tej warstwy jedna
 * awaria zapisu ustawień potrafiłaby wywalić całą aplikację (patrz
 * ErrorBoundary). Wszystkie funkcje są cichymi no-op przy braku dostępu:
 * aplikacja ma pozostać w pełni użyteczna bez trwałości danych.
 */

const PREFIX = 'genesis-os:';

function available(): boolean {
  try {
    const k = `${PREFIX}__probe__`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

let cachedAvailable: boolean | null = null;
function isAvailable(): boolean {
  if (cachedAvailable === null) cachedAvailable = available();
  return cachedAvailable;
}

export function readJSON<T>(key: string, fallback: T): T {
  if (!isAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): boolean {
  if (!isAvailable()) return false;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false; // np. QuotaExceededError — aplikacja działa dalej bez zapisu
  }
}

export function remove(key: string): void {
  if (!isAvailable()) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* brak dostępu — nic do zrobienia */
  }
}

/** Usuwa WSZYSTKIE dane Genesis OS (przycisk „wyczyść dane lokalne" w Ustawieniach). */
export function clearAll(): void {
  if (!isAvailable()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* brak dostępu — nic do zrobienia */
  }
}

export function storageAvailable(): boolean {
  return isAvailable();
}
