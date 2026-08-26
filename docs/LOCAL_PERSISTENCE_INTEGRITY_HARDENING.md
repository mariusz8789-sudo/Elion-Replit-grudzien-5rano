# Local Persistence Integrity Hardening

## Purpose and boundary

This pass hardens the shared local-only keyed record store used by epidemic Evidence and Hazard Provenance records. It changes neither record schemas nor domain policies: Evidence remains overwrite-permitted, Hazard Provenance remains immutable (`reject-if-different`), and each domain retains its existing storage key.

The pass does not add a data adapter, network request, GIS behavior, hazard solver, cascade, renderer, CityWorld mutation, scientific-model behavior, deployment step, or new persistent backend.

## Retained-data policy

| Retained local value                                             | Read behavior                                                  | Mutation behavior                                   | Rationale                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Existing flat record map                                         | Readable                                                       | Existing overwrite/immutable policy applies         | Backward-compatible with all prior local records.                         |
| Invalid JSON                                                     | Safe storage fallback                                          | Starts from normal fallback behavior                | Existing `core/storage.ts` behavior remains unchanged.                    |
| Parsed array, scalar, or `null`                                  | `get` returns `null`; `list` returns `[]`; `delete` is a no-op | `put` rejects with `MalformedRecordCollectionError` | Prevents a later write from silently destroying unreadable retained data. |
| Prototype-sensitive id (`__proto__`, `constructor`, `prototype`) | Never exposed                                                  | `put` rejects; `delete` is a no-op                  | Prevents prototype-sensitive collection mutation.                         |
| Inherited Object member                                          | Never exposed as a record                                      | Normal own-id behavior only                         | Prevents type confusion from prototype values such as `toString`.         |

The retention choice is deliberately conservative. A malformed outer collection cannot be interpreted honestly as a keyed record map, so it is left untouched rather than silently overwritten. A valid legacy flat map continues to load and can be extended normally.

## Replay safety and validation

The preceding canonical replay safeguard ensures an evaluator exception resolves to `BLOCKED`, never a fabricated `MATCH` and never a rejected read-only history operation. The persistence regressions cover malformed collection preservation, safe reads/lists/deletes, rejected destructive writes, legacy flat-map compatibility, unchanged overwrite and immutable policies, unsafe ids, and inherited-property fencing.

The full local quality gate passed: high/critical dependency audit, lint, all frontend tests, all backend tests, frontend typecheck, production build, formatting, and whitespace validation. The existing real Chromium Earthquake proof also passed at 1920×1080. It confirmed the synthetic READY flow, complete evidence, replay `MATCH`, mapping metadata, local persisted history, evidence export, accessible READY/BLOCKED outcome states, clear behavior, and exactly one `.city-3d-canvas` while the app contained two unrelated canvases overall. The retained JSON proof is `artifacts/earthquake-city3d-runtime-proof.json` and the retained visual capture is `artifacts/screenshots/city3d-earthquake-demonstrator-1920x1080.png`.

Commit [`19fbb6e`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/commit/19fbb6e379c27df5f21d29c71b4ff4758cd030a8) also passed the exact remote quality gate in [GitHub Actions run `32958717557`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32958717557): dependency audit, whitespace, lint, frontend tests, backend tests, typecheck, production build, and artifact upload all completed successfully.
