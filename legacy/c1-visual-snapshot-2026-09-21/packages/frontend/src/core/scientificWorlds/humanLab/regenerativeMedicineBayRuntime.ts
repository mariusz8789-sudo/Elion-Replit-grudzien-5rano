import type { RegenerativeBayArtifact, BiomedicalSensorSpec, InterventionScenario } from './regenerativeMedicineBay';
import { REGENERATIVE_BAY_SENSORS } from './regenerativeMedicineBay';

export type BayRuntimePhase = 'IDLE' | 'PRECHECK' | 'ACQUIRE' | 'SCAN' | 'INTERVENE_MODEL' | 'OBSERVE' | 'COMPLETE' | 'BLOCKED';

export interface RegenerativeBayHumanTwinLink {
  readonly twinId: string;
  readonly linked: boolean;
  readonly selectedNodeId?: string;
  readonly mode: 'OBSERVATION_MODEL' | 'SIMULATION_MODEL';
}

export interface RegenerativeBaySensorValue {
  readonly sensorId: string;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly epistemic: 'MODEL' | 'SIMULATION';
}

export interface RegenerativeBayRuntimeState {
  readonly phase: BayRuntimePhase;
  readonly logicalTick: number;
  readonly progress: number;
  readonly subjectId: string;
  readonly twin: RegenerativeBayHumanTwinLink;
  readonly sensors: readonly RegenerativeBaySensorValue[];
  readonly scenario: InterventionScenario;
  readonly lastArtifact?: RegenerativeBayArtifact;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function createInitialRegenerativeBayRuntime(subjectId = 'subject:simulation-001', twinId = 'human-twin'): RegenerativeBayRuntimeState {
  const sensors: RegenerativeBaySensorValue[] = REGENERATIVE_BAY_SENSORS.map((s) => ({
    sensorId: s.id,
    label: s.label,
    unit: s.unit,
    value: s.signal === 'ECG' ? 72 : s.signal === 'RESPIRATION' ? 15 : s.signal === 'SPO2' ? 98 : s.signal === 'TEMPERATURE' ? 36.7 : 0.78,
    epistemic: s.epistemic === 'MODEL' ? 'MODEL' : 'SIMULATION',
  }));
  return {
    phase: 'IDLE', logicalTick: 0, progress: 0, subjectId,
    twin: { twinId, linked: true, mode: 'SIMULATION_MODEL' },
    sensors, scenario: 'NO_INTERVENTION',
  };
}

export function setRegenerativeBayPhase(state: RegenerativeBayRuntimeState, phase: BayRuntimePhase): RegenerativeBayRuntimeState {
  return { ...state, phase, progress: phase === 'COMPLETE' ? 1 : state.progress };
}

export function stepRegenerativeBayRuntime(state: RegenerativeBayRuntimeState, ticks = 1): RegenerativeBayRuntimeState {
  const nextTick = state.logicalTick + Math.max(0, Math.floor(ticks));
  const progress = clamp(state.progress + Math.max(0, ticks) * 0.05, 0, 1);
  const sensors = state.sensors.map((s) => {
    const wave = Math.sin((nextTick + s.sensorId.length) * 0.37);
    if (s.sensorId === 'sensor:ecg') return { ...s, value: Number((72 + wave * 2.5).toFixed(3)) };
    if (s.sensorId === 'sensor:respiration') return { ...s, value: Number((15 + wave * 0.8).toFixed(3)) };
    if (s.sensorId === 'sensor:spo2') return { ...s, value: Number((98 + wave * 0.12).toFixed(3)) };
    if (s.sensorId === 'sensor:temperature') return { ...s, value: Number((36.7 + wave * 0.03).toFixed(4)) };
    if (s.sensorId === 'sensor:perfusion') return { ...s, value: Number((0.78 + wave * 0.02).toFixed(5)) };
    return { ...s, value: Number((0.76 + wave * 0.02).toFixed(5)) };
  });
  return { ...state, logicalTick: nextTick, progress, sensors };
}

export function bindRegenerativeBayArtifact(state: RegenerativeBayRuntimeState, artifact: RegenerativeBayArtifact): RegenerativeBayRuntimeState {
  const scenario = artifact.scenario;
  const final = artifact.trajectory[artifact.trajectory.length - 1];
  const sensors = state.sensors.map((s) => {
    if (s.sensorId === 'sensor:perfusion') return { ...s, value: final?.perfusionProxy ?? s.value };
    if (s.sensorId === 'sensor:tissue-oxygen') return { ...s, value: final?.tissueOxygenProxy ?? s.value };
    return s;
  });
  return { ...state, scenario, sensors, lastArtifact: artifact, phase: 'COMPLETE', progress: 1 };
}

export function sensorSpec(id: string): BiomedicalSensorSpec | null {
  return REGENERATIVE_BAY_SENSORS.find((x) => x.id === id) ?? null;
}
