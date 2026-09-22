# Migration Notes — V1 mega pack → V2 corrected

Written for Codex, doing the real-repo integration. This package was built directly
against the real V1 source (extracted from the originally-delivered zips), not
reconstructed from memory, so file/line references below are accurate against those
zips.

## 1. Mirror consolidation

**Removed:** D-142 V2's `src/mirror.ts` (`GenesisMirrorRuntime`, `MirrorState`,
`BrowserCameraFrameSource`), bio-real-lab-v1's `src/mirror.ts` (`MirrorController`,
`MirrorState`, `BrowserCameraSource`) — two independent, near-identical
implementations.

**Kept as canonical:** `src/mirror/mirrorContract.ts` (state machine, based on D-142's
version — it already had a working `divergence()` method) + `src/mirror/cameraSource.ts`
(`BrowserCameraFrameSource` real getUserMedia adapter + `FakeCameraFrameSource` for
tests/demos, drop-in for the real repo's hardcoded `agenticScienceRuntime.ts`
SYNTHETIC_FALLBACK event script).

**Real-repo decision required (not made by this package):** whether the real repo's
`packages/core/src/flagship/mirrorTwin.ts` gets replaced by this contract outright, or
whether this contract is only adopted by new callers while `mirrorTwin.ts` stays as-is.
See `src/mirror/legacyNotes.ts` for the full state-name compatibility mapping.
`GenesisMirrorBridge.ts`/`GenesisMirrorClient.ts` (already dead code in the real repo)
are unaffected either way — they were never a competing state machine, just an
unreachable bridge/client pair.

## 2. Device-safety taxonomy

**Real repo (already committed, D-140):** `packages/frontend/src/core/lab/devicePorts.ts`
`DeviceExecutionMode = 'SIMULATED'|'REPLAY'|'HARDWARE_IN_LOOP'|'LIVE_READ_ONLY'|'LIVE_CONTROLLED'`
— **left untouched**, this package only adds a mapping adapter
(`src/deviceSafety/legacyAdapters.ts::fromDeviceExecutionMode`), it does not ask you to
rename the real type.

**D-142, bio-real-lab, core-hardening:** their own `BayMode`/`RealLabMode`/`RiskClass`
types are similarly left in place (backward-compatible API shape), with mapping
adapters. Bind new integration code to `src/deviceSafety/deviceSafetyContract.ts`'s
`CanonicalDeviceSafety`; don't rewrite the legacy types away, map into the canonical one
at integration boundaries.

**Important:** `fromDeviceExecutionMode('HARDWARE_IN_LOOP')` and
`fromDeviceExecutionMode('LIVE_CONTROLLED')` return `UNMAPPABLE_REQUIRES_HUMAN_REVIEW`,
not a mapped safe mode. If any real-repo code path can reach either of those two
`DeviceExecutionMode` values, that is a real-repo question this package deliberately
does not answer for you — investigate `devicePorts.ts`'s actual call sites before
deciding how (or whether) to route them through this contract at all.

## 3. D-141 fixes

File-for-file changes vs. the original zip's `src/`:

- `types.ts`: added `META_OBSERVATION_RECORDED` to `MetaEvidenceEvent.type`; added
  `EffectiveClaim extends KnowledgeClaim { derivedState: EpistemicState }`;
  `SelfModelSnapshot.claims` is now `EffectiveClaim[]`.
- `metaEngine.ts`: `recomputeContradictions()` is now `async` and diff-emits
  `META_CONTRADICTION_DETECTED` for newly-detected contradictions only (was: silent, no
  emission at all — dead branch in old `emit()`). `getClaim()`/`snapshot()` now return
  `EffectiveClaim` with `derivedState` computed at read time — the stored claim's
  `state` field is never mutated. `recordObservation()` always emits
  `META_OBSERVATION_RECORDED`. `screenFreeText()` (new, in `policy.ts`) is called from
  every `record*` method against every free-text field, not only
  `DecisionTrace.decision`. `deps.memory` is optional; the only write to it happens
  inside the single `emit()` choke point, as a mirror of what went to `EvidencePort` —
  never an independent write.
- `memory.ts`: unchanged behavior, relabeled TEST/DEBUG-ONLY in its header, constructor
  now optionally takes a `HashPort`.
- `hash.ts`: no longer owns `fnv1a32`/`canonicalJson` — delegates to an injected
  `HashPort` (`../hashReplay/hashPort.ts`), defaulting to the TEST-ONLY implementation.
- `contradictions.ts`, `surprise.ts`, `informationGain.ts`: logic unchanged (no defects
  found in these), only updated to accept an optional `HashPort`.
- `worldDirectorAdapter.ts`: `epistemicLabel` now typed via the canonical
  `EpistemicLabel` from `../historicalEpistemic/epistemicTaxonomy.ts` instead of a
  locally re-declared union; mapping logic moved to
  `epistemicTaxonomy.ts::toD141ClaimState` (same behavior).

**Production binding required from Codex:** `EvidencePort` → real
`EvidenceLedger`/`kernelLedger` (reuse D-140's `genesisEvidencePort.ts` adapter
pattern — do not write a new one from scratch). `hash` dep → real
`core/events/hash.ts`'s `fnv1a`/`canonicalJson`.

## 4. Hash/replay de-duplication

Four independent `fnv1a32`/`canonicalJson` pairs (D-141's `hash.ts`, D-142's
`determinism.ts`, core-hardening's `stable.ts`, world-visual's inline function in
`unrealProtocol.ts`) are now one contract: `src/hashReplay/hashPort.ts` (`HashPort`
interface) + `src/hashReplay/testHash.ts` (`TEST_ONLY_HASH_PORT`, standalone-test
default). Every fingerprinting call site in this package now takes an optional
`HashPort` parameter defaulting to the test implementation.

**Production binding required from Codex:** construct one `HashPort` wrapping the real
`core/events/hash.ts::fnv1a`/`canonicalJson`, and pass it into every engine/registry
constructor in this package (`GenesisMetaCognitionEngine({..., hash})`,
`new DataRegistry(hashPort)`, etc.) instead of relying on the TEST_ONLY default.

## 5. Historical epistemic taxonomy

World Director's `types.ts::EvidenceStatus`, D-141's `worldDirectorAdapter.ts`'s inline
union, and world-visual-v1's `historical.ts::HistoricalEpistemicLabel` all independently
declared `'EVIDENCE_BACKED'|'INFERRED'|'SIMULATED'|'CINEMATIC'` — same four values, three
separate nominal types, and World Director's own `policy.ts::epistemicForMode()` never
actually produces `EVIDENCE_BACKED`. Now one type + one validator:
`src/historicalEpistemic/epistemicTaxonomy.ts`.

**Production binding required from Codex:** point the real World Director's
`policy.ts::epistemicForMode` and `types.ts::EvidenceStatus` at this module's
`EpistemicLabel`/`fromWorldDirectorMode` instead of the locally-declared union (a type
alias is enough — the value set is unchanged, so this is a low-risk rename, not a
behavior change).

## 6. Core-hardening relabeling

No logic changes beyond HashPort adoption in `dataRegistry.ts`/`replay.ts` (see #4).
Every file header now states explicitly: this is a pure validator over
externally-supplied facts, never a registry that scans the real repo itself. Codex must
still write the code that gathers real `ImplementationRef[]`/`ModuleReachabilityRecord[]`
rows from the actual source tree — this package only validates rows once you have them.

## 7. D-142 safety-gate fix

`src/precisionBay/controller.ts::recordApproval()` now calls `assertResearchOnly(this.snapshot())`
as its first line, matching every other state-mutating method. Regression-tested in
`tests/run.ts` (block 14): after `emergencyStop()`, `recordApproval()` now correctly
throws instead of silently succeeding and overwriting `stage` back to `APPROVAL`.

## 8. AI Provider Router

File-for-file changes vs. the original zip's `src/`:

- `types.ts`: added `CYBER_SCIENTIST_REASONING` to `TaskClass` (V1 had no such member,
  only `CYBER_DEFENSIVE_REVIEW`/`CYBER_REMEDIATION_REVIEW`, a naming mismatch against
  the integration brief's vocabulary — both originals kept for compatibility). Added
  `ModelResultKind = 'REASONING_ONLY' | 'VERIFIED_BY_SOLVER'` and
  `REASONING_ONLY_BY_DEFAULT` (the set of task classes a raw provider result may never
  self-report as verified: `SCIENTIFIC_REASONING`, `DRUG_CANDIDATE_RESEARCH`,
  `CYBER_SCIENTIST_REASONING`).
- `router.ts`: new `attachSolverVerification(result, solverEvidenceRef)` — the ONLY way
  a `ModelResult` may carry `resultKind: 'VERIFIED_BY_SOLVER'`; `GenesisModelRouter.run()`
  now throws if a provider ever self-reports anything but `REASONING_ONLY` for a guarded
  task class. Also: `policy.select()` and the provider-lookup are now inside the same
  try/catch as provider execution, so "no eligible provider" and "provider not
  registered" both now emit `MODEL_FAILED` evidence (V1 emitted nothing on those paths).
- `adapters.ts`: both `OpenAIResponsesProvider`/`AnthropicMessagesProvider` now always
  set `resultKind: "REASONING_ONLY"` explicitly (no behavior change — this is what they
  always produced, just now typed).
- `policy.ts`: unchanged (audit found no defect — already fully vendor-agnostic).

**Production binding required from Codex:** real `ModelProvider` instances per vendor
(real API-key-bearing SDK/HTTP clients matching the structural adapter interfaces — this
package supplies none), a real `RoutingEvidencePort`, a `ProviderDescriptor` roster, and
— separately, this is Genesis-side work this package cannot do for you — the actual
discipline of calling `attachSolverVerification()` only after a real solver has run and
confirmed a model's proposal.

## 9. Astra World Author

File-for-file changes vs. the original zip's `src/`:

- `types.ts`: `EpistemicLabel` is now `export type { EpistemicLabel } from
  "../historicalEpistemic/epistemicTaxonomy.js"` instead of a local declaration.
- `validation.ts`: `validateHistoricalClaims()` now calls the canonical
  `validateHistoricalClaim()` (mapping `entityOrFeature`→`entityId`) for the
  EVIDENCE_BACKED/INFERRED field rules, instead of duplicating that logic; the
  "unsupported label" membership check stays local (it's the necessary safety net for
  `schema.ts`'s type guard, which only checks `typeof label === "string"`, never that it's
  one of the 4 allowed values — do not remove this check even though it looks redundant).
- Everything else (`orchestrator.ts`, `assets.ts`, `astraAdapter.ts`, `prompt.ts`,
  `presets.ts`, `codexTasks.ts`, `schema.ts`, `ports.ts`) is unchanged — the audit found
  no other defect: the control-flow orchestration is sound, `worldGraphRef`/
  `worldFrameRef` are deliberately `unknown`, and no WorldGraph/mesh/entity structure is
  built anywhere in this package.

**Production binding required from Codex:** `WorldAuthorProvider` (real OpenAI/Astra
client), `AssetCatalogPort`, `CanonicalWorldSpecValidatorPort` (this package's own checks
are additive to, not a replacement for, host validation), `CanonicalWorldDirectorPort`
(the real World Director that actually builds `WorldGraph`/`WorldFrame`), `EvidencePort`
→ real EvidenceLedger. Also: point the real World Director's `policy.ts::EvidenceStatus`
at this pack's canonical `EpistemicLabel` (see §5) — the audit could not confirm three
specific prior duplicate-taxonomy locations existed in the *real repo* itself (they were
found only in other *vendor zips* from this campaign), so this is a reconciliation
between vendor packages, not a fix to something already broken in the host.

## 10. Cyber Scientist

File-for-file changes vs. the original zip's `src/`:

- `types.ts`: `AuthorizedScope` now has a doc comment explicitly stating it is a
  self-consistency-checked data contract, NOT an enforced sandbox boundary (audit
  confirmed zero network/fs/process-execution code exists anywhere in this package).
  Added `CYBER_PATCH_BUDGET_EXCEEDED` to `CyberEvidencePort`'s event union.
- `scope.ts`: `targetAllowed()` now has a doc comment clarifying it was dead code in V1
  (defined, never called) and remains unused BY DESIGN in this package — it protects
  nothing until a real host-bound `DefensiveAnalyzerPort` that reaches a real network
  target actually calls it.
- `remediation.ts`: `DefensiveRemediationLoop.fixRetest()` now takes `state` and
  `budget` and checks `state.patchProposals >= budget.maxPatchProposals` BEFORE
  proposing a patch, incrementing `state.patchProposals` on every real proposal and
  emitting `CYBER_PATCH_BUDGET_EXCEEDED` + returning `{approved:false, blocked:true}`
  once exhausted. V1 declared this budget field but never read, checked, or incremented
  it anywhere — "bounded autonomous campaigns" was not actually bounded for patches.
- `campaign.ts`, `attackPath.ts`, `ports.ts`: unchanged (audit found the FIND/VALIDATE
  campaign loop and the abstract attack-path algorithm both sound;
  `maxHypotheses`/`maxAnalyzerRuns` were already correctly enforced).

**Production binding required from Codex:** one real tool per `DefensiveAnalyzerPort`
kind (Semgrep/CodeQL for STATIC_ANALYSIS, OSV-Scanner/npm audit for DEPENDENCY,
gitleaks/trufflehog for SECRET_SCAN, a real fuzzer for FUZZ, syft/cyclonedx for SBOM, an
OSV/NVD client for ADVISORY — none exist in this package, it is orchestration only), a
real `RepoInventoryPort`, `ThreatModelPort`, `PatchProposalPort`, `ApprovalPort` (the
actual human-in-the-loop gate), `RetestPort`, and real `CyberEvidencePort`/
`SecurityReportPort`/`CyberMatrixPort` bindings — most plausibly to D-141's
EvidenceLedger and a reporting/matrix store.

## 11. Drug Discovery

File-for-file changes vs. the original zip's `src/` (the largest fix set this round):

- `types.ts`: added `CONFLICTING_EVIDENCE` to `CandidateStatus`. Added `conflicting:
  boolean` to `ResearchGateDecision`.
- `evidenceGate.ts`: now returns the explicit `conflicting` field instead of only
  folding conflicts into the generic `reasons[]` array.
- `multifidelity.ts`: `MultiFidelityCampaign.run()`'s `if (!engine) continue;` (an
  unbound stage silently producing NO ComputeResult and no ledger entry at all) is now
  treated identically to "engine bound but `available()===false`" — both produce an
  explicit `ComputeResult{status:"BLOCKED"}` (engineId `UNBOUND:<stage>` for the
  never-bound case, so the two situations remain distinguishable in the evidence trail).
- `winnerGate.ts`: `ResearchSelection.rejected` entries now carry the `conflicting` flag
  from `evidenceGate` instead of requiring callers to string-match `reasons`.
- `identity.ts`: unchanged logic (still structural-only, as before), but its doc comment
  now points at `pipeline.ts` as the place `CandidateIdentityGuardPort` is actually
  called — V1 defined that port and never invoked it anywhere in the package.
- **`pipeline.ts` (NEW FILE)**: the orchestrating pipeline V1 never had.
  `runCandidatePipeline()` wires: identity guard (can BLOCK before any compute runs) →
  `MultiFidelityCampaign` → `falsifyCandidate` (can reach `FALSIFIED`) → `evidenceGate`
  (routes to `CONFLICTING_EVIDENCE` distinctly from `REJECTED`) → `scoreResearchPriority`
  (only reached if evidence-gate passes cleanly) → final status `RESEARCH_PRIORITY` or
  `RETAINED` depending on the score floor. `candidate.status` is now genuinely assigned
  at every step — V1 had `CandidateRecord.status` declared but never written to by any
  function in the package.
- `scoring.ts`, `falsification.ts`, `config.ts`: unchanged (audit found the non-efficacy
  labeling here compile-time-enforced and sound).

**Production binding required from Codex:** `CandidateEvidencePort` (custody/evidence
ledger), `MolecularEnginePort` × 4 (real RDKit/docking/PySCF-QM/ADMET adapters — this
package computes zero chemistry itself), `CandidateIdentityGuardPort` (a real
canonical-SMILES/InChIKey/semantic identity check — `structuralIdentityCheck` alone is
presence-only, not real identity verification). Also absent from this package entirely,
by design (delegate to the host, don't reimplement): deterministic fingerprinting for
candidates (`inchiKey`/`hash` fields exist on the types but nothing computes them —
reuse this pack's own `hashReplay/` `HashPort` for this rather than adding a fifth
private hash implementation).

## Everything else (unchanged from V1, still correct)

- D-142's `BayMode`/`RealDeviceCommand = never`/`assertNoRealActuation()` — no real
  actuation path existed in V1 and still doesn't in V2.
- All duplicate-architecture findings from the V1 audit (no bespoke WorldGraph,
  EvidenceLedger, command bus, or "medical solver" anywhere in any package) — still
  true, unchanged in V2.
