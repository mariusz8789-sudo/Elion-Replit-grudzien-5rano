# Genesis — AME2020 Admission Review

**Candidate:** `nuclear-semf` → AME2020 `mass_1.mas20`  
**Status:** `BUILD LATER / ADMISSION REQUIRED`  
**No implementation:** no bridge, fixture, new solver or Evidence path has been added.

## 1. Source and retrieval evidence

The raw candidate was retrieved from the official Atomic Mass Data Center endpoint:

`https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt`

The official AMDC page identifies this as the AME2020 atomic-mass file and instructs users to cite the AME2020 publications rather than treating the electronic file as the publication itself [1]. The retrieved payload had:

| Property | Observed value |
|---|---|
| Retrieval context | Sandbox contract-only review, 2026-08-27 UTC |
| Bytes | `472648` |
| SHA-256 | `e8599c6d7f724fac91934e59f1b9de8fb8f63e820f4b39456b790665ed2a3307` |
| File header date | `3 Mar 2021 22:41` |
| Dataset | AME2020, `mass.mas20` |
| Raw format | Fixed-width ASCII |
| Official fields | mass excess, binding energy per nucleon, beta-decay energy, atomic mass and uncertainties |

The hash above is an observation from this retrieval, not yet a pinned Genesis fixture. No raw AME2020 bytes have been committed to the repository.

## 2. Existing Genesis contract

The backend registry defines `nuclear-semf` version `1.0.0` with inputs:

- `protonNumber` (`Z`), integer range 1–118;
- `neutronNumber` (`N`), integer range 0–180.

It declares these outputs:

- `bindingEnergy`, unit `MeV`;
- `bindingPerNucleon`, unit `MeV`;
- `massNumber`, dimensionless.

The model is the semi-empirical mass formula with volume, surface, Coulomb, asymmetry and pairing terms. Its declared validity is best for approximately `20 < A < 250`, and it explicitly omits shell effects. This is a **MODEL**, not a measured value.

The AME2020 file documents `BINDING ENERGY/A` and its uncertainty in `keV`. Therefore the first comparison should use `bindingPerNucleon` only, with an explicit `keV → MeV` transform, rather than silently deriving total binding energy or mixing fields.

## 3. Data semantics and honesty boundary

The raw header states that `#` marks an estimated (non-experimental) value and `*` marks a non-calculable quantity. An AME row with `#` must not be treated as an experimental observation. The official AMDC and Argonne pages instruct users to cite the original AME2020 papers rather than the electronic files, but they do not expose a clear, machine-readable licence or redistribution permission for the raw electronic file. That absence is not permission; the repository fixture gate therefore remains blocked until an approved terms decision is recorded. The normalized observation must carry:

- `measurementStatus: experimental | estimated | unavailable`;
- original marker;
- source row and fixed-width field definition;
- uncertainty, if numeric;
- unit and transform version;
- nuclide identity `(Z,N,A)`.

The first benchmark must either exclude estimated rows or report them in a separate, non-PASS category. It must not tune SEMF coefficients after viewing the residuals.

## 4. Candidate mapping

| Model quantity | AME2020 quantity | Mapping | Verdict |
|---|---|---|---|
| `bindingPerNucleon` (MeV) | `BINDING ENERGY/A` (keV) | divide by 1000; preserve uncertainty | Compatible after explicit transform |
| `bindingEnergy` (MeV) | not directly present as a single same-unit field | derive only with a documented `B/A × A` transform, or defer | Do not use in first slice |
| `massNumber` | `A` | direct identity from `Z + N` | Compatible, not a scientific comparison |
| SEMF shell omission | estimated/reference residual | interpret as model limitation, not source failure | Must be visible in result |

## 5. Required admission gates

| Gate | Requirement | Current status |
|---|---|---|
| Source | Official AMDC/IAEA endpoint and AME2020 publication citation | PASS for candidate |
| Raw fixture | Exact bytes committed in Git | NOT_READY |
| Hash | SHA-256 recorded and checked from bytes | VERIFIED for temporary retrieval; NOT_PINNED |
| Units | `keV → MeV` transform explicitly versioned | DESIGNED, not implemented |
| Observable | `bindingPerNucleon` selected unambiguously | READY FOR REVIEW |
| Uncertainty | Numeric uncertainty preserved and compared separately from model residual | DESIGNED |
| Estimated values | `#` rows excluded or separately labelled | DESIGNED |
| Licence/terms | Official pages provide citation guidance but no explicit redistribution licence/terms for the electronic raw file | VERIFY_REQUIRED / BLOCKED |
| No-network replay | Replay reads pinned bytes only | NOT_READY |
| Existing Fabric | Reuse existing run/Evidence/Replay | READY in principle |
| Scientific contract | preregistered nuclide set and tolerance policy | NOT_READY |

## 6. Proposed first benchmark, pending approval

A minimal first case should be a fixed, preregistered set of measured nuclides within the declared SEMF range. Fe-56 is useful as a visible shell-effect-sensitive case, but it must not be selected as proof that SEMF is accurate; the model itself states that shell effects are omitted. A small multi-nuclide set should include ordinary and shell-sensitive nuclei and should be chosen before comparison.

The comparison target should be `bindingPerNucleon`, not both total and per-nucleon binding in the first slice. The result should expose signed residual, absolute residual, source uncertainty, model-version, transform-version and estimated/experimental status. A discrepancy is a scientific result about model adequacy, not a failed observation source.

## 7. Required negative tests

Before BUILD NOW, the admission plan requires tests for changed raw bytes, changed SHA-256, changed `(Z,N,A)`, changed unit transform, changed transform version, missing uncertainty, estimated marker changed to experimental, duplicate nuclide rows, wrong field selection, no-network replay and model-version drift. No test should silently substitute another dataset.

## 8. Decision

`nuclear-semf → AME2020 = BUILD LATER / ADMISSION REQUIRED`

The candidate is substantially stronger than Kepler → JPL for the first bridge because it predicts the same nuclear quantity that the AME table explicitly reports. It remains `BUILD LATER / BLOCKED`: the raw bytes and SHA-256 are known from a contract-only retrieval, but durable fixture publication is not authorized while electronic-file licence/redistribution terms are unresolved. No value from the temporary retrieval is admitted into Genesis.

Atom-Bohr G3 stays `BLOCKED / REFERENCE_UNPINNED` and is not being reworked. USGS, GIS/live data, sensors, instruments, MQTT, OPC UA, new solvers, new domains and second Evidence/Replay systems remain out of scope.

## References

[1]: https://www-nds.iaea.org/amdc/ "Atomic Mass Data Center — AME2020 files and citation guidance"
[2]: https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt "AME2020 mass_1.mas20 raw ASCII file"

## Internal evidence

- [`packages/backend/src/compute/registry.mjs`](../packages/backend/src/compute/registry.mjs)
- [`packages/frontend/src/core/physics.ts`](../packages/frontend/src/core/physics.ts)
- [`docs/GENESIS_MODEL_OBSERVATION_CANDIDATE_REVIEW.md`](GENESIS_MODEL_OBSERVATION_CANDIDATE_REVIEW.md)
- [`docs/GENESIS_FULL_FORENSIC_CTO_AUDIT.md`](GENESIS_FULL_FORENSIC_CTO_AUDIT.md)

**Current status:** `candidate accepted for admission review; implementation not authorized.`
