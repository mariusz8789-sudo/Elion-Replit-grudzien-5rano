# Genesis — valid model ↔ real observation candidates

Read-only survey. No adapter, solver, domain, model or production file was created or changed.
Every number attributed to Genesis below was produced by executing the model in this repository
at LIVE HEAD `16de070`. Reference values are marked with their provenance status.

## The question

Which existing Genesis model can be the first to be honestly confronted with a real observation,
such that Genesis shows something more than parameterising the data?

**The discriminator is not units. It is direction.** A model that _takes_ the observed quantity as
an input cannot be falsified by it — that is parameterisation. A model must _predict_ the observed
quantity for the observation to be able to disagree.

## Answer

**No candidate qualifies for `BUILD NOW`, and all three top candidates fail for the same single
reason** — not the data, not the physics, but one property of the protocol machinery (§4).

The strongest scientific pair by a wide margin is **`atom-bohr` ↔ hydrogen spectral data**.
Recommendation: **BUILD LATER**, gated on one small, precisely specified change.

## Branch and base

| Item                    | Value                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| LIVE HEAD               | `16de070644fc4068051b288b9610fbbf103e5f46` — "docs: validate usgs observation contract", 2026-08-27 19:58:56 +0000 |
| Work branch             | `claude/model-observation-pairs`, created from `16de070`                                                           |
| Merged / pushed to LIVE | no                                                                                                                 |
| Production code changed | none — this report is the only file added                                                                          |

Note: the USGS fixture that was absent during the previous audit now exists on LIVE
(`docs/evidence/usgs/`, four files, plus `usgsObservationFixture.test.ts`). That blocker is
resolved. This survey does not revisit it.

## Reference-value provenance

Reference values below are **widely published constants and evaluated data recalled by the model
writing this report**. They are **not** pinned from a fetched artifact — no network request was
made. Every one is marked `REFERENCE_UNPINNED` and **must be pinned from its cited source before
any implementation**. They are used here to judge whether a pair is worth building, not to claim
a validated result.

## TOP 3 candidates

### 1. `atom-bohr` ↔ hydrogen spectral lines (NIST ASD) — **BUILD LATER**

| Field                 | Value                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing model        | `atom-bohr`, `packages/frontend/src/core/experimentFabric/executor.ts` case `atom-bohr`, graph in `buildBohrModelGraph()`                               |
| Capability            | `REAL_ENGINE`, executes in the generic Fabric executor                                                                                                  |
| Predicted observables | `energyLevelEV`, `ionizationPhotonEV`, `orbitalRadiusPm` — and, by difference of two levels, transition wavelengths                                     |
| Predicts or consumes? | **Predicts.** Inputs are `atomicNumber` and `principalN` — integers, not the measured quantity                                                          |
| Public source         | NIST Atomic Spectra Database; CODATA recommended values                                                                                                 |
| License               | `VERIFY_REQUIRED` — NIST SRD terms and citation requirements to be confirmed                                                                            |
| Units / semantics     | eV and nm; a stationary energy level and a transition wavelength, no timestamp semantics, no sampling ambiguity                                         |
| Boundary conditions   | Declared by the model itself: _"Ścisły dla atomów i jonów jednoelektronowych"_ — one-electron systems, infinite nuclear mass, no fine structure, no QED |
| Ground truth          | H I ionization energy 13.598434599702 eV; H-α vacuum wavelength 656.4696 nm (`REFERENCE_UNPINNED`)                                                      |
| Pinned replay         | Trivial — a handful of scalars in a JSON fixture, no payload size or refresh problem                                                                    |
| Category-error risk   | **Low**                                                                                                                                                 |
| Hours                 | 8–14 h after the §4 change                                                                                                                              |

**Executed result.** Genesis was run and the residuals computed in-process:

| Quantity            | Genesis          | Reference          | Relative deviation |
| ------------------- | ---------------- | ------------------ | ------------------ |
| H ionization energy | **13.605693 eV** | 13.598434599702 eV | **+5.338 × 10⁻⁴**  |
| H-α (n=3→2), vacuum | **656.1123 nm**  | 656.4696 nm        | **−5.443 × 10⁻⁴**  |

Then the _one correction the model explicitly declares it omits_ — finite nuclear mass, factor
μ/mₑ = 1/(1 + mₑ/m_p) — was applied:

| Quantity            | After reduced-mass correction | Residual vs reference |
| ------------------- | ----------------------------- | --------------------- |
| H ionization energy | 13.598287 eV                  | **−1.08 × 10⁻⁵**      |
| H-α                 | **656.4696123 nm**            | **+1.87 × 10⁻⁸**      |

This is why it is the best pair in the repository. The model makes a falsifiable prediction; the
measurement disagrees by a specific amount; that amount is **exactly** the omission the model
declares in its own honesty note; applying it reproduces the measured line to **eight significant
figures**. The remaining 10⁻⁵ on the ionization energy is itself physically meaningful — the scale
of relativistic and QED corrections. Genesis would be demonstrating a model's validity domain
quantitatively, which is a genuine scientific statement rather than a data fit.

### 2. `nuclear-semf` ↔ AME2020 binding energies — **BUILD LATER**

| Field                 | Value                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing model        | `nuclear-semf`, executor case `nuclear-semf`, graph `buildNuclearModelGraph()`                                                                                                                                                      |
| Predicted observable  | `bindingEnergy` (MeV), `bindingPerNucleon` (MeV/A)                                                                                                                                                                                  |
| Predicts or consumes? | **Predicts.** Inputs are `protonNumber`, `neutronNumber` — integers                                                                                                                                                                 |
| Public source         | Atomic Mass Evaluation (AME2020)                                                                                                                                                                                                    |
| License               | `VERIFY_REQUIRED` — AMDC distribution terms                                                                                                                                                                                         |
| Boundary conditions   | Declared: _"Model kroplowy; pomija efekty powłokowe"_ — liquid drop, no shell corrections                                                                                                                                           |
| Ground truth          | AME2020 B/A per nuclide (`REFERENCE_UNPINNED`)                                                                                                                                                                                      |
| Category-error risk   | **Low**, with one caveat: SEMF coefficients are themselves fitted to mass data, so a comparison against nuclides inside the fit set is partly circular. Mitigate by pre-registering nuclides and stating the coefficient provenance |
| Hours                 | 10–16 h after the §4 change                                                                                                                                                                                                         |

**Executed result:**

| Nuclide | Genesis B/A | AME2020 B/A | Relative     |
| ------- | ----------- | ----------- | ------------ |
| He-4    | 5.7603      | 7.073915    | **−18.57 %** |
| Fe-56   | 8.8961      | 8.790356    | +1.20 %      |
| Ni-62   | 8.9131      | 8.794553    | +1.35 %      |
| U-238   | 7.6749      | 7.570126    | +1.38 %      |

The He-4 failure is the point, not a flaw: the model states it omits shell effects, and light
doubly-magic nuclei are exactly where a liquid-drop model must fail. Genesis would show a model
succeeding inside its declared domain (~1.2–1.4 % systematic, mid to heavy) and failing honestly
outside it. The consistent positive bias across three well-separated mass numbers is itself a
reportable finding about the coefficient set.

### 3. `universe-kepler` ↔ planetary orbital periods (NASA/JPL) — **BUILD LATER**

| Field                 | Value                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing model        | `universe-kepler`, executor case `universe-kepler`, graph `buildOrbitalModelGraph()`                                                                                                               |
| Predicted observable  | `orbitalPeriodYears`, `orbitalSpeedAuPerYear`                                                                                                                                                      |
| Predicts or consumes? | **Predicts.** Inputs are `orbitalRadiusAu` and `centralMassSolar`                                                                                                                                  |
| Public source         | NASA planetary fact sheets / JPL ephemerides                                                                                                                                                       |
| License               | NASA works are generally public domain in the US — `VERIFY_REQUIRED` for the specific product                                                                                                      |
| Boundary conditions   | Declared: _"Zagadnienie dwóch ciał; orbita kołowa"_ — two-body, circular                                                                                                                           |
| Category-error risk   | **Medium** — semi-major axis and orbital period are not independent measurements in modern ephemerides; both come from the same orbit fit. A pre-registration must state which is treated as input |
| Hours                 | 8–12 h after the §4 change                                                                                                                                                                         |

**Executed result:** Jupiter at a = 5.2044 AU gives **11.872878 yr** against a reference sidereal
period of 11.862 yr, a deviation of **+9.17 × 10⁻⁴**. Applying the correction the model omits —
Kepler III uses the central mass only, while the exact form uses M + m — brings it to 11.867215 yr,
**+4.40 × 10⁻⁴**. Roughly half the discrepancy is explained by a single named omission; the
remainder is eccentricity and the distinction between orbital radius and semi-major axis. Good,
but less clean than the hydrogen case, where the declared omission explains essentially all of it.

## Comparison table

| #   | Model                            | Predicted observable              | Predicts?           | Reference source  | Deviation found                 | Explained by declared omission? | Category risk      | Status                        |
| --- | -------------------------------- | --------------------------------- | ------------------- | ----------------- | ------------------------------- | ------------------------------- | ------------------ | ----------------------------- |
| 1   | `atom-bohr`                      | H-α wavelength, ionization energy | **yes**             | NIST ASD / CODATA | −5.44 × 10⁻⁴                    | **yes, to 1.9 × 10⁻⁸**          | low                | **BUILD LATER**               |
| 2   | `nuclear-semf`                   | binding energy per nucleon        | **yes**             | AME2020           | +1.2 to +1.4 %, −18.6 % at He-4 | yes, qualitatively              | low                | BUILD LATER                   |
| 3   | `universe-kepler`                | orbital period                    | **yes**             | NASA / JPL        | +9.17 × 10⁻⁴                    | partly (halved)                 | medium             | BUILD LATER                   |
| 4   | `quantum-chemistry-pyscf-h2-rhf` | RHF total energy                  | yes                 | NIST CCCBDB       | not measured here               | n/a                             | **high**           | VERIFY_REQUIRED               |
| 5   | `electrodynamics-maxwell-fdtd`   | transmittance                     | yes                 | Fresnel analytic  | 6.87 × 10⁻⁴ (already in repo)   | n/a                             | medium             | VERIFY_REQUIRED               |
| 6   | `einstein-chirp-mass`            | chirp mass                        | yes                 | GWTC / GWOSC      | 28.096 M☉ vs 28.6 published     | n/a                             | **high, circular** | REJECT                        |
| 7   | `photon-energy`                  | photon energy                     | **no — conversion** | n/a               | n/a                             | n/a                             | **high**           | REJECT                        |
| 8   | `water-pump-pipe`                | none; Q is input                  | **no**              | USGS 00060        | n/a                             | n/a                             | **high**           | REJECT                        |
| 9   | `epidemic-city`                  | SEIRD counts                      | yes, but abstract   | none pinned       | n/a                             | n/a                             | high               | REJECT for now                |
| 10  | materials / FEA, CFD             | —                                 | —                   | —                 | —                               | —                               | —                  | REJECT — no such model exists |

## Why the others are rejected

**`water-pump-pipe` ↔ USGS 00060 — REJECT for validation.** Established in the previous audit and
unchanged: `volumetricFlow` is a design input with provenance `user-provided`; the model predicts
no discharge, so a discharge observation has nothing to falsify. The fixture on LIVE remains
valuable as a provenance and replay artifact; it is simply not a validation pair.

**`photon-energy` — REJECT.** `E = hc/λ` is a unit conversion. It cannot disagree with a
measurement, so it cannot be validated by one. Same category error as injecting Q into the pump
model.

**`einstein-chirp-mass` ↔ GWTC — REJECT as currently framed.** Executed: component masses 36 and
29 M☉ give a chirp mass of **28.0956 M☉**, close to the published GW150914 source-frame value of
28.6 (+1.6/−1.5) M☉. But GWTC's component masses are _derived from_ the measured chirp mass, which
is the best-constrained parameter in the waveform fit. Feeding them back and recovering it tests
the algebra of the chirp-mass definition, not agreement with nature. The model's own validity note
already says it _"nie jest dopasowaniem danych LIGO"_. A non-circular test would need strain data
and a waveform fit — a new capability, out of scope.

**`quantum-chemistry-pyscf-h2-rhf` ↔ NIST CCCBDB — VERIFY_REQUIRED.** This has the best
infrastructure of any candidate: a real external solver already pinned at `pyscf==2.14.0` and
already exercised by a dedicated CI job. But an RHF/STO-3G total energy is **not an experimental
observable**. It can only be compared to another calculation, which validates the implementation,
not the physics. To reach a real observation it would need an experimentally comparable quantity
(dissociation energy, equilibrium bond length) and a basis-set and correlation treatment adequate
for it — a scope decision, not a wiring job.

**`electrodynamics-maxwell-fdtd` — VERIFY_REQUIRED, and worth a second look.** Real PyMeep FDTD
(`pymeep-fdtd@1.34.0`). It already reports `computedTransmittance` against `analyticTransmittance`
with `transmittanceAbsoluteError` ≈ 6.87 × 10⁻⁴ — Genesis is _already_ doing a numeric-versus-
reference comparison here. That is verification against a closed form, not validation against a
measurement, but normal-incidence reflectance at a dielectric interface is a measurable, tabulated
quantity. This is the best fallback if the hydrogen route is not taken.

**`epidemic-city` — REJECT for now.** The model is declared educational and abstract
(_"abstrakcyjny Pathogen X … edukacyjny, nie prognostyczny"_). No real, legally pinned
epidemiological dataset is present, and matching an abstract SEIRD run to a real outbreak would be
curve-fitting, not validation.

**materials / FEA and CFD — REJECT.** Verified: there is no FEA and no CFD model in the router.
Seventeen domains exist; none is materials or FEA. The only textual match for "CFD" in the router
is a disclaimer that the pump-pipe model _is not_ CFD. Building one would create a new domain,
which this task forbids.

## The one thing blocking `BUILD NOW` — a verified property of the protocol machinery

The comparison mechanism Genesis needs **already exists**:
`FalsificationCriterion` supports `relation: 'equal-within-tolerance'` with pre-registered
`expectedValue` and `tolerance` (`scientificDiscovery.ts:8-14`, evaluated in
`scientificExecutor.ts:68-76`). No second Evidence system, Replay system or comparison engine is
required. That is a genuinely good starting position.

Two constraints, both **confirmed by execution**, stop it short of a point-versus-reference test:

1. `designScientificExperiment` rejects a design whose sweep does not change anything:
   `Error: At least one sweep value must differ from the baseline parameter.`
   (`scientificPlanner.ts:80`). A protocol is structurally _comparative_ — baseline versus a
   changed parameter — so "run this one configuration and compare it to one measured value" is not
   expressible.
2. Sweep values must be unique (`scientificPlanner.ts:41`), and the evaluator applies **one**
   `expectedValue` to **every** variant arm. A series with a different reference per arm — a
   spectral series, a nuclide table, a planet table — cannot be expressed either.

So every top candidate fails the `BUILD NOW` criterion _"nie trzeba zmieniać Scientific Core"_, for
this one reason and no other. The data is fine, the physics is fine, the Evidence and Replay layers
are fine.

**Smallest change that unblocks all three** (specified, deliberately **not** implemented):
allow `FalsificationCriterion` to carry a per-arm reference — an optional
`expectedValues: readonly number[]` aligned to the sweep arms, or an optional
`referenceByArmId: Record<string, number>` — and have `equal-within-tolerance` prefer it when
present. Roughly 20–40 lines in `scientificDiscovery.ts` and `scientificExecutor.ts` plus tests,
with the single-value path untouched for backward compatibility. Estimated **6–10 h**. This is a
CTO decision about the Scientific Core, not something to slip in during a survey.

## What is missing before implementation

1. The core change above, or an explicit decision to accept one design per reference point.
2. Pinned reference artifacts with real SHA-256 of the source bytes, the same contract the USGS
   fixture already follows — currently every reference value here is `REFERENCE_UNPINNED`.
3. Confirmed licence and citation terms for NIST ASD, AME2020 and the NASA product.
4. A pre-registered tolerance with a stated physical justification. For hydrogen the honest
   framing is two criteria: the raw Bohr prediction should **fail** at 10⁻⁵ tolerance, and the
   reduced-mass-corrected prediction should **pass** at 10⁻⁶. A test that only ever passes proves
   nothing.
5. A stated position on circularity for candidates 2 and 3.

## Effort estimate

`ESTIMATE`, not a commitment.

| Step                                                                                      | Hours       |
| ----------------------------------------------------------------------------------------- | ----------- |
| Per-arm reference criterion in Scientific Core + tests                                    | 6–10 h      |
| Pin NIST hydrogen reference fixture (payload + SHA-256 + provenance, USGS contract shape) | 4–6 h       |
| Pre-registered protocol, tolerance justification, both directions                         | 4–6 h       |
| Evidence Pack + explicit replay proof, no network refetch                                 | 2–4 h       |
| **Total for candidate 1**                                                                 | **16–26 h** |

Candidates 2 and 3 reuse the core change and cost roughly 10–16 h each afterwards.

## Risks

| Risk                                                           | Type       | Note                                                                                                             |
| -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Circularity — reference derived from the same fit as the input | Scientific | High for chirp mass, medium for Kepler, low for hydrogen                                                         |
| Tolerance chosen after seeing the result                       | Scientific | Pre-register both a passing and a failing threshold                                                              |
| Verification mistaken for validation                           | Scientific | PySCF and Meep compare against calculations, not measurements; label them accordingly                            |
| SEMF coefficients fitted to the same mass data                 | Scientific | Pre-register nuclides and record coefficient provenance                                                          |
| Reference values currently unpinned                            | Technical  | Every value in this report is `REFERENCE_UNPINNED`                                                               |
| Core change touching the falsification evaluator               | Technical  | Small but central; the single-value path must stay behaviourally identical                                       |
| NIST / AME licence and citation terms                          | Licensing  | `VERIFY_REQUIRED` before distribution                                                                            |
| A passing comparison read as "Genesis validated physics"       | Product    | It validates a bounded model inside a declared domain; the honest headline is the _residual_ and its explanation |

## Recommendation

**BUILD LATER — candidate 1, `atom-bohr` ↔ hydrogen spectral lines.**

It is the only pair where the model predicts the observable, the measurement can disagree, the
disagreement is real (5.4 × 10⁻⁴), and that disagreement is **fully explained by an omission the
model already declares** — reproducing the measured line to 1.9 × 10⁻⁸ once corrected. That is a
demonstration of scientific honesty rather than a data fit, which is precisely what Genesis needs
to show first.

It is `BUILD LATER` and not `BUILD NOW` for exactly one reason: the falsification criterion cannot
yet carry a per-arm reference value. Decide that ~6–10 h core change first. If the answer is no,
the honest fallback is `electrodynamics-maxwell-fdtd`, which already performs a numeric-versus-
reference comparison inside Genesis today — but label it verification, not validation.

Do not build a bridge for any of the rejected pairs.
