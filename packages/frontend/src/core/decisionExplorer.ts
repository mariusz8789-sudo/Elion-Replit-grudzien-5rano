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

export interface Branch {
  /** Krótki opis alternatywnej ścieżki, np. "Gdyby zostać na starym stanowisku". */
  text: string;
  /**
   * -5..+5: subiektywna ocena UŻYTKOWNIKA (nie AI, nie model) kierunku tej
   * ścieżki. Steruje WYŁĄCZNIE kierunkiem (dryfem) symulacji Monte Carlo w
   * `core/decisionMonteCarlo.ts` — to wejście, nie wyjście: użytkownik mówi
   * systemowi, co sam sądzi o tej ścieżce, a wizualizacja pokazuje
   * konsekwencję matematyczną tego założenia (rosnący rozrzut w czasie),
   * nie prognozę.
   */
  tone: number;
}

export interface Decision {
  id: string;
  /** Krótki tytuł, np. "Zmiana kierunku studiów". */
  label: string;
  /** 1-2 zdania kontekstu. */
  description: string;
  /** Rok (opcjonalny porządek chronologiczny na osi). */
  year: number;
  /** 1-10: subiektywna "waga" decyzji — steruje jasnością gwiazdy ORAZ zmiennością (volatility) symulacji Monte Carlo. */
  weight: number;
  /** Alternatywne ścieżki ("gdyby..."), 1-4 pozycje. */
  branches: Branch[];
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
      { text: 'Gdyby wybrał(a) zupełnie inny kierunek', tone: -1 },
      { text: 'Gdyby zamiast studiów wybrał(a) pracę od razu', tone: 1 },
    ],
  },
  {
    id: 'example-2',
    label: 'Przeprowadzka do innego miasta',
    description: 'Decyzja o zmianie miejsca, która przestawiła większość codziennych relacji i nawyków.',
    year: 2019,
    weight: 7,
    branches: [
      { text: 'Gdyby zostać w rodzinnym mieście', tone: 0 },
      { text: 'Gdyby wybrać zupełnie inne miasto', tone: 2 },
    ],
  },
  {
    id: 'example-3',
    label: 'Ryzykowna zmiana pracy',
    description: 'Odejście od stabilnej ścieżki na rzecz czegoś niepewnego, ale bardziej zgodnego z zainteresowaniami.',
    year: 2022,
    weight: 9,
    branches: [
      { text: 'Gdyby zostać na starym stanowisku', tone: -2 },
      { text: 'Gdyby poczekać jeszcze rok', tone: 0 },
      { text: 'Gdyby wybrać jeszcze inną ofertę', tone: 3 },
    ],
  },
];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Akceptuje ZARÓWNO nowy format (`{text, tone}`) JAK I stary zapis sprzed
 * wprowadzenia symulacji Monte Carlo (goły string) — realne dane w
 * localStorage użytkowników sprzed tej zmiany muszą dalej wczytywać się
 * bez utraty treści; brakujący `tone` dostaje neutralną wartość 0.
 */
function sanitizeBranch(raw: unknown): Branch | null {
  if (typeof raw === 'string') {
    const text = raw.slice(0, MAX_BRANCH).trim();
    return text ? { text, tone: 0 } : null;
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<Branch>;
    if (typeof r.text !== 'string' || !r.text.trim()) return null;
    return {
      text: r.text.slice(0, MAX_BRANCH),
      tone: isFiniteNumber(r.tone) ? Math.min(5, Math.max(-5, r.tone)) : 0,
    };
  }
  return null;
}

function sanitizeBranches(raw: unknown): Branch[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeBranch).filter((b): b is Branch => b !== null).slice(0, MAX_BRANCHES);
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
    branches: sanitizeBranches(r.branches),
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
