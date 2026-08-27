# Genesis — Atom-Bohr ↔ Real Observation Forensic Review

**Decision:** `BUILD LATER`  
**Status:** candidate for admission, not yet an implementation authorization.  
**Scope:** review of the existing model and official NIST sources; no Scientific Core change and no new Evidence/Replay system.

## Executive decision

The `atom-bohr` candidate is materially stronger than the USGS-to-pump-pipe proposal because the existing model produces energy-related outputs and the proposed external values can challenge those outputs. The direction is potentially falsifiable. It is not yet `BUILD NOW` because the exact benchmark fixture, reference semantics, uncertainty/tolerance policy and licensing/reuse terms have not been pinned into a committed admission artifact.

## Existing Genesis model

The existing experiment is `atom.bohr-consequence`, implemented in `packages/frontend/src/labs/experiments/atom-bohr-consequence.ts` and backed by `buildBohrModelGraph()` in `packages/frontend/src/core/modelGraph/bohrModelGraph`. It declares a simplified hydrogen-like model and explicitly states that it is exact only for one-electron systems such as H and He+.

The model exposes `energyLevelEV`, `orbitalRadiusPm` and `ionizationPhotonEV`. For hydrogen with atomic number 1 and principal quantum number 1, the existing regression test expects approximately 13.606 eV. These are model outputs, not injected observations.

| Review item | Status | Finding |
|---|---|---|
| Existing executable model | `EXISTS` | `atom-bohr` graph is present and tested |
| Predicted observable | `MODEL_AVAILABLE` | ionization energy is an output |
| Observation direction | `POTENTIALLY COMPATIBLE` | external reference can challenge output |
| Scientific scope | `PARTIAL` | simplified Bohr model; hydrogen-like domain only |
| Raw reference artifact | `VERIFY_REQUIRED` | must be pinned before benchmark admission |
| Reference license/terms | `VERIFY_REQUIRED` | NIST terms must be recorded for redistribution/use |
| Per-arm expected values | `PARTIAL` | current protocol has one expected value shape; multi-observable design needs review |
| Tolerance policy | `VERIFY_REQUIRED` | must be preregistered and bidirectional |
| Implementation | `NOT_STARTED` | intentionally not authorized in this review |

## Official reference evidence

NIST WebBook lists an evaluated hydrogen atomic ionization energy of **13.59844 eV** and identifies the source and evaluation metadata.[1] NIST’s Atomic Spectra Database is Standard Reference Database 78, version 5.12, with data content last updated November 2024; it provides critically evaluated wavelengths, energy levels and transition probabilities.[2] The NIST hydrogen strong-lines table provides hydrogen line wavelengths and distinguishes vacuum from air wavelength tables; the visible H-alpha entries are presented as air wavelengths, not automatically as vacuum values.[3]

This distinction is material. A benchmark must not use a value labelled “vacuum H-alpha” if the pinned source artifact actually provides an air wavelength, nor convert between air and vacuum without a declared transform, version and uncertainty policy.

## FACT / INFERENCE / VERIFY_REQUIRED

| Classification | Statement |
|---|---|
| `FACT` | The Genesis Bohr graph exposes ionization energy as an output. |
| `FACT` | NIST WebBook reports evaluated H atomic ionization energy of 13.59844 eV. |
| `FACT` | NIST ASD provides critically evaluated spectral data and has an identified database version. |
| `FACT` | NIST’s strong-lines table includes air-wavelength H I lines around 6562.7–6562.9 Å. |
| `INFERENCE` | Atom-Bohr is a better model–observation direction than USGS discharge → pump-pipe because the observable is produced by the model. |
| `INFERENCE` | A reduced-mass correction can improve the simple hydrogen result, but the correction must be explicitly specified and independently sourced. |
| `VERIFY_REQUIRED` | Exact H-alpha vacuum reference value and its uncertainty for the proposed benchmark. |
| `VERIFY_REQUIRED` | Redistribution/licensing terms for every pinned NIST artifact and any converted table. |
| `VERIFY_REQUIRED` | Whether the desired comparison is ionization threshold, spectral line, or both, and the exact physical definition of each. |
| `VERIFY_REQUIRED` | Scientific tolerance, including air/vacuum conversion and uncertainty propagation. |
| `VERIFY_REQUIRED` | Whether current Protocol/A-B can represent one independent expected value per arm without a Scientific Core change. |

## Why this is not BUILD NOW

The current evidence is sufficient to classify the direction as promising, but not sufficient to admit a public benchmark. The proposed values in the Claude report were marked `REFERENCE_UNPINNED` and were not downloaded as raw artifacts. The H-alpha source distinction between air and vacuum also prevents copying a number into a fixture without a controlled transform.

A benchmark must not set tolerance after inspecting the result. It must preregister the reference artifact, observable definition, transform and bidirectional acceptance rule. The raw Bohr result and any corrected result must remain separate runs or explicitly separate model variants so that the correction cannot be presented as if it were the original model.

## Minimal admission path

The next allowed step is research/specification only:

1. Pin one official ionization-energy artifact and, separately, one official spectral-line artifact.
2. Preserve exact raw bytes, metadata and SHA-256 values.
3. State whether the wavelength is air or vacuum and define any conversion transform.
4. Select one benchmark observable first; avoid forcing multiple expected values into one arm.
5. Define a preregistered bidirectional tolerance with uncertainty rationale.
6. Confirm whether an existing single-arm Protocol/A-B can express the comparison without modifying Scientific Core.
7. Add negative cases for reference payload, unit, air/vacuum mode, transform version and tolerance mutation.

Only after these gates pass may a minimal admission-gated benchmark be considered. No live instrument, Micro-Manager integration, USGS bridge or new solver is implied.

## Recommendation

**`BUILD LATER` — strongest candidate currently identified.** The candidate is scientifically directionally valid and worth admitting after pinned-reference verification. Do not implement `expectedValues[]` or alter Scientific Core yet. If the reference artifact or semantics cannot be pinned, downgrade to `VERIFY_REQUIRED` or `REJECT` rather than fabricating an Evidence result.

## References

[1] [NIST WebBook — Hydrogen, atomic](https://webbook.nist.gov/cgi/cbook.cgi?ID=C12385136&Mask=65) — evaluated ionization energy and source metadata.

[2] [NIST Atomic Spectra Database](https://www.nist.gov/pml/atomic-spectra-database) — SRD 78 version and data scope.

[3] [NIST Handbook of Basic Atomic Spectroscopic Data — Strong Lines of Hydrogen](https://physics.nist.gov/PhysRefData/Handbook/Tables/hydrogentable2.htm) — hydrogen line wavelength tables and air/vacuum distinction.
