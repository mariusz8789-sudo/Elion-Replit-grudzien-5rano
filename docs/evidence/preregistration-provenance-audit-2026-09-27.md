# Preregistration provenance audit — QE4, A1 GLP-1, Tautology Gate (2026-09-27)

An earlier audit reported three preregistration documents as missing on every
branch. This record checks that claim against `main` (e403f0bb), all 112 remote
branches and the full commit history. Nothing below was recreated or backdated. Hashes are SHA-256 of the files
as they are on `main` today; commit ids and times are from `git log --all`.

## Result

There are two layers, and the earlier audit was right about one of them.

**1. The original source contracts are missing, as reported.** Each experiment was
specified in a document delivered from a conversation, and those exact texts were never
committed. No commit on any branch has ever added them (`git log --all --name-only`
finds none). They are already listed in `docs/BRAKUJACA_WIEDZA.md` as knowledge to
recover from the owner's files. This record does not recreate them:

| Missing source document | Referenced by |
|---|---|
| `QE4_REAL_DATASET_AND_EXPERIMENT.md` (QE4 preregistration contract, P1–P4, sections 8–13) | `docs/prompts/C2-QE4-brydges-execution.md`, `knowledge/quantum.md:260` |
| `A1_GLP1_SUBSTITUTION_REAL_DATASET_AND_EXPERIMENT.md` (A1 preregistration contract) | `docs/prompts/C1-A1-glp1-substitution.md:14,116` |
| `GENESIS_TAUTOLOGY_AND_EMPIRICAL_TEST_GATE.md` (Tautology Gate spec: 25 golden cases, rules C1–C6) | `docs/GRANT_READINESS_REPORT.md:88,150`, `docs/TAUTOLOGY_GATE_AUDIT.md:10` |

No hash of any of the three was ever recorded, so there is nothing to preserve beyond
the file names and the references above.

**2. Sealed in-repo preregistrations exist for QE4 and A1.** These were written in the
repository from the contracts above and are what the code actually checks against:

| Preregistration | In repo | First commit | Content changed since? |
|---|---|---|---|
| QE4 | `docs/QE4_PREREGISTRATION.md`, sha256 `3309f7e48e9092d10ede711598cafbe6789e83b6f7049553745c0d5445406044` | `dab127d0`, 2026-09-12 21:58 UTC | No |
| A1 GLP-1 | `packages/frontend/src/core/biotechData/a1Glp1Preregistration.ts`, sha256 `2bd06ef42b8f0183e0de1c27f0f6a96aa73657d23aeb7b8aa04661dbd66acd95`, fingerprint `5882c619`; its text is copied from `docs/A1_GLP1_EXECUTION_HANDOFF.md` §5–§8 (sha256 `3ec7f725188333981b76faa1f59c33e4c81e15e3ba995ee9abe18cccd142c146`) | `e63fb89d`, 2026-09-13 12:39 UTC | No |
| Tautology Gate | None. The gate is a classifier (`core/agent/tautologyGate.ts`), built without its spec, as `docs/TAUTOLOGY_GATE_AUDIT.md` already states. | — | — |

Whether the in-repo QE4 and A1 texts match the lost contracts word for word cannot be
checked until the originals are found.

## Provenance gaps found (stated, not repaired)

1. **QE4: ordering is asserted, not provable from git.** The preregistration, the
   estimator, the pinned data and the analysis all landed in one commit
   (`dab127d0`). The commit message says the predictions P1–P4 were sealed "before
   any result file was opened for analysis", but git has no earlier timestamp for
   the preregistration alone, and no result record carries its hash. The data are
   also a public 2019 dataset, so the preregistration cannot establish blindness to
   the published results; it establishes that the rules were fixed in a document
   that has not changed since.
2. **A1: ordering is supported, the seal is weak.** Git shows the sealed
   preregistration (`e63fb89d`, 12:39 UTC) before the first data reconnaissance
   (`86705b97`, 12:41 UTC) and the data pin (`6f73afe2`, 12:53 UTC). But the seal
   `5882c619` is FNV-1a 32-bit (`core/events/hash.ts`, documented there as
   non-cryptographic), and neither the SHA-256 of the code file nor of the handoff
   document it copies was recorded in any result. The trials are published results,
   so blindness is limited in the same way as QE4.
3. **No machine-readable gap record exists in the architecture.** There is no
   `PROVENANCE_GAP`-style record type (the closest are `MISSING_PROVENANCE` in
   `a2TrialEvidenceGate.mjs` and `A2IdentityMismatch`). This markdown file is the
   record; adding a new record type was out of scope ("no new subsystem").

## Forward protocol for future runs

The Astex redock benchmark already does this and is the model to copy
(`docs/evidence/astex-redock-prereg.json` → each run record's
`preregistrationSha256`):

1. Commit the preregistration **alone**, before any data are fetched or opened.
2. Every result record stores the preregistration's **SHA-256 of the exact file
   bytes** (not FNV) and the commit id that introduced it.
3. A result whose preregistration hash does not match the committed file is
   refused, the same fail-closed rule `scripts/d088-engine-unification.mjs` applies
   (`PREREG_TAMPERED`).
4. An amendment is a new file and a new hash, listed next to the original; the
   original is never edited.
5. Where the data are already public, the record says so and does not claim
   blindness.
