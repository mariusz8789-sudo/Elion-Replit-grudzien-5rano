# INTEGRATION_CONTRACT_AUDIT.md

Audit performed live against the real repository, branch `claude/genesis-winner-gate-audit-qgf90v`,
commit `439a0551e6aa2e2e9b13ea240e637490498c0176`. Every result below was produced by actually running
the named command or reading the named file during this audit session — nothing here is inferred or
assumed. `git status` was clean before and after; **no production file was modified by this audit.**

## 0. What was checked, and where

| Area | Real file(s) |
|---|---|
| Winner Gate (promotion gate) | `packages/frontend/src/core/orchestrator/winnerGate.ts` (92 lines) |
| LOWER_HARM ranking | `packages/frontend/src/core/biotechData/govDrugLowerHarmRanking.ts` (181 lines) |
| LOWER_HARM funnel (pair falsification) | `packages/frontend/src/core/biotechData/govDrugLowerHarmFunnel.ts` (378 lines) |
| LOWER_HARM preregistration | `packages/frontend/src/core/biotechData/govDrugLowerHarmPreregistration.ts` (256 lines) |
| A2 (Ozempic substitute) engine + preregistration | `packages/frontend/src/core/biotechData/a2OzempicSubstitute.ts` (1194 lines), `a2OzempicSubstitutePreregistration.ts` (230 lines) |
| Practical candidate / promotion gate | `packages/frontend/src/core/agent/practicalCandidateGate.ts` (251 lines) |
| Evidence provenance / class taxonomy | `packages/frontend/src/core/agent/evidenceProvenance.ts` (362 lines) |
| Falsification statistic | `packages/frontend/src/core/agent/observationGap.ts` (284 lines) |
| Orchestrator entry point | `packages/frontend/src/core/orchestrator/govLowerHarmDiscovery.ts` |
| GOV-DRUG-DISCOVERY-E2E-01 | `packages/frontend/src/core/biotechData/govDrugDiscoveryE2E.ts`, `scripts/gov-drug-discovery-e2e-scenario.mjs` |
| Research recipe builders (domain-scoped, not a shared engine) | `govLowerHarmRecipe.ts`, `discoveryChallenge/recipeExtension.ts`, `biotechData/govDrugDiscoveryE2E.ts::generateResearchRecipe`, `discovery/molecular/mounjaroResearchRecipe.ts`, `physicsWorld/physicsRecipe.ts`, `generator/recipe.ts` |

**File-history check (KROK 1):** `winnerGate.ts` has exactly **one** commit in its entire history
(`47a83545`, its creation). `govDrugLowerHarmPreregistration.ts` has exactly **one** commit
(`70441442`, its sealing). `a2OzempicSubstitutePreregistration.ts` has exactly **two**: the initial
seal (`1cd65ebc`) and `b3307160` (2026-09-15), which changed **one doc-comment string only** (a
mislabelled trial name, "SUSTAIN 7" → "SUSTAIN 10" — verified via `git show b3307160 -- <file>`, the
diff touches a single `/** ... */` comment, zero data/number/rule bytes). No threshold, weight, pin, or
rule in any of these three files has been touched outside their own creation/sealing commits.

## 1. Qwen-delivered files — what exists, what is integrated

A repo-wide search (`git log --all --grep="[Qq]wen"`, `grep -ril qwen`, docs under `docs/QWEN-*.md` and
`docs/prompts/QWEN-*.md`) plus a git-history check of the one Qwen **staging** branch
(`origin/staging/qwen-cyber-foundation-unreviewed`) found:

- **No file-system-level `*qwen*` source file exists anywhere in the repo.** Every "Qwen" hit at the
  filename level is a brief/spec document (`docs/QWEN-*.md`, `docs/prompts/QWEN-*.md`), not code.
- **No orphaned/unintegrated Qwen code exists relevant to Winner Gate, candidate validation, or
  LOWER_HARM ranking.** The only historical staging attempt at a Qwen-derived engine —
  `origin/staging/qwen-cyber-foundation-unreviewed` (a **different domain**: Cyber Foundation /
  reasoning-kernel, not drug discovery) — was already reviewed and rejected in commit `de565414`
  ("RESOLVED: reject the whole Cyber Foundation staging branch — superseded by real main"), months
  before this branch. Nothing from it is merged anywhere; the branch remains only as a record.
- **The one Qwen contribution specifically inside the LOWER_HARM/A2 domain** is data, not code: commit
  `b3307160` ("D-110/D-111 ... validate + reject Qwen's SUSTAIN 10 lead") records an external search
  result (a candidate trial ID, SUSTAIN 10/NCT03191396) that Qwen proposed as new evidence. It was run
  for real through a purpose-built, unit-tested acceptance gate
  (`packages/backend/src/campaign/a2TrialEvidenceGate.mjs`) and **REJECTED** (`A1_EVIDENCE_REJECTED` —
  the trial was already pinned under a different, correct label). No Winner Gate rule, weight, or
  threshold was touched by this rejection; only a documentation comment was corrected.
- Other Qwen-derived code that **is** integrated into production (verified as imported by real
  production modules, not orphaned) belongs to different domains and is out of scope for this Winner
  Gate audit: `d062SurpassDoseStrata.ts`, `substitutionPareto.ts`, `discoveryChallenge/contracts.ts`
  (dose-stratified A2/discovery-challenge scaffolding, built from a Qwen discovery-challenge brief and
  reviewed/finished by Claude sessions), plus unrelated domain modules (particle physics, dome-world,
  evidence-URI codec).

**Conclusion for KROK 1/KROK 3: there is no pending, unreviewed "Qwen engine" for Winner Gate or
candidate validation on this branch to integrate.** Everything Qwen contributed to this specific
domain is either (a) already reviewed and integrated by a prior Claude session, or (b) already reviewed
and rejected with a documented reason, or (c) a data proposal (not code) that was run through a real
gate and rejected. See `docs/QWEN_INTEGRATION_DECISION.md` for the formal decision record.

## 2. The 15-point 1:1 comparison

All 15 points were checked against the REAL, currently-running pipeline (not a description of it). Each
row cites the actual test(s) that currently pass, confirmed by a full test-suite run in this session
(see `docs/ENGINE_E2E_STATUS.md`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Same input → same output | **PASS** | `govDrugLowerHarmFunnel.test.ts:96` "is deterministic across two independent runs"; `govDrugLowerHarmRanking.test.ts:204` "two independent runs produce the identical fingerprint"; independently re-verified in this session: `replayGovLowerHarmDiscovery({mode:'PRODUCTION'})` → `ok:true`, `first.recipeFingerprint === second.recipeFingerprint` → `true` |
| 2 | Candidate-order change doesn't change the result | **PASS** | `govDrugLowerHarmFunnel.test.ts:102` "the same TOP2 pair produces the same fingerprint regardless of candidate order" (`freezeFalsificationCriteria`, order-independent by construction) |
| 3 | Ties handled explicitly (TIE/NO_WINNER), never by accident | **PASS** | `govDrugLowerHarmRanking.test.ts:156` "CONFLICTING_EVIDENCE remains a real, reachable code path — proven with a synthetic dimension split"; `:173` "returns NO_WINNER, not CONFLICTING_EVIDENCE, when nothing qualifies"; `:192` "returns INSUFFICIENT_EVIDENCE for an empty candidate space, never NO_WINNER" — three distinct, disclosed states, never a silent pick |
| 4 | One changed byte changes the hash and blocks the result | **PASS** | `govLowerHarmDiscovery.test.ts:254` "a tampered/drifted artifact fails the run closed, the OLD frozen artifact is preserved (append-only), never silently overwritten"; `:278` "drift is reported explicitly in the replay result, never silently accepted" |
| 5 | IDENTITY_MISMATCH detected, never produces a fake winner | **PASS** | `govDrugLowerHarmFunnel.test.ts:327` (D-115 regression) "NCT05659537's 'Dulaglutide' arm is refused for native GLP-1, disclosed as IDENTITY_MISMATCH, not silently dropped"; `:356` "zero identity mismatches for every OTHER candidate — not a special case" |
| 6 | Safety REFUSE → NO_WINNER | **PASS** | `winnerGate.test.ts:45` "conflicting evidence: a CONFLICTING_EVIDENCE verdict never promotes"; `govDrugLowerHarmRanking.test.ts:77` "a safety-vetoed candidate is eliminated with the veto reason, never the floor reason"; re-verified live: `gov-drug-discovery-e2e-scenario.mjs` STEP4 shows TIRZEPATIDE/ORFORGLIPRON (real efficacy advantage) blocked by existential safety veto, contributing directly to the real NO_WINNER outcome |
| 7 | Missing required data → INSUFFICIENT_EVIDENCE or BLOCKED | **PASS** | `govDrugLowerHarmRanking.test.ts:192` "INSUFFICIENT_EVIDENCE for an empty candidate space"; `govLowerHarmDiscovery.test.ts:94` "a single-candidate space throws `LowerHarmFailClosedError`, never a fabricated pair"; `:200` "a candidate-report source that cannot produce a real TOP2 pair surfaces as a structured, frozen `EXECUTION_BLOCKED` result" |
| 8 | Result has replay + deterministic fingerprint | **PASS** | `govLowerHarmDiscovery.test.ts:383` "PRODUCTION replays to an identical verdict and audit fingerprint"; `:395` "a genuinely mismatched pair of results is honestly reported as NOT ok"; live re-verification in this session, see row 1 |
| 9 | Winner Gate unchanged without justification | **PASS** | `winnerGate.ts` has exactly 1 commit in its whole history (its creation, `47a83545`) — zero changes since, justified or not |
| 10 | Preregistration/weights/thresholds untouched | **PASS** | `govDrugLowerHarmPreregistration.ts`: 1 commit ever. `a2OzempicSubstitutePreregistration.ts`: 2 commits ever, the second a comment-only fix (verified via `git show`, see §0). RANKING_WEIGHTS (`safety:2, efficacyMarginAboveFloor:0.25, evidenceStrength:0.5, uncertaintyPenalty:-0.5, conflictPenalty:-1`) unchanged since sealing |
| 11 | LOWER_HARM and GOV-DRUG-DISCOVERY-E2E-01 pipelines are separated | **PASS** | Confirmed by design (two independent modules, `govDrugLowerHarmRanking.ts`/`govDrugLowerHarmFunnel.ts` vs `govDrugDiscoveryE2E.ts`, each with its own preregistration) AND by real behavioural divergence: both were re-run live in this session on the SAME corrected data — LOWER_HARM reaches **WINNER**, E2E-01 independently reaches **NO_WINNER** — proving they are not the same decision engine wearing two names (see docs/DECISIONS.md's own D-115 note: "NOT a second, independent pipeline agreeing") |
| 12 | NO_WINNER never generates a recipe | **PASS** | `govLowerHarmDiscovery.test.ts:353` "NO_WINNER never produces a Recipe"; live re-run of `e2e:gov-drug`: "research recipe: NOT emitted (correct — gated on WINNER)", CHECK 9 "no research recipe is emitted without a WINNER" — PASS |
| 13 | Recipe has provenance, limitations, evidenceRefs | **PASS** | Live `winner-recipe:demo` output: `ResearchRecipe` carries `evidence=[NCT-... : delta=...]` (provenance), `limitations=[...]`, `falsificationResults=[...]`, `reproducibilityInstructions=[...]` — all populated, non-empty |
| 14 | Recipe never contains dosing/prescription/synthesis instructions | **PASS** | Live recipe dump contains only `mechanism`, `winnerRecordRef`, `hypothesisId`, `evidence`, `falsificationResults`, `limitations`, `reproducibilityInstructions` — no dosage, prescription, or synthesis-procedure field anywhere in the structure |
| 15 | Report shows losing candidates and rejected observations | **PASS** | Live `lower-harm:demo` output lists all 12 candidates including all 10 eliminated, each with its own real elimination reason (floor / veto / insufficient evidence); live `e2e:gov-drug` STEP2 logs every one of 2664 eliminations with reason + evidence, CHECK 4 "every eliminated candidate carries a reason AND its evidence — no silent drops" — PASS |

**All 15 points: PASS.** No point required a code change to pass — every one was already true on the
real, currently-running pipeline before this audit began.

## 3. Test-suite corroboration (independent, live re-run in this session)

- Backend (`node --test`): **835 tests, 802 pass, 0 fail, 33 skipped** — matches the count documented
  in `docs/DECISIONS.md`'s D-115 entry exactly (835/802/33... the doc's own prose count of "831 tests
  (798 pass...)" from the day-earlier b3307160 commit differs by the same +4 the D-115 entry itself
  explains as one new file's tests; the post-D-115 backend re-run recorded in DECISIONS.md — "835
  tests, 802 pass, 0 fail, 33 skipped" — matches this session's live run bit-for-bit).
- Frontend (`vitest run`): **558/558 test files, 6533 pass, 1 skipped, 0 failed** — matches
  `docs/DECISIONS.md`'s D-115 entry exactly, bit-for-bit.
- `tsc -b` (frontend build/typecheck): clean, 0 errors.
- `eslint .` (repo-wide): clean, 0 errors, 0 warnings.

No drift between the documented state and the real, live state was found anywhere.
