# Local Validation Checklist

Everything on this list is genuinely unverifiable from this cloud sandbox (no camera
hardware, no interactive browser session, no real AI provider credentials, no real
cheminformatics/static-analysis toolchain, no access to the real Genesis repo's current
branch state). Nothing on this list should be claimed as "PASS" without actually being
run locally by Codex or a human.

## Mirror / camera
- [ ] Real `getUserMedia()` call against actual camera hardware, in a real browser, with
      a real permission prompt (`src/mirror/cameraSource.ts::BrowserCameraFrameSource`).
- [ ] Playwright E2E driving the real integration path (fake-device flag is acceptable
      for CI; a genuine physical-camera run is not — see `--use-fake-device-for-media-stream`
      caveat: that proves the *code path*, not real camera correctness).
- [ ] Decide and record the Mirror consolidation product decision (replace `mirrorTwin.ts`
      or keep both) before any further Mirror work ships.

## Device safety / D-142 / bio-real-lab
- [ ] Confirm whether `D-140 DeviceExecutionMode`'s `HARDWARE_IN_LOOP` or
      `LIVE_CONTROLLED` values are actually reachable from any real code path in
      `devicePorts.ts`'s current call sites — this pack deliberately leaves them
      `UNMAPPABLE_REQUIRES_HUMAN_REVIEW` rather than guessing.
- [ ] Confirm current branch state for the real repo's Biomedical Intervention Bay
      (exists on `claude/genesis-c1-visual-snapshot` per earlier session audit, not
      necessarily the branch Codex is integrating on).

## AI Provider Router
- [ ] Real API calls against actual OpenAI/Anthropic/Astra endpoints with real
      credentials (this package has zero SDK imports and makes zero real network calls
      — `adapters.ts`'s structural client interfaces are the entire surface).
- [ ] Confirm rate-limiting/retry/timeout behavior under real provider conditions (not
      implemented in this package at all — host or injected client's responsibility).
- [ ] Confirm the real Genesis "approved provider" concept (if one exists) actually maps
      onto `ProviderDescriptor`/`RoutingPolicy` correctly — the shipped
      `DefaultGenesisRoutingPolicy` only knows quality/cost/preferred-id, not an
      "approved" flag.

## Astra World Author
- [ ] Real Astra/OpenAI Responses API call producing a real `WorldAuthorProposal` JSON
      payload, validated against `schema.ts`'s actual runtime guard (only ever exercised
      against fixture JSON in this package's own tests).
- [ ] Real asset catalog search against a real `AssetCatalogPort` implementation.
- [ ] Real `CanonicalWorldDirectorPort.execute()` producing a real `WorldGraph` — this
      package has never seen a real WorldGraph, only `unknown`.

## Cyber Scientist
- [ ] Real static-analysis tool (Semgrep/CodeQL or equivalent) bound to at least one
      `DefensiveAnalyzerPort`.
- [ ] Real dependency/SCA tool (OSV-Scanner/npm audit or equivalent).
- [ ] Real secret scanner (gitleaks/trufflehog or equivalent).
- [ ] Real SBOM generator (syft/cyclonedx or equivalent) if that capability is wanted.
- [ ] Real CVE/advisory feed client (OSV/NVD API or equivalent) if that capability is
      wanted.
- [ ] Confirm the authorized-scope boundary (`scope.ts`) is actually enforced by
      whatever real analyzer/network-capable tool gets bound — this package's own
      `assertScopeSafe`/`targetAllowed` are self-consistency checks on data, not a real
      sandbox; do not treat their presence as protection on its own.
- [ ] Real human-approval mechanism bound to `ApprovalPort` for the fix/retest loop.
- [ ] Confirm a fuzzing capability, if genuinely wanted, is a real fuzzer — "FUZZ" is
      currently only a type-level literal in `EvidenceRef.kind`, not implemented logic.

## Drug Discovery
- [ ] Real RDKit (or equivalent) bound to the `CHEAP` stage's `MolecularEnginePort`.
- [ ] Real docking engine bound to the `DOCKING` stage.
- [ ] Real QM engine (e.g. PySCF) bound to the `QM` stage.
- [ ] Real ADMET engine bound to the `ADMET` stage.
- [ ] Real `CandidateIdentityGuardPort` implementation — canonical-SMILES normalization,
      InChIKey cross-check, name-vs-label semantic matching. `structuralIdentityCheck`
      alone (shipped in this package) is presence-only, not real identity verification.
- [ ] Decide and implement real deterministic candidate fingerprinting, reusing this
      pack's `hashReplay/HashPort` — currently `inchiKey`/`hash` fields exist on types
      but nothing computes them.

## Repo-wide, after any binding above
- [ ] Full repo-root `tsc -b`.
- [ ] Full repo-root lint (must exit 0).
- [ ] This repo's own `moduleReachability.test.ts` convention for every newly-wired file
      (either genuinely production-reachable, or documented in `ALLOWED_ORPHANS` with a
      real reason).
- [ ] Full existing Vitest suite — zero new regressions.
- [ ] Production build succeeds.
- [ ] A fresh duplicate-architecture grep audit against the real repo (not just this
      package's own internal audit) — confirm no second WorldGraph/EvidenceLedger/
      command-bus/Mirror/memory was introduced during binding.
