import type { EpistemicLabel } from './epistemic';
import type { PhysiologicalState } from './types';
import { seededRandom } from './hash';

export interface PhysiologyInput {
  readonly seed: number;
  readonly timeSeconds: number;
  readonly activity: number;
}

/** Educational deterministic physiology model. It is not a clinical or diagnostic model. */
export function simulatePhysiology(input: PhysiologyInput): PhysiologicalState {
  const rnd = seededRandom(input.seed);
  const circadian = Math.sin(input.timeSeconds / 1800);
  const activity = Math.max(0, Math.min(1, input.activity));
  const heartRateBpm = 62 + activity * 48 + circadian * 3 + (rnd() - 0.5) * 2;
  const respiratoryRatePerMin = 12 + activity * 10 + circadian * 1.5;
  const oxygenSaturationPercent = 98.2 - activity * 0.4 + (rnd() - 0.5) * 0.2;
  const systolic = 112 + activity * 18 + (rnd() - 0.5) * 3;
  const diastolic = 72 + activity * 10 + (rnd() - 0.5) * 2;
  const bodyTemperatureC = 36.7 + circadian * 0.15;
  const cerebralPerfusionIndex = Math.max(0, Math.min(1, 0.76 + activity * 0.05));
  return {
    heartRateBpm,
    respiratoryRatePerMin,
    oxygenSaturationPercent,
    bloodPressureMmHg: { systolic, diastolic },
    bodyTemperatureC,
    cerebralPerfusionIndex,
    stateLabel: 'SIMULATION' as EpistemicLabel,
  };
}

export function describePhysiology(state: PhysiologicalState): readonly string[] {
  return [
    `Heart rate ${state.heartRateBpm.toFixed(1)} bpm`,
    `Respiratory rate ${state.respiratoryRatePerMin.toFixed(1)}/min`,
    `SpO₂ ${state.oxygenSaturationPercent.toFixed(1)}%`,
    `Blood pressure ${state.bloodPressureMmHg.systolic.toFixed(0)}/${state.bloodPressureMmHg.diastolic.toFixed(0)} mmHg`,
    `Body temperature ${state.bodyTemperatureC.toFixed(2)} °C`,
    `Cerebral perfusion index ${state.cerebralPerfusionIndex.toFixed(3)}`,
  ];
}
