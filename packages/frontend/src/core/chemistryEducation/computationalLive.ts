import { runFabricCompute, type ApiResult, type FabricComputeResponse, type ScientificExecutionEvent } from '../backend/client';
import { replayExperimentSession, type ReplayVerdict } from '../scientificWorlds/experimentSession';
import { frameStages } from './liveTimeline';
import {
  ARRHENIUS_OUTPUT_IDS,
  arrheniusOutputKey,
  arrheniusPoints,
  arrheniusReplayRunner,
  sealExperimentSession,
} from './runners';
import type {
  ChemistryBackendExecution,
  ChemistryComputationalRun,
  ChemistryEvidenceEligibility,
  ChemistryExperimentPlan,
  ChemistryRunArtifact,
  ChemistryStage,
} from './contracts';

/**
 * COMPUTATIONAL_LIVE: the lesson's numbers come from the backend's registered
 * model `chemistry-arrhenius` (POST /api/compute/fabric/run → compute/registry.mjs).
 * Progress is the sequence of real ScientificExecutionEvents, each created only
 * when a real request is dispatched or a real response arrives. There is no
 * timer, no simulated progress and no local fallback: if the backend does not
 * answer, the run is FAILED/BLOCKED and says so.
 */

export type FabricExecutor = (input: { modelId: string; inputs: Record<string, number>; domainId: string; sourceText: string }) => Promise<ApiResult<FabricComputeResponse>>;

export interface ComputationalOptions {
  readonly execute?: FabricExecutor;
  readonly now?: () => number;
  /** Called with every event as it happens (the UI's live feed). */
  readonly onEvent?: (event: ScientificExecutionEvent) => void;
}

const MODEL_ID = 'chemistry-arrhenius';
const SOURCE_EVENT_TYPE = 'FABRIC_COMPUTE_RUN';

function numericRecord(values: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(values ?? {})) if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  return out;
}

function evidenceFor(status: ChemistryComputationalRun['status'], executions: readonly ChemistryBackendExecution[]): ChemistryEvidenceEligibility {
  if (status !== 'COMPLETED') return { eligible: false, code: 'EXECUTION_NOT_COMPLETED', reason: 'Wykonanie nie zakończyło się sukcesem — nie ma czego proponować jako dowodu.' };
  if (executions.length > 0 && executions.every((e) => e.persisted)) {
    return { eligible: true, code: 'PERSISTED_PROJECT_RUN', reason: 'Przebiegi zapisane w projekcie — propozycja Evidence przez istniejący mechanizm projektu (Dowody).' };
  }
  return { eligible: false, code: 'EPHEMERAL_RUN_NOT_PERSISTED', reason: 'Publiczne, efemeryczne obliczenie (bez projektu) — backend go nie zapisał, więc nie może stać się Evidence. Pełna ścieżka dowodowa: Wirtualne Laboratorium w kampanii.' };
}

function computationalStages(plan: ChemistryExperimentPlan, executions: readonly ChemistryBackendExecution[]): ChemistryRunArtifact {
  const template = plan.template!;
  const ea = Number(plan.params!.activationEnergyKJ);
  const byKey = new Map(executions.map((e) => [e.inputs.temperatureK, e]));
  const points = arrheniusPoints(Number(plan.params!.temperatureK));
  const room = byKey.get(points[0].temperatureK)!;
  const selected = byKey.get(points[1].temperatureK)!;
  const plus10 = byKey.get(points[2].temperatureK)!;
  const ratio10 = plus10.outputs.rateConstant / selected.outputs.rateConstant;
  const pl = (v: number, d = 3) => Number(v.toPrecision(d)).toLocaleString('pl-PL');
  const middle: ChemistryStage[] = [
    { stageId: 'preparation', kind: 'PREPARATION', label: 'Parametry modelu', detail: `Eₐ = ${ea} kJ/mol, log₁₀A = 11 (ustalone w modelu). Trzy wykonania backendu: 298,15 K, ${points[1].temperatureK} K, ${points[2].temperatureK} K.` },
    ...points.map((point, i): ChemistryStage => {
      const exec = byKey.get(point.temperatureK)!;
      return {
        stageId: `backend-run-${i}`,
        kind: 'STEP',
        label: `Backend: ${MODEL_ID} @ ${point.temperatureK} K`,
        detail: `runId ${exec.runId} · ${exec.engine ?? 'engine'} · model ${exec.modelVersion}`,
        observation: { label: `k(${point.temperatureK} K)`, value: Number(exec.outputs.rateConstant.toPrecision(4)), unit: '1/s', origin: 'BACKEND_ENGINE_OUTPUT' },
      };
    }),
    { stageId: 'observation', kind: 'OBSERVATION', label: 'Obserwacja z wyniku silnika', detail: `Po podgrzaniu o 10 K stała szybkości rośnie ${pl(ratio10)}×.`, observation: { label: 'k(T+10)/k(T)', value: Number(ratio10.toPrecision(4)), origin: 'BACKEND_ENGINE_OUTPUT' } },
    { stageId: 'analysis', kind: 'ANALYSIS', label: 'Analiza', detail: `Względem 298,15 K reakcja w ${points[1].temperatureK} K jest ${pl(selected.outputs.speedupVsRoom)}× szybsza; t½ (I rzędu) = ${pl(selected.outputs.halfLifeFirstOrder)} s.` },
    { stageId: 'result', kind: 'RESULT', label: 'Wynik', detail: `k(${points[1].temperatureK} K) = ${pl(selected.outputs.rateConstant)} 1/s; przyspieszenie vs 298 K = ${pl(selected.outputs.speedupVsRoom)}×.`, observation: { label: 'Przyspieszenie vs 298 K', value: Number(selected.outputs.speedupVsRoom.toPrecision(4)), unit: '×', origin: 'BACKEND_ENGINE_OUTPUT' } },
  ];
  void room;
  return {
    stages: frameStages(template, plan.params!, middle),
    equation: template.equation,
    resultSummary: `k(T+10)/k(T) = ${pl(ratio10)}; k(T)/k(298 K) = ${pl(selected.outputs.speedupVsRoom)}`,
    explanation: {
      school: `Im cieplej, tym szybciej cząsteczki się poruszają i częściej zderzają się z energią wystarczającą do reakcji. Tu podgrzanie o 10 K przyspiesza reakcję ${pl(ratio10)} razy.`,
      university: 'Arrhenius: k = A·exp(−Eₐ/RT). Stosunek k(T₂)/k(T₁) = exp(Eₐ/R·(1/T₁ − 1/T₂)) nie zależy od A; reguła „×2–3 na 10 K” jest tylko przybliżeniem dla Eₐ ≈ 50 kJ/mol w pobliżu 300 K.',
    },
    assumptions: ['A i Eₐ niezależne od T', 'log₁₀A = 11 (wartość bazowa modelu)', 't½ tylko dla reakcji I rzędu'],
  };
}

export async function runComputationalExperiment(plan: ChemistryExperimentPlan, options: ComputationalOptions = {}): Promise<ChemistryComputationalRun> {
  if (plan.status !== 'READY' || !plan.template || !plan.params) throw new Error(`Plan is ${plan.status}, not READY`);
  if (plan.template.liveKind !== 'COMPUTATIONAL_LIVE') throw new Error('Educational experiments run through runEducationalExperiment');
  const execute: FabricExecutor = options.execute ?? ((input) => runFabricCompute(input));
  const now = options.now ?? (() => Date.now());
  const events: ScientificExecutionEvent[] = [];
  const emit = (type: ScientificExecutionEvent['type'], status: ScientificExecutionEvent['status'], detail: string, executionId: string | null, sourceEventId: string) => {
    const event: ScientificExecutionEvent = { id: `chem-live:${events.length + 1}`, type, status, occurredAt: now(), executionId, sourceEventId, sourceEventType: SOURCE_EVENT_TYPE, detail };
    events.push(event);
    options.onEvent?.(event);
  };

  const ea = Number(plan.params.activationEnergyKJ);
  const points = arrheniusPoints(Number(plan.params.temperatureK));
  emit('EXPERIMENT_PLANNED', 'RECORDED', `Plan: ${MODEL_ID} dla ${points.map((p) => `${p.temperatureK} K`).join(', ')}, Eₐ = ${ea} kJ/mol.`, null, 'plan');

  const executions: ChemistryBackendExecution[] = [];
  for (const point of points) {
    const requestId = `request-${point.key}`;
    emit('ENGINE_SELECTED', 'RECORDED', `Wysłano do silnika backendu: ${MODEL_ID} (T = ${point.temperatureK} K).`, null, requestId);
    let response: ApiResult<FabricComputeResponse>;
    try {
      response = await execute({ modelId: MODEL_ID, inputs: { temperatureK: point.temperatureK, activationEnergyKJ: ea }, domainId: 'chemistry', sourceText: `Chemistry Live Lab: Arrhenius @ ${point.temperatureK} K` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      emit('EXECUTION_FAILED', 'FAILED', `Brak odpowiedzi backendu: ${reason}`, null, requestId);
      return failed(plan, events, executions, 'FAILED', reason);
    }
    if (!response.ok) {
      emit('EXECUTION_FAILED', 'FAILED', `Backend niedostępny lub odrzucił żądanie: ${response.error} — ${response.message}`, null, requestId);
      return failed(plan, events, executions, 'FAILED', response.error);
    }
    const run = response.data.run;
    if (run.status === 'rejected') {
      emit('EXECUTION_BLOCKED', 'BLOCKED', `Silnik odrzucił dane wejściowe: ${run.message ?? 'rejected'}`, run.runId, run.runId);
      return failed(plan, events, executions, 'BLOCKED', run.message ?? 'rejected');
    }
    if (run.status !== 'ok') {
      emit('EXECUTION_FAILED', 'FAILED', `Silnik zgłosił błąd: ${run.message ?? run.status}`, run.runId, run.runId);
      return failed(plan, events, executions, 'FAILED', run.message ?? run.status);
    }
    const outputs = numericRecord(run.outputs as Record<string, unknown>);
    if (!ARRHENIUS_OUTPUT_IDS.every((id) => id in outputs)) {
      emit('EXECUTION_FAILED', 'FAILED', 'Odpowiedź silnika nie zawiera oczekiwanych wyjść.', run.runId, run.runId);
      return failed(plan, events, executions, 'FAILED', 'missing outputs');
    }
    emit('INPUT_VALIDATED', 'RECORDED', `Silnik przyjął dane (model ${run.modelVersion}).`, run.runId, run.runId);
    emit('ENGINE_OUTPUT_AVAILABLE', 'RECORDED', `k = ${outputs.rateConstant.toPrecision(4)} 1/s (runId ${run.runId}).`, run.runId, run.runId);
    executions.push({
      runId: run.runId,
      modelId: run.modelId,
      modelVersion: run.modelVersion,
      engine: run.engine ?? null,
      inputs: { temperatureK: point.temperatureK, activationEnergyKJ: ea },
      outputs,
      persisted: response.data.persisted,
      provenance: run.provenance ? { source: run.provenance.source, formula: run.provenance.formula, honesty: run.provenance.honesty } : null,
    });
  }

  const sealed: Record<string, number> = {};
  for (const [i, point] of points.entries()) {
    for (const id of ARRHENIUS_OUTPUT_IDS) sealed[arrheniusOutputKey(point.key, id)] = executions[i].outputs[id];
  }
  const session = sealExperimentSession(plan.template.experimentId, plan.params, sealed, `COMPUTATIONAL_LIVE · backend ${MODEL_ID} ${executions[0].modelVersion}`);
  emit('RESULT_CREATED', 'RECORDED', `Wynik zapieczętowany: sesja ${session.sessionId}, odcisk ${session.replayFingerprint.slice(0, 12)}…`, session.sessionId, session.sessionId);
  emit('EXECUTION_COMPLETED', 'RECORDED', `Ukończono ${executions.length} wykonania backendu.`, session.sessionId, session.sessionId);

  return {
    liveKind: 'COMPUTATIONAL_LIVE',
    plan,
    status: 'COMPLETED',
    events,
    executions,
    session,
    artifact: computationalStages(plan, executions),
    evidence: evidenceFor('COMPLETED', executions),
  };
}

function failed(plan: ChemistryExperimentPlan, events: ScientificExecutionEvent[], executions: ChemistryBackendExecution[], status: 'FAILED' | 'BLOCKED', reason: string): ChemistryComputationalRun {
  return { liveKind: 'COMPUTATIONAL_LIVE', plan, status, events, executions, session: null, artifact: null, evidence: evidenceFor(status, executions), failureReason: reason };
}

/**
 * Replay of a sealed backend run through the canonical replayExperimentSession:
 * the same shared kinetics graph is re-executed and every sealed output compared.
 */
export function replayComputationalRun(run: ChemistryComputationalRun): ReplayVerdict | null {
  if (!run.session) return null;
  return replayExperimentSession(run.session, arrheniusReplayRunner);
}
