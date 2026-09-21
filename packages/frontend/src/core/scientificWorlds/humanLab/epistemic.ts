/**
 * GENESIS SCIENTIFIC WORLDS — epistemic firewall.
 * This module contains classification only. It never upgrades evidence.
 */

export type EpistemicLabel =
  | 'REAL_OBSERVATION'
  | 'VERIFIED_SOURCE'
  | 'MODEL'
  | 'SIMULATION'
  | 'RECONSTRUCTION'
  | 'HYPOTHESIS'
  | 'SPECULATIVE'
  | 'FICTION_INSPIRED'
  | 'NOT_MODELED'
  | 'INSUFFICIENT_EVIDENCE';

export const EPISTEMIC_LABELS = [
  'REAL_OBSERVATION',
  'VERIFIED_SOURCE',
  'MODEL',
  'SIMULATION',
  'RECONSTRUCTION',
  'HYPOTHESIS',
  'SPECULATIVE',
  'FICTION_INSPIRED',
  'NOT_MODELED',
  'INSUFFICIENT_EVIDENCE',
] as const satisfies readonly EpistemicLabel[];

export interface EpistemicValue<T = unknown> {
  readonly value: T;
  readonly label: EpistemicLabel;
  readonly reason?: string;
  readonly sourceIds: readonly string[];
  readonly contentHash?: string;
}

export function isEpistemicallyActionable(label: EpistemicLabel): boolean {
  return label !== 'NOT_MODELED' && label !== 'INSUFFICIENT_EVIDENCE';
}

export function assertNoTruthUpgrade(from: EpistemicLabel, to: EpistemicLabel): void {
  const blocked = new Set<string>([
    'SIMULATION:REAL_OBSERVATION',
    'SIMULATION:VERIFIED_SOURCE',
    'MODEL:REAL_OBSERVATION',
    'MODEL:VERIFIED_SOURCE',
    'HYPOTHESIS:REAL_OBSERVATION',
    'HYPOTHESIS:VERIFIED_SOURCE',
    'SPECULATIVE:REAL_OBSERVATION',
    'SPECULATIVE:VERIFIED_SOURCE',
    'FICTION_INSPIRED:REAL_OBSERVATION',
    'FICTION_INSPIRED:VERIFIED_SOURCE',
    'RECONSTRUCTION:REAL_OBSERVATION',
    'RECONSTRUCTION:VERIFIED_SOURCE',
  ]);
  if (blocked.has(`${from}:${to}`)) {
    throw new Error(`EPISTEMIC_UPGRADE_FORBIDDEN:${from}->${to}`);
  }
}
