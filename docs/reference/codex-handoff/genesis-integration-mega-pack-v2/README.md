# Genesis Integration Mega Pack V2

Standalone, dependency-free TypeScript transfer package consolidating **eleven** vendor
packages received across this campaign into one corrected, tested, integration-ready
deliverable:

- World Director V1, D-141 Meta-Cognition V1, D-142 Precision Intervention Bay V2,
  bio-real-lab-v1, core-hardening-v1, world-visual-v1 (the earlier "10/10 mega pack",
  fully fixed — see the V2-corrected fix list below)
- **New in this pack:** AI Provider Router V1, Astra World Author V1, Cyber Scientist V1,
  Drug Discovery V1

It does **not** integrate into the real Genesis repository — it is a corrected transfer
package for Codex to bind, with a deliberately small remaining diff. See
`CODEX_INTEGRATION_PROMPT.md` for the binding order and `LOCAL_VALIDATION_CHECKLIST.md`
for what only Codex, locally, can finish verifying.

## Packages received this round and what happened to each

| Package (upload) | SHA-256 status | Outcome |
|---|---|---|
| genesis-ai-provider-router-v1.zip | new, independently verified | Audited + fixed → `src/providerRouter/` |
| genesis-astra-world-author-v1-final.zip | new, independently verified | Audited + fixed → `src/astraWorldAuthor/` |
| genesis-cyber-scientist-v1.zip (×2 uploads) | **byte-identical duplicate** (same SHA-256, confirmed before extracting either) | Audited once + fixed → `src/cyberScientist/` |
| genesis-drug-discovery-v1.zip | new, independently verified | Audited + fixed → `src/drugDiscovery/` |

No package from this round duplicated anything from the prior "10/10" round — all four
are genuinely new capability areas.

## What changed vs. each V1 package (full detail in MIGRATION_NOTES.md)

### Carried forward, unchanged in substance, from the prior V2-corrected pack
1. **Mirror consolidation** (`src/mirror/`) — one canonical `GenesisMirrorRuntime`.
2. **Device-safety taxonomy unification** (`src/deviceSafety/`).
3. **D-141 fixes** (`src/d141/`) — real contradiction emission, non-destructive derived
   state, `META_OBSERVATION_RECORDED`, broadened consciousness guard, memory demoted.
4. **Hash/replay de-duplication** (`src/hashReplay/`).
5. **Historical epistemic taxonomy reconciliation** (`src/historicalEpistemic/`).
6. **Core-hardening relabeled** (`src/coreHardening/`).
7. **D-142 `recordApproval()` safety-gate fix** (`src/precisionBay/controller.ts`).

### New this round
8. **AI Provider Router** (`src/providerRouter/`) — added the missing
   `CYBER_SCIENTIST_REASONING` task class; added a `resultKind: 'REASONING_ONLY' |
   'VERIFIED_BY_SOLVER'` field + `attachSolverVerification()` guardrail so raw model
   output can never silently pass as a verified scientific/drug/security result; fixed
   two evidence-emission gaps on early-throw failure paths in `router.run()`.
9. **Astra World Author** (`src/astraWorldAuthor/`) — its `EpistemicLabel` now re-exports
   the one canonical taxonomy from `historicalEpistemic/` instead of declaring a fifth
   independent copy of the same 4 values; `validation.ts` now delegates the
   EVIDENCE_BACKED/INFERRED field rules to the canonical validator instead of
   duplicating that logic. Confirmed by audit: genuinely a lightweight proposal/patch
   layer, not a second world engine — `worldGraphRef`/`worldFrameRef` stay `unknown`.
10. **Cyber Scientist** (`src/cyberScientist/`) — `SecurityCampaignBudget.maxPatchProposals`
    is now actually enforced (`DefensiveRemediationLoop.fixRetest` blocks once the
    budget is spent, emitting `CYBER_PATCH_BUDGET_EXCEEDED`); `scope.ts::targetAllowed`
    is now explicitly documented as protecting nothing until a real host-bound analyzer
    calls it. Confirmed by audit: zero network/filesystem/process-execution code exists
    anywhere in this package — every "capability" (static analysis, secret scanning,
    fuzzing, SBOM, CVE feeds) is a port a host must bind a real tool to.
11. **Drug Discovery** (`src/drugDiscovery/`) — **the most substantial fix this round**:
    added a real orchestrating `pipeline.ts` (V1 had none — only disconnected, correctly
    labeled building blocks with `CandidateRecord.status` never assigned anywhere);
    restored a first-class `CONFLICTING_EVIDENCE` status distinct from generic
    rejection; wired the previously-dead `CandidateIdentityGuardPort` into the pipeline
    so it can actually BLOCK a candidate; fixed `MultiFidelityCampaign` so an unbound
    compute stage produces an explicit `BLOCKED` result instead of silently skipping.

## Verification

- `npx tsc -p tsconfig.json --noEmit` — strict, clean.
- `npm run verify` (`tsc` build + `node dist/tests/run.js`) — **33/33 tests PASS**
  (20 core + 13 new), independently re-run from a clean `src/` build (no `dist/` shipped).
  See `tests/coreModules.ts` and `tests/newModules.ts` for what each covers.

## What this package does NOT do

- Does not touch the real Genesis repository.
- Does not implement real physical camera capture validation (unverifiable in a cloud
  sandbox — see `src/mirror/cameraSource.ts`'s header).
- Does not implement an Unreal Engine toolchain or claim Unreal execution.
- Does not implement or enable real device actuation anywhere.
- Does not implement any real chemistry (RDKit/docking/QM/ADMET), static analysis,
  secret scanning, fuzzing, SBOM, or CVE-feed logic — all of these remain host-bound
  ports; see `LOCAL_VALIDATION_CHECKLIST.md`.
- Does not claim medical, clinical, regulatory, or offensive-security capability beyond
  abstract, sandboxed simulation.
- Does not call any real AI provider API — `src/providerRouter/adapters.ts` has zero
  SDK imports; real clients are 100% host-injected.
