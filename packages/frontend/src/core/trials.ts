import { readJSON, writeJSON } from './storage';

/**
 * Trial Series — szkielet pętli odkrycia (Founder Directive: Discovery Engine).
 *
 * Pojedyncza PRÓBA (Trial) to zamrożony, opatrzony prowieniencją stan
 * eksperymentu-grafu: jakie parametry ustawiono i jakie konsekwencje z nich
 * wyszły, z jaką etykietą statusu. Seria prób pozwala realizować rdzeń pętli
 * odkrycia: PYTANIE → PRÓBY → PRZEMIATANIE PARAMETRÓW → PORÓWNANIE → co się
 * zmieniło i jakie konsekwencje z tego wynikły.
 *
 * Local-first (localStorage), jak customExperiment/discoveryLog — backend
 * współdzielonych projektów (Scientific Git, wielu autorów) to osobna, późniejsza
 * warstwa. Każda próba już teraz zachowuje prowieniencję: który model (experimentId),
 * pełny wektor wejść, pełny wektor policzonych wyjść, status i skąd została odbita
 * (parentId) — to jest fundament pod reprodukowalność i CDE Candidate Passport.
 *
 * NIC tu nie „odkrywa" samo z siebie: próba to zapis realnego przebiegu przez
 * wykonywalny Graf Modeli, nie wygenerowany przez AI wynik.
 */

export type TrialStatus = 'baseline' | 'draft' | 'promising' | 'failed';

export const TRIAL_STATUS_LABEL: Record<TrialStatus, string> = {
  baseline: 'punkt odniesienia',
  draft: 'robocza',
  promising: 'obiecująca',
  failed: 'nieudana',
};

export interface Trial {
  id: string;
  /** Id modelu/eksperymentu (prowieniencja: który graf to policzył). */
  experimentId: string;
  /** Kolejny numer w serii (Trial 001, 002…). */
  index: number;
  label: string;
  /** Zamrożony wektor wejść (parametry korzenie grafu). */
  params: Record<string, number>;
  /** Zamrożony wektor policzonych wyjść. */
  outputs: Record<string, number>;
  status: TrialStatus;
  note: string;
  createdAt: number;
  /** Id próby, z której tę odbito (branch), albo null. */
  parentId: string | null;
}

export interface TrialDiffEntry {
  key: string;
  a: number;
  b: number;
}

export interface TrialDiff {
  params: TrialDiffEntry[];
  outputs: TrialDiffEntry[];
}

const MAX_PER_EXPERIMENT = 200; // limit lokalny, żeby localStorage nie rósł bez końca

function keyFor(experimentId: string): string {
  return `trials/${experimentId}`;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `trial-${Date.now().toString(36)}-${idCounter}`;
}

function isFiniteNumberRecord(v: unknown): v is Record<string, number> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'number');
}

function sanitize(raw: unknown, experimentId: string): Trial | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Trial>;
  if (typeof r.id !== 'string') return null;
  if (!isFiniteNumberRecord(r.params) || !isFiniteNumberRecord(r.outputs)) return null;
  const status: TrialStatus =
    r.status === 'baseline' || r.status === 'promising' || r.status === 'failed' ? r.status : 'draft';
  return {
    id: r.id,
    experimentId,
    index: typeof r.index === 'number' ? r.index : 0,
    label: typeof r.label === 'string' ? r.label : `Próba ${r.index ?? ''}`,
    params: r.params,
    outputs: r.outputs,
    status,
    note: typeof r.note === 'string' ? r.note : '',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    parentId: typeof r.parentId === 'string' ? r.parentId : null,
  };
}

export function listTrials(experimentId: string): Trial[] {
  const raw = readJSON<unknown[]>(keyFor(experimentId), []);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => sanitize(r, experimentId)).filter((t): t is Trial => t !== null);
}

function persist(experimentId: string, trials: Trial[]): void {
  writeJSON(keyFor(experimentId), trials.slice(-MAX_PER_EXPERIMENT));
}

export interface NewTrialInput {
  params: Record<string, number>;
  outputs: Record<string, number>;
  label?: string;
  status?: TrialStatus;
  note?: string;
  parentId?: string | null;
}

export function saveTrial(experimentId: string, input: NewTrialInput): Trial {
  const trials = listTrials(experimentId);
  const index = trials.length > 0 ? Math.max(...trials.map((t) => t.index)) + 1 : 1;
  const trial: Trial = {
    id: nextId(),
    experimentId,
    index,
    label: input.label?.trim() || `Próba ${String(index).padStart(3, '0')}`,
    params: { ...input.params },
    outputs: { ...input.outputs },
    status: input.status ?? (index === 1 ? 'baseline' : 'draft'),
    note: input.note ?? '',
    createdAt: Date.now(),
    parentId: input.parentId ?? null,
  };
  persist(experimentId, [...trials, trial]);
  return trial;
}

/** Odbija (duplikuje) próbę jako nową — kopiuje wejścia, zeruje status do 'draft', wskazuje rodzica. */
export function duplicateTrial(experimentId: string, id: string): Trial | null {
  const trials = listTrials(experimentId);
  const src = trials.find((t) => t.id === id);
  if (!src) return null;
  return saveTrial(experimentId, {
    params: src.params,
    outputs: src.outputs,
    label: `${src.label} (odbicie)`,
    status: 'draft',
    parentId: src.id,
  });
}

export function updateTrial(experimentId: string, id: string, patch: Partial<Pick<Trial, 'label' | 'status' | 'note'>>): void {
  const trials = listTrials(experimentId).map((t) => (t.id === id ? { ...t, ...patch } : t));
  persist(experimentId, trials);
}

export function deleteTrial(experimentId: string, id: string): void {
  persist(experimentId, listTrials(experimentId).filter((t) => t.id !== id));
}

export function getTrial(experimentId: string, id: string): Trial | undefined {
  return listTrials(experimentId).find((t) => t.id === id);
}

/**
 * Różnica dwóch prób: KTÓRE parametry się zmieniły i JAKIE konsekwencje z tego
 * wynikły. To jest sedno „pokaż dokładnie, co się zmieniło między próbami".
 */
export function diffTrials(a: Trial, b: Trial): TrialDiff {
  const diffRecord = (ra: Record<string, number>, rb: Record<string, number>): TrialDiffEntry[] => {
    const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    const out: TrialDiffEntry[] = [];
    for (const key of keys) {
      const av = ra[key] ?? NaN;
      const bv = rb[key] ?? NaN;
      if (av !== bv && !(Number.isNaN(av) && Number.isNaN(bv))) out.push({ key, a: av, b: bv });
    }
    return out;
  };
  return { params: diffRecord(a.params, b.params), outputs: diffRecord(a.outputs, b.outputs) };
}
