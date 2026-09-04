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

/**
 * Fingerprint over an entire derived-layer collection (e.g. all `ImpactResult`s
 * or all `DamageAssessment`s produced from one `HazardRun`). `HazardRun`'s own
 * `resultFingerprint` only covers the run's `outputFields` — it says nothing
 * about whether a pure downstream projection of that output (site-by-site
 * impact, or a damage-assessment disclosure) is itself reproducible. Recomputing
 * this fingerprint after a replay and comparing it against the value recorded
 * at construction time is what lets replay catch a derived-layer regression
 * (e.g. an accidentally nondeterministic projection function) that a HazardRun-only
 * MATCH would miss entirely.
 */
export async function computeDerivedLayerFingerprint(records: unknown): Promise<string> {
  return sha256Hex(canonicalJson(records));
}
