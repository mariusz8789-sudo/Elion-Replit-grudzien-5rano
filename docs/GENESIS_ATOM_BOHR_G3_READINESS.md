# Genesis Atom-Bohr G3 Readiness

**Current status: `G3 BLOCKED / REFERENCE_UNPINNED`**  
**Option D: `NOT AUTHORIZED`**

This report records the maximum readiness achieved without bypassing the A4 security boundary or implementing Option D.

## Readiness matrix

| Area | Status | Evidence and boundary |
| --- | --- | --- |
| A1 URL, retrieval and content validation | `READY / VERIFIED_IN_CI` | Official CODATA complete listing was fetched from `https://physics.nist.gov/cuu/Constants/Table/allascii.txt`; the payload matched the expected official headers. |
| A1 SHA-256 | `VERIFIED_IN_CI_ONLY` | `77fb90e66c40db3e6eb16630bc9c88e4c7c8beddbe5e71be406f2f26e3f67e67`; raw bytes are not committed because complete G3 did not pass. |
| A2 query, vacuum semantics and content validation | `READY / VERIFIED_IN_CI` | Official ASD H I query uses explicit `unit=1`, 650–660 nm, and `show_av=3` for vacuum/all wavelengths. |
| A2 SHA-256 | `VERIFIED_IN_CI_ONLY` | `7984eb55f092c8ae168a5e7efa8c8ce02849808ea2ec87b5988183af58484557` in the successful candidate run; raw bytes are not committed. |
| A3 source and semantics | `READY / VERIFIED_IN_CI` | Official ASD Energy Levels output for H I in eV; it is not Chemistry WebBook. Ionization-limit semantics remain explicit and are not inferred from an arbitrary level. |
| A3 SHA-256 | `VERIFIED_IN_CI_ONLY` | `796e2c5f41f1ab6a9f771b63e46250ae7d010625514915c3c0313a6c34328d50` in the successful candidate run; raw bytes are not committed. |
| A4 official terms artifact | `BLOCKED / SECURITY BLOCKER` | The official NIST terms HTML contains an embedded Mapbox access token. It must not be written, uploaded or committed. |
| Manifest validation | `READY_AFTER_A4` | The existing job requires exactly four artifact records, calculates SHA-256 from raw bytes, and compares every raw file to its manifest record. |
| Artifact presence rule | `MUST_REQUIRE` | G3 is not complete unless all four safe raw payloads and the manifest exist durably in Git. CI retention alone is insufficient. |
| Provenance | `READY_PENDING_A4` | The manifest records URL, query, retrieval context, dataset/version, units, observable, uncertainty, terms URL and SHA-256. Final license confirmation remains blocked by A4. |
| M-7 replay | `NOT_READY` | Replay must use committed raw A1–A4 and must never refetch the network. A1–A3 are not currently committed. |
| Option D | `NOT AUTHORIZED` | No `expectedValues[]`, `transitionWavelengthNm`, Scientific Core migration, or Option D test implementation has been added. |

## What is complete

The dedicated `nist-g3-pinned-artifacts` GitHub Actions job has network retrieval, exact source URLs, content markers, byte-level SHA-256 calculation, four-artifact cardinality validation, manifest verification, and candidate artifact upload for controlled inspection. The A4 guard runs before writing or uploading the payload and rejects token-bearing HTML. A token-bearing CI artifact was deleted after GitHub Push Protection detected the secret; the rejected commit was never pushed to LIVE. The main product verification job and real PySCF regression job remain green on the product code.

The G3 script is deterministic after its source URLs are fixed. Once a safe A4 is supplied, one job can fetch and verify A1–A4 without manual edits in multiple locations.

## What is not complete

A1–A3 have verified retrievals and hashes but are not pinned fixtures because their raw bytes are not in Git. A4 has no safe raw artifact. Therefore the current manifest cannot honestly be marked final `PINNED`, the license/terms status cannot be `CONFIRMED` for every reference, and no no-network replay proof exists for the complete set.

A4 cannot be repaired by stripping the token after download: that would violate the raw-payload requirement and change the source artifact. An unofficial mirror, alternate licensing page, remembered value, or secret-scanning bypass is not an authorized workaround.

## Failure conditions

| Condition | Required outcome |
| --- | --- |
| Token-bearing payload | `BLOCKED`; no disk write and no upload |
| Missing raw file | `REFERENCE_UNPINNED` |
| SHA-256 mismatch | `DRIFT / BLOCKED` |
| Missing terms or license status | `VERIFY_REQUIRED / INCONCLUSIVE` |
| Network refetch during replay | Test failure |
| Alternate source without CTO approval | `NOT AUTHORIZED` |
| Incomplete four-file fixture | G3 not closed |

## Automatic handoff after a safe A4

When an approved official A4 artifact without embedded secrets becomes available, the existing job will fetch and validate exactly A1–A4, calculate SHA-256 from the actual bytes, and record retrieval context. The four raw payloads and manifest must then be committed to `docs/evidence/atom-bohr-nist/`. A no-network integrity test must verify that a one-byte or metadata mutation produces drift and that replay reads only the committed files.

Only after those steps will the CTO gate authorize Claude to implement the already specified Option D contract. The implementation must reuse the existing Evidence Pack and Replay, support per-arm references, preserve old single-expectedValue compatibility, version the model/output migration, run exactly the 17 approved cases, and pass the full quality gate including Chromium where applicable.

## Decision

> `DONE`: G3 mechanism and security boundary are ready; readiness report recorded.

> `READY`: one safe official A4 plus durable raw A1–A3 will enable the one-job handoff to final fixture verification.

> `BLOCKER`: A4 official terms response contains an embedded Mapbox access token, and A1–A3 are not durably pinned in Git.

> `NEXT`: obtain an approved safe official A4, then pin all four raw artifacts and run no-network replay verification.

> `STATUS`: `G3 BLOCKED / REFERENCE_UNPINNED`; `Option D NOT AUTHORIZED`.
