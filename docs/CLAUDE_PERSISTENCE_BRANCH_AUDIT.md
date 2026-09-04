# Claude Persistence-Integrity Branch Audit

## Decision

The isolated branch `claude/persistence-integrity-hardening` at commit [`43981e1`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/commit/43981e1eb35330e34a776199b5e62adfb50b0294) is **not approved for merge yet**. Its scope is appropriately limited to the shared local record-store boundary, epidemic evidence storage, hazard provenance storage, tests, and documentation. It does not modify City3D, the Earthquake solver or mapping/overlay, data/GIS, cascades, deployment, or the epidemic Scientific Core. Its reported GitHub Actions run [`32952827180`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32952827180) completed successfully.

| Audit area        | Result                | Evidence                                                                                                                                          |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch isolation  | Accepted              | Merge base `62cc760`; the branch has one persistence-only commit and no live-branch merge.                                                        |
| Domain policies   | Accepted              | Epidemic evidence remains `overwrite`; hazard provenance remains `reject-if-different`.                                                           |
| Collection safety | Accepted in principle | The branch rejects non-dictionary containers and prototype-sensitive ids, while preserving legacy flat collections.                               |
| Local validation  | Passed                | Independent detached-worktree run: 17 new persistence tests and frontend typecheck passed.                                                        |
| Remote validation | Passed                | GitHub Actions run `32952827180` is `success`.                                                                                                    |
| Merge decision    | **Blocked**           | A malformed but minimally shape-valid `HazardInput` can still reach the Earthquake evaluator and make read-only history reject with an exception. |

## Reproducible merge blocker

The new generic `isHazardInputShape()` checks identifiers and `inputFingerprint`, but does not ensure that `scientificFields` is even a record. A locally stored input with `scientificFields: null` can satisfy this minimal gate, retain a matching canonical input fingerprint, and pass the registered-module compatibility fence. The existing `earthquakeEvaluator` then destructures `scientificFields` without a runtime guard. `replayHazardRun()` does not catch evaluator exceptions, so `listEarthquakePersistedRunHistory()` rejects rather than returning its existing safe, read-only replay result.

An isolated audit probe against the exact branch SHA constructed a genuine stored Earthquake artifact/input/run with `scientificFields: null`. The branch accepted the records through its new store gate, and `listEarthquakePersistedRunHistory()` rejected as expected by the probe. This violates the intended persistence-boundary rule that malformed local data must not escape into the UI or manufacture a replay result.

> The blocker is **not** a request for a new solver, hazard, data source, GIS layer, renderer, or scientific-model change. It is a narrow integrity failure at the existing local persisted-record → existing replay boundary.

## Required correction before a new audit

Claude should amend only the isolated branch with all of the following:

1. Strengthen the generic `HazardInput` persistence gate to reject non-record `scientificFields` and invalid `seed` / `displayName` primitive shapes before they reach a module evaluator.
2. Preserve the existing never-throw replay contract by converting evaluator exceptions caused by retained malformed local records into a truthful named non-success replay result; never return `MATCH`, never fabricate output, and do not write, delete, map, or restore an overlay.
3. Add a regression test with a canonically fingerprinted malformed input that proves persisted Earthquake history remains read-only and resolves safely with a non-success verdict instead of rejecting.
4. Re-run the focused persistence tests, full frontend and backend suites, TypeScript, lint, production build, `git diff --check`, and a new remote GitHub Actions run.

## Live-branch mitigation, not branch approval

Live Genesis commit [`39eb382`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/commit/39eb382eaa411a7c92de5032b47f4a9214f0b58a) now enforces the pre-existing `replayHazardRun()` never-throw contract generically: evaluator throws or rejections resolve to a truthful `BLOCKED` report with no replay fingerprint and no fabricated `MATCH`. The synchronous and asynchronous cases are regression-tested, and [GitHub Actions run `32957478203`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32957478203) completed successfully.

This mitigation protects the current live read-only replay boundary, but it **does not approve or merge** Claude's branch. Claude's persistence gate should still reject malformed `scientificFields` earlier and demonstrate the real retained-malformed-Earthquake history case in its own regression suite. Any subsequent audit must re-evaluate the branch against the newer live base and its remaining persistence-only diff.

## Current branch check

On 2026-08-26, the remote ref `origin/claude/persistence-integrity-hardening` was fetched and remained exactly at `43981e1`; it contains no commit after the audited state. The minimal `isHazardInputShape()` check still accepts any object carrying only string identifiers and an `inputFingerprint`; it does not validate `scientificFields`, `seed`, or `displayName`. Consequently, the required correction and retained-malformed-input regression are still absent. The branch remains **fenced and unmerged**; this review made no checkout, merge, cherry-pick, or modification to that branch.

## Corrected branch re-audit — `47c1cdb`

Claude subsequently updated the isolated branch to `47c1cdb8e7a1b8f9a81ba702e4fcb4778b36224c`; its reported GitHub Actions run [`32978979041`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32978979041) is successful. The independent diff audit confirms that the formerly missing `HazardInput` checks are now present: `scientificFields` must be a non-array object, `seed` must be `null`, a number, or a string, and `displayName` must be `null` or a string. Its new boundary regression also persists a real Earthquake run, corrupts only `scientificFields`, and verifies non-throwing `NOT_REPRODUCIBLE` history behavior.

The current live branch already contains a stronger compatible implementation: it additionally requires a finite numeric seed, guards retained `SourceArtifact` and `HazardRun` values, and ensures public lists do not expose IDs rejected by their paired guarded reads. Therefore the stale Claude store implementation is **not merged wholesale**. The non-duplicative regression coverage for `scientificFields: []` and `displayName: 42` is adopted into the live persisted-history suite, where it exercises the real Earthquake command-center, canonical fingerprint, local storage, replay, and history path.
