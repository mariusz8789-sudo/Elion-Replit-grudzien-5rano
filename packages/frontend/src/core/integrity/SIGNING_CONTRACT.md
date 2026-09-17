# The `integrityEnvelope.ts` Signing Contract

**Note added post-reconciliation:** `packages/csrn-reference`, cited several times below as a worked
example, was a duplicate implementation built concurrently with `packages/csrn` (same CSRN v4 spec,
two sessions, same branch). It has been removed; `packages/csrn` is the real, Genesis-integrated
package that shipped (see `packages/frontend/src/core/csrn/genesisCertificateAdapter.ts` and
`packages/frontend/src/__tests__/csrnGenesisIntegration.test.ts`). Every design point below (the
signed-payload/certificate-fingerprint split, JWK vs SPKI public-key format) still applies
verbatim to `packages/csrn` — only the file paths in the citations no longer resolve.

**Audience: C2, integrating CSRN cert:// with real Genesis objects (`evidence://`, `cert://`).**
**Author: C3. Written because C2's integration had not yet landed when this was requested — this
documents the ALREADY-SHIPPED, ALREADY-TESTED contract on its own, so it's ready the moment C2's
code exists to check against it.**

This is not a proposal. Every function and field named below is shipped on `main` as of `3a0d89c9`
and `1bb0fd23`, covered by `packages/frontend/src/__tests__/integrityEnvelope.test.ts` (35 tests,
all passing). If anything here conflicts with a spec someone drafted without running this code, this
file — and the code it describes — wins; the spec is what should be corrected (this is the same rule
already applied once, reconciling Qwen's cert:// draft against this exact module).

## 1. What is signed, exactly

**`signIntegrityEnvelope` signs `envelope.integrityHash`'s UTF-8 bytes. Nothing else.**

```ts
// integrityEnvelope.ts:264-274
export async function signIntegrityEnvelope(envelope: IntegrityEnvelope, keyPair: CryptoKeyPair, signedAt = new Date().toISOString()): Promise<SignedIntegrityEnvelope> {
  const hashBytes = new TextEncoder().encode(envelope.integrityHash);
  const signatureBuffer = await crypto.subtle.sign(ECDSA_SIGN_PARAMS, keyPair.privateKey, hashBytes);
  return { ...envelope, signature: bufferToBase64(signatureBuffer), publicKeySpki: ..., signatureAlgorithm: 'ECDSA-P256-SHA256', signedAt };
}
```

Not the whole record, not the whole envelope, not a constructed "signed payload" object — the raw
UTF-8 bytes of the `integrityHash` STRING (64 lowercase hex characters). This is safe because
`integrityHash` already commits to the record's exact content:

```ts
// integrityEnvelope.ts:93-98
export async function computeIntegrityHash(record: ExportableRecord): Promise<string> {
  const canonicalJson = canonicalize(normalizeForHashing(record)); // sort keys recursively, JSON-round-tripped first
  const bytes = new TextEncoder().encode(canonicalJson);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

So signing the hash is equivalent to signing the record, at 32 bytes instead of the record's full
size. **There is no separate "signedPayloadFingerprint" field in this module** — `integrityHash`
already plays that exact role. If your cert:// design uses a name like `signedPayloadFingerprint`,
map it onto `integrityHash` rather than adding a second field that means the same thing.

## 2. The `certificateFingerprint` question (your point 3, "SIGNATURE / CERTIFICATE BINDING")

**This module has no equivalent of "a fingerprint of the WHOLE certificate, signature included, for
storage/identification, never used for signing."** `SignedIntegrityEnvelope` is exactly
`IntegrityEnvelope` plus `signature`/`publicKeySpki`/`signatureAlgorithm`/`signedAt` — nothing
computes a hash over that combined shape anywhere in this file.

If your cert:// layer needs that second, whole-certificate fingerprint (a real, legitimate need — a
storage key that changes when a signature is attached, distinct from the fingerprint that was
actually signed), the two-fingerprint split is already built, tested, and running as a worked
example in `packages/csrn-reference/src/cert/builder.ts` (a separate, standalone reference package,
not part of this file or the Genesis product surface):

- `computeSignedPayloadFingerprint(input)` — fingerprint of exactly what gets signed, computed
  BEFORE any signature exists (`packages/csrn-reference/src/cert/builder.ts:117-120`).
- `attachSignature(unsigned, signature)` — a pure spread that cannot retroactively touch the
  already-computed fingerprint (`builder.ts:154-156`).
- `computeCertificateFingerprint(cert)` — fingerprint of the whole, possibly-signed certificate,
  storage/identification only, never compared against the signed-payload fingerprint
  (`builder.ts:162-164`).
- `packages/csrn-reference/tests/signature.test.ts`'s `"certificateFingerprint differs from
  signedPayloadFingerprint and changes when a signature is attached"` test proves the two never
  collide and that attaching a signature cannot mutate the first one.

**Answering your actual question directly: yes, this ECDSA layer already has an unambiguous "what
exactly is signed" contract (`integrityHash`, §1 above) — you do not need to invent your own. If you
also want the second, whole-certificate identification fingerprint, reuse the pattern above (call
`computeIntegrityHash` again over the FULL signed envelope) rather than defining a third convention.**

```ts
// The pattern, reusing only functions that already exist — no new ECDSA code:
const certificateFingerprint = await computeIntegrityHash(signedEnvelope as unknown as ExportableRecord);
```

## 3. Field-by-field contract

| Field | Type | Meaning |
|---|---|---|
| `integrityHash` | `string`, `/^[a-f0-9]{64}$/` | SHA-256 hex of the canonicalized record. This IS the signed-payload fingerprint (§1). |
| `signature` | `string`, base64 | Raw P1363-format ECDSA signature bytes over `integrityHash`'s UTF-8 encoding. |
| `publicKeySpki` | `string`, base64 | **SPKI DER encoding, not JWK.** See §4 — this is the one place a naive cert:// design is likely to diverge without checking here first. |
| `signatureAlgorithm` | `'ECDSA-P256-SHA256'` (literal) | The only algorithm `verifySignedEnvelope` will verify; anything else is rejected as `STRUCTURALLY_INVALID` before any crypto runs (`integrityEnvelope.ts:304-306`). |
| `signedAt` | `string`, ISO 8601 | When the signature was produced — distinct from `exportedAt` (when the hash's envelope was built). Required; missing it is `STRUCTURALLY_INVALID` (`:307-309`). |

## 4. Public key format: SPKI/base64, not JWK — check this before wiring anything

`exportPublicKeySpki`/`importPublicKeySpki` (`integrityEnvelope.ts:247-255`) use `crypto.subtle`'s
`'spki'` format (DER, base64-encoded), **not** JWK. This is a real, concrete divergence from
`packages/csrn-reference`, which uses JWK objects (a separate, independent design choice for a
standalone package with no existing contract to match). If your cert:// `signature.publicKey` field
is typed as a JWK object and you intend to reuse `signIntegrityEnvelope`/`verifySignedEnvelope`
AS-IS (recommended — see §5), either:

- type `signature.publicKey` as the SPKI/base64 `string` this module actually produces, or
- convert at your integration boundary with `crypto.subtle`'s own format converters:
  ```ts
  const cryptoKey = await crypto.subtle.importKey('spki', base64ToBuffer(publicKeySpki), ECDSA_PARAMS, true, ['verify']);
  const jwk = await crypto.subtle.exportKey('jwk', cryptoKey); // if you need JWK for display/interop elsewhere
  ```

Do not silently store the SPKI string in a field named/typed for JWK, or a comparison a few layers up
the stack will fail on a shape mismatch nobody sees until an integration test does.

## 5. How to wire this in without duplicating the ECDSA logic

Call these five exports directly — do not reimplement `crypto.subtle.sign`/`verify` calls anywhere
in the cert:// layer:

```ts
import {
  buildIntegrityEnvelope, verifyIntegrityEnvelope,
  generateSigningKeyPair, signIntegrityEnvelope, verifySignedEnvelope,
} from 'core/integrity/integrityEnvelope'; // or the barrel: core/integrity
```

**If your certificate's "claim" is a single object** (or you're happy hashing `{claim, evidence,
provenance}` together as one unit): build ONE `IntegrityEnvelope` over that combined object via
`buildIntegrityEnvelope`, then `signIntegrityEnvelope` it. Zero new hashing code.

**If your certificate needs SEPARATE claim/evidence/provenance fingerprints** (matching the shape in
Qwen's cert:// draft): call `computeIntegrityHash` three times, once per sub-object, then build a
SECOND envelope over `{ claimFingerprint, evidenceFingerprint, provenanceFingerprint, ... }` via
`buildIntegrityEnvelope`/`signIntegrityEnvelope` — this is exactly the
`buildSignedPayload`/`computeSignedPayloadFingerprint` pattern in
`packages/csrn-reference/src/cert/builder.ts:100-120`, expressed with this module's own functions
instead of a parallel reimplementation. Either way, `computeIntegrityHash` and
`signIntegrityEnvelope` are the ONLY hashing/signing primitives involved — never construct a
`crypto.subtle.sign` call outside `integrityEnvelope.ts`.

**Verifying:** `verifySignedEnvelope(signed, expectedPublicKeySpki?)` already implements the full
five-way verdict your auditor needs (§6) — call it, read `.status`, do not re-derive the verdict from
`.valid`/`.reason` or write a second decision tree over the same crypto result.

**Portability note, useful if your cert:// verification also needs to run server-side:** this module
calls the bare global `crypto.subtle` (no import) — it works unmodified in both the browser and
modern Node (`globalThis.crypto` is stable since Node 19), so the SAME functions can back a
server-side auditor without a Node-specific fork.

## 6. The five-value verdict (`IntegrityCertificateStatus`)

Already implemented, already the vocabulary Qwen's draft asked for
(`INTEGRITY_VALID_UNSIGNED`/`_SIGNED_VERIFIED`/`_SIGNED_UNTRUSTED`/`INTEGRITY_INVALID`/
`STRUCTURALLY_INVALID`), returned as `VerificationResult.status` alongside the original
`valid`/`reason` fields (kept for backward compatibility — every existing caller of
`verifyIntegrityEnvelope` still compiles and behaves identically):

| `status` | From | When |
|---|---|---|
| `STRUCTURALLY_INVALID` | either function | Malformed envelope/signature shape — never reaches a hash or crypto check. |
| `INTEGRITY_VALID_UNSIGNED` | `verifyIntegrityEnvelope` | Hash matches; no signature present at all. |
| `INTEGRITY_INVALID` | either function | Hash mismatch, OR signature bytes fail `crypto.subtle.verify`. |
| `INTEGRITY_SIGNED_UNTRUSTED` | `verifySignedEnvelope` | Hash AND signature both valid, but the embedded `publicKeySpki` does not match the caller's `expectedPublicKeySpki`. |
| `INTEGRITY_SIGNED_VERIFIED` | `verifySignedEnvelope` | Hash valid, signature cryptographically valid, and (when checked) the signer is the expected one. |

`INTEGRITY_SIGNED_UNTRUSTED` only triggers when the caller PASSES `expectedPublicKeySpki` — omitting
it means "verify self-consistency only" and a valid signature from ANY key returns
`INTEGRITY_SIGNED_VERIFIED`. Your cert:// auditor's "is this signer trusted" step is exactly this
parameter, sourced from wherever your federation/trust-store design keeps known signer keys — this
module has no opinion on where that list lives.

## 7. What this document does NOT resolve (needs C2's actual code)

This was written before C2's CSRN/`evidence://`/`cert://` integration landed on
`claude/genesis-autonomous-completion-95bt4e` (checked via `git log` at the time of writing — the
branch tip was C3's own last commit). Everything above describes what THIS module does; it cannot
verify compatibility with a design that doesn't exist yet in the repo. Once C2's code lands, the
open questions are:

- Which of the two integration patterns in §5 C2's certificate shape actually needs.
- Whether C2's own `signature.publicKey` field is typed for SPKI or JWK (§4) — worth fixing before
  it's load-bearing elsewhere.
- Whether C2's auditor's verdict vocabulary is meant to BE `IntegrityCertificateStatus` verbatim, or
  a cert:// specific superset/rename of it.
