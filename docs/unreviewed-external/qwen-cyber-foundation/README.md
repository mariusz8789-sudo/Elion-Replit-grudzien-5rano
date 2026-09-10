# Qwen "Genesis Cyber Foundation" — staged, unreviewed, off `main`

## Status

**Not integrated. Not reviewed. Not merged into any Genesis source tree.**
This directory only preserves what Qwen produced, verbatim, so it can be
reviewed later. Nothing here has been compiled, type-checked, tested, or
wired into `packages/frontend/src`.

## Why this lives on its own branch

- `docs/MASTER_PRIORITY_GENESIS.md` states, as a standing rule: **"Cyber/GOV
  pozostaje OFF `main` — bez zmian."** This branch (`staging/qwen-cyber-
  foundation-unreviewed`) is deliberately branched from `main` and is not
  part of the `claude/traffic-flow-worldgraph-ow11w9` work; it is not meant
  to merge into `main` on its own.
- This content was never an assigned task in the coordination doc's C1/C2/
  C3/QN split. The only work routed to Qwen (QN) there is GAP 7 (literature
  grounding). This Cyber Foundation pack came from the user's own separate
  side-conversation with Qwen and was pasted into the C3 session afterward.

## What this actually is

Two raw pastes of Qwen's self-described "GENESIS CYBER FOUNDATION —
IMPLEMENTATION PACK": a from-scratch TypeScript design covering attack-path
verification, outcome verification, a decision-chain graph, worker
orchestration, conflict resolution, a permission gate, attention/drift
detection, and matching test suites (~30+ files).

- `implementation-pack-v1-raw.md` and `implementation-pack-v2-raw.md` are
  two different structural drafts of the same pack (different file layouts —
  e.g. `cyberTypes.ts`/`attackPathBuilder.ts` as separate files in v1 vs. a
  consolidated `index.ts`-per-folder layout in v2). They were both pasted by
  the user in the same conversation; it's unclear which one, if either, Qwen
  considers final. Preserved as-is, unedited, for a future reviewer to pick
  from or reconcile.
- Qwen explicitly disclaims in both: *"Nie twierdzę, że repo Genesis zostało
  zmienione"* ("I don't claim the Genesis repo was modified") — this was
  never checked into the real repo.

## Verified before staging (2026-09-10, by C3)

- Grepped `packages/frontend/src` for every distinctive name from the pack
  (`attackPath`, `decisionChain`, `outcomeVerification`, `CyberProvenance`,
  `permissionGate`, `attentionEvaluator`, `driftDetector`): **zero matches**.
  None of this is implemented in the real repo today.
- The only existing "Cyber" surface in the repo is `security/
  dependencyAudit.mjs` + `src/components/SecurityAuditPanel.tsx` — a real
  `npm audit` against the deployed repo's own dependencies, explicitly
  commented as *"the one honest slice of Genesis Cyber."* It shares no
  code, types, or naming with this pack.

## Known problems to resolve before this could ever be proposed for merge

Qwen self-disclosed elsewhere in the same conversation that it has no tool
access to clone, read, or grep the real Genesis repository — only an
internal reasoning tool. Every "✅ IMPLEMENTED" / "VERIFIED" claim inside
these two files was reconstructed from commit messages and a prior capability
report, never from reading actual repository code. Consequences visible in
the pack itself:

- It defines its own `DataProvenance`/`CyberProvenance` type (with a
  `MODEL_GENERATED` variant) instead of reusing the real
  `core/dataProvenance.ts` provenance axis (`SIMULATED`/`REFERENCE`/
  `REAL_EXPERIMENTAL`) that the rest of Genesis already threads through
  Hypothesis → Evidence → Memory → Replay.
- It defines its own decision-chain/event graph vocabulary instead of
  reusing the real `core/events/genesisEvent.ts` event system or
  `matrixFoundation/replayVerdict.ts` replay semantics.
- It has no contact with the real `SolverRouter`, `WorldGraph`,
  `scienceMemory.ts`, or `evidencePackStore.ts` — everything it verifies
  against is its own parallel, self-consistent mock of those systems.

Reusing this pack as-is would violate this project's own standing rule:
"Nie tworzyć równoległych subsystemów" (don't build parallel subsystems) —
reuse the existing Fabric/Discovery/Memory/Evidence/Replay/Provenance
engines; build new machinery only where nothing exists yet.

## If a future session picks this up

Do not copy these files directly into `src/`. Treat them as a spec/reference
only: extract the genuinely novel domain logic (attack-path graph
construction, security-specific hypothesis shapes), and re-implement it as a
domain adapter over the *real* `core/dataProvenance.ts`, `core/events/
genesisEvent.ts`, `scienceMemory.ts`, and `evidencePackStore.ts` contracts —
the same pattern already used for other domains (e.g. `core/worldModel/
domains/electricalGenerator.ts`) rather than a second, parallel engine.
Confirm with the current `docs/MASTER_PRIORITY_GENESIS.md` "Zasady
wykonania" section that Cyber/GOV is still off `main` before doing so.
