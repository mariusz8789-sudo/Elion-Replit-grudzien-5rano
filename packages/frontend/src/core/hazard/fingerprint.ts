/**
 * PHASE 0 — HAZARD FINGERPRINTS.
 *
 * Deliberately built on the two hashing primitives Genesis already has
 * rather than a third one: `canonicalJson` (core/events/hash.ts, recursive
 * key-sorted JSON — the same determinism guarantee the epidemic replay
 * system already depends on) and `sha256Hex` (core/discovery/evidenceCrypto.ts,
 * real Web Crypto SHA-256). No new hashing algorithm is introduced.
 */
import { canonicalJson } from '../events/hash';
import { sha256Hex } from '../discovery/evidenceCrypto';

/** SHA-256 of a raw artifact payload — becomes `SourceArtifact.contentHash`. */
export async function computeSourceArtifactContentHash(rawContent: string): Promise<string> {
  return sha256Hex(rawContent);
}

/**
 * Fingerprint for `HazardInput`. Intentionally takes only scientific fields
 * plus the artifact it references and the seed — never `displayName` — so a
 * cosmetic rename can never change what replay compares.
 */
export async function computeHazardInputFingerprint(input: {
  readonly hazardType: string;
  readonly sourceArtifactContentHash: string;
  readonly scientificFields: unknown;
  readonly seed: number | string | null;
}): Promise<string> {
  return sha256Hex(canonicalJson({
    hazardType: input.hazardType,
    sourceArtifactContentHash: input.sourceArtifactContentHash,
    scientificFields: input.scientificFields,
    seed: input.seed,
  }));
}

/** Fingerprint for `HazardRun`. Ties the output to the exact input + module + build it came from. */
export async function computeHazardRunResultFingerprint(input: {
  readonly hazardInputId: string;
  readonly hazardModuleVersion: string;
  readonly codeCommitHash: string;
  readonly outputFields: unknown;
}): Promise<string> {
  return sha256Hex(canonicalJson({
    hazardInputId: input.hazardInputId,
    hazardModuleVersion: input.hazardModuleVersion,
    codeCommitHash: input.codeCommitHash,
    outputFields: input.outputFields,
  }));
}
