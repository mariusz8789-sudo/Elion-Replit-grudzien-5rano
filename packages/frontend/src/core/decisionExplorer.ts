import { readJSON, writeJSON } from './storage';

/**
 * Quantum Decision Explorer — narzędzie narracyjne/refleksyjne, NIE model
 * fizyczny. Wizualnie inspirowane fizyką (galaktyka gwiazd-decyzji), ale
 * nie twierdzi NIC o rzeczywistej strukturze rzeczywistości ani nie
 * przewiduje przyszłości — patrz stały baner ostrzegawczy w
 * QuantumDecisionExplorer.tsx i knowledge/quantum-decision-explorer.md.
 *
 * Dane w 100% lokalne (localStorage, core/storage.ts) — to osobisty
 * notatnik użytkownika, nie telemetria ani konto.
 */

export interface Decision {
  id: string;
  /** Krótki tytuł, np. "Zmiana kierunku studiów". */
  label: string;
  /** 1-2 zdania kontekstu. */
  description: string;
  /** Rok (opcjonalny porządek chronologiczny na osi). */
  year: number;
  /** 1-10: subiektywna "waga" decyzji — steruje jasnością gwiazdy, nic więcej. */
  weight: number;
  /** Alternatywne ścieżki ("gdyby..."), 1-4 pozycje. */
  branches: string[];
}

const KEY = 'decision-explorer/v1';
const MAX_LABEL = 80;
const MAX_DESCRIPTION = 400;
const MAX_BRANCH = 160;
const MAX_BRANCHES = 4;
const MAX_DECISIONS = 40;

/** Przykładowe decyzje pokazywane przy pierwszym uruchomieniu — jawnie do edycji/usunięcia. */
export const EXAMPLE_DECISIONS: Decision[] = [
  {
    id: 'example-1',
    label: 'Wybór kierunku studiów',
    description: 'Moment, w którym trzeba było zdecydować, w jaką stronę pójść na starcie dorosłego życia.',
    year: 2015,
    weight: 8,
    branches: [
      'Gdyby wybrał(a) zupełnie inny kierunek',
      'Gdyby zamiast studiów wybrał(a) pracę od razu',
    ],
  },
  {
    id: 'example-2',
    label: 'Przeprowadzka do innego miasta',
    description: 'Decyzja o zmianie miejsca, która przestawiła większość codziennych relacji i nawyków.',
    year: 2019,
    weight: 7,
    branches: [
      'Gdyby zostać w rodzinnym mieście',
      'Gdyby wybrać zupełnie inne miasto',
    ],
  },
  {
    id: 'example-3',
    label: 'Ryzykowna zmiana pracy',
    description: 'Odejście od stabilnej ścieżki na rzecz czegoś niepewnego, ale bardziej zgodnego z zainteresowaniami.',
    year: 2022,
    weight: 9,
    branches: [
      'Gdyby zostać na starym stanowisku',
      'Gdyby poczekać jeszcze rok',
      'Gdyby wybrać jeszcze inną ofertę',
    ],
  },
];

function isStringArray(v: unknown, max: number): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length <= max;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Jak w discoveryLog.ts/settings.ts: localStorage może zawierać cokolwiek — każde pole walidowane osobno. */
function sanitizeDecision(raw: unknown): Decision | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Decision>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.label !== 'string' || !r.label.trim()) return null;
  return {
    id: r.id,
    label: r.label.slice(0, MAX_LABEL),
    description: typeof r.description === 'string' ? r.description.slice(0, MAX_DESCRIPTION) : '',
    year: isFiniteNumber(r.year) ? r.year : new Date().getFullYear(),
    weight: isFiniteNumber(r.weight) ? Math.min(10, Math.max(1, r.weight)) : 5,
    branches: isStringArray(r.branches, MAX_BRANCHES)
      ? r.branches.map((b) => b.slice(0, MAX_BRANCH)).filter(Boolean)
      : [],
  };
}

function sanitizeList(raw: unknown): Decision[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeDecision).filter((d): d is Decision => d !== null).slice(0, MAX_DECISIONS);
}

/** Lista decyzji posortowana chronologicznie. Przy pierwszym uruchomieniu (brak zapisu) zwraca przykłady. */
export function listDecisions(): Decision[] {
  const raw = readJSON<unknown>(KEY, null);
  if (raw === null) return [...EXAMPLE_DECISIONS];
  const list = sanitizeList(raw);
  return [...list].sort((a, b) => a.year - b.year);
}

function persist(list: Decision[]): void {
  writeJSON(KEY, list);
}

function newId(): string {
  return `d-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`;
}

export function addDecision(input: Omit<Decision, 'id'>): Decision {
  const decision = sanitizeDecision({ ...input, id: newId() })!;
  const list = [...listDecisions(), decision];
  persist(list);
  return decision;
}

export function updateDecision(id: string, input: Omit<Decision, 'id'>): void {
  const list = listDecisions().map((d) => (d.id === id ? sanitizeDecision({ ...input, id })! : d));
  persist(list);
}

export function deleteDecision(id: string): void {
  persist(listDecisions().filter((d) => d.id !== id));
}

export function resetToExamples(): void {
  persist(EXAMPLE_DECISIONS);
}

/**
 * Pozycja gwiazdy-decyzji w spirali galaktyki: kąt złoty (phyllotaxis, ta
 * sama technika co węzły sieci energetycznej w civilization.ts) daje
 * równomierne rozłożenie bez nakładania się punktów; promień rośnie z
 * indeksem, więc starsze decyzje leżą bliżej centrum, nowsze na zewnątrz.
 */
const GOLDEN_ANGLE = 2.399963229728653;

export function galaxyPosition(index: number, total: number): { angle: number; radiusFrac: number } {
  const t = total <= 1 ? 0 : index / (total - 1);
  return { angle: index * GOLDEN_ANGLE, radiusFrac: 0.12 + t * 0.82 };
}
