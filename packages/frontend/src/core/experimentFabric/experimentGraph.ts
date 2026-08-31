import { canonicalJson, fnv1a } from '../events/hash';
import { getRouterModel, type RouterModel } from './router';
import { buildStructuredRequestFromModel } from './structuredRequestBuilder';
import type { ScientificEvidenceChain } from './scientificDiscovery';
import type { ExperimentRun, ExperimentValue, StructuredExperimentRequest } from './types';

/**
 * SCIENTIFIC EXPERIMENT GRAPH.
 *
 * Pytanie → hipotezy → eksperymenty → wyniki → dowody → porównanie →
 * niepewność → następny eksperyment. Graf NICZEGO nie wykonuje i niczego nie
 * dopowiada: jest odczytem stanu, który już powstał — realnych przebiegów,
 * ich prowieniencji i prerejestrowanych łańcuchów dowodowych.
 *
 * Dwie decyzje, które odróżniają to od ładnego diagramu:
 *
 * 1. HIPOTEZY POCHODZĄ WYŁĄCZNIE Z PREREJESTRACJI. Węzeł HYPOTHESIS powstaje
 *    tylko z `ScientificEvidenceChain.design.hypothesis`, czyli z hipotezy
 *    zapisanej PRZED wykonaniem, razem z kryterium falsyfikacji. Graf nie
 *    dorabia hipotezy do gotowego wyniku — to byłoby HARK-owanie z ładnym UI.
 *    Przebieg bez prerejestracji wisi bezpośrednio pod pytaniem i jest tym,
 *    czym jest: wykonanym eksperymentem bez postawionej wcześniej tezy.
 *
 * 2. NIEPEWNOŚCI SĄ WYLICZONE ZE STANU, NIE NAPISANE. „Model uruchomiono na
 *    jednym ziarnie", „wariant nie ma odniesienia", „replay dał DRIFT",
 *    „silnik był niedostępny" — każda z nich wynika z pól realnych przebiegów
 *    i każda wskazuje konkretny, wykonywalny (albo jawnie niewykonywalny)
 *    następny krok.
 *
 * Kolejność niepewności jest LEKSYKOGRAFICZNA i zadeklarowana wprost
 * (`UNCERTAINTY_PRIORITY`). Nie ma tu ważonego wskaźnika „informatywności",
 * bo nie ma metodologii, która by go uzasadniała.
 */
export const EXPERIMENT_GRAPH_CONTRACT_VERSION = '1.0.0';

export type GraphEpistemicStatus =
  | 'QUESTION' | 'HYPOTHESIS' | 'SIMULATION' | 'MODEL_ESTIMATE' | 'OBSERVED'
  | 'UNKNOWN' | 'BLOCKED' | 'VERIFY_REQUIRED';

export type ExperimentGraphNodeKind =
  | 'QUESTION' | 'HYPOTHESIS' | 'EXPERIMENT' | 'RESULT' | 'EVIDENCE' | 'UNCERTAINTY' | 'NEXT_EXPERIMENT';

export interface ExperimentGraphNode {
  nodeId: string;
  kind: ExperimentGraphNodeKind;
  label: string;
  epistemicStatus: GraphEpistemicStatus;
  /** Węzły, bez których ten węzeł by nie istniał. Krawędzie są wyprowadzane z tego pola. */
  dependsOn: readonly string[];
  detail: readonly string[];
  uncertainty: string;
  runId?: string;
  runFingerprint?: string;
  engine?: string;
  modelId?: string;
  modelVersion?: string;
  resultOrigin?: string;
}

export interface ExperimentGraphEdge {
  from: string;
  to: string;
}

export type UncertaintyKind =
  | 'REPRODUCIBILITY_DRIFT'
  | 'ENGINE_NOT_EXECUTED'
  | 'NO_BASELINE_FOR_VARIANT'
  | 'SINGLE_SEED'
  | 'SINGLE_PARAMETER_POINT'
  | 'NO_INDEPENDENT_OBSERVATION';

/**
 * Kolejność rozstrzygania niepewności — od tej, która unieważnia wszystko
 * poniżej, do tej, która tylko ogranicza zakres wniosku. Zadeklarowana wprost,
 * żeby dało się ją zakwestionować.
 */
export const UNCERTAINTY_PRIORITY: readonly UncertaintyKind[] = [
  // Niepowtarzalny wynik nie jest wynikiem — nic dalej nie ma znaczenia.
  'REPRODUCIBILITY_DRIFT',
  // Brak wykonania to brak danych, nie słaby dowód.
  'ENGINE_NOT_EXECUTED',
  // Wariant bez odniesienia nie ma czego mierzyć.
  'NO_BASELINE_FOR_VARIANT',
  // Jedno ziarno nie odróżnia efektu od losowego przebiegu.
  'SINGLE_SEED',
  // Jeden punkt parametru nie mówi nic o wrażliwości.
  'SINGLE_PARAMETER_POINT',
  // Zgodność z obserwacją jest poza zasięgiem lokalnego wykonania.
  'NO_INDEPENDENT_OBSERVATION',
];

export interface GraphUncertainty {
  uncertaintyId: string;
  kind: UncertaintyKind;
  /** Węzły, których ta niepewność dotyczy. */
  aboutNodeIds: readonly string[];
  statement: string;
  /** Czego NIE WOLNO twierdzić, dopóki ta niepewność stoi. */
  blocksClaim: string;
}

export type NextExperimentStatus = 'READY_TO_RUN' | 'VALIDATION_REQUIRED' | 'BLOCKED';

export interface NextExperimentProposal {
  uncertaintyId: string;
  kind: UncertaintyKind;
  status: NextExperimentStatus;
  action: string;
  why: string;
  /** Co ten przebieg ROZSTRZYGNIE — nie co pokaże. */
  resolves: string;
  /** Gotowy request, gdy da się go wykonać lokalnie. Inaczej `null`. */
  request: StructuredExperimentRequest | null;
  /** Reguła, z której wzięła się zaproponowana wartość. Bez magicznych liczb. */
  rule: string;
}

export interface ExperimentGraph {
  contractVersion: string;
  questionId: string;
  question: string;
  nodes: readonly ExperimentGraphNode[];
  edges: readonly ExperimentGraphEdge[];
  uncertainties: readonly GraphUncertainty[];
  /** Najwyżej priorytetowa niepewność wraz z krokiem, który ją rozstrzyga. */
  nextExperiment: NextExperimentProposal | null;
  graphFingerprint: string;
}

export interface ExperimentGraphInput {
  question: string;
  runs: readonly ExperimentRun[];
  /** Prerejestrowane łańcuchy dowodowe — jedyne źródło węzłów HYPOTHESIS. */
  evidenceChains?: readonly ScientificEvidenceChain[];
}

/**
 * REGUŁY NASTĘPNEGO EKSPERYMENTU. Wartości nie są zgadywane: każda pochodzi z
 * zapisanej reguły, którą widać w `rule` propozycji.
 */
export const NEXT_EXPERIMENT_RULES = {
  seed: 'Nowe ziarno = zapisane ziarno + 1. Zmienia wyłącznie losowy przebieg, zostawiając wszystkie inne wejścia nietknięte.',
  parameterMidpoint: 'Nowa wartość = punkt środkowy między wartością użytą a górną granicą zadeklarowaną w schemacie modelu. Jeden parametr, jedna zmiana.',
  baseline: 'Odniesienie = ten sam model i te same parametry z wartościami domyślnymi schematu dla zmienionej dźwigni.',
} as const;

function statusFor(run: ExperimentRun): GraphEpistemicStatus {
  if (run.result.status !== 'completed') return 'BLOCKED';
  if (run.provenance.resultOrigin !== 'real-engine') return 'UNKNOWN';
  // Genesis nie ma modelu skalibrowanego do obserwacji; wynik silnika jest
  // symulacją albo oszacowaniem modelu, nigdy obserwacją.
  return run.result.visualization.includes('world-3d') ? 'SIMULATION' : 'MODEL_ESTIMATE';
}

function numericParameters(run: ExperimentRun): readonly [string, number][] {
  return Object.entries(run.provenance.parameterSnapshot)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
}

function seedOf(run: ExperimentRun): number | null {
  if (typeof run.provenance.seed === 'number') return run.provenance.seed;
  const seed = run.provenance.parameterSnapshot.seed;
  return typeof seed === 'number' ? seed : null;
}

function collectUncertainties(runs: readonly ExperimentRun[], nodeIdOf: (run: ExperimentRun) => string): GraphUncertainty[] {
  const uncertainties: GraphUncertainty[] = [];
  const completed = runs.filter((run) => run.result.status === 'completed' && run.provenance.resultOrigin === 'real-engine');

  for (const run of runs) {
    if (run.result.status === 'completed' && run.provenance.resultOrigin === 'real-engine') continue;
    uncertainties.push({
      uncertaintyId: `unc:not-executed:${run.runId}`,
      kind: 'ENGINE_NOT_EXECUTED',
      aboutNodeIds: [nodeIdOf(run)],
      statement: `Żądanie „${run.request.modelId ?? run.request.domainId}" nie zostało wykonane przez realny silnik (status=${run.result.status}, origin=${run.provenance.resultOrigin}).`,
      blocksClaim: 'Nie wolno przypisywać temu żądaniu żadnej wartości liczbowej ani wniosku — nie ma danych, nie ma słabego dowodu.',
    });
  }

  // Replay DRIFT jest zapisany w ostrzeżeniach przebiegu przez adaptery, które
  // odtwarzają swój własny wynik. Czytamy stan, nie zgadujemy go.
  for (const run of completed) {
    if (run.result.warnings.some((warning) => /odtworzenie[^.]*:\s*DRIFT/i.test(warning))) {
      uncertainties.push({
        uncertaintyId: `unc:drift:${run.runId}`,
        kind: 'REPRODUCIBILITY_DRIFT',
        aboutNodeIds: [nodeIdOf(run)],
        statement: `Przebieg ${run.runId} zgłosił DRIFT przy własnym odtworzeniu — te same wejścia nie dały tego samego wyniku.`,
        blocksClaim: 'Na niepowtarzalnym przebiegu nie wolno oprzeć żadnego wniosku ani porównania.',
      });
    }
  }

  const byModel = new Map<string, ExperimentRun[]>();
  for (const run of completed) {
    const modelId = run.request.modelId ?? run.request.domainId;
    byModel.set(modelId, [...(byModel.get(modelId) ?? []), run]);
  }

  for (const [modelId, modelRuns] of byModel) {
    const seeds = new Set(modelRuns.map(seedOf).filter((seed): seed is number => seed !== null));
    if (seeds.size === 1 && modelRuns.some((run) => run.provenance.deterministic)) {
      uncertainties.push({
        uncertaintyId: `unc:single-seed:${modelId}`,
        kind: 'SINGLE_SEED',
        aboutNodeIds: modelRuns.map(nodeIdOf),
        statement: `Model ${modelId} uruchomiono wyłącznie na ziarnie ${[...seeds][0]}.`,
        blocksClaim: 'Nie wolno twierdzić, że obserwowany efekt jest własnością modelu, a nie tego jednego losowego przebiegu.',
      });
    }

    // Jeden punkt parametru: dźwignia, której nigdy nie zmieniono.
    const model = getRouterModel(modelId);
    if (model !== undefined) {
      for (const spec of model.parameters) {
        if (spec.type !== 'number' || spec.max === undefined) continue;
        const values = new Set(modelRuns
          .map((run) => run.provenance.parameterSnapshot[spec.id])
          .filter((value): value is number => typeof value === 'number'));
        if (values.size !== 1) continue;
        const only = [...values][0]!;
        if (only >= spec.max) continue;
        uncertainties.push({
          uncertaintyId: `unc:single-point:${modelId}:${spec.id}`,
          kind: 'SINGLE_PARAMETER_POINT',
          aboutNodeIds: modelRuns.map(nodeIdOf),
          statement: `Parametr „${spec.label}" (${spec.id}) modelu ${modelId} pozostał na jednej wartości ${only}; wrażliwość wyniku na tę dźwignię nie jest zmierzona.`,
          blocksClaim: 'Nie wolno twierdzić, że wynik jest niewrażliwy na ten parametr ani ekstrapolować go na inne jego wartości.',
        });
      }
    }

    if (modelRuns.every((run) => !run.result.warnings.some((warning) => /obserwacj/i.test(warning)))
      && modelRuns.every((run) => run.result.assumptions.some((assumption) => /skalibrowan|scenariusz/i.test(assumption)) || run.result.warnings.some((warning) => /nie jest skalibrowan/i.test(warning)))) {
      uncertainties.push({
        uncertaintyId: `unc:no-observation:${modelId}`,
        kind: 'NO_INDEPENDENT_OBSERVATION',
        aboutNodeIds: modelRuns.map(nodeIdOf),
        statement: `Wyniki modelu ${modelId} nie zostały zestawione z żadną niezależną obserwacją.`,
        blocksClaim: 'Nie wolno przedstawiać wyniku jako prognozy ani twierdzić o zgodności z rzeczywistością.',
      });
    }
  }

  return uncertainties;
}

function proposeNext(uncertainty: GraphUncertainty, runs: readonly ExperimentRun[]): NextExperimentProposal {
  const blocked = (action: string, why: string, resolves: string, status: NextExperimentStatus): NextExperimentProposal => ({
    uncertaintyId: uncertainty.uncertaintyId, kind: uncertainty.kind, status, action, why, resolves, request: null, rule: 'Brak lokalnie wykonywalnej reguły — krok wymaga decyzji albo zasobu spoza tego środowiska.',
  });

  switch (uncertainty.kind) {
    case 'ENGINE_NOT_EXECUTED':
      return blocked(
        'Utwórz VALIDATION / EXPERIMENT REQUEST na brakujący silnik albo zasób.',
        uncertainty.statement,
        'Rozstrzygnie, czy pytanie w ogóle da się w Genesis wykonać, zamiast pozostawiać puste miejsce po wyniku.',
        'VALIDATION_REQUIRED',
      );
    case 'NO_INDEPENDENT_OBSERVATION':
      return blocked(
        'Zestaw wynik z przypiętym zbiorem obserwacyjnym; wymaga danych spoza tego środowiska.',
        uncertainty.statement,
        'Rozstrzygnie, czy model ma jakikolwiek związek z rzeczywistością — bez tego pozostaje wyłącznie symulacją.',
        'BLOCKED',
      );
    case 'REPRODUCIBILITY_DRIFT': {
      const run = runs.find((entry) => uncertainty.uncertaintyId.endsWith(entry.runId));
      if (run === undefined) return blocked('Powtórz przebieg z zapisanych wejść.', uncertainty.statement, 'Rozstrzygnie, czy DRIFT jest trwały.', 'VALIDATION_REQUIRED');
      return {
        uncertaintyId: uncertainty.uncertaintyId, kind: uncertainty.kind, status: 'READY_TO_RUN',
        action: `Powtórz ${run.request.modelId ?? run.request.domainId} z DOKŁADNIE tymi samymi wejściami.`,
        why: uncertainty.statement,
        resolves: 'Rozstrzygnie, czy DRIFT jest trwały (wejścia nie opisują wyniku), czy jednorazowy.',
        request: { ...run.request },
        rule: 'Powtórzenie bez żadnej zmiany wejścia. Jedyny sposób, żeby odróżnić niedeterminizm od błędu zapisu wejść.',
      };
    }
    case 'SINGLE_SEED': {
      const run = runs.find((entry) => uncertainty.aboutNodeIds.includes(`run:${entry.runId}`));
      const model = run === undefined ? undefined : getRouterModel(run.request.modelId ?? '');
      if (run === undefined || model === undefined) return blocked('Powtórz model na innym ziarnie.', uncertainty.statement, 'Rozstrzygnie, czy efekt jest własnością modelu.', 'VALIDATION_REQUIRED');
      const seed = seedOf(run) ?? 0;
      return {
        uncertaintyId: uncertainty.uncertaintyId, kind: uncertainty.kind, status: 'READY_TO_RUN',
        action: `Powtórz ${model.id} na ziarnie ${seed + 1}, wszystko inne bez zmian.`,
        why: uncertainty.statement,
        resolves: 'Rozstrzygnie, czy obserwowany efekt utrzymuje się przy innym losowym przebiegu tego samego układu.',
        request: buildStructuredRequestFromModel(model, { ...run.provenance.parameterSnapshot, seed: seed + 1 }, {
          sourceText: `Powtórzenie ${model.id} na ziarnie ${seed + 1} — kontrola pojedynczego ziarna.`,
          seed: seed + 1,
        }),
        rule: NEXT_EXPERIMENT_RULES.seed,
      };
    }
    case 'SINGLE_PARAMETER_POINT': {
      const [, , modelId, parameterId] = uncertainty.uncertaintyId.split(':');
      const model = modelId === undefined ? undefined : getRouterModel(modelId);
      const spec = model?.parameters.find((entry) => entry.id === parameterId);
      const run = runs.find((entry) => (entry.request.modelId ?? '') === modelId);
      if (model === undefined || spec === undefined || spec.max === undefined || run === undefined) {
        return blocked('Przemieć jeden parametr.', uncertainty.statement, 'Rozstrzygnie wrażliwość wyniku na tę dźwignię.', 'VALIDATION_REQUIRED');
      }
      const current = run.provenance.parameterSnapshot[spec.id];
      const from = typeof current === 'number' ? current : (typeof spec.default === 'number' ? spec.default : 0);
      const next = Number(((from + spec.max) / 2).toPrecision(6));
      return {
        uncertaintyId: uncertainty.uncertaintyId, kind: uncertainty.kind, status: 'READY_TO_RUN',
        action: `Uruchom ${model.id} z ${spec.id} = ${next} (było ${from}), wszystko inne bez zmian.`,
        why: uncertainty.statement,
        resolves: `Rozstrzygnie, czy i jak wynik reaguje na „${spec.label}" — jeden zmieniony parametr, jedna przypisywalna różnica.`,
        request: buildStructuredRequestFromModel(model, { ...run.provenance.parameterSnapshot, [spec.id]: next }, {
          sourceText: `Wrażliwość ${model.id} na ${spec.id}: ${from} → ${next}.`,
        }),
        rule: NEXT_EXPERIMENT_RULES.parameterMidpoint,
      };
    }
    case 'NO_BASELINE_FOR_VARIANT':
      return blocked('Uruchom odniesienie dla tego wariantu.', uncertainty.statement, 'Rozstrzygnie, względem czego mierzona jest różnica.', 'VALIDATION_REQUIRED');
  }
}

export function buildExperimentGraph(input: ExperimentGraphInput): ExperimentGraph {
  const questionId = `question:${fnv1a(input.question)}`;
  const nodes: ExperimentGraphNode[] = [{
    nodeId: questionId,
    kind: 'QUESTION',
    label: input.question,
    epistemicStatus: 'QUESTION',
    dependsOn: [],
    detail: [`${input.runs.length} wykonanych żądań`, `${input.evidenceChains?.length ?? 0} prerejestrowanych łańcuchów dowodowych`],
    uncertainty: 'Pytanie nie jest wynikiem; niżej w grafie znajduje się wszystko, co Genesis faktycznie wykonał.',
  }];

  // HIPOTEZY — wyłącznie prerejestrowane. Bez tego ograniczenia graf
  // dorabiałby tezę do gotowego wyniku.
  const hypothesisByModel = new Map<string, string>();
  for (const chain of input.evidenceChains ?? []) {
    const nodeId = `hypothesis:${chain.design.hypothesis.hypothesisId}`;
    hypothesisByModel.set(chain.design.hypothesis.modelId, nodeId);
    nodes.push({
      nodeId, kind: 'HYPOTHESIS', label: chain.design.hypothesis.statement,
      epistemicStatus: 'HYPOTHESIS', dependsOn: [questionId],
      detail: [
        `kryterium falsyfikacji: ${chain.design.hypothesis.falsification.metric} ${chain.design.hypothesis.falsification.relation}${chain.design.hypothesis.falsification.expectedValue === undefined ? '' : ` ${chain.design.hypothesis.falsification.expectedValue}`}`,
        `prerejestrowana przed wykonaniem; protokół ${chain.design.protocolFingerprint}`,
        ...chain.design.hypothesis.declaredAssumptions,
      ],
      uncertainty: chain.design.hypothesis.disclaimer,
      modelId: chain.design.hypothesis.modelId,
    });
    nodes.push({
      nodeId: `evidence:${chain.evidenceId}`, kind: 'EVIDENCE',
      label: `Ocena hipotezy: ${chain.assessment.assessment}`,
      epistemicStatus: chain.assessment.assessment === 'CANDIDATE' ? 'UNKNOWN' : 'VERIFY_REQUIRED',
      dependsOn: [nodeId],
      detail: [chain.assessment.message, `armów: ${chain.arms.length}`, `przebiegów: ${chain.allRuns.length}`, `odcisk prowieniencji: ${chain.provenanceFingerprint}`],
      uncertainty: 'Ocena obowiązuje wyłącznie w granicach tego protokołu i tego modelu.',
    });
  }

  for (const run of input.runs) {
    const modelId = run.request.modelId ?? run.request.domainId;
    const experimentId = `experiment:${run.runId}`;
    const resultId = `run:${run.runId}`;
    const parent = hypothesisByModel.get(modelId) ?? questionId;
    nodes.push({
      nodeId: experimentId, kind: 'EXPERIMENT', label: `${modelId} — ${run.plan.engine ?? 'brak silnika'}`,
      epistemicStatus: run.plan.runnable ? 'HYPOTHESIS' : 'BLOCKED',
      dependsOn: [parent],
      detail: [
        `zdolność: ${run.intent.capability}`,
        `parametry: ${numericParameters(run).map(([key, value]) => `${key}=${value}`).join(', ') || 'brak liczbowych'}`,
        run.intent.rationale,
      ],
      uncertainty: run.plan.runnable ? 'Plan opisuje, co zostanie wykonane; nie zawiera żadnego oczekiwanego wyniku.' : 'Plan nie jest wykonywalny w tym środowisku.',
      modelId, engine: run.plan.engine ?? undefined, modelVersion: run.plan.modelVersion ?? undefined,
    });
    nodes.push({
      nodeId: resultId, kind: 'RESULT', label: run.result.summary,
      epistemicStatus: statusFor(run), dependsOn: [experimentId],
      detail: [
        ...run.result.warnings,
        `wyników liczbowych: ${Object.values(run.result.outputs).filter((value) => typeof value === 'number').length}`,
      ],
      uncertainty: run.result.validity ?? 'Zakres ważności nie został zadeklarowany przez adapter — traktuj wynik jako nieograniczony żadnym potwierdzeniem.',
      runId: run.runId, runFingerprint: run.provenance.runFingerprint,
      engine: run.plan.engine ?? undefined, modelId,
      modelVersion: run.provenance.modelVersion, resultOrigin: run.provenance.resultOrigin,
    });
  }

  const uncertainties = collectUncertainties(input.runs, (run) => `run:${run.runId}`);
  for (const uncertainty of uncertainties) {
    nodes.push({
      nodeId: `uncertainty:${uncertainty.uncertaintyId}`, kind: 'UNCERTAINTY', label: uncertainty.statement,
      epistemicStatus: 'UNKNOWN', dependsOn: uncertainty.aboutNodeIds,
      detail: [uncertainty.blocksClaim], uncertainty: uncertainty.blocksClaim,
    });
  }

  const ranked = [...uncertainties].sort((a, b) =>
    UNCERTAINTY_PRIORITY.indexOf(a.kind) - UNCERTAINTY_PRIORITY.indexOf(b.kind)
    || a.uncertaintyId.localeCompare(b.uncertaintyId));
  const nextExperiment = ranked.length === 0 ? null : proposeNext(ranked[0]!, input.runs);
  if (nextExperiment !== null) {
    nodes.push({
      nodeId: `next:${nextExperiment.uncertaintyId}`, kind: 'NEXT_EXPERIMENT', label: nextExperiment.action,
      epistemicStatus: nextExperiment.status === 'READY_TO_RUN' ? 'HYPOTHESIS' : 'BLOCKED',
      dependsOn: [`uncertainty:${nextExperiment.uncertaintyId}`],
      detail: [nextExperiment.why, nextExperiment.resolves, nextExperiment.rule],
      uncertainty: 'Propozycja kolejnego kroku, nie jego wynik. Nic tu jeszcze nie zostało wykonane.',
    });
  }

  const edges: ExperimentGraphEdge[] = nodes.flatMap((node) => node.dependsOn.map((from): ExperimentGraphEdge => ({ from, to: node.nodeId })));
  const fingerprintBase = {
    contractVersion: EXPERIMENT_GRAPH_CONTRACT_VERSION,
    question: input.question,
    nodes: nodes.map((node) => ({ id: node.nodeId, kind: node.kind, status: node.epistemicStatus, dependsOn: node.dependsOn })),
    uncertainties: ranked.map((entry) => entry.uncertaintyId),
    next: nextExperiment?.uncertaintyId ?? null,
  };
  return {
    contractVersion: EXPERIMENT_GRAPH_CONTRACT_VERSION,
    questionId, question: input.question,
    nodes, edges, uncertainties: ranked, nextExperiment,
    graphFingerprint: fnv1a(canonicalJson(fingerprintBase)),
  };
}

export interface NextExperimentExecution {
  executed: boolean;
  reason: string;
  run: ExperimentRun | null;
}

/**
 * Wykonuje zaproponowany krok, o ile jest wykonywalny. Wykonanie idzie przez
 * ten sam `runExperiment`, co każde inne żądanie — autonomia dotyczy WYBORU
 * eksperymentu, nie omijania kontraktu. Wynik wraca do `buildExperimentGraph`,
 * więc pętla pytanie → niepewność → eksperyment → niepewność zamyka się na
 * realnych przebiegach.
 */
export function executeNextExperiment(
  graph: ExperimentGraph,
  runExperiment: (request: StructuredExperimentRequest) => ExperimentRun,
): NextExperimentExecution {
  const proposal = graph.nextExperiment;
  if (proposal === null) return { executed: false, reason: 'Graf nie zgłasza otwartej niepewności — nie ma czego rozstrzygać.', run: null };
  if (proposal.status !== 'READY_TO_RUN' || proposal.request === null) {
    return { executed: false, reason: `Krok nie jest wykonywalny lokalnie (${proposal.status}): ${proposal.action}`, run: null };
  }
  return { executed: true, reason: `Wykonano krok rozstrzygający ${proposal.kind}: ${proposal.action}`, run: runExperiment(proposal.request) };
}

export type { RouterModel, ExperimentValue };
