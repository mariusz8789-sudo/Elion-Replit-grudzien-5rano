import { ThermodynamicLabEngine, SPECIES } from '@genesis/core/lab/ThermodynamicLabEngine.js';
import { bondPolarity } from '../physics';
import { runTitrationScenario } from '../../labs/experiments/chemistry-titration';
import { runVseprScenario } from '../../labs/experiments/chemistry-vsepr';
import { buildChemistryKineticsGraph, T_ROOM } from '../modelGraph/chemistryKineticsGraph';
import {
  createExperimentSession,
  replayExperimentSession,
  type ExperimentRunResult,
  type ExperimentRunner,
  type ExperimentSession,
  type ReplayVerdict,
  type SessionInputs,
  type SessionOutputValue,
} from '../scientificWorlds/experimentSession';
import { chemistryEducationExperimentById } from './catalog';
import { chemistryElementBySymbol } from './periodicTable';
import { reactionById, titrationReaction } from './reactionKnowledge';
import { buildEducationalTimeline, frameStages } from './liveTimeline';
import {
  EDUCATIONAL_PROCEDURE_LABEL,
  type ChemistryEducationalRun,
  type ChemistryExperimentPlan,
  type ChemistryRunArtifact,
  type ChemistryStage,
} from './contracts';

/**
 * Educational runners. Each one calls the canonical model and nothing else,
 * and returns the canonical ExperimentRunResult so the run is sealed by
 * createExperimentSession and replayed by replayExperimentSession — the same
 * session/replay contract Scientific Worlds already uses. No second replay.
 */

export const CHEMISTRY_WORLD_ID = 'chemistry-live-lab';

const fmt = (value: number, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : value);
const pl = (value: number, digits = 2) => fmt(value, digits).toLocaleString('pl-PL');

type Outputs = Record<string, SessionOutputValue>;
type Middle = { stages: ChemistryStage[]; outputs: Outputs; equation?: string; resultSummary: string; explanation: ChemistryRunArtifact['explanation']; assumptions: string[] };

const TITRATION_VOLUMES_ML = [0, 5, 10, 12.5, 20, 24, 25, 26, 30, 40] as const;

function titration(inputs: SessionInputs): Middle {
  const acid = String(inputs.acid);
  const record = titrationReaction(acid);
  const points = TITRATION_VOLUMES_ML.map((vb) => runTitrationScenario({ acid, vb }));
  const first = points[0];
  const half = points.find((p) => p.vb === 12.5)!;
  const eq = points.find((p) => p.vb === first.veq) ?? points.find((p) => p.vb === 25)!;
  const outputs: Outputs = { acid, acidName: first.acidName, pKa: fmt(first.pKa, 3), veqMl: first.veq, phHalfEquivalence: fmt(half.ph, 3), phEquivalence: fmt(eq.ph, 3) };
  for (const p of points) outputs[`ph_${String(p.vb).replace('.', '_')}mL`] = fmt(p.ph, 3);
  const steps: ChemistryStage[] = points.map((p, i) => ({
    stageId: `titrant-${i}`,
    kind: 'STEP',
    label: `Dodano ${pl(p.vb, 1)} mL NaOH (w modelu)`,
    detail: p.vb === 0
      ? 'Stan początkowy: sam roztwór słabego kwasu.'
      : p.vb === first.veq
        ? 'Punkt równoważnikowy: liczba moli NaOH równa liczbie moli kwasu.'
        : p.vb === 12.5 ? 'Połowa objętości równoważnikowej: [HA] = [A⁻].' : 'Model przelicza bilans ładunku dla nowej objętości.',
    observation: { label: 'pH (obliczone przez model)', value: fmt(p.ph, 2), origin: 'MODEL_COMPUTED' },
    visualParams: { acid, vb: p.vb },
  }));
  return {
    stages: [
      { stageId: 'preparation', kind: 'PREPARATION', label: 'Przygotowanie modelu', detail: `Model: 25 mL roztworu ${first.acidName} o stężeniu 0,1 mol/L w kolbie, 0,1 mol/L NaOH w biurecie. Ka = ${first.ka.toExponential(1)}.`, visualParams: { acid, vb: 0 } },
      ...steps,
      { stageId: 'observation', kind: 'OBSERVATION', label: 'Obserwacja modelowa', detail: `pH skacze z ${pl(points.find((p) => p.vb === 24)!.ph)} (24 mL) do ${pl(points.find((p) => p.vb === 26)!.ph)} (26 mL) — gwałtowny wzrost wokół punktu równoważnikowego.`, observation: { label: 'Skok pH wokół Vₑq', value: `${pl(points.find((p) => p.vb === 24)!.ph)} → ${pl(points.find((p) => p.vb === 26)!.ph)}`, origin: 'MODEL_COMPUTED' }, visualParams: { acid, vb: 26 } },
      { stageId: 'analysis', kind: 'ANALYSIS', label: 'Analiza', detail: `Przy 12,5 mL pH = ${pl(half.ph)} ≈ pKa = ${pl(first.pKa)}. W punkcie równoważnikowym (${pl(first.veq, 1)} mL) pH = ${pl(eq.ph)} > 7.`, observation: { label: 'pH przy połowie zobojętnienia', value: fmt(half.ph, 2), origin: 'MODEL_COMPUTED' }, visualParams: { acid, vb: 12.5 } },
      { stageId: 'result', kind: 'RESULT', label: 'Wynik', detail: `Objętość równoważnikowa ${pl(first.veq, 1)} mL; pKa ${pl(first.pKa)}; pH w punkcie równoważnikowym ${pl(eq.ph)}.`, observation: { label: 'Vₑq', value: first.veq, unit: 'mL', origin: 'MODEL_COMPUTED' }, visualParams: { acid, vb: first.veq } },
    ],
    outputs,
    equation: record?.balancedEquation,
    resultSummary: `Vₑq = ${pl(first.veq, 1)} mL, pH(Vₑq) = ${pl(eq.ph)}, pH(½Vₑq) = ${pl(half.ph)} ≈ pKa ${pl(first.pKa)}`,
    explanation: {
      school: 'Na początku dodawana zasada zobojętnia kwas powoli, bo w kolbie powstaje bufor. Gdy prawie cały kwas przereaguje, każda kropla NaOH mocno zmienia pH — dlatego krzywa ma „skok”. W punkcie końcowym roztwór jest lekko zasadowy, bo powstała sól słabego kwasu.',
      university: 'pH liczone z pełnego bilansu ładunku [Na⁺] + [H⁺] = [A⁻] + [OH⁻] z Kw = 10⁻¹⁴ (bisekcja), nie z przybliżenia Hendersona–Hasselbalcha. Przy ½Vₑq [HA] = [A⁻], więc pH = pKa. W Vₑq pH wyznacza hydroliza A⁻: Kb = Kw/Ka.',
    },
    assumptions: ['Ca = Cb = 0,1 mol/L, Va = 25 mL', 'Ka tablicowe (CRC), 25 °C', 'Aktywności = stężenia'],
  };
}

function vsepr(inputs: SessionInputs): Middle {
  const r = runVseprScenario({ shapeId: String(inputs.shapeId) });
  const domains = r.bonding + r.lone;
  return {
    stages: [
      { stageId: 'preparation', kind: 'PREPARATION', label: 'Wybór cząsteczki', detail: `Przykład: ${r.example}. Typ ${r.name}.`, visualParams: { shape: r.shapeId, autoRotate: false } },
      { stageId: 'count', kind: 'STEP', label: 'Liczenie domen elektronowych', detail: `Atom centralny ma ${r.bonding} domen wiążących i ${r.lone} wolnych par — razem ${domains}.`, observation: { label: 'Domeny (wiążące + wolne)', value: `${r.bonding} + ${r.lone}`, origin: 'MODEL_COMPUTED' }, visualParams: { shape: r.shapeId, autoRotate: false } },
      { stageId: 'arrange', kind: 'STEP', label: 'Rozmieszczenie domen', detail: `${domains} domen ustawia się jak najdalej od siebie.`, visualParams: { shape: r.shapeId, autoRotate: true } },
      { stageId: 'angle', kind: 'STEP', label: 'Odczyt kąta', detail: r.angleMeasured ? 'Kąt pochodzi z pomiaru tej cząsteczki (NIST/CCCBDB).' : 'Kąt to idealizacja geometrii rodzica, nie pomiar konkretnej cząsteczki.', observation: { label: 'Kąt między wiązaniami', value: r.angleLabel, origin: r.angleMeasured ? 'CANONICAL_DATASET' : 'MODEL_COMPUTED' }, visualParams: { shape: r.shapeId, autoRotate: true } },
      { stageId: 'observation', kind: 'OBSERVATION', label: 'Obserwacja modelowa', detail: r.lone > 0 ? 'Wolne pary „zajmują” pozycje, ale nie liczą się do kształtu cząsteczki — kształt wyznaczają same atomy.' : 'Bez wolnych par kształt cząsteczki jest taki sam jak geometria domen.', visualParams: { shape: r.shapeId, autoRotate: true } },
      { stageId: 'analysis', kind: 'ANALYSIS', label: 'Analiza', detail: `AX${r.bonding}E${r.lone} → ${r.name}.`, visualParams: { shape: r.shapeId, autoRotate: true } },
      { stageId: 'result', kind: 'RESULT', label: 'Wynik', detail: `${r.example}: ${r.name}, kąt ${r.angleLabel}.`, observation: { label: 'Geometria', value: r.name, origin: 'MODEL_COMPUTED' }, visualParams: { shape: r.shapeId, autoRotate: true } },
    ],
    outputs: { shapeId: r.shapeId, name: r.name, example: r.example, bonding: r.bonding, lone: r.lone, angleLabel: r.angleLabel, angleMeasured: r.angleMeasured },
    equation: `AX${r.bonding}E${r.lone}`,
    resultSummary: `${r.example}: ${r.name} (${r.angleLabel})`,
    explanation: {
      school: 'Pary elektronów wokół atomu centralnego odpychają się jak balony związane razem — ustawiają się jak najdalej od siebie. To wyznacza kształt cząsteczki.',
      university: 'VSEPR minimalizuje odpychanie domen; wolne pary odpychają silniej niż pary wiążące (LP–LP > LP–BP > BP–BP), co zmniejsza kąty wiązań. Model nie liczy funkcji falowej ani energii.',
    },
    assumptions: ['Geometria domen VSEPR', 'Zmierzone kąty tylko dla NH₃ i H₂O'],
  };
}

function polarity(inputs: SessionInputs): Middle {
  const a = chemistryElementBySymbol(String(inputs.elementA))!;
  const b = chemistryElementBySymbol(String(inputs.elementB))!;
  const chiA = a.paulingElectronegativity!;
  const chiB = b.paulingElectronegativity!;
  const bond = bondPolarity(chiA, chiB);
  const typeLabel = bond.type === 'ionic' ? 'jonowe' : bond.type === 'covalent-polar' ? 'kowalencyjne spolaryzowane' : 'kowalencyjne niespolaryzowane';
  const more = chiA >= chiB ? a : b;
  const visualParams = { elementA: a.symbol, elementB: b.symbol };
  return {
    stages: [
      { stageId: 'preparation', kind: 'PREPARATION', label: 'Wybór atomów', detail: `${a.name} (${a.symbol}) i ${b.name} (${b.symbol}).`, visualParams },
      { stageId: 'chi-a', kind: 'STEP', label: `Elektroujemność ${a.symbol}`, detail: 'Wartość z tablicy Paulinga (CRC).', observation: { label: `χ(${a.symbol})`, value: chiA, origin: 'CANONICAL_DATASET' }, visualParams },
      { stageId: 'chi-b', kind: 'STEP', label: `Elektroujemność ${b.symbol}`, detail: 'Wartość z tablicy Paulinga (CRC).', observation: { label: `χ(${b.symbol})`, value: chiB, origin: 'CANONICAL_DATASET' }, visualParams },
      { stageId: 'delta', kind: 'STEP', label: 'Różnica elektroujemności', detail: `Δχ = |${pl(chiA)} − ${pl(chiB)}|.`, observation: { label: 'Δχ', value: fmt(bond.deltaChi, 2), origin: 'MODEL_COMPUTED' }, visualParams },
      { stageId: 'observation', kind: 'OBSERVATION', label: 'Obserwacja modelowa', detail: bond.deltaChi === 0 ? 'Para elektronowa jest dzielona po równo.' : `Chmura elektronowa przesuwa się w stronę ${more.name} (${more.symbol}).`, visualParams },
      { stageId: 'analysis', kind: 'ANALYSIS', label: 'Klasyfikacja dydaktyczna', detail: `Δχ = ${pl(bond.deltaChi)} → wiązanie ${typeLabel} (progi 0,4 / 1,7).`, observation: { label: 'Charakter jonowy (Hanney–Smith)', value: Math.round(bond.skewFraction * 100), unit: '%', origin: 'MODEL_COMPUTED' }, visualParams },
      { stageId: 'result', kind: 'RESULT', label: 'Wynik', detail: `${a.symbol}–${b.symbol}: wiązanie ${typeLabel}.`, observation: { label: 'Typ wiązania', value: typeLabel, origin: 'MODEL_COMPUTED' }, visualParams },
    ],
    outputs: { elementA: a.symbol, elementB: b.symbol, chiA, chiB, deltaChi: fmt(bond.deltaChi, 3), bondType: bond.type, ionicPercent: Math.round(bond.skewFraction * 100) },
    equation: `Δχ = |χ(${a.symbol}) − χ(${b.symbol})| = ${pl(bond.deltaChi)}`,
    resultSummary: `${a.symbol}–${b.symbol}: Δχ = ${pl(bond.deltaChi)}, ${typeLabel}`,
    explanation: {
      school: 'Atom bardziej elektroujemny mocniej przyciąga wspólne elektrony. Im większa różnica, tym bardziej wiązanie przypomina przekazanie elektronu — aż do wiązania jonowego.',
      university: 'Klasyfikacja przez Δχ (Pauling) jest konwencją; charakter jonowy z Hanney–Smith f ≈ 1 − exp(−Δχ²/4) jest przybliżeniem, a rzeczywiste wiązania tworzą continuum.',
    },
    assumptions: ['Skala Paulinga (CRC)', 'Progi 0,4 / 1,7 — konwencja dydaktyczna'],
  };
}

function elementStructure(inputs: SessionInputs): Middle {
  const e = chemistryElementBySymbol(String(inputs.symbol))!;
  const place = e.group !== null ? `okres ${e.period}, grupa ${e.group}` : `okres ${e.period}, blok f (${e.block === 'LANTHANIDE' ? 'lantanowce' : 'aktynowce'})`;
  const shells = e.shells.join(', ');
  const stages: ChemistryStage[] = [
    { stageId: 'preparation', kind: 'PREPARATION', label: 'Wybór pierwiastka', detail: `${e.name} (${e.symbol}).` },
    { stageId: 'locate', kind: 'STEP', label: 'Położenie w układzie okresowym', detail: place, observation: { label: 'Położenie', value: place, origin: 'CANONICAL_DATASET' } },
    { stageId: 'protons', kind: 'STEP', label: 'Liczba atomowa', detail: `Z = ${e.atomicNumber}: tyle protonów w jądrze i tyle elektronów w atomie obojętnym.`, observation: { label: 'Z', value: e.atomicNumber, origin: 'CANONICAL_DATASET' } },
    { stageId: 'shells', kind: 'STEP', label: 'Powłoki elektronowe (Aufbau)', detail: `Elektrony na kolejnych powłokach: ${shells}.`, observation: { label: 'Powłoki', value: shells, origin: 'MODEL_COMPUTED' } },
    { stageId: 'mass', kind: 'STEP', label: 'Masa atomowa', detail: 'Standardowa masa atomowa (zaokrąglona).', observation: { label: 'Masa atomowa', value: e.atomicMass, unit: 'u', origin: 'CANONICAL_DATASET' } },
    {
      stageId: 'observation', kind: 'OBSERVATION', label: 'Właściwości z danych Genesis',
      detail: [
        e.paulingElectronegativity !== null ? `χ Paulinga = ${pl(e.paulingElectronegativity)}` : 'brak ustalonej elektroujemności Paulinga',
        e.firstIonizationKJ !== null ? `I energia jonizacji = ${e.firstIonizationKJ} kJ/mol` : 'energia jonizacji: brak w danych Genesis (tylko Z ≤ 36)',
      ].join('; ') + '.',
    },
    { stageId: 'analysis', kind: 'ANALYSIS', label: 'Analiza', detail: `${e.shells.length} powłok → okres ${e.period}${e.group !== null ? `; ${e.shells[e.shells.length - 1]} elektronów na ostatniej powłoce w modelu Aufbau` : ''}.` },
    { stageId: 'result', kind: 'RESULT', label: 'Wynik', detail: `${e.name}: Z = ${e.atomicNumber}, ${place}, powłoki ${shells}.`, observation: { label: 'Symbol', value: e.symbol, origin: 'CANONICAL_DATASET' } },
  ];
  return {
    stages,
    outputs: {
      symbol: e.symbol, atomicNumber: e.atomicNumber, atomicMass: e.atomicMass, period: e.period, group: e.group ?? 'f-block', shells,
      electronegativity: e.paulingElectronegativity ?? 'no-data', firstIonizationKJ: e.firstIonizationKJ ?? 'no-data',
    },
    resultSummary: `${e.symbol} (Z = ${e.atomicNumber}): ${place}`,
    explanation: {
      school: `${e.name} ma ${e.atomicNumber} protonów. Elektrony krążą w ${e.shells.length} powłokach, dlatego pierwiastek leży w okresie ${e.period}.`,
      university: 'Rozkład na powłoki wynika z kolejności Aufbau (Madelunga) i jest uproszczeniem: dla części metali przejściowych rzeczywista konfiguracja stanu podstawowego odbiega (np. Cr 3d⁵4s¹, Cu 3d¹⁰4s¹).',
    },
    assumptions: ['Model powłokowy Aufbau (uproszczenie)', 'Dane: data/elements.ts, electronegativity.ts, periodicTrends.ts'],
  };
}

function thermochemistry(inputs: SessionInputs): Middle {
  const record = reactionById(String(inputs.reactionId))!;
  const engine = new ThermodynamicLabEngine(0);
  const t = engine.thermo(record.canonicalRef, 298.15);
  const participants = Object.entries(record.stoichiometry).filter(([, nu]) => nu !== 0);
  return {
    stages: [
      { stageId: 'preparation', kind: 'PREPARATION', label: 'Równanie reakcji', detail: record.balancedEquation },
      ...participants.map(([id, nu], i): ChemistryStage => ({
        stageId: `species-${i}`,
        kind: 'STEP',
        label: `${SPECIES[id].formula}: ΔfH° i S°`,
        detail: `${nu < 0 ? 'substrat' : 'produkt'}, współczynnik ${Math.abs(nu)}`,
        observation: { label: `ΔfH°(${SPECIES[id].formula})`, value: SPECIES[id].dHf, unit: 'kJ/mol', origin: 'CANONICAL_DATASET' },
      })),
      { stageId: 'enthalpy', kind: 'STEP', label: 'Entalpia reakcji', detail: 'ΔH° = Σν·ΔfH°(produkty) − Σν·ΔfH°(substraty).', observation: { label: 'ΔH°', value: t.dH, unit: 'kJ/mol', origin: 'MODEL_COMPUTED' } },
      { stageId: 'entropy', kind: 'STEP', label: 'Entropia reakcji', detail: 'ΔS° z tablicowych entropii standardowych.', observation: { label: 'ΔS°', value: t.dS, unit: 'kJ/(mol·K)', origin: 'MODEL_COMPUTED' } },
      { stageId: 'observation', kind: 'OBSERVATION', label: 'Obserwacja modelowa', detail: t.exothermic ? 'ΔH° < 0 — reakcja egzotermiczna: w modelu energia jest oddawana do otoczenia.' : 'ΔH° > 0 — reakcja endotermiczna: w modelu wymaga dostarczenia energii.' },
      { stageId: 'analysis', kind: 'ANALYSIS', label: 'Energia swobodna', detail: `ΔG° = ΔH° − T·ΔS° = ${pl(t.dH, 1)} − 298,15·(${pl(t.dS, 4)}) = ${pl(t.dG, 1)} kJ/mol.`, observation: { label: 'ΔG° (298,15 K)', value: t.dG, unit: 'kJ/mol', origin: 'MODEL_COMPUTED' } },
      { stageId: 'result', kind: 'RESULT', label: 'Wynik', detail: `${t.exothermic ? 'Egzotermiczna' : 'Endotermiczna'}, ${t.spontaneous ? 'samorzutna' : 'niesamorzutna'} w warunkach standardowych.` },
    ],
    outputs: { reactionId: record.reactionId, dH: t.dH, dS: t.dS, dG: t.dG, exothermic: t.exothermic, spontaneous: t.spontaneous },
    equation: record.balancedEquation,
    resultSummary: `ΔH° = ${pl(t.dH, 1)} kJ/mol, ΔG° = ${pl(t.dG, 1)} kJ/mol`,
    explanation: {
      school: t.exothermic ? 'Ta reakcja w modelu oddaje ciepło (jest egzotermiczna).' : 'Ta reakcja w modelu pochłania ciepło (jest endotermiczna).',
      university: 'ΔH° i ΔS° z prawa Hessa na tablicowych ΔfH° i S°; ΔG° = ΔH° − TΔS° rozstrzyga samorzutność w warunkach standardowych, nie szybkość.',
    },
    assumptions: ['Stan standardowy 298,15 K, 1 bar', 'Dane NIST/CRC zaokrąglone'],
  };
}

const MIDDLES: Readonly<Record<string, (inputs: SessionInputs) => Middle>> = {
  'acid-base-titration': titration,
  'vsepr-geometry': vsepr,
  'bond-polarity': polarity,
  'element-structure': elementStructure,
  'reaction-thermochemistry': thermochemistry,
};

/** The canonical runner for every educational experiment. Deterministic: same inputs, same artifact. */
export const chemistryEducationRunner: ExperimentRunner<ChemistryRunArtifact> = (experimentId, _seed, inputs): ExperimentRunResult<ChemistryRunArtifact> => {
  const template = chemistryEducationExperimentById(experimentId);
  const middle = MIDDLES[experimentId];
  if (!template || !middle || template.liveKind !== 'EDUCATIONAL_PROCEDURE_MODEL') throw new Error(`No educational runner for ${experimentId}`);
  const m = middle(inputs);
  const stages = frameStages(template, inputs, m.stages);
  return {
    outputs: m.outputs,
    evidenceHashes: [],
    epistemicStatus: 'MODEL',
    engineLabel: `${EDUCATIONAL_PROCEDURE_LABEL} · ${template.modelBinding.ref}`,
    steps: stages.map((s) => s.stageId),
    artifact: { stages, equation: m.equation, resultSummary: m.resultSummary, explanation: m.explanation, assumptions: m.assumptions },
  };
};

/** Runs a READY educational plan once and seals it. */
export function runEducationalExperiment(plan: ChemistryExperimentPlan): ChemistryEducationalRun {
  if (plan.status !== 'READY' || !plan.template || !plan.params) throw new Error(`Plan is ${plan.status}, not READY`);
  if (plan.template.liveKind !== 'EDUCATIONAL_PROCEDURE_MODEL') throw new Error('Computational experiments run through runComputationalExperiment');
  const { session, artifact } = createExperimentSession(
    { worldId: CHEMISTRY_WORLD_ID, experimentId: plan.template.experimentId, seed: 0, inputs: plan.params, logicalTime: 0 },
    chemistryEducationRunner,
  );
  return {
    liveKind: 'EDUCATIONAL_PROCEDURE_MODEL',
    label: EDUCATIONAL_PROCEDURE_LABEL,
    plan,
    session,
    artifact,
    timeline: buildEducationalTimeline(artifact.stages),
    evidence: { eligible: false, code: 'EDUCATIONAL_MODEL_NOT_EVIDENCE', reason: 'Model procedury edukacyjnej nie jest wynikiem naukowym — nie trafia do Evidence. Dowody powstają wyłącznie z wykonań w Wirtualnym Laboratorium.' },
  };
}

export function replayEducationalRun(run: ChemistryEducationalRun): ReplayVerdict {
  return replayExperimentSession(run.session, chemistryEducationRunner);
}

/* ---------------- computational (Arrhenius) shared runner ---------------- */

export interface ArrheniusPoint { readonly key: 'room' | 'selected' | 'plus10'; readonly temperatureK: number }

export function arrheniusPoints(temperatureK: number): readonly ArrheniusPoint[] {
  return [
    { key: 'room', temperatureK: T_ROOM },
    { key: 'selected', temperatureK },
    { key: 'plus10', temperatureK: temperatureK + 10 },
  ];
}

export const ARRHENIUS_OUTPUT_IDS = ['rateConstant', 'halfLifeFirstOrder', 'speedupVsRoom'] as const;

/**
 * Local re-execution of the exact graph the backend model `chemistry-arrhenius`
 * evaluates (compute/registry.mjs graphModel → buildChemistryKineticsGraph with
 * only temperatureK and activationEnergyKJ set). Used ONLY to replay a sealed
 * backend run, never to produce the live result.
 */
export function evaluateArrheniusLocally(temperatureK: number, activationEnergyKJ: number): Record<(typeof ARRHENIUS_OUTPUT_IDS)[number], number> {
  const graph = buildChemistryKineticsGraph();
  graph.applyParameterSnapshot({ temperatureK, activationEnergyKJ });
  return { rateConstant: graph.getValue('rateConstant'), halfLifeFirstOrder: graph.getValue('halfLifeFirstOrder'), speedupVsRoom: graph.getValue('speedupVsRoom') };
}

export function arrheniusOutputKey(point: ArrheniusPoint['key'], output: string): string {
  return `${point}_${output}`;
}

export const arrheniusReplayRunner: ExperimentRunner<null> = (_experimentId, _seed, inputs) => {
  const ea = Number(inputs.activationEnergyKJ);
  const outputs: Outputs = {};
  for (const point of arrheniusPoints(Number(inputs.temperatureK))) {
    const values = evaluateArrheniusLocally(point.temperatureK, ea);
    for (const id of ARRHENIUS_OUTPUT_IDS) outputs[arrheniusOutputKey(point.key, id)] = values[id];
  }
  return { outputs, evidenceHashes: [], epistemicStatus: 'MODEL', engineLabel: 'core/modelGraph/chemistryKineticsGraph.ts (local re-execution for replay)', steps: ['room', 'selected', 'plus10'], artifact: null };
};

export function sealExperimentSession(experimentId: string, inputs: SessionInputs, outputs: Outputs, engineLabel: string): ExperimentSession {
  return createExperimentSession<null>(
    { worldId: CHEMISTRY_WORLD_ID, experimentId, seed: 0, inputs, logicalTime: 0 },
    () => ({ outputs, evidenceHashes: [], epistemicStatus: 'MODEL', engineLabel, steps: ['room', 'selected', 'plus10'], artifact: null }),
  ).session;
}
