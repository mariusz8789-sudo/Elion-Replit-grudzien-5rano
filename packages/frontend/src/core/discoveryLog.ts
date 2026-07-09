import { readJSON, writeJSON } from './storage';
import { getLabs } from './registry';

/**
 * Dziennik odkryć — lokalna gamifikacja bez żadnego backendu.
 *
 * Dwie warstwy, obie zasilane danymi, które i tak już płyną przez aplikację:
 *  1. Odwiedziny: który (lab, eksperyment) użytkownik otworzył — z LabShell.
 *  2. Osiągnięcia: progi fizyczne wyliczone z tych samych statystyk, które
 *     Narrator pokazuje na ekranie (sim.getStats()) — zero nowych obliczeń,
 *     tylko obserwacja istniejących, przetestowanych wartości.
 *
 * Celowo lokalne i offline: to notatnik odkrywcy na jego urządzeniu, nie
 * telemetria dla operatora (to osobny, jawnie opisany moduł: analytics.ts).
 */

export interface Achievement {
  id: string;
  labId: string;
  expId: string; // '__base' albo id eksperymentu
  title: string;
  description: string;
  check: (stats: Record<string, number>) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'bell-broken',
    labId: 'quantum',
    expId: 'chsh',
    title: 'Złamałeś nierówność Bella',
    description: 'Osiągnąłeś |S| > 2 w splątaniu kwantowym — wynik niemożliwy dla żadnej teorii lokalnych ukrytych zmiennych.',
    check: (s) => (s.S ?? 0) > 2.05 && (s.pairs ?? 0) > 500,
  },
  {
    id: 'tunneling-observed',
    labId: 'quantum',
    expId: 'tunneling',
    title: 'Zaobserwowałeś tunelowanie kwantowe',
    description: 'Pakiet falowy przeszedł przez barierę, której klasycznie nie mógłby pokonać.',
    check: (s) => (s.trans ?? 0) > 5,
  },
  {
    id: 'superposition-created',
    labId: 'quantum',
    expId: 'bloch',
    title: 'Stworzyłeś superpozycję kubitu',
    description: 'Doprowadziłeś kubit do stanu, w którym oba wyniki pomiaru są niemal równie prawdopodobne.',
    check: (s) => (s.p0 ?? 100) >= 40 && (s.p0 ?? 100) <= 60,
  },
  {
    id: 'criticality-reached',
    labId: 'nuclear',
    expId: 'chain',
    title: 'Osiągnąłeś stan krytyczny reaktora',
    description: 'Utrzymałeś k ≈ 1 — dokładnie ten stan, w którym pracują elektrownie jądrowe.',
    check: (s) => (s.k ?? 0) >= 0.95 && (s.k ?? 0) <= 1.05 && (s.neutrons ?? 0) > 5,
  },
  {
    id: 'ignition-reached',
    labId: 'nuclear',
    expId: 'tokamak',
    title: 'Osiągnąłeś zapłon plazmy',
    description: 'Potrójny iloczyn Lawsona przekroczył próg zapłonu fuzji D-T.',
    check: (s) => (s.ratio ?? 0) >= 1,
  },
  {
    id: 'all-resonances',
    labId: 'particle',
    expId: 'invmass',
    title: 'Odkryłeś wszystkie 4 rezonanse',
    description: 'W histogramie mas niezmienniczych wyłoniły się J/ψ, ψ(2S), Υ i Z⁰.',
    check: (s) => (s.peaks ?? 0) >= 4,
  },
  {
    id: 'einstein-ring',
    labId: 'einstein',
    expId: 'lensing',
    title: 'Zobaczyłeś pierścień Einsteina',
    description: 'Ustawiłeś źródło, soczewkę i obserwatora idealnie w jednej linii.',
    check: (s) => (s.beta ?? 1) <= 0.03,
  },
  {
    id: 'photon-sphere',
    labId: 'einstein',
    expId: 'geodesics',
    title: 'Zaobserwowałeś sferę fotonową',
    description: 'Fotony okrążające czarną dziurę zostały pochłonięte po przekroczeniu 1,5 rₛ.',
    check: (s) => (s.captured ?? 0) >= 3,
  },
  {
    id: 'galaxy-colonized',
    labId: 'civilization',
    expId: 'colonization',
    title: 'Skolonizowałeś niemal całe pole gwiazd',
    description: 'Front ekspansji objął ponad 90% symulowanego regionu.',
    check: (s) => (s.frac ?? 0) >= 90,
  },
  {
    id: 'half-life-5x',
    labId: 'nuclear',
    expId: '__base',
    title: 'Obserwowałeś 5 okresów półtrwania',
    description: 'Po 5 T½ zostaje mniej niż 3,2% pierwotnych jąder — zobaczyłeś to na żywo.',
    check: (s) => (s.halfLives ?? 0) >= 5,
  },
];

interface LogState {
  visited: string[]; // "labId/expId"
  unlocked: string[]; // achievement id
  unlockedAt: Record<string, string>; // achievement id -> ISO timestamp
}

const KEY = 'discovery-log/v1';

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

// Jak w settings.ts: localStorage może zawierać cokolwiek (ręczna edycja,
// stary format z przyszłej wersji) — .includes()/.map() na złym kształcie
// wywaliłoby cały ekran, więc każde pole jest walidowane osobno.
function sanitizeState(raw: Partial<LogState> | null | undefined): LogState {
  return {
    visited: isStringArray(raw?.visited) ? raw.visited : [],
    unlocked: isStringArray(raw?.unlocked) ? raw.unlocked : [],
    unlockedAt: raw?.unlockedAt && typeof raw.unlockedAt === 'object' ? raw.unlockedAt : {},
  };
}

function readState(): LogState {
  return sanitizeState(readJSON<Partial<LogState> | null>(KEY, null));
}

function visitKey(labId: string, expId: string): string {
  return `${labId}/${expId}`;
}

export function recordVisit(labId: string, expId: string): void {
  const state = readState();
  const key = visitKey(labId, expId);
  if (!state.visited.includes(key)) {
    state.visited = [...state.visited, key];
    writeJSON(KEY, state);
  }
}

export function recordStats(labId: string, expId: string, stats: Record<string, number>): void {
  if (Object.keys(stats).length === 0) return;
  const candidates = ACHIEVEMENTS.filter((a) => a.labId === labId && a.expId === expId);
  if (candidates.length === 0) return;
  const state = readState();
  let changed = false;
  for (const a of candidates) {
    if (state.unlocked.includes(a.id)) continue;
    if (a.check(stats)) {
      state.unlocked = [...state.unlocked, a.id];
      state.unlockedAt = { ...state.unlockedAt, [a.id]: new Date().toISOString() };
      changed = true;
    }
  }
  if (changed) writeJSON(KEY, state);
}

export function getLogState(): LogState {
  return readState();
}

export function getVisitedCount(): { visited: number; totalLabs: number } {
  const state = getLogState();
  const visitedLabs = new Set(state.visited.map((v) => v.split('/')[0]));
  return { visited: visitedLabs.size, totalLabs: getLabs().length };
}

export function isVisited(labId: string, expId: string): boolean {
  return getLogState().visited.includes(visitKey(labId, expId));
}
