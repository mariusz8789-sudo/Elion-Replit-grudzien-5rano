# Phase 0.1 — Evidence Store Convergence

**Status:** Storage-mechanism convergence only. No hazard science, no Scientific Core change. Builds on Phase 0 (`cf96410`, `docs/PHASE0_HAZARD_PROVENANCE_FOUNDATION.md`).

## Was there duplication?

Yes, in the get/put/list mechanics and content-equality check — not in domain policy. `core/discovery/evidenceStore.ts`'s `InMemoryEvidenceStore`/`LocalEvidenceStore` and `core/hazard/hazardProvenanceStore.ts`'s (pre-convergence) `InMemoryImmutableStore`/`LocalImmutableStore` independently implemented the same shape: a `Map`/`localStorage`-backed keyed record with `put`/`get`/`list`, one using `readJSON`/`writeJSON` against a single storage key holding a flat `Record<string, T>`. The hazard version additionally did a `canonicalJson` equality check before overwriting; the epidemic version did not. That was the one real semantic difference, and it is a deliberate domain policy, not an oversight — see "What stayed separate" below.

## What was generalized

A new module, `packages/frontend/src/core/provenance/recordStore.ts`, extracts exactly that shared mechanism:

- `KeyedRecordStore<T>` — the interface (`put`/`get`/`list`/`delete`).
- `InMemoryRecordStore<T>` and `LocalRecordStore<T>` — the two backends, each taking a `DuplicateIdPolicy` (`'overwrite'` or `'reject-if-different'`) as a constructor argument.
- `DuplicateRecordConflictError` — thrown only under the `'reject-if-different'` policy.
- The canonical-content-equality check itself (`canonicalJson(a) === canonicalJson(b)`), now written once.

Both `core/discovery/evidenceStore.ts` and `core/hazard/hazardProvenanceStore.ts` were rewritten to delegate to this primitive:

- `InMemoryEvidenceStore` / `LocalEvidenceStore` → `InMemoryRecordStore`/`LocalRecordStore` constructed with `'overwrite'` — their original, unchanged permissive behavior.
- `InMemoryHazardProvenanceStore` / `LocalHazardProvenanceStore` → the same two classes constructed with `'reject-if-different'` — their original, unchanged immutability guarantee.

Net effect: `evidenceStore.ts` shrank by 20 lines, `hazardProvenanceStore.ts` shrank by 76 lines (123 deletions, 47 insertions), for a net reduction of 55 lines across the two files, with zero behavior change to either.

## What stayed separate, deliberately

- **The `EvidenceStore` and `HazardProvenanceStore` interfaces themselves** — different shapes (`save`/`load` on one `DiscoveryCase`-shaped record vs. three separate `putArtifact`/`putInput`/`putRun` collections), because the domains disagree on what a "record" is, not because of any storage limitation.
- **The duplicate-id policy** — epidemic evidence stays overwritable (`'overwrite'`); hazard provenance stays immutable (`'reject-if-different'`). This is a real scientific/product distinction (an experiment result may legitimately be re-saved under its own id; a frozen `SourceArtifact`/`HazardInput`/`HazardRun` must not silently change), and the convergence makes it an explicit constructor argument instead of hiding it as an implicit difference between two separate hand-written classes.
- **Storage keys and namespaces** — `evidence-store/v1` (epidemic, one flat key) vs. `hazard-provenance-store/{artifacts,inputs,runs}/v1` (hazard, three flat keys). No key was renamed or merged; a record from one domain cannot appear under the other's key.
- **Scientific fingerprint/replay logic** — `discoveryReplay.ts` (epidemic) and `hazardReplay.ts` (hazard) remain two independent code paths sharing only `canonicalJson`/`sha256Hex`, exactly as documented in Phase 0. This convergence pass did not touch either.

## Backward compatibility

- `EvidenceStore`, `InMemoryEvidenceStore`, `LocalEvidenceStore`, `StoredEvidence`, `EVIDENCE_STORE_SCHEMA_VERSION`, `summarizeStoredEvidence`, `listExperimentRegistry` — all unchanged public names and signatures. `EvidenceReplayPanel.tsx` was not modified and required no changes.
- `HazardProvenanceStore`, `InMemoryHazardProvenanceStore`, `LocalHazardProvenanceStore` — unchanged public names and signatures.
- `ImmutableConflictError` (the name Phase 0's own tests import from `hazardProvenanceStore.ts`) is now a re-export of `DuplicateRecordConflictError` — the same class, not a compatible-looking copy, so `instanceof`/`toThrow(ImmutableConflictError)` checks in the existing Phase 0 test suite continue to pass unmodified.
- `ImmutableRecordStore<T>` is now a type alias for `KeyedRecordStore<T>`.
- The persisted **shape** under `evidence-store/v1` is unchanged (`Record<string, StoredEvidence>`), so records saved by a pre-convergence build remain readable — proven directly in Test 6 below by writing that shape into a fake `localStorage` by hand (not through any new code) and loading it through the refactored `LocalEvidenceStore`.

## Test matrix

New file: `packages/frontend/src/__tests__/evidenceStoreConvergence.test.ts` (12 assertions).

| # | Requirement | Result |
|---|---|---|
| — | Existing Evidence/Replay tests stay green, no science-expectation changes | `evidenceStore.test.ts`, `evidenceCrypto.test.ts`, `evidenceReplayIntegration.test.ts`, `experimentComparison`-related tests — unmodified, all pass |
| — | All 20 hazard provenance tests stay green | `hazardProvenance.test.ts` — unmodified, all 20 pass, including `ImmutableConflictError` instanceof checks against the now-shared error class |
| 3 | Duplicate id + bit-identical content | Epidemic store: re-save is a no-op under `'overwrite'`. Hazard store: re-put is idempotent under `'reject-if-different'`. Both proven directly |
| 4 | Duplicate id + different canonical content rejected | Proven on the shared primitive directly (`InMemoryRecordStore('reject-if-different')` throws, `InMemoryRecordStore('overwrite')` does not) and re-proven through `InMemoryHazardProvenanceStore.putArtifact` |
| 5 | Namespace isolation | Same id string (`'shared-id-collision-probe'`) saved as both an epidemic record and a hazard artifact on one shared fake `localStorage` — each store reads back only its own shape; separately, the two `Local*Store` classes are shown to write under disjoint storage-key prefixes |
| 6 | Version/migration — no silent loss | A `StoredEvidence` written directly into `evidence-store/v1` in the pre-refactor flat-object shape (bypassing all new code) loads correctly through the refactored `LocalEvidenceStore`, including appearing in `list()` |
| 7 | Full validation | `vitest run`: 120 files / 1217 tests passed (up from the pre-existing 119/1205 by exactly this one new file's 12 tests). `tsc --noEmit`: clean. `eslint`: clean. `npm run build`: succeeds. `git diff --check`: clean |

## Deferred work

- Migrating `EvidenceStore`'s interface shape itself onto `KeyedRecordStore<T>` (i.e. making `EvidenceStore` a thin type alias rather than its own interface) was considered and deliberately not done — the two interfaces' method shapes differ enough (`save`/`load` on one full-case record vs. three-collection put/get) that forcing type-level unification would add indirection without removing any code, and risks a subtle behavior change in `EvidenceReplayPanel.tsx`'s call sites for no benefit.
- No schema-version field was added to hazard provenance records in this pass; if a future hazard record shape changes in a way old records can't be read as, the same `EVIDENCE_STORE_SCHEMA_VERSION`-style versioned field should be added to `HazardInput`/`HazardRun`/`SourceArtifact` at that time, following this document's Test 6 pattern to prove no silent data loss.
- No UI, hazard solver, GIS adapter, `ExposureSnapshot`, `ImpactResult`, `CascadeEdge`, `MultiHazardWorldState`, or cascade replay — none of this was in scope and none was added.

**NO HAZARD SOLVER / NO GIS / NO CASCADES / NO EPIDEMIC CORE CHANGE.**

## Follow-up

Storage-safety hardening of the same `recordStore.ts` primitive against malformed/adversarial `localStorage` content — corrupted JSON, non-collection JSON, prototype-adjacent keys, semantically invalid records — is a separate pass: see `docs/PHASE0_2_PERSISTENCE_INTEGRITY.md`.
