# CODEX_INTEGRATION_PROMPT — Genesis Integration Mega Pack V2

This is a directive to the agent integrating this package into the real Genesis repo
(likely Codex, working locally). It is not itself an instruction to the cloud agent that
produced this package, and it does not authorize commit/push/merge/deploy on its own —
that authorization comes from the human operator.

## Ground rules (apply to every module in this pack)

- Do NOT create a second WorldGraph, WorldGenerator, TemporalEngine, Evidence Ledger,
  SolverRouter, command bus, Human Digital Twin, Mirror state machine, or "Real Lab
  kernel." Every canonical system this package touches is consumed through an injected
  port, never reimplemented. If a better version of something already exists in the real
  repo (e.g. a real candidate-research engine), prefer it — do not replace it with this
  pack's version just because it arrived more recently.
- Do NOT let `AppendOnlyMetaMemory` (`src/d141/memory.ts`) become a persistent
  production store. Bind `EvidencePort` to the real `EvidenceLedger`/`kernelLedger`
  instead (reuse D-140's `genesisEvidencePort.ts` adapter pattern).
- Do NOT enable real device actuation anywhere, and do NOT let a raw AI-provider result
  be treated as a verified scientific/security/drug result — see `providerRouter`'s
  `attachSolverVerification()` guardrail below; it must actually be used, not bypassed.
- Do NOT claim real physical-camera validation, real Unreal Engine execution, real
  static-analysis/secret-scan/fuzz/SBOM/CVE-feed results, real chemistry (RDKit/
  docking/QM/ADMET), or medical/clinical validation from this package's own test
  results — all of those require local hardware/toolchain/real tools/expert review this
  cloud package cannot provide. See `LOCAL_VALIDATION_CHECKLIST.md`.

## What's in this pack (see MIGRATION_NOTES.md for file-level detail)

**Carried forward from the prior V2-corrected pack**, `src/mirror/`, `src/deviceSafety/`,
`src/d141/`, `src/hashReplay/`, `src/historicalEpistemic/`, `src/coreHardening/`,
`src/precisionBay/`, `src/bioRealLab/`, `src/worldVisual/` — all fixes described in
MIGRATION_NOTES.md §1-7 still apply, unchanged.

**New this round:**
1. `src/providerRouter/` — vendor-agnostic AI model routing; vendor code confined to
   `adapters.ts`; `attachSolverVerification()` guardrail against raw-LLM-as-verified-result.
2. `src/astraWorldAuthor/` — a proposal/validate layer over Astra, not a second world
   engine; `worldGraphRef`/`worldFrameRef` stay `unknown`, owned by the real World Director.
3. `src/cyberScientist/` — FIND→VALIDATE→FIX→RETEST orchestration with zero real
   analysis/exploit code of its own; every capability is a port a real tool must bind to.
4. `src/drugDiscovery/` — now has a real orchestrating `pipeline.ts` (was missing in
   V1), a restored `CONFLICTING_EVIDENCE` status, a wired identity guard, and an
   unbound-engine BLOCKED fix.

## Recommended integration order (small-diff-first)

1. Construct the real `HashPort` (wraps `core/events/hash.ts::fnv1a`/`canonicalJson`).
   Pass it into every constructor in this package that accepts one.
2. Bind every package's `EvidencePort`/`CandidateEvidencePort`/`CyberEvidencePort`/
   `RoutingEvidencePort` (four distinct port shapes — do not conflate them) to the real
   EvidenceLedger, reusing the existing D-140 adapter pattern.
3. Decide the Mirror question (see `src/mirror/legacyNotes.ts`) before wiring any new
   caller to it.
4. Bind `src/precisionBay/ports.ts`'s remaining required ports. Note: the real repo's
   Biomedical Intervention Bay exists on a DIFFERENT branch
   (`claude/genesis-c1-visual-snapshot`) — confirm branch state first.
5. Point World Director's `policy.ts::EvidenceStatus`, D-141's `worldDirectorAdapter.ts`,
   and Astra's `types.ts` (already done in this pack) at the single canonical
   `EpistemicLabel` type.
6. Feed real `ImplementationRef[]`/`ModuleReachabilityRecord[]` data into
   `src/coreHardening/canonicalOwnership.ts`/`reachability.ts` as an actual release-gate
   step.
7. **AI Provider Router**: construct real `ModelProvider` instances (real API clients),
   bind `RoutingEvidencePort`, build the real `ProviderDescriptor` roster. This should be
   bound before Astra/Cyber Scientist/Drug Discovery if any of them are meant to use it
   for reasoning — they are independent of each other otherwise.
8. **Astra World Author**: bind `AssetCatalogPort`, `CanonicalWorldSpecValidatorPort`,
   `CanonicalWorldDirectorPort` (the real one, after step 5's epistemic reconciliation).
9. **Cyber Scientist**: bind one real tool per `DefensiveAnalyzerPort` kind you actually
   want to use (do not bind all — start with 1-2 real ones, e.g. dependency scanning and
   secret scanning, and leave the rest genuinely `IMPLEMENTED_AS_PORT`/unbound rather
   than faking a binding).
10. **Drug Discovery**: bind `MolecularEnginePort` × 4 to real RDKit/docking/QM/ADMET
    adapters if/when available; if any are unavailable, leave them unbound — the fixed
    `MultiFidelityCampaign` now produces an honest `BLOCKED` result rather than silence.
    Bind a real `CandidateIdentityGuardPort` — do not leave it as a stub that always
    returns `valid: true`, since `pipeline.ts` now actually gates on its result.

## Verification Codex must run locally, that this cloud package cannot

See `LOCAL_VALIDATION_CHECKLIST.md` for the full list. Summary: real getUserMedia camera
hardware, real browser permission prompts, real Playwright E2E, real static-analysis/
secret-scan/fuzz/SBOM/CVE tools, real RDKit/docking/QM/ADMET engines, real AI provider
API calls, this repo's own `moduleReachability.test.ts` convention for any newly-wired
file, and a full repo-root `tsc -b`/lint/test suite after binding — not just this
package's own standalone 33/33.

NO COMMIT / NO PUSH / NO MERGE / NO DEPLOY until a human reviews this package and its
integration diff.
