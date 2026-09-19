/* Proprietary / All Rights Reserved - Genesis OS */
export type FlagshipMode = 'SCIENTIFIC' | 'EDUCATIONAL' | 'HISTORICAL_RECONSTRUCTION' | 'COUNTERFACTUAL' | 'SPECULATIVE' | 'FICTIONAL';
export type FlagshipEpistemicStatus = 'REAL_OBSERVATION' | 'VERIFIED_SOURCE' | 'MODEL' | 'SIMULATION' | 'HYPOTHESIS' | 'SPECULATIVE' | 'FICTIONAL' | 'INSUFFICIENT_EVIDENCE' | 'FALSIFIED';

const RANK: Readonly<Record<FlagshipEpistemicStatus, number>> = { REAL_OBSERVATION: 8, VERIFIED_SOURCE: 7, MODEL: 5, SIMULATION: 5, FALSIFIED: 4, HYPOTHESIS: 3, INSUFFICIENT_EVIDENCE: 2, SPECULATIVE: 1, FICTIONAL: 0 };
/** The ceiling a world mode allows; the guard only ever lowers a status. */
export const MODE_CEILING: Readonly<Record<FlagshipMode, FlagshipEpistemicStatus>> = { SCIENTIFIC: 'REAL_OBSERVATION', EDUCATIONAL: 'VERIFIED_SOURCE', HISTORICAL_RECONSTRUCTION: 'MODEL', COUNTERFACTUAL: 'SIMULATION', SPECULATIVE: 'SPECULATIVE', FICTIONAL: 'FICTIONAL' };

export interface EpistemicDecision { readonly requested: FlagshipEpistemicStatus; readonly status: FlagshipEpistemicStatus; readonly allowed: boolean; readonly reason: string; }

/** EPISTEMIC FIREWALL: a speculative or fictional world can never label a claim above its ceiling; nothing here ever raises a status. */
export function guardWorldMode(mode: FlagshipMode, requested: FlagshipEpistemicStatus): EpistemicDecision {
  const ceiling = MODE_CEILING[mode];
  if (RANK[requested] <= RANK[ceiling]) return { requested, status: requested, allowed: true, reason: `${requested} is within the ${mode} ceiling (${ceiling})` };
  return { requested, status: ceiling, allowed: false, reason: `${mode} worlds cap claims at ${ceiling}; ${requested} was requested and refused` };
}
export function epistemicRank(s: FlagshipEpistemicStatus): number { return RANK[s]; }
