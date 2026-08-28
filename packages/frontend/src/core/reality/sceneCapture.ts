import { canonicalJson, fnv1a } from '../events/hash';
import type { ModelGraph, NodeDerivation } from '../modelGraph/graph';
import type { HonestyLevel } from '../types';

/**
 * SCENE CAPTURE — zapis sceny World/Scene Engine jako czegoś, co da się
 * ODTWORZYĆ i ZAKWESTIONOWAĆ, a nie tylko obejrzeć.
 *
 * Reality Navigator (core/reality/RealityEngine.ts + scenes/) już dziś pokazuje
 * stałego obserwatora, rozgałęzienia parametrów (branches.ts) i przejście
 * między nimi (transit.ts). Czego nie robił: nie dało się powiedzieć, CZYM
 * epistemicznie jest to, co widać, ani odtworzyć tego później i sprawdzić, czy
 * wyszło to samo. Scena, której nie da się odtworzyć, jest ilustracją, nie
 * wynikiem.
 *
 * Ten moduł NIE tworzy drugiego renderera, drugiego świata ani drugiego
 * Evidence/Replay. Nie ma tu żadnego solvera — cała fizyka pochodzi z
 * istniejącego Scientific Model Graph (core/modelGraph), a odciski liczy
 * istniejące core/events/hash.ts. Moduł dokłada wyłącznie trzy rzeczy:
 *
 *   1. SceneRequest → SceneCapture przez REALNE przeliczenie grafu modelu,
 *   2. jawny status epistemiczny sceny wraz z listą tego, czego NIE dowodzi,
 *   3. replay przez ponowne przeliczenie, z werdyktem MATCH/DRIFT/
 *      NOT_REPRODUCIBLE/BLOCKED — bez udawania MATCH.
 *
 * Świadome pominięcie: odcisk NIE obejmuje etykiety gałęzi, jej id ani
 * createdAt. branches.ts nadaje id z licznika modułowego i znacznik
 * Date.now(), więc dwa identyczne fizycznie ustawienia dostałyby różne
 * odciski, a replay zgłaszałby DRIFT bez żadnej różnicy w modelu. Odcisk
 * bierze wyłącznie to, co realnie steruje wynikiem.
 */

export const SCENE_CAPTURE_CONTRACT_VERSION = 'genesis.reality.scene-capture.v1';

/**
 * Status epistemiczny sceny. Pełne słownictwo produktu; ta ścieżka (scena
 * napędzana modelem) świadomie NIE potrafi zwrócić FACT ani MEASUREMENT —
 * jedno i drugie wymaga źródła spoza modelu (przypiętej danej albo realnego
 * pomiaru), a przeliczenie grafu nim nie jest. Gdyby scena kiedyś dostała
 * przypięty pomiar, to on, a nie ten moduł, przyniósłby taki status.
 */
export type EpistemicStatus =
  | 'FACT'
  | 'MODEL'
  | 'MEASUREMENT'
  | 'PREDICTION'
  | 'HYPOTHESIS'
  | 'SCENARIO'
  | 'CINEMATIC'
  | 'NOT_MODELED'
  | 'VERIFY_REQUIRED'
  | 'BLOCKED';

export const EPISTEMIC_STATUS_LABELS: Record<EpistemicStatus, string> = {
  FACT: 'Fakt — potwierdzona wiedza lub dane',
  MODEL: 'Model — jawny model matematyczny',
  MEASUREMENT: 'Pomiar — rzeczywista obserwacja',
  PREDICTION: 'Predykcja — wynik modelu dla stanu niezmierzonego',
  HYPOTHESIS: 'Hipoteza — wariant do sprawdzenia',
  SCENARIO: 'Scenariusz — przebieg kontrfaktyczny',
  CINEMATIC: 'Warstwa artystyczna — bez twierdzenia naukowego',
  NOT_MODELED: 'Brak modelu — nie ma czego liczyć',
  VERIFY_REQUIRED: 'Wymaga weryfikacji — brak podstaw do mocniejszego twierdzenia',
  BLOCKED: 'Zablokowane — twierdzenie niedopuszczalne',
};

/**
 * Warstwy wizualne, za którymi NIE stoi zatwierdzony solver. Wolno je pokazać —
 * ale scena, która je zawiera, nie może twierdzić więcej niż CINEMATIC.
 * Rzut tesseraktu świadomie NIE jest na tej liście: core/physics.ts liczy go
 * dokładną algebrą liniową (obrót w płaszczyźnie 4D + rzut perspektywiczny),
 * więc jest modelem matematycznym. Zakazane jest twierdzenie, że pokazuje
 * fizyczny piąty wymiar — i to łapie lista poniżej, nie ta.
 */
export const UNSOLVED_VISUAL_LAYERS = [
  'wormhole-threshold',
  'branch-fan',
  'fifth-dimension-corridor',
  'singularity-interior',
] as const;

/**
 * Twierdzenia, których Genesis nie stawia. Scena, która je deklaruje, dostaje
 * BLOCKED — nie „ostrzeżenie obok ładnej sceny", tylko odmowa nadania jej
 * jakiegokolwiek statusu naukowego.
 */
export const FORBIDDEN_CLAIMS: Record<string, string> = {
  'parallel-universes-exist':
    'Rozgałęzienie w tej scenie to porównanie wariantów parametrów jednego modelu, a nie obserwacja równoległych wszechświatów.',
  'traversable-wormhole-confirmed':
    'Przejście „progiem" jest warstwą artystyczną; nie ma tu zatwierdzonego solvera OTW ani obserwacji tunelu czasoprzestrzennego.',
  'fifth-spatial-dimension-observed':
    'Rzut 4D→3D to technika wizualizacji obiektu matematycznego, nie obserwacja dodatkowego wymiaru przestrzennego.',
  'superposition-grants-access-to-all-realities':
    'Superpozycja opisuje amplitudy jednego układu; nie oznacza dostępu do innych rzeczywistości ani ich odczytu.',
  'mind-reading-confirmed':
    'W Genesis nie ma modelu odczytu treści umysłu; taka scena nie ma podstawy naukowej.',
};

/** Skala czasu ŚWIATA względem czasu WYŚWIETLANIA — rozdzielone celowo. */
export type TimeScaleId = 'realtime' | 'hour' | 'day' | 'year' | 'century';

export interface TimeScaleDef {
  id: TimeScaleId;
  label: string;
  /** Ile sekund czasu świata przypada na jedną sekundę czasu wyświetlania. */
  worldSecondsPerDisplaySecond: number;
}

const YEAR_SECONDS = 365.25 * 24 * 3600;

export const TIME_SCALES: Record<TimeScaleId, TimeScaleDef> = {
  realtime: { id: 'realtime', label: '1 s = 1 s', worldSecondsPerDisplaySecond: 1 },
  hour: { id: 'hour', label: '1 s = 1 godzina', worldSecondsPerDisplaySecond: 3600 },
  day: { id: 'day', label: '1 s = 1 doba', worldSecondsPerDisplaySecond: 86400 },
  year: { id: 'year', label: '1 s = 1 rok', worldSecondsPerDisplaySecond: YEAR_SECONDS },
  century: { id: 'century', label: '1 s = 1 wiek', worldSecondsPerDisplaySecond: YEAR_SECONDS * 100 },
};

/**
 * Czas świata z czasu wyświetlania. Rozdzielenie jest po to, żeby „sekundy →
 * lata → wieki" było przeliczeniem, a nie przyspieszoną animacją: model liczy
 * w czasie świata, ekran rysuje w swoim.
 */
export function worldSecondsFromDisplay(displaySeconds: number, scale: TimeScaleId): number {
  return displaySeconds * TIME_SCALES[scale].worldSecondsPerDisplaySecond;
}

export function worldYearsFromDisplay(displaySeconds: number, scale: TimeScaleId): number {
  return worldSecondsFromDisplay(displaySeconds, scale) / YEAR_SECONDS;
}

export interface SceneRequest {
  /** Id istniejącej RealityScene — nie tworzymy nowej sceny, tylko opisujemy tę, która działa. */
  sceneId: string;
  /** Migawka parametrów gałęzi (branches.ts). Wyłącznie to, co steruje modelem. */
  parameters: Readonly<Record<string, number>>;
  timeScale: TimeScaleId;
  /** Ile wariantów świata użytkownik zestawia równocześnie. >1 czyni scenę kontrfaktyczną. */
  branchCount: number;
  /** Zadeklarowane warstwy wizualne — patrz UNSOLVED_VISUAL_LAYERS. */
  visualLayers: readonly string[];
  /** Twierdzenia, które scena stawia. Puste to normalny przypadek. */
  claims: readonly string[];
}

export interface SceneObservable {
  nodeId: string;
  label: string;
  unit: string;
  value: number;
  honesty: HonestyLevel;
  derivation: NodeDerivation;
  formula: string;
}

export interface SceneCapture {
  contractVersion: string;
  request: SceneRequest;
  /** Odcisk STRUKTURY modelu: id węzłów, wzory, wejścia. Zmiana wzoru zmienia odcisk. */
  modelStructureFingerprint: string;
  sceneRequestFingerprint: string;
  sceneStateFingerprint: string;
  observables: readonly SceneObservable[];
  status: EpistemicStatus;
  statusReason: string;
  /** Zdania, których ta scena NIE dowodzi. Nigdy puste dla SCENARIO/CINEMATIC/BLOCKED. */
  doesNotProve: readonly string[];
}

/**
 * Odcisk struktury modelu — liczony z samego grafu, nie z ręcznie pisanego
 * numeru wersji. Numer trzeba pamiętać podbić; wzór podbija się sam.
 */
export function modelStructureFingerprint(graph: ModelGraph): string {
  const nodes = graph
    .getAllNodes()
    .map((node) => [node.id, node.formula, node.derivation, node.honesty, node.unit, [...node.inputs].sort()])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return `model_${fnv1a(canonicalJson(nodes))}`;
}

export function fingerprintSceneRequest(request: SceneRequest, modelFingerprint: string): string {
  return `scene_${fnv1a(
    canonicalJson({
      contractVersion: SCENE_CAPTURE_CONTRACT_VERSION,
      sceneId: request.sceneId,
      modelFingerprint,
      parameters: request.parameters,
      timeScale: request.timeScale,
      branchCount: request.branchCount,
      visualLayers: [...request.visualLayers].sort(),
      claims: [...request.claims].sort(),
    }),
  )}`;
}

export interface EpistemicVerdict {
  status: EpistemicStatus;
  reason: string;
  doesNotProve: readonly string[];
}

/**
 * Status sceny wynika z tego, co scena naprawdę ma za sobą — w tej kolejności:
 * brak modelu bije wszystko, zakazane twierdzenie bije ładny obrazek, warstwa
 * bez solvera ogranicza do CINEMATIC, zestawienie wariantów czyni scenę
 * SCENARIO, a scena jednowariantowa oparta o graf to MODEL.
 */
export function resolveEpistemicStatus(request: SceneRequest, hasModel: boolean): EpistemicVerdict {
  const doesNotProve: string[] = [];

  if (!hasModel) {
    return {
      status: 'NOT_MODELED',
      reason: 'Scena nie ma za sobą grafu modelu — nie ma czego przeliczyć ani odtworzyć.',
      doesNotProve: ['Ta scena nie liczy żadnej wielkości fizycznej.'],
    };
  }

  const forbidden = request.claims.filter((claim) => claim in FORBIDDEN_CLAIMS);
  if (forbidden.length > 0) {
    return {
      status: 'BLOCKED',
      reason: `Scena deklaruje twierdzenie, którego Genesis nie stawia: ${forbidden.join(', ')}.`,
      doesNotProve: forbidden.map((claim) => FORBIDDEN_CLAIMS[claim]),
    };
  }

  const unsolved = request.visualLayers.filter((layer) =>
    (UNSOLVED_VISUAL_LAYERS as readonly string[]).includes(layer),
  );

  if (request.branchCount > 1) {
    doesNotProve.push(FORBIDDEN_CLAIMS['parallel-universes-exist']);
  }
  for (const layer of unsolved) {
    doesNotProve.push(`Warstwa „${layer}" nie ma za sobą zatwierdzonego solvera — jest elementem obrazu, nie wynikiem.`);
  }

  if (unsolved.length > 0) {
    return {
      status: 'CINEMATIC',
      reason: `Scena zawiera warstwy bez zatwierdzonego solvera (${unsolved.join(', ')}), więc nie stawia twierdzenia naukowego.`,
      doesNotProve,
    };
  }

  if (request.branchCount > 1) {
    return {
      status: 'SCENARIO',
      reason: `Zestawienie ${request.branchCount} wariantów parametrów jednego modelu — przebieg kontrfaktyczny, nie obserwacja.`,
      doesNotProve,
    };
  }

  return {
    status: 'MODEL',
    reason: 'Pojedynczy wariant przeliczony jawnym grafem modelu.',
    doesNotProve: ['Wynik obowiązuje w granicach założeń modelu; nie jest pomiarem.'],
  };
}

/**
 * Zapisuje scenę PRZELICZAJĄC model od nowa z migawki parametrów. Nie odczytuje
 * żadnej zapamiętanej odpowiedzi — to warunek tego, żeby replay cokolwiek znaczył.
 */
export function captureScene(request: SceneRequest, graph: ModelGraph): SceneCapture {
  const nodes = graph.getAllNodes();
  const hasModel = nodes.length > 0 && Object.keys(request.parameters).length > 0;
  const modelFingerprint = modelStructureFingerprint(graph);
  const verdict = resolveEpistemicStatus(request, hasModel);

  const observables: SceneObservable[] = [];
  if (hasModel) {
    graph.applyParameterSnapshot({ ...request.parameters });
    for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
      observables.push({
        nodeId: node.id,
        label: node.label,
        unit: node.unit,
        value: graph.getValue(node.id),
        honesty: node.honesty,
        derivation: node.derivation,
        formula: node.formula,
      });
    }
  }

  const sceneRequestFingerprint = fingerprintSceneRequest(request, modelFingerprint);
  return {
    contractVersion: SCENE_CAPTURE_CONTRACT_VERSION,
    request,
    modelStructureFingerprint: modelFingerprint,
    sceneRequestFingerprint,
    sceneStateFingerprint: `state_${fnv1a(
      canonicalJson({ sceneRequestFingerprint, observables, status: verdict.status }),
    )}`,
    observables,
    status: verdict.status,
    statusReason: verdict.reason,
    doesNotProve: verdict.doesNotProve,
  };
}

export type SceneReplayVerdict = 'MATCH' | 'DRIFT' | 'NOT_REPRODUCIBLE' | 'BLOCKED';

export interface SceneReplayDifference {
  field: string;
  expected: string | number;
  actual: string | number;
}

export interface SceneReplay {
  verdict: SceneReplayVerdict;
  differences: readonly SceneReplayDifference[];
  message: string;
}

/**
 * Odtwarza scenę przez PONOWNE przeliczenie grafu z zapisanych parametrów.
 *
 *  MATCH            — struktura modelu, status i każda obserwabla wyszły identycznie.
 *  DRIFT            — coś się różni; różnice są wyliczone z nazwą pola i obiema wartościami.
 *  NOT_REPRODUCIBLE — zapis nie niesie kompletu wejść, więc nie ma czego odtwarzać.
 *  BLOCKED          — scena nie miała modelu albo stawiała niedopuszczalne twierdzenie.
 */
export function replaySceneCapture(capture: SceneCapture, graph: ModelGraph): SceneReplay {
  if (capture.status === 'NOT_MODELED' || capture.status === 'BLOCKED') {
    return {
      verdict: 'BLOCKED',
      differences: [],
      message: `Scena zapisana ze statusem ${capture.status} — nie ma czego odtwarzać.`,
    };
  }

  if (capture.observables.length === 0 || Object.keys(capture.request.parameters).length === 0) {
    return {
      verdict: 'NOT_REPRODUCIBLE',
      differences: [],
      message: 'Zapis nie zawiera kompletu wejść ani obserwabli — sceny nie da się odtworzyć.',
    };
  }

  const fresh = captureScene(capture.request, graph);
  const differences: SceneReplayDifference[] = [];

  if (fresh.modelStructureFingerprint !== capture.modelStructureFingerprint) {
    differences.push({
      field: 'modelStructureFingerprint',
      expected: capture.modelStructureFingerprint,
      actual: fresh.modelStructureFingerprint,
    });
  }
  if (fresh.status !== capture.status) {
    differences.push({ field: 'status', expected: capture.status, actual: fresh.status });
  }

  const freshByNode = new Map(fresh.observables.map((o) => [o.nodeId, o]));
  for (const expected of capture.observables) {
    const actual = freshByNode.get(expected.nodeId);
    if (!actual) {
      differences.push({ field: `observable.${expected.nodeId}`, expected: expected.value, actual: 'brak węzła' });
      continue;
    }
    if (actual.value !== expected.value) {
      differences.push({ field: `observable.${expected.nodeId}`, expected: expected.value, actual: actual.value });
    }
    if (actual.formula !== expected.formula) {
      differences.push({ field: `formula.${expected.nodeId}`, expected: expected.formula, actual: actual.formula });
    }
  }
  for (const actual of fresh.observables) {
    if (!capture.observables.some((o) => o.nodeId === actual.nodeId)) {
      differences.push({ field: `observable.${actual.nodeId}`, expected: 'brak węzła', actual: actual.value });
    }
  }

  if (differences.length === 0) {
    return {
      verdict: 'MATCH',
      differences,
      message: 'Scena odtworzona z zapisanych wejść — struktura modelu, status i wszystkie obserwable identyczne.',
    };
  }
  return {
    verdict: 'DRIFT',
    differences,
    message: `Odtworzenie dało inną scenę. Różnice: ${differences
      .map((d) => `${d.field} (${String(d.expected)} → ${String(d.actual)})`)
      .join('; ')}.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type StoredSceneCaptureStatus = 'VALID' | 'INVALID_LOCAL_RECORD';

/**
 * Granica integralności dla zapisów sceny. `typeof null === 'object'`, więc
 * sprawdzanie samego `typeof` przepuszcza `null` i wywraca konsumenta na
 * odczycie pola — VALID ma znaczyć „da się to bezpiecznie pokazać i odtworzyć".
 */
export function classifyStoredSceneCapture(value: unknown): StoredSceneCaptureStatus {
  if (!isRecord(value)) return 'INVALID_LOCAL_RECORD';
  if (
    typeof value.contractVersion !== 'string'
    || typeof value.modelStructureFingerprint !== 'string'
    || typeof value.sceneRequestFingerprint !== 'string'
    || typeof value.sceneStateFingerprint !== 'string'
    || typeof value.statusReason !== 'string'
    || typeof value.status !== 'string'
    || !(value.status in EPISTEMIC_STATUS_LABELS)
  ) return 'INVALID_LOCAL_RECORD';

  if (!Array.isArray(value.doesNotProve) || !value.doesNotProve.every((item) => typeof item === 'string')) {
    return 'INVALID_LOCAL_RECORD';
  }

  const request = value.request;
  if (
    !isRecord(request)
    || typeof request.sceneId !== 'string'
    || typeof request.branchCount !== 'number'
    || typeof request.timeScale !== 'string'
    || !(request.timeScale in TIME_SCALES)
    || !isRecord(request.parameters)
    || !Object.values(request.parameters).every((v) => typeof v === 'number' && Number.isFinite(v))
    || !Array.isArray(request.visualLayers)
    || !request.visualLayers.every((layer) => typeof layer === 'string')
    || !Array.isArray(request.claims)
    || !request.claims.every((claim) => typeof claim === 'string')
  ) return 'INVALID_LOCAL_RECORD';

  if (!Array.isArray(value.observables)) return 'INVALID_LOCAL_RECORD';
  const observablesOk = value.observables.every((item) =>
    isRecord(item)
    && typeof item.nodeId === 'string'
    && typeof item.label === 'string'
    && typeof item.unit === 'string'
    && typeof item.formula === 'string'
    && typeof item.value === 'number'
    && Number.isFinite(item.value));
  if (!observablesOk) return 'INVALID_LOCAL_RECORD';

  // Scena kontrfaktyczna albo artystyczna, która nie mówi, czego nie dowodzi,
  // jest właśnie tym zapisem, przed którym ten kontrakt ma chronić.
  const needsDisclaimer = value.status === 'SCENARIO' || value.status === 'CINEMATIC' || value.status === 'BLOCKED';
  if (needsDisclaimer && value.doesNotProve.length === 0) return 'INVALID_LOCAL_RECORD';

  return 'VALID';
}
