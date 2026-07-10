import { readJSON, writeJSON, remove } from './storage';
import { getSettings } from './settings';

/**
 * Architektura analityki — w 100% lokalna, w 100% opt-out, ZERO transmisji
 * na zewnątrz. Nie ma tu żadnego SDK trzeciej strony i żadnego endpointu
 * sieciowego — to celowe, dopóki nie podejmiesz świadomej decyzji o usłudze
 * analitycznej (patrz ARCHITECTURE.md § Punkty rozszerzeń).
 *
 * Dziś służy wyłącznie do zasilania panelu „Twoja aktywność" w Ustawieniach
 * (ciekawostka dla użytkownika, nie telemetria dla operatora). Gdy padnie
 * decyzja o realnej analityce produktowej, ten moduł jest jedynym miejscem
 * do podmiany: zamień track() na wysyłkę do wybranej usługi, zachowując
 * dokładnie te same wywołania w całym kodzie.
 */

export type AnalyticsEvent =
  | 'experiment_open'
  | 'ask_ai_used'
  | 'search_used'
  | 'shortcut_used'
  | 'discovery_log_viewed'
  | 'glossary_viewed'
  | 'custom_experiment_run'
  | 'custom_experiment_saved'
  | 'what_if_opened';

interface Counters {
  [event: string]: number;
}

const KEY = 'analytics/v1';

// Jak w settings.ts / discoveryLog.ts: localStorage jest edytowalny poza
// aplikacją, więc wartości liczników są walidowane osobno zamiast ufać
// całemu zapisanemu obiektowi (NaN/string/undefined nie mogą wywalić panelu).
function sanitizeCounters(raw: Partial<Counters> | null | undefined): Counters {
  const out: Counters = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

function readCounters(): Counters {
  return sanitizeCounters(readJSON<Partial<Counters> | null>(KEY, null));
}

export function track(event: AnalyticsEvent, _meta?: Record<string, string>): void {
  if (!getSettings().analyticsEnabled) return;
  const counters = readCounters();
  counters[event] = (counters[event] ?? 0) + 1;
  writeJSON(KEY, counters);
}

export function getCounters(): Counters {
  return readCounters();
}

export function clearAnalytics(): void {
  remove(KEY);
}
