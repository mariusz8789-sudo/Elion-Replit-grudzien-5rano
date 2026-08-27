# Genesis Atom-Bohr — G3 Readiness Pass (audit layer)

**Status: `G3 BLOCKED / REFERENCE_UNPINNED`**
**Option D: `NOT AUTHORIZED`**

Docs-only. No production code, no Scientific Core change, no new solver, Evidence, Replay or
integration was touched. A4 was not refetched and no token-bearing payload was copied into this
branch. This document is the independent verification layer over the LIVE readiness record at
`719f2a8`; every claim below was re-derived from primary CI logs and the GitHub Actions API rather
than restated from another agent's report.

## 1. Status vocabulary used here

| Term | Meaning in this document |
| --- | --- |
| `PINNED` | Raw bytes are committed to Git, hashed from those committed bytes, and readable with no network. **Not used for any artifact below.** |
| `VERIFIED_IN_CI_ONLY` | A real retrieval happened, content markers matched, SHA-256 was computed from actual bytes — but the bytes exist only in an ephemeral CI workspace/artifact. |
| `READY` | The mechanism (URL, query, validation, semantics) is correct and needs no further design work. |
| `BLOCKED` | Cannot proceed without an external decision or a new safe input. |
| `REFERENCE_UNPINNED` | The benchmark has no durable reference payload, so no expected value may be written into a contract. |

`READY` is deliberately never combined with `PINNED`. A correct mechanism that produces no durable
bytes still leaves G3 open.

## 2. Readiness matrix

| # | Item | Status | Basis |
| --- | --- | --- | --- |
| 1 | A1 mechanism (CODATA `allascii.txt`, headers, units) | `READY` | Job fetches the official NIST CUU listing; official header markers asserted in-job. |
| 2 | A1 bytes + hash | `VERIFIED_IN_CI_ONLY` | `bytes=40801`, `sha256=77fb90e66c40db3e6eb16630bc9c88e4c7c8beddbe5e71be406f2f26e3f67e67` — read by me from the primary log of run `33120357769`, job `98685420779`, commit `cd0dd117`. Not in Git. |
| 3 | A2 mechanism (ASD H I lines, vacuum) | `READY` | Query carries `unit=1`, `low_w=650`, `upp_w=660`, `show_av=3`. I confirmed all four parameters in the script source, not from a summary. |
| 4 | A2 bytes + hash | `VERIFIED_IN_CI_ONLY` | `bytes=32646`, `sha256=7984eb55f092c8ae168a5e7efa8c8ce02849808ea2ec87b5988183af58484557`. Not in Git. |
| 5 | A3 mechanism (ASD Energy Levels) | `READY` | Endpoint is `energy1.pl` (ASD Energy Levels), **not** Chemistry WebBook. This resolves my earlier objection that a WebBook-sourced ionization limit could not be pinned or licensed. |
| 6 | A3 bytes + hash | `VERIFIED_IN_CI_ONLY` | `bytes=109196`, `sha256=796e2c5f41f1ab6a9f771b63e46250ae7d010625514915c3c0313a6c34328d50`. Not in Git. |
| 7 | A4 official terms payload | `BLOCKED — SECURITY` | The official NIST SRD terms HTML embeds a live Mapbox access token (`pk.…`). It must not be written to disk, uploaded, committed, or mirrored. |
| 8 | A4 guard | `READY` | `scripts/fetch-atom-bohr-nist-fixtures.mjs` throws at line 99, **before** the `writeFile` at line 103 and before any upload. Ordering verified by reading the file, not by trusting the changelog. |
| 9 | Manifest schema + validation | `READY_AFTER_A4` | `.github/workflows/ci.yml:92` enforces `manifest.artifacts.length !== 4`; each raw file is rehashed and compared to its manifest record. Cardinality means the manifest cannot be completed while A4 is blocked — this is correct behaviour, not a defect. |
| 10 | Artifact presence in Git | `NOT_SATISFIED` | Zero of four raw payloads are committed. `docs/evidence/atom-bohr-nist/` does not exist. CI artifact retention (90 days) is not durability. |
| 11 | Provenance record | `READY_PENDING_A4` | URL, query, retrieval timestamp, dataset version, units, observable, uncertainty and terms URL are all recorded by the script. License field cannot be `CONFIRMED` while A4 is blocked. |
| 12 | M-7 (no-network replay) | `NOT_READY` | Replay must read only committed bytes. With item 10 unsatisfied, an M-7 test could only pass by refetching, which M-7 forbids. |
| 13 | AC-2 (durable reference) | `NOT_SATISFIED` | Follows directly from item 10. |
| 14 | Option D implementation | `NOT AUTHORIZED` | No `transitionWavelengthNm` output, no `expectedValues[]`, no `ArmReference`, no `referencePolicy`, no migration, no 17-case matrix has been written. Specification only. |

**Two items, not one, keep G3 open**: the A4 security blocker (item 7) *and* the absence of durable
A1–A3 bytes (items 2, 4, 6, 10). Supplying a safe A4 alone does not close G3.

## 3. What is genuinely ready

- The retrieval mechanism is complete and deterministic for A1–A3: fixed official URLs, explicit
  query semantics, in-job content-marker assertions, byte-level SHA-256, and four-artifact
  cardinality validation.
- The security boundary is correctly placed. The guard is *pre-write*, so a token-bearing payload
  cannot reach disk, the artifact upload, or Git via this path.
- A3's source question is settled in favour of ASD Energy Levels, which is pinnable and licensable
  in a way NIST Chemistry WebBook was not.
- The failure modes are already expressed as job failures rather than warnings, so a regression here
  breaks the gate instead of silently degrading it.

## 4. What is missing, precisely

1. **Durable A1–A3.** Three verified payloads exist only inside an expired-or-expiring CI workspace.
   Until `docs/evidence/atom-bohr-nist/A1…A3` plus a manifest are committed, every hash above is a
   log line, not a fixture. A hash without bytes cannot detect drift, because there is nothing to
   rehash.
2. **A safe official A4.** Required for the license/terms field and for manifest cardinality. It
   must be an official artifact free of embedded secrets — not a token-stripped edit of the current
   payload, not a mirror, not a different licensing page, and not a value recalled from model
   knowledge.
3. **An M-7 no-network replay test.** Must prove that a single-byte mutation of any committed
   payload produces `DRIFT`, and that replay performs no network access.

## 5. Security finding — a contaminated CI artifact is still live

Three G3 runs went green **before** the guard commit `e49c598` (2026-08-27 22:18:24 UTC) existed.
Their A4 uploads therefore contain the raw token-bearing HTML. I enumerated the artifacts of all
three via the Actions API:

| Run | Head commit | Commit time (UTC) | G3 artifact | State |
| --- | --- | --- | --- | --- |
| `33120357769` | `cd0dd117` | 21:55:55 | `atom-bohr-nist-g3-cd0dd117…` (ID `9666206820`) | **Deleted** — only `genesis-os-dist` remains. |
| `33120755017` | `5751d693` | 22:01:23 | `atom-bohr-nist-g3-5751d693d27aba6cd83275dde447ebf15fff1e04` (ID `9666349975`, 50 092 bytes, created 22:01:45, expires 2026-11-25) | **STILL PRESENT, `expired: false`, downloadable.** |
| `33121795133` | `852c483f` | 22:15:55 | none listed | No G3 artifact present. |

The remediation claim that "a token-bearing CI artifact was deleted" is true for exactly one run.
The `5751d693` artifact predates the guard by roughly 17 minutes and survives with a 2026-11-25
expiry. I did **not** download it.

**Required action (owner, not Claude):** delete artifact ID `9666349975`, then rotate the embedded
Mapbox token if it is credited to this organisation rather than to NIST. Deleting the artifact
without rotating only removes one copy of a credential that has already been written to a
third-party store. Until this is done, the "secret contained" claim in the LIVE record is
incomplete.

## 6. Automatic handoff after a safe A4

The moment an approved, secret-free official A4 exists, this sequence runs with no further design
decisions:

1. Run the existing G3 job unchanged. It fetches A1–A4, asserts content markers, computes SHA-256
   from real bytes, and enforces four-artifact cardinality.
2. Compare the fresh A1–A3 hashes against the three values in §2. A mismatch is `DRIFT`, not a
   refresh — investigate before proceeding.
3. Commit the four raw payloads and `manifest.json` to `docs/evidence/atom-bohr-nist/`. This is the
   step that converts `VERIFIED_IN_CI_ONLY` into `PINNED`, and nothing before it may use that word.
4. Add the M-7 no-network replay test (mutation → `DRIFT`; zero network calls).
5. Set `referenceStatus` from `REFERENCE_UNPINNED` to `REFERENCE_PINNED`; record the license as
   `CONFIRMED` from the A4 terms.
6. Only then may the CTO gate authorize Option D, which is already specified in
   `docs/GENESIS_ATOM_BOHR_OPTION_D_SPEC.md` and must be implemented against the existing Evidence
   Pack and Replay, with per-arm references, backward compatibility for the single-`expectedValue`
   form, a model-version migration, the 17 approved cases, and the full quality gate.

Steps 1–5 are mechanical. Step 6 requires explicit authorization and is not implied by G3 closing.

## 7. Failure conditions

| Condition | Required outcome | Enforced by |
| --- | --- | --- |
| Payload contains `pk.…` or any embedded token | `BLOCKED`; no write, no upload | Guard at `fetch-atom-bohr-nist-fixtures.mjs:99` |
| Fewer or more than four artifact records | G3 job fails | `ci.yml:92` cardinality check |
| SHA-256 of committed bytes ≠ manifest record | `DRIFT / BLOCKED` | Manifest re-hash step |
| Raw file absent from Git | `REFERENCE_UNPINNED`; no expected value may be written | This document, §2 item 10 |
| Replay performs any network fetch | Test failure | M-7 (not yet implemented) |
| Terms/license unknown | `VERIFY_REQUIRED / INCONCLUSIVE` | A4 dependency |
| Substitute source used without CTO decision | `NOT AUTHORIZED` | Standing instruction |
| Value taken from model knowledge or memory | `NOT AUTHORIZED` | Standing instruction |
| Token-stripped or hand-edited A4 | `NOT AUTHORIZED` — breaks raw-payload integrity | Standing instruction |

## 8. Decision

> `DONE`: readiness document updated with independently re-derived evidence.

> `READY`: mechanism for A1–A3 and the pre-write security guard; the six-step handoff in §6 needs no
> new design.

> `BLOCKER`: (a) A4 official terms payload carries an embedded Mapbox token; (b) A1–A3 raw bytes are
> not in Git, so M-7 and AC-2 are unsatisfied; (c) contaminated CI artifact `9666349975` is still
> live and must be deleted.

> `STATUS`: `G3 BLOCKED / REFERENCE_UNPINNED`; `Option D NOT AUTHORIZED`.
