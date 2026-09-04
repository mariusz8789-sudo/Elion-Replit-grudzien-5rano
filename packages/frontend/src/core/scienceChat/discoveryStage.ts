import type { EpistemicTag, ScientificIntent } from './resolveCommand';

/**
 * DISCOVERY STAGE — wizualny postęp procesu badawczego w Science Chat:
 *
 *   Question → Hypothesis → Experiment → Simulation → Analysis → Discovery
 *
 * Etap jest WYWNIOSKOWANY z realnego stanu rozmowy: z typowanych intencji
 * (`ScientificIntent`) i etykiet epistemicznych (`EpistemicTag`), które
 * produkuje istniejący, deterministyczny `resolveCommand`, oraz z faktu
 * istnienia planu/kapsuły. To NIE jest LLM, nie zgaduje i nie wymyśla
 * postępu — jeśli nic się nie wydarzyło, etap zostaje na „Question".
 *
 * Czysta funkcja: cała logika jest testowalna bez UI.
 */

export const DISCOVERY_STAGES = ['question', 'hypothesis', 'experiment', 'simulation', 'analysis', 'discovery'] as const;
export type DiscoveryStage = (typeof DISCOVERY_STAGES)[number];

export const DISCOVERY_STAGE_LABELS: Record<DiscoveryStage, string> = {
  question: 'Pytanie',
  hypothesis: 'Hipoteza',
  experiment: 'Eksperyment',
  simulation: 'Symulacja',
  analysis: 'Analiza',
  discovery: 'Odkrycie',
};

export function stageIndex(stage: DiscoveryStage): number {
  return DISCOVERY_STAGES.indexOf(stage);
}

/** Minimalny odczyt tury rozmowy potrzebny do wyznaczenia etapu. */
export interface StageSignal {
  role: 'user' | 'genesis';
  tag?: EpistemicTag;
  intent?: ScientificIntent;
}

export interface StageContext {
  /** Plan czeka na jawne potwierdzenie użytkownika (realny stan Science Chat). */
  hasPendingPlan?: boolean;
  /** Istnieje potwierdzona kapsuła realnego runu — najwyższy dowód w tej rozmowie. */
  hasConfirmedCapsule?: boolean;
  /** Otwarta jest żywa symulacja (core/simContext). */
  hasLiveSimulation?: boolean;
}

function stageForSignal(signal: StageSignal): DiscoveryStage | null {
  if (signal.role !== 'genesis') return null;
  switch (signal.intent) {
    case 'PROPOSE_EXPERIMENT': return 'hypothesis';
    case 'OPEN_SIMULATION': return 'simulation';
    case 'CHANGE_PARAMETER':
    case 'WHAT_IF': return 'experiment';
    case 'CHECK_RESULT':
    case 'COMPARE_MODELS':
    case 'VERIFY': return 'analysis';
    default: break;
  }
  switch (signal.tag) {
    case 'HIPOTEZA': return 'hypothesis';
    case 'WYNIK': return 'analysis';
    case 'MODEL': return 'experiment';
    default: return null;
  }
}

/**
 * Wyznacza NAJDALSZY osiągnięty etap. Proces badawczy nie „cofa się" wizualnie
 * w obrębie jednej rozmowy — kolejne pytanie nie kasuje faktu, że eksperyment
 * już się wykonał.
 */
export function resolveDiscoveryStage(signals: readonly StageSignal[], ctx: StageContext = {}): DiscoveryStage {
  // Potwierdzona kapsuła to twardy dowód realnego przebiegu — najwyższy etap.
  if (ctx.hasConfirmedCapsule) return 'discovery';

  let best: DiscoveryStage = 'question';
  const raise = (candidate: DiscoveryStage) => {
    if (stageIndex(candidate) > stageIndex(best)) best = candidate;
  };

  for (const signal of signals) {
    const stage = stageForSignal(signal);
    if (stage) raise(stage);
  }
  if (ctx.hasLiveSimulation) raise('simulation');
  // Plan przedstawiony do zatwierdzenia = jesteśmy na etapie eksperymentu.
  if (ctx.hasPendingPlan) raise('experiment');

  return best;
}
