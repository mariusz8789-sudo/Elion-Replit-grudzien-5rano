# Genesis Atom-Bohr G3 Final Report

**Decision: `G3 FAILED — BLOCKED / REFERENCE_UNPINNED`**

G3 was executed through a dedicated, network-enabled GitHub Actions job. The job downloaded real responses from the official URLs, calculated SHA-256 values from the received bytes, and verified the manifest against those bytes. A1, A2, and A3 passed download and integrity checks. The complete G3 gate did not pass because A4 cannot be safely and durably pinned.

## A1–A4 status

| Artifact | Official source and semantics | Result |
| --- | --- | --- |
| A1 | NIST CODATA 2022 complete fundamental-constants listing; raw ASCII retained by the CI job | Downloaded and SHA-256 verified in CI. Not committed because complete G3 was not reached and the fixture must not be represented as admitted. |
| A2 | NIST Atomic Spectra Database SRD 78 H I lines, explicit query, 650–660 nm, `unit=1`, `show_av=3` for vacuum/all wavelengths | Downloaded and SHA-256 verified in CI. Not committed for the same reason. |
| A3 | NIST Atomic Spectra Database SRD 78 H I energy-level output, explicit eV query; not Chemistry WebBook | Downloaded and SHA-256 verified in CI. Not committed for the same reason. |
| A4 | Official NIST SRD/data licensing page | **Blocked:** returned HTML contains an embedded Mapbox access token. The raw payload cannot be committed or uploaded. |

The last successful artifact-fetch attempt before the safety guard produced these hashes for A1–A3 in CI:

| Artifact | SHA-256 |
| --- | --- |
| A1 | `77fb90e66c40db3e6eb16630bc9c88e4c7c8beddbe5e71be406f2f26e3f67e67` |
| A2 | `7984eb55f092c8ae168a5e7efa8c8ce02849808ea2ec87b5988183af58484557` |
| A3 | `796e2c5f41f1ab6a9f771b63e46250ae7d010625514915c3c0313a6c34328d50` |

These hashes are evidence of a CI retrieval, not a pinned Genesis fixture. The corresponding bytes are not present in Git, so M-7 is intentionally not claimed.

## Integrity and security findings

The first A4 fetch created a CI artifact containing the token-bearing HTML. The artifact was deleted immediately after GitHub Push Protection identified the secret. The attempted commit was rejected and was reset locally; no raw A4 containing the token was pushed to LIVE.

The G3 fetch script now refuses to write or upload A4 when it detects a `pk.` access-token pattern. The guard runs before the payload is written to disk or uploaded. The latest CI run therefore fails at the correct security boundary rather than producing a false green G3.

The current official terms page is not accepted as a safe pinned artifact. Stripping the token after download would destroy the raw-payload requirement and would not be an honest substitute. No unofficial mirror, alternate license source, or remembered value was used.

## Replay consequence

Replay cannot be enabled for this candidate. Since A1–A3 are not committed raw fixtures and A4 is unsafe, a no-network deterministic replay fixture does not exist. Option D must therefore remain `NOT AUTHORIZED`; missing references must produce `VERIFY_REQUIRED`, `INCONCLUSIVE`, or `BLOCKED`, never `PASS`.

## What was attempted

The workflow used the official NIST/CODATA URLs, recorded retrieval context, dataset/version labels, units, observable descriptions, uncertainty notes, terms URL, raw byte counts, and SHA-256 values. It verified exactly four artifact records and uploaded a temporary candidate only for CI verification. After the security finding, the candidate artifact was deleted and the upload guard was added.

## Prohibited workarounds

The following actions remain prohibited: bypassing GitHub secret protection; deleting the guard; filtering a secret after the fact while claiming the result is raw; committing the token-bearing HTML; using an unofficial mirror without a separate CTO decision; inserting values from memory; implementing Option D partially; or changing Scientific Core to avoid the blocker.

## Next minimal step

Obtain an approved, official, safe, versionable A4 terms artifact that contains no secret and can be retained as raw bytes. Then rerun G3, verify A1–A4 from bytes, commit all four raw payloads and the manifest, and only after that authorize Claude to implement the already approved Option D contract and its 17 tests.

Until that occurs:

> `G3 FAILED — BLOCKED / REFERENCE_UNPINNED`

> `Option D — NOT AUTHORIZED`

The computational E2E and real PySCF regression gates remain independent and unchanged.
