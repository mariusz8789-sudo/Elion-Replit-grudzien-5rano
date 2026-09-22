# Genesis transfer-package handoff — 2026-09-22

Branch: `claude/genesis-winner-gate-audit-qgf90v-transfer-handoff`
Based on: `claude/genesis-c1-visual-integration` @ `d48edeb0` (current release branch tip
at the time this was created — nothing on that branch was touched or overwritten).

This branch was pushed directly via the GitHub API / by SHA as a new ref, without ever
checking out or modifying the working copy that the current release branch (Codex) is
developing on. Commits:

1. Real repo integration work (the "~30%" done directly, in-repo, this round).
2. This `codex-handoff/` directory (the "~70-75%" — audited, independently re-verified,
   standalone transfer-package source for Codex/a human to review and decide on).
3. E2E capture evidence artifacts (screenshots/video) backing the V6/V6.1/V7 work.

## 1. What was done for real, in the repo, this round

**Correction (after review):** an earlier version of this branch put `genesisHashPort.ts`
and the full V6/V6.1/V7 `core/visualStages/**` tree inside production source
(`packages/frontend/src/core/`), justified only by adding `ALLOWED_ORPHANS` entries to
`moduleReachability.test.ts`. On review that's the wrong pattern: neither had a real
production caller, so the entries were silencing the reachability check rather than
documenting a load-bearing architectural decision (contrast the D-085 `agentBridge.ts`
entry, which exists because wiring it in today would close a real import cycle). Both have
been **removed from production source** and moved into `codex-handoff/` as explicit,
independently buildable/testable transfer material instead — see
`genesis-hash-port-adapter-proposal/` and `v6-v61-v7-transfer-package/` below.
`moduleReachability.test.ts` now carries zero new `ALLOWED_ORPHANS` entries from this
round.

What actually landed in production source this round, and is real:

- **`packages/frontend/src/core/temporalCinematic/scientificInteriorVisuals.ts`** +
  **`core/worldModel/ecs/geometry.ts`**: a `MATERIALS_LAB` room kind + `SPECTROMETER_STATION`/
  `THERMAL_STAGE_STATION` asset-slot renderers, added directly to the existing canonical
  interior-visual system (no new architecture — same `RoomType` union, same
  `createScientificAssetSlotVisual` switch every other station already goes through).
  **Reachability is partial, disclosed precisely in item 6 below**: the render path is real,
  imported production code, proven against the real `WorldGraph`/renderer by
  `core/e2e/visualStagesGenesisE2E.test.ts` — but that test constructs its `WorldGraph`
  directly rather than through the real content-generation pipeline, and
  `interiorGenerator.ts`'s facility-category table has no entry that would ever route real
  generated content to `MATERIALS_LAB`. Completing that routing is a content decision, not
  made here.
- **`scripts/visual-e2e-v52-v7.mjs`**: capture-script updates supporting the above.
- **`artifacts/temporal-cinematic-e2e/`, `artifacts/visual-e2e-v52-v7/`**: the real-browser
  E2E capture evidence (screenshots + webm) backing the above, included so Codex/a human
  doesn't have to re-run the capture to see what was actually produced.

None of this touches any file on the active release branch's current working set.

## 2. What's included here for Codex (not yet bound to anything real)

### `genesis-hash-port-adapter-proposal/`
Real `HashPort` adapter binding the transfer packages' hash/fingerprint seam to this
repo's already-canonical `fnv1a`/`canonicalJson` (`core/events/hash.ts`) — moved out of
production source per the correction above. See its own `README.md` for why, and exactly
how to re-apply it once a transfer package is actually being bound. 4/4 unit tests pass,
but note it does not compile standalone as-is (it deliberately imports from the real
repo's `core/events/hash.ts` by relative path).

### `v6-v61-v7-transfer-package/`
The full V6/V6.1/V7 transfer package (`genesis-v6-v61-v7-98pct-e2e.zip`) — moved out of
production source per the correction above, now packaged as an independently
buildable/testable standalone unit (own `package.json`/`tsconfig.json`). **Disclosed
defect found while re-packaging it standalone**: its `tsconfig.json` uses this session's
standard `moduleResolution: "nodenext"` convention (matching every other transfer package
this session), and under that setting `tsc -p tsconfig.json` reports ~46 errors — mostly
missing `.js` extensions on relative imports (valid under the real repo's actual
`moduleResolution: "bundler"`, invalid under `nodenext`), plus a handful of real
`noImplicitAny`/property-narrowing errors in `v7/hyperscopeNavigator.ts`,
`v7/organPicking.ts`, `v7/provenanceLabels.ts`, and the standalone E2E test. `vitest run`
still passes 4/4 (esbuild transpiles through the extension issue and doesn't enforce the
same strict-any checks tsc does) — so the **behavior** was verified working, but the
**standalone tsc build as packaged is not clean**. Not fixed here (would be "additional
implementation" beyond what was asked); left for whoever picks this package up next.

### `genesis-integration-mega-pack-v2/`
My own consolidated pack from earlier this session (SHA-256 of the zip I delivered:
`3f92c14bd33ad7b4a8447cd2872400a0590b672db773ed05c77a955061bf12fe`). Consolidates 11
vendor transfer packages (World Director, D-141 Meta-Cognition, D-142 Precision
Intervention Bay, bio-real-lab, core-hardening, world-visual, AI Provider Router, Astra
World Author, Cyber Scientist, Drug Discovery) into one internally-consistent tree:
Mirror, device-safety taxonomy, historical-epistemic taxonomy, and hash all unified to one
canonical module each; every real defect found in the individual audits fixed. 33/33 tests
pass (independently re-run, not just VERIFY.txt trusted). Full detail in its own
`README.md`, `MIGRATION_NOTES.md`, `CAPABILITY_MATRIX.md`, `DUPLICATE_DEPRECATION_MAP.md`,
`LOCAL_VALIDATION_CHECKLIST.md`, `CODEX_INTEGRATION_PROMPT.md`.

### `genesis-engine-suite-e2e-v1/`
A **separate, newly-uploaded** vendor package family (`GENESIS_ENGINE_SUITE_MANIFEST.json`
+ 5 zips), independently verified this round — SHA-256, build and 20/20 test claims all
re-run from scratch and confirmed genuine, not fabricated:

| package | zip sha256 | own tests |
|---|---|---|
| genesis-engine-suite-e2e-v1 (full) | `41cd2f9f7730286dfabea320f07229ac61b0b0cb680c75ad44b04d6c616e7e07` | 20/20 |
| genesis-engine-core-e2e-v1 | `f474e3e99a978d4c9eab3d4a7902625ba08ba701d57e82f44801a76b69967e0f` | 6/6 |
| genesis-engine-world-twin-e2e-v1 | `709626ec98af9ecc4be6677341f8ec7102ffe1099d0ced63f22a2b5c58b81138` | 4/4 |
| genesis-engine-cyber-e2e-v1 | `40cd2e66021514e9ff3ff548efd9faa5aff8a8142209079586dbe3cdbfa36186` | 2/2 |
| genesis-specialist-solvers-e2e-v1 | `658c69bdf80e23cad03ad3a133e44e6d80089d571d24c39cf76d3edca9479c6a` | 5/5 |

Only the full `genesis-engine-suite-e2e-v1` tree is included below (the 4 split packages
are proper subsets of it — same files, same `src/`, matching SHA-256 story — so nothing is
lost by including the union once).

**This is a different, parallel architecture to `genesis-integration-mega-pack-v2`, not a
duplicate upload.** It covers overlapping ground (meta-cognition, model routing, cyber,
drug discovery) but with a cleaner, more uniform port-based shape (`src/kernel.ts` as a
single barrel over `candidateEngine/ evidenceReplay/ experimentPlanner/ metaCognition/
modelRouter/ researchCampaign/ worldEngine/ digitalTwin/ drugDiscovery/ cyber/ solvers/`)
and two genuinely new capabilities neither the mega-pack nor the real repo currently has:

- **`src/solvers/`**: real, generic numerical ODE solvers (`rk4.ts` — classic 4th-order
  Runge-Kutta step — plus `decay`, `diffusion1d`, `kinematics`, `logistic`, `seir` built on
  it). Not domain-specific, not stubs — actual math.
- **`src/evidenceReplay/ledger.ts::EvidenceLedgerEngine`**: an append-only, hash-chained
  evidence ledger with `append/list/snapshot/verify/restore` — `verify()` recomputes every
  event's hash and checks the previous-hash chain, `restore()` refuses a tampered snapshot.
  This is a stronger evidence-integrity primitive than what shipped in the mega-pack's
  per-domain `EvidencePort` adapters (which had no chained-hash tamper detection).

**Decision left to Codex/a human, deliberately not made here:** whether to bind
`genesis-integration-mega-pack-v2`, `genesis-engine-suite-e2e-v1`, both side-by-side, or
neither, as the eventual production Mirror/evidence/meta-cognition/routing/drug-discovery/
cyber implementation. Both are standalone-verified only — see each package's own
`ARCHITECTURE.md` and the mega-pack's `LOCAL_VALIDATION_CHECKLIST.md` for exactly what
still needs a real binding (real camera, real AI provider credentials, real
static-analysis/cheminformatics toolchains, a real WorldGraph, etc. — none of that exists
in either package, by design; both are pure orchestration over unbound ports).

## 3. Explicit non-decisions (unchanged from every earlier audit this session)

- No product decision was made about replacing `packages/core/src/flagship/mirrorTwin.ts`
  with either package's Mirror runtime.
- No package was wired into any real screen, route, or production caller.
- No file the current release branch (`claude/genesis-c1-visual-integration`) is actively
  developing was touched, modified, or overwritten.
- This branch is a pure addition on top of that branch's tip at the time of creation
  (`d48edeb0`) — merging or rebasing it is Codex's/a human's call, not made here.
