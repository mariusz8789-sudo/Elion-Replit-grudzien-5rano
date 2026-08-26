# Particle/Collider POC — Foundation Spec

**Status: SPEC ONLY. NO CODE IN THIS COMMIT.** Every interface, function signature, and file path below is a proposal for independent review, not an implementation. This document is the direct follow-up to `docs/HADRON_COLLIDER_POC_READINESS_AUDIT.md` (verdict `NEEDS_FOUNDATION`) and designs the minimal spine that audit's ten gaps require — nothing more. No collider physics beyond a disclosed, conservation-respecting toy decay model; no new solver; no CERN data; no live experimental data; no accelerator control; no UI; no City3D; no GIS; no Matrix World; no Epidemic Core or Earthquake change; no `ScenarioEngine` change.

**Baseline:** `origin/manus/high-fidelity-epidemic-digital-twin` @ `66ed598`. Branch: `claude/collider-foundation-spec`.

## Why this shape, not another

Every design choice below is a named, cited reuse of an existing Genesis pattern — never a new mechanism invented for this domain. Where the audit found the particle domain diverges from every other domain (no seed, no fingerprint, no persistence, no replay), this spec closes exactly that divergence and no further.

| Gap from the audit (§5, `docs/HADRON_COLLIDER_POC_READINESS_AUDIT.md`) | Closed by |
|---|---|
| #1 No seed anywhere | §3 |
| #2 No collision model with a conservation law | §4 |
| #3 No event persistence | §6 |
| #4 No event/collision fingerprint | §5 |
| #5 No replay function | §7 |
| #6 No `BeamState`/`CollisionInput` contract | §1 |
| #7 Two unconnected demos (invariant mass, detector) | §1 (`DetectorReadout` includes reconstruction) |
| #8 No determinism tests | §9 |
| #9 No declared unit system | §2 |
| #10 No named-scenario/A-B structure | §8 |

---

## 1. Data model

Four records, one pipeline: `BeamState → CollisionEvent → DetectorReadout → EvidenceRecord`. Each mirrors an existing Genesis contract by name so a reviewer already familiar with `SourceArtifact`/`HazardInput`/`HazardRun` (`core/hazard/contracts.ts`) or `StoredEvidence` (`core/discovery/evidenceStore.ts`) recognizes the shape immediately.

```ts
// Proposed: core/particleFoundation/contracts.ts

/** A real species with real PDG-sourced constants — never invented per-scenario. */
export interface ParticleSpecies {
  readonly label: string;        // 'e-' | 'e+' | 'mu-' | 'mu+' | 'gamma' | ...
  readonly restMassMeV: number;  // e.g. electron: 0.511 (core/physics.ts's own BASELINE_REST_MASS_MEV)
  readonly charge: -1 | 0 | 1;
}

/** Everything before a collision — the analogue of HazardInput. */
export interface BeamState {
  readonly beamStateId: string;
  readonly speciesA: ParticleSpecies;
  readonly speciesB: ParticleSpecies;
  readonly energyPerBeamGeV: number;      // canonical unit — see §2
  readonly collisionType: 'head-on';      // P0 scope only; fixed-target deferred, not silently assumed
  readonly seed: number;                  // the ONLY source of randomness downstream — see §3
  readonly beamStateFingerprint: string;  // see §5
}

export interface FourMomentum {
  readonly eGeV: number;
  readonly pxGeVc: number;
  readonly pyGeVc: number;
  readonly pzGeVc: number;
}

export interface ProductParticle {
  readonly productId: string;
  readonly species: ParticleSpecies;
  readonly fourMomentum: FourMomentum;
}

/** The deterministic OUTCOME of running the declared collision model against one BeamState. */
export interface CollisionEvent {
  readonly collisionEventId: string;
  readonly beamStateId: string;
  readonly collisionModelVersion: string;   // versioned like HazardRun.hazardModuleVersion
  readonly products: readonly ProductParticle[];
  readonly conservationCheck: {
    readonly energyResidualGeV: number;     // |E_in - ΣE_out|, should be ~0 by construction (float noise only)
    readonly momentumResidualGeVc: number;  // |P_in - ΣP_out|
    readonly withinTolerance: boolean;
  };
  readonly datasetStatus: 'SCENARIO';       // mirrors HazardDatasetStatus discipline — never 'OBSERVED'
  readonly notModeled: readonly string[];   // mirrors HazardModuleDescriptor.notModeled — see §4
  readonly resultFingerprint: string;       // see §5
}

/** Pure projection of a CollisionEvent through a versioned, deterministic detector model. */
export interface TrackReadout {
  readonly productId: string;
  readonly charge: -1 | 0 | 1;
  readonly transverseMomentumGeVc: number;
  readonly curvatureRadiusM: number;                     // r = p_t / (qB) — same relation as particle-detector-3d.ts
  readonly helixPoints: readonly { x: number; y: number; z: number }[];
}

export interface DetectorReadout {
  readonly detectorReadoutId: string;
  readonly collisionEventId: string;
  readonly detectorConfigVersion: string;                // versioned geometry + field strength
  readonly tracks: readonly TrackReadout[];
  readonly reconstructedInvariantMassesGeV: readonly number[]; // M² = (ΣE)² - (Σp)², per candidate pair — the real method from particle-invmass.ts
  readonly readoutFingerprint: string;                   // see §5
}

/** The one persisted, replayable, fingerprinted unit — mirrors StoredEvidence / HazardRun's role. */
export interface EvidenceRecord {
  readonly evidenceRecordId: string;
  readonly beamState: BeamState;
  readonly collisionEvent: CollisionEvent;
  readonly detectorReadout: DetectorReadout;
  readonly codeCommitHash: string;          // core/build/commitHash.ts — already used by StoredEvidence
  readonly createdAt: number;
  readonly missingFields: readonly string[]; // evidence-gate completeness, mirrors collectMissing() in discoveryEvidence.ts
}
```

Deliberately **not** modeled in P0: fixed-target collisions, more than two incoming beams, particle showers/cascades beyond the declared decay-channel table, detector material interactions (multiple scattering, energy loss), pile-up, trigger efficiency. Each omission is a `notModeled` string, not a silent gap — same discipline as `WORLD_NOT_MODELED` and `EARTHQUAKE_NOT_MODELED`.

---

## 2. Unit policy

The audit's gap #9 found three conventions coexisting: `j.u.` (arbitrary units, `particle-detector-3d.ts`'s UI slider), GeV (`particle-invmass.ts`'s histogram), MeV (`physics.ts`'s `BASELINE_REST_MASS_MEV`, `relativisticEnergyGraph.ts`).

**Rule: the deterministic pipeline (`BeamState` through `EvidenceRecord`) is GeV / GeV/c only, everywhere.** `ParticleSpecies.restMassMeV` is the one field allowed to stay in MeV, because that is the literal PDG citation unit and where `physics.ts`'s existing constant already lives — conversion happens exactly once, at the boundary where a species enters a `BeamState`.

```ts
// Proposed: core/particleFoundation/units.ts
export const GEV_PER_MEV = 0.001;
export function meVToGeV(massMeV: number): number { return massMeV * GEV_PER_MEV; }
```

No other file in the new module performs this conversion inline — the same "one place, not recomputed per call site" rule `interventionEffects()` already enforces for mobility scaling.

**The existing `j.u.` slider in `particle-detector-3d.ts` is untouched and out of scope.** It belongs to the live interactive renderer (`Sim3D`), not the deterministic core; this spec's pipeline never reads it. If a future UI wants to drive a `BeamState.energyPerBeamGeV`, it needs a real, GeV-labeled control — reusing `j.u.` for a fingerprinted, replayable value would misrepresent what the number means.

---

## 3. Deterministic RNG and seed

`core/epidemic/agents.ts`'s `makeRng(seed)` (mulberry32) is the existing pattern. `core/hazard/earthquake/rng.ts` deliberately did **not** import it, keeping an independent, textually self-contained copy specifically so the hazard domain could prove zero coupling to the epidemic core (see that file's own doc comment). This spec follows the same isolation precedent for the same reason — a collider POC must be provably isolated from Epidemic Core too.

```ts
// Proposed: core/particleFoundation/rng.ts — independent mulberry32, not imported from epidemic or hazard code.
export function makeColliderRng(seed: number): () => number { /* identical algorithm, separate file */ }
```

**Threading rule:** exactly one `rng` instance is created per `CollisionEvent` generation call, seeded from `BeamState.seed`, used only within that call, and discarded — mirroring `EpidemicCitySimulation`'s per-instance `this.rng`, never a shared/global generator. Two calls with the same `BeamState` (same seed) must produce bit-identical `CollisionEvent`s; this is the test in §9 that closes gap #1.

---

## 4. Collision contract — energy/momentum conservation

This is the direct fix for the audit's most serious physics gap (#2): today's `particle-detector-3d.ts` picks a **product count** from `Math.random()` nudged by an energy slider, with no conservation law at all (explicitly disclosed in its own `honestyNote` — this spec does not relax that disclosure, it gives the *new* deterministic module a real one).

**Scope for P0/P1: a declared, versioned, two-body decay-channel table — not a real QCD cross-section.** This is still a toy model, but a real-physics toy: given incoming total four-momentum `P_in = fourMomentum(speciesA, energyPerBeamGeV) + fourMomentum(speciesB, energyPerBeamGeV)` (computed via exact relativistic kinematics, `E² = (pc)² + (mc²)²`), the model:

1. Uses `rng()` (from §3) only to pick **which** declared channel fires and the **orientation** (an isotropic direction in the CM frame) — never to pick energies or momenta directly.
2. **Solves** the two product four-momenta so they are back-to-back in the CM frame with magnitude fixed exactly by `P_in`'s invariant mass and the channel's declared product rest masses — real two-body decay kinematics, not a fudge.
3. Boosts the result back to the lab frame and records `conservationCheck` — the residual should be zero up to float precision **by construction**, not by approximation. A non-negligible residual is a bug, and a test asserts this (§9).

```ts
// Proposed: core/particleFoundation/collisionModel.ts
export const COLLISION_MODEL_VERSION = '0.1.0-toy';
export const COLLISION_NOT_MODELED = [
  'real-cross-sections', 'real-branching-ratios', 'qcd-color-confinement-and-jets',
  'detector-material-interactions', 'pile-up', 'trigger-efficiency', 'radiative-corrections',
] as const;

export function generateCollisionEvent(beamState: BeamState): CollisionEvent { /* pure, seeded, conserving */ }
```

Every future addition to the decay-channel table bumps `COLLISION_MODEL_VERSION` — exactly like `HazardRun.hazardModuleVersion` — so an old `EvidenceRecord` never silently means something different after the model changes.

---

## 5. Canonical event serialization + fingerprint

Mirrors `core/hazard/fingerprint.ts` exactly: the same two primitives (`canonicalJson` from `core/events/hash.ts`, `sha256Hex` from `core/discovery/evidenceCrypto.ts`), no third hashing scheme.

```ts
// Proposed: core/particleFoundation/fingerprint.ts
import { canonicalJson } from '../events/hash';
import { sha256Hex } from '../discovery/evidenceCrypto';
import { quantizeForFingerprint } from '../matrixFoundation/worldStateFingerprint'; // reuse, don't reinvent

export async function computeBeamStateFingerprint(input: {
  readonly speciesA: ParticleSpecies; readonly speciesB: ParticleSpecies;
  readonly energyPerBeamGeV: number; readonly seed: number;
}): Promise<string> {
  return sha256Hex(canonicalJson(input)); // never includes a display label, mirrors computeHazardInputFingerprint
}

export async function computeCollisionEventFingerprint(input: {
  readonly beamStateFingerprint: string; readonly collisionModelVersion: string;
  readonly products: readonly ProductParticle[];
}): Promise<string> {
  const quantized = input.products.map((p) => ({
    ...p, fourMomentum: { eGeV: quantizeForFingerprint(p.fourMomentum.eGeV), /* ...same for px/py/pz */ },
  }));
  return sha256Hex(canonicalJson({ ...input, products: quantized }));
}
```

`quantizeForFingerprint` (already landed in `core/matrixFoundation/worldStateFingerprint.ts` by the Matrix Foundation Sprint) is reused, not copied — the same cross-platform float-noise problem it solves for world-entity coordinates applies identically to four-momentum components. `computeDetectorReadoutFingerprint` follows the identical shape over `tracks`/`reconstructedInvariantMassesGeV`.

---

## 6. Minimal record store

**No fourth persistence mechanism.** `core/provenance/recordStore.ts`'s `LocalRecordStore`/`InMemoryRecordStore` (the same primitive `core/discovery/evidenceStore.ts` and `core/hazard/hazardProvenanceStore.ts` already build on) is reused directly.

```ts
// Proposed: core/particleFoundation/evidenceStore.ts
import { InMemoryRecordStore, LocalRecordStore } from '../provenance/recordStore';

function isEvidenceRecordShape(candidate: unknown): candidate is EvidenceRecord { /* mirrors isHazardRunShape's minimal-fields check, see docs/PHASE0_2_PERSISTENCE_INTEGRITY.md */ }

export class InMemoryColliderEvidenceStore {
  private records = new InMemoryRecordStore<EvidenceRecord>('reject-if-different', isEvidenceRecordShape);
  putRecord(r: EvidenceRecord) { return this.records.put(r.evidenceRecordId, r); }
  getRecord(id: string) { return this.records.get(id); }
  listRecords() { return this.records.list(); }
}

export class LocalColliderEvidenceStore {
  private records = new LocalRecordStore<EvidenceRecord>('collider-evidence-store/records/v1', 'reject-if-different', isEvidenceRecordShape);
  /* same three methods */
}
```

**Policy: `'reject-if-different'`, not `'overwrite'`.** A physics event record is provenance, like `HazardRun` — never epidemic-style re-saveable evidence. The `isEvidenceRecordShape` validator is included from day one, not retrofitted after an incident, applying exactly the pattern `docs/PHASE0_2_PERSISTENCE_INTEGRITY.md` and its `isHazardInputShape`/`isHazardRunShape` established: a corrupted or semantically-invalid stored record is reported absent by `getRecord()`, never fabricated, and never silently overwritable under `'reject-if-different'`.

---

## 7. Replay API and verdict

**No new verdict vocabulary.** `core/matrixFoundation/replayVerdict.ts`'s `ReplayVerdict` (`'MATCH' | 'DRIFT' | 'BLOCKED' | 'NOT_REPRODUCIBLE'`) and `computeReplayVerdict()`, landed by the Matrix Foundation Sprint specifically so a future domain would not re-derive the decision a third time, are used as-is.

```ts
// Proposed: core/particleFoundation/replay.ts
import { computeReplayVerdict, type ReplayVerdict } from '../matrixFoundation/replayVerdict';

export interface CollisionReplayReport {
  readonly evidenceRecordId: string;
  readonly verdict: ReplayVerdict;
  readonly recomputedFingerprint: string | null;
}

export async function replayCollisionEvent(
  store: { getRecord(id: string): Promise<EvidenceRecord | null> },
  evidenceRecordId: string,
): Promise<CollisionReplayReport> {
  const record = await store.getRecord(evidenceRecordId);
  if (!record) return { evidenceRecordId, verdict: 'NOT_REPRODUCIBLE', recomputedFingerprint: null };

  // MUST call the same pure function with the SAME beamState.seed — never a fresh seed. Re-sampling
  // with a new seed is not replay; it is a different experiment, and would make MATCH meaningless.
  const recomputed = generateCollisionEvent(record.beamState);
  const recomputedFingerprint = await computeCollisionEventFingerprint({
    beamStateFingerprint: record.beamState.beamStateFingerprint,
    collisionModelVersion: recomputed.collisionModelVersion,
    products: recomputed.products,
  });

  const verdict = computeReplayVerdict({
    inputsAvailable: true, recordFound: true,
    recordedFingerprint: record.collisionEvent.resultFingerprint,
    recomputedFingerprint,
  });
  return { evidenceRecordId, verdict, recomputedFingerprint };
}
```

---

## 8. A/B scenarios — via Experiment Fabric, not `ScenarioEngine`

The audit's own architecture-fit finding (§4 of the readiness audit) is explicit: `core/simulation/scenarioEngine.ts`'s `ScenarioRun` has non-optional `EpidemicCityParams`/`HospitalCapacityParams` fields — it is epidemic-shaped, and widening or duplicating it for an unrelated domain was the exact mistake Phase 0.1's convergence work (`docs/PHASE0_EVIDENCE_STORE_CONVERGENCE.md`) was written to prevent for storage. **This spec does not touch `scenarioEngine.ts`.**

Instead, A/B follows the pattern `particle-relativistic-energy` and `universe-galaxy-collision` already use in `core/experimentFabric/executor.ts` — a `case` in the existing dispatch, returning the existing `{ status, outputs, units, warnings, validity, assumptions, visualization, route }` shape every other Experiment Fabric scenario already returns:

```ts
// Proposed future addition to experimentFabric/executor.ts — NOT added in this commit
case 'collision-electron-positron-annihilation': {
  const beamState = buildBeamState({
    speciesA: ELECTRON, speciesB: POSITRON,
    energyPerBeamGeV: numberParam(params, 'energyGeV', 45.6), // Z-pole, matches particle-invmass.ts's own Z0 = 91.19 GeV resonance
    seed: numberParam(params, 'seed', 1),
  });
  const record = await runAndPersistCollision(beamState, store);
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
    outputs: { /* invariant masses, conservation residual, evidenceRecordId */ },
    units: { energyGeV: 'GeV', /* ... */ },
    warnings: COLLISION_NOT_MODELED,
    validity: 'Toy two-body decay-channel model with exact 4-momentum conservation. Not a real cross-section. See collisionModelVersion.',
    assumptions: ['Same seed reproduces the identical event and passes replay MATCH.'],
    visualization: ['numeric', 'graph'], route: model.route,
  };
}
```

**"A/B" is two `BeamState`s through the identical pipeline**, compared by one small, new, domain-neutral function — not a rebuilt `compareScenarios()`:

```ts
// Proposed: core/particleFoundation/compare.ts
export interface EvidenceComparison {
  readonly status: 'COMPLETED' | 'BLOCKED_NOT_COMPARABLE';
  readonly blockedReason?: string;
  readonly invariantMassDeltaGeV?: readonly number[];
}
export function compareEvidenceRecords(baseline: EvidenceRecord, variant: EvidenceRecord): EvidenceComparison {
  if (baseline.collisionEvent.collisionModelVersion !== variant.collisionEvent.collisionModelVersion) {
    return { status: 'BLOCKED_NOT_COMPARABLE', blockedReason: 'different collisionModelVersion' };
  }
  /* pairwise delta of reconstructedInvariantMassesGeV */
}
```

The `BLOCKED_NOT_COMPARABLE` guard mirrors `ScenarioComparisonStatus`'s own refusal to compare incompatible runs — the *behavior* is reused, the epidemic-shaped *engine* is not.

---

## 9. Physics and reproducibility test list

Every test below has a named existing precedent it mirrors — none is a new testing philosophy for this codebase.

1. **Conservation holds for every generated event.** `|E_in - ΣE_out| < ε` and `|P_in - ΣP_out| < ε` across many seeds and every declared decay channel. (New — this is the test the audit found missing entirely.)
2. **Determinism: same `BeamState` → identical `CollisionEvent`, identical fingerprint**, across two independent calls. Mirrors `agents.test.ts`'s "same seed → identical stream."
3. **Different seed → different event, different fingerprint.** Negative control, mirrors `scenarioEngine.test.ts`'s "a different seed is a different world."
4. **A tampered product four-momentum or fingerprint → replay `DRIFT`, never `MATCH`.** Mirrors `scenarioEngine.test.ts`'s tamper test and `hazardReplay.ts`'s "never a false MATCH" rule.
5. **A missing or corrupted `EvidenceRecord` → replay `NOT_REPRODUCIBLE`, never throws.** Mirrors the exact `persistenceIntegrityBoundary.test.ts` pattern (Test 6/11) proven for `HazardRun`/`HazardInput`.
6. **`'reject-if-different'` blocks a real conflicting write, and a write over a corrupted existing record never silently succeeds.** Reuses `persistenceIntegrityBoundary.test.ts`'s Test 7 pattern directly.
7. **Unit round-trip.** `meVToGeV(restMassMeV)` is lossless within float tolerance for every declared `ParticleSpecies`.
8. **Detector readout is a pure function of `CollisionEvent`.** Same event twice → identical `DetectorReadout`, identical reconstructed invariant masses — no hidden randomness in the detector stage.
9. **Invariant-mass reconstruction sanity (a real physics check, not just determinism).** A synthetic two-body decay's reconstructed mass recovers the channel's declared parent mass within numerical tolerance — proves `M² = (ΣE)² - (Σp)²` is wired correctly end-to-end, the same method `particle-invmass.ts` already uses on synthetic data.
10. **Import-boundary scan.** No file under `core/particleFoundation/` imports City3D, GIS, `core/simulation/epidemicCity.ts`, `core/hazard/earthquake/`, or `core/simulation/scenarioEngine.ts`. Mirrors the existing scan pattern in `hazardProvenance.test.ts` (Test 8) and `matrixFoundation.test.ts`.

---

## 10. Implementation plan, P0–P7

Each stage lands as its own reviewable commit with full local validation (`lint`, frontend+backend tests, `tsc --noEmit`, build, `git diff --check`) before the next starts — the same discipline every prior sprint in this repository has followed. **No stage is implemented by this document.**

| Stage | Scope | New files (proposed) | Tests added |
|---|---|---|---|
| **P0** | Data model + unit policy + `ParticleSpecies` table (a handful of real species, real PDG rest masses/charges). Zero physics logic. | `core/particleFoundation/contracts.ts`, `units.ts` | Unit round-trip (§9.7), type-level shape checks |
| **P1** | Deterministic, isolated RNG. | `core/particleFoundation/rng.ts` | Same/different-seed stream tests (§9.2, §9.3, RNG-only) |
| **P2** | Collision model: two-body decay-channel table with exact conservation. | `core/particleFoundation/collisionModel.ts` | Conservation (§9.1), determinism (§9.2), `notModeled` disclosure present |
| **P3** | Detector projection: pure `computeDetectorReadout()` reusing the `r = p_t/(qB)` relation as a testable function (not the Three.js rendering code) + invariant-mass reconstruction. | `core/particleFoundation/detector.ts` | Purity/determinism (§9.8), invariant-mass sanity (§9.9) |
| **P4** | Fingerprinting for all three records. | `core/particleFoundation/fingerprint.ts` | Order-independence, tamper-sensitivity, quantization stability (mirrors `matrixFoundation.test.ts`) |
| **P5** | Evidence persistence. | `core/particleFoundation/evidenceStore.ts` | `'reject-if-different'` conflict + corrupted-record tests (§9.6) |
| **P6** | Replay. | `core/particleFoundation/replay.ts` | MATCH / DRIFT / NOT_REPRODUCIBLE (§9.4, §9.5) |
| **P7** | A/B via Experiment Fabric `case` + `compareEvidenceRecords()`. | One `case` in `experimentFabric/executor.ts` (existing file, additive case only) + `core/particleFoundation/compare.ts` | Two `BeamState`s at different energies produce distinctly-fingerprinted, comparable records; `BLOCKED_NOT_COMPARABLE` on version mismatch |

P0–P6 touch **no existing file**. P7 is the only stage that touches an existing file (`executor.ts`), and only by adding one new `case` arm, in the same additive style as every other scenario id already registered there — no existing case is modified.

---

## Boundaries carried forward from the readiness audit, unchanged

- **Educational, not real-accelerator.** Every `EvidenceRecord` carries `datasetStatus: 'SCENARIO'` and a non-empty `notModeled` list, exactly like `HazardRun`/`HazardModuleDescriptor`. No claim of calibration to a real accelerator or real collision data is made anywhere in this spec.
- **The existing Particle Lab (`src/labs/particle.ts`, `particle-detector-3d.ts`, `particle-invmass.ts`) is untouched by this plan.** It remains the live, honesty-labeled interactive demo it already is. A future UI could eventually visualize an `EvidenceRecord`, but that is explicitly out of scope for P0–P7 and is not designed here.
- **No merge.** This branch waits for Manus's independent review, as does `claude/hadron-collider-capability-audit` and `claude/matrix-foundation-sprint`.

**NO CODE IMPLEMENTED / NO COLLIDER PHYSICS BEYOND A DISCLOSED TOY MODEL / NO NEW SOLVER / NO CERN DATA / NO LIVE DATA / NO ACCELERATOR CONTROL / NO UI / NO CITY3D / NO GIS / NO MATRIX WORLD CHANGE / NO EPIDEMIC CORE CHANGE / NO EARTHQUAKE CHANGE / NO SCENARIOENGINE CHANGE.**
