import { canonicalJson, fnv1a } from '../events/hash';
import { molecularWeight, parseFormula } from '../compute/cheminformatics';
import { createReferenceMeasurementRun } from '../experimentFabric/realExperiment';
import { EXPERIMENT_FABRIC_VERSION, type ExperimentRun } from '../experimentFabric/types';
import {
  predictionVerificationFingerprint,
  verifyPredictionAgainstRealExperiment,
  type PredictionVerification,
} from '../agent/predictionVerification';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import type { DataProvenance } from '../dataProvenance';
import pubchemCid2519 from './pubchem-cid-2519.json';
import { PUBCHEM_CID_2519_RETRIEVED_AT, PUBCHEM_CID_2519_SOURCE_URL } from './pubchem';
import { assessSingleTautology, evidenceCeiling, type ObservableDerivation, type TautologyAssessment } from '../agent/tautologyGate';
import { createHypothesis, evidenceMagnitudeWithinTolerance, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import { buildOrbitalModelGraph } from '../modelGraph/orbitalGraph';
import nssdcPlanetaryFactSheetHtml from './nssdc-planetary-factsheet.html?raw';

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
   * Jedno zdanie: SKĄD bierze się predykcja — dla UI (`EvidenceShowcaseScreen`).
   * Osobne pole, bo pierwsza (jedyna) kotwica była chemiczna i ekran miał to
   * wpisane na sztywno jako „ze wzoru molekularnego" — nieprawdziwe dla
   * kotwicy spoza chemii. Każda kotwica deklaruje własne zdanie.
   */
  readonly predictionSourceLabel: string;
  /**
   * Metadane Tautology Gate (`tautologyGate.ts`) dla PREDYKCJI tej kotwicy —
   * OPCJONALNE i czysto addytywne: kotwica, która tego nie deklaruje (np.
   * pierwsza, chemiczna kotwica, sprzed istnienia tego pola), zachowuje się
   * dokładnie jak dotąd — `runExternalAnchor` zwraca wtedy
   * `tautologyAssessment: null`, bez pułapu na dowód, bez zmiany zachowania.
   */
  readonly predictionDerivation?: ObservableDerivation;
  /** Jak wyżej, dla OBSERWACJI tej kotwicy. */
  readonly observationDerivation?: ObservableDerivation;
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
  predictionSourceLabel: 'from the published molecular formula',
  // predictionDerivation/observationDerivation deliberately left undeclared:
  // this anchor predates the Tautology Gate wiring, and both PubChem's
  // published value and Genesis's own value are computed from a formula, not
  // measured — declaring a source here would require the same care given to
  // the Kepler anchor below, which this mission did not ask for on the
  // existing anchor. `runExternalAnchor` reports `tautologyAssessment: null`
  // for this anchor, which is the honest, additive default.
};

export const KEPLER_VENUS_ANCHOR_ID = 'nssdc-venus-orbital-period-kepler';

/** Exactly 1 by definition of the solar-mass unit — not read from any payload. */
const SUN_MASS_SOLAR = 1;
/** IAU-defined astronomical unit, exact by definition (IAU Resolution B2, 2012) — not read from any payload. */
const AU_KM = 149597870.7;
const DAYS_PER_JULIAN_YEAR = 365.25;

const NSSDC_SOURCE_URL = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
const NSSDC_RETRIEVED_AT = '2026-09-12';

/** Planet columns in the fact sheet's own left-to-right table order. */
const FACT_SHEET_COLUMNS = ['Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;
const VENUS_COLUMN_INDEX = FACT_SHEET_COLUMNS.indexOf('Venus');

/**
 * Reads ONE row of the NSSDC Planetary Fact Sheet's HTML table, identified by
 * its stable `#<fragment>` anchor id (`dist`, `orbp`, ...) rather than its
 * English label text, which could be reformatted without changing meaning.
 * Returns the ten planet columns in the page's own order; `null` if the row
 * cannot be found — never a guessed value. Verified against the real, pinned
 * payload below (not assumed): see `docs/DECISIONS.md` for the fetch/inspect
 * sequence that produced this pattern.
 */
function readFactSheetRow(html: string, anchorFragment: string): readonly string[] | null {
  const rowPattern = new RegExp(`<tr>\\s*<td align=left><b><a href="planetfact_notes\\.html#${anchorFragment}">[\\s\\S]*?</tr>`, 'i');
  const row = rowPattern.exec(html)?.[0];
  if (row === undefined) return null;
  const cellPattern = /<td align=center[^>]*>([^<]*)<\/td>/g;
  const values: string[] = [];
  let cell: RegExpExecArray | null;
  while ((cell = cellPattern.exec(row)) !== null) values.push(cell[1]!.trim());
  return values;
}

/** Strips a trailing footnote marker (`*`) and thousands separators (`,`), then parses. `null` on anything else. */
function parseFactSheetNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const cleaned = cell.replace(/\*$/, '').replace(/,/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const keplerVenusAnchor: ExternalAnchor = {
  id: KEPLER_VENUS_ANCHOR_ID,
  label: "Venus's real orbital period: Genesis's Kepler's-third-law prediction from its semi-major axis vs. NASA's independently measured period",
  payload: nssdcPlanetaryFactSheetHtml,
  sourceUrl: NSSDC_SOURCE_URL,
  sourceVersion: 'NASA NSSDCA Planetary Fact Sheet — Metric (Last Updated: 18 March 2025, D. R. Williams)',
  retrievedAt: NSSDC_RETRIEVED_AT,
  license: 'U.S. Government work (NASA) — public domain',
  // Literal, not computed from the payload — see payloadDigest's own doc
  // comment on ExternalAnchor for why (D-014: a computed digest can never
  // detect drift). Computed once with the repo's own fnv1a/canonicalJson
  // against the real pinned file and hardcoded here.
  payloadDigest: '2296fa16',
  metric: 'orbitalPeriodYears',
  unit: 'years',
  // ±0.5%, the same convention as the molecular anchor: generously covers
  // the source's own rounding (semi-major axis and orbital period both
  // published to ~4 significant figures) and the sidereal/Julian-year
  // convention, but NOT an arithmetic error or a wrong constant. Kepler's
  // third law's T^2 = a^3/M holds for the SEMI-MAJOR AXIS exactly regardless
  // of eccentricity, so Venus's small eccentricity (0.007, same table) is
  // not an additional source of approximation here.
  tolerance: 0.005,
  toleranceRationale:
    "±0.5% covers the NASA fact sheet's own rounding (semi-major axis and orbital period both published to ~4 significant figures) and the sidereal/Julian-year unit convention; it does not cover an arithmetic error or a wrong physical constant.",
  readObservation: (payload) => {
    const html = payload as string;
    const row = readFactSheetRow(html, 'orbp');
    const days = parseFactSheetNumber(row?.[VENUS_COLUMN_INDEX]);
    return days === null ? null : days / DAYS_PER_JULIAN_YEAR;
  },
  computePrediction: (payload) => {
    // FROM THE SEMI-MAJOR AXIS ("Distance from Sun"), through the EXISTING
    // universe-kepler model (core/modelGraph/orbitalGraph.ts) — the same
    // graph Universe Lab and the Reality Navigator already run, unchanged
    // here. The "Orbital Period" column is read only by readObservation
    // above, never here — otherwise this would compare a value to itself.
    const html = payload as string;
    const row = readFactSheetRow(html, 'dist');
    const millionKm = parseFactSheetNumber(row?.[VENUS_COLUMN_INDEX]);
    if (millionKm === null) return null;
    const orbitalRadiusAu = (millionKm * 1e6) / AU_KM;
    const graph = buildOrbitalModelGraph();
    graph.applyParameterSnapshot({ centralMassSolar: SUN_MASS_SOLAR, orbitalRadiusAu });
    return graph.getValue('orbitalPeriodYears');
  },
  whatThisTests:
    "That Genesis's own Kepler's-third-law model (`universe-kepler`, the SAME graph that drives Universe Lab and the Reality Navigator) correctly predicts a REAL planet's orbital period from its independently measured semi-major axis and the Sun's mass — a genuine test of whether idealized two-body Newtonian orbital mechanics describes an actual astronomical body, not merely Genesis's own internal consistency.",
  whatRemainsUntested:
    "This is ONE real body (Venus) on a near-circular orbit (eccentricity 0.007, same source) around a single dominant mass. It does not test the model under strong perturbation, high eccentricity, or relativistic correction — Mercury's real perihelion precession, for instance, is NOT reproduced by this idealized two-body formula, and this anchor does not claim otherwise. A single SUPPORTED comparison also does not establish the model holds for every orbital regime; every other planet's row already sits in the same pinned payload for a future, separate anchor to test.",
  predictionSourceLabel: "from Venus's semi-major axis via Kepler's third law (universe-kepler), independent of the observed period",
  predictionDerivation: {
    source: 'hypothesis-parameter',
    modelId: 'universe-kepler',
    rationale:
      'Genuinely varies with which real body is tested: a different semi-major axis (a different planet, a different real system) yields a different predicted period through the SAME formula already run by Universe Lab and the Reality Navigator — not an analytic invariant of the model.',
  },
  observationDerivation: {
    source: 'independent-measurement',
    modelId: 'nssdc-planetary-factsheet:orbital-period',
    rationale:
      "NASA's published orbital period is constrained by direct astronomical observation (positional/timing astronomy, refined by modern ephemeris integration), not derived from the semi-major axis via Kepler's third law — a distinct measurement channel from the radar-ranging/spacecraft-tracking distance the prediction above uses.",
  },
};

/** Zadeklarowane kotwice. Każda z prowieniencją i z jawnym „co zostaje nieprzetestowane". */
export const EXTERNAL_ANCHORS: readonly ExternalAnchor[] = [molecularWeightAnchor, keplerVenusAnchor];

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
     * `null` when the anchor declared neither `predictionDerivation` nor
     * `observationDerivation` — every anchor from before this field existed
     * (the molecular weight anchor) keeps getting exactly that, the same
     * additive pattern `InquiryLoopResult.tautologyAssessment` already uses.
     * Otherwise the Tautology Gate's classification of this anchor's
     * prediction/observation pairing, computed ONCE from declared metadata —
     * never from these results' own numbers.
     */
    readonly tautologyAssessment: TautologyAssessment | null;
    /**
     * Belief revision over a single, freshly-initialized hypothesis — "this
     * anchor's underlying model correctly predicts this real observation" —
     * reusing `beliefRevision.ts::createHypothesis`/`updateConfidence`
     * unchanged, exactly as `inquiryLoop.ts` does for its own rounds. Starts
     * at a neutral prior (0.5) rather than persisting across calls: this
     * function stays pure and deterministic (no Science Memory write), so a
     * replay reproduces the identical before/after pair.
     */
    readonly belief: { readonly before: number; readonly after: number; readonly status: Hypothesis['status'] };
    /**
     * A plain, honest proposal for what to check next given THIS verdict —
     * never a score or an invented ranking, the same restraint
     * `inquiryLoop.ts`'s `selectNextProbe` documents. For a SUPPORTED
     * verdict this names a genuinely harder real case already sitting in
     * the same pinned payload (a different, more eccentric or perturbed
     * body); for FALSIFIED or INCONCLUSIVE it names the concrete thing that
     * needs resolving before trusting or extending this result.
     */
    readonly nextQuestion: string;
  }
  | { readonly ok: false; readonly anchorId: string; readonly reason: string };

/**
 * Pełny cykl kotwicy: predykcja Genesis → obserwacja zewnętrzna → werdykt
 * falsyfikacyjny → odcisk umożliwiający replay → klasyfikacja Tautology Gate
 * → rewizja przekonania → propozycja następnego pytania.
 *
 * Nic tu nie jest nową logiką naukową: kryterium jest prerejestrowane w
 * deklaracji kotwicy, porównania dokonuje istniejące
 * `verifyPredictionAgainstRealExperiment`, odcisk liczy istniejące
 * `predictionVerificationFingerprint`, klasyfikację liczy istniejące
 * `tautologyGate.ts`, a rewizję przekonania — istniejące
 * `beliefRevision.ts`. Zero nowego silnika.
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

  // Tautology Gate: computed ONCE from declared metadata only, exactly as
  // `runAutonomousInquiryWithRuns` does for `system.observableDerivation`.
  // `null` when the anchor declares neither field (backward-compatible
  // default for the molecular weight anchor).
  const tautologyAssessment: TautologyAssessment | null =
    anchor.predictionDerivation !== undefined || anchor.observationDerivation !== undefined
      ? assessSingleTautology({
        componentId: anchor.id,
        prediction: anchor.predictionDerivation ?? null,
        observation: anchor.observationDerivation ?? null,
      })
      : null;
  const evidenceCap = tautologyAssessment ? evidenceCeiling(tautologyAssessment.classification) : null;

  // Belief revision: one hypothesis, one round, reusing beliefRevision.ts
  // unchanged. Starts at a neutral prior (0.5) every call rather than
  // persisting, so replay stays deterministic without a Science Memory write.
  const hypothesis = createHypothesis(`${anchor.id}:model-correct`, criterion, 0.5);
  const rawMagnitude =
    verification.observedValue === null
      ? 0
      : evidenceMagnitudeWithinTolerance(verification.observedValue, verification.predictedValue, criterion.tolerance ?? 0);
  const magnitude = evidenceCap !== null ? Math.min(rawMagnitude, evidenceCap) : rawMagnitude;
  const updatedHypothesis = updateConfidence(hypothesis, verification.assessment, magnitude, verification.message, 1);
  const belief = { before: hypothesis.confidence, after: updatedHypothesis.confidence, status: updatedHypothesis.status };

  const nextQuestion =
    verification.assessment === 'SUPPORTED_WITHIN_PROTOCOL'
      ? `This held for ${anchor.id.replace(/-/g, ' ')} — the natural next check is a real body with a more eccentric or perturbed orbit (e.g. Mercury, e=0.206, already in the same pinned payload) to see whether the idealized two-body model still agrees.`
      : verification.assessment === 'FALSIFIED_WITHIN_PROTOCOL'
        ? `The prediction and the independently measured value disagree beyond the preregistered band — investigate why (wrong input parameter, a genuinely non-Keplerian effect, or a stale pinned payload) before trusting this model for any other real system.`
        : `This comparison could not be judged (${verification.message}) — resolve that before drawing any conclusion from it.`;

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
    belief,
    nextQuestion,
  };
}
