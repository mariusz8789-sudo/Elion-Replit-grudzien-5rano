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

/**
 * PROMOTION FIREWALL ACROSS GENESIS'S STATUS VOCABULARIES. Genesis has several
 * status vocabularies (this file's labels, `twinContext.ts`'s REAL_MEASUREMENT /
 * NOT_VALIDATED, `experimentGraph.ts`'s MODEL_ESTIMATE / UNKNOWN,
 * `discoveryContracts.ts`'s CONFIRMED, `proofLadder.ts`'s C_VALIDATED, ...). This
 * adds no new vocabulary: it names, by their existing spellings, the statuses that
 * assert a measured, validated or confirmed fact, and refuses to let any other
 * status become one of them unless a real measurement or laboratory result is
 * attached.
 *
 * Three things are deliberately NOT a basis for promotion:
 *   - a replay MATCH: the computation reproduced, which says nothing about whether
 *     the claim is true in the world;
 *   - a valid signature (CSRN or `core/integrity`): the evidence was not altered
 *     since signing, which says nothing about laboratory validation;
 *   - agreement between models.
 */
export const EARNED_ONLY_STATUSES: ReadonlySet<string> = new Set([
  'REAL_OBSERVATION',
  'VERIFIED_SOURCE',
  'REAL_MEASUREMENT',
  'REAL_EXPERIMENTAL',
  'MEASURED',
  'OBSERVED',
  'FACT',
  'VALIDATED',
  'C_VALIDATED',
  'CONFIRMED',
]);

export type PromotionBasis =
  | { readonly kind: 'EXTERNAL_MEASUREMENT' | 'LABORATORY_VALIDATION'; readonly sourceId: string; readonly sha256: string }
  | { readonly kind: 'REPLAY_MATCH' | 'VALID_SIGNATURE' | 'MODEL_AGREEMENT' };

const NOT_A_BASIS: Readonly<Record<string, string>> = {
  REPLAY_MATCH: 'a replay MATCH shows the computation reproduced, not that the claim is true',
  VALID_SIGNATURE: 'a valid signature shows the evidence was not altered, not that it was validated in a laboratory',
  MODEL_AGREEMENT: 'agreement between models is still a model result, not a measurement',
};

/**
 * Throws `EPISTEMIC_PROMOTION_UNEARNED` when `from` would become a measured /
 * validated / confirmed status without a qualifying basis: a real measurement or
 * laboratory record, identified by a source id and the SHA-256 of its content.
 * Moves that do not enter such a status (lateral moves, downgrades) pass.
 */
export function assertPromotionEarned(from: string, to: string, basis: PromotionBasis | null): void {
  if (from === to || !EARNED_ONLY_STATUSES.has(to)) return;
  if (basis === null) {
    throw new Error(`EPISTEMIC_PROMOTION_UNEARNED:${from}->${to}: no measurement or laboratory record attached`);
  }
  if (basis.kind !== 'EXTERNAL_MEASUREMENT' && basis.kind !== 'LABORATORY_VALIDATION') {
    throw new Error(`EPISTEMIC_PROMOTION_UNEARNED:${from}->${to}: ${NOT_A_BASIS[basis.kind] ?? `${String(basis.kind)} is not a basis`}`);
  }
  if (basis.sourceId.trim() === '' || !/^[a-f0-9]{64}$/.test(basis.sha256)) {
    throw new Error(`EPISTEMIC_PROMOTION_UNEARNED:${from}->${to}: the ${basis.kind} record needs a source id and the SHA-256 of its content`);
  }
}
