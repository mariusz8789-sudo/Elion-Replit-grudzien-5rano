# Capability Matrix — Genesis Integration Mega Pack V2

Status values: `IMPLEMENTED` (real code + test in this package), `IMPLEMENTED_AS_PORT`
(contract defined, host must bind an implementation), `REQUIRES_REPO_BINDING` (works
standalone, needs a real-repo adapter to be meaningful), `NOT_VERIFIABLE_IN_CLOUD`
(cannot be honestly confirmed in this sandbox), `NOT_INCLUDED`.

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Canonical Mirror state machine (9 states) | IMPLEMENTED | `src/mirror/mirrorContract.ts`, test block 1 |
| 2 | Mirror camera consent gating | IMPLEMENTED | `mirrorContract.ts::begin/capture`, test block 1 |
| 3 | Mirror divergence/resync lifecycle | IMPLEMENTED | `mirrorContract.ts::divergence/resync`, test block 1 |
| 4 | Real getUserMedia camera source | IMPLEMENTED_AS_PORT / NOT_VERIFIABLE_IN_CLOUD | `src/mirror/cameraSource.ts` — code exists, physical-camera correctness unverifiable here |
| 5 | Mirror consolidation (no duplicate state machines) | IMPLEMENTED | test block 2 (structural check on precisionBay/bioRealLab exports) |
| 6 | Canonical device-safety taxonomy | IMPLEMENTED | `src/deviceSafety/deviceSafetyContract.ts` |
| 7 | Legacy device-mode mapping (D-140/D-142/bio-real-lab/core-hardening) | IMPLEMENTED | `src/deviceSafety/legacyAdapters.ts`, test blocks 4-7 |
| 8 | Honest UNMAPPABLE handling for actuation-capable legacy values | IMPLEMENTED | `legacyAdapters.ts`, test block 4 (LIVE_CONTROLLED/HARDWARE_IN_LOOP) |
| 9 | D-141 auto-derived CONTRADICTED (non-destructive) | IMPLEMENTED | `src/d141/metaEngine.ts::toEffective`, test block 8 |
| 10 | D-141 real META_CONTRADICTION_DETECTED emission | IMPLEMENTED | `metaEngine.ts::recomputeContradictions`, test block 8 |
| 11 | D-141 META_OBSERVATION_RECORDED for every observation | IMPLEMENTED | `metaEngine.ts::recordObservation`, test block 9 |
| 12 | D-141 broadened consciousness-framing guard | IMPLEMENTED | `policy.ts::screenFreeText`, test block 10 |
| 13 | D-141 memory demoted to optional mirror | IMPLEMENTED | `metaEngine.ts` constructor + `emit()`, test block 11 |
| 14 | D-141 EvidencePort → canonical EvidenceLedger binding | REQUIRES_REPO_BINDING | `src/d141/ports.ts` doc comment; binding itself is Codex's work |
| 15 | Canonical HashPort contract | IMPLEMENTED | `src/hashReplay/hashPort.ts`, test blocks 12-13 |
| 16 | HashPort adoption across d141/core-hardening/world-visual | IMPLEMENTED | grep for `HashPort`/`hashPort` across those dirs; test block 13 |
| 17 | HashPort → real `core/events/hash.ts` binding | REQUIRES_REPO_BINDING | not this package's job — Codex constructs the real HashPort |
| 18 | Canonical historical epistemic taxonomy | IMPLEMENTED | `src/historicalEpistemic/epistemicTaxonomy.ts`, test block 19 |
| 19 | World Director policy.ts / D-141 adapter reconciled to one type | REQUIRES_REPO_BINDING | `worldDirectorAdapter.ts` uses it; real World Director `policy.ts` still needs the type-alias swap (see MIGRATION_NOTES.md §5) |
| 20 | Core-hardening validators (ownership/reachability/data registry/replay/SLO/security/external-validation/release-gate) | IMPLEMENTED | `src/coreHardening/*`, test blocks 13, 18 |
| 21 | Core-hardening relabeled as adapter/validator (not source of truth) | IMPLEMENTED | file header comments across `src/coreHardening/*` |
| 22 | D-142 recordApproval() emergency-stop fix | IMPLEMENTED | `src/precisionBay/controller.ts`, test block 14 |
| 23 | D-142 core flow regression (observe→localize→propose→simulate→compare→complete) | IMPLEMENTED | test block 15 |
| 24 | D-142 device-shadow read-only contract | IMPLEMENTED | test block 16 |
| 25 | D-142 no-real-actuation guard | IMPLEMENTED | test block 17 |
| 26 | bio-real-lab metaAdapter epistemic-weighted contradiction | IMPLEMENTED | `src/bioRealLab/metaAdapter.ts`, test block 20 |
| 27 | Full standalone build/test verification | IMPLEMENTED | `npm run verify` → tsc strict + 20/20 tests, independently reproducible from clean `src/` |
| 28 | Real-repo Biomedical Bay binding for D-142 | NOT_INCLUDED | out of scope for this package; also flagged earlier as branch-dependent in the real repo (exists on `claude/genesis-c1-visual-snapshot`, not the current working branch) |
| 29 | Real Unreal Engine toolchain execution | NOT_INCLUDED | protocol data only, no toolchain, no real repo target exists |
| 30 | Medical/clinical/regulatory validation | NOT_INCLUDED | explicitly out of scope everywhere in this package |
| 31 | CYBER_SCIENTIST_REASONING task class routable | IMPLEMENTED | `src/providerRouter/types.ts`, newModules test block 1 |
| 32 | Provider-router solver-verification guardrail (resultKind) | IMPLEMENTED | `src/providerRouter/router.ts::attachSolverVerification`, newModules test blocks 2, 4 |
| 33 | Provider-router evidence emission on early-throw failure paths | IMPLEMENTED | `router.ts::run` try/catch scope, newModules test block 3 |
| 34 | Provider-router vendor code concentration (adapters.ts only) | IMPLEMENTED | confirmed by original audit; `policy.ts`/`router.ts` remain vendor-agnostic |
| 35 | Astra World Author epistemic taxonomy reuse (no 5th declaration) | IMPLEMENTED | `src/astraWorldAuthor/types.ts` re-exports `historicalEpistemic`, newModules test block 6 |
| 36 | Astra proposal→validate→execute orchestration (no 2nd WorldGraph) | IMPLEMENTED | `worldGraphRef`/`worldFrameRef` stay `unknown`; newModules test blocks 5-6 |
| 37 | Astra reject-before-execute guarantee | IMPLEMENTED | newModules test block 6 (`executeCalled===false` on rejection) |
| 38 | Cyber Scientist maxPatchProposals budget enforcement | IMPLEMENTED | `src/cyberScientist/remediation.ts`, newModules test block 9 |
| 39 | Cyber Scientist campaign FIND→VALIDATE loop (no exploit/network code) | IMPLEMENTED | confirmed by original audit (zero fetch/exec/fs anywhere); newModules test block 8 |
| 40 | Cyber Scientist abstract attack-path ranking (sandbox-only label) | IMPLEMENTED | `src/cyberScientist/attackPath.ts`, newModules test block 10 |
| 41 | Drug Discovery CONFLICTING_EVIDENCE status | IMPLEMENTED | `src/drugDiscovery/types.ts`, `evidenceGate.ts`, newModules test block 12 |
| 42 | Drug Discovery identity guard actually wired/enforced | IMPLEMENTED | `src/drugDiscovery/pipeline.ts`, newModules test block 11 |
| 43 | Drug Discovery unbound-engine explicit BLOCKED (not silent skip) | IMPLEMENTED | `src/drugDiscovery/multifidelity.ts`, newModules test block 13 |
| 44 | Drug Discovery real orchestrating pipeline with status transitions | IMPLEMENTED | `src/drugDiscovery/pipeline.ts` (new file), newModules test block 14 |
| 45 | Drug Discovery non-efficacy score labeling (compile-time enforced) | IMPLEMENTED | `scoring.ts`/`evidenceGate.ts`/`winnerGate.ts` literal `label` types, newModules test block 14 |
| 46 | RDKit/docking/QM/ADMET real chemistry | NOT_INCLUDED | pure orchestration over `MolecularEnginePort`; host must bind real engines |
| 47 | Real static analysis / secret scanning / fuzzing / SBOM / CVE feeds | NOT_INCLUDED | `DefensiveAnalyzerPort` type vocabulary only; host must bind one real tool per kind |
| 48 | Real AI provider API calls (OpenAI/Anthropic/Astra) | NOT_INCLUDED | zero SDK imports anywhere; host injects real clients |
| 49 | Real network/exploit/offensive-security execution | NOT_INCLUDED | confirmed absent by full-source audit; package has no network/exec/fs primitives at all |
| 50 | Deterministic candidate fingerprinting (Drug Discovery) | NOT_INCLUDED | `inchiKey`/`hash` fields exist on types but nothing computes them; reuse `hashReplay/HashPort`, do not add a 5th hash implementation |

**33/33** automated tests pass (`tests/coreModules.ts` 20/20 + `tests/newModules.ts`
13/13, run via `tests/run.ts`), independently re-run from a clean `src/` build — no
`dist/` was shipped for this package.
