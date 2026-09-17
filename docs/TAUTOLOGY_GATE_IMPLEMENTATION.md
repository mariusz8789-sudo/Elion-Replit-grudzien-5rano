# Tautology / Circularity Gate — Implementation

Builds on `docs/TAUTOLOGY_GATE_AUDIT.md` (kept as-is — audit history, not
overwritten). This document is what actually shipped: the final contract,
where it is wired in, and what remains a known limitation.

## Final contract — `packages/frontend/src/core/agent/tautologyGate.ts`

A pure, deterministic module. No AI, no heuristics on raw numbers — every
decision is a total function of DECLARED, structural metadata about where a
value came from, never inferred from whether two computed numbers happen to
agree (that would misclassify QE1-3's own real parameter-fitting exercise —
see the "zero heuristics" section in the module's own header comment).

```ts
export type TautologyClassification = 'CONSISTENCY_CHECK' | 'EMPIRICAL_TEST' | 'MIXED_TEST' | 'UNTESTABLE';

export type ObservableSource = 'model-invariant' | 'hypothesis-parameter' | 'independent-measurement';

export interface ObservableDerivation {
  readonly source: ObservableSource;
  readonly modelId: string;
  readonly rationale: string;
}

export interface TautologyComponent {
  readonly componentId: string;
  readonly prediction: ObservableDerivation | null;   // null = undeclared -> UNTESTABLE, never guessed
  readonly observation: ObservableDerivation | null;
  readonly derivedFromSameComputation?: boolean;       // C2 — literal same-output circularity
}

export function assessTautology(components: readonly TautologyComponent[]): TautologyAssessment;
export function assessSingleTautology(component: TautologyComponent): TautologyAssessment;
export function evidenceCeiling(classification: TautologyClassification): number | null; // 0 for CONSISTENCY_CHECK and UNTESTABLE, null otherwise
```

### Why three sources, not a same-model check

C1–C4 from the brief collapse to two structural checks rather than four,
because a naive "same model = circular" reading of C1 would misclassify
QE1-3's OWN real, legitimate parameter inquiries (prediction and
"observation" both come from `quantum-entanglement-measures`, by
construction — see `inquiryLoop.ts::runAt`). The three-value `source` enum
resolves this: a caller cannot reach `EMPIRICAL_TEST` by omission or by a
lazy default — it must explicitly claim `'hypothesis-parameter'` (the value
genuinely varies with which hypothesis is true) or `'independent-measurement'`
(C5, a channel with no shared code path). `'model-invariant'` (C3/C4) is the
one value that always forces `CONSISTENCY_CHECK`, on either side of the pair.
`derivedFromSameComputation` (C2) is a separate, narrower, literal-identity
check — comparing a value to itself (e.g. a normalization result) — and
fires even when both sides are otherwise `'hypothesis-parameter'`. This
merge is documented at the point in the code where a literal C1 branch was
removed for being provably dead given this design — see the comment above
`assessComponent`'s consistency-reasons block.

### Aggregation (`MIXED_TEST`, C6)

Every non-empty combination of per-component outcomes is handled explicitly
(all 7 subsets of `{CONSISTENCY_CHECK, EMPIRICAL_TEST, UNTESTABLE}`,
exhaustively tested in `tautologyGate.test.ts`). The one non-obvious rule:
`CONSISTENCY_CHECK + UNTESTABLE` (no confirmed empirical part) returns
`UNTESTABLE`, not `MIXED_TEST` — calling it mixed would silently promise
evidence nobody established.

## Integration point — `inquiryLoop.ts`

`SystemUnderStudy.observableDerivation?: TautologyComponent` — optional and
strictly additive; every existing caller that never declares it keeps
running byte-identical to before (verified:
`entanglementInquiryTautology.test.ts`'s "byte-identical" test strips the
field from a real QE1 system and confirms `tautologyAssessment: null` and an
uncapped, confidence-moving inquiry).

When declared, `runAutonomousInquiryWithRuns` computes
`InquiryLoopResult.tautologyAssessment` ONCE (never per round, never from a
measured number) and, every round, caps `evidenceMagnitude` at
`evidenceCeiling(classification)` before calling the EXISTING
`beliefRevision.ts::updateConfidence` — no second confidence pathway, no new
evidence engine. `evidenceMagnitude: 0` is `updateConfidence`'s own,
pre-existing no-op case (see that function): this reuses a knob that already
existed, exactly as instructed.

This is a deliberately narrow integration: only `inquiryLoop.ts`, the module
the brief names explicitly. `discoveryConclusion.ts`/`falsificationRelation.ts`
(which do have a natural multi-criterion shape `MIXED_TEST` could use) are
NOT touched — extending them is the same pattern, not built now, to avoid
widening this change beyond what was asked and verified.

### QE1–QE3 declarations

All three real systems in `entanglementInquiry.ts` (`qe1System`, `qe2System`,
`qe3System`) now declare `observableDerivation` with
`source: 'hypothesis-parameter'` on both sides — an honest classification
(their observed metric genuinely varies with the candidate parameter, see
each system's own derivation-rationale constant), which resolves to
`EMPIRICAL_TEST` and therefore `evidenceCeiling: null` — a no-op for their
real behaviour. The excluded superquantum-source claim `QE1_NOT_MODELLED`
describes is still never modelled at all (unchanged) — the gate does not
retroactively "run" a claim nobody made runnable; see Known Limitations.

## Classifications — what maps to what

| Case | Declared as | Result |
|---|---|---|
| QE1 Tsirelson bound (if it were ever run) | both sides `model-invariant` | `CONSISTENCY_CHECK`, evidence capped at 0 |
| QE1/QE2/QE3 real parameter inquiries | both sides `hypothesis-parameter`, same model | `EMPIRICAL_TEST`, uncapped |
| A value read back from the same computed output as the prediction | `derivedFromSameComputation: true` | `CONSISTENCY_CHECK` (C2) |
| Prediction from model A, observation from an unrelated dataset/model B | observation `independent-measurement` | `EMPIRICAL_TEST` (C5) |
| One component algebraically guaranteed + one independently measured | mixed per-component sources | `MIXED_TEST`, per-component breakdown names which is which |
| Either side's derivation undeclared | `null` | `UNTESTABLE` — never guessed |

## Known limitations (stated, not hidden)

- **The Tsirelson-bound CONSISTENCY_CHECK case is never exercised by a live
  `entanglementInquiry.ts` run**, because the excluded hypothesis was never
  added to `QE1_CANDIDATES` in the first place (that IS the correct design —
  see `docs/TAUTOLOGY_GATE_AUDIT.md` §1.1). `entanglementInquiryTautology.test.ts`
  proves the cap mechanism itself works, using a synthetic override of a real
  QE1 system's `observableDerivation` to force `CONSISTENCY_CHECK` — this is
  the gate's wiring being tested directly, not QE1 itself being reclassified.
  Building a second, throwaway "tautological Entanglement Lab" system just to
  exercise this path live was explicitly out of scope (§16 of the brief).
- **`MIXED_TEST` has no live production caller.** `inquiryLoop.ts`'s
  `SystemUnderStudy` carries exactly one `observableDerivation` component, so
  a real inquiry can only ever resolve to `CONSISTENCY_CHECK`, `EMPIRICAL_TEST`
  or `UNTESTABLE` today. `MIXED_TEST` and multi-component `assessTautology`
  calls are proven correct in `tautologyGate.test.ts` (CASE 5 and the full
  aggregation matrix) but are not yet reachable from a real inquiry —
  `discoveryConclusion.ts`'s primary+supporting criteria is the natural
  future consumer (see Integration point above), not built now.
- **25 golden test cases from the (still nonexistent) spec §6 remain
  unfulfilled.** The 6 behavioral cases in this prompt were well-specified
  enough to implement honestly and are all covered (see Tests below). No
  semantics were invented for the other 19 — there is nothing to invent them
  from.
- **The C1–C6 rule LABELS are the brief's own restatement**, not a verbatim
  transcription of a real external spec (none exists — see the audit). The
  implementation matches the RULES as stated in this prompt; if a real spec
  ever surfaces with different definitions, this contract may need to change.

## Tests

- `packages/frontend/src/__tests__/tautologyGate.test.ts` (19 tests) — pure
  gate logic: all 6 required behavioral cases (CASE 1, 4, 5, 6 directly;
  CASE 2/3 in the integration file below), C2's literal-identity check, the
  QE1-3-legitimacy check (same model, hypothesis-parameter, NOT circular),
  and the full 7-way aggregation matrix for `assessTautology`.
- `packages/frontend/src/__tests__/entanglementInquiryTautology.test.ts`
  (9 tests) — real `inquiryLoop.ts` integration: CASE 2 (QE1 whiteNoise:
  `EMPIRICAL_TEST` + a genuinely non-discriminating opening round, proven as
  two separate facts), CASE 3 (QE2: degenerate opening probe, a later probe
  that does discriminate), a QE3 regression check, a byte-identical-without-
  declaration check, and the evidence-boundary test (a synthetic
  `CONSISTENCY_CHECK` override of a real QE1 system: `evidenceMagnitude` is 0
  and `confidenceAfter === confidenceBefore` on every round despite real
  SUPPORTED/FALSIFIED judgements happening underneath).

**Red-before-green, on the record**: the evidence-boundary test was verified
genuinely red by temporarily reverting the cap line in `inquiryLoop.ts`
(`const magnitude = rawMagnitude` instead of the capped expression) and
re-running — failure: `expected 0.4666... to be +0`, confirming a real
confidence movement the cap must prevent — then restored, green again
(9/9). Diff preserved in the commit for this change.

## Verification (commit `<filled in at commit time>`)

- `tsc --noEmit -p .` — clean.
- `eslint` on every changed file — clean.
- Frontend suite: 468 files, 5187 passed, 1 pre-existing skip, 0 failures.
- Backend suite: 385 passed, 34 skipped, 1 failed — the SAME pre-existing
  git-worktree-only artifact documented in the P2.1 audit commit
  (`buildInfo.mjs` assumes `.git` is a directory; in a worktree it is a
  pointer file) — confirmed unrelated by re-running in a plain clone.
- Production build — clean.
- Real Chromium E2E against `#/inquiry` (all three real problems: QE1, QE2,
  QE3) — zero console errors, verdicts match the pre-existing documented
  behaviour (QE1 narrows to h:good/h:ideal and stays undecided; QE2 and QE3
  both recover the true hypothesis).
