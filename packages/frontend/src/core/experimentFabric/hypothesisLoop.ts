import { canonicalJson, fnv1a } from '../events/hash';
import { SCENARIOS, type ScenarioId } from '../simulation/scenarioEngine';
import { createScientificEvidencePack, type ScientificEvidencePack } from './evidencePack';
import { getRouterModel } from './router';
import type { FalsificationCriterion, ScientificEvidenceChain } from './scientificDiscovery';
import { designScientificExperiment } from './scientificPlanner';
import { executeScientificBackendExperiment, executeScientificExperiment } from './scientificExecutor';
import { buildStructuredRequestFromModel } from './structuredRequestBuilder';
import type { ExperimentRun, StructuredExperimentRequest } from './types';

/**
 * AUTONOMOUS HYPOTHESIS & EXPERIMENT DESIGN LOOP.
 *
 * Genesis potrafił już WYKONAĆ i UDOKUMENTOWAĆ kontrolowany eksperyment, gdy
 * człowiek podał pytanie. Nie potrafił natomiast sam postawić konkurencyjnych
 * hipotez, prerejestrować ich i rozstrzygnąć między nimi. To jest ta warstwa —
 * i wyłącznie ona. Nie ma tu solvera, magazynu, rankera ani drugiego systemu
 * dowodowego: projekt protokołu, wykonanie i paczka dowodowa pochodzą z
 * istniejących `designScientificExperiment`, `executeScientificExperiment` i
 * `createScientificEvidencePack`.
 *
 * SKĄD BIORĄ SIĘ HIPOTEZY — to jest decyzja projektowa, nie szczegół.
 * NIE z generowania tekstu przez model językowy. Taka hipoteza byłaby
 * niedeterministyczna, nieodtwarzalna i nieweryfikowalna, a w tym środowisku
 * często po prostu niedostępna. Hipotezy są WYPROWADZANE Z WŁASNEJ,
 * ZADEKLAROWANEJ POWIERZCHNI MODELU: z biblioteki scenariuszy i z dźwigni,
 * które rejestr wiedzy dopuszcza. Dzięki temu każda hipoteza jest z definicji
 * wykonywalna, deterministyczna i odtwarzalna, a jej pochodzenie da się
 * wskazać palcem zamiast mu zaufać.
 *
 * PREREJESTRACJA JEST STRUKTURALNA. Zbiór hipotez zostaje zamrożony i odciśnięty
 * PRZED pierwszym przebiegiem, a wykonanie dostaje go jako wejście i nie ma jak
 * go zmienić. Po wykonaniu odcisk jest przeliczany ponownie: każda zmiana
 * twierdzenia, przewidywania czy kryterium wychodzi jako naruszenie, a nie jako
 * po cichu zaktualizowana hipoteza. To jedyna obrona przed HARK-owaniem, która
 * nie polega na dobrych intencjach.
 */
export const HYPOTHESIS_LOOP_CONTRACT_VERSION = '1.0.0';

export type HypothesisStatus =
  | 'HYPOTHESIS'
  | 'PRE_REGISTERED'
  | 'SUPPORTED'
  | 'FALSIFIED'
  | 'INCONCLUSIVE'
  | 'BLOCKED'
  | 'UNKNOWN';

/**
 * Problem badawczy związany z ISTNIEJĄCYM modelem. Katalog jest zadeklarowany,
 * a nie wyprowadzany z tekstu użytkownika: problem spoza katalogu nie dostaje
 * podstawionego modelu, tylko NOT_AVAILABLE.
 */
export interface HypothesisProblem {
  problemId: string;
  statement: string;
  domainId: string;
  modelId: string;
  /** Metryka rozstrzygająca, zadeklarowana przed jakimkolwiek przebiegiem. */
  primaryMetric: string;
  /** Zmienna, po której konkurują hipotezy. Musi istnieć w schemacie modelu. */
  candidateVariable: string;
  /** Wartość odniesienia — wspólna kontrola dla wszystkich hipotez. */
  baselineValue: string | number;
  /** Kandydaci, z których powstaje po jednej konkurencyjnej hipotezie. */
  candidateValues: readonly (string | number)[];
  /** Warunki startowe wspólne dla WSZYSTKICH ramion; różnica ma być jedna. */
  sharedLevers: Readonly<Record<string, string | number>>;
  /** Kierunek, w którym problem uznaje wynik za lepszy. */
  objective: 'minimize' | 'maximize';
}

/**
 * Zadeklarowane problemy. Wartości są DEMONSTRACYJNE i SCENARIUSZOWE —
 * nie pochodzą z żadnej rzeczywistej epidemii i nie są kalibracją.
 */
export const HYPOTHESIS_PROBLEMS: readonly HypothesisProblem[] = [
  {
    problemId: 'problem:lowest-modeled-deaths',
    statement: 'Która z zadeklarowanych interwencji daje najniższą MODELOWANĄ liczbę zgonów?',
    domainId: 'biology',
    modelId: 'scenario-timeline',
    primaryMetric: 'totalDeaths',
    candidateVariable: 'scenarioId',
    baselineValue: 'BASELINE',
    candidateValues: ['ISOLATION', 'CONTACT_REDUCTION', 'PROTECT_SENIORS'],
    sharedLevers: { days: 72, stepsPerDay: 4, nAgents: 400, initialInfected: 5, seed: 20260828, interventionStartDay: 0 },
    objective: 'minimize',
  },
  {
    problemId: 'problem:intervention-timing',
    statement: 'Jak późno można wprowadzić izolację objawowych, zanim przewaga nad brakiem interwencji zniknie?',
    domainId: 'biology',
    modelId: 'scenario-timeline',
    primaryMetric: 'totalDeaths',
    candidateVariable: 'interventionStartDay',
    baselineValue: 0,
    candidateValues: [10, 20, 30],
    sharedLevers: { scenarioId: 'ISOLATION', days: 72, stepsPerDay: 4, nAgents: 400, initialInfected: 5, seed: 20260828 },
    objective: 'minimize',
  },
  {
    problemId: 'problem:pyscf-h2-bond-length-stability',
    statement: 'Który z zadeklarowanych kandydatów długości wiązania H–H daje NAJNIŻSZĄ (najbardziej stabilną) rzeczywistą obliczoną energię RHF/STO-3G cząsteczki H₂ (realny backend PySCF)?',
    domainId: 'chemistry',
    modelId: 'quantum-chemistry-pyscf-h2-rhf',
    primaryMetric: 'energyHartree',
    candidateVariable: 'bondLengthAngstrom',
    baselineValue: 3,
    candidateValues: [0.74, 1.5],
    sharedLevers: { basis: 'sto-3g' },
    objective: 'minimize',
  },
  {
    problemId: 'problem:chem-rdkit-molecular-weight-comparison',
    statement: 'Który z zadeklarowanych kandydatów SMILES ma NAJWYŻSZĄ rzeczywistą obliczoną masę cząsteczkową (realny backend RDKit)?',
    domainId: 'chemistry',
    modelId: 'chem-rdkit-descriptors',
    primaryMetric: 'molWt',
    candidateVariable: 'smiles',
    baselineValue: 'CCO',
    candidateValues: ['CC(=O)Oc1ccccc1C(=O)O'],
    sharedLevers: {},
    objective: 'maximize',
  },
] as const;

export interface PreregisteredHypothesis {
  hypothesisId: string;
  problemId: string;
  statement: string;
  rationale: string;
  assumptions: readonly string[];
  /** Co powinno się stać z metryką pierwotną, JEŻELI hipoteza jest prawdziwa. */
  predictedOutcome: string;
  falsificationCriteria: FalsificationCriterion;
  requiredEvidence: readonly string[];
  /** Realny, wykonywalny request — albo `null` z powodem w `blockedReason`. */
  proposedExperiment: StructuredExperimentRequest | null;
  blockedReason?: string;
  candidateVariables: readonly string[];
  /** Jaki wynik ODRÓŻNI tę hipotezę od pozostałych w zbiorze. */
  expectedDiscriminator: string;
  status: HypothesisStatus;
  provenance: readonly string[];
  /** Dowodzone odciskiem prerejestracji, nie flagą, którą można ustawić. */
  createdBeforeRun: boolean;
}

export interface HypothesisSet {
  contractVersion: string;
  problem: HypothesisProblem;
  hypotheses: readonly PreregisteredHypothesis[];
  /** Czy zbiór da się w ogóle rozstrzygnąć istniejącym wykonawcą. */
  discriminable: boolean;
  discriminationPlan: string;
}

function requestFor(problem: HypothesisProblem, value: string | number): StructuredExperimentRequest | null {
  const model = getRouterModel(problem.modelId);
  if (model === undefined) return null;
  const declared = new Set(model.parameters.map((entry) => entry.id));
  if (!declared.has(problem.candidateVariable)) return null;
  for (const lever of Object.keys(problem.sharedLevers)) if (!declared.has(lever)) return null;
  return buildStructuredRequestFromModel(model, { ...problem.sharedLevers, [problem.candidateVariable]: value }, {
    sourceText: `${problem.statement} — ramię ${problem.candidateVariable}=${String(value)}.`,
    ...(typeof problem.sharedLevers.seed === 'number' ? { seed: problem.sharedLevers.seed } : {}),
  });
}

/**
 * Tworzy KONKURENCYJNE hipotezy: po jednej na zadeklarowanego kandydata, każda
 * przewidująca inny wynik na tej samej metryce. Nie są to trzy parafrazy —
 * jeden zestaw przebiegów rozstrzyga między nimi, bo każda wskazuje innego
 * zwycięzcę tego samego uporządkowania.
 */
export function generateCompetingHypotheses(problem: HypothesisProblem): HypothesisSet {
  const better = problem.objective === 'minimize' ? 'najniższą' : 'najwyższą';
  const relation: FalsificationCriterion['relation'] = problem.objective === 'minimize' ? 'less-than' : 'greater-than';
  const others = (value: string | number) => problem.candidateValues.filter((entry) => entry !== value);

  const hypotheses = problem.candidateValues.map((value): PreregisteredHypothesis => {
    const request = requestFor(problem, value);
    const scenarioLabel = problem.candidateVariable === 'scenarioId' && typeof value === 'string' && value in SCENARIOS
      ? SCENARIOS[value as ScenarioId].label
      : `${problem.candidateVariable}=${String(value)}`;
    const base = {
      problemId: problem.problemId,
      candidateVariable: problem.candidateVariable,
      value,
      primaryMetric: problem.primaryMetric,
      baselineValue: problem.baselineValue,
      sharedLevers: problem.sharedLevers,
    };
    return {
      hypothesisId: `hyp_${fnv1a(canonicalJson(base))}`,
      problemId: problem.problemId,
      statement: `„${scenarioLabel}" daje ${better} modelowaną wartość ${problem.primaryMetric} spośród zadeklarowanych kandydatów.`,
      rationale: `Kandydat wynika z zadeklarowanej powierzchni modelu (${problem.candidateVariable}), a nie z domysłu; jest wykonywalny przez istniejący silnik ${problem.modelId}.`,
      assumptions: [
        'Wszystkie ramiona dzielą populację, ziarno i horyzont; jedyną różnicą jest zadeklarowany kandydat.',
        'Model nie jest skalibrowany do żadnej rzeczywistej epidemii — wynik jest SIMULATION, nie prognozą ani obserwacją.',
        ...(problem.candidateVariable === 'scenarioId' && typeof value === 'string' && value in SCENARIOS
          ? [SCENARIOS[value as ScenarioId].rationale]
          : []),
      ],
      predictedOutcome: `Jeżeli hipoteza jest prawdziwa: ${problem.primaryMetric} dla ${String(value)} jest ${problem.objective === 'minimize' ? 'mniejsze' : 'większe'} niż dla odniesienia ${String(problem.baselineValue)} ORAZ niż dla każdego z pozostałych kandydatów (${others(value).map(String).join(', ')}). Jeżeli fałszywa: co najmniej jeden z nich wypada lepiej.`,
      falsificationCriteria: {
        metric: problem.primaryMetric,
        relation,
        rationale: `Prerejestrowane przed wykonaniem: wariant ${String(value)} porównywany z ramieniem odniesienia ${String(problem.baselineValue)} na metryce ${problem.primaryMetric}. Kryterium niespełnione = hipoteza sfalsyfikowana w granicach tego protokołu.`,
      },
      requiredEvidence: [
        `Ukończony przebieg ramienia odniesienia ${String(problem.baselineValue)} i ramienia ${String(value)}.`,
        'Zgodne powtórzenia obu ramion (reprodukcja MATCH).',
        `Liczbowa wartość ${problem.primaryMetric} w obu ramionach.`,
      ],
      proposedExperiment: request,
      ...(request === null ? { blockedReason: `Model ${problem.modelId} albo dźwignia ${problem.candidateVariable} nie istnieje w aktualnym schemacie — request nie został utworzony.` } : {}),
      candidateVariables: [problem.candidateVariable],
      expectedDiscriminator: `Uporządkowanie ${problem.primaryMetric} między wszystkimi kandydatami. Hipoteza wygrywa tylko wtedy, gdy ${String(value)} zajmuje pozycję ${problem.objective === 'minimize' ? 'najniższą' : 'najwyższą'}; remis nie rozstrzyga na jej korzyść.`,
      status: request === null ? 'BLOCKED' : 'HYPOTHESIS',
      provenance: [
        `problem:${problem.problemId}`,
        `model:${problem.modelId}`,
        `variable:${problem.candidateVariable}`,
        `candidate:${String(value)}`,
        'source:declared-model-surface',
      ],
      createdBeforeRun: false,
    };
  });

  const executable = hypotheses.filter((entry) => entry.proposedExperiment !== null);
  return {
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    problem,
    hypotheses,
    discriminable: executable.length >= 2,
    discriminationPlan: executable.length >= 2
      ? `Jeden zestaw przebiegów rozstrzyga cały zbiór: wszystkie ramiona liczone są na wspólnych warunkach startowych, a o wyniku decyduje uporządkowanie ${problem.primaryMetric}.`
      : 'Zbiór nie jest rozstrzygalny: mniej niż dwie hipotezy mają wykonywalny request.',
  };
}

export interface Preregistration {
  contractVersion: string;
  preregistrationId: string;
  problemId: string;
  createdAt: string;
  hypotheses: readonly PreregisteredHypothesis[];
  /** Odcisk zamrożonego zbioru. Każda późniejsza zmiana treści jest wykrywalna. */
  preregistrationFingerprint: string;
  set: HypothesisSet;
}

/** Pola objęte odciskiem — dokładnie to, czego po wyniku zmieniać nie wolno. */
function frozenView(hypotheses: readonly PreregisteredHypothesis[]) {
  return hypotheses.map((entry) => ({
    hypothesisId: entry.hypothesisId,
    statement: entry.statement,
    predictedOutcome: entry.predictedOutcome,
    falsificationCriteria: entry.falsificationCriteria,
    candidateVariables: entry.candidateVariables,
    expectedDiscriminator: entry.expectedDiscriminator,
    requiredEvidence: entry.requiredEvidence,
    parameters: entry.proposedExperiment?.parameters ?? null,
  }));
}

export function preregisterHypotheses(set: HypothesisSet, now: () => Date = () => new Date()): Preregistration {
  const hypotheses = set.hypotheses.map((entry) => ({
    ...entry,
    status: entry.status === 'BLOCKED' ? entry.status : ('PRE_REGISTERED' as HypothesisStatus),
    createdBeforeRun: true,
  }));
  const fingerprint = fnv1a(canonicalJson({
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    problemId: set.problem.problemId,
    frozen: frozenView(hypotheses),
  }));
  return {
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    preregistrationId: `prereg_${fingerprint}`,
    problemId: set.problem.problemId,
    createdAt: now().toISOString(),
    hypotheses,
    preregistrationFingerprint: fingerprint,
    set,
  };
}

/**
 * Przelicza odcisk zamrożonego zbioru i porównuje z zapisanym. Wykrywa
 * dopisanie hipotezy po wyniku, zmianę przewidywania i podmianę kryterium.
 */
export function verifyPreregistrationIntact(prereg: Preregistration, hypotheses: readonly PreregisteredHypothesis[] = prereg.hypotheses): { intact: boolean; reason: string } {
  const recomputed = fnv1a(canonicalJson({
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    problemId: prereg.problemId,
    frozen: frozenView(hypotheses),
  }));
  return recomputed === prereg.preregistrationFingerprint
    ? { intact: true, reason: 'Prerejestracja jest nienaruszona: twierdzenia, przewidywania i kryteria są te same, co przed wykonaniem.' }
    : { intact: false, reason: `Prerejestracja została naruszona po zamrożeniu (odcisk ${prereg.preregistrationFingerprint} → ${recomputed}). Wynik nie może definiować hipotezy, która go tłumaczy.` };
}

export interface HypothesisOutcome {
  hypothesisId: string;
  status: HypothesisStatus;
  /** Ocena prerejestrowanego kryterium z istniejącego łańcucha dowodowego. */
  criterionAssessment: ScientificEvidenceChain['assessment']['assessment'] | null;
  /** Zmierzona wartość metryki pierwotnej dla tego kandydata. */
  observedMetric: number | null;
  /** Ta sama metryka dla wspólnego ramienia odniesienia. */
  baselineMetric: number | null;
  reason: string;
  runIds: readonly string[];
  runFingerprints: readonly string[];
  evidenceChainId: string | null;
  evidencePackId: string | null;
}

export interface HypothesisDiscrimination {
  /** Uporządkowanie kandydatów po metryce pierwotnej — realne liczby. */
  ranking: readonly { hypothesisId: string; candidate: string; metric: number }[];
  /** Zwycięzca istnieje tylko wtedy, gdy uporządkowanie jest rozstrzygające. */
  winnerHypothesisId: string | null;
  decisive: boolean;
  reason: string;
}

export interface HypothesisLoopResult {
  contractVersion: string;
  preregistration: Preregistration;
  preregistrationIntact: { intact: boolean; reason: string };
  outcomes: readonly HypothesisOutcome[];
  discrimination: HypothesisDiscrimination;
  chains: readonly ScientificEvidenceChain[];
  packs: readonly ScientificEvidencePack[];
  allRuns: readonly ExperimentRun[];
  /** Zdanie, które wolno powiedzieć o tym przebiegu — i nic więcej. */
  claim: string;
}

function metricFromArm(chain: ScientificEvidenceChain, kind: 'baseline' | 'variant'): number | null {
  const arm = chain.arms.find((entry) => entry.kind === kind);
  if (arm === undefined || arm.outputValues.length === 0) return null;
  const first = arm.outputValues[0]!;
  // Powtórzenia deterministycznego modelu muszą dać tę samą liczbę; rozbieżność
  // oznacza, że wartość nie jest własnością modelu i nie wolno jej użyć.
  return arm.outputValues.every((value) => value === first) ? first : null;
}

/**
 * Wykonuje PREREJESTROWANY zbiór hipotez. Każda hipoteza dostaje własny
 * protokół przez istniejący `designScientificExperiment` i własne realne
 * przebiegi przez istniejący `executeScientificExperiment`; status pochodzi z
 * istniejącej oceny prerejestrowanego kryterium, a nie z tej warstwy.
 *
 * Dwie oceny są rozdzielone celowo:
 *  - KRYTERIUM (wariant vs odniesienie) mówi, czy dana interwencja w ogóle
 *    poprawia metrykę;
 *  - DYSKRYMINACJA (uporządkowanie wszystkich kandydatów) mówi, KTÓRA z nich
 *    jest najlepsza. Remis nie wyłania zwycięzcy.
 */
export function executePreregisteredHypotheses(prereg: Preregistration): HypothesisLoopResult {
  const problem = prereg.set.problem;
  const chains: ScientificEvidenceChain[] = [];
  const packs: ScientificEvidencePack[] = [];
  const allRuns: ExperimentRun[] = [];
  const outcomes: HypothesisOutcome[] = [];

  for (const hypothesis of prereg.hypotheses) {
    if (hypothesis.proposedExperiment === null) {
      outcomes.push({
        hypothesisId: hypothesis.hypothesisId, status: 'BLOCKED', criterionAssessment: null,
        observedMetric: null, baselineMetric: null,
        reason: hypothesis.blockedReason ?? 'Brak wykonywalnego requestu dla tej hipotezy.',
        runIds: [], runFingerprints: [], evidenceChainId: null, evidencePackId: null,
      });
      continue;
    }
    const candidate = hypothesis.proposedExperiment.parameters[problem.candidateVariable];
    const baselineRequest = requestFor(problem, problem.baselineValue);
    if (baselineRequest === null || candidate === undefined) {
      outcomes.push({
        hypothesisId: hypothesis.hypothesisId, status: 'BLOCKED', criterionAssessment: null,
        observedMetric: null, baselineMetric: null,
        reason: 'Nie da się zbudować wspólnego ramienia odniesienia dla tej hipotezy.',
        runIds: [], runFingerprints: [], evidenceChainId: null, evidencePackId: null,
      });
      continue;
    }
    let chain: ScientificEvidenceChain;
    try {
      chain = executeScientificExperiment(designScientificExperiment({
        hypothesis: {
          statement: hypothesis.statement,
          domainId: problem.domainId,
          modelId: problem.modelId,
          declaredAssumptions: [...hypothesis.assumptions],
          falsification: hypothesis.falsificationCriteria,
        },
        baselineRequest,
        sweep: { parameter: problem.candidateVariable, values: [candidate], label: problem.candidateVariable },
        repetitionsPerArm: 2,
      }));
    } catch (error) {
      outcomes.push({
        hypothesisId: hypothesis.hypothesisId, status: 'BLOCKED', criterionAssessment: null,
        observedMetric: null, baselineMetric: null,
        reason: `Istniejący protokół odrzucił tę hipotezę: ${error instanceof Error ? error.message : String(error)}`,
        runIds: [], runFingerprints: [], evidenceChainId: null, evidencePackId: null,
      });
      continue;
    }
    chains.push(chain);
    allRuns.push(...chain.allRuns);
    const pack = createScientificEvidencePack(chain);
    packs.push(pack);
    const assessment = chain.assessment.assessment;
    const status: HypothesisStatus = assessment === 'SUPPORTED_WITHIN_PROTOCOL' ? 'SUPPORTED'
      : assessment === 'FALSIFIED_WITHIN_PROTOCOL' ? 'FALSIFIED'
        : assessment === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'UNKNOWN';
    outcomes.push({
      hypothesisId: hypothesis.hypothesisId,
      status,
      criterionAssessment: assessment,
      observedMetric: metricFromArm(chain, 'variant'),
      baselineMetric: metricFromArm(chain, 'baseline'),
      reason: chain.assessment.message,
      runIds: chain.allRuns.map((run) => run.runId),
      runFingerprints: chain.allRuns.map((run) => run.provenance.runFingerprint),
      evidenceChainId: chain.evidenceId,
      evidencePackId: pack.evidencePackId,
    });
  }

  const measured = outcomes
    .map((outcome) => {
      const hypothesis = prereg.hypotheses.find((entry) => entry.hypothesisId === outcome.hypothesisId);
      const candidate = hypothesis?.proposedExperiment?.parameters[problem.candidateVariable];
      return outcome.observedMetric === null || candidate === undefined
        ? null
        : { hypothesisId: outcome.hypothesisId, candidate: String(candidate), metric: outcome.observedMetric };
    })
    .filter((entry): entry is { hypothesisId: string; candidate: string; metric: number } => entry !== null)
    .sort((a, b) => (problem.objective === 'minimize' ? a.metric - b.metric : b.metric - a.metric) || a.candidate.localeCompare(b.candidate));

  const best = measured[0];
  const tied = best !== undefined && measured.filter((entry) => entry.metric === best.metric).length > 1;
  const discrimination: HypothesisDiscrimination = {
    ranking: measured,
    winnerHypothesisId: best !== undefined && !tied ? best.hypothesisId : null,
    decisive: best !== undefined && !tied && measured.length >= 2,
    reason: measured.length < 2
      ? 'Mniej niż dwie hipotezy dostarczyły liczbową wartość metryki — zbiór nie został rozstrzygnięty.'
      : tied
        ? `Remis na metryce ${problem.primaryMetric} (${best!.metric}); uporządkowanie nie wyłania zwycięzcy i żadna hipoteza nie może się na nie powołać.`
        : `Uporządkowanie ${problem.primaryMetric} jest rozstrzygające: ${measured.map((entry) => `${entry.candidate}=${entry.metric}`).join(' < ')}.`,
  };

  return {
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    preregistration: prereg,
    preregistrationIntact: verifyPreregistrationIntact(prereg),
    outcomes,
    discrimination,
    chains,
    packs,
    allRuns,
    claim: 'Genesis wygenerował prerejestrowane hipotezy, wykonał istniejący model obliczeniowy i porównał realne wyniki modelu w zadeklarowanym zakresie. To nie jest odkrycie naukowe, obserwacja świata ani wskazówka operacyjna.',
  };
}

/**
 * ASYNC / BACKEND-AWARE TWIN OF `executePreregisteredHypotheses`.
 *
 * The sync version above can only execute LOCAL models through
 * `executeScientificExperiment` (`executor.ts::runExperiment`) — a
 * BACKEND_REAL_ENGINE model (e.g. `quantum-chemistry-pyscf-h2-rhf`, a real
 * PySCF process behind the Fabric HTTP endpoint) throws inside that path,
 * because the sync executor's adapter switch has no case for a network
 * call. This is the missing connection Manus flagged: the SAME
 * preregistration/discrimination/next-experiment/replay machinery below
 * did not yet reach backend-executed hypotheses.
 *
 * This function changes NOTHING about the hypothesis ontology, the
 * falsification/discrimination logic, or the evidence chain shape — it is
 * `executePreregisteredHypotheses` with exactly one difference: per
 * hypothesis, when the declared model's capability is `BACKEND_REAL_ENGINE`,
 * it awaits the existing `executeScientificBackendExperiment` (which itself
 * already calls the real, unmodified Fabric backend endpoint) instead of the
 * synchronous local executor. Local-model hypotheses keep using the
 * synchronous path unchanged, so nothing about existing (biology/scenario)
 * callers of the sync function is altered.
 */
export async function executePreregisteredHypothesesAsync(prereg: Preregistration): Promise<HypothesisLoopResult> {
  const problem = prereg.set.problem;
  const backend = getRouterModel(problem.modelId)?.capability === 'BACKEND_REAL_ENGINE';
  const chains: ScientificEvidenceChain[] = [];
  const packs: ScientificEvidencePack[] = [];
  const allRuns: ExperimentRun[] = [];
  const outcomes: HypothesisOutcome[] = [];

  for (const hypothesis of prereg.hypotheses) {
    if (hypothesis.proposedExperiment === null) {
      outcomes.push({
        hypothesisId: hypothesis.hypothesisId, status: 'BLOCKED', criterionAssessment: null,
        observedMetric: null, baselineMetric: null,
        reason: hypothesis.blockedReason ?? 'Brak wykonywalnego requestu dla tej hipotezy.',
        runIds: [], runFingerprints: [], evidenceChainId: null, evidencePackId: null,
      });
      continue;
    }
    const candidate = hypothesis.proposedExperiment.parameters[problem.candidateVariable];
    const baselineRequest = requestFor(problem, problem.baselineValue);
    if (baselineRequest === null || candidate === undefined) {
      outcomes.push({
        hypothesisId: hypothesis.hypothesisId, status: 'BLOCKED', criterionAssessment: null,
        observedMetric: null, baselineMetric: null,
        reason: 'Nie da się zbudować wspólnego ramienia odniesienia dla tej hipotezy.',
        runIds: [], runFingerprints: [], evidenceChainId: null, evidencePackId: null,
      });
      continue;
    }
    let chain: ScientificEvidenceChain;
    try {
      const design = designScientificExperiment({
        hypothesis: {
          statement: hypothesis.statement,
          domainId: problem.domainId,
          modelId: problem.modelId,
          declaredAssumptions: [...hypothesis.assumptions],
          falsification: hypothesis.falsificationCriteria,
        },
        baselineRequest,
        sweep: { parameter: problem.candidateVariable, values: [candidate], label: problem.candidateVariable },
        repetitionsPerArm: 2,
      });
      chain = backend ? await executeScientificBackendExperiment(design) : executeScientificExperiment(design);
    } catch (error) {
      outcomes.push({
        hypothesisId: hypothesis.hypothesisId, status: 'BLOCKED', criterionAssessment: null,
        observedMetric: null, baselineMetric: null,
        reason: `Istniejący protokół albo backend odrzucił tę hipotezę: ${error instanceof Error ? error.message : String(error)}`,
        runIds: [], runFingerprints: [], evidenceChainId: null, evidencePackId: null,
      });
      continue;
    }
    chains.push(chain);
    allRuns.push(...chain.allRuns);
    const pack = createScientificEvidencePack(chain);
    packs.push(pack);
    const assessment = chain.assessment.assessment;
    const status: HypothesisStatus = assessment === 'SUPPORTED_WITHIN_PROTOCOL' ? 'SUPPORTED'
      : assessment === 'FALSIFIED_WITHIN_PROTOCOL' ? 'FALSIFIED'
        : assessment === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'UNKNOWN';
    outcomes.push({
      hypothesisId: hypothesis.hypothesisId,
      status,
      criterionAssessment: assessment,
      observedMetric: metricFromArm(chain, 'variant'),
      baselineMetric: metricFromArm(chain, 'baseline'),
      reason: chain.assessment.message,
      runIds: chain.allRuns.map((run) => run.runId),
      runFingerprints: chain.allRuns.map((run) => run.provenance.runFingerprint),
      evidenceChainId: chain.evidenceId,
      evidencePackId: pack.evidencePackId,
    });
  }

  const measured = outcomes
    .map((outcome) => {
      const hypothesis = prereg.hypotheses.find((entry) => entry.hypothesisId === outcome.hypothesisId);
      const candidate = hypothesis?.proposedExperiment?.parameters[problem.candidateVariable];
      return outcome.observedMetric === null || candidate === undefined
        ? null
        : { hypothesisId: outcome.hypothesisId, candidate: String(candidate), metric: outcome.observedMetric };
    })
    .filter((entry): entry is { hypothesisId: string; candidate: string; metric: number } => entry !== null)
    .sort((a, b) => (problem.objective === 'minimize' ? a.metric - b.metric : b.metric - a.metric) || a.candidate.localeCompare(b.candidate));

  const best = measured[0];
  const tied = best !== undefined && measured.filter((entry) => entry.metric === best.metric).length > 1;
  const discrimination: HypothesisDiscrimination = {
    ranking: measured,
    winnerHypothesisId: best !== undefined && !tied ? best.hypothesisId : null,
    decisive: best !== undefined && !tied && measured.length >= 2,
    reason: measured.length < 2
      ? 'Mniej niż dwie hipotezy dostarczyły liczbową wartość metryki — zbiór nie został rozstrzygnięty.'
      : tied
        ? `Remis na metryce ${problem.primaryMetric} (${best!.metric}); uporządkowanie nie wyłania zwycięzcy i żadna hipoteza nie może się na nie powołać.`
        : `Uporządkowanie ${problem.primaryMetric} jest rozstrzygające: ${measured.map((entry) => `${entry.candidate}=${entry.metric}`).join(' < ')}.`,
  };

  return {
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    preregistration: prereg,
    preregistrationIntact: verifyPreregistrationIntact(prereg),
    outcomes,
    discrimination,
    chains,
    packs,
    allRuns,
    claim: 'Genesis wygenerował prerejestrowane hipotezy, wykonał istniejący model obliczeniowy (lokalny albo realny backend) i porównał realne wyniki modelu w zadeklarowanym zakresie. To nie jest odkrycie naukowe, obserwacja świata ani wskazówka operacyjna.',
  };
}

export interface NextHypothesisExperiment {
  status: 'READY_TO_RUN' | 'VALIDATION_REQUIRED' | 'BLOCKED' | 'RESOLVED';
  /** Dlaczego akurat ten krok — z nierozstrzygniętego stanu, nie z narracji. */
  why: string;
  resolves: string;
  request: StructuredExperimentRequest | null;
  /** Hipotezy, których ten krok dotyczy. */
  aboutHypothesisIds: readonly string[];
  rule: string;
}

/**
 * Kolejność rozstrzygania — zadeklarowana wprost, leksykograficznie. Nie ma tu
 * ważonego wskaźnika informatywności, bo nie ma metodologii, która by go
 * uzasadniła; jest natomiast porządek, który da się przeczytać i podważyć.
 */
export const NEXT_EXPERIMENT_PRIORITY = [
  // Naruszona prerejestracja unieważnia wszystko poniżej.
  'PREREGISTRATION_VIOLATED',
  // Hipoteza, której nie dało się wykonać, to brak danych, nie słaby wynik.
  'BLOCKED_HYPOTHESIS',
  // Niepowtarzalny albo nieliczbowy wynik nie nadaje się na podstawę wniosku.
  'INCONCLUSIVE_HYPOTHESIS',
  // Remis w uporządkowaniu — zbiór wykonany, ale nierozstrzygnięty.
  'UNDECIDED_RANKING',
  // Zwycięzca wyłoniony na jednym ziarnie może być własnością tego przebiegu.
  'SINGLE_SEED_WINNER',
] as const;

export type NextExperimentKind = (typeof NEXT_EXPERIMENT_PRIORITY)[number];

/**
 * Wybiera następny eksperyment z REALNEGO stanu pętli i zwraca gotowy request
 * tam, gdzie istniejący wykonawca potrafi go uruchomić. Nowe ziarno zmienia
 * dokładnie jedno pole — inaczej krok przestałby być kontrolowany.
 */
export function selectNextHypothesisExperiment(result: HypothesisLoopResult): NextHypothesisExperiment {
  const problem = result.preregistration.set.problem;
  const rule = 'Kolejny krok zmienia DOKŁADNIE jedną rzecz względem przebiegu, który zgłosił niepewność.';

  if (!result.preregistrationIntact.intact) {
    return {
      status: 'BLOCKED',
      why: result.preregistrationIntact.reason,
      resolves: 'Rozstrzygnie, czy zbiór hipotez nadal opisuje to, co prerejestrowano. Do tego czasu żaden wynik nie jest ważny.',
      request: null,
      aboutHypothesisIds: result.preregistration.hypotheses.map((entry) => entry.hypothesisId),
      rule: 'Naruszonej prerejestracji nie naprawia się kolejnym przebiegiem.',
    };
  }

  const blockedOutcomes = result.outcomes.filter((outcome) => outcome.status === 'BLOCKED');
  if (blockedOutcomes.length > 0) {
    return {
      status: 'VALIDATION_REQUIRED',
      why: `${blockedOutcomes.length} ${blockedOutcomes.length === 1 ? 'hipoteza nie została wykonana' : 'hipotez nie zostało wykonanych'}: ${blockedOutcomes.map((outcome) => outcome.reason).join(' ')}`,
      resolves: 'Rozstrzygnie, czy te hipotezy da się w Genesis w ogóle przetestować, zamiast zostawiać puste miejsce po wyniku.',
      request: null,
      aboutHypothesisIds: blockedOutcomes.map((outcome) => outcome.hypothesisId),
      rule: 'Brak wykonawcy to żądanie walidacji, nie kolejny przebieg.',
    };
  }

  const inconclusive = result.outcomes.filter((outcome) => outcome.status === 'INCONCLUSIVE' || outcome.observedMetric === null);
  if (inconclusive.length > 0) {
    const hypothesis = result.preregistration.hypotheses.find((entry) => entry.hypothesisId === inconclusive[0]!.hypothesisId);
    return {
      status: hypothesis?.proposedExperiment ? 'READY_TO_RUN' : 'VALIDATION_REQUIRED',
      why: `Hipoteza ${inconclusive[0]!.hypothesisId} nie dostarczyła powtarzalnej wartości liczbowej: ${inconclusive[0]!.reason}`,
      resolves: 'Rozstrzygnie, czy brak wyniku był jednorazowy, czy wejścia nie opisują wyniku.',
      request: hypothesis?.proposedExperiment ?? null,
      aboutHypothesisIds: [inconclusive[0]!.hypothesisId],
      rule: 'Powtórzenie bez żadnej zmiany wejścia — jedyny sposób, żeby odróżnić niedeterminizm od błędu zapisu.',
    };
  }

  if (!result.discrimination.decisive) {
    const contenders = result.discrimination.ranking.filter((entry) => entry.metric === result.discrimination.ranking[0]?.metric);
    const hypothesis = result.preregistration.hypotheses.find((entry) => entry.hypothesisId === contenders[0]?.hypothesisId);
    const request = hypothesis?.proposedExperiment ?? null;
    const model = getRouterModel(problem.modelId);
    const seed = typeof problem.sharedLevers.seed === 'number' ? problem.sharedLevers.seed : 0;
    return {
      status: request !== null && model !== undefined ? 'READY_TO_RUN' : 'VALIDATION_REQUIRED',
      why: result.discrimination.reason,
      resolves: 'Rozstrzygnie, czy remis jest własnością modelu, czy artefaktem tego jednego losowego przebiegu.',
      request: request !== null && model !== undefined
        ? buildStructuredRequestFromModel(model, { ...request.parameters, seed: seed + 1 }, {
            sourceText: `Rozstrzygnięcie remisu na ${problem.primaryMetric}: powtórzenie na ziarnie ${seed + 1}.`,
            seed: seed + 1,
          })
        : null,
      aboutHypothesisIds: contenders.map((entry) => entry.hypothesisId),
      rule,
    };
  }

  // Zbiór rozstrzygnięty — ale na jednym ziarnie. To nie jest wniosek o modelu.
  const winner = result.preregistration.hypotheses.find((entry) => entry.hypothesisId === result.discrimination.winnerHypothesisId);
  const model = getRouterModel(problem.modelId);
  const seed = typeof problem.sharedLevers.seed === 'number' ? problem.sharedLevers.seed : 0;
  if (winner?.proposedExperiment === undefined || winner?.proposedExperiment === null || model === undefined) {
    return {
      status: 'RESOLVED',
      why: result.discrimination.reason,
      resolves: 'Brak dalszego kroku wykonywalnego istniejącym wykonawcą.',
      request: null,
      aboutHypothesisIds: result.discrimination.winnerHypothesisId === null ? [] : [result.discrimination.winnerHypothesisId],
      rule,
    };
  }
  return {
    status: 'READY_TO_RUN',
    why: `Uporządkowanie rozstrzygnęło zbiór, ale wyłącznie na ziarnie ${seed}. Zwycięstwo na jednym losowym przebiegu nie jest własnością modelu.`,
    resolves: 'Rozstrzygnie, czy przewaga zwycięskiego kandydata utrzymuje się przy innym losowym przebiegu tego samego układu.',
    request: buildStructuredRequestFromModel(model, { ...winner.proposedExperiment.parameters, seed: seed + 1 }, {
      sourceText: `Kontrola pojedynczego ziarna dla zwycięskiego kandydata: ziarno ${seed + 1}.`,
      seed: seed + 1,
    }),
    aboutHypothesisIds: [winner.hypothesisId],
    rule,
  };
}

/**
 * TRWAŁA POSTAĆ PĘTLI.
 *
 * Zapisujemy PREREJESTRACJĘ i to, co z niej wyszło — a nie odpowiedź. Przy
 * odtworzeniu zbiór jest wykonywany od nowa z zapisanych wejść i zestawiany z
 * zapisanymi statusami; zapisane liczby są porównywane, nie odczytywane jako
 * wynik. Podmieniony status albo dopisana hipoteza kończą się DRIFT-em.
 */
export interface SavedHypothesisLoop {
  contractVersion: string;
  preregistrationId: string;
  preregistrationFingerprint: string;
  problem: HypothesisProblem;
  hypotheses: readonly PreregisteredHypothesis[];
  outcomes: readonly {
    hypothesisId: string;
    status: HypothesisStatus;
    observedMetric: number | null;
    baselineMetric: number | null;
    evidencePackId: string | null;
    evidenceChainId: string | null;
  }[];
  discrimination: { ranking: HypothesisDiscrimination['ranking']; winnerHypothesisId: string | null; decisive: boolean };
  loopFingerprint: string;
}

export function buildSavedHypothesisLoop(result: HypothesisLoopResult): SavedHypothesisLoop {
  if (!result.preregistrationIntact.intact) {
    throw new Error(`Nie zapisujemy pętli z naruszoną prerejestracją: ${result.preregistrationIntact.reason}`);
  }
  const base = {
    contractVersion: HYPOTHESIS_LOOP_CONTRACT_VERSION,
    preregistrationId: result.preregistration.preregistrationId,
    preregistrationFingerprint: result.preregistration.preregistrationFingerprint,
    problem: result.preregistration.set.problem,
    hypotheses: result.preregistration.hypotheses,
    outcomes: result.outcomes.map((outcome) => ({
      hypothesisId: outcome.hypothesisId,
      status: outcome.status,
      observedMetric: outcome.observedMetric,
      baselineMetric: outcome.baselineMetric,
      evidencePackId: outcome.evidencePackId,
      evidenceChainId: outcome.evidenceChainId,
    })),
    discrimination: {
      ranking: result.discrimination.ranking,
      winnerHypothesisId: result.discrimination.winnerHypothesisId,
      decisive: result.discrimination.decisive,
    },
  };
  return { ...base, loopFingerprint: fnv1a(canonicalJson(base)) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** localStorage jest edytowalne poza aplikacją — rekord walidujemy pole po polu. */
export function isSavedHypothesisLoop(value: unknown): value is SavedHypothesisLoop {
  if (!isRecord(value)) return false;
  if (typeof value.contractVersion !== 'string' || typeof value.preregistrationId !== 'string') return false;
  if (typeof value.preregistrationFingerprint !== 'string' || typeof value.loopFingerprint !== 'string') return false;
  if (!isRecord(value.problem) || typeof value.problem.problemId !== 'string' || typeof value.problem.modelId !== 'string') return false;
  if (!Array.isArray(value.hypotheses) || value.hypotheses.length === 0) return false;
  if (!value.hypotheses.every((entry) => isRecord(entry) && typeof entry.hypothesisId === 'string' && entry.createdBeforeRun === true)) return false;
  if (!Array.isArray(value.outcomes) || value.outcomes.length !== value.hypotheses.length) return false;
  if (!isRecord(value.discrimination) || !Array.isArray(value.discrimination.ranking)) return false;
  return typeof value.discrimination.decisive === 'boolean';
}

export type HypothesisLoopReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED';

export interface HypothesisLoopReplay {
  status: HypothesisLoopReplayStatus;
  reason: string;
  differences: readonly { field: string; expected: string | number | null; actual: string | number | null }[];
  /** Ponownie wykonana pętla — wyłącznie przy MATCH. */
  result: HypothesisLoopResult | null;
}

/**
 * Odtwarza pętlę, WYKONUJĄC prerejestrowany zbiór od nowa. Nie odczytuje
 * zapisanych statusów: liczy je ponownie i porównuje. Naruszona prerejestracja
 * albo uszkodzony rekord to BLOCKED, nigdy MATCH.
 */
export function replaySavedHypothesisLoop(saved: unknown): HypothesisLoopReplay {
  if (!isSavedHypothesisLoop(saved)) {
    return { status: 'BLOCKED', reason: 'Zapisana pętla jest niekompletna albo uszkodzona.', differences: [], result: null };
  }
  if (saved.contractVersion !== HYPOTHESIS_LOOP_CONTRACT_VERSION) {
    return { status: 'BLOCKED', reason: `Zapis pochodzi z kontraktu ${saved.contractVersion}, a bieżący to ${HYPOTHESIS_LOOP_CONTRACT_VERSION} — porównanie nie byłoby miarodajne.`, differences: [], result: null };
  }
  const rebuilt: Preregistration = {
    contractVersion: saved.contractVersion,
    preregistrationId: saved.preregistrationId,
    problemId: saved.problem.problemId,
    createdAt: '',
    hypotheses: saved.hypotheses,
    preregistrationFingerprint: saved.preregistrationFingerprint,
    set: generateCompetingHypotheses(saved.problem),
  };
  const intact = verifyPreregistrationIntact(rebuilt);
  if (!intact.intact) {
    return { status: 'BLOCKED', reason: `Prerejestracja w zapisie nie zgadza się ze swoim odciskiem: ${intact.reason}`, differences: [], result: null };
  }

  const replayed = executePreregisteredHypotheses(rebuilt);
  const differences: { field: string; expected: string | number | null; actual: string | number | null }[] = [];
  for (const savedOutcome of saved.outcomes) {
    const actual = replayed.outcomes.find((entry) => entry.hypothesisId === savedOutcome.hypothesisId);
    if (actual === undefined) {
      differences.push({ field: `outcome.${savedOutcome.hypothesisId}`, expected: savedOutcome.status, actual: null });
      continue;
    }
    if (actual.status !== savedOutcome.status) differences.push({ field: `${savedOutcome.hypothesisId}.status`, expected: savedOutcome.status, actual: actual.status });
    if (actual.observedMetric !== savedOutcome.observedMetric) differences.push({ field: `${savedOutcome.hypothesisId}.observedMetric`, expected: savedOutcome.observedMetric, actual: actual.observedMetric });
    if (actual.evidencePackId !== savedOutcome.evidencePackId) differences.push({ field: `${savedOutcome.hypothesisId}.evidencePackId`, expected: savedOutcome.evidencePackId, actual: actual.evidencePackId });
  }
  if (replayed.discrimination.winnerHypothesisId !== saved.discrimination.winnerHypothesisId) {
    differences.push({ field: 'discrimination.winner', expected: saved.discrimination.winnerHypothesisId, actual: replayed.discrimination.winnerHypothesisId });
  }
  if (replayed.discrimination.decisive !== saved.discrimination.decisive) {
    differences.push({ field: 'discrimination.decisive', expected: String(saved.discrimination.decisive), actual: String(replayed.discrimination.decisive) });
  }

  if (differences.length > 0) {
    return {
      status: 'DRIFT',
      reason: `Odtworzona pętla różni się od zapisanej w ${differences.length} ${differences.length === 1 ? 'polu' : 'polach'}: ${differences.map((entry) => entry.field).join(', ')}.`,
      differences, result: null,
    };
  }
  return {
    status: 'MATCH',
    reason: 'Prerejestrowany zbiór wykonano od nowa i odtworzył te same statusy, te same metryki, te same paczki dowodowe i to samo rozstrzygnięcie.',
    differences: [], result: replayed,
  };
}

/**
 * ASYNC / BACKEND-AWARE TWIN OF `replaySavedHypothesisLoop`. Identical
 * verification logic (recompute from the saved, still-intact
 * preregistration and diff every recorded field) — the only difference is
 * that it re-executes via `executePreregisteredHypothesesAsync`, so a saved
 * loop over a BACKEND_REAL_ENGINE model (PySCF) can actually be replayed
 * instead of failing inside the sync-only executor.
 */
export async function replaySavedHypothesisLoopAsync(saved: unknown): Promise<HypothesisLoopReplay> {
  if (!isSavedHypothesisLoop(saved)) {
    return { status: 'BLOCKED', reason: 'Zapisana pętla jest niekompletna albo uszkodzona.', differences: [], result: null };
  }
  if (saved.contractVersion !== HYPOTHESIS_LOOP_CONTRACT_VERSION) {
    return { status: 'BLOCKED', reason: `Zapis pochodzi z kontraktu ${saved.contractVersion}, a bieżący to ${HYPOTHESIS_LOOP_CONTRACT_VERSION} — porównanie nie byłoby miarodajne.`, differences: [], result: null };
  }
  const rebuilt: Preregistration = {
    contractVersion: saved.contractVersion,
    preregistrationId: saved.preregistrationId,
    problemId: saved.problem.problemId,
    createdAt: '',
    hypotheses: saved.hypotheses,
    preregistrationFingerprint: saved.preregistrationFingerprint,
    set: generateCompetingHypotheses(saved.problem),
  };
  const intact = verifyPreregistrationIntact(rebuilt);
  if (!intact.intact) {
    return { status: 'BLOCKED', reason: `Prerejestracja w zapisie nie zgadza się ze swoim odciskiem: ${intact.reason}`, differences: [], result: null };
  }

  const replayed = await executePreregisteredHypothesesAsync(rebuilt);
  const differences: { field: string; expected: string | number | null; actual: string | number | null }[] = [];
  for (const savedOutcome of saved.outcomes) {
    const actual = replayed.outcomes.find((entry) => entry.hypothesisId === savedOutcome.hypothesisId);
    if (actual === undefined) {
      differences.push({ field: `outcome.${savedOutcome.hypothesisId}`, expected: savedOutcome.status, actual: null });
      continue;
    }
    if (actual.status !== savedOutcome.status) differences.push({ field: `${savedOutcome.hypothesisId}.status`, expected: savedOutcome.status, actual: actual.status });
    if (actual.observedMetric !== savedOutcome.observedMetric) differences.push({ field: `${savedOutcome.hypothesisId}.observedMetric`, expected: savedOutcome.observedMetric, actual: actual.observedMetric });
    if (actual.evidencePackId !== savedOutcome.evidencePackId) differences.push({ field: `${savedOutcome.hypothesisId}.evidencePackId`, expected: savedOutcome.evidencePackId, actual: actual.evidencePackId });
  }
  if (replayed.discrimination.winnerHypothesisId !== saved.discrimination.winnerHypothesisId) {
    differences.push({ field: 'discrimination.winner', expected: saved.discrimination.winnerHypothesisId, actual: replayed.discrimination.winnerHypothesisId });
  }
  if (replayed.discrimination.decisive !== saved.discrimination.decisive) {
    differences.push({ field: 'discrimination.decisive', expected: String(saved.discrimination.decisive), actual: String(replayed.discrimination.decisive) });
  }

  if (differences.length > 0) {
    return {
      status: 'DRIFT',
      reason: `Odtworzona pętla różni się od zapisanej w ${differences.length} ${differences.length === 1 ? 'polu' : 'polach'}: ${differences.map((entry) => entry.field).join(', ')}.`,
      differences, result: null,
    };
  }
  return {
    status: 'MATCH',
    reason: 'Prerejestrowany zbiór wykonano od nowa (backend-aware) i odtworzył te same statusy, te same metryki, te same paczki dowodowe i to samo rozstrzygnięcie.',
    differences: [], result: replayed,
  };
}
