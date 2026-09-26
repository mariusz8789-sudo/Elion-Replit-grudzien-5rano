# Genesis integration and deploy-candidate report — 2026-09-22

## Decision

The integrated working tree is a **full deploy candidate with explicitly disabled optional scientific engines**. Frontend, backend, core, CSRN, production build and real-browser checks pass. Optional PySCF, ADMET-AI, OpenMM, AutoDock Vina/Meeko, Biopython reference data and DepMap data stay fail-closed and are never reported as available. No merge or deployment was performed.

Verified integration branch and base HEAD:

- branch: `codex/genesis-final-integration`
- base HEAD: `d48edeb0ef9b403c253806c935c41d49096a86fa`
- Claude source branch: `claude/genesis-final-science-integration` at `0bd129bc847239f3f2b20c75c60b7a6e97f3b2d7`
- verification covers the combined Claude/Codex working tree; the final integration commit is reported after this document is committed

Claude's implementation was selectively imported from `claude/genesis-final-science-integration`, reviewed against the canonical repository and then extended locally. Accepted work includes the ModelRouter seam, D-141 scientific metrics and DecisionTrace, the bounded scientific campaign coordinator, candidate research matrix/identity guard and cyber scope/budget/approval primitives. The proposed standalone logistic solver adapter was rejected because Genesis already has canonical logistic/cell-cycle solvers and the adapter had no production consumer. No transfer package, second ledger, second solver registry or orphan allowance was added.

## Claude/Codex ownership and integration

- Claude-owned source was confined to `experimentFabric/modelRouter.ts`, `experimentFabric/scientificIntegration.ts`, `metaCognition/{scientificMetrics,decisionTrace}.ts`, the backend campaign adapter, drug candidate guard/matrix, and cyber scope/budget primitives plus focused tests.
- Codex owned canonical world generation/rendering, Human Explorer, browser routes/E2E, backend recovery, runtime cyber enforcement, final API/UI reachability, validation and release evidence.
- Exact path comparison before import found **zero shared paths**. The final cyber runtime edits deliberately consume Claude's primitives after import; they are an integration step, not parallel edits.
- Rejected/reference-only: `specialistSolvers.ts`, its focused test and the proposed `solverRouter.ts` export. Existing canonical solvers remain authoritative.

## Completed production paths

### V6 scientific interiors

- `MATERIALS_LAB` is generated through the canonical `WorldSpecification -> compiler -> WorldBlueprint -> generateWorld -> WorldGraph -> worldFrameState -> WorldFrameRenderer` path.
- The generated room contains real `ASSET_SLOT` entities for `SPECTROMETER_STATION`, `THERMAL_STAGE_STATION` and `COMPUTE_STATION`.
- Browser evidence records the real room and asset-slot IDs and confirms each slot is rendered.
- Scientific equipment remains honestly marked unbound where it is only a visual model; no solver result is inferred from monitor geometry.

### V6.1 camera/capture/replay

- The canonical camera now interpolates position and look target continuously between generated keyframes.
- Camera seeks/loop wraps increment a continuity epoch and clear stale selection/highlight; FOV and DOF are recomputed on the next frame.
- Real browser captures at multiple simulation times produce distinct screenshot SHA-256 values, semantic fingerprints and canonical EvidenceLedger hashes.
- Accumulation cut/reset remains the one strict blocked row because the renderer has no TAA/temporal accumulation history. No artificial history buffer was added to satisfy the checklist.

### V7 Human Explorer

- Canonical semantic `ORGAN_SYSTEM -> ORGAN` relationships are represented separately from spatial hierarchy.
- Real Chromium completes `BODY -> ORGAN_SYSTEM -> ORGAN -> TISSUE -> CELL -> ORGANELLE -> MOLECULE`.
- The run includes a real positive heart raycast, production Hyperscope changes and four sealed-session replay MATCH results.
- Source-dependent confidence/resolution stays `UNKNOWN`/`UNSPECIFIED` where no defensible value exists.
- Runtime LOD switches the licensed GLB (83,686 triangles, 7 textures) and existing procedural proxy (6,116 triangles, 0 textures) while retaining the same canonical organ meshes and selection state.

### Human asset lifecycle

- Presentation state is `LOADING | READY | ERROR | BLOCKED`, independently from `PROXY | LICENSED_CC0_ASSET`.
- A successful full-human screenshot requires `READY`, `LICENSED_CC0_ASSET` and an observed rendered frame.
- Five cold and five repeat browser loads passed. Late async completion is guarded against replaced/closed scenes and unused resources are disposed.
- The current CC0 asset is a dressed exterior human and remains a temporary visual limitation; it is not the target full anatomical model.

### Dashboard Matrix

- The existing `LiveMatrixBackground` is mounted once on the dashboard only.
- Real browser checks cover animated desktop, lighter mobile, static reduced-motion and absence from Human Explorer.
- The layer contains green code without people and does not intercept pointer interaction.

### World Director

- Production routes expose modern scientific laboratory, modern city and historical reconstruction presets.
- Population, day/night, weather and existing navigation modes are passed into the canonical generation/runtime path.
- The laboratory preset deterministically requires a research campus so the requested canonical `MATERIALS_LAB` is actually reachable, rather than merely declared.
- Canonical evidence hashes are emitted for real generated worlds; the laboratory run produced `758fa345b8a023678123a1388616e8b5796df92f88af197877b4d9e8ef18315f`.
- Unreal bridge/skeleton remains disabled and is not counted as a capability.

### D-141 Meta-Cognition

- A production route exposes the eight epistemic states, gaps, contradictions, capabilities and suggested next experiment.
- Contradiction detection transitions to `CONTRADICTED` and emits the associated meta event.
- Observations that require evidence emit canonical events.
- Runtime data is derived from canonical Evidence/Memory/provider inputs. No persistent `AppendOnlyMetaMemory`, new goal registry or uncontrolled self-modifying mechanism was introduced.
- Goal capability is honestly presented as partial because the repository has no canonical goal system.

The final integration also adds source-grounded prediction-error, surprise and information-gain metrics plus a structured DecisionTrace fingerprint. The production Meta-Cognition route runs a bounded two-cycle scientific campaign through the existing `researchCampaign` and canonical ledger sink; browser evidence reports `COMPLETED`, two cycles, DecisionTrace `trace_91d3be37` and six Evidence records. No hidden chain-of-thought or duplicate persistent memory is stored.

### ModelRouter and scientific campaign

- One provider-neutral routing seam supports Astra/OpenAI, Claude/Anthropic and future private/local ports without embedding provider SDK logic in the campaign.
- Model output is always `REASONING_ONLY`. Only a real solver/tool result with Evidence references can become `VERIFIED_BY_SOLVER`.
- Unbound providers and unavailable tools fail closed as `BLOCKED`; the campaign is bounded by explicit cycle and budget limits.
- The production Meta-Cognition route reaches the existing experiment/research runtime through this coordinator. No second campaign engine or solver registry was introduced.

### Drug discovery and candidate gate

- The backend campaign report now exposes a candidate research matrix through the existing API path.
- Candidate identity and provenance are checked before compute. Conflicting evidence, safety veto, CHEAP/docking/QM/ADMET availability, falsification and research-gate outcomes remain explicit.
- Existing RDKit/docking/QM/ADMET engines are reused. An unbound, unavailable or failed engine never becomes a synthetic success; optional PySCF remains environment-blocked on this Windows runtime.

### Cyber Scientist

- Defensive execution remains limited to `REPOSITORY_ONLY`, `SANDBOX_RANGE` and `CI_EPHEMERAL` scopes.
- Runtime limits enforce `maxHypotheses`, `maxAnalyzerRuns` and `maxPatchProposals`.
- Patch application now requires a matching human approval record. Without approval, the production path stops at `HUMAN_APPROVAL_REQUIRED` and leaves the target unchanged.
- Evidence and retest continue through the existing cyber reasoning kernel; no generic offensive/network executor was added.

### Genesis Mirror

- The single canonical eight-state skeleton is production-reachable: `MIRROR_IDLE -> CONSENT_REQUIRED -> SCANNING -> SYNCING -> TWIN_READY -> DIVERGENCE_MODE -> CAPTURE -> REPLAY`.
- UI and evidence label it `EXPERIMENTAL / SYNTHETIC`; camera status is `NOT_CONNECTED`.
- No claim of real camera, face tracking or real mirror rendering is made. Mirror does not block this frontend candidate.

## Real-browser evidence

All listed captures came from Edge/Chromium 153.0.4234.48 at the real application routes. The JSON reports include URLs, timestamps, runtime state, errors and hashes where applicable.

- `artifacts/human-twin-review/browser-loads.json` — 5 cold + 5 repeat full-human loads
- `artifacts/human-twin-review/browser-macro.json` — full seven-stage macro-to-micro path
- `artifacts/human-twin-review/browser-surfaces.json` — Matrix, generated Materials/Compute and street
- `artifacts/human-twin-review/director-meta-mirror-browser.json` — World Director, Meta-Cognition and Mirror
- `artifacts/human-twin-review/after-body.png`
- `artifacts/human-twin-review/macro-{body,organ_system,organ,tissue,cell,organelle,molecule}.png`
- `artifacts/human-twin-review/world-director-{lab,city,historical}.png`
- `artifacts/human-twin-review/meta-cognition.png`
- `artifacts/human-twin-review/mirror-experimental.png`

## Validation results

| Check | Result |
| --- | --- |
| Frontend TypeScript | PASS |
| Root lint | PASS, exit 0 |
| Focused Claude/Codex integration tests | PASS, 93/93; follow-up cyber enforcement 41/41 before redundant solver-test removal |
| Mirror/core focused tests | PASS, 8/8 |
| Frontend full Vitest | PASS, 627/627 files; 6973 passed, 1 skipped |
| Core full Vitest | PASS, 46/46 files; 465/465 |
| CSRN tests/build | PASS, 5/5 files; 38/38; build PASS |
| Production frontend build | PASS, 1035 modules; non-blocking chunk/import warnings |
| Real browser loader | PASS, 10/10 |
| Real browser macro-to-micro | PASS, 7/7 plus organ picking/Hyperscope/replay |
| Real browser surfaces | PASS |
| World Director / Meta / Mirror browser | PASS within disclosed capability boundaries |
| Duplicate architecture audit | PASS for declarations/imports/call paths in scope |
| Full backend | PASS: 849 passed, 0 failed, 33 skipped of 882 |

The first high-parallelism frontend run produced timeout/resource-saturation failures and lacked the repository Git executable in PATH. Every affected file passed in a controlled sequential reproduction, then the entire suite passed with two workers and the verified Git PATH. The passing controlled run is the release result.

The exact frontend skip is `packages/frontend/src/__tests__/backendEvidenceExecution.test.ts:638`, named `executes both PySCF H2 basis arms against the real local Fabric and produces a MATCH Evidence Pack`. It is gated by `GENESIS_REAL_BACKEND === '1'` and requires the real local PySCF Fabric.

Backend recovery evidence is recorded in `artifacts/human-twin-review/backend-v2-baseline.log`, `backend-v2-rdkit.log`, `backend-v2-final.log` and the final backend validation log. The fresh baseline was 731 passed / 45 failed / 75 skipped. The repo-pinned RDKit 2026.3.6 was installed into the bundled Python runtime. Windows batch invocation was repaired to stream JSON through stdin instead of exceeding the command-line limit; tracked scientific fixtures were restored byte-for-byte from canonical Git blobs after CRLF expansion; dynamic ESM imports use file URLs; npm audit uses the Windows system certificate store without disabling TLS; and temporary Git-worktree cleanup tolerates the documented Windows handle race. After the Claude scientific integration tests were added, the complete controlled run finished at **849 passed / 0 failed / 33 skipped**. A sandbox-only attempt produced two `buildInfo` failures because worktree creation was denied; the same six build-info tests passed outside the sandbox and the final full run was clean.

The 33 backend skips are explicit capability gates: 32 require optional engines or approved data not present in this environment (ADMET-AI, PySCF, OpenMM, AutoDock Vina/Meeko, Biopython/PDB or DepMap), and one is the inverse “RDKit unavailable” case intentionally skipped because RDKit is available. A pinned PySCF 2.14.0 installation was attempted via the repository's own requirements file, but this Windows/Python combination had no wheel and its CMake source build made no progress; it remains `ENVIRONMENT_BLOCKED`, never synthetic PASS.

## Architecture audit

The final scan found one declaration each of canonical `WorldGraph`, `generateWorld`, `TemporalEngine`, `WorldFrameRenderer` and `EvidenceLedger`. It found no `AppendOnlyMetaMemory` and no production import of `core/visualStages`. The new routes call the existing generator, graph, renderer, evidence ledger and Human Digital Twin. Valid per-world/test instances of canonical classes are not parallel architectures.

Evidence: `artifacts/human-twin-review/duplicate-architecture-final-integration.txt` and `production-reachability-final.txt`.

## Strict 50-capability result

The earlier independent ledger scored 27 PASS / 16 PARTIAL / 7 BLOCKED. New real World Director evidence upgrades only `V6_EVIDENCE` from BLOCKED to PASS because the canonical generated room now emits a recorded SHA-256 evidence hash through the real route.

Current strict score: **33 PASS / 16 PARTIAL / 1 BLOCKED = 66%**.

`REAL_REPO_V6_V61_V7_100_E2E = false`.

The remaining BLOCKED row is `V61_CUT_RESET`: the current renderer has no temporal accumulation/TAA history to reset, so the release does not fabricate one merely to turn the row green.

No percentage is promoted from Node-only proof or visual resemblance.

## Visual assessment

The implementation is materially more stable and demonstrable, but it still does not match the supplied target concepts. The largest remaining visual gaps are the dressed exterior human, simplified procedural internal anatomy, sparse laboratory equipment, simple architectural geometry, bright/translucent head treatment in some modes and limited PBR/environment detail. Current laboratories and molecule stages are usable for a technical demo; Human Explorer remains the highest-impact future asset upgrade.

No paid asset was purchased or integrated. The previously preferred approximately USD 129 anatomy candidate remains deferred until after the current release and requires mesh separation, naming, picking/isolation, format, commercial redistribution, AI-use, optimization and Unreal-compatibility review.

## Files added for the final production routes

- `packages/frontend/src/core/worldDirector/genesisWorldDirector.ts`
- `packages/frontend/src/core/metaCognition/metaCognitionRuntime.ts`
- `packages/frontend/src/components/WorldDirectorScreen.tsx`
- `packages/frontend/src/components/MetaCognitionScreen.tsx`
- `packages/frontend/src/components/MirrorStatusScreen.tsx`
- `packages/frontend/src/__tests__/worldDirectorRuntime.test.ts`
- `packages/frontend/src/__tests__/metaCognitionRuntime.test.ts`
- `scripts/genesis-director-meta-mirror-e2e.mjs`

Existing V6/V6.1/V7, Human Explorer, Matrix, generator, renderer and navigation files were extended in place. The complete working-tree inventory is saved in `artifacts/human-twin-review/git-status-final.txt`.

## Commit/deploy state

- Integration branch: `codex/genesis-final-integration`.
- Commit message: `feat(genesis): complete canonical science integration`.
- No merge or deploy performed.
- Final verdict: **FULL_DEPLOY_READY** for the stated release scope, with optional scientific engines/data visibly disabled as described above. The strict V6/V6.1/V7 completion gate remains false at 66%; it is separate from deploy readiness.
