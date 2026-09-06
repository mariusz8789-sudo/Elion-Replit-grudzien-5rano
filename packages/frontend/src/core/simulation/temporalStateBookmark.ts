import { canonicalJson, fnv1a } from '../events/hash';
import { buildTemporalTimeline, temporalStateAt, type TemporalStateEnvelope } from './temporalState';
import { replaySavedScenarioRun, type SavedScenarioReplayStatus, type SavedScenarioRunContext } from './scenarioMemory';
import { replaySavedScenarioCounterfactual, type SavedScenarioCounterfactual } from './scenarioCounterfactual';
import { replaySavedTemporalMultiverse, type SavedTemporalMultiverse } from './temporalMultiverse';

/**
 * ADRES DO KONKRETNEGO STANU CZASOWEGO.
 *
 * Genesis dziś dociera do stanu na dzień N wyłącznie przez cały zapisany
 * kontekst (run / kontrfaktyk / multiverse) plus ręcznie dobrany dzień — nie
 * ma jednego, przenośnego identyfikatora, który mówi "to DOKŁADNIE ten stan".
 * To jest prawdziwa, brakująca rzecz: "SAVE STATE → RESTORE STATE" wymaga
 * czegoś, co można zapisać, przekazać dalej (np. jako deep-link w UI) i
 * rozwiązać później — bez zgadywania, z którego zapisu i którego dnia.
 *
 * Ten moduł NIE jest drugą pamięcią ani drugim replay-em. `TemporalStateBookmark`
 * to etykieta nad JUŻ ISTNIEJĄCYM zapisanym kontekstem (`SavedScenarioRunContext`
 * / `SavedScenarioCounterfactual` / `SavedTemporalMultiverse`) — rozwiązanie
 * zakładki zawsze przechodzi przez ISTNIEJĄCY replay tego kontekstu. Zakładka
 * bez weryfikacji replay-em nie prowadzi do żadnego stanu: MATCH jest jedynym
 * wejściem do `TemporalStateEnvelope`, tak samo jak w każdym innym World handoff.
 */
export const TEMPORAL_STATE_BOOKMARK_CONTRACT_VERSION = '1.0.0';

export type TemporalStateBookmarkSource =
  | { kind: 'run'; saved: SavedScenarioRunContext }
  | { kind: 'counterfactual-baseline'; saved: SavedScenarioCounterfactual }
  | { kind: 'counterfactual-variant'; saved: SavedScenarioCounterfactual }
  | { kind: 'multiverse-baseline'; saved: SavedTemporalMultiverse }
  | { kind: 'multiverse-branch'; saved: SavedTemporalMultiverse; branchId: string };

export interface TemporalStateBookmark {
  contractVersion: string;
  bookmarkId: string;
  source: TemporalStateBookmarkSource;
  logicalDay: number;
}

/** Odcisk zapisanego kontekstu, z którego zakładka bierze tożsamość — bez serializacji całego obiektu. */
function sourceFingerprint(source: TemporalStateBookmarkSource): string {
  switch (source.kind) {
    case 'run': return source.saved.resultFingerprint;
    case 'counterfactual-baseline':
    case 'counterfactual-variant': return source.saved.counterfactualFingerprint;
    case 'multiverse-baseline':
    case 'multiverse-branch': return source.saved.multiverseFingerprint;
  }
}

/**
 * Tworzy zakładkę. Deterministyczna: ten sam zapisany kontekst i ten sam
 * dzień zawsze dają ten sam `bookmarkId` — inny dzień, inna gałąź albo inny
 * zapis zawsze dają inny. Tworzenie NIE weryfikuje replay-em — to jest
 * odpowiedzialność `resolveTemporalStateBookmark`.
 */
export function createTemporalStateBookmark(source: TemporalStateBookmarkSource, logicalDay: number): TemporalStateBookmark {
  if (!Number.isFinite(logicalDay) || logicalDay < 0 || Math.floor(logicalDay) !== logicalDay) {
    throw new Error(`Dzień zakładki musi być nieujemną liczbą całkowitą, dostano ${logicalDay}.`);
  }
  const identity = {
    v: TEMPORAL_STATE_BOOKMARK_CONTRACT_VERSION,
    kind: source.kind,
    fingerprint: sourceFingerprint(source),
    branchId: source.kind === 'multiverse-branch' ? source.branchId : null,
    logicalDay,
  };
  return {
    contractVersion: TEMPORAL_STATE_BOOKMARK_CONTRACT_VERSION,
    bookmarkId: `moment_${fnv1a(canonicalJson(identity))}`,
    source,
    logicalDay,
  };
}

export type TemporalStateBookmarkResolution =
  | { status: 'MATCH'; envelope: TemporalStateEnvelope }
  | { status: Exclude<SavedScenarioReplayStatus, 'MATCH'>; reason: string };

/**
 * Rozwiązuje zakładkę PRZEZ ISTNIEJĄCY REPLAY jej źródła. Envelope wraca
 * wyłącznie przy MATCH całego zapisanego kontekstu — nieodtworzony zapis albo
 * nieistniejąca gałąź/dzień nigdy nie zwraca zmyślonego stanu, tylko powód.
 */
export function resolveTemporalStateBookmark(bookmark: TemporalStateBookmark): TemporalStateBookmarkResolution {
  const { source, logicalDay } = bookmark;

  if (source.kind === 'run') {
    const replay = replaySavedScenarioRun(source.saved);
    if (replay.status !== 'MATCH') return { status: replay.status, reason: replay.reason };
    if (replay.run === null) return { status: 'BLOCKED', reason: 'MATCH bez przeliczonego przebiegu — nie ma z czego zbudować stanu.' };
    const timeline = buildTemporalTimeline(replay.run, 'BASELINE');
    const envelope = temporalStateAt(timeline, logicalDay);
    if (!envelope) return { status: 'BLOCKED', reason: `Dzień ${logicalDay} leży poza osią czasu (0..${timeline.days}).` };
    return { status: 'MATCH', envelope };
  }

  if (source.kind === 'counterfactual-baseline' || source.kind === 'counterfactual-variant') {
    const replay = replaySavedScenarioCounterfactual(source.saved);
    if (replay.status !== 'MATCH') return { status: replay.status, reason: replay.reason };
    if (replay.counterfactual === null) return { status: 'BLOCKED', reason: 'MATCH bez przeliczonego kontrfaktyku — nie ma z czego zbudować stanu.' };
    const isBaseline = source.kind === 'counterfactual-baseline';
    const run = isBaseline ? replay.counterfactual.baseline : replay.counterfactual.variant;
    const timeline = buildTemporalTimeline(run, isBaseline ? 'BASELINE' : 'VARIANT');
    const envelope = temporalStateAt(timeline, logicalDay);
    if (!envelope) return { status: 'BLOCKED', reason: `Dzień ${logicalDay} leży poza osią czasu (0..${timeline.days}).` };
    return { status: 'MATCH', envelope };
  }

  // multiverse-baseline | multiverse-branch
  const replay = replaySavedTemporalMultiverse(source.saved);
  if (replay.status !== 'MATCH') return { status: replay.status, reason: replay.reason };
  if (replay.multiverse === null) return { status: 'BLOCKED', reason: 'MATCH bez przeliczonego multiverse — nie ma z czego zbudować stanu.' };

  const timeline = source.kind === 'multiverse-baseline'
    ? replay.multiverse.baselineTimeline
    : replay.multiverse.branches.find((branch) => branch.branchId === source.branchId)?.timeline;

  if (source.kind === 'multiverse-branch' && replay.multiverse.branches.every((branch) => branch.branchId !== source.branchId)) {
    return { status: 'BLOCKED', reason: `Gałąź "${source.branchId}" nie istnieje w tym multiverse.` };
  }
  if (!timeline) {
    return { status: 'BLOCKED', reason: `Gałąź "${source.kind === 'multiverse-branch' ? source.branchId : 'baseline'}" jest NOT_MODELED — nie ma osi czasu do wejścia.` };
  }
  const envelope = temporalStateAt(timeline, logicalDay);
  if (!envelope) return { status: 'BLOCKED', reason: `Dzień ${logicalDay} leży poza osią czasu (0..${timeline.days}).` };
  return { status: 'MATCH', envelope };
}
