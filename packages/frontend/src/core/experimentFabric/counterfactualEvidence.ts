import { getRouterModel } from './router';
import { buildStructuredRequestFromModel } from './structuredRequestBuilder';
import { designScientificExperiment } from './scientificPlanner';
import { executeScientificExperiment } from './scientificExecutor';
import { createScientificEvidencePack, type ScientificEvidencePack } from './evidencePack';
import type { ScientificEvidenceChain } from './scientificDiscovery';
import {
  replaySavedScenarioCounterfactual,
  type SavedScenarioCounterfactual,
  type SavedScenarioCounterfactualReplay,
} from '../simulation/scenarioCounterfactual';
import type { SavedScenarioRunContext } from '../simulation/scenarioMemory';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../simulation/preparednessQuestions';

/**
 * ZAPISANY KONTRFAKTYK → ISTNIEJĄCY EVIDENCE PACK.
 *
 * Ostatni brakujący odcinek łańcucha. Artefakt kontrfaktyczny miał już
 * prowieniencję, odciski, trwałość i odtworzenie — nie miał tylko drogi do
 * `createScientificEvidencePack()`, więc ogniwo EVIDENCE było artefaktem, a nie
 * paczką dowodową.
 *
 * Ten moduł NICZEGO nie liczy i nie tworzy drugiego systemu dowodowego.
 * Przekłada zapisany kontrfaktyk na wejście ISTNIEJĄCEGO protokołu
 * (`designScientificExperiment` → `executeScientificExperiment` →
 * `createScientificEvidencePack`), bo kontrfaktyk JEST sweepem po jednym
 * parametrze: odniesienie plus jeden wariant różniący się dokładnie jedną
 * zadeklarowaną dźwignią.
 *
 * Cztery bramki, wszystkie fail-closed:
 *
 * 1. OBA RAMIONA MUSZĄ SIĘ ODTWORZYĆ. Paczka powstaje wyłącznie po werdykcie
 *    MATCH całego kontrfaktyku. Zweryfikowany wariant obok niezweryfikowanego
 *    odniesienia nie jest kontrfaktykiem — ta sama reguła, która rządzi
 *    przekazaniem do świata 3D.
 * 2. RÓŻNICA MUSI BYĆ JEDNOPARAMETROWA. Jeżeli ramiona różnią się więcej niż
 *    jedną zadeklarowaną dźwignią, protokół nie jest prerejestrowalny i paczka
 *    nie powstaje.
 * 3. KRYTERIUM MUSI BYĆ PREREJESTROWANE. Bierzemy je z rządzonego pytania,
 *    zapisanego w katalogu PRZED wykonaniem. Artefakt bez pytania nie dostaje
 *    dorobionego kryterium — dostaje NOT_AVAILABLE.
 * 4. REALNE RUNY MUSZĄ ZGADZAĆ SIĘ Z ZAPISEM. Przebiegi wykonane teraz przez
 *    Experiment Fabric są zestawiane z zapisaną migawką podsumowania. Rozjazd
 *    to NOT_REPRODUCIBLE, nie paczka z przypisem.
 */
export const COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION = '1.0.0';

/** Dźwignie, które kontrfaktyk ma prawo różnicować; wszystko inne musi być wspólne. */
export const SWEEPABLE_LEVERS = ['scenarioId', 'interventionStartDay'] as const;
export type SweepableLever = (typeof SWEEPABLE_LEVERS)[number];

export type CounterfactualEvidenceStatus =
  | 'CREATED'
  | 'BLOCKED_REPLAY'
  | 'BLOCKED_NOT_COMPARABLE'
  | 'NOT_REPRODUCIBLE'
  | 'NOT_AVAILABLE';

export interface CounterfactualEvidenceResult {
  contractVersion: string;
  status: CounterfactualEvidenceStatus;
  reason: string;
  pack: ScientificEvidencePack | null;
  chain: ScientificEvidenceChain | null;
  /** Werdykt odtworzenia obu ramion, który zdecydował o dopuszczeniu. */
  replay: SavedScenarioCounterfactualReplay | null;
  sweptLever: SweepableLever | null;
  /** Rozjazdy między realnym runem a zapisem; puste, gdy zgodne. */
  differences: readonly { field: string; saved: number; executed: number | null }[];
}

function blocked(status: CounterfactualEvidenceStatus, reason: string, replay: SavedScenarioCounterfactualReplay | null = null, sweptLever: SweepableLever | null = null, differences: CounterfactualEvidenceResult['differences'] = []): CounterfactualEvidenceResult {
  return { contractVersion: COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION, status, reason, pack: null, chain: null, replay, sweptLever, differences };
}

/** Siedem dźwigni, którymi `scenario-timeline` jest w pełni określony. */
function timelineParameters(arm: SavedScenarioRunContext): Record<string, string | number> {
  return {
    scenarioId: arm.scenarioId,
    days: arm.days,
    stepsPerDay: arm.stepsPerDay,
    nAgents: arm.params.nAgents,
    initialInfected: arm.params.initialInfected,
    seed: arm.params.seed,
    interventionStartDay: arm.interventionStartDay,
  };
}

/**
 * Jedyna dozwolona różnica. Zwraca `null`, gdy ramiona są identyczne albo
 * różnią się więcej niż jedną dźwignią — w obu przypadkach nie ma
 * prerejestrowalnego sweepu po jednym parametrze.
 */
export function resolveSweptLever(baseline: SavedScenarioRunContext, variant: SavedScenarioRunContext): { lever: SweepableLever; value: string | number } | { lever: null; reason: string } {
  const baseParams = timelineParameters(baseline);
  const variantParams = timelineParameters(variant);
  const changed = Object.keys(baseParams).filter((key) => baseParams[key] !== variantParams[key]);
  if (changed.length === 0) return { lever: null, reason: 'Ramiona są identyczne — nie ma wariantu do prerejestrowania.' };
  if (changed.length > 1) {
    return { lever: null, reason: `Ramiona różnią się w ${changed.length} dźwigniach (${changed.join(', ')}); protokół dopuszcza dokładnie jedną prerejestrowaną zmianę.` };
  }
  const lever = changed[0]!;
  if (!SWEEPABLE_LEVERS.includes(lever as SweepableLever)) {
    return { lever: null, reason: `Dźwignia „${lever}" nie jest dopuszczoną osią kontrfaktyku; zmiana warunków startowych unieważnia porównywalność.` };
  }
  return { lever: lever as SweepableLever, value: variantParams[lever]! };
}

/** Metryki, które muszą zgodzić się między realnym runem a zapisaną migawką. */
const CROSS_CHECKED_METRICS = ['totalDeaths', 'peakInfectious', 'peakInfectiousDay'] as const;

export function buildCounterfactualEvidencePack(saved: unknown): CounterfactualEvidenceResult {
  const replay = replaySavedScenarioCounterfactual(saved);
  if (replay.status !== 'MATCH' || replay.counterfactual === null) {
    return blocked('BLOCKED_REPLAY', `Evidence Pack nie powstaje: odtworzenie obu ramion zakończyło się werdyktem ${replay.status}. ${replay.reason}`, replay);
  }
  const artifact = saved as SavedScenarioCounterfactual;
  const question = artifact.preparedness === undefined
    ? undefined
    : GOVERNED_PREPAREDNESS_QUESTIONS.find((entry) => entry.questionId === artifact.preparedness!.questionId);
  if (question === undefined) {
    return blocked(
      'NOT_AVAILABLE',
      'Evidence Pack wymaga PREREJESTROWANEGO kryterium falsyfikacji. Ten artefakt nie niesie rządzonego pytania, a kryterium dobrane teraz byłoby dopasowane do znanych już wyników.',
      replay,
    );
  }

  const swept = resolveSweptLever(artifact.baseline, artifact.variant);
  if (swept.lever === null) {
    return blocked('BLOCKED_NOT_COMPARABLE', `Evidence Pack nie powstaje: ${swept.reason}`, replay);
  }

  const model = getRouterModel('scenario-timeline');
  if (model === undefined) {
    return blocked('NOT_AVAILABLE', 'Model scenario-timeline nie jest zarejestrowany w routerze.', replay, swept.lever);
  }
  const baselineRequest = buildStructuredRequestFromModel(model, timelineParameters(artifact.baseline), {
    sourceText: `${question.question} — ramię odniesienia (${artifact.baseline.label}).`,
    seed: artifact.baseline.params.seed,
  });

  let chain: ScientificEvidenceChain;
  try {
    const design = designScientificExperiment({
      hypothesis: {
        statement: question.question,
        domainId: 'biology',
        modelId: 'scenario-timeline',
        declaredAssumptions: [
          question.governedDifference,
          'Model nie jest skalibrowany do żadnej rzeczywistej epidemii; wynik jest scenariuszowy (SYNTHETIC / SCENARIO / NON_OPERATIONAL).',
          ...(artifact.variant.disclosure === undefined ? [] : [`Efekty NOT_MODELED: ${artifact.variant.disclosure.notModeled.map((entry) => entry.effect).join(', ')}.`]),
        ],
        falsification: question.falsification,
      },
      baselineRequest,
      sweep: { parameter: swept.lever, values: [swept.value], label: swept.lever },
      repetitionsPerArm: 2,
    });
    chain = executeScientificExperiment(design);
  } catch (error) {
    return blocked('NOT_AVAILABLE', `Istniejący protokół odrzucił ten kontrfaktyk: ${error instanceof Error ? error.message : String(error)}`, replay, swept.lever);
  }

  // Bramka 4: realny run musi odtworzyć zapisaną migawkę, inaczej paczka
  // dokumentowałaby coś innego niż zapisany artefakt.
  const differences: { field: string; saved: number; executed: number | null }[] = [];
  const armFor = (kind: 'baseline' | 'variant') => chain.arms.find((arm) => arm.kind === kind);
  for (const [kind, armArtifact] of [['baseline', artifact.baseline], ['variant', artifact.variant]] as const) {
    const arm = armFor(kind);
    const run = chain.allRuns.find((entry) => arm?.runIds.includes(entry.runId));
    for (const metric of CROSS_CHECKED_METRICS) {
      const savedValue = armArtifact.summaryDigest[metric];
      const executed = run?.result.outputs[metric];
      const executedValue = typeof executed === 'number' ? executed : null;
      if (executedValue !== savedValue) differences.push({ field: `${kind}.${metric}`, saved: savedValue, executed: executedValue });
    }
  }
  if (differences.length > 0) {
    return blocked(
      'NOT_REPRODUCIBLE',
      `Evidence Pack nie powstaje: realne przebiegi nie odtworzyły zapisanej migawki w ${differences.length} ${differences.length === 1 ? 'polu' : 'polach'} (${differences.map((entry) => entry.field).join(', ')}).`,
      replay, swept.lever, differences,
    );
  }

  return {
    contractVersion: COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION,
    status: 'CREATED',
    reason: `Evidence Pack utworzony z ${chain.allRuns.length} realnych przebiegów; ocena prerejestrowanego kryterium: ${chain.assessment.assessment}.`,
    pack: createScientificEvidencePack(chain),
    chain,
    replay,
    sweptLever: swept.lever,
    differences: [],
  };
}
