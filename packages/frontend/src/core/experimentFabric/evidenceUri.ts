/**
 * `evidence://` URI — an addressing format over `ScientificEvidencePack`
 * (`evidencePack.ts`), not a resolution service. This module only encodes
 * and decodes the identifier; it never fetches, stores, or resolves
 * anything over a network.
 *
 * RECONCILIATION AGAINST QWEN'S SPEC PROPOSAL (2026-09), decided here rather
 * than guessed at implementation time:
 *
 * 1. FIELD NAMES: the spec proposed `packId`/`chainId`. Genesis's real
 *    fields (`ScientificEvidencePack.evidencePackId` /
 *    `.evidenceChainId`, `pack_<fnv1a-hash>` format) are used VERBATIM
 *    instead of aliased short names. An alias layer would translate
 *    between two names for the same thing with nothing else in the
 *    codebase ever using the short form — that is indirection with no
 *    reader benefit, and it is exactly the kind of drift a URI meant to be
 *    self-documenting against the real schema should not introduce.
 *
 * 2. AUTHORITY: the spec proposed `evidence://<authority>/...` for
 *    multi-instance / cross-domain federation (`[domain.]instance-id`).
 *    Genesis is single-instance today — no federation, no cross-lab
 *    resolution exists anywhere in this codebase (confirmed: zero hits for
 *    "federat" across `core/`). Encoding a field that names a concept with
 *    no real backing would be exactly the "zgadywanie" this project's
 *    standing rule forbids. DROPPED from v1. `EVIDENCE_URI_VERSION` exists
 *    so a v2 that adds real federation later is a new, explicit version,
 *    not a silent reinterpretation of v1 URIs already saved anywhere.
 *
 * 3. QUERY PARAMETERS (`domain`, `replay`, `capsule`): none of `domain`
 *    (Genesis has no per-evidence domain tag distinct from the lab/protocol
 *    already on the record), `replay`, or `capsule` (no "replay capsule"
 *    concept exists in this codebase — replay here means re-executing a
 *    saved investigation via `replaySaved*` functions in `scienceMemory.ts`,
 *    keyed by the SAME `evidencePackId`/`evidenceChainId`, not a separate
 *    capsule id) map to anything real. DROPPED from v1 for the same reason
 *    as authority.
 *
 * What v1 keeps: exactly the two fields every `ScientificEvidencePack`
 * already carries, round-trip stable, nothing invented.
 */

export const EVIDENCE_URI_VERSION = 1;
const SCHEME_PREFIX = 'evidence://';

export interface EvidenceUriFields {
  readonly evidencePackId: string;
  readonly evidenceChainId: string | null;
}

/**
 * `evidence://<evidencePackId>` or `evidence://<evidencePackId>/<evidenceChainId>`.
 * Each segment is percent-encoded independently so a `/` inside an id
 * (never produced by `createScientificEvidencePack` today, but not
 * type-forbidden either) cannot be mistaken for the segment separator.
 */
export function formatEvidenceUri(fields: EvidenceUriFields): string {
  if (fields.evidencePackId.length === 0) throw new Error('evidencePackId nie może być pusty.');
  const packSegment = encodeURIComponent(fields.evidencePackId);
  if (fields.evidenceChainId === null) return `${SCHEME_PREFIX}${packSegment}`;
  return `${SCHEME_PREFIX}${packSegment}/${encodeURIComponent(fields.evidenceChainId)}`;
}

/**
 * Returns `null` on anything that is not a well-formed v1 `evidence://` URI
 * — never throws, and never guesses a partial result out of a malformed
 * input. A caller that needs to know WHY it failed should validate its own
 * input before calling this; this function's contract is round-trip
 * fidelity, not diagnostics.
 */
export function parseEvidenceUri(uri: string): EvidenceUriFields | null {
  if (!uri.startsWith(SCHEME_PREFIX)) return null;
  const rest = uri.slice(SCHEME_PREFIX.length);
  if (rest.length === 0) return null;
  const segments = rest.split('/');
  if (segments.length < 1 || segments.length > 2) return null;
  if (segments.some((segment) => segment.length === 0)) return null;

  let evidencePackId: string;
  let evidenceChainId: string | null;
  try {
    evidencePackId = decodeURIComponent(segments[0]!);
    evidenceChainId = segments.length === 2 ? decodeURIComponent(segments[1]!) : null;
  } catch {
    return null; // malformed percent-encoding — honest null, not a partial guess.
  }
  return { evidencePackId, evidenceChainId };
}
