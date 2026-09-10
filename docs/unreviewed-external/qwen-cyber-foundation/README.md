# Qwen "Genesis Cyber Foundation" — staged, unreviewed, off `main`

## Status (updated 2026-09-10, second pass)

**One real, tested, isolated module now exists on this branch:
`packages/frontend/src/core/cyber/`.** It compiles (`tsc --noEmit` clean),
lints clean, and its 3 vitest tests pass, with two real bugs found and
fixed along the way (below) — this is not a Qwen claim, it was actually run.
Everything else in this directory (the governance-primitives draft, the
original two near-duplicate raw pastes) is still exactly what it was: raw
reference text, never compiled or run, staged for a future reviewer to
draw on rather than copy from.

This is still not merged anywhere near `main`. It lives on this isolated
branch because `docs/MASTER_PRIORITY_GENESIS.md` states, unchanged:
**"Cyber/GOV pozostaje OFF `main` — bez zmian."** It was also never an
assigned task in the coordination doc's C1/C2/C3/QN split — it came from
the user's own separate side-conversation with Qwen. Getting the code
itself right is a separate question from whether Genesis should have a
Cyber domain on `main` at all; this pass only did the former.

## What's actually implemented now: `packages/frontend/src/core/cyber/`

A self-contained "vertical slice" reasoning engine, adapted from the raw
"E2E IMPLEMENTATION" draft pasted by the user (see below for what changed):

- `cyberDomainTypes.ts` — domain types. Imports the real
  `DataProvenance` (`core/dataProvenance.ts`) and `ReplayVerdict`
  (`core/matrixFoundation/replayVerdict.ts`) types instead of re-declaring
  local copies, closing the exact "parallel provenance type" duplication
  flagged against the earlier drafts.
- `cyberSyntheticTarget.ts` — a small toy vulnerable web app
  (`ToyVulnerableApp`) with real routing/auth logic: an auth-bypass bug on
  `/admin`, an injection bug on `/search`, and a *correctly-implemented*
  ownership check on `/api/users` (a deliberate true negative).
- `cyberTestEngine.ts` — executes a test spec against the toy app and
  captures the real HTTP-shaped response; nothing here reads fixture
  metadata to decide a verdict.
- `cyberEvidenceAdapter.ts` — compares a prediction to an observed result
  and produces a `SecurityVerdict` (`SUPPORTED`/`FALSIFIED`/`INCONCLUSIVE`/
  `BLOCKED`) purely from that comparison.
- `cyberAttackPath.ts` — builds and verifies an attack path from
  evidence-backed hypotheses.
- `cyberRemediation.ts` — applies a remediation to the target and
  independently re-executes a test against it, rather than trusting that
  the fix worked.
- `cyberReasoningEngine.ts` — orchestrates the full chain: observation →
  attack surface → hypotheses → predictions → tests → evidence → verdicts
  → attack path → remediation → independent re-test → replay fingerprint →
  next question. Self-contained; does not call into real Genesis Memory/
  Replay/Evidence/StrategyRun/NextQuestion (see Integration gaps below).
- `__tests__/cyberE2E.test.ts` — a real, passing E2E test asserting every
  stage produced non-empty, non-fixture-copied output, including that the
  one deliberately-safe endpoint (`/api/users`) actually comes back
  `FALSIFIED` through execution, not through a hardcoded flag.

Verification actually run (2026-09-10): `npx tsc --noEmit` (clean),
`npx eslint src/core/cyber/` (clean), `npx vitest run src/core/cyber/`
(3/3 passing), `npx vitest run` full suite (420 files, only pre-existing,
unrelated flake — confirmed by re-running it alone — no regression), and
`npm run build` (succeeds).

## Real bugs found in the raw draft and fixed here

The raw draft (preserved for reference below) claimed all of this was
"IMPLEMENTED" but was written and never run — Qwen self-disclosed no
terminal or repo access. Actually running it surfaced two real, silent
correctness bugs that a text read-through alone did not catch:

1. **Inverted remediation verdict.** The draft built a separate
   "post-remediation" prediction (expecting `403` = fixed, treating `200`
   as its falsifier) and fed it through the same before/after switch that
   assumes the opposite convention (`SUPPORTED` = still vulnerable,
   `FALSIFIED` = fixed). A fix that genuinely worked (status flips from
   `200` to `403`) came out `SUPPORTED` under the inverted prediction and
   was reported `FAILED` — the exact opposite of reality. Fixed by reusing
   the hypothesis's own original prediction for the re-test.
2. **Remediation never actually applied.** `applyRemediationAndRetest`
   called `target.applyRemediation(remediation.remediationId)` — the
   opaque tracking id (`'rem-1'`) — but `ToyVulnerableApp` keys its fix
   checks off the semantic action name (`'admin-auth-fix'`, stored in
   `remediation.action`). The "fix" silently never took effect. Only found
   by actually running the test after fixing bug 1 and seeing it still
   fail for a different reason.
3. Also fixed, lower-severity: a non-cryptographic `charCodeAt` fingerprint
   hash (replaced with a real `node:crypto` SHA-256 of a canonical
   serialization — the same "fake hash" anti-pattern the draft's own
   governance-primitives self-audit calls out elsewhere, left unfixed in
   this file); module-level id counters that made two calls to
   `runCyberReasoningE2E()` in the same process produce different ids for
   identical results, breaking the "deterministic on re-run" property the
   module claims for itself; an attack-path status that could read
   `VERIFIED` from node/edge statuses alone even when the graph itself was
   unreachable/out-of-order/disconconnected (now folds those structural
   checks into the status itself); a few unused imports.

## Integration gaps — real work, not done here

`cyberReasoningEngine.ts` is self-contained by design for this pass. It
does **not** call into:

- Real Scientific Memory (`core/scienceMemory.ts`)
- Real Replay Engine (`core/matrixFoundation/replayVerdict.ts` beyond the
  type import — no actual replay comparison happens)
- Real Evidence Bundle (`core/experimentFabric/evidencePack.ts`)
- Real `StrategyRun` (`core/agent/discoveryStrategy.ts`)
- Real Next Question (`core/agent/nextQuestion.ts`)

Each of those is real, non-trivial integration work — understanding and
correctly using five separate existing contracts — left for whoever picks
this module up next, alongside the standing "Cyber/GOV off main" decision
that has to be made before any of that is worth doing.

## What was reviewed but NOT implemented: the governance primitives

The other half of what the user pasted — `contracts/`, `decisionChain/`,
`attackPath/` (a second, generic, unused version), `outcomeVerification/`,
`permission/`, `attention/`, `drift/`, `conflict/`, `workers/`, plus 40
test vectors — was reviewed but not built. Reasons:

- It's a large amount of new surface (a permission gate, an attention
  scorer, a drift detector, a DAG-based decision chain, a conflict
  resolver) that isn't wired into the E2E slice above or to anything else
  in the real repo — building it now would be building unused governance
  scaffolding, which this session's discipline treats as scope creep.
- Its own self-audit (visible in the raw text) already caught its biggest
  problems (fake hash, duplicated provenance type, conflated
  attention/execution) and re-drafted fixes for them — but still never
  ran any of it.
- The real E2E slice already needed two additional bug fixes this
  self-audit didn't catch (see above), which is the strongest evidence yet
  that none of Qwen's own "IMPLEMENTED"/"FIXED" labels can be trusted
  without independently running the code — exactly what running the
  governance-primitives draft would also require, and hasn't been done.

Preserved as `governance-primitives-v3-raw.md` for whichever future session
wants to draw on specific ideas from it (the permission-gate multi-factor
model and the decision-chain-as-DAG idea are reasonable ones) — treat it as
a spec to re-verify against the real repo, not code to copy in.

## Original two raw pastes (kept for provenance)

`implementation-pack-v1-raw.md` and `implementation-pack-v2-raw.md` are the
two near-duplicate first-draft pastes from the original review pass (before
the "fixed" governance-primitives round and the E2E slice above existed).
Superseded by the two files above; kept only so the full history of what
was pasted is not lost.

## If a future session wants to move this toward real integration

1. Confirm with the current `docs/MASTER_PRIORITY_GENESIS.md` "Zasady
   wykonania" section that Cyber/GOV is still off `main` — this is a
   product/policy decision, not a code-quality one.
2. If it's a go: wire `cyberReasoningEngine.ts` into the real Memory/
   Replay/Evidence/StrategyRun/NextQuestion contracts listed above, one at
   a time, each with its own tsc/eslint/vitest gate — don't trust any
   "IMPLEMENTED" claim (including this README's) without re-running it.
3. Decide whether the governance primitives (permission gate, attention,
   drift, decision chain, conflict resolution) are actually needed for
   the first real Cyber use case, or whether that's premature — the E2E
   slice above works without any of them.
