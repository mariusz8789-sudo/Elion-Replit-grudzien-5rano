# Phase 0.2 — Persistence Integrity & Recovery Boundary

**Status:** Storage-safety hardening only, on top of the Phase 0.1 convergence (`docs/PHASE0_EVIDENCE_STORE_CONVERGENCE.md`). No hazard science, no new store, no epidemic or hazard domain-policy change, no City3D, no GIS.

## The gap this closes

`core/provenance/recordStore.ts`'s `LocalRecordStore` persisted a flat `Record<string, T>` under one `localStorage` key, but trusted whatever `core/storage.ts`'s `readJSON` handed back with a bare `as Record<string, T>` cast. `core/storage.ts` already guards against an inaccessible `localStorage` and against JSON that fails to *parse* — but it does not, and should not (it is used by many unrelated features with their own shapes), guard against JSON that parses successfully into something that is not a record collection at all. Concretely, before this pass:

- A stored value of `null` (valid JSON) made `list()` call `Object.keys(null)`, throwing to the UI.
- A stored array made every numeric-index-shaped id resolve to whatever sat at that array index, with no type relationship to `T`.
- `all[id] = record` was a plain bracket assignment. If `id` were ever `'__proto__'`, that assignment invokes `Object.prototype`'s `__proto__` accessor instead of creating an own property — silently repointing the in-memory collection's own prototype rather than storing the record.
- A per-record shape mismatch (e.g. a `HazardRun` missing `hazardModuleVersion`) was indistinguishable from a well-formed one to any caller that trusted the cast.

## The contract

- **Accepted shape:** a genuine flat dictionary — `typeof value === 'object'`, not `null`, not an array, and `Object.getPrototypeOf(value) === Object.prototype` — with each entry additionally passing the store's own `validateRecord` predicate when one is supplied.
- **Reject shape:** anything else read back from storage (corrupted JSON, `null`, an array, a string/number/boolean, or a collection-level prototype tamper) is treated as an **empty** collection — never thrown, never partially trusted. A single entry that fails `validateRecord` is reported as **absent** (`get()` returns `null`) without affecting any other entry.
- **Recovery, not deletion:** `put()`/`delete()` always operate on the *shape-sanitized-but-content-unvalidated* raw collection, so writing one id can never silently drop a sibling id's bytes just because that sibling fails content validation. Only a genuinely reserved key (`__proto__`, `constructor`, `prototype`) is dropped on the next write — those can never be a legitimate business id in the first place. Total-container corruption (the stored value itself isn't a dictionary) has no per-record structure to preserve; there, fail-closed means an empty view until the next real write.
- **Legacy records:** a collection written by an older Genesis build that already conforms — flat dictionary, shape-valid entries — reads back exactly as before. This is a guard in front of the existing read path, not a migration; no persisted shape changed.
- **No-fabrication rule:** this boundary never invents a fingerprint, hash, replay verdict, or provenance field, and it never synthesizes a plausible-looking record. It only ever answers "present and valid" or "absent." What that absence means (`NOT_REPRODUCIBLE`, `BLOCKED`, filtered out of a list) is entirely the calling domain's own, unchanged error model in `hazardReplay.ts` / `earthquakePersistedRunHistory.ts` / `discoveryEngine.ts`'s consumers.
- **Never replace corrupted evidence under its own id:** under the `'reject-if-different'` policy (hazard provenance), an id already occupied by an entry that fails `validateRecord` is treated the same as an id occupied by different valid content — the write is rejected (`DuplicateRecordConflictError`), never silently accepted as if the id had been free.

## What changed

- `core/provenance/recordStore.ts`: `isPlainRecordCollection`, `sanitizeRecordCollection`, `setRecordEntry` (the last two using `Object.defineProperty`, never bracket assignment, so a `__proto__`/`constructor`/`prototype` id can never be reinterpreted as a prototype mutation). `InMemoryRecordStore` and `LocalRecordStore` both take an optional `validateRecord` predicate; `LocalRecordStore` splits its internal read into `readRawAll()` (shape-only, used by `put`/`delete`/`list`) versus the content-validated view `get()` applies on top.
- `core/discovery/evidenceStore.ts`: added `isStoredEvidenceShape` and passed it to both `InMemoryEvidenceStore`/`LocalEvidenceStore`. Domain policy unchanged — still `'overwrite'`.
- `core/hazard/hazardProvenanceStore.ts`: added `isSourceArtifactShape`/`isHazardInputShape`/`isHazardRunShape` and passed them to all three collections in both `InMemoryHazardProvenanceStore`/`LocalHazardProvenanceStore`. Domain policy unchanged — still `'reject-if-different'`.
- `core/hazard/hazardReplay.ts`, `core/simulationRenderer/earthquakePersistedRunHistory.ts`: **not modified.** Their existing "not found → `NOT_REPRODUCIBLE`/`BLOCKED`/filtered" handling already does the right thing once `get()` correctly reports a corrupted record as `null` instead of handing back garbage — no new special-casing was needed there.

## Local reproduction

```bash
npm run lint
npm run test --workspace=packages/frontend -- --maxWorkers=1
npm run test --workspace=packages/backend
npm exec --workspace=packages/frontend -- tsc --noEmit
npm run build
git diff --check
```

New test file: `packages/frontend/src/__tests__/persistenceIntegrityBoundary.test.ts` (17 tests) covering legacy epidemic/hazard records, malformed JSON, `null`/array/primitive, reserved-key poisoning (both read-side stripping and write-side rejection), a semantically invalid run never producing a fabricated `MATCH`, `reject-if-different` blocking both a real content conflict and a write attempted over a corrupted existing record, `overwrite` staying compatible, Earthquake history staying read-only (`putArtifact`/`putInput`/`putRun` spied and asserted uncalled), and an import scan confirming no City3D/GIS/Scientific-Core import.

**NO HAZARD SOLVER / NO GIS / NO CASCADES / NO CITY3D / NO EPIDEMIC CORE CHANGE.**
