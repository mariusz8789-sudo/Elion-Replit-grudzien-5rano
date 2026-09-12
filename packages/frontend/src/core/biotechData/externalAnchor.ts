import { canonicalJson, fnv1a } from '../events/hash';
import { molecularWeight, parseFormula } from '../compute/cheminformatics';
import { createReferenceMeasurementRun } from '../experimentFabric/realExperiment';
import { EXPERIMENT_FABRIC_VERSION, type ExperimentRun } from '../experimentFabric/types';
import {
  predictionVerificationFingerprint,
  verifyPredictionAgainstRealExperiment,
  type PredictionVerification,
} from '../agent/predictionVerification';
import { assessSingleTautology, type ObservableDerivation, type TautologyAssessment } from '../agent/tautologyGate';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import type { DataProvenance } from '../dataProvenance';
import { getRouterModel } from '../experimentFabric/router';
import { buildStructuredRequestFromModel } from '../experimentFabric/structuredRequestBuilder';
import { runExperiment } from '../experimentFabric/executor';
import pubchemCid2519 from './pubchem-cid-2519.json';
import { PUBCHEM_CID_2519_RETRIEVED_AT, PUBCHEM_CID_2519_SOURCE_URL } from './pubchem';
import nssdcPlanetaryFactSheetHtml from './nssdc-planetary-factsheet.html?raw';
import {
  NSSDC_PLANETARY_FACTSHEET_RETRIEVED_AT,
  NSSDC_PLANETARY_FACTSHEET_SOURCE_URL,
  parseNssdcPlanetaryFactSheet,
} from './nssdcPlanetaryFactSheet';

/**
 * KOTWICA ZEWNĘTRZNA (P2.3) — obserwacja, której Genesis NIE wyprodukował.
 *
 * ## Czego brakowało, dokładnie
 *
 * Genesis miał już całą maszynerię „predykcja kontra realny pomiar":
 * `realExperiment.ts` buduje run oznaczony `REFERENCE`,
 * `predictionVerification.ts` sądzi go przeciw PREREJESTROWANEMU kryterium i
 * ODMAWIA porównania z runem `SIMULATED`, a `scienceMemory` zapisuje werdykt z
 * odciskiem. Brakującym ogniwem było ŹRÓDŁO obserwacji: jedyna produkcyjna
 * ścieżka (`DrugDiscoveryScreen.tsx:141-150`) brała liczbę z pola tekstowego
 * (`realEvidenceObserved`) i cytat z drugiego pola (`realEvidenceCitation`).
 *
 * To jest uczciwe co do ETYKIETY i bezwartościowe co do DOWODU: recenzent nie
 * może odtworzyć wpisanej liczby, a wpisany cytat jest asercją, nie
 * prowieniencją. Dla wniosku grantowego różnica jest całym punktem — „mierzymy
 * rzeczywistość" wymaga, żeby rzeczywistość dała się ponownie pobrać.
 *
 * ## Co ten moduł robi
 *
 * Bierze PRZYPIĘTY, opublikowany payload zewnętrzny (surowa odpowiedź REST
 * PubChem, w repo, z URL-em i datą pobrania), liczy jego odcisk, i ODMAWIA
 * zbudowania czegokolwiek, gdy odcisk się nie zgadza. Cytat jest składany z
 * prowieniencji zbioru, nigdy z tekstu użytkownika. Potem oddaje to
 * ISTNIEJĄCYM funkcjom — zero nowego silnika, zero drugiego słownika, zero
 * własnej statystyki.
 *
 * ## Odcisk: `fnv1a(canonicalJson(...))`, nie SHA-256 — i dlaczego
 *
 * To jest detektor ZMIANY, nie gwarancja kryptograficzna, i tak jest nazwany.
 * Payload jest wersjonowany w gicie, który sam zapewnia integralność treści;
 * zadaniem tego odcisku jest wyłapać CICHĄ EDYCJĘ przypiętej wartości, żeby
 * kotwica nie zaczęła po cichu mierzyć czegoś innego. Użycie `fnv1a` to ta sama
 * jedna prymitywa odciskowa, której używa całe repo (`core/events/hash.ts`) —
 * wprowadzenie SHA-256 tylko tutaj dałoby drugi system haszowania i, w
 * przeglądarce, asynchroniczne WebCrypto w ścieżce, która jest czysta i
 * synchroniczna. Gdzie potrzebna jest suma kryptograficzna dla danych POZA
 * repo, repo już ją ma: `scripts/fetch-atom-bohr-nist-fixtures.mjs` i
 * `compute/cms_zmumu_worker.py` weryfikują SHA-256 pobranych plików.
 */

export const EXTERNAL_ANCHOR_CONTRACT_VERSION = '1.0.0';

export const MOLECULAR_WEIGHT_ANCHOR_ID = 'pubchem-cid-2519-molecular-weight';

export interface ExternalAnchor {
  readonly id: string;
  readonly label: string;
  /**
   * Surowy, przypięty payload zewnętrzny — dokładnie tak, jak przyszedł ze
   * źródła. `unknown`, a nie typ generyczny, bo lista kotwic jest heterogeniczna
   * (każde źródło ma inny kształt odpowiedzi); zawężenie należy do czytników
   * konkretnej kotwicy, które i tak muszą sprawdzić kształt, zamiast zakładać go
   * w sygnaturze.
   */
  readonly payload: unknown;
  readonly sourceUrl: string;
  readonly sourceVersion: string;
  readonly retrievedAt: string;
  readonly license: string;
  /**
   * Odcisk przypiętego payloadu — **literał zapisany w źródle**, nie liczony z
   * payloadu przy ładowaniu modułu.
   *
   * Pierwsza wersja tego modułu liczyła go jako
   * `payloadDigest: anchorPayloadDigest(anchor.payload)` w deklaracji
   * `EXTERNAL_ANCHORS` — czyli suma kontrolna ZAWSZE zgadzała się z tym, co
   * było w pliku, i nie mogła wykryć niczego. Test jednostkowy tego nie złapał,
   * bo konstruował obiekt „podmieniony" z nowym payloadem i STARYM odciskiem,
   * więc sprawdzał mechanizm, który w produkcji był pozorny. Złapało to dopiero
   * WYKONANIE realnego scenariusza dryfu (`scripts/repro-demo.mjs` po cichej
   * edycji `MolecularWeight` na 999.99): zgłosiło rozbieżność wartości, ale
   * kotwica NIE odmówiła — bo odcisk przeliczył się razem z podmianą.
   *
   * Dlatego jest literałem. Edycja przypiętego payloadu rozjeżdża go z tym
   * napisem i kotwica ODMAWIA.
   */
  readonly payloadDigest: string;
  /** Nazwa mierzonej wielkości — ta sama po stronie predykcji i obserwacji. */
  readonly metric: string;
  readonly unit: string;
  /** Pasmo zgodności, PREREJESTROWANE tutaj — nie dobierane po zobaczeniu wyniku. */
  readonly tolerance: number;
  readonly toleranceRationale: string;
  /** Czyta obserwację z payloadu. Nic nie liczy — obserwacja ma pochodzić ze źródła. */
  readonly readObservation: (payload: unknown) => number | null;
  /** Liczy predykcję Genesis. Nie wolno jej czytać z payloadu. */
  readonly computePrediction: (payload: unknown) => number | null;
  /** Co ta kotwica NAPRAWDĘ testuje. */
  readonly whatThisTests: string;
  /** Co POZOSTAJE nieprzetestowane — punkt obowiązkowy, patrz QE1. */
  readonly whatRemainsUntested: string;
  /**
   * Derywacja dla Tautology Gate (`core/agent/tautologyGate.ts`) — jawna
   * deklaracja, SKĄD wzięła się każda strona porównania. `observation.source`
   * MUSI być `'independent-measurement'`: to jest cała treść tego, co czyni
   * kotwicę kotwicą, a nie sprawdzeniem modelu wobec samego siebie. Bez tego
   * pola `runExternalAnchor` nie miałby jak odróżnić „porównaliśmy z czymś
   * niezależnym" od „porównaliśmy liczbę z tą samą liczbą" — dokładnie to
   * rozróżnienie, którego cała Brama pilnuje gdzie indziej (QE1-3).
   */
  readonly tautologyDerivation: {
    readonly prediction: ObservableDerivation;
    readonly observation: ObservableDerivation;
  };
}

/** Odcisk treści przypiętego payloadu. Detektor zmiany, nie suma kryptograficzna. */
export function anchorPayloadDigest(payload: unknown): string {
  return fnv1a(canonicalJson(payload as Parameters<typeof canonicalJson>[0]));
}

type PubChemPropertyPayload = {
  PropertyTable: { Properties: Array<{ CID: number; MolecularFormula: string; MolecularWeight: string }> };
};

/** Zawężenie kształtu payloadu. Kotwica sprawdza go, a nie zakłada. */
function asPubChemProperties(payload: unknown): PubChemPropertyPayload['PropertyTable']['Properties'][number] | null {
  const table = (payload as PubChemPropertyPayload | null)?.PropertyTable;
  const first = table?.Properties?.[0];
  return first !== undefined && first !== null ? first : null;
}

const molecularWeightAnchor: ExternalAnchor = {
  id: MOLECULAR_WEIGHT_ANCHOR_ID,
  label: 'Masa molowa kofeiny: predykcja Genesis z formuły kontra opublikowana wartość PubChem (CID 2519)',
  payload: pubchemCid2519,
  sourceUrl: PUBCHEM_CID_2519_SOURCE_URL,
  sourceVersion: 'PubChem CID 2519 (PUG REST property table)',
  retrievedAt: PUBCHEM_CID_2519_RETRIEVED_AT,
  // PubChem to domena publiczna USA (NCBI/NLM); przypięcie próbki jest dozwolone.
  license: 'Public domain (U.S. NCBI/NLM PubChem)',
  // Literał, nie wyliczenie — patrz komentarz przy `payloadDigest` w interfejsie.
  // Po ŚWIADOMEJ aktualizacji zbioru przelicz: `node scripts/repro-demo.mjs --update`.
  payloadDigest: '470de276',
  metric: 'molecularWeightGramsPerMole',
  unit: 'g/mol',
  // 0,5% — z konwencji, nie z gustu: PubChem publikuje masę zaokrągloną do
  // dwóch miejsc ("194.19"), a obie strony używają WŁASNYCH, niezależnie
  // utrzymywanych tablic mas atomowych o konwencjonalnych (nie dokładnych)
  // wartościach. Pasmo musi pokryć zaokrąglenie źródła i różnicę konwencji, a
  // NIE błąd rzędu procenta w arytmetyce albo w tablicy pierwiastków.
  tolerance: 194.19 * 0.005,
  toleranceRationale: '±0,5% pokrywa zaokrąglenie publikacji PubChem do dwóch miejsc i różnicę między niezależnie utrzymywanymi tablicami konwencjonalnych mas atomowych; nie pokrywa błędu arytmetycznego ani złej masy pierwiastka.',
  readObservation: (payload) => {
    const row = asPubChemProperties(payload);
    if (row === null) return null;
    const value = Number(row.MolecularWeight);
    return Number.isFinite(value) ? value : null;
  },
  computePrediction: (payload) => {
    // Z FORMUŁY, tablicą IUPAC 2021 z `compute/cheminformatics.ts`. Kolumna
    // `MolecularWeight` payloadu nie jest tu czytana — inaczej cała kotwica
    // porównywałaby liczbę z samą sobą.
    const row = asPubChemProperties(payload);
    if (row === null || typeof row.MolecularFormula !== 'string') return null;
    const formula = row.MolecularFormula;
    const parsed = parseFormula(formula);
    if (!parsed.ok) return null;
    return molecularWeight(parsed.counts);
  },
  whatThisTests: 'Że implementacja cheminformatyki Genesis (parser wzoru + tablica mas atomowych IUPAC 2021) odtwarza masę molową opublikowaną niezależnie przez PubChem dla tej samej substancji. Dwie niezależne implementacje na dwóch niezależnie utrzymywanych tablicach muszą się zgodzić, a jeśli nie — werdykt jest FALSIFIED i to jest realna informacja o naszym kodzie.',
  whatRemainsUntested: 'To NIE jest pomiar przyrody. PubChem swojej masy molowej też nie mierzy — liczy ją z wzoru, własną konwencją mas atomowych. Kotwica jest więc WERYFIKACJĄ WOBEC NIEZALEŻNEGO ŹRÓDŁA, nie testem empirycznym: zgodność nie potwierdza żadnej hipotezy fizycznej, a jedynie to, że nasza arytmetyka i nasza tablica pierwiastków nie rozjechały się z cudzymi. Empiryczną kotwicą byłby dopiero POMIAR (np. spektrometria mas), którego w tym zbiorze nie ma.',
  tautologyDerivation: {
    prediction: {
      source: 'hypothesis-parameter',
      modelId: 'cheminformatics-formula-parser-iupac2021',
      rationale: 'Predykcja jest liczona z formuły chemicznej (MolecularFormula) przez parser wzoru Genesis + własną tablicę mas atomowych IUPAC 2021 — genuinie zależy od tego, jaka formuła jest podana, nie jest analitycznym sufitem żadnego modelu.',
    },
    observation: {
      source: 'independent-measurement',
      modelId: 'pubchem-pug-rest',
      rationale: 'Wartość MolecularWeight pochodzi z opublikowanej, niezależnie utrzymywanej bazy PubChem (NCBI/NLM) — inny kod, inna tablica mas atomowych, zero współdzielonych parametrów z parserem Genesis.',
    },
  },
};

const KEPLER_AU_KILOMETERS = 149597870.7;

/** Zawężenie kształtu payloadu Marsa z przypiętej strony NASA. */
function marsElementsFromNssdcPayload(payload: unknown): { readonly distanceFromSunMillionKm: number; readonly orbitalPeriodDays: number } | null {
  if (typeof payload !== 'string') return null;
  const parsed = parseNssdcPlanetaryFactSheet(payload);
  return parsed.mars ?? null;
}

export const KEPLER_MARS_ANCHOR_ID = 'nasa-nssdc-mars-orbital-period-kepler-third-law';

const keplerMarsAnchor: ExternalAnchor = {
  id: KEPLER_MARS_ANCHOR_ID,
  label: 'Okres orbitalny Marsa: predykcja Genesis z III prawa Keplera (universe-kepler) kontra opublikowana wartość NASA NSSDCA',
  // Surowa strona HTML NASA, DOSŁOWNIE — patrz nssdcPlanetaryFactSheet.ts dla
  // pełnej prowieniencji (odtworzone z realnego loga CI, SHA-256 zweryfikowany
  // dwoma niezależnymi metodami).
  payload: nssdcPlanetaryFactSheetHtml,
  sourceUrl: NSSDC_PLANETARY_FACTSHEET_SOURCE_URL,
  sourceVersion: 'NASA NSSDCA Planetary Fact Sheet (metric)',
  retrievedAt: NSSDC_PLANETARY_FACTSHEET_RETRIEVED_AT,
  license: 'US Government work — NASA material is generally not copyrighted (public domain), attribution: NASA/NSSDCA, Dr. David R. Williams.',
  // Literał — patrz komentarz przy `payloadDigest` w interfejsie i D-014 w
  // docs/DECISIONS.md. Po ŚWIADOMEJ aktualizacji przypiętego pliku przelicz
  // ponownie i wklej tutaj; NIGDY `anchorPayloadDigest(anchor.payload)` na żywo.
  payloadDigest: '2296fa16',
  metric: 'orbitalPeriodDays',
  unit: 'days',
  // Pasmo z ROZDZIELCZOŚCI PUBLIKACJI, nie z gustu: NASA podaje odległość
  // Marsa jako "228.0" (4 cyfry znaczące, ostatnia cyfra ±0.05 -> względny
  // błąd ~0,022%). Okres skaluje się jak a^(3/2) (III prawo Keplera), więc
  // ten sam względny błąd w odległości daje ~1,5× większy względny błąd w
  // okresie (~0,033%). Do tego dochodzi zaokrąglenie SAMEGO okresu w źródle
  // ("687.0", ±0.05 dnia, ~0,007%). Suma (nie RSS, dla prostoty i spójności z
  // pasmem pierwszej kotwicy) zaokrąglona w górę do czystej liczby: 0,05%.
  // Realnie zmierzona rozbieżność (0,234 dnia) mieści się w tym paśmie z
  // zapasem, a pasmo jest prerejestrowane PRZED wykonaniem, nie dobrane po
  // zobaczeniu tej liczby.
  tolerance: 687.0 * 0.0005,
  toleranceRationale: '±0,05% pokrywa zaokrąglenie publikacji NASA do 4 cyfr znaczących odległości (propagowane przez wykładnik 3/2 III prawa Keplera) plus zaokrąglenie samego okresu; nie pokrywa błędu w implementacji universe-kepler ani błędnej stałej AU.',
  readObservation: (payload) => {
    const mars = marsElementsFromNssdcPayload(payload);
    return mars === null ? null : mars.orbitalPeriodDays;
  },
  computePrediction: (payload) => {
    // Z ODLEGŁOŚCI Marsa od Słońca, przez REALNY graf universe-kepler
    // (orbitalGraph.ts, III prawo Keplera dokładnie). Kolumna "Orbital
    // Period" payloadu NIE jest tu czytana — inaczej kotwica porównywałaby
    // okres z samym sobą.
    const mars = marsElementsFromNssdcPayload(payload);
    if (mars === null) return null;
    const model = getRouterModel('universe-kepler');
    if (model === undefined) return null;
    const orbitalRadiusAu = (mars.distanceFromSunMillionKm * 1e6) / KEPLER_AU_KILOMETERS;
    const request = buildStructuredRequestFromModel(model, { centralMassSolar: 1, orbitalRadiusAu }, {
      sourceText: `Kotwica Kepler/Mars: predykcja III prawa Keplera dla orbitalRadiusAu=${orbitalRadiusAu}.`,
    });
    const run = runExperiment(request);
    const periodYears = run.result.outputs.orbitalPeriodYears;
    return typeof periodYears === 'number' && Number.isFinite(periodYears) ? periodYears * 365.25 : null;
  },
  whatThisTests: 'Że istniejący graf orbitalny Genesis (universe-kepler, III prawo Keplera dla zagadnienia dwóch ciał) przewiduje okres orbitalny Marsa z jego odległości od Słońca zgodnie z tym, co niezależnie opublikowała NASA. Odległość (mierzona radarowo/śledzeniem sond kosmicznych, technika XX wieku) i okres (mierzony bezpośrednią astrometrią pozycyjną od stuleci) pochodzą z dwóch historycznie niezależnych kanałów pomiarowych — dokładnie ta struktura, która pozwoliła Keplerowi sformułować to prawo, a Newtonowi je wyjaśnić. Rozbieżność ponad prerejestrowane pasmo byłaby FALSIFIED i realną informacją o naszej implementacji.',
  whatRemainsUntested: 'To NIE jest pomiar wykonany przez Genesis — obie liczby (odległość i okres) są wzięte z publikacji NASA, nie zmierzone tym systemem. Kotwica weryfikuje, czy nasza implementacja III prawa Keplera (arytmetyka, stała AU, jednostki) odtwarza publicznie znaną relację między dwiema NIEZALEŻNIE zmierzonymi wielkościami — nie testuje samego prawa fizycznego (ugruntowanego od XVII wieku) ani nie odkrywa niczego o Marsie. Nie testuje też perturbacji od innych planet (przybliżenie dwóch ciał) ani ekscentryczności orbity ponad to, co już zawiera się w użyciu półosi wielkiej.',
  tautologyDerivation: {
    prediction: {
      source: 'hypothesis-parameter',
      modelId: 'universe-kepler',
      rationale: 'Predykcja jest liczona przez REALNY graf orbitalny (buildOrbitalModelGraph -> orbitalPeriodYears) z odległości Marsa jako wejścia — genuinie zależy od tego, jaka odległość jest podana; nie jest analitycznym sufitem, tylko realnym wynikiem modelu na konkretnym wejściu.',
    },
    observation: {
      source: 'independent-measurement',
      modelId: 'nasa-nssdc-planetary-factsheet',
      rationale: 'Okres orbitalny Marsa pochodzi z niezależnie opublikowanej strony NASA NSSDCA, zmierzony historycznie inną techniką (astrometria pozycyjna) niż odległość użyta do predykcji (radar/śledzenie sond) — zero współdzielonego kodu ani parametrów z universe-kepler.',
    },
  },
};

/** Zadeklarowane kotwice. Każda z prowieniencją i z jawnym „co zostaje nieprzetestowane". */
export const EXTERNAL_ANCHORS: readonly ExternalAnchor[] = [molecularWeightAnchor, keplerMarsAnchor];

export type AnchorResolution =
  | { readonly ok: true; readonly observedValue: number; readonly unit: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Czyta obserwację z kotwicy, ale TYLKO gdy odcisk payloadu zgadza się z
 * zadeklarowanym. Niezgodność to odmowa, nie ostrzeżenie: kotwica, która
 * cicho zmieniła mierzoną wartość, jest gorsza niż brak kotwicy.
 */
export function resolveExternalAnchor(anchor: ExternalAnchor): AnchorResolution {
  const actual = anchorPayloadDigest(anchor.payload);
  if (actual !== anchor.payloadDigest) {
    return {
      ok: false,
      reason: `Odcisk przypiętego payloadu kotwicy "${anchor.id}" nie zgadza się z zadeklarowanym (${anchor.payloadDigest} → ${actual}). Payload został zmieniony po przypięciu, więc obserwacja nie jest już tą, którą zadeklarowano. Odmawiam użycia jej jako dowodu.`,
    };
  }
  const observed = anchor.readObservation(anchor.payload);
  if (observed === null) {
    return { ok: false, reason: `Payload kotwicy "${anchor.id}" nie zawiera skończonej wartości dla "${anchor.metric}".` };
  }
  return { ok: true, observedValue: observed, unit: anchor.unit };
}

/**
 * Buduje run `REFERENCE` z kotwicy, składając cytat z PROWIENIENCJI ZBIORU —
 * URL, wersji, daty pobrania, licencji i odcisku. Żadna część cytatu nie
 * pochodzi z wpisu użytkownika, więc da się go sprawdzić: recenzent pobiera
 * URL, liczy odcisk i porównuje.
 */
export function buildAnchoredReferenceRun(anchor: ExternalAnchor): ExperimentRun {
  const resolved = resolveExternalAnchor(anchor);
  if (!resolved.ok) throw new Error(resolved.reason);
  const citationText = `${anchor.label}. Opublikowana wartość ${anchor.metric} = ${resolved.observedValue} ${anchor.unit}, odczytana z ${anchor.sourceVersion}; pobrane ${anchor.retrievedAt}; licencja: ${anchor.license}; odcisk przypiętego payloadu: ${anchor.payloadDigest}; źródło: ${anchor.sourceUrl}`;
  return createReferenceMeasurementRun({
    request: {
      structuredRequest: {
        contractVersion: EXPERIMENT_FABRIC_VERSION,
        sourceText: citationText,
        domainId: 'biotech',
        operation: 'simulate',
        modelId: anchor.id,
        parameters: {},
      },
      citation: { citationText, sourceRef: anchor.sourceUrl },
    },
    derived: [{ outputKey: anchor.metric, value: resolved.observedValue, unit: anchor.unit }],
    summary: `Obserwacja zewnętrzna z przypiętego, sumowanego zbioru: ${anchor.metric} = ${resolved.observedValue} ${anchor.unit}.`,
    assumptions: [anchor.whatThisTests],
    warnings: [anchor.whatRemainsUntested],
  });
}

export type AnchorRunResult =
  | {
    readonly ok: true;
    readonly anchorId: string;
    readonly criterion: FalsificationCriterion;
    readonly verification: PredictionVerification;
    readonly verificationFingerprint: string;
    /**
     * Skąd wzięła się obserwacja — CZYTANE z runu, nie deklarowane tutaj, i
     * typowane jako `DataProvenance`, więc konsument (np. `ProvenanceBadge`)
     * nie musi ufać napisowi.
     */
    readonly observationOrigin: DataProvenance;
    readonly replay: 'MATCH' | 'DRIFT';
    readonly whatRemainsUntested: string;
    /**
     * Klasyfikacja Tautology/Circularity Gate (`core/agent/tautologyGate.ts`)
     * dla TĘJ konkretnej pary predykcja/obserwacja. Kotwica z prawdziwie
     * niezależną obserwacją MUSI wyjść jako `EMPIRICAL_TEST` — jeśli kiedyś
     * wyjdzie `CONSISTENCY_CHECK`, to znaczy, że `tautologyDerivation`
     * kotwicy przestał być uczciwy, nie że Brama się myli.
     */
    readonly tautologyAssessment: TautologyAssessment;
  }
  | { readonly ok: false; readonly anchorId: string; readonly reason: string };

/**
 * Pełny cykl kotwicy: predykcja Genesis → obserwacja zewnętrzna → werdykt
 * falsyfikacyjny → odcisk umożliwiający replay.
 *
 * Nic tu nie jest nową logiką naukową: kryterium jest prerejestrowane w
 * deklaracji kotwicy, porównania dokonuje istniejące
 * `verifyPredictionAgainstRealExperiment`, a odcisk liczy istniejące
 * `predictionVerificationFingerprint`.
 */
export function runExternalAnchor(
  anchorId: string,
  options: { readonly predictedValueOverride?: number } = {},
): AnchorRunResult {
  const anchor = EXTERNAL_ANCHORS.find((candidate) => candidate.id === anchorId);
  if (anchor === undefined) return { ok: false, anchorId, reason: `Nie ma zadeklarowanej kotwicy "${anchorId}".` };

  let realRun: ExperimentRun;
  try {
    realRun = buildAnchoredReferenceRun(anchor);
  } catch (error) {
    return { ok: false, anchorId, reason: String((error as Error)?.message ?? error) };
  }

  const predicted = options.predictedValueOverride ?? anchor.computePrediction(anchor.payload);
  if (predicted === null || !Number.isFinite(predicted)) {
    return { ok: false, anchorId, reason: `Genesis nie wyprodukował skończonej predykcji dla "${anchor.metric}" — nie ma czego porównać z obserwacją.` };
  }

  const criterion: FalsificationCriterion = {
    metric: anchor.metric,
    relation: 'equal-within-tolerance',
    tolerance: anchor.tolerance,
    rationale: `${anchor.label} — pasmo prerejestrowane: ${anchor.toleranceRationale}`,
  };
  const verification = verifyPredictionAgainstRealExperiment({ predictedValue: predicted, criterion, realRun });
  const fingerprint = predictionVerificationFingerprint(verification);
  // Replay: ten sam przypięty payload i ta sama predykcja muszą dać ten sam
  // odcisk. Liczone przez POWTÓRZENIE porównania, nie przez porównanie odcisku
  // z samym sobą.
  const replayVerification = verifyPredictionAgainstRealExperiment({
    predictedValue: predicted,
    criterion,
    realRun: buildAnchoredReferenceRun(anchor),
  });
  const replay = predictionVerificationFingerprint(replayVerification) === fingerprint ? 'MATCH' : 'DRIFT';

  // Fail closed: run bez zadeklarowanej prowieniencji nie ma prawa udawać
  // kotwicy, więc zamiast podstawiać literał 'UNKNOWN' odmawiamy. Ścieżka
  // `buildAnchoredReferenceRun` zawsze ustawia REFERENCE, więc to jest strażnik
  // przed przyszłą zmianą tam, nie przed dzisiejszym stanem.
  const observationOrigin = realRun.provenance.dataProvenance;
  if (observationOrigin === undefined) {
    return { ok: false, anchorId, reason: `Run kotwiczący "${anchor.id}" nie deklaruje dataProvenance — nie wolno go użyć jako obserwacji zewnętrznej.` };
  }

  const tautologyAssessment = assessSingleTautology({
    componentId: anchor.id,
    prediction: anchor.tautologyDerivation.prediction,
    observation: anchor.tautologyDerivation.observation,
  });

  return {
    ok: true,
    anchorId,
    criterion,
    verification,
    verificationFingerprint: fingerprint,
    observationOrigin,
    replay,
    whatRemainsUntested: anchor.whatRemainsUntested,
    tautologyAssessment,
  };
}
