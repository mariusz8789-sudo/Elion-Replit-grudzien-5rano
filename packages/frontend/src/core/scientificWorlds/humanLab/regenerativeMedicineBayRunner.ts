import type { ExperimentRunResult, SessionInputs } from '../experimentSession';
import {
  isRegenerativeBayExperiment,
  protocolFor,
  type InterventionScenario,
  type RegenerativeBayArtifact,
  type RegenerativeBayInputs,
} from './regenerativeMedicineBay';

/** Deterministic tiny PRNG; this is a model utility, not a biological random source. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function scenarioMultiplier(scenario: InterventionScenario): number {
  switch (scenario) {
    case 'PERFUSION_SUPPORT_MODEL': return 1.08;
    case 'REGENERATIVE_SIGNAL_MODEL': return 1.05;
    case 'TARGETED_REPAIR_MODEL': return 1.11;
    case 'NO_INTERVENTION': return 1;
  }
}

function scenarioRepairGain(scenario: InterventionScenario): number {
  switch (scenario) {
    case 'PERFUSION_SUPPORT_MODEL': return 0.012;
    case 'REGENERATIVE_SIGNAL_MODEL': return 0.015;
    case 'TARGETED_REPAIR_MODEL': return 0.022;
    case 'NO_INTERVENTION': return 0.006;
  }
}

/**
 * Deterministic simulation runner for the new bay.
 *
 * It intentionally produces MODEL/SIMULATION outputs only. It must never be
 * presented as measured clinical physiology or a treatment recommendation.
 */
export function runRegenerativeBayExperiment(
  experimentId: string,
  seed: number,
  inputs: SessionInputs,
): ExperimentRunResult<RegenerativeBayArtifact> {
  if (!Number.isInteger(seed) || seed < 0) throw new Error('regenerative bay seed must be a non-negative integer');
  if (!isRegenerativeBayExperiment(experimentId)) throw new Error(`unknown regenerative experiment: ${experimentId}`);

  const p = protocolFor(experimentId);
  if (!p) throw new Error(`missing protocol for ${experimentId}`);

  const i = inputs as RegenerativeBayInputs;
  const rand = mulberry32(seed);
  const subjectId = typeof i.subjectId === 'string' && i.subjectId.trim() ? i.subjectId : 'subject:simulation-001';
  const scenario: InterventionScenario = i.intervention ?? (experimentId === 'regenerative-baseline' ? 'NO_INTERVENTION' : 'TARGETED_REPAIR_MODEL');
  const ticks = clamp(Math.round(i.horizonTicks ?? 24), 4, 120);

  const heartRateBpm = clamp(i.baselineHeartRateBpm ?? 72, 35, 180);
  const respiratoryRatePerMin = clamp(i.baselineRespiratoryRatePerMin ?? 15, 5, 40);
  const spo2Percent = clamp(i.baselineSpo2Percent ?? 98, 70, 100);
  const temperatureC = clamp(i.baselineTemperatureC ?? 36.7, 34, 41);

  let perfusion = clamp(0.78 + (rand() - 0.5) * 0.04, 0, 1);
  let tissueOxygen = clamp(0.76 + (rand() - 0.5) * 0.04, 0, 1);
  let repair = 0.2;
  // FIX ON INTEGRATION: `RegenerativeBayArtifact['trajectory']` is `readonly {...}[]` (the public
  // contract), but this repo's stricter tsconfig (unlike wherever the package was authored) rejects
  // `.push()` on a variable typed from a readonly array type even before any assignment — a mutable
  // element-array type here, assigned into the readonly field on return below, compiles the same way
  // every other artifact builder in this codebase already does it.
  const trajectory: RegenerativeBayArtifact['trajectory'][number][] = [];
  const gain = scenarioRepairGain(scenario);
  const multiplier = scenarioMultiplier(scenario);

  for (let tick = 0; tick <= ticks; tick += 1) {
    const perturbation = (rand() - 0.5) * 0.008;
    perfusion = clamp(perfusion + ((0.8 * multiplier - perfusion) * 0.12) + perturbation, 0, 1);
    tissueOxygen = clamp(tissueOxygen + ((perfusion * 0.96 - tissueOxygen) * 0.16), 0, 1);
    repair = clamp(repair + gain * (0.35 + tissueOxygen * 0.65), 0, 1);
    trajectory.push({
      tick,
      perfusionProxy: Number(perfusion.toFixed(6)),
      tissueOxygenProxy: Number(tissueOxygen.toFixed(6)),
      repairIndex: Number(repair.toFixed(6)),
    });
  }

  const final = trajectory[trajectory.length - 1];
  const outputs = {
    finalPerfusionProxy: final.perfusionProxy,
    finalTissueOxygenProxy: final.tissueOxygenProxy,
    repairIndex: final.repairIndex,
    scenario,
    subjectId,
  };

  return {
    outputs,
    evidenceHashes: [],
    epistemicStatus: experimentId === 'regenerative-baseline' || experimentId === 'biosignal-fusion' ? 'SIMULATION' : 'MODEL',
    engineLabel: `GENESIS_REGENERATIVE_BAY_${experimentId.toUpperCase()}`,
    steps: p.steps,
    artifact: {
      type: 'REGENERATIVE_BAY_ARTIFACT',
      subjectId,
      baseline: {
        heartRateBpm,
        respiratoryRatePerMin,
        spo2Percent,
        temperatureC,
        perfusionProxy: Number((trajectory[0]?.perfusionProxy ?? perfusion).toFixed(6)),
        tissueOxygenProxy: Number((trajectory[0]?.tissueOxygenProxy ?? tissueOxygen).toFixed(6)),
      },
      scenario,
      trajectory,
      limitations: [
        'SIMULATION_ONLY: outputs are generated by a deterministic model, not a clinical measurement.',
        'No diagnostic claim is made.',
        'No treatment recommendation is generated.',
        'External clinical datasets must be provenance-checked by the host before entering the real-data boundary.',
      ],
    },
  };
}

export const regenerativeBayExperimentRunner = runRegenerativeBayExperiment;
