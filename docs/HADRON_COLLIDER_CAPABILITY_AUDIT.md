# Hadron Collider Capability Audit

> **Recommendation: NEEDS_FOUNDATION.** Genesis already has a worthwhile **educational Particle Lab** and can support a narrowly scoped, deterministic collider-learning vertical slice in the future. It does **not** currently have a hadron-collider simulator, a real detector-data pipeline, an event generator, beam/accelerator dynamics, or any operational capability.

**Audit date:** 26 August 2026
**Scope:** Existing repository capabilities only. No particle/collider implementation was added.

## Direct answer

There is **some real particle-physics foundation**, but not a complete “hadron collider” feature.

| Question                                                           | Verified answer                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does Genesis have a Particle Lab?                                  | **Yes.** `packages/frontend/src/labs/particle.ts` registers 2D detector, 3D detector, invariant-mass and relativistic-energy experiments.                                                           |
| Does it have real particle physics?                                | **Partially.** The free-particle special-relativity model is exact within declared assumptions; invariant-mass resonance values/method are real, while its currently active events are synthetic.   |
| Does it simulate proton–proton / hadron collisions?                | **No.** There is no hadron event generator, QCD/showering/hadronisation model, beam dynamics, trigger, detector response or reconstruction pipeline.                                                |
| Does it use live CERN data?                                        | **No.** An optional static CERN Open Data import hook for dimuon masses exists, but the current implementation honestly falls back to synthetic data and this audit did not activate external data. |
| Is it suitable for a real accelerator or operational decision use? | **No.** That would be out of scope and unsupported.                                                                                                                                                 |

## What exists now

| Capability                                | File / symbol                                                                                                                                              | Classification                     | Why it matters                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Particle Lab registry                     | `labs/particle.ts::particleLab`                                                                                                                            | **EXISTS**                         | Groups the 2D/3D detector, invariant-mass and relativistic-energy lessons.                                                                                      |
| Relativistic particle energy and momentum | `labs/experiments/particle-relativistic-energy.ts::particleRelativisticEnergy`; `core/modelGraph/relativisticEnergyGraph.ts::buildRelativisticEnergyGraph` | **REAL / REUSABLE**                | Uses executable special-relativity relations for `γ`, total/kinetic energy and momentum of a free particle, with declared `β < 1` validity.                     |
| 2D detector tracks                        | `labs/particle.ts::CollisionSim`                                                                                                                           | **ILLUSTRATIVE**                   | Curvature direction and `pₜ` relationship are educational, but species, multiplicity and momentum are random.                                                   |
| 3D detector tracks                        | `labs/experiments/particle-detector-3d.ts::DetectorSim3D`                                                                                                  | **ILLUSTRATIVE / REUSABLE VISUAL** | Charged paths use helical geometry in a uniform solenoidal field and neutral paths are straight; event content is randomly generated and is not LHC kinematics. |
| Invariant-mass learning experiment        | `labs/experiments/particle-invmass.ts::InvMassSim`                                                                                                         | **PARTIAL / REUSABLE**             | Uses synthetic dimuon-like mass sampling around known resonance values plus background. The code labels synthetic events honestly.                              |
| Data-source disclosure                    | `labs/experiments/particle-invmass.ts::particle.dimuon-masses`; `core/dataSource.ts`                                                                       | **REUSABLE GOVERNANCE**            | Declares source, citation, synthetic status and confirmation state rather than hiding data provenance.                                                          |
| Optional static CERN dataset hook         | `scripts/fetch-real-data.mjs`; `particle-invmass.ts`                                                                                                       | **EXISTS, INACTIVE**               | Supports a future approved static data import for dimuon masses only; it is not a live feed, detector event stream or collider integration.                     |
| Scientific truth map                      | `docs/SCIENTIFIC_LIMITATIONS.md`                                                                                                                           | **EXISTS**                         | Correctly classifies Particle as `PARTIAL`: real relativistic-energy core and visual detector layer.                                                            |

## What is not present

The following are **MISSING**, not merely hidden behind UI:

| Missing capability                           | Why it matters                                                                                                                      | Required future boundary                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Proton/hadron beam model                     | A collider requires declared beam species, energy, bunch and interaction assumptions.                                               | Educational fixture only; never operational machine control.                                 |
| Collision event generation                   | The current detector chooses particles randomly; it does not calculate a collision final state.                                     | Deterministic synthetic fixture before any generator claim.                                  |
| QCD, parton shower, hadronisation and jets   | These are essential to honest hadron-collision phenomenology.                                                                       | Separate approved scientific model or explicit `NOT_MODELED`.                                |
| Detector response / reconstruction / trigger | A track drawing is not detector simulation or reconstruction.                                                                       | Keep visualization educational unless a validated model is separately introduced.            |
| Event provenance and replay                  | Current visual collisions use `Math.random()` and do not have a seeded event fixture, fingerprint, evidence pack or replay verdict. | Reuse Genesis evidence/replay patterns only after a specific design review.                  |
| Real-event data pipeline                     | The optional mass array is a limited static hook, not a real event pipeline.                                                        | No fetch/live/CERN integration without explicit scope, license and data-governance approval. |
| Accelerator operations                       | No magnets, RF, vacuum, beam protection, controls or procedures exist or should be added.                                           | Permanently out of scope for an educational product slice.                                   |

## Does a future educational slice make sense?

**Yes, as a self-contained Particle Lab learning slice; no, as the next Genesis Digital Twin or Multi-Hazard milestone.** The existing exact relativity calculation, invariant-mass lesson, truthful source-status mechanism and 3D detector visual offer a genuine teaching foundation. The correct product claim would be: “a deterministic synthetic particle-event lesson that teaches track curvature, invariant mass and evidence/replay.” It must not claim to simulate the LHC, calculate real cross sections, reproduce detector reconstruction, predict collisions or control a machine.

The first safe vertical slice should be **one deterministic synthetic event fixture**, not a general collider engine. It would require a future approved contract review for:

1. A versioned synthetic `ParticleEventInput` with a seed or fully recorded generated event.
2. A defined set of synthetic outgoing particles with four-vectors, charge and provenance.
3. An invariant-mass calculation derived from that declared fixture.
4. A read-only 3D projection that reuses the existing detector visual pattern, without a second renderer/application.
5. `MATCH`/`DRIFT`/`BLOCKED`/`NOT_REPRODUCIBLE` evidence behavior and a truthful `SYNTHETIC` / `EDUCATIONAL` disclosure.

Until that review exists, the recommendation remains **NEEDS_FOUNDATION**. The current Particle Lab should be preserved as a useful educational feature, not inflated into a collider Digital Twin.

## Explicit exclusions

This assessment does not authorize real accelerator design, operational procedures, beam-control logic, external CERN data ingestion, live data, new physics engines, particle-yield prediction, detector calibration, safety advice, a standalone application, or a second renderer. It does not change the Earthquake demonstrator, City3D, Matrix readiness work, Epidemic Scientific Core, routing, evidence store or hazard modules.
