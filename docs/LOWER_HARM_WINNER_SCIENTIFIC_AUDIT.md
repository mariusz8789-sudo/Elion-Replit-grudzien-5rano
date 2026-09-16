# LOWER_HARM WINNER — Final Scientific / Investor Audit

**Scope:** the LOWER_HARM WINNER, `CHEMBL4084119` (liraglutide), and its Research Recipe.
**State frozen at commit `8608ccc8adc611fe83211414ab825f35734ad591`.** No production logic was
changed to produce this audit — every number below was obtained by calling the real, existing,
unmodified functions directly (`runA2Analysis`, `rankForLowerHarm`, `runLowerHarmFunnel`,
`runGovLowerHarmDiscovery`, `buildLowerHarmRecipe`), never by reading a report and assuming it still
held. `git status` was clean before and after except for this one new, additive file.

## 1. Evidence items — what backs the WINNER, item by item

Liraglutide's real evidence base is **3 ClinicalTrials.gov trials**, each individually inspected in
this audit:

| NCT ID | n | Candidate's own HbA1c change | vs. semaglutide reference | Within preregistered margin? | Source |
|---|---|---|---|---|---|
| `NCT03172494` | 341 | −1.71 pp | −0.01 pp | Yes (CI [−0.149, +0.129]) | Base pinned dataset |
| `NCT00518882` | 227 | −1.12 pp | +0.58 pp | **No** — worse | Base pinned dataset |
| `NCT00318461` | 236 | −1.00 pp | +0.70 pp | **No** — worse, CI **entirely outside** the margin | External supplement (D-110/LEAD-2, additively ingested, hash-verified — see §3) |

**PASS** — this is real, per-trial, per-arm data (not a synthesized or invented summary): title, arm
labels, group sizes and measurements were read directly from the pinned JSON in this audit
(`packages/frontend/src/core/biotechData/a2-ozempic-substitute/trials-CHEMBL4084119.json` and
`external-supplement/trials.supplement.json`).

**Important, disclosed nuance — not a defect:** all three comparisons are `NAIVE_INDIRECT`
(`comparisonType`/`fairnessFlags` on every record, read directly): none of liraglutide's own trials
contains a semaglutide arm, so every comparison is against semaglutide's own real arm *from a different
trial* — population, dose and follow-up duration may differ. This is the system's own disclosed
limitation, not something this audit found and had to surface.

**Falsification result at the A2 level (efficacy-vs-reference rule):** one real failure is recorded —
`"At least one trial shows the candidate's HbA1c/weight change CI entirely outside the margin in the
WORSE direction"` (`NCT00318461`). The belief-revision trace (read directly from
`runA2Analysis().candidateReports`) shows hypothesis H1 ("comparable efficacy") moving
0.25 → 0.590 → 0.590 → **0.318, `FALSIFIED_WITHIN_PROTOCOL`** across the three trials in sequence — a
real, auditable Bayesian-style trace, not a single opaque score. **PASS on disclosure; OPEN on
interpretation** — see §6.

## 2. Safety evidence — real numbers, with real gaps disclosed

Read directly from the same real candidate report (`report.safety`, 8 preregistered categories):

| Category | Candidate | Reference | Risk ratio (95% CI) | Verdict |
|---|---|---|---|---|
| Nausea | 14/358 | 84/469 | 0.218 [0.126, 0.378] | favours candidate |
| Diarrhea | 23/358 | 54/469 | 0.558 [0.349, 0.891] | favours candidate |
| Serious adverse events (structural) | 14/358 | 13/469 | 1.411 [0.672, 2.964] | worse-direction point estimate, **CI includes 1** (not statistically significant) |
| Vomiting | no candidate data | 39/469 | n/a | **data gap** — disclosed as `null`, never imputed |
| Pancreatitis | no data either side | — | n/a | **data gap** |
| Gallbladder, hypoglycemia, renal | no candidate data | 0 events | n/a | **data gap** on the candidate side |

**PASS** — every cell is a real number or an honest `null`; nothing is fabricated to fill a gap. A2's
own existential-safety-veto check found no threshold-crossing worse signal for liraglutide
(`vetoed: false, vetoReason: null`), independently confirmed in this audit by direct inspection of
`report.score`.

## 3. Provenance / hash chain

- **Present, independently re-verified in this audit:** `candidates.json` and `targets.json`'s
  recorded `narrowSha256` in `meta.json` were recomputed against the actual files on disk — **both
  match exactly**.
- **Present, independently re-verified in this audit:** the D-110 external supplement
  (`NCT00318461`, LEAD-2) is additively ingested through a real, unit-tested acceptance gate
  (`a2TrialEvidenceGate.mjs`) — see the standing `docs/INTEGRATION_CONTRACT_AUDIT.md`.
- **Runtime custody, re-verified live in this audit:** a fresh `runGovLowerHarmDiscovery({mode:
  'PRODUCTION'})` call shows `evidenceCustody.ok: true`, source `LOWER_HARM_A2_PINNED_DATASET`
  (`internal://a2-ozempic-substitute/candidates-with-trials.json`), artifact hash
  `4d63f8f0d24ab28b528e4c386fa01adf64d640aa7e05d410d5dc0fa9a6e36b10`, status `FROZEN`, and a replay
  check reporting `"replay matches the frozen artifact"`.
- **OPEN — disclosed limitation of this audit, not a defect found in the system:** the runtime custody
  check above covers `candidates-with-trials.json`, which is a **candidate-eligibility membership
  list** (used only to build the set of ChEMBL IDs that have trial data). The actual per-trial
  efficacy/safety numbers used in scoring come from the individually-imported
  `trials-CHEMBL4084119.json` (a narrowed, pre-extracted file, statically compiled into the module
  graph). `meta.json` records a `rawSha256` for the underlying raw ClinicalTrials.gov API responses
  (e.g. `trial-NCT03172494.json`), but **those raw files are not present in this checkout** — only
  their hash is recorded. This audit could not re-fetch ClinicalTrials.gov and independently re-verify
  raw-bytes-to-narrowed-extract fidelity (no live external network re-fetch was performed). The
  narrowed file's own content was read directly and cross-checked internally for consistency (trial
  titles, arm labels, and group sizes all read as coherent, real ClinicalTrials.gov-shaped records),
  but a byte-level chain from the live external source through to the narrowed file was not
  independently reproduced end-to-end in this session.

## 4. Observation count / evidence-sufficiency gate

`practicalCandidateGate.ts::MINIMUM_OBSERVATIONS = 3`. Liraglutide's real, valid observation count is
exactly 3 (the three trials in §1) — **exactly at the floor**, not comfortably above it. Re-verified
live in this audit by calling `evaluatePracticalCandidate` on the real gated candidate: `failures: []`
(the `EVIDENCE_SUFFICIENT` criterion held). For contrast, the TOP2 runner-up (exenatide,
`CHEMBL414357`) has exactly 1 observation and is **REFUSE**d by the same gate on this exact criterion
(`"1 observation(s) behind this candidate; the gate requires at least 3"`) — direct proof the gate is
live, not decorative. **PASS**, with the standing caveat that "3 of 3" is a minimum, not a margin.

## 5. Safety / governance gate (the real `GateDecision`)

Re-derived live, directly from `evaluatePracticalCandidate`:

```json
{
  "outcome": "REQUIRES_HUMAN_APPROVAL",
  "failures": [],
  "requiresCapability": "candidate.activate",
  "reason": "Every criterion passes, but a intervention candidate at safety class POPULATION describes something being DONE. Activation goes through the existing approval workflow in core/governance, with separation of duties; this module does not authorise it.",
  "fingerprint": "cf987dda"
}
```

**PASS, and structurally guaranteed, not incidental:** the gate's own code
(`candidateClass === 'intervention' || 'protocol' || safetyClass === 'POPULATION'` ⇒
`REQUIRES_HUMAN_APPROVAL`, never `ACTIVATE`) means no population-level candidate — winner or not —
can ever be autonomously activated by this system. This was verified by reading the gate function's
source directly, not inferred from one favourable output.

## 6. Falsification result — the real conjuncts

Re-derived live from `decideFunnelVerdict` on a fresh `runLowerHarmFunnel()` call:

| Conjunct | Held? | Detail |
|---|---|---|
| `G2_SEPARATES_TOP2` | **true** | `"EFFICACY_DELTA_PP"` separates the pair, 0 unresolved pairs, falsification power 100% |
| `AGREES_WITH_PRE_EXPERIMENT_RANK` | **true** | G2 favours `CHEMBL4084119`; pre-experiment TOP2 rank #1 was already `CHEMBL4084119` — no post-hoc re-ranking occurred |
| `FAVOURED_CANDIDATE_PASSES_SAFETY_GATE` | **true** | gate outcome `REQUIRES_HUMAN_APPROVAL` (not `REFUSE`) |

**PASS on the funnel's own rule.** **OPEN, disclosed here explicitly:** this is the LOWER_HARM
funnel's rule — a *relative, safety-dominant, two-candidate* comparison. It is **not** the same claim
as "liraglutide beats semaglutide." A2's own, separately preregistered, stricter rule (efficacy-vs-
reference-outright) reaches a **different label for the same candidate on the same data**:
`NO_SUPERIOR_CANDIDATE` (re-verified live: `runA2Analysis().verdict.label === 'NO_SUPERIOR_CANDIDATE'`,
`analysisFingerprint 8c99ae95`). Both are real, both are correct under their own frozen rule, and the
system discloses both — it does not present LOWER_HARM's WINNER as "beats the reference drug."

## 7. Preregistration / freeze linkage

- `LOWER_HARM_PREREGISTRATION_FINGERPRINT` is **computed**, not hand-typed:
  `fnv1a(canonicalJson(frozenView()))` over a static object (scenario id, contract version, research
  question, mechanism targets, reference drug, efficacy floor, axes, ranking weights, safety
  categories, policies, allowed verdicts, banned strings) — read directly from source in this audit.
  No timestamp or volatile field is included, so the fingerprint is deterministic and reproducible —
  confirmed: `c827c79c` appeared identically across two independent live `PRODUCTION` runs today, and
  matches the value recorded in `docs/DECISIONS.md`'s D-115 entry from 2026-09-15.
- **Real ranking weights, read directly from source:** `safety: 2, efficacyMarginAboveFloor: 0.25,
  evidenceStrength: 0.5, uncertaintyPenalty: -0.5, conflictPenalty: -1`.
- **Real efficacy floor rule:** `minFractionOfReferenceEffect: 0.7` of `referenceEffectPp` (semaglutide's
  own reference effect). **OPEN, a real nuance found during this audit:**
  `evaluateEfficacyFloor` uses `report.efficacy.find(e => e.outcomeMetric === 'HBA1C')` — the
  **first** HbA1c record in the candidate's efficacy array, not an aggregate/mean across all three
  trials. For liraglutide this resolves to `NCT03172494` (meanChangePp −1.71), giving the "100.6% of
  floor" figure shown in `lower-harm:demo`'s output — independently reproduced in this audit. This is
  a real design choice (documented in the source as "the candidate's OWN absolute HbA1c change... not
  a synthesis"), not a bug, but it means the floor gate is sensitive to *which* trial happens to be
  first in the array, not a pooled estimate across the full evidence base. This is disclosed here as
  an OPEN item for anyone relying on "100.6%" as a pooled/meta-analytic figure — it is not one.
- **Machine-enforced invariant, verified by reading source:** `assertSafetyDominatesRanking` and
  `assertNoNaturalnessBias` run **at module load time** — if the weights or frozen content were ever
  edited to violate safety-dominance or introduce a natural-origin bias, the module would fail to load
  at all, not merely fail a test. **PASS.**
- **Axis-by-axis evidence coverage, read directly from the preregistration's own declaration:**
  `toxicity_organ_burden`, `severe_adverse_events`, `gastrointestinal_burden`,
  `administration_burden_route` are `EVALUATED` (real extraction exists and was used).
  `discontinuation_rate`, `psychiatric_cognitive`, `long_term_risk` are `DEFERRED_SEPARATE_WORK` — the
  preregistration's own text requires any consumer to report these as explicit `UNKNOWN`, never as "no
  risk." `dependence_addiction_abuse_withdrawal` is `NOT_CENTRAL_TO_DOMAIN` with a stated
  pharmacological rationale (no established liability for this receptor class in the literature this
  space draws from). **These are OPEN items by the system's own design — not omissions this audit
  found, but the system's own disclosed scope boundary**, reproduced verbatim here per this task's
  instruction to confirm exactly what remains outside the system's evidence.

## 8. WinnerRecord and recipe fingerprint

Re-verified live, twice, via the real public entry points (not read from documentation):

```
runGovLowerHarmDiscovery({ mode: 'PRODUCTION' }):
  verdict:             WINNER
  winner.winnerId:     CHEMBL4084119
  conjunctionOk:       true
  runFingerprint:      5e341186
  preregistrationFingerprint: c827c79c
  falsificationCriteriaFingerprint: af76e28c
  recipeFingerprint:   7ddcabe9
  auditFingerprint:    6615057e
  all 20 orchestrator stages: OK (18_RECIPE_OR_LOCK = OK, not LOCKED)

replayGovLowerHarmDiscovery({ mode: 'PRODUCTION' }):
  ok: true — first.recipeFingerprint === second.recipeFingerprint (7ddcabe9 both times)
```

**PASS.** These are the authoritative, live-reproduced values. This audit additionally rebuilt the
recipe's substantive **content** directly via `buildLowerHarmRecipe(realLiraglutideReport, ...)` (not
the orchestrator's cached internal state, so its own recomputed fingerprint differs — expected, and
irrelevant to the authoritative value above, which came from the real entry point) to confirm the
recipe's real fields:

- `mechanism`: states the real ChEMBL median potency (4.59 nM at GLP-1R) and explicitly notes it was
  "selected under the LOWER-HARM safety-dominant ranking rule, not the efficacy-first A2 rule."
- `conceptualSynthesisRoute`: **"CONCEPTUAL ONLY... this record intentionally contains no step-level
  procedure, no reagent quantities, and no operational parameters."** — read directly from the real
  output. **PASS on KROK-2-item-14-style no-synthesis-instructions guarantee, reconfirmed here.**
- `identifiers`: `CHEMBL4084119, NCT03172494, NCT00518882, NCT00318461` — the real, same three trials
  from §1, not a placeholder list.
- `requiredProperties` includes `"Manufacturability at national-programme scale — UNVERIFIED in this
  run."` — an explicit, disclosed OPEN item written by the system itself.
- `limitations` (from the real orchestrator path, confirmed via the earlier `winner-recipe:demo` run
  of the same builder function): *"Single funnel pass: no independent replication in a disjoint trial
  population has been performed."* and the real G2 discriminability percentage.

## 9. What Genesis demonstrates vs. what remains outside its evidence

**Demonstrated by Genesis, with real data, reproducibly:**
- Liraglutide clears the preregistered efficacy floor and passes the existential safety veto, under a
  frozen, safety-dominant ranking rule, among the real candidates in this mechanism space.
- The pairwise falsification experiment (G2) genuinely separates liraglutide from its only real rival
  (exenatide), and that separation agrees with the ranking computed *before* the experiment ran
  (anti-HARK protection — real, not asserted).
- The result reproduces bit-for-bit across independent runs (fingerprint stability, confirmed live).
- The system never lets this result leave the research layer without a mandatory human-approval gate.
- The recipe contains no dosing, prescription, or synthesis procedure.

**Explicitly OUTSIDE what Genesis's evidence currently supports (system's own disclosures, reproduced
here, not softened):**
- **Not** a head-to-head randomized trial result — every comparison is `NAIVE_INDIRECT`.
- **Not** a claim that liraglutide is superior to semaglutide — A2's own, separately preregistered rule
  says `NO_SUPERIOR_CANDIDATE` on the identical data; LOWER_HARM's WINNER is a narrower, relative,
  safety-dominant claim among a small real candidate pool, not an outright superiority claim.
- **Not** independently replicated — "single funnel pass," stated by the system itself.
- **Not** evaluated on discontinuation rate, psychiatric/cognitive safety, or long-term (>72 week) risk
  — all three are explicitly `DEFERRED_SEPARATE_WORK` in the sealed preregistration.
- **Not** a manufacturability, regulatory, or economic assessment — `"UNVERIFIED in this run"`, stated
  in the recipe's own `requiredProperties`.
- **Not** independently re-verified raw-API-to-narrowed-extract byte fidelity in this audit session —
  the raw ClinicalTrials.gov response files are not present in this checkout (§3).

## 10. PASS / OPEN summary

| # | Item | Status |
|---|---|---|
| 1 | Real, traceable trial-level evidence (3 NCT trials) | **PASS** |
| 2 | Safety category data, real numbers, gaps disclosed not imputed | **PASS** |
| 3 | Custody/hash of the eligibility-list source (live, re-verified) | **PASS** |
| 4 | Custody/hash of raw per-trial API bytes | **OPEN** — raw files absent from checkout, not independently re-verified this session |
| 5 | Observation count (exactly 3, at the floor, not above it) | **PASS**, margin-sensitive — noted |
| 6 | Safety/governance gate (REQUIRES_HUMAN_APPROVAL, structurally guaranteed) | **PASS** |
| 7 | Falsification conjuncts (all 3 held, anti-HARK intact) | **PASS** |
| 8 | LOWER_HARM WINNER vs. A2's own NO_SUPERIOR_CANDIDATE — both disclosed, not reconciled into one number | **PASS on disclosure** — genuine, real scope difference, not a contradiction to "fix" |
| 9 | Preregistration fingerprint (computed, load-time-checked, reproducible) | **PASS** |
| 10 | Efficacy floor uses first-found trial, not a pooled estimate | **OPEN** — real, disclosed nuance for anyone reading "100.6%" as a meta-analytic figure |
| 11 | WinnerRecord + recipeFingerprint (live-reproduced twice, deterministic) | **PASS** |
| 12 | Recipe: no dosing/prescription/synthesis content | **PASS** |
| 13 | Deferred/out-of-scope safety axes (discontinuation, psychiatric, long-term) | **OPEN by design** — sealed as UNKNOWN, never asserted as "no risk" |
| 14 | Manufacturability / regulatory / economic viability | **OPEN** — explicitly unverified in the recipe's own text |
| 15 | Independent, disjoint-population replication | **OPEN** — explicitly a single funnel pass |

**No promotion, deployment, or threshold change was made or recommended by this audit.** Every OPEN
item above is either a limitation the system already discloses in its own output, or a boundary of what
this audit session could independently re-verify (external network re-fetch) — none is a hidden defect
found and left unfixed.
