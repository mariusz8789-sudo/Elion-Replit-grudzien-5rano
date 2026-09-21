# QWEN_INTEGRATION_DECISION.md

Formal decision record for the "audit and integrate Qwen's engine" task run against branch
`claude/genesis-winner-gate-audit-qgf90v`, commit `439a0551`. See `docs/INTEGRATION_CONTRACT_AUDIT.md`
for the full evidence trail this decision is based on.

## Decision

**QWEN_ENGINE_STATUS: NOT_INTEGRATED**

Not because a real, working engine from Qwen was found and rejected — but because **no pending,
unreviewed Qwen engine or code proposal relevant to Winner Gate / candidate validation exists on this
branch at all**, at the time of this audit. This is a factual finding, not a judgement call, and it
would be dishonest to report `PARTIALLY_INTEGRATED` or invent integration work against something that
isn't there. Per the task's own instruction ("Nie udawaj, że propozycja jest działającym kodem"), the
correct, non-fabricated answer is `NOT_INTEGRATED`, explained as follows.

## What was searched

1. `git log --all --grep="[Qq]wen"` across every branch (45+ hits, going back to the project's early
   history) — every hit is either a commit that already reviewed/integrated a Qwen contribution, a
   commit that already reviewed/rejected one, or a documentation brief.
2. `grep -ril qwen` across the entire working tree (excluding `node_modules`) — zero file-system-level
   `*qwen*` source files; all filename-level hits are `docs/QWEN-*.md` / `docs/prompts/QWEN-*.md` briefs.
3. Every remote branch (`git branch -r`, 70+ branches) — exactly one Qwen-named staging branch exists,
   `origin/staging/qwen-cyber-foundation-unreviewed`, and its own most recent commit
   (`de565414`) is titled "RESOLVED: reject the whole Cyber Foundation staging branch — superseded by
   real main" — i.e. it was already closed out, and it concerns a different domain (Cyber Foundation /
   reasoning kernel) entirely, not drug discovery or Winner Gate.
4. `docs/DECISIONS.md`'s own most recent entry (D-115, the change immediately behind current HEAD)
   documents in detail the last real change touching this domain, and it was authored and executed
   entirely by a Claude session — no Qwen code is anywhere in that change.

## What Qwen HAS contributed to this domain, and its real disposition

| Qwen contribution | Kind | Disposition |
|---|---|---|
| SUSTAIN 10 (NCT03191396) as a candidate new Liraglutide observation | Data (a proposed trial ID), not code | **REJECTED** for real, through a real, unit-tested gate (`a2TrialEvidenceGate.mjs`, commit `b3307160`): `A1_EVIDENCE_REJECTED` — the trial was already pinned under a different (corrected) label. Zero rule/weight/threshold change resulted; one doc-comment was fixed. |
| "Genesis Cyber Foundation" pack (vertical slice + raw drafts + a governance-primitives draft) | Code, staged off-main | **REJECTED** (`REJECT_DUPLICATE` for the slice/drafts, `REJECT_UNUSED` for the governance-primitives draft), commit `de565414`, months before this audit. Different domain (cyber reasoning), not drug discovery. Nothing merged. |
| Discovery-challenge brief (`docs/QWEN-A2-DISCOVERY-CHALLENGE-BRIEF.md`) | Spec/brief | Built out and **already integrated** into production by Claude sessions as `d062SurpassDoseStrata.ts`, `discoveryChallenge/contracts.ts` (dose-stratified A2 challenge scaffolding — a different, adjacent capability from LOWER_HARM/Winner Gate itself, already live and covered by its own passing tests) |
| Strategic/spec reviews (`MASTER_SPEC_DELTA_ADDENDUM_v2`, "Autonomous Discovery Engine spec", etc.) | Specs, not code | Each already individually reviewed and REUSE/EXTEND/NEW/BLOCKED-classified in prior commits (e.g. `75ebdc1d`, `ca9e9b92`) — none of that classification work is pending or unintegrated |

None of these is "an engine to audit and integrate against the Winner Gate" in the sense this task's
instructions describe (a discrete, currently-unreviewed code delivery sitting somewhere in the repo).

## What was NOT done, and why

- **No code was integrated**, because there was no pending Qwen code to integrate for this domain.
- **`winnerGate.ts` was not touched.** It has exactly one commit in its entire history.
- **No preregistration, weight, or threshold was touched.**
- **No Winner was set by hand.** Both real pipeline results reported in
  `docs/ENGINE_E2E_STATUS.md` (LOWER_HARM → WINNER/liraglutide, GOV-DRUG-DISCOVERY-E2E-01 → NO_WINNER)
  were produced by running the real, unmodified orchestrator entry points live during this audit, not
  asserted or copied from documentation.

## If a real Qwen engine proposal for Winner Gate does exist somewhere this search missed

This decision is scoped to what was actually found by an exhaustive search of git history (all
branches), the working tree, and the project's own decision log. If a specific file, branch, or PR
carrying a Qwen-authored Winner Gate engine exists outside of what `git log --all` and a full-tree
`grep` can see (e.g. an unpushed local branch, a PR not yet fetched, or a file described only in a chat
message not reflected in the repo), it was not visible to this audit and this decision does not cover
it. Point to the specific path or branch and this audit can be re-run against it directly.
