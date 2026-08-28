import { describe, expect, it } from 'vitest';
import {
  captureScene,
  classifyStoredSceneCapture,
  EPISTEMIC_STATUS_LABELS,
  FORBIDDEN_CLAIMS,
  modelStructureFingerprint,
  replaySceneCapture,
  resolveEpistemicStatus,
  TIME_SCALES,
  worldYearsFromDisplay,
  type SceneRequest,
} from '../core/reality/sceneCapture';
import { buildOrbitalModelGraph } from '../core/modelGraph/orbitalGraph';
import { ModelGraph } from '../core/modelGraph/graph';
import { TESSERACT_EDGES, TESSERACT_VERTICES } from '../core/physics';

/**
 * Observer at the Junction — testy pilnują tego, czego demonstrator NIE MOŻE
 * o sobie powiedzieć, a nie tego, że ładnie wygląda.
 *
 * Scena stoi na istniejącym Scientific Model Graph (mechanika orbitalna,
 * III prawo Keplera z core/physics.ts) i istniejącym persystentnym rendererze.
 * Nowy jest wyłącznie zapis: co scena twierdzi, czym to jest epistemicznie i
 * czy da się to odtworzyć.
 */

const graph = () => buildOrbitalModelGraph();

const request = (over: Partial<SceneRequest> = {}): SceneRequest => ({
  sceneId: 'orbital',
  parameters: { centralMassSolar: 1, orbitalRadiusAu: 1 },
  timeScale: 'year',
  branchCount: 1,
  visualLayers: [],
  claims: [],
  ...over,
});

describe('Scene capture — odtwarzalność', () => {
  it('ta sama scena i te same parametry → MATCH', () => {
    const capture = captureScene(request(), graph());

    // Świeży graf, żeby MATCH nie wynikał z tego, że stan został w pamięci.
    const replay = replaySceneCapture(capture, graph());

    expect(replay.verdict).toBe('MATCH');
    expect(replay.differences).toEqual([]);
  });

  it('zmiana parametru → DRIFT z nazwą węzła i obiema wartościami', () => {
    const capture = captureScene(request(), graph());
    const moved = { ...capture, request: { ...capture.request, parameters: { centralMassSolar: 4, orbitalRadiusAu: 1 } } };

    const replay = replaySceneCapture(moved, graph());

    expect(replay.verdict).toBe('DRIFT');
    const period = replay.differences.find((d) => d.field === 'observable.orbitalPeriodYears');
    expect(period).toBeDefined();
    expect(period!.expected).not.toBe(period!.actual);
  });

  it('zmiana skali czasu → inny odcisk sceny', () => {
    const seconds = captureScene(request({ timeScale: 'realtime' }), graph());
    const centuries = captureScene(request({ timeScale: 'century' }), graph());

    expect(seconds.sceneRequestFingerprint).not.toBe(centuries.sceneRequestFingerprint);
    expect(seconds.sceneStateFingerprint).not.toBe(centuries.sceneStateFingerprint);
  });

  it('zmiana wersji modelu (wzoru w grafie) → DRIFT, nawet przy tych samych parametrach', () => {
    const capture = captureScene(request(), graph());

    // Ten sam wynik liczbowy, inny zapis wzoru: wersja modelu to struktura, nie liczba.
    const edited = graph();
    const node = edited.getNode('orbitalPeriodYears')!;
    const patched = new ModelGraph();
    for (const n of edited.getAllNodes()) {
      patched.addNode(
        n.id === node.id ? { ...n, formula: `${n.formula} (rewizja)` } : n,
        n.inputs.length === 0 ? edited.getValue(n.id) : 0,
      );
    }

    const replay = replaySceneCapture(capture, patched);

    expect(replay.verdict).toBe('DRIFT');
    expect(replay.differences.map((d) => d.field)).toContain('modelStructureFingerprint');
  });

  it('brak modelu → NOT_MODELED przy zapisie i BLOCKED przy odtworzeniu', () => {
    const capture = captureScene(request(), new ModelGraph());

    expect(capture.status).toBe('NOT_MODELED');
    expect(capture.observables).toEqual([]);
    expect(replaySceneCapture(capture, new ModelGraph()).verdict).toBe('BLOCKED');
  });

  it('zapis bez obserwabli → NOT_REPRODUCIBLE, nie MATCH', () => {
    const capture = captureScene(request(), graph());

    const gutted = { ...capture, observables: [] };

    expect(replaySceneCapture(gutted, graph()).verdict).toBe('NOT_REPRODUCIBLE');
  });

  it('odcisk nie zależy od etykiety ani identyfikatora gałęzi — tylko od tego, co steruje modelem', () => {
    const a = captureScene(request(), graph());
    const b = captureScene(request(), graph());

    // Dwa niezależne zapisy tej samej konfiguracji muszą być nieodróżnialne;
    // gdyby odcisk łapał Date.now() albo licznik gałęzi, byłyby różne.
    expect(a.sceneStateFingerprint).toBe(b.sceneStateFingerprint);
  });
});

describe('Scene capture — status epistemiczny', () => {
  it('pojedynczy wariant na grafie modelu to MODEL, nigdy FACT ani MEASUREMENT', () => {
    const capture = captureScene(request(), graph());

    expect(capture.status).toBe('MODEL');
    expect(capture.status).not.toBe('FACT');
    expect(capture.status).not.toBe('MEASUREMENT');
    expect(capture.doesNotProve.length).toBeGreaterThan(0);
  });

  it('zestawienie wariantów to SCENARIO i musi zaprzeczyć równoległym wszechświatom', () => {
    const capture = captureScene(request({ branchCount: 3 }), graph());

    expect(capture.status).toBe('SCENARIO');
    expect(capture.doesNotProve).toContain(FORBIDDEN_CLAIMS['parallel-universes-exist']);
    expect(capture.doesNotProve.join(' ')).toContain('nie obserwacja równoległych wszechświatów');
  });

  it('próg/wormhole bez solvera obniża scenę do CINEMATIC, choć wolno go pokazać', () => {
    const capture = captureScene(request({ visualLayers: ['wormhole-threshold'] }), graph());

    expect(capture.status).toBe('CINEMATIC');
    expect(capture.statusReason).toContain('bez zatwierdzonego solvera');
    expect(capture.doesNotProve.some((line) => line.includes('wormhole-threshold'))).toBe(true);
  });

  it('próba przedstawienia wormhole jako faktu → BLOCKED, nie ładny obrazek z gwiazdką', () => {
    const capture = captureScene(request({ claims: ['traversable-wormhole-confirmed'] }), graph());

    expect(capture.status).toBe('BLOCKED');
    expect(capture.doesNotProve).toContain(FORBIDDEN_CLAIMS['traversable-wormhole-confirmed']);
  });

  it('próba przedstawienia piątego wymiaru jako obserwacji → BLOCKED', () => {
    expect(captureScene(request({ claims: ['fifth-spatial-dimension-observed'] }), graph()).status).toBe('BLOCKED');
  });

  it('twierdzenie, że superpozycja daje dostęp do wszystkich rzeczywistości → BLOCKED', () => {
    const capture = captureScene(request({ claims: ['superposition-grants-access-to-all-realities'] }), graph());

    expect(capture.status).toBe('BLOCKED');
    expect(capture.doesNotProve[0]).toContain('amplitud');
  });

  it('żaden zapis sceny nie może twierdzić, że dowodzi równoległych wszechświatów', () => {
    for (const branchCount of [1, 2, 5]) {
      const capture = captureScene(request({ branchCount }), graph());
      expect(capture.status).not.toBe('FACT');
      if (branchCount > 1) {
        expect(capture.doesNotProve).toContain(FORBIDDEN_CLAIMS['parallel-universes-exist']);
      }
    }
    expect(captureScene(request({ claims: ['parallel-universes-exist'] }), graph()).status).toBe('BLOCKED');
  });

  it('brak modelu bije nawet zakazane twierdzenie — najpierw „nie ma czego liczyć"', () => {
    const verdict = resolveEpistemicStatus(request({ claims: ['parallel-universes-exist'] }), false);

    expect(verdict.status).toBe('NOT_MODELED');
  });
});

describe('Scene capture — czas świata a czas ekranu', () => {
  it('ta sama sekunda ekranu daje różny czas świata w zależności od skali', () => {
    expect(worldYearsFromDisplay(1, 'realtime')).toBeCloseTo(1 / (365.25 * 24 * 3600), 12);
    expect(worldYearsFromDisplay(1, 'year')).toBeCloseTo(1, 12);
    expect(worldYearsFromDisplay(1, 'century')).toBeCloseTo(100, 12);
    expect(worldYearsFromDisplay(10, 'century')).toBeCloseTo(1000, 12);
  });

  it('skale są uporządkowane rosnąco — sekundy → godziny → doby → lata → wieki', () => {
    const order = (['realtime', 'hour', 'day', 'year', 'century'] as const).map(
      (id) => TIME_SCALES[id].worldSecondsPerDisplaySecond,
    );
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});

describe('Scene capture — granica integralności zapisu', () => {
  const valid = () => JSON.parse(JSON.stringify(captureScene(request({ branchCount: 2 }), graph())));

  it('zdrowy zapis jest VALID', () => {
    expect(classifyStoredSceneCapture(valid())).toBe('VALID');
  });

  it('null i wartości nieobiektowe są odrzucane bez wyjątku', () => {
    for (const value of [null, undefined, 7, 'scena', []]) {
      expect(classifyStoredSceneCapture(value)).toBe('INVALID_LOCAL_RECORD');
    }
  });

  it('request: null jest odrzucony — typeof null === "object" nie może być dowodem', () => {
    expect(classifyStoredSceneCapture({ ...valid(), request: null })).toBe('INVALID_LOCAL_RECORD');
  });

  it('nieznany status i nieznana skala czasu są odrzucane', () => {
    expect(classifyStoredSceneCapture({ ...valid(), status: 'PROVEN' })).toBe('INVALID_LOCAL_RECORD');
    const record = valid();
    expect(classifyStoredSceneCapture({ ...record, request: { ...record.request, timeScale: 'eon' } }))
      .toBe('INVALID_LOCAL_RECORD');
  });

  it('parametr NaN/Infinity jest odrzucany — nie da się z tego odtworzyć sceny', () => {
    const record = valid();
    expect(classifyStoredSceneCapture({
      ...record,
      request: { ...record.request, parameters: { centralMassSolar: Number.NaN, orbitalRadiusAu: 1 } },
    })).toBe('INVALID_LOCAL_RECORD');
  });

  it('scena SCENARIO bez listy „czego nie dowodzi" jest odrzucana', () => {
    expect(classifyStoredSceneCapture({ ...valid(), doesNotProve: [] })).toBe('INVALID_LOCAL_RECORD');
  });

  it('uszkodzona obserwabla jest odrzucana zamiast wywracać konsumenta', () => {
    const record = valid();
    expect(classifyStoredSceneCapture({ ...record, observables: [{ nodeId: 'x' }] })).toBe('INVALID_LOCAL_RECORD');
    expect(classifyStoredSceneCapture({ ...record, observables: [null] })).toBe('INVALID_LOCAL_RECORD');
  });

  it('każdy status ze słownika ma etykietę — panel nie pokaże pustego pola', () => {
    for (const [status, label] of Object.entries(EPISTEMIC_STATUS_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(status).toBeTruthy();
    }
  });
});

describe('Tesserakt — rzut matematyczny, nie piąty wymiar', () => {
  it('ma dokładnie 16 wierzchołków i 32 krawędzie', () => {
    expect(TESSERACT_VERTICES).toHaveLength(16);
    expect(TESSERACT_EDGES).toHaveLength(32);
  });

  it('krawędzie łączą wierzchołki różniące się dokładnie jedną współrzędną', () => {
    for (const [a, b] of TESSERACT_EDGES) {
      const va = TESSERACT_VERTICES[a];
      const vb = TESSERACT_VERTICES[b];
      const differing = va.filter((value, index) => value !== vb[index]).length;
      expect(differing).toBe(1);
    }
  });

  it('scena z tesseraktem pozostaje MODEL — rzut 4D→3D to dokładna algebra, nie warstwa artystyczna', () => {
    const capture = captureScene(request({ visualLayers: ['tesseract-projection'] }), graph());

    expect(capture.status).toBe('MODEL');
  });

  it('ale twierdzenie o obserwacji piątego wymiaru jest blokowane niezależnie od warstwy', () => {
    const capture = captureScene(
      request({ visualLayers: ['tesseract-projection'], claims: ['fifth-spatial-dimension-observed'] }),
      graph(),
    );

    expect(capture.status).toBe('BLOCKED');
  });
});

describe('Model graph — odcisk struktury', () => {
  it('ten sam graf daje ten sam odcisk, inny wzór daje inny', () => {
    expect(modelStructureFingerprint(graph())).toBe(modelStructureFingerprint(graph()));

    const edited = new ModelGraph();
    for (const n of graph().getAllNodes()) {
      edited.addNode(n.id === 'orbitalPeriodYears' ? { ...n, formula: 'inny wzór' } : n, 1);
    }
    expect(modelStructureFingerprint(edited)).not.toBe(modelStructureFingerprint(graph()));
  });
});
