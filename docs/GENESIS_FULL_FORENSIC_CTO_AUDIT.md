# GENESIS — Full Forensic CTO Audit

**Audit target:** `manus/high-fidelity-epidemic-digital-twin`  
**LIVE HEAD:** `719f2a8`  
**Audit mode:** read-only forensic review with targeted execution proofs  
**Decision rule:** reality over appearance; code, registry, route, documentation and green tests are not treated as proof by themselves.

## A. Executive Summary

Genesis is a credible **scientific-computation demonstrator** with a real canonical Experiment Fabric, real PySCF execution in CI, Evidence Pack creation, provenance, deterministic fingerprinting, persisted local memory and explicit replay verdicts. It is not yet a real-world observation validation platform. The central missing link is still `MODEL OUTPUT → PINNED OBSERVATION → COMPARISON`; the current G3 Atom-Bohr reference attempt is blocked by a security finding and incomplete durable fixture storage.

The most important positive finding is that the computational spine is real and bounded. The dedicated PySCF job installs Python 3.12.3 and PySCF 2.14.0, executes H₂ RHF/STO-3G and RHF/6-31G, and passes the backend Fabric contract tests. The targeted local tests also executed real PySCF runs and passed 36/36 selected backend and Fabric tests. The Chromium desktop and mobile smoke suites exercised 27 routes and 242 interactions with zero runtime errors.

The most important negative finding is that **Replay is not a general independent re-execution service**. The persisted Scientific Memory view discloses a snapshot verdict; a fresh rerun remains an explicit Pilot action. `compareScientificEvidencePacks()` compares protocol fingerprints and recorded run fingerprints. This is honest and useful, but it must not be marketed as proof that the stored pack was independently regenerated unless a new execution has actually occurred.

| Dimension | Verdict |
|---|---|
| Genesis health | **YELLOW** |
| Computational proof | **CONFIRMED, bounded** |
| Scientific credibility | **MEDIUM** |
| Product readiness | **MEDIUM for technical demo; LOW for production validation** |
| Investor readiness | **MEDIUM-LOW** |
| Commercial readiness | **LOW-MEDIUM** |
| Real-world observation bridge | **NOT READY** |
| Next best action | **Do not add domains. Secure a safe A4 path or formally defer Atom-Bohr and define one observation contract.** |

## B. Current LIVE Status

The working tree is clean and the branch is synchronized with GitHub at `719f2a8`. The latest CI run for the readiness documentation commit had green `verify` and real PySCF jobs. The dedicated G3 job correctly fails when the A4 payload contains a token-bearing HTML response; this is a deliberate safety failure, not a product regression.

The repository contains documentation for the Atom-Bohr blocker, final report and readiness state, but it does not contain raw A1–A4 fixtures. The previously created token-bearing CI artifacts were deleted. Current tracked G3 paths contain no raw A4 and no exposed token.

## C. Architecture Map

The actual architecture is best represented as:

```text
Science Chat
  → deterministic structured request / explicit route intent
  → Scientific Planner and Protocol/A-B designer
  → capability/admission and model selection
  → Fabric executor or explicit seam/rejection
  → local ModelGraph/function OR backend real engine
  → ExperimentResult + provenance
  → Evidence Chain / Evidence Pack
  → local Scientific Memory persistence
  → persisted snapshot verdict OR explicit Pilot rerun
  → MATCH / DRIFT / BLOCKED
  → WHY / bounded Next Experiment proposal
```

The architecture is **single Fabric / single Evidence Pack / single Replay vocabulary** for the canonical computational path. Separate legacy or specialized paths still exist: discovery evidence/replay, campaign workflows, hazard evidence/replay and the local Fabric path. They are not all losslessly interoperable. Campaign-to-Fabric Evidence Pack/RO-Crate remains correctly marked blocked/parked.

| Step | Actual implementation | Status | Boundary |
|---|---|---|---|
| Science Chat | `components/ScienceChat.tsx` | CONNECTED | Deterministic interpretation and route intents; not an autonomous scientific reasoner. |
| Scientific Memory | `core/scienceMemory.ts`, `ScientificMemoryScreen.tsx` | CONNECTED with local boundary | Browser-local persistence; not cloud, shared or cryptographic storage. |
| Hypothesis | Fabric planner/protocol contracts | PARTIAL | Explicit hypothesis is required in protocol design; chat does not prove scientific adequacy. |
| Protocol/A-B | Experiment Pilot and Fabric design | CONNECTED | Supports compatible arms; Atom-Bohr per-arm reference contract is not yet admitted. |
| Capability registry | frontend knowledge registry + backend compute registry | CONNECTED for routing metadata | Registry declaration is not proof of scientific validation. |
| Execution | Fabric executor, backend compute registry, PySCF adapter | CONNECTED for admitted paths | Many models are analytic/local; only some are backend real engines. |
| Observation | `analyseExperimentSeries` and recorded outputs | PARTIAL | No general raw instrument/dataset observation contract is admitted. |
| Evidence | `evidencePack.ts` | CONNECTED for completed real runs | Requires `createdFromRealRunsOnly`; does not create external ground truth. |
| Provenance | `provenance.ts`, backend provenance | CONNECTED | Strong run fingerprints; external reference provenance remains incomplete for G3. |
| Replay | `evidencePackStore.ts` plus explicit Pilot rerun | PARTIAL but honest | Stored verdict is snapshot disclosure; fresh rerun requires explicit execution. |
| WHY / Next Experiment | `whyNextExperiment.ts` | CONNECTED with limits | Uses recorded data and keeps `AUTO-RUN: DISABLED`; no causal discovery. |

## D. Capability Matrix

The backend registry contains 25 declared model entries. Declaration means the model has metadata and an execution path in the registry; it does not automatically mean external validation, high-fidelity physics or browser proof.

| Domain | Real/declared models | Forensic status |
|---|---|---|
| Atom | `atom-bohr`, `atom-hydrogen-orbital` | MODEL_AVAILABLE; Atom-Bohr external reference admission BLOCKED. |
| Chemistry | Arrhenius, molecular weight, RDKit descriptors, VSEPR, titration, PySCF H₂ | MIXED: analytic models and real PySCF backend; no general chemistry validation. |
| Quantum chemistry | `quantum-chemistry-pyscf-h2-rhf` | FULLY_CONNECTED for bounded H₂ RHF basis comparison in CI; not experimental chemistry. |
| Quantum | Bloch, teleportation, CHSH, Kitaev bulk, 1D tunneling | MODEL_AVAILABLE / PARTIAL; bounded analytic or numerical models, not hardware or general quantum solvers. |
| Spacetime/relativity | Lorentz, Minkowski, c-Slider, Schwarzschild, Kerr-equatorial, geodesics, lens, chirp | MODEL_AVAILABLE / bounded lab flows; no observational inference. |
| Classical mechanics | Kepler, three-body, double pendulum, Lorenz | MODEL_AVAILABLE; deterministic educational/numerical models, no external observation bridge. |
| Universe/astrophysics | solar system, atmospheric escape, Hubble tension, planet stability, stellar scaling, galaxy collision, rotation curve | MODEL_AVAILABLE / SIMULATED; no JPL/galaxy dataset validation in current Fabric proof. |
| Nuclear | SEMF, nuclide chart, Lawson 0D | MODEL_AVAILABLE; limited formulas and catalog data, not reactor or nuclear prediction. |
| Particle | relativistic energy | MODEL_AVAILABLE; not collider/detector/QCD. |
| Biology | logistic, DNA helix, HP folding, epidemic city | SIMULATED / MODEL_AVAILABLE; no clinical or real epidemiological forecast claim. |
| Aging/oncology | DepMap panel | BACKEND_REAL_ENGINE candidate with checksum/licensing boundaries; not clinical evidence. |
| Water/engineering | Darcy–Weisbach/Swamee–Jain water-pump-pipe | MODEL_AVAILABLE; input flow is supplied, so it does not predict observed river flow. |
| Knowledge-only | timeline, multiverse, quantum decision, scientists, scale | KNOWLEDGE_ONLY; not solvers. |
| Hypothetical | historical legends / Philadelphia Experiment | HYPOTHETICAL_VISUALIZATION; explicitly not physical evidence. |

## E. Computational E2E Proof

The strongest confirmed proof is the PySCF H₂ benchmark. The backend tests show a real PySCF runtime, real RHF single-point execution for both `sto-3g` and `6-31g`, rejection of unsupported basis variants, and dynamic backend provenance. The frontend Fabric tests verify protocol, provenance, fingerprint, persistence and comparison contracts. The CI job independently installs the pinned runtime instead of relying on the sandbox having PySCF preinstalled.

| Proof component | Result |
|---|---|
| Real Python/PySCF runtime | CONFIRMED in dedicated CI job |
| H₂ RHF/STO-3G | CONFIRMED |
| H₂ RHF/6-31G | CONFIRMED |
| Two compatible arms | CONFIRMED in Fabric tests and prior Chromium proof |
| Evidence Pack | CONFIRMED for completed real runs |
| Stable scientific fingerprint | CONFIRMED by targeted tests |
| Backend run ID transparency | CONFIRMED; IDs are provenance, not scientific identity |
| Unsupported basis behavior | REJECTED, not silently passed |
| Replay MATCH | CONFIRMED for explicit fresh rerun in the bounded local/CI proof; persisted Memory verdict is snapshot-only |
| DRIFT/BLOCKED cases | CONFIRMED in comparison and rejection tests |
| CI-hosted browser-to-backend path | NOT FULLY PROVEN; remaining boundary is browser against CI-hosted backend |

The benchmark proves **reproducible computation**, not model agreement with nature. It is not a molecular dynamics, geometry optimization, materials, docking, ADMET or therapeutic benchmark.

## F. Evidence and Replay Forensics

`ScientificEvidencePack` is a faithful projection of completed Fabric runs and refuses to create a pack unless the chain was created from real runs only. The pack carries protocol, assessment, run IDs, model versions, engines, parameters, results and provenance. The run fingerprint includes request, plan, status, outputs, units, warnings and backend provenance.

The persisted store is intentionally local. `isPack()` validates only a minimal structural subset: contract version, pack IDs, run count, runs array, reproducibility object and disclaimer. It does not fully validate every nested protocol, provenance, output, reference or hash field. This is a **P1 hidden robustness gap** for untrusted or corrupted local storage, although current UI correctly labels the local boundary.

`compareScientificEvidencePacks()` compares protocol fingerprints, run counts and ordered run fingerprints. It does not itself execute a solver. Therefore:

> A persisted `MATCH` is a snapshot disclosure. A fresh `MATCH` requires an explicit rerun that produces a new pack for comparison.

The current design correctly avoids pretending that local JSON storage is cryptographic tamper proof. The remaining improvement for a future approved milestone is a stricter nested schema/integrity contract, not a second replay system.

## G. Scientific Honesty Findings

The codebase is unusually explicit about limitations. The knowledge registry marks knowledge-only, seam, hypothetical, engine-unavailable and real-engine capabilities. Model metadata includes assumptions, validity and provenance. The Earthquake path labels structural damage as `NOT_MODELED`; the water model says it is not CFD; quantum labs state their dimensional and hardware boundaries; biology states educational/non-clinical limits; the Philadelphia path is hypothetical.

The main honesty risks are not false equations but **surface-area inflation**: many labs, routes and registry entries make Genesis appear broader than the number of independently proven, externally validated capabilities. A route or registry entry is not a benchmark. This audit classifies many entries as `MODEL_AVAILABLE`, `SIMULATED`, `KNOWLEDGE_ONLY` or `PARTIAL`, not `FULLY_CONNECTED`.

| Finding | Severity | Status |
|---|---|---|
| UI/catalog breadth exceeds validated real-world breadth | P1 | Documented; guard with capability matrix and proof boundaries. |
| Local snapshot verdict can be misunderstood as fresh replay | P1 | Current UI discloses the distinction; product copy must preserve it. |
| External reference/licence uncertainty for Atom-Bohr | P1 | G3 blocked; no values admitted. |
| Water model input/output semantic mismatch for USGS validation | P1 | Correctly blocked; do not adapt by force. |
| Hypothetical visualizations can be mistaken for science by first-time users | P2 | Labels exist; investor demo must show status boundaries. |

## H. Model Audit

The principal model families have equations and assumptions in `packages/backend/src/compute/registry.mjs` and the Knowledge registry. The analytic models are deterministic and executable, but most have no external reference data, uncertainty model or observational ground truth. This is acceptable for a bounded education/computation platform and insufficient for claims of model validation.

The correct model classification is:

| Classification | Meaning in Genesis |
|---|---|
| FACT | Source-backed statement or recorded execution fact. |
| MODEL | Equation/algorithm executed within declared assumptions. |
| PREDICTION | Model output intended to be compared to an observable; requires a compatible reference. |
| SIMULATED | Generated state or visualization without real-world measurement claim. |
| NOT_MODELED | Explicit missing phenomenon, such as structural earthquake damage. |
| VERIFY_REQUIRED | A source, runtime, licence, uncertainty or external reference is incomplete. |
| PARKED/BLOCKED | Deliberately not admitted or currently impossible to validate. |

A recurring anti-pattern is `INPUT = OBSERVATION`. The water-pump-pipe model accepts flow as an input and calculates engineering quantities; it does not predict river flow. Such a run cannot validate the model against USGS streamflow merely because both contain a flow number.

## I. Knowledge Layer Audit

The Knowledge registry contains 20-plus corpus files and machine-readable domains with concepts, parameters, units, assumptions, possible experiments, required solvers and visualizations. This is useful governance metadata, not automatically verified scientific knowledge. It correctly labels numerous gaps, including external-data dependence, unavailable docking/dynamics, incomplete Maxwell/QCD/MHD capability and non-clinical biology boundaries.

The newly delivered Scientific Knowledge Pack and CTO checklist remain reference-only. They have not been mass-imported into runtime. This is correct. The next knowledge admission must carry source, version, units, validity, uncertainty, licence, transform and provenance, and must pass the same admission matrix.

Hidden knowledge-layer risk: the registry can say `REAL_ENGINE` for an analytic or catalog-backed model without proving external validation. Admission status must remain derived from execution and evidence proof, not from registry category alone.

## J. Domain Audit

| Domain | Current reality | Status |
|---|---|---|
| Physics/relativity | Bounded analytic and numerical models with explicit assumptions | MODEL_AVAILABLE / many connected lab routes |
| Quantum | Several bounded local models; no general Schrödinger, hardware or detector path | PARTIAL |
| Atom/chemistry | Bohr/local chemistry plus real PySCF H₂ backend | PySCF FULLY_CONNECTED bounded; Atom-Bohr observation bridge BLOCKED |
| Astronomy/cosmology | Analytic scaling, restricted dynamics and fixed references | SIMULATED / MODEL_AVAILABLE |
| Fluids/water | Engineering graph, not CFD and not river predictor | PARTIAL; USGS BUILD LATER |
| Earthquake | Scenario → ImpactResult → DamageAssessment → City3D mapping/evidence boundary | DONE reference slice; structural damage NOT_MODELED |
| Epidemic | Deterministic synthetic city and same-world City3D handoff | CONNECTED demo; not a real forecast |
| Materials/FEA | Registry/research candidates and backend structural seams | VERIFY_REQUIRED / PARKED |
| Biology | Educational models and bounded DepMap backend path | PARTIAL; no clinical claim |
| Climate/live data | No admitted live GIS or external data path | PARKED |

## K. Real-World Readiness

The platform has partial ingredients: typed parameters, provenance, Evidence Pack projection, local persistence and comparison semantics. It lacks a generally admitted observation contract that captures raw data, metadata, quality flags, source version, licence, uncertainty, transform lineage and no-network replay for an external observation.

| Target | Status | Reason |
|---|---|---|
| Public dataset | PARTIAL | Fixture pattern exists, but no universal observation contract/admission. |
| Live API | NOT READY | Live fetching would undermine deterministic replay without a pinned capture policy. |
| Sensor | NOT READY | No approved instrument-agnostic raw observation/chain-of-custody contract. |
| Microscope/spectrometer/camera | NOT READY | No validated adapter or measurement schema. |
| Laboratory instrument | NOT READY | No execution safety, QC, authorization or chain-of-custody layer. |
| USGS streamflow | BUILD LATER / BLOCKED for current water model | Current model does not predict the observed quantity. |
| NIST Atom-Bohr references | BLOCKED | A4 security and durable A1–A3 fixture blockers. |

## L. Security Audit

The most significant security event was the NIST A4 retrieval. An official NIST HTML response contained an embedded Mapbox access token. GitHub Push Protection rejected the attempted commit. All known G3 CI artifacts containing the payload were subsequently deleted, including the surviving older artifacts discovered by forensic review. The guard now detects the token pattern before disk write/upload. No token-bearing raw A4 is present in the current Git tree.

The repository secret-scanning API returned `403 Resource not accessible by integration`, so absence of additional GitHub secret alerts cannot be claimed. If the Mapbox token belongs to an organization-controlled credential rather than a public NIST site token, the owner should rotate it independently; deletion of artifacts is not credential rotation.

Current security verdict: **contained in known repository/Actions artifacts, but external credential exposure status remains VERIFY_REQUIRED**.

## M. CI and Test Audit

The repository has 140 frontend test files and 45 backend test files according to the current tree. The local full gate passed frontend/backend tests, lint, typecheck, build and diff check. Targeted computational tests passed 36/36. The browser smoke suite passed desktop and mobile with 27 routes and 242 interactions.

CI includes separate `verify`, `G3 pinned NIST/CODATA artifacts` and `Real PySCF benchmark` jobs. The PySCF and verify jobs are green. The G3 job intentionally fails when A4 is unsafe. This is not a false-green condition, but it means the aggregate workflow is red while the product regression surface is green. The workflow status must be communicated as **product regression green / G3 gate blocked**, not simply “CI green.”

Potential test-quality risk: large test volume can still leave contract gaps. The most important current weak-confidence area is nested Evidence Pack validation and no-network replay semantics for persisted records. Existing tests cover the bounded contracts but do not turn every local JSON mutation into a cryptographic guarantee.

## N. Browser Audit

The existing smoke suite exercised 27 routes and 242 interactions on both desktop and mobile, with zero runtime errors. This proves route/runtime stability, not that every route contains a real scientific engine.

The strongest browser-proven product paths are:

| Path | Browser conclusion |
|---|---|
| Science Chat → Protocol/A-B | Route and structured designer are reachable; explicit confirmation remains required. |
| Epidemic → City3D | Same simulation instance handoff is proven; synthetic city boundary remains. |
| Earthquake | Existing scenario/City3D/evidence boundary is demonstrable; structural damage is NOT_MODELED. |
| Scientific Memory | Saved records and snapshot verdict disclosure are visible; local-only. |
| Labs | Many routes open and render; route availability does not prove external validation. |
| PySCF | Real backend is proven in CI and targeted tests; browser-to-CI backend is the remaining proof boundary. |
| Atom-Bohr external reference | Not demonstrable as a model-vs-NIST benchmark; G3 is blocked. |

## O. Product Audit

Genesis currently presents best as a **Scientific Discovery OS prototype for auditable computational experiments**, not as an autonomous laboratory or digital twin with live real-world truth.

| Audience | What they can genuinely see | What they must not infer |
|---|---|---|
| Investor | Coherent chat-to-experiment-to-evidence workflow, real PySCF backend, replay vocabulary, strong visual labs | That Genesis already validates models against sensors or predicts cities/medicine. |
| Scientist | Explicit assumptions, bounded models, provenance and honest failure states | That all catalog models have literature-grade validation or uncertainties. |
| Engineer | Modular registry, one Fabric path, backend adapters and tests | That all adapters are production-grade or interchangeable. |
| Customer | Reproducible scenario analysis and auditable computation | That external data ingestion, forecasts or instrument control are already available. |

**WOW:** breadth of visual scientific environments and the real computational spine.  
**REAL VALUE:** reproducible, bounded, explainable experiment execution with provenance.  
**DEMO ONLY:** most 3D/lab visuals, hypothetical scenarios, educational models and any claim not backed by external reference admission.

## P. Investor and Commercial Readiness

| Dimension | Score | Honest reason | What adds +1 |
|---|---:|---|---|
| Technical demo | 8/10 | Many routes, coherent Fabric, real PySCF and stable smoke proof | Browser proof of the complete backend path plus one polished partner runbook. |
| Science credibility | 6/10 | Strong boundaries and provenance; limited external observations | One valid model→observation benchmark with pinned raw data and uncertainty. |
| Reproducibility | 6/10 | Deterministic fingerprints and rerun path; local storage boundary | Independent no-network replay fixture with strict nested integrity. |
| Real data | 1/10 | G3 blocked and USGS incompatible with current model | One compatible, pinned public observation benchmark. |
| Commercial use case | 4/10 | Auditable scenario computation is present | A bounded paid pilot with customer-owned data and acceptance criteria. |
| Customer value | 4/10 | Strong for explanation/provenance demos | Demonstrate one decision workflow that changes a customer action. |
| Moat | 5/10 | Trust-density/provenance architecture is promising | Repeated validated observation loops and domain-specific evidence history. |
| Security | 5/10 | Push protection and guard contained known artifact leak | Credential owner confirmation/rotation and secret-scanning review. |
| Deployment | 5/10 | CI/build/smoke are healthy | Production secrets, persistent storage and operational observability. |

The first realistic paid pilot is not “autonomous discovery” or “city prediction.” It is a **bounded, auditable computational experiment service** where a customer supplies a fixed scenario or dataset and receives reproducible runs, assumptions, evidence and replay status. Genesis cannot yet sell live instrument control, real-world hazard prediction, clinical discovery, GIS digital twins or validated model-to-measurement claims.

## Q. Hidden Blockers and Findings by Severity

| ID | Severity | Finding | Decision |
|---|---|---|---|
| F-001 | P0 | A4 terms response contains a secret-like Mapbox token and cannot be pinned safely. | BLOCK; rotate if owner-controlled. |
| F-002 | P1 | A1–A3 hashes existed in CI but raw bytes were not durable in Git. | Do not call pinned; require all raw files before G3 PASS. |
| F-003 | P1 | Persisted pack structural validation is shallow. | Future integrity hardening; do not create a second Evidence system. |
| F-004 | P1 | Snapshot verdict can be confused with fresh replay. | Keep current disclosure and require explicit rerun language. |
| F-005 | P1 | Registry/lab breadth can inflate perceived validated capability. | Keep status matrix and proof boundaries visible. |
| F-006 | P1 | Current water model does not predict USGS flow. | Reject direct validation; no adapter workaround. |
| F-007 | P2 | Aggregate CI is red because G3 correctly fails while product jobs pass. | Report split status explicitly. |
| F-008 | P2 | Secret-scanning API access is unavailable. | Owner must independently verify alerts/rotation. |
| F-009 | P2 | External uncertainty/licence fields are incomplete for most analytic models. | Do not call them observation-validated. |
| F-010 | P3 | Some fallback paths improve runtime resilience but may hide capability seams. | Preserve explicit labels; audit only when modifying affected paths. |

## R. Roadmap Consistency

The documented roadmap and LIVE code are broadly consistent on the critical points: Earthquake is a bounded reference slice; PySCF is the strongest confirmed backend benchmark; Campaign interoperability is blocked; USGS water validation is not valid for the current model; instrument control, GIS/live data, new hazards, Matrix, Collider, second renderer and new Evidence systems are parked.

The main roadmap correction is to avoid percentage-complete language. Genesis is not “almost a laboratory platform.” It is a **well-developed computational orchestration prototype with one strong real backend proof and no admitted external observation loop**.

### TOP 5 strengths

1. A single canonical computational spine exists and is exercised by real tests.
2. PySCF H₂ RHF is a genuine bounded backend benchmark, not a fabricated output.
3. Provenance and result-origin honesty are stronger than typical demo applications.
4. Evidence/Replay states explicitly distinguish MATCH, DRIFT and BLOCKED, including local snapshot boundaries.
5. The product has high visual demonstrability without claiming that visuals are measurements.

### TOP 5 risks

1. External references and licences can become unsafe or unstable during ingestion.
2. Catalog breadth can cause investors or users to confuse model availability with validation.
3. Local persistence is not cryptographic tamper evidence.
4. Aggregate CI status can be misunderstood when a deliberate scientific blocker fails one job.
5. Separate legacy Campaign/discovery/hazard evidence paths can drift from canonical Fabric semantics.

### TOP 5 hidden gaps

1. No durable complete observation fixture exists for any admitted model-to-real-observation benchmark.
2. No general instrument-agnostic observation contract with raw payload, QC, uncertainty and chain of custody exists.
3. Persisted Evidence Pack validation is structurally shallow.
4. No browser proof currently demonstrates Science Chat → CI-hosted real backend → Evidence → fresh Replay.
5. No customer acceptance metric has been proven beyond technical demonstrability.

### TOP 5 things to build, in order

1. A safe, approved external observation fixture for one existing model, only after scientific compatibility review.
2. Strict nested Evidence Pack integrity validation and no-network replay tests, reusing the existing system.
3. Browser proof of the existing PySCF backend path against a controlled backend environment.
4. A minimal instrument-agnostic observation contract, before any instrument adapter.
5. One bounded customer pilot around reproducible computational evidence, not autonomous discovery.

### TOP 5 things not to build now

1. Option D Atom-Bohr implementation while G3 is blocked.
2. USGS live adapter for the incompatible water-pump-pipe model.
3. Micro-Manager, MQTT, OPC UA, instrument control or autonomous wet-lab execution.
4. GIS/OSM/DEM, new hazards, full HPC or another renderer/world.
5. New Evidence/Replay systems or broad new scientific domains.

## S. Final CTO Decision

> **GENESIS HEALTH:** YELLOW
>
> **COMPUTATIONAL PROOF:** CONFIRMED / BOUNDED
>
> **SCIENTIFIC CREDIBILITY:** MEDIUM
>
> **PRODUCT READINESS:** MEDIUM for technical demonstration; LOW for real-world validation
>
> **INVESTOR READINESS:** MEDIUM-LOW
>
> **COMMERCIAL READINESS:** LOW-MEDIUM
>
> **NEXT BEST ACTION:** keep LIVE stable and close one compatible, safe model-to-observation benchmark before adding any new domain or instrument.

The current CTO decision is **not** to increase feature count. The correct strategy is to protect trust density: preserve the computational E2E regression gate, keep G3 explicitly blocked, do not implement Option D or new integrations, and admit the next observation only when raw data, provenance, uncertainty, licence and deterministic replay can all be proven.

## References

1. [`packages/backend/src/compute/registry.mjs`](../packages/backend/src/compute/registry.mjs) — backend model metadata and execution registry.
2. [`packages/frontend/src/core/knowledge/registry.ts`](../packages/frontend/src/core/knowledge/registry.ts) — domain, capability and limitation registry.
3. [`packages/frontend/src/core/experimentFabric/evidencePack.ts`](../packages/frontend/src/core/experimentFabric/evidencePack.ts) — canonical Evidence Pack contract.
4. [`packages/frontend/src/core/experimentFabric/evidencePackStore.ts`](../packages/frontend/src/core/experimentFabric/evidencePackStore.ts) — persisted pack and replay verdict semantics.
5. [`packages/frontend/src/core/experimentFabric/provenance.ts`](../packages/frontend/src/core/experimentFabric/provenance.ts) — request, plan, run fingerprint and result-origin semantics.
6. [`docs/GENESIS_ATOM_BOHR_G3_FINAL_REPORT.md`](GENESIS_ATOM_BOHR_G3_FINAL_REPORT.md) — G3 final blocker report.
7. [`docs/GENESIS_ATOM_BOHR_G3_READINESS.md`](GENESIS_ATOM_BOHR_G3_READINESS.md) — G3 readiness boundary and handoff.
8. [`docs/GENESIS_ATOM_BOHR_G3_BLOCKER.md`](GENESIS_ATOM_BOHR_G3_BLOCKER.md) — A4 security blocker and containment.
9. [`scripts/smoke-e2e.mjs`](../scripts/smoke-e2e.mjs) — desktop/mobile browser smoke harness.
10. [`docs/MASTER_EXECUTION_STATUS.md`](MASTER_EXECUTION_STATUS.md) — authoritative roadmap and LIVE status.
