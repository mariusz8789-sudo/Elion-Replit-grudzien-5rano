# Genesis — `atom-bohr` observation benchmark admission

Audit and specification carried through to a decision. **Nothing was implemented**: no Scientific
Core change, no `expectedValues[]`, no derived-metric layer, no Evidence Pack, no Replay, no
solver, no adapter, no model change. This report is the only file added.

Evidence classes: **FACT** = executed or read in this repository at LIVE HEAD; **INFERENCE** =
derived from FACTs by stated reasoning; **ESTIMATE** = judgement; **VERIFY_REQUIRED** /
**REFERENCE_UNPINNED** = could not be established here.

| Item                    | Value                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| LIVE HEAD               | `2e27005eb444aa0b55996b5fbd89652f2a9099e7` — "docs: add observation pair admission checklist" |
| Work branch             | `claude/atom-bohr-benchmark-admission-v2`, from `2e27005`                                     |
| Merged / pushed to LIVE | no                                                                                            |

## Decision

# BUILD LATER

**Justification in one paragraph.** The pair is scientifically sound and the smallest correct
solution has been identified and costed (Option D, §5). But three things are proven blockers today,
each by execution rather than inspection: the absolute-energy benchmark is a hardcoded-constant
readback (§3); **no relation in the current falsification contract can express
"prediction vs measured reference" for a model whose output varies across arms** (§4) — which makes
**Gap A, not Gap B, the binding constraint**; and every NIST reference remains unpinnable in this
environment (§2). `BUILD NOW` would require shipping a benchmark that either fails by construction
or passes only under a tolerance spanning an order of magnitude. Neither is admissible.

## 1. Correction to the previous candidates report

`GENESIS_VALID_MODEL_OBSERVATION_CANDIDATES.md` proposed comparing `atom-bohr`'s hydrogen
ionization energy against a NIST value as the headline benchmark. **That proposal is withdrawn.**
FACT: `RYDBERG_EV = 13.605693` is hardcoded (`bohrModelGraph.ts:13`), and for Z=1, n=1 the
assertion `ionizationPhotonEV === RYDBERG_EV` evaluates **`true`**. That comparison tests data
entry, not the model.

## 2. Reference sources — still `REFERENCE_UNPINNED`

FACT, unchanged and re-verified: network egress is denied. `curl` returns
`(56) CONNECT tunnel failed, response 403` for `physics.nist.gov`, `pml.nist.gov`,
`tsapps.nist.gov` and `arxiv.org`; `WebFetch` returns `EGRESS_BLOCKED`; the agent proxy reports
`connect_rejected — gateway answered 403 to CONNECT (policy denial)`.

No number has been transcribed into a fixture and no fixture was created. Search snippets are not
artifacts and were not used as reference values. Target sources, all `VERIFY_REQUIRED`: NIST ASD
(SRD 78, DOI `10.18434/T4W30F`), NIST CODATA pages for R∞ and the electron–proton mass ratio, and
the NIST SRD terms of use. CI has network access (the `pyscf-real` job installs from PyPI, FACT),
so pinning is possible there — fetch once, keep the raw bytes unmodified, `sha256sum` them, and
record URL, query, retrieval timestamp, dataset, version, unit, observable definition, uncertainty
and licence, exactly as `docs/evidence/usgs/` already does.

## 3. Forensic audit of `atom-bohr`

Source: `packages/frontend/src/core/modelGraph/bohrModelGraph.ts`, executor case `atom-bohr`,
router entry `router.ts:198`.

| Aspect               | Finding                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs               | `atomicNumber` (Z, 1–118), `principalN` (n, 1–10). Both integers. **The reference is never an input** (FACT)                                                                                                   |
| Outputs              | `energyLevelEV`, `orbitalRadiusPm`, `ionizationPhotonEV`. **No wavelength, no transition, no second quantum number** (FACT)                                                                                    |
| Hardcoded constants  | `RYDBERG_EV = 13.605693`, `BOHR_RADIUS_PM = 52.917721` (`bohrModelGraph.ts:13-14`)                                                                                                                             |
| Correction terms     | **None.** No isotope, no reduced mass, no fine structure, no QED. A corrected prediction cannot be produced by the model at all (FACT)                                                                         |
| Declared assumptions | Good: `honesty: 'simplified'`, `derivation: 'approximate'`; notes state exactness only for one-electron systems, circular orbits superseded by orbitals, screening breaks the relation for many-electron atoms |
| Model version        | `1.0.0`, engine `genesis-model-graph@1.0.0`                                                                                                                                                                    |

### What is prediction and what is conversion

FACT — every output has the form **C × f(Z, n)**, where C is a hardcoded constant and f is an
exact rational function of two integers:

- `energyLevelEV` = −`RYDBERG_EV` · Z²/n²
- `ionizationPhotonEV` = +`RYDBERG_EV` · Z²/n²
- `orbitalRadiusPm` = `BOHR_RADIUS_PM` · n²/Z

**INFERENCE.** The falsifiable content is entirely in f — the Z² and 1/n² scaling. The magnitude C
is an input to the source file, not a result of the model. Therefore a single-point comparison
against a measurement conflates "is the constant right" with "is the structure right", and at the
degenerate point (Z=1, n=1) it degenerates completely into the constant.

### What can be compared with an independent observation

FACT (executed; wavelengths derived **outside** the model from level differences using CODATA hc,
because the model emits no wavelength):

| Line          | Model λ (nm) |
| ------------- | ------------ |
| Lyman-α (2→1) | 121.5023     |
| H-α (3→2)     | 656.1123     |
| H-β (4→2)     | 486.0091     |
| H-γ (5→2)     | 433.9367     |

Ratios cancel C exactly, isolating structure:

| Ratio               | Model        | Closed form           | Depends on C? |
| ------------------- | ------------ | --------------------- | ------------- |
| λ(H-α)/λ(H-β)       | **1.350000** | (3/16)/(5/36) exactly | no            |
| λ(H-α)/λ(H-γ)       | **1.512000** | exact rational        | no            |
| λ(H-α)/λ(Ly-α)      | **5.400000** | exact rational        | no            |
| λ(H 4→2)/λ(He⁺ 4→2) | **4.000000** | Z² scaling            | no            |

Intra-hydrogen ratios also cancel the reduced mass exactly — the same μ multiplies every level of
one isotope — so they test the 1/n² law alone. The H-versus-He⁺ ratio does **not** cancel μ, which
is where a two-directional raw-fails / corrected-passes test naturally lives.

## 4. Gap analysis — the binding constraint is Gap A, not Gap B

### 4.1 What the contract offers

FACT. `FalsificationCriterion` supports five relations. Their behaviour against a _measured
reference_ is:

| Relation                                    | Uses a reference?                            | Suitable for prediction vs measurement?                     |
| ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `equal-within-tolerance`                    | one `expectedValue` for **all** variant arms | only if every arm should equal the same value               |
| `greater-than` / `less-than`                | one threshold                                | threshold test; produces **no residual**                    |
| `monotonic-increase` / `monotonic-decrease` | **none at all**                              | model self-consistency only — not a comparison with reality |

### 4.2 Proof that no informative benchmark is expressible today (FACT, executed)

A protocol is built from a baseline plus a **single-parameter** sweep, and the planner requires at
least one sweep value differing from the baseline (`scientificPlanner.ts:80`, error reproduced) with
unique values (`:41`, error reproduced). Both `ionizationPhotonEV` and `orbitalRadiusPm` are
strictly monotone in each of Z and n, so **two arms of a single-parameter sweep can never share a
predicted value**. The degenerate pairing that would dodge this — for example (Z=1,n=1) and
(Z=2,n=2), both equal to C — requires changing two parameters at once, which a single-parameter
sweep cannot do.

Executed consequence, sweeping `principalN` over [2, 3] with `expectedValue = 13.605693`:

| Tolerance | Arm values                                      | Assessment                                                                                                      |
| --------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0.01      | baseline 13.605693; variants 3.401423, 1.511744 | **FALSIFIED_WITHIN_PROTOCOL** — by construction, regardless of physics                                          |
| 13        | same                                            | **SUPPORTED_WITHIN_PROTOCOL** — but the tolerance spans an order of magnitude and is scientifically meaningless |

Sweeping `atomicNumber` over [2, 3] gives 54.422772 and 122.451237 — the same structural failure.

**Control arms do not help.** FACT: the evaluator filters `arms.filter((arm) => arm.kind === 'variant')`,
so a `positive-control` arm is recorded but never asserted against the criterion.

**INFERENCE.** Any honest `atom-bohr` benchmark needs at least two arms, therefore at least two
predicted values, therefore at least two references. **Gap A is unavoidable.** Gap B (a derived
metric) is only needed if one insists on ratio observables.

### 4.3 A third finding — Option A does not do what it appears to

**Gap B was described as "the metric must be a literal output key"
(`scientificExecutor.ts:16`, FACT). A within-run expression layer would relax that — but it still
would not enable the ratio benchmark.** λ(H-α) and λ(H-β) come from _different_ (n) values, hence
**different runs in different arms**. A ratio of them is a **cross-arm** quantity, not a function of
one run's outputs. So a within-run derived metric solves nothing here.

## 5. Options compared

### Option A — within-run derived metric / expression layer

Let `primaryMetric` be an expression over one run's outputs.

- Files: `scientificDiscovery.ts` (design/criterion types), `scientificExecutor.ts` (`armEvidence`
  extraction at `:16`, series path at `:108`).
- Lines: 40–80 (`ESTIMATE`).
- Regression risk: **medium** — changes how every arm's value is extracted, for every existing
  protocol.
- Protocol / A-B impact: all existing literal-key protocols must stay byte-identical.
- Evidence / Replay: the derivation must enter the protocol fingerprint, or changing it would be a
  silent pass instead of DRIFT.
- Migration: additive if the literal-key path is preserved.
- Tests: existing protocols produce identical `evidencePackId`; derived value matches manual
  computation; malformed expression → `INCONCLUSIVE`, never a silent pass.
- Architecturally consistent: yes.
- **Verdict: does not solve the problem.** It cannot express a cross-arm ratio (§4.3), and it does
  not remove the one-`expectedValue` constraint.

### Option B — a separate benchmark arm per observable

Keep the contract; give each observable its own arm.

- Files: none.
- Lines: 0.
- Risk: none.
- **Verdict: proven not to work** (§4.2). Arms of a single-parameter sweep always have different
  predicted values, and one `expectedValue` is applied to all of them, so the protocol either
  falsifies by construction or passes on a meaningless tolerance. Zero code change, zero scientific
  validity.

### Option C — cross-arm derived metrics in `scientificExecutor`

Introduce a metric computed _across_ arms — for example the ratio of two named arms' values.

- Files: `scientificDiscovery.ts` (design type, arm references), `scientificExecutor.ts`
  (`evaluateHypothesis`, `armEvidence`, series path), plus `evidencePack.ts` if the derived value is
  reported.
- Lines: 80–150 (`ESTIMATE`).
- Regression risk: **high** — introduces a new evaluation stage and a dependency between arms that
  the contract currently does not have; arms are presently independent.
- Protocol / A-B impact: significant. `outputValues` is per arm today; a cross-arm quantity has no
  home in the existing `ExperimentArmEvidence` shape.
- Evidence / Replay: the cross-arm derivation and its operand arm ids must be fingerprinted.
- Migration: new concept, needs its own admission.
- Architecturally consistent: **questionable** — it breaks arm independence.
- **Verdict: most powerful, least proportionate.** Not justified by one benchmark.

### Option D — model transition output + per-arm references _(recommended)_

Give `atom-bohr` a transition observable, and let the criterion carry one reference per arm. Then
each arm is compared to _its own_ measured wavelength — **no ratio, no cross-arm machinery, no
derived-metric layer**.

- Files:
  - `packages/frontend/src/core/modelGraph/bohrModelGraph.ts` — add `principalNUpper` input and
    `transitionEnergyEV` / `transitionWavelengthNm` nodes (~30–40 lines);
  - `packages/frontend/src/core/experimentFabric/router.ts` — one extra parameter on the
    `atom-bohr` entry, bump `modelVersion` to `1.1.0` (~3 lines);
  - `packages/frontend/src/core/experimentFabric/executor.ts` — add the new keys to the
    `graphOutputs(...)` list (~1 line);
  - `packages/frontend/src/core/experimentFabric/scientificDiscovery.ts` — optional
    `expectedValues?: readonly number[]` on `FalsificationCriterion` (~3 lines);
  - `packages/frontend/src/core/experimentFabric/scientificExecutor.ts` — in the
    `equal-within-tolerance` branch, prefer the per-arm array when present (~15–25 lines).
- Lines: **~55–75 production, ~90 tests** (`ESTIMATE`).
- Regression risk: **medium, and one specific hazard must be handled.** FACT:
  `runFingerprint` hashes `result.outputs` (`provenance.ts`). Adding outputs to `atom-bohr`
  therefore **changes the fingerprint of every `atom-bohr` run**, so any previously persisted
  `atom-bohr` capsule or Evidence Pack will report DRIFT on replay. Mitigation: bump `modelVersion`
  to `1.1.0` so the change is explicit in the plan fingerprint, and treat pre-existing `atom-bohr`
  evidence as requiring re-execution rather than silently mismatching. This must be a stated
  decision, not a surprise.
- Protocol / A-B impact: **none** for existing protocols — the criterion field is optional and the
  single-value path is untouched.
- Evidence / Replay: unchanged machinery. Reference artifact hashes enter the protocol fingerprint
  so swapping a reference file is DRIFT, not a silent pass.
- Migration: additive; only `atom-bohr` evidence is affected, by design.
- Tests: existing single-value protocols keep identical `evidencePackId`; per-arm path passes and
  fails correctly; mismatched array length → `INCONCLUSIVE`, never a silent pass; existing
  `atom-bohr` outputs unchanged in value.
- Architecturally consistent: **yes** — it adds a model output and one optional criterion field,
  and uses the existing Evidence and Replay layers untouched.

## 6. Is there a simpler benchmark that avoids Gap B entirely?

Yes — **Option D is exactly that**: with a transition-wavelength output, each arm is compared to
one reference value, so Gap B never arises. It does still need Gap A.

The question was also asked in a stricter form: is there a benchmark using **an existing single
output**, genuinely falsifiable, needing neither gap, and not comparing a hardcoded constant?

**Answer: no** (INFERENCE from §4.2, proven by execution). Every existing output is C × f(Z,n) and
strictly monotone in both parameters, so any admissible two-arm protocol yields two different
predicted values that one `expectedValue` cannot serve. The only relations needing no reference are
the monotonic ones, and those compare the model with itself, not with an observation. A
`monotonic-decrease` sweep of `ionizationPhotonEV` over n is expressible today and would pass — but
it is **not** a model-versus-observation benchmark and must not be presented as one.

## 7. Options table

| OPTION                                         | SCIENTIFIC VALIDITY                                                                | CODE CHANGE                                                                                                                  | RISK                                                                                 | TIME    | RECOMMENDATION               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------- | ---------------------------- |
| **A** — within-run derived metric              | **None for this pair** — cannot express a cross-arm ratio                          | `scientificDiscovery.ts`, `scientificExecutor.ts`; 40–80 lines                                                               | Medium                                                                               | 10–16 h | **Reject for this purpose**  |
| **B** — one arm per observable, no code change | **None** — falsifies by construction, or passes on an order-of-magnitude tolerance | none                                                                                                                         | None                                                                                 | 0 h     | **Reject**                   |
| **C** — cross-arm derived metrics              | High — enables constant-free ratio tests                                           | `scientificDiscovery.ts`, `scientificExecutor.ts`, `evidencePack.ts`; 80–150 lines                                           | **High** — breaks arm independence                                                   | 20–30 h | **Defer** — disproportionate |
| **D** — transition output + per-arm references | **High** — real prediction, own reference per arm, residual per arm                | `bohrModelGraph.ts`, `router.ts`, `executor.ts`, `scientificDiscovery.ts`, `scientificExecutor.ts`; ~55–75 lines + ~90 tests | Medium — **`atom-bohr` run fingerprints change**; mitigate with `modelVersion` 1.1.0 | 16–24 h | **Recommended**              |

Smallest solution giving a genuine `prediction → reference observation → residual → Evidence →
Replay`: **Option D.**

## 8. Benchmark design under Option D (specification only)

- Arms: sweep `principalNUpper` over [3, 4, 5] with `principalN` = 2 fixed, Z = 1 — the H-α, H-β,
  H-γ lines.
- Metric: `transitionWavelengthNm`, a literal output key. No Gap B.
- References: one pinned NIST vacuum wavelength per arm via `expectedValues[]`. Medium (vacuum vs
  air) must be explicit — they differ in the fourth digit.
- **Two-directional, pre-registered before any run:** the raw Bohr arms are asserted to **FAIL** at
  a tolerance tighter than the reduced-mass departure (~5.4 × 10⁻⁴ relative), and a
  reduced-mass-corrected variant is asserted to **PASS** at a separate, explicitly different
  tolerance derived from the reference uncertainty alone. Both tolerances are recorded in the
  protocol before execution. A benchmark that can only pass proves nothing.
- Fixture layout, replay policy and negative cases: as specified previously — pinned files only, no
  network refetch; tamper a payload byte → `BLOCKED`; change a reference value, unit, medium,
  transition, `transformVersion` or `correctionVersion` → `DRIFT`; missing uncertainty or licence →
  `BLOCKED` / `VERIFY_REQUIRED`; and the discipline case — loosening the raw tolerance until the raw
  arm passes must be rejected as post-hoc.
- **Still blocked:** the model has no correction path, so the corrected arm needs either an isotope
  or reduced-mass input, or the correction applied in the benchmark harness and declared as such.
  This is a further decision inside Option D, not a hidden cost.

## 9. Decision

# BUILD LATER

The pair is scientifically sound and Option D is the smallest correct route to it, at ~55–75
production lines and 16–24 h (`ESTIMATE`). It is not `BUILD NOW` because three blockers are proven
rather than suspected: the absolute benchmark is a constant readback; **no current relation can
express prediction-versus-reference for an output that varies across arms**, so Gap A is
unavoidable and Option B — the zero-code path — is dead; and every reference remains
`REFERENCE_UNPINNED` under a denied egress policy. It is not `REJECT` because none of those is
intrinsic: each has a specific, costed remedy, and the underlying physics gives a genuine,
two-directional falsification test.

Order of work when it is taken up: decide the `atom-bohr` fingerprint migration first, then
Option D's model output and per-arm criterion, then pin the NIST artifacts where egress exists,
then the pre-registered protocol. Do not build Options A, B or C for this purpose.
