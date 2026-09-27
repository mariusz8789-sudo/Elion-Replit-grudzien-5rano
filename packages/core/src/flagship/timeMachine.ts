/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';
// Reproduced locally (not imported from GenesisCosmicTimeMachineEngine.ts) so this frontend-reachable
// module never pulls in that engine's `node:crypto` import — Vite cannot bundle it for the browser.
const FICTION_DISCLAIMER = '[DISCLAIMER] Fikcja / symulacja syntetyczna (SYNTHETIC_CINEMATIC). To nie jest nagranie z przyszłości ani realne miejsce.';
import type { FlagshipEpistemicStatus } from './epistemicGuard.js';

/**
 * TIME MACHINE LAB (D-130) — three modes that share one engine and never mix
 * their truth status. SCIENTIFIC_MODEL computes only what relativity supports
 * (clock comparison: special-relativistic and weak-field gravitational rates,
 * SI constants) and refuses anything else with a named reason;
 * SPECULATIVE_PHYSICS requires the assumptions written down and is labelled
 * SPECULATIVE; FICTIONAL_UNIVERSE makes no claim and carries the existing
 * fiction disclaimer. No mode ever produces a REAL_OBSERVATION.
 */
export type TimeMachineMode = 'SCIENTIFIC_MODEL' | 'SPECULATIVE_PHYSICS' | 'FICTIONAL_UNIVERSE';
export const C_M_PER_S = 299_792_458; export const G_SI = 6.67430e-11;

export interface ClockComparisonInput { readonly kind: 'CLOCK_COMPARISON'; readonly relativeSpeedMps: number; readonly gravitationalMassKg: number; readonly radiusM: number; readonly referenceRadiusM: number; readonly coordinateSeconds: number; }
export interface ClockComparisonResult { readonly lorentzGamma: number; readonly kinematicRateRatio: number; readonly gravitationalRateRatio: number; readonly properSecondsMoving: number; readonly properSecondsAtReference: number; readonly differenceSeconds: number; readonly regime: 'WEAK_FIELD' | 'OUT_OF_MODEL'; }

export interface TimeMachineScenario {
  readonly scenarioId: string; readonly mode: TimeMachineMode; readonly targetTimeLabel: string; readonly assumptions: readonly string[]; readonly limitations: readonly string[];
  readonly epistemicStatus: FlagshipEpistemicStatus; readonly computation: ClockComparisonResult | null; readonly refusal: string | null; readonly disclaimer: string | null; readonly fingerprint: string;
}

export function clockComparison(i: Omit<ClockComparisonInput, 'kind'>): ClockComparisonResult {
  const beta = Math.abs(i.relativeSpeedMps) / C_M_PER_S;
  if (beta >= 1) throw new Error('SPEED_MUST_BE_BELOW_C');
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const rs = (2 * G_SI * i.gravitationalMassKg) / (C_M_PER_S * C_M_PER_S);
  const weak = i.radiusM > 20 * rs && i.referenceRadiusM > 20 * rs;
  const rate = (r: number): number => Math.sqrt(Math.max(0, 1 - rs / r));
  const gRatio = rate(i.radiusM) / rate(i.referenceRadiusM);
  const moving = i.coordinateSeconds * (1 / gamma) * rate(i.radiusM); const ref = i.coordinateSeconds * rate(i.referenceRadiusM);
  return { lorentzGamma: gamma, kinematicRateRatio: 1 / gamma, gravitationalRateRatio: gRatio, properSecondsMoving: moving, properSecondsAtReference: ref, differenceSeconds: moving - ref, regime: weak ? 'WEAK_FIELD' : 'OUT_OF_MODEL' };
}

export function configureTimeMachine(input: { readonly sessionId: string; readonly mode: TimeMachineMode; readonly targetTimeLabel: string; readonly assumptions: readonly string[]; readonly request?: ClockComparisonInput }): TimeMachineScenario {
  const id = `time:${sha256hex(`${input.sessionId}|${input.mode}|${input.targetTimeLabel}`).slice(0, 12)}`;
  const base = { scenarioId: id, mode: input.mode, targetTimeLabel: input.targetTimeLabel, assumptions: [...input.assumptions] };
  const seal = (s: Omit<TimeMachineScenario, 'fingerprint'>): TimeMachineScenario => ({ ...s, fingerprint: sha256hex(stableStringify(s)) });
  if (input.mode === 'FICTIONAL_UNIVERSE') return seal({ ...base, limitations: ['no scientific claim; cinematic world state only'], epistemicStatus: 'FICTIONAL', computation: null, refusal: null, disclaimer: FICTION_DISCLAIMER });
  if (input.mode === 'SPECULATIVE_PHYSICS') {
    if (!input.assumptions.length) return seal({ ...base, limitations: [], epistemicStatus: 'SPECULATIVE', computation: null, refusal: 'SPECULATIVE_PHYSICS_REQUIRES_EXPLICIT_ASSUMPTIONS', disclaimer: null });
    return seal({ ...base, limitations: ['assumptions are declared, not established; unknown parameters carry no uncertainty bounds'], epistemicStatus: 'SPECULATIVE', computation: null, refusal: null, disclaimer: null });
  }
  if (!input.request) return seal({ ...base, limitations: ['scientific mode computes only supported clock comparisons'], epistemicStatus: 'MODEL', computation: null, refusal: 'UNSUPPORTED_CALCULATION: only CLOCK_COMPARISON is modelled; travel to the past is not', disclaimer: null });
  try {
    const c = clockComparison(input.request);
    return seal({ ...base, limitations: ['special relativity + weak-field Schwarzschild rate; no acceleration phases, no strong field', c.regime === 'OUT_OF_MODEL' ? 'radius within 20 r_s: the weak-field rate is not trustworthy here' : 'weak-field regime'], epistemicStatus: 'MODEL', computation: c, refusal: null, disclaimer: null });
  } catch (e) { return seal({ ...base, limitations: [], epistemicStatus: 'MODEL', computation: null, refusal: (e as Error).message, disclaimer: null }); }
}
