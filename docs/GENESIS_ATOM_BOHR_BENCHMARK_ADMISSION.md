# Genesis — `atom-bohr` observation benchmark admission (spec only)

Specification and audit. **No Scientific Core change, no `expectedValues[]`, no Evidence Pack, no
Replay system, no solver, no adapter, no model change was implemented.** This report is the only
file added.

Evidence classes used throughout: **FACT** = executed or read in this repository at LIVE HEAD;
**INFERENCE** = derived from a FACT by stated reasoning; **ESTIMATE** = judgement, not a
commitment; **VERIFY_REQUIRED** = could not be established here.

| Item                    | Value                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| LIVE HEAD               | `39cba0bd8a2ccebae5f521ef7de50ec81c0e49e3` — "docs: record cto next gate readiness", 2026-08-27 20:23:26 +0000 |
| Work branch             | `claude/atom-bohr-benchmark-admission`, from `39cba0b`                                                         |
| Merged / pushed to LIVE | no                                                                                                             |

## Headline — and a correction to the previous report

**RECOMMENDATION: BUILD LATER.** Not because the data is missing, and not only because of the
`expectedValues[]` gap, but because this deeper audit found that **the benchmark proposed in
`GENESIS_VALID_MODEL_OBSERVATION_CANDIDATES.md` would largely have tested a hardcoded constant,
not the model.**

That previous report proposed comparing `atom-bohr`'s hydrogen ionization energy against the NIST
value as the headline test. This audit shows (FACT, §2) that for Z=1, n=1 the model's
`ionizationPhotonEV` **is identically the hardcoded constant `RYDBERG_EV = 13.605693`** — the
assertion `ionizationPhotonEV === RYDBERG_EV` evaluates `true`. Comparing that to a measurement
tests whether someone typed the right constant. It has no model content and must not be admitted
as a model-versus-observation benchmark.

The physics is still there — but it lives in the **structure** (the Z² and 1/n² scaling), not in
the absolute value. §3 specifies a benchmark that isolates exactly that.

## 1. Source verification — **all references remain `REFERENCE_UNPINNED`**

**No reference artifact could be pinned in this environment.** The task requires a fetched raw
artifact with a SHA-256; network egress is denied.

Evidence (FACT):

| Attempt                                                              | Result                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `curl https://physics.nist.gov/cgi-bin/cuu/Value?ryd`                | `curl: (56) CONNECT tunnel failed, response 403`                                                |
| `curl https://physics.nist.gov/cgi-bin/ASD/lines1.pl`                | same                                                                                            |
| `curl https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=958143` | same                                                                                            |
| `curl https://pml.nist.gov/cuu/Constants/index.html`                 | same                                                                                            |
| `curl https://arxiv.org/pdf/2409.03787`                              | same                                                                                            |
| `WebFetch physics.nist.gov`                                          | `EGRESS_BLOCKED`                                                                                |
| `WebFetch arxiv.org`                                                 | `EGRESS_BLOCKED`                                                                                |
| Agent proxy status                                                   | `connect_rejected — gateway answered 403 to CONNECT (policy denial)` for `physics.nist.gov:443` |

Per the task's own rule, the status therefore stays **`REFERENCE_UNPINNED`**, and no number is
transcribed into a fixture. Web search returned snippets; a snippet cannot be hashed and is not an
artifact, so it was not used as a reference value.

### Source targets, to be pinned where egress exists

`VERIFY_REQUIRED` on every row — URLs and identifiers below come from search result metadata, not
from a fetched artifact.

| Observable                   | Target source                         | Identifier                                                                                        | Notes                                                                                                                                                              |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hydrogen ionization energy   | NIST Atomic Spectra Database (SRD 78) | DOI `10.18434/T4W30F`; cited as Kramida, Ralchenko, Reader and NIST ASD Team, version 5.12 (2024) | Ionization energies form; unit eV; ASD is critically evaluated                                                                                                     |
| H-α vacuum wavelength, n=3→2 | NIST ASD lines output                 | `https://physics.nist.gov/cgi-bin/ASD/lines1.pl` (GET, query-parameterised)                       | Must select **vacuum** (Ritz or observed) explicitly; air vs vacuum differ in the 4th digit                                                                        |
| Rydberg constant R∞          | NIST CODATA                           | `https://physics.nist.gov/cgi-bin/cuu/Value?ryd`                                                  | CODATA 2022; a search snippet quoted 10973731.568157(12) m⁻¹, rel. u 1.1 × 10⁻¹² — **unpinned, do not transcribe**                                                 |
| Electron–proton mass ratio   | NIST CODATA                           | `https://physics.nist.gov/cgi-bin/cuu/Value?mesmp` or `mpsme`                                     | Needed for the reduced-mass correction                                                                                                                             |
| Licence / terms              | NIST SRD terms of use page            | `VERIFY_REQUIRED`                                                                                 | NIST works are generally US-Government works, but SRD databases carry their own citation and use conditions. Confirm before redistributing bytes in the repository |

**Recipe for whoever has egress** (CI already reaches the network — the `pyscf-real` job installs
from PyPI, FACT). For each source: fetch once with a recorded UTC timestamp, save the **raw
response bytes unmodified**, run `sha256sum` on those bytes, and record URL, query string,
retrieval timestamp, dataset name, version, unit, observable definition, stated uncertainty and
licence — the same contract `docs/evidence/usgs/` already follows.

## 2. Model audit — `atom-bohr`

Source: `packages/frontend/src/core/modelGraph/bohrModelGraph.ts`; executor case `atom-bohr`.

| Question                                              | Answer                                        | Evidence                                                                                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produces energy/wavelength as output?                 | **Partly.** Energy yes; **wavelength no**     | FACT: nodes are `atomicNumber`, `principalN`, `energyLevelEV`, `orbitalRadiusPm`, `ionizationPhotonEV`. There is no transition or wavelength node, and no second quantum number to define a transition         |
| Takes the reference as input?                         | **No**                                        | FACT: inputs are `atomicNumber` and `principalN`, both integers                                                                                                                                                |
| Declares assumptions and omissions?                   | **Yes, well**                                 | FACT: `honesty: 'simplified'`, `derivation: 'approximate'`; notes state one-electron validity only, circular orbits replaced by orbitals in QM, and that screening breaks the relation for many-electron atoms |
| Separates raw from reduced-mass-corrected prediction? | **No**                                        | FACT: no correction parameter, no second output, no isotope input. `RYDBERG_EV` is a single hardcoded constant (line 13)                                                                                       |
| Only an educational conversion?                       | **No — but less falsifiable than it appears** | See below                                                                                                                                                                                                      |

### The constant-readback problem (FACT)

`RYDBERG_EV = 13.605693` and `BOHR_RADIUS_PM = 52.917721` are hardcoded (lines 13–14).
`energyLevelEV = −RYDBERG_EV·Z²/n²`, and `ionizationPhotonEV = −energyLevelEV`.

Executed: for Z=1, n=1, `ionizationPhotonEV` returns **13.605693**, and
`ionizationPhotonEV === RYDBERG_EV` is **`true`**.

**INFERENCE:** an absolute ionization-energy benchmark at Z=1, n=1 compares a literal to a
measurement. It can only ever report that R∞ ≠ the hydrogen ionization energy — which is true by
definition, since R∞ is the infinite-nuclear-mass limit. It tests data entry, not physics.
**REJECT** it as a model benchmark.

### Where the falsifiable content actually is (FACT, executed)

Wavelengths below were derived **outside the model** from level differences using CODATA hc; the
model itself emits no wavelength.

| Line          | Model λ (nm) |
| ------------- | ------------ |
| Lyman-α (2→1) | 121.5023     |
| H-α (3→2)     | 656.1123     |
| H-β (4→2)     | 486.0091     |
| H-γ (5→2)     | 433.9367     |

Ratios **cancel the hardcoded constant entirely**, leaving pure structure:

| Ratio               | Model value  | Closed form                  | Depends on `RYDBERG_EV`? |
| ------------------- | ------------ | ---------------------------- | ------------------------ |
| λ(H-α)/λ(H-β)       | **1.350000** | (3/16)/(5/36) = 1.35 exactly | **no**                   |
| λ(H-α)/λ(H-γ)       | **1.512000** | exact rational               | **no**                   |
| λ(H-α)/λ(Ly-α)      | **5.400000** | exact rational               | **no**                   |
| λ(H 4→2)/λ(He⁺ 4→2) | **4.000000** | Z² scaling, exactly 4        | **no**                   |

**INFERENCE:** these are genuine, pre-computable, falsifiable predictions of the Bohr level
structure. A model with a different level law (say 1/n³) gives different ratios with the same
constant. Real measured hydrogen ratios also cancel the reduced mass exactly — the same μ factor
multiplies every level of one isotope — so an intra-hydrogen ratio is a clean test of the 1/n²
law alone. The H-versus-He⁺ ratio does **not** cancel μ, so its deviation from exactly 4 is where
the reduced-mass content lives. That is the two-directional structure the task asks for, and it
falls out of the physics rather than being imposed.

## 3. Benchmark specification (design only, not implemented)

Three benchmark families, in admission order.

### BM-1 — structural, constant-free. **Admissible in principle.**

- Observable: ratio of two hydrogen transition wavelengths.
- Prediction: exact rational from the 1/n² law — 1.35, 1.512, 5.4.
- Reference: NIST ASD vacuum wavelengths for the same two lines (`REFERENCE_UNPINNED`).
- Tolerance rationale: the prediction is exact, so tolerance derives **only** from the reference
  uncertainty. Pre-register as `k × u_combined` with k stated in advance.
- What it falsifies: the level law. Immune to the hardcoded constant and to reduced mass.

### BM-2 — reduced-mass contrast, two-directional. **The test the task asks for.**

- Observable: λ(H 4→2) / λ(He⁺ 4→2). Model predicts **exactly 4**.
- Reality departs from 4 by the ratio of reduced-mass factors, a small computable amount.
- **Pre-registered, two-directional, both fixed before execution:**
  - _raw Bohr_ is asserted to **FAIL** at tolerance `τ_raw`, chosen strictly smaller than the
    predicted reduced-mass departure;
  - _reduced-mass-corrected_ is asserted to **PASS** at a separate, explicitly different tolerance
    `τ_corrected`, derived from the reference uncertainty alone.
  - `τ_raw` and `τ_corrected` are recorded in the protocol before any run. A benchmark that only
    ever passes proves nothing.
- **Blocked today:** the model exposes no correction, so the corrected arm cannot be produced
  without a model change (§4).

### BM-3 — absolute energy or wavelength. **REJECT as a model benchmark.**

Admissible only if relabelled as a _constant-provenance check_ — "does the hardcoded `RYDBERG_EV`
match the cited CODATA source" — which is a useful repository hygiene test but must never be
reported as validating the Bohr model.

### Proposed fixture layout (specified, **not created** — nothing to pin)

```
docs/evidence/nist-hydrogen/
  NIST-ASD-H-I-lines-<retrievalDate>.<ext>          # raw response bytes, unmodified
  NIST-ASD-H-I-lines-<retrievalDate>.sha256
  NIST-CODATA-rydberg-<retrievalDate>.<ext>
  NIST-CODATA-rydberg-<retrievalDate>.sha256
  NIST-CODATA-mass-ratio-<retrievalDate>.<ext>
  NIST-CODATA-mass-ratio-<retrievalDate>.sha256
  hydrogen-line-reference-normalized.json
  hydrogen-benchmark-contract.md
```

`hydrogen-line-reference-normalized.json` records, per observation: `sourceArtifactId`,
`rawPayloadSha256`, `metadataSha256`, `sourceUri`, `exactQuery`, `retrievalTimestampUtc`,
`datasetName`, `datasetVersion`, `observableDefinition`, `transition` (n_upper, n_lower, Z),
`medium` (vacuum or air — **must be explicit**), `referenceValue`, `referenceUnit`,
`referenceUncertainty`, `uncertaintyType`, `licence`, `transformId`, `transformVersion`,
`replayInputPolicy: "pinned-files-only; no network refetch"`, `genesisCompatibilityStatus`,
`limitations`.

Per benchmark arm additionally: `modelId`, `modelVersion`, `correctionId`, `correctionVersion`,
`prediction`, `residual`, `toleranceId`, `tolerance`, `toleranceRationale`, `expectedOutcome`
(`PASS` or `FAIL`, pre-registered).

### Replay design

Reuse the existing machinery unchanged. Replay recomputes the model prediction and re-reads the
**pinned** reference bytes; it never refetches. Verdicts follow the existing contract:
`MATCH` when prediction, reference and residual all reproduce; `DRIFT` when any changes;
`BLOCKED` when an artifact hash mismatches or a required field is absent. Reference artifact
hashes enter the protocol fingerprint so that swapping a reference file is DRIFT, not a silent pass.

### Negative cases (specified, not implemented)

Each mutates the pinned fixture **in memory** only: tamper a raw payload byte → hash mismatch →
`BLOCKED`; change the reference value → `DRIFT`; change the unit (nm ↔ Å) → `DRIFT`; switch medium
vacuum ↔ air → `DRIFT`; change the transition (n=3→2 into 4→2) → `DRIFT`; bump `transformVersion`
→ `DRIFT`; bump `correctionVersion` → `DRIFT`; remove uncertainty or licence → `BLOCKED` /
`VERIFY_REQUIRED`; **and the discipline case — loosen `τ_raw` until the raw arm passes → the
protocol must be rejected as post-hoc, because the tolerance was pre-registered.**

## 4. The `expectedValues[]` question — two gaps, not one

The existing contract was inspected and **not changed**.

**Gap A — one reference per protocol.** `equal-within-tolerance` carries a single `expectedValue`
applied to every variant arm (`scientificExecutor.ts:68-76`). A per-arm reference table is not
expressible. Also FACT: `designScientificExperiment` requires unique sweep values
(`scientificPlanner.ts:41`) and at least one arm differing from the baseline
(`scientificPlanner.ts:80`), so a single-point comparison is not expressible either.

**Gap B — new, and the more restrictive one.** The metric must be a **literal output key**:
`run.result.outputs[design.primaryMetric]` (`scientificExecutor.ts:16`). A derived observable — a
ratio of two runs, or a transition wavelength from two levels — cannot be a metric at all. BM-1 and
BM-2 are both ratio-based, so **Gap B blocks them even if Gap A were closed.**

|                 | Gap A: per-arm reference                                                                                                                                                           | Gap B: derived metric                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact files     | `scientificDiscovery.ts` (`FalsificationCriterion`), `scientificExecutor.ts` (evaluator)                                                                                           | `scientificExecutor.ts` (`armEvidence`, series path at line 108), `scientificDiscovery.ts` (design type)                                                                                                           |
| Estimated lines | 20–40 (`ESTIMATE`)                                                                                                                                                                 | 40–80 (`ESTIMATE`)                                                                                                                                                                                                 |
| Migration risk  | **Low** — additive optional field; single-value path untouched                                                                                                                     | **Medium** — touches how every arm's value is extracted; affects all existing protocols                                                                                                                            |
| Test plan       | Existing single-value protocols byte-identical (same `evidencePackId`); new per-arm path passes and fails correctly; mismatched array length → `INCONCLUSIVE`, never a silent pass | Existing literal-key protocols unchanged; a derived metric produces the same value as computing it by hand; a malformed expression → `INCONCLUSIVE`; fingerprint must cover the derivation so changing it is DRIFT |

**Can one arm per observable avoid the change?** For Gap A, partly — one protocol per reference
point works, at the cost of N protocols and no cross-arm assessment, and it still collides with the
"at least one differing arm" rule. **For Gap B, no.** A ratio is not any single run's output. The
only alternatives are (a) implement a derived metric, or (b) add a transition-wavelength output to
`atom-bohr` — which needs a second quantum number and is a model change requiring its own
admission. Neither is in scope here.

## 5. Status summary

| Section                       | Status                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| Pinned reference artifacts    | **REFERENCE_UNPINNED** — egress denied, evidenced above             |
| Licensing                     | **VERIFY_REQUIRED** — NIST SRD terms not retrievable here           |
| Model predicts the observable | **FACT: partly** — energy yes, wavelength no                        |
| Absolute-energy benchmark     | **REJECT** — constant readback, `ionizationPhotonEV === RYDBERG_EV` |
| Structural ratio benchmark    | **Admissible in principle**, blocked by Gap B                       |
| Two-directional tolerance     | **Designed**, blocked by the absence of a correction path           |
| Protocol contract change      | **Specified, not implemented**                                      |

## 6. Recommendation

**BUILD LATER.**

The pair is still the best in the repository, but three things must be settled first, in this order:

1. **Do not build BM-3.** The absolute ionization comparison is a constant readback. If it is
   wanted, admit it only as a constant-provenance check, clearly labelled.
2. **Decide Gap B** — a derived-metric capability in the Scientific Core, or a
   transition-wavelength output on `atom-bohr`. Gap B is the real blocker; Gap A alone is not
   enough. `ESTIMATE`: 40–80 lines plus tests, medium risk, needs its own review.
3. **Pin the references where egress exists** (CI can reach the network). Until then every value
   stays `REFERENCE_UNPINNED` and no benchmark may report a scientific result.

Estimated effort once those are settled (`ESTIMATE`): 6–10 h for Gap A, 10–16 h for Gap B, 4–6 h to
pin and normalize the NIST artifacts, 4–6 h for the pre-registered two-directional protocol, 2–4 h
for Evidence and replay proof — **26–42 h total**, and none of it should start before decision 2.
