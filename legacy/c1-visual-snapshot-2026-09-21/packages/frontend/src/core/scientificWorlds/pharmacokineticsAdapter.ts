import { simulatePhysiology } from './humanLab/physiology';
import type { DockingResult } from '@genesis/core/chemistry/moleculeDockingEngine.js';

/**
 * SCIENTIFIC WORLDS — PHARMACOKINETICS ADAPTER (D-137).
 *
 * There is no `AnatomySession` type anywhere in this repository (checked
 * before writing this file). The real, existing seam for physiological state
 * is `humanLab/physiology.ts`'s `simulatePhysiology` — the same deterministic,
 * seeded model `biologyRunners.ts`'s `physiology-state` experiment already
 * uses. This adapter reuses it directly rather than inventing a second
 * physiology model: a one-compartment first-order PK profile whose
 * absorption/elimination parameters are DERIVED from that real physiological
 * state (perfusion, body temperature) and from a real `DockingResult`'s
 * affinity proxy (stronger illustrative binding -> slower proxy elimination).
 *
 * Deterministic: `simulatePhysiology` is seeded (`seededRandom`, not
 * `Math.random()`); nothing here calls `Date.now()`. Educational/illustrative
 * model only — `epistemic: 'MODEL'`, never a clinical dosing recommendation.
 */

export interface PkSeriesPoint {
  readonly tHours: number;
  readonly concentrationMgL: number;
}

export interface PhysiologyUsed {
  readonly heartRateBpm: number;
  readonly bodyTemperatureC: number;
  readonly cerebralPerfusionIndex: number;
}

export interface PharmacokineticsProfile {
  readonly doseMg: number;
  readonly absorptionRateKaPerHour: number;
  readonly eliminationRateKePerHour: number;
  readonly volumeOfDistributionL: number;
  readonly halfLifeHours: number;
  readonly cMaxProxyMgL: number;
  readonly tMaxHoursApprox: number;
  readonly series: readonly PkSeriesPoint[];
  readonly physiologyUsed: PhysiologyUsed;
  readonly epistemic: 'MODEL';
}

export interface PharmacokineticsInput {
  readonly dockingResult: DockingResult;
  readonly seed: number;
  readonly timeSeconds: number;
  readonly activity: number;
  readonly doseMg?: number;
}

const SERIES_POINTS = 12;

/** One-compartment, first-order oral absorption/elimination PK model with deterministic, physiology- and affinity-derived parameters. */
export function computePharmacokinetics(input: PharmacokineticsInput): PharmacokineticsProfile {
  const state = simulatePhysiology({ seed: input.seed, timeSeconds: input.timeSeconds, activity: Math.min(1, Math.max(0, input.activity)) });
  const doseMg = input.doseMg && Number.isFinite(input.doseMg) && input.doseMg > 0 ? input.doseMg : 100;

  const perfusion = Math.min(1, Math.max(0, state.cerebralPerfusionIndex));
  const affinityMagnitude = Math.abs(input.dockingResult.affinityProxyKcalMol);
  const metabolicRate = 1 + (state.bodyTemperatureC - 36.7) * 0.5;
  const targetEngagementDamping = Math.max(0.15, 1 - Math.min(0.8, affinityMagnitude / 12));

  const absorptionRateKaPerHour = 0.35 + perfusion * 0.9;
  let eliminationRateKePerHour = Math.max(0.02, 0.25 * metabolicRate * targetEngagementDamping);
  if (Math.abs(absorptionRateKaPerHour - eliminationRateKePerHour) < 1e-6) eliminationRateKePerHour -= 1e-4;
  const volumeOfDistributionL = 30 + (1 - perfusion) * 20;

  const halfLifeHours = Math.log(2) / eliminationRateKePerHour;
  const tMaxHoursApprox = Math.log(absorptionRateKaPerHour / eliminationRateKePerHour) / (absorptionRateKaPerHour - eliminationRateKePerHour);

  const series: PkSeriesPoint[] = [];
  let cMaxProxyMgL = 0;
  const horizonHours = Math.max(1, halfLifeHours * 4);
  for (let i = 0; i <= SERIES_POINTS; i++) {
    const t = (i / SERIES_POINTS) * horizonHours;
    const concentration = (doseMg * absorptionRateKaPerHour) / (volumeOfDistributionL * (absorptionRateKaPerHour - eliminationRateKePerHour))
      * (Math.exp(-eliminationRateKePerHour * t) - Math.exp(-absorptionRateKaPerHour * t));
    const concentrationMgL = Math.max(0, concentration);
    if (concentrationMgL > cMaxProxyMgL) cMaxProxyMgL = concentrationMgL;
    series.push({ tHours: +t.toFixed(3), concentrationMgL: +concentrationMgL.toFixed(4) });
  }

  return {
    doseMg,
    absorptionRateKaPerHour: +absorptionRateKaPerHour.toFixed(4),
    eliminationRateKePerHour: +eliminationRateKePerHour.toFixed(4),
    volumeOfDistributionL: +volumeOfDistributionL.toFixed(2),
    halfLifeHours: +halfLifeHours.toFixed(3),
    cMaxProxyMgL: +cMaxProxyMgL.toFixed(4),
    tMaxHoursApprox: +tMaxHoursApprox.toFixed(3),
    series,
    physiologyUsed: { heartRateBpm: +state.heartRateBpm.toFixed(1), bodyTemperatureC: +state.bodyTemperatureC.toFixed(2), cerebralPerfusionIndex: +state.cerebralPerfusionIndex.toFixed(3) },
    epistemic: 'MODEL',
  };
}
