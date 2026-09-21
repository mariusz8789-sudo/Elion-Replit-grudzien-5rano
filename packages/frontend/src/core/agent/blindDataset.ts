import { canonicalJson, fnv1a } from '../events/hash';

/**
 * BlindDataset (Phase G, Proof Ladder blind-access enforcement).
 *
 * WHY THIS IS GENUINELY NEW (confirmed by audit before writing a line).
 * `discoveryReplicationEngine.ts::assertFreezePrecedesDataset` already throws
 * on backwards ordering — but only if a caller happens to invoke that
 * specific function with both objects. Nothing stops a caller from reading
 * `replicationDataset.points` directly, skipping the check entirely.
 * `differentiatingExperimentGenerator.ts` freezes its decision rule by
 * construction (no parameter exists to leak an observed value into it) —
 * a real guarantee, but structural, not an object a caller can be handed and
 * denied access to. Neither is what the design calls for: "a data-access
 * layer that THROWS if code tries to read a held-out/blind dataset before a
 * freeze token has been produced." This module IS that layer: the data
 * itself is unreachable except through `.read(freezeToken)`, and presenting
 * the wrong token — or none — throws. There is no way to get at `T` other
 * than the guarded accessor.
 *
 * TWO SEPARATE ORDERING CHECKS, BOTH REAL THROWS:
 *  1. AT CONSTRUCTION: the freeze itself must predate the dataset's own
 *     retrieval. A `BlindDataset` built from a freeze minted AFTER (or at
 *     the same instant as) the data was fetched can never legitimately
 *     exist — constructing it throws immediately, before any read is even
 *     attempted.
 *  2. AT READ: the exact freeze token minted for this dataset must be
 *     presented. A token from a different freeze, or no token, is refused.
 *
 * `mintFreezeToken` fingerprints whatever was frozen (a hypothesis, a
 * decision rule, the full set of analytical choices — the caller decides
 * what "frozen" means for their claim) BEFORE the blind dataset exists, so
 * the token itself is proof that content existed before this data did.
 */

export const BLIND_DATASET_CONTRACT_VERSION = '1.0.0';

export interface FreezeRecord {
  readonly freezeToken: string;
  readonly frozenAt: number;
  readonly frozenFingerprint: string;
}

/** `frozenContent` is whatever must be fixed before the blind data may be touched — a hypothesis, a decision rule, a full analysis plan. */
export function mintFreezeToken(frozenAt: number, frozenContent: unknown): FreezeRecord {
  const frozenFingerprint = fnv1a(canonicalJson(frozenContent));
  return { freezeToken: fnv1a(canonicalJson({ frozenAt, frozenFingerprint })), frozenAt, frozenFingerprint };
}

export interface DatasetCustody {
  readonly source: string;
  readonly url: string;
  readonly sha256: string;
}

export interface BlindDataset<T> {
  readonly datasetId: string;
  readonly retrievedAt: number;
  readonly custody: DatasetCustody;
  readonly freezeToken: string;
  /** The ONLY way to reach the data. Throws unless `freezeToken` matches exactly. */
  read(freezeToken: string): T;
}

export interface CreateBlindDatasetInput<T> {
  readonly datasetId: string;
  readonly retrievedAt: number;
  readonly data: T;
  readonly freeze: FreezeRecord;
  readonly custody: DatasetCustody;
}

export function createBlindDataset<T>(input: CreateBlindDatasetInput<T>): BlindDataset<T> {
  if (input.freeze.frozenAt >= input.retrievedAt) {
    throw new Error(
      `blindDataset: refusing to construct "${input.datasetId}" — the freeze was minted at ${input.freeze.frozenAt}, `
      + `at or after this dataset was retrieved at ${input.retrievedAt}. A freeze must precede the blind data it protects; `
      + 'this dataset cannot legitimately exist with this freeze.',
    );
  }
  return {
    datasetId: input.datasetId,
    retrievedAt: input.retrievedAt,
    custody: input.custody,
    freezeToken: input.freeze.freezeToken,
    read(freezeToken: string): T {
      if (freezeToken !== input.freeze.freezeToken) {
        throw new Error(
          `blindDataset: refusing to release "${input.datasetId}" — the freeze token presented does not match the one `
          + 'this dataset was sealed against. This is the access-layer guard, not a convention: nothing can read this '
          + 'data without proving the freeze it was sealed to came first.',
        );
      }
      return input.data;
    },
  };
}
