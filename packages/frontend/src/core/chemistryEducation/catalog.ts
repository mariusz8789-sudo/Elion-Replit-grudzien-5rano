import type { ExperimentProtocol } from '../lab/experimentProtocol';
import { TITRATION_ACID_IDS } from '../../labs/experiments/chemistry-titration';
import { VSEPR_SHAPES } from '../../labs/experiments/chemistry-vsepr';
import { CHEMISTRY_PERIODIC_TABLE } from './periodicTable';
import { thermochemistryReactions } from './reactionKnowledge';
import type { ChemistryExperimentId, ChemistryExperimentTemplate, ChemistryLiveKind } from './contracts';

/**
 * ONE governed catalog of chemistry lessons. Each entry binds an existing,
 * tested implementation; nothing here computes chemistry itself.
 *
 * Every protocol uses the canonical ExperimentProtocol type and contains only
 * ANALYZE steps plus STOP, no devices and no actuation, so it passes
 * validateProtocol and can never reach LabSafetyInterlock. There is no physical
 * instrument behind any lesson.
 */

function analysisProtocol(id: string, liveKind: ChemistryLiveKind, phases: readonly string[]): ExperimentProtocol {
  return {
    protocolId: `chemistry-live-lab:${id}`,
    version: '1.0.0',
    inputs: [],
    devices: [],
    steps: [
      ...phases.map((phase) => ({ stepId: phase, type: 'ANALYZE' as const, parameters: { phase } })),
      { stepId: 'stop', type: 'STOP' as const },
    ],
    safetyConstraints: [
      liveKind === 'EDUCATIONAL_PROCEDURE_MODEL' ? 'EDUCATIONAL_PROCEDURE_MODEL_ONLY' : 'COMPUTATIONAL_MODEL_ONLY',
      'NO_PHYSICAL_ACTUATION',
      'NO_INSTRUMENT_TELEMETRY',
    ],
    expectedMeasurements: [],
    stoppingRules: ['STOP_ON_USER_REQUEST', 'STOP_ON_UNSUPPORTED_MODEL'],
  };
}

const ALL_LEVELS = ['SCHOOL', 'UNIVERSITY', 'RESEARCH'] as const;

const ACID_LABELS: Readonly<Record<string, string>> = {
  acetic: 'Kwas octowy CH₃COOH',
  formic: 'Kwas mrówkowy HCOOH',
  benzoic: 'Kwas benzoesowy C₆H₅COOH',
  hcn: 'Cyjanowodór HCN',
};

const ELECTRONEGATIVE_ELEMENTS = CHEMISTRY_PERIODIC_TABLE.filter((e) => e.paulingElectronegativity !== null);

export const CHEMISTRY_EDUCATION_EXPERIMENTS: readonly ChemistryExperimentTemplate[] = [
  {
    experimentId: 'acid-base-titration',
    title: 'Miareczkowanie słabego kwasu zasadą sodową',
    question: 'Jak zmienia się pH roztworu słabego kwasu, gdy dodajemy NaOH, i gdzie leży punkt równoważnikowy?',
    levels: ALL_LEVELS,
    liveKind: 'EDUCATIONAL_PROCEDURE_MODEL',
    modelBinding: {
      kind: 'LOCAL_CANONICAL_RUNNER',
      ref: 'labs/experiments/chemistry-titration.ts: runTitrationScenario → core/physics.ts: titrationPH, equivalenceVolumeMl',
      backendModelId: 'chemistry-titration',
      version: '1.1.0',
    },
    defaultSafetyClass: 'CLASSROOM_SAFE_MODEL',
    parameters: [
      {
        key: 'acid', label: 'Kwas', type: 'select', default: 'acetic',
        options: TITRATION_ACID_IDS.map((id) => ({ value: id, label: ACID_LABELS[id] ?? id })),
      },
    ],
    expectedObservations: [
      'Na początku pH rośnie powoli — powstaje bufor (kwas + jego sól).',
      'Przy połowie objętości równoważnikowej pH ≈ pKa.',
      'W pobliżu punktu równoważnikowego pH rośnie gwałtownie; w punkcie równoważnikowym pH > 7 (sól słabego kwasu).',
    ],
    equation: 'HA(aq) + OH⁻(aq) → A⁻(aq) + H₂O(l)',
    sources: ['CRC Handbook of Chemistry and Physics (Ka)', 'labs/experiments/chemistry-titration.ts'],
    limitations: [
      'Ustalony scenariusz: Ca = Cb = 0,1 mol/L, Va = 25 mL, cztery tablicowe Ka.',
      'Brak aktywności jonowych, CO₂ z powietrza, zmiennej temperatury i niepewności pomiarowej.',
      'To model procedury edukacyjnej: żaden odczynnik nie został fizycznie zmieszany, żaden pH-metr nic nie zmierzył.',
    ],
    quiz: [
      {
        id: 'titration-eq-ph', question: 'Dlaczego w punkcie równoważnikowym miareczkowania słabego kwasu NaOH pH jest większe od 7?',
        options: ['Bo NaOH jest w nadmiarze', 'Bo powstała sól słabego kwasu, której anion jest zasadą', 'Bo woda ma pH 7', 'Bo kwas nie przereagował'],
        correctIndex: 1,
        explanation: 'W punkcie równoważnikowym kwas jest w całości zobojętniony, a anion A⁻ reaguje z wodą (hydroliza), dając OH⁻.',
      },
      {
        id: 'titration-half', question: 'Ile wynosi pH przy połowie objętości równoważnikowej?',
        options: ['7', 'pKa kwasu', '14 − pKa', '1'],
        correctIndex: 1,
        explanation: 'Przy połowie zobojętnienia [HA] = [A⁻], więc z równania Hendersona–Hasselbalcha pH = pKa.',
      },
    ],
    protocol: analysisProtocol('acid-base-titration', 'EDUCATIONAL_PROCEDURE_MODEL', ['baseline', 'titrant-additions', 'equivalence-analysis']),
    visual: { labId: 'chemistry', experimentId: 'titration' },
  },
  {
    experimentId: 'vsepr-geometry',
    title: 'Geometria cząsteczki w modelu VSEPR',
    question: 'Jak liczba par wiążących i wolnych par elektronowych wokół atomu centralnego wyznacza kształt cząsteczki?',
    levels: ALL_LEVELS,
    liveKind: 'EDUCATIONAL_PROCEDURE_MODEL',
    modelBinding: {
      kind: 'LOCAL_CANONICAL_RUNNER',
      ref: 'labs/experiments/chemistry-vsepr.ts: runVseprScenario (VSEPR_SHAPES)',
      backendModelId: 'chem-vsepr',
      version: '1.1.0',
    },
    defaultSafetyClass: 'CLASSROOM_SAFE_MODEL',
    parameters: [
      {
        key: 'shapeId', label: 'Typ AXₙEₘ', type: 'select', default: 'ax4',
        options: VSEPR_SHAPES.map((s) => ({ value: s.id, label: `${s.name} — ${s.example}` })),
      },
    ],
    expectedObservations: [
      'Domeny elektronowe odpychają się i ustawiają jak najdalej od siebie.',
      'Wolne pary zajmują więcej miejsca niż pary wiążące i zmniejszają kąty między wiązaniami.',
    ],
    equation: 'AXₙEₘ: n domen wiążących + m wolnych par wokół atomu centralnego A',
    sources: ['labs/experiments/chemistry-vsepr.ts (13 geometrii; zmierzone kąty dla NH₃ i H₂O)'],
    limitations: [
      'VSEPR to model jakościowy: nie liczy struktury elektronowej, energii wiązań ani widm.',
      'Poza NH₃ i H₂O kąty dla geometrii z wolnymi parami są idealizacją, nie pomiarem konkretnej cząsteczki.',
    ],
    quiz: [
      {
        id: 'vsepr-water', question: 'Dlaczego cząsteczka wody jest kątowa, a nie liniowa?',
        options: ['Bo tlen jest ciężki', 'Bo dwie wolne pary na tlenie odpychają pary wiążące', 'Bo wodór jest mały', 'Bo woda jest cieczą'],
        correctIndex: 1,
        explanation: 'Tlen ma 4 domeny (2 wiążące + 2 wolne pary) — geometria domen jest tetraedryczna, a kształt cząsteczki kątowy.',
      },
    ],
    protocol: analysisProtocol('vsepr-geometry', 'EDUCATIONAL_PROCEDURE_MODEL', ['count-domains', 'arrange-domains', 'read-angle']),
    visual: { labId: 'chemistry', experimentId: 'chemistry-vsepr' },
  },
  {
    experimentId: 'bond-polarity',
    title: 'Polarność wiązania i elektroujemność',
    question: 'Jak różnica elektroujemności dwóch atomów decyduje o charakterze wiązania?',
    levels: ALL_LEVELS,
    liveKind: 'EDUCATIONAL_PROCEDURE_MODEL',
    modelBinding: {
      kind: 'LOCAL_CANONICAL_RUNNER',
      ref: 'core/physics.ts: bondPolarity + data/electronegativity.ts: PAULING_ELECTRONEGATIVITY',
      version: 'frontend physics',
    },
    defaultSafetyClass: 'CLASSROOM_SAFE_MODEL',
    parameters: [
      { key: 'elementA', label: 'Atom A', type: 'element', default: 'Na', options: ELECTRONEGATIVE_ELEMENTS.map((e) => ({ value: e.symbol, label: `${e.symbol} — ${e.name}` })) },
      { key: 'elementB', label: 'Atom B', type: 'element', default: 'Cl', options: ELECTRONEGATIVE_ELEMENTS.map((e) => ({ value: e.symbol, label: `${e.symbol} — ${e.name}` })) },
    ],
    expectedObservations: [
      'Δχ < 0,4 — wiązanie kowalencyjne niespolaryzowane; 0,4–1,7 — spolaryzowane; > 1,7 — jonowe (konwencja dydaktyczna).',
      'Chmura elektronowa przesuwa się w stronę atomu bardziej elektroujemnego.',
    ],
    equation: 'Δχ = |χA − χB|; charakter jonowy ≈ 1 − exp(−Δχ²/4) (Hanney–Smith)',
    sources: ['CRC Handbook of Chemistry and Physics (skala Paulinga)', 'core/physics.ts: bondPolarity'],
    limitations: [
      'Progi 0,4 / 1,7 to konwencja dydaktyczna, nie ostra granica fizyczna.',
      'Gazy szlachetne i większość pierwiastków superciężkich nie mają ustalonej wartości χ — dla nich model nie działa.',
    ],
    quiz: [
      {
        id: 'polarity-nacl', question: 'Jaki charakter ma wiązanie Na–Cl według różnicy elektroujemności?',
        options: ['Kowalencyjne niespolaryzowane', 'Kowalencyjne spolaryzowane', 'Jonowe', 'Metaliczne'],
        correctIndex: 2,
        explanation: 'Δχ = 3,16 − 0,93 = 2,23 > 1,7, więc według konwencji dydaktycznej wiązanie jest jonowe.',
      },
    ],
    protocol: analysisProtocol('bond-polarity', 'EDUCATIONAL_PROCEDURE_MODEL', ['read-electronegativity', 'difference', 'classify']),
    visual: { labId: 'chemistry', experimentId: 'bond-polarity-2d' },
  },
  {
    experimentId: 'element-structure',
    title: 'Pierwiastek w układzie okresowym i budowa atomu',
    question: 'Gdzie leży ten pierwiastek w układzie okresowym i jak rozmieszczone są jego elektrony?',
    levels: ALL_LEVELS,
    liveKind: 'EDUCATIONAL_PROCEDURE_MODEL',
    modelBinding: {
      kind: 'CANONICAL_DATASET',
      ref: 'data/elements.ts: ELEMENTS (118) + data/electronegativity.ts + data/periodicTrends.ts',
      version: 'frontend data',
    },
    defaultSafetyClass: 'CLASSROOM_SAFE_MODEL',
    parameters: [
      { key: 'symbol', label: 'Pierwiastek', type: 'element', default: 'Fe', options: CHEMISTRY_PERIODIC_TABLE.map((e) => ({ value: e.symbol, label: `${e.atomicNumber} ${e.symbol} — ${e.name}` })) },
    ],
    expectedObservations: [
      'Numer okresu = liczba powłok elektronowych w modelu powłokowym.',
      'Liczba atomowa Z = liczba protonów = liczba elektronów w atomie obojętnym.',
    ],
    sources: ['data/elements.ts (IUPAC, masy zaokrąglone)', 'data/electronegativity.ts (CRC)', 'data/periodicTrends.ts (CRC/NIST, Z ≤ 36)'],
    limitations: [
      'Powłoki liczone regułą Aufbau — uproszczenie: rzeczywiste konfiguracje mają wyjątki (np. Cr, Cu).',
      'Promień i energia jonizacji tylko dla Z ≤ 36; elektroujemność tylko tam, gdzie istnieje wartość Paulinga.',
    ],
    quiz: [
      {
        id: 'element-period', question: 'Co w modelu powłokowym oznacza numer okresu pierwiastka?',
        options: ['Liczbę neutronów', 'Liczbę powłok elektronowych', 'Masę atomową', 'Wartościowość'],
        correctIndex: 1,
        explanation: 'Elektrony walencyjne pierwiastka z okresu n zajmują powłokę n.',
      },
    ],
    protocol: analysisProtocol('element-structure', 'EDUCATIONAL_PROCEDURE_MODEL', ['locate', 'shells', 'properties']),
  },
  {
    experimentId: 'reaction-thermochemistry',
    title: 'Energia reakcji: ΔH, ΔS i ΔG',
    question: 'Czy ta reakcja wydziela ciepło i czy jest samorzutna w warunkach standardowych?',
    levels: ALL_LEVELS,
    liveKind: 'EDUCATIONAL_PROCEDURE_MODEL',
    modelBinding: {
      kind: 'LOCAL_CANONICAL_RUNNER',
      ref: '@genesis/core/lab/ThermodynamicLabEngine.ts: ThermodynamicLabEngine.thermo',
      version: 'packages/core lab engine',
    },
    defaultSafetyClass: 'TEACHER_REVIEW',
    parameters: [
      {
        key: 'reactionId', label: 'Reakcja', type: 'select', default: 'thermo:R-HCL-NAOH',
        options: thermochemistryReactions().map((r) => ({ value: r.reactionId, label: `${r.title}: ${r.balancedEquation}` })),
      },
    ],
    expectedObservations: [
      'ΔH < 0 — reakcja egzotermiczna (wydziela ciepło).',
      'ΔG < 0 — reakcja samorzutna w warunkach standardowych (co nie mówi nic o jej szybkości).',
    ],
    equation: 'ΔG° = ΔH° − T·ΔS°;  ΔH° = Σν·ΔfH°(produkty) − Σν·ΔfH°(substraty)',
    sources: ['NIST Chemistry WebBook / CRC Handbook (zaokrąglone w ThermodynamicLabEngine SPECIES)'],
    limitations: [
      'Termodynamika nie mówi, jak szybko reakcja zachodzi.',
      'Dane standardowe (298,15 K, 1 bar); brak poprawek na stężenie i aktywność.',
      'To obliczenie modelowe — nie instrukcja wykonania reakcji.',
    ],
    quiz: [
      {
        id: 'thermo-sign', question: 'Co oznacza ujemne ΔG° reakcji?',
        options: ['Reakcja jest szybka', 'Reakcja jest samorzutna w warunkach standardowych', 'Reakcja pochłania ciepło', 'Reakcja nie zachodzi'],
        correctIndex: 1,
        explanation: 'ΔG° < 0 oznacza, że reakcja jest termodynamicznie korzystna; jej szybkość opisuje kinetyka.',
      },
    ],
    protocol: analysisProtocol('reaction-thermochemistry', 'EDUCATIONAL_PROCEDURE_MODEL', ['equation', 'enthalpy', 'entropy', 'gibbs']),
  },
  {
    experimentId: 'arrhenius-kinetics',
    title: 'Wpływ temperatury na szybkość reakcji (Arrhenius)',
    question: 'O ile szybciej zachodzi reakcja, gdy podniesiemy temperaturę?',
    levels: ALL_LEVELS,
    liveKind: 'COMPUTATIONAL_LIVE',
    modelBinding: {
      kind: 'BACKEND_FABRIC_MODEL',
      ref: 'backend compute/registry.mjs "chemistry-arrhenius" → core/modelGraph/chemistryKineticsGraph.ts: buildChemistryKineticsGraph',
      backendModelId: 'chemistry-arrhenius',
      version: '1.0.0',
    },
    defaultSafetyClass: 'CLASSROOM_SAFE_MODEL',
    parameters: [
      { key: 'temperatureK', label: 'Temperatura', type: 'number', min: 200, max: 990, step: 5, unit: 'K', default: 308 },
      { key: 'activationEnergyKJ', label: 'Energia aktywacji Eₐ', type: 'number', min: 0, max: 300, step: 5, unit: 'kJ/mol', default: 50 },
    ],
    expectedObservations: [
      'Wyższa temperatura → większa stała szybkości k.',
      'Im większa energia aktywacji, tym silniej szybkość zależy od temperatury.',
    ],
    equation: 'k = A·exp(−Eₐ/RT);  k(T)/k(298,15 K) = exp(Eₐ/R·(1/298,15 − 1/T))',
    sources: ['core/modelGraph/chemistryKineticsGraph.ts', 'backend model chemistry-arrhenius 1.0.0'],
    limitations: [
      'Model Arrheniusa zakłada A i Eₐ niezależne od temperatury i nie opisuje mechanizmu wieloetapowego.',
      't½ = ln2/k obowiązuje tylko dla reakcji I rzędu.',
      'Czynnik A jest ustalony (log₁₀A = 11) — bezwzględne k to rząd wielkości; przyspieszenie względem 298 K od A nie zależy.',
    ],
    quiz: [
      {
        id: 'arrhenius-ea', question: 'Która reakcja przyspieszy bardziej po podgrzaniu o 10 K?',
        options: ['Ta z mniejszą energią aktywacji', 'Ta z większą energią aktywacji', 'Obie tak samo', 'Żadna'],
        correctIndex: 1,
        explanation: 'Przyspieszenie exp(Eₐ/R·(1/T₁ − 1/T₂)) rośnie z Eₐ.',
      },
    ],
    protocol: analysisProtocol('arrhenius-kinetics', 'COMPUTATIONAL_LIVE', ['room-temperature', 'selected-temperature', 'plus-ten-kelvin']),
  },
];

export function chemistryEducationExperimentById(id: string): ChemistryExperimentTemplate | null {
  return CHEMISTRY_EDUCATION_EXPERIMENTS.find((experiment) => experiment.experimentId === id) ?? null;
}

export const CHEMISTRY_EXPERIMENT_IDS: readonly ChemistryExperimentId[] = CHEMISTRY_EDUCATION_EXPERIMENTS.map((e) => e.experimentId);
