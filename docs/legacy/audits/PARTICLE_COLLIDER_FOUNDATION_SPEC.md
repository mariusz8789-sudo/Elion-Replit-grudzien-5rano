# Particle/Collider POC — Foundation Spec

**Status: SPEC ONLY. NO CODE IN THIS COMMIT.** Every interface, function signature, and file path below is a proposal for independent review, not an implementation. This document is the direct follow-up to `docs/HADRON_COLLIDER_POC_READINESS_AUDIT.md` (verdict `NEEDS_FOUNDATION`) and designs the minimal spine that audit's ten gaps require — nothing more. No collider physics beyond a disclosed, conservation-respecting toy decay model; no new solver; no CERN data; no live experimental data; no accelerator control; no UI; no City3D; no GIS; no Matrix World; no Epidemic Core or Earthquake change; no `ScenarioEngine` change.

**Baseline:** `origin/manus/high-fidelity-epidemic-digital-twin` @ `66ed598`. Branch: `claude/collider-foundation-spec`.

## Prerequisite: one unmerged branch dependency, stated up front

Two primitives this spec reuses — `quantizeForFingerprint` (§5) and `ReplayVerdict`/`computeReplayVerdict` (§7) — **do not exist on the `66ed598` baseline.** They live on `claude/matrix-foundation-sprint` @ `a16e1bb`, which is pushed but unmerged and awaiting its own independent review.

**This is a hard prerequisite, not a footnote.** P0 must not begin until one of these is true:

- **(a)** `claude/matrix-foundation-sprint` is merged into the live branch — then §5 and §7 work exactly as written; or
- **(b)** it is rejected or indefinitely deferred — then this spec must be revised to inline both functions into `core/particleFoundation/` (each is under 20 lines; `computeReplayVerdict` is a pure decision function and `quantizeForFingerprint` is a one-line rounding helper), and the reuse claims in §5/§7 must be downgraded from "reuse" to "same algorithm, independently declared."

Everything else in this spec builds only on primitives verified present at `66ed598`: `canonicalJson`, `sha256Hex`, `recordStore.ts`, `hazardProvenanceStore.ts`'s validation pattern, `experimentFabric/executor.ts`'s case dispatch, and `codeCommitHash()`.

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
  readonly restMassMeV: number;  // e.g. electron: 0.511 — the value core/modelGraph/relativisticEnergyGraph.ts already uses as BASELINE_REST_MASS_MEV
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

/**
 * The deterministic OUTCOME of running the declared collision model against one
 * BeamState. This is the DIRECT ANALOGUE OF `HazardRun` — the single, immutable,
 * self-contained scientific record — and it carries its own `codeCommitHash`
 * and `createdAt` for exactly that reason. `EvidenceRecord` below is NOT a
 * second `HazardRun`; it is only the persistence envelope.
 */
export interface CollisionEvent {
  readonly collisionEventId: string;
  readonly beamStateId: string;
  readonly collisionModelVersion: string;   // versioned like HazardRun.hazardModuleVersion
  readonly codeCommitHash: string;          // like HazardRun.codeCommitHash — core/build/commitHash.ts
  readonly createdAt: number;               // like HazardRun.createdAt
  readonly status: 'COMPLETED' | 'BLOCKED'; // like HazardRun.status; BLOCKED when no channel is open (§4.2)
  readonly blockedReason: string | null;    // non-null iff status === 'BLOCKED'
  readonly products: readonly ProductParticle[]; // empty iff status === 'BLOCKED'
  readonly conservationCheck: {
    readonly energyResidualGeV: number;     // |E_in - ΣE_out|, ~0 by construction (float noise only) — §4.3
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

/**
 * The persistence ENVELOPE — the analogue of `StoredEvidence`'s role only
 * (it wraps a complete result set under one id so replay has everything it
 * needs in one read). It is deliberately NOT a second scientific record:
 * `codeCommitHash`, `createdAt` and `status` live on `CollisionEvent`, which
 * is the `HazardRun` analogue. This envelope adds no scientific field of its
 * own — only the id, the bundle, and the completeness gate.
 */
export interface EvidenceRecord {
  readonly evidenceRecordId: string;
  readonly beamState: BeamState;
  readonly collisionEvent: CollisionEvent;
  readonly detectorReadout: DetectorReadout;
  readonly missingFields: readonly string[]; // evidence-gate completeness, mirrors collectMissing() in discoveryEvidence.ts
}
```

Deliberately **not** modeled in P0: fixed-target collisions, more than two incoming beams, particle showers/cascades beyond the declared decay-channel table, detector material interactions (multiple scattering, energy loss), pile-up, trigger efficiency. Each omission is a `notModeled` string, not a silent gap — same discipline as `WORLD_NOT_MODELED` and `EARTHQUAKE_NOT_MODELED`.

---

## 2. Unit policy

The audit's gap #9 found three conventions coexisting: `j.u.` (arbitrary units, `particle-detector-3d.ts`'s UI slider), GeV (`particle-invmass.ts`'s histogram), MeV (`core/modelGraph/relativisticEnergyGraph.ts`'s `BASELINE_REST_MASS_MEV` and its `totalEnergyMeV`/`momentumMeVc` graph nodes).

**Rule: the deterministic pipeline (`BeamState` through `EvidenceRecord`) is GeV / GeV·c⁻¹ only, everywhere.** `ParticleSpecies.restMassMeV` is the one field allowed to stay in MeV, because that is the literal PDG citation unit and the unit `relativisticEnergyGraph.ts` already works in — conversion happens exactly once, at the boundary where a species enters a `BeamState`.

```ts
// Proposed: core/particleFoundation/units.ts
export const GEV_PER_MEV = 0.001;
export function meVToGeV(massMeV: number): number { return massMeV * GEV_PER_MEV; }

/**
 * Sanity bound for the species table. Every particle this POC can name has a
 * rest mass far below 1 000 000 MeV (1 TeV); a value above it almost certainly
 * means a GeV figure was pasted into a MeV field. Fails loudly at table-
 * construction time rather than silently producing a 1000x-wrong beam energy.
 */
export const MAX_PLAUSIBLE_REST_MASS_MEV = 1_000_000;
export function assertPlausibleRestMassMeV(species: ParticleSpecies): void { /* throws on violation */ }
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

**Scope for P0/P1: a declared, versioned, two-body decay-channel table — not a real QCD cross-section.** This is still a toy model, but a real-physics toy.

### 4.1 Frame and beam-geometry convention (must be explicit, or `P_in` is not computable)

A single `energyPerBeamGeV` scalar plus two species does not define two four-vectors. `collisionType: 'head-on'` is therefore defined to mean **exactly**:

- The **lab frame** is the frame in which `BeamState` is expressed, and is the frame all `EvidenceRecord` values are reported in.
- Beam A travels along **+z** with total energy `energyPerBeamGeV`; beam B travels along **−z** with the same total energy. Both have zero transverse momentum (`px = py = 0`).
- Each beam's momentum magnitude follows from exact relativistic kinematics: `|p| = √(E² − m²)` in natural units (`c = 1`), where `m = meVToGeV(species.restMassMeV)`. This requires `energyPerBeamGeV ≥ m` per beam — see §4.2.
- Because the two beams are equal-energy and exactly anti-collinear, the **lab frame coincides with the centre-of-momentum (CM) frame** for the `'head-on'` case, and `√s = 2 · energyPerBeamGeV`. The boost step is therefore an identity in P0 — but the implementation must still perform it explicitly, so that adding an asymmetric-energy `collisionType` later does not require rewriting the kinematics.

**Any other geometry is out of scope and must be rejected, not assumed.** `collisionType` is a closed union whose only P0 member is `'head-on'`; asymmetric-energy, fixed-target, and non-collinear crossing-angle configurations are deliberately absent from the type, so adding one is a visible, reviewable type change rather than a silent reinterpretation of existing records.

### 4.2 Input domain and the impossible-channel rule

Two-body decay into products of rest mass `m₁, m₂` exists only when `√s ≥ m₁ + m₂`. The model must therefore:

- **Reject an under-energy `BeamState` before generating anything.** If `energyPerBeamGeV < meVToGeV(species.restMassMeV)` for either beam, the `BeamState` itself is invalid (a particle cannot have less total energy than its rest mass) — `buildBeamState()` throws.
- **Filter channels by threshold, then decide.** Only channels satisfying `√s ≥ m₁ + m₂` are eligible for the `rng()` draw. If **no** declared channel is open at this `√s`, `generateCollisionEvent()` returns a `CollisionEvent` with `products: []` and an explicit `blockedReason` rather than throwing or emitting an unphysical event — and that record replays to `BLOCKED`, not `DRIFT` (see §7).

This makes "impossible channel" a **first-class, testable outcome** (§9.11) instead of an unhandled edge that produces `NaN` or imaginary momenta.

### 4.3 Numerical tolerance

`conservationCheck.withinTolerance` is defined as **relative** tolerance against the incoming scale, not an absolute constant:

```
withinTolerance  ⟺  energyResidualGeV ≤ CONSERVATION_REL_TOL · √s
                    AND momentumResidualGeVc ≤ CONSERVATION_REL_TOL · √s
CONSERVATION_REL_TOL = 1e-12   // ~1e4 × float64 epsilon: absorbs accumulated
                               // rounding across the solve+boost chain, while
                               // still catching any real algebraic error by
                               // many orders of magnitude.
```

A residual above this bound is a **bug**, not a modelling approximation, and §9.1 asserts it across every channel and many seeds.

### 4.4 The generation procedure

Given a valid `BeamState` and `P_in = fourMomentum(speciesA) + fourMomentum(speciesB)` as defined in §4.1:

1. Use `rng()` (from §3) only to pick **which** threshold-eligible channel fires and the **orientation** (an isotropic direction in the CM frame — `cosθ` uniform on `[-1, 1]`, `φ` uniform on `[0, 2π)`, which is the correct isotropic measure, not uniform-in-θ). `rng()` never picks an energy or a momentum magnitude directly.
2. **Solve** the two product four-momenta: back-to-back in the CM frame, with the momentum magnitude fixed exactly by `√s` and the two declared product rest masses (the standard two-body decay momentum, `p* = √([s − (m₁+m₂)²][s − (m₁−m₂)²]) / (2√s)`), and each product's energy from `E = √(p*² + m²)`.
3. Boost back to the lab frame (identity for `'head-on'`, per §4.1) and record `conservationCheck` against §4.3's bound. The residual is zero up to float precision **by construction**, not by approximation.

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

**No fourth persistence mechanism.** `core/provenance/recordStore.ts`'s `LocalRecordStore`/`InMemoryRecordStore` (the same primitive `core/discovery/evidenceStore.ts` and `core/hazard/hazardProvenanceStore.ts` already build on) is reused directly, **unchanged**.

**Critical constraint, verified against the live baseline `66ed598`:** `recordStore.ts`'s constructors are `InMemoryRecordStore(policy)` and `LocalRecordStore(storageKey, policy)`. **Neither accepts a validator argument, and this spec does not propose adding one.** `recordStore.ts` guards only what is generic to any keyed collection — unsafe ids (`UnsafeRecordIdError`) and a non-map stored collection (`MalformedRecordCollectionError`). Per-record *shape* validation is the domain store's job, applied by wrapping the value that `get()` returns.

This is exactly how `core/hazard/hazardProvenanceStore.ts` does it today, and the collider store mirrors it symbol-for-symbol:

```ts
// Proposed: core/particleFoundation/evidenceStore.ts
import { InMemoryRecordStore, LocalRecordStore } from '../provenance/recordStore';

/** Same naming and structural-check style as hazardProvenanceStore.ts's isHazardRunRecord. */
function isEvidenceRecordRecord(candidate: unknown): candidate is EvidenceRecord { /* structural field checks only */ }

/** Local re-declaration of hazardProvenanceStore.ts's own helpers — not imported, to keep domain isolation. */
function readableRecord<T>(candidate: T | null, isValid: (value: unknown) => value is T): T | null {
  return isValid(candidate) ? candidate : null;
}
async function readableIds<T>(ids: readonly string[], read: (id: string) => Promise<T | null>): Promise<readonly string[]> {
  const records = await Promise.all(ids.map(read));
  return ids.filter((_id, index) => records[index] !== null);
}

export class InMemoryColliderEvidenceStore {
  private records = new InMemoryRecordStore<EvidenceRecord>('reject-if-different'); // one argument — the real signature
  putRecord(r: EvidenceRecord): Promise<void> { return this.records.put(r.evidenceRecordId, r); }
  async getRecord(id: string): Promise<EvidenceRecord | null> {
    return readableRecord(await this.records.get(id), isEvidenceRecordRecord);
  }
  async listRecords(): Promise<readonly string[]> {
    return readableIds(await this.records.list(), (id) => this.getRecord(id));
  }
}

export class LocalColliderEvidenceStore {
  private records = new LocalRecordStore<EvidenceRecord>('collider-evidence-store/records/v1', 'reject-if-different'); // two arguments
  /* same three methods, same readableRecord/readableIds wrapping */
}
```

**Policy: `'reject-if-different'`, not `'overwrite'`.** A physics event record is provenance, like `HazardRun` — never epidemic-style re-saveable evidence.

**Why `readableRecord`/`readableIds` are re-declared rather than imported:** importing them from `core/hazard/hazardProvenanceStore.ts` would couple the collider domain to the hazard domain for a four-line helper, violating the same isolation rule §3 applies to the RNG. They are trivial, and duplication of a trivial helper is the lesser cost — this is a deliberate, stated choice, not an oversight. If a third domain ever needs them, promoting them into `recordStore.ts` as exported helpers is the correct move at that point, not before.

**Behavioral contract this buys:** a corrupted or semantically-invalid stored record is reported **absent** by `getRecord()` (never fabricated, never thrown to a caller), is **excluded** from `listRecords()`, and its raw bytes are **not deleted** — the same read-safety-without-data-loss posture the hazard store already has.

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

Instead, A/B follows the pattern `particle-relativistic-energy` and `universe-galaxy-collision` already use in `core/experimentFabric/executor.ts` — a `case` in the existing dispatch, returning the full `ExperimentResult` shape (`experimentFabric/types.ts:97`) every other scenario already returns: `{ contractVersion, status, summary, outputs, units, warnings, validity, assumptions, visualization, route }`. Note `summary` is **required** and must be a real sentence describing what ran, not a placeholder:

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
    summary: `Wykonano deterministyczny, syntetyczny model zderzenia e+e- przy √s = ${2 * beamState.energyPerBeamGeV} GeV; zdarzenie zapisano jako ${record.evidenceRecordId}.`,
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
  // Comparability rules, in order. Each returns BLOCKED_NOT_COMPARABLE with a distinct reason.
  // 1. Different model version => the two numbers were produced by different physics.
  // 2. Different detector config => the two readouts were reconstructed differently.
  // 3. Different species pair => this is not an A/B of one experiment, it is two experiments.
  //    (Differing energyPerBeamGeV IS the intended A/B axis and is explicitly ALLOWED.)
  // 4. Either side BLOCKED (no open channel, §4.2) => there is nothing to compare.
  /* then: pairwise delta of reconstructedInvariantMassesGeV */
}
```

The `BLOCKED_NOT_COMPARABLE` guard mirrors `ScenarioComparisonStatus`'s own refusal to compare incompatible runs — the *behavior* is reused, the epidemic-shaped *engine* is not.

**The A/B axis is energy, deliberately.** Rule 3 above is what keeps "A/B" meaningful: varying `energyPerBeamGeV` between two otherwise-identical `BeamState`s is a controlled comparison (and is exactly the educational point — watch which channels open as √s rises past each threshold). Varying the species *and* the energy at once is not a controlled comparison, and the function refuses it rather than returning a delta that looks meaningful but isn't. This is the same "controlled-difference gate" principle the Discovery Engine already applies to epidemic arms.

---

## 9. Physics and reproducibility test list

Every test below has a named existing precedent it mirrors — none is a new testing philosophy for this codebase. Tests 11–15 were added after an independent red-team review (`docs/PARTICLE_COLLIDER_SPEC_RED_TEAM_REVIEW.md`) found the original ten silently omitted the `BLOCKED` verdict, impossible channels, idempotence, and A/B comparability.

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
11. **Impossible channel → `BLOCKED`, never an unphysical event.** A `BeamState` whose `√s` is below every declared channel's threshold produces `status: 'BLOCKED'`, `products: []`, a non-null `blockedReason`, and **no** `NaN`/negative/imaginary momentum anywhere in the record (§4.2). A `BeamState` whose per-beam energy is below its own species rest mass is rejected at `buildBeamState()` before any generation happens.
12. **Replay of a `BLOCKED` record returns `BLOCKED`, not `DRIFT` or `MATCH`.** Closes the gap that `ReplayVerdict` has four members but earlier drafts only exercised three. A model-version mismatch between the stored record and the current `COLLISION_MODEL_VERSION` likewise yields `BLOCKED` — the capability-fence behavior `hazardReplay.ts` already implements.
13. **Idempotent re-put.** Writing the bit-identical `EvidenceRecord` under its own id twice is a harmless no-op, not a `DuplicateRecordConflictError` — the exact behavior `evidenceStoreConvergence.test.ts`'s "Test 3 — duplicate id + bit-identical content" already proves for the shared primitive, asserted here for this domain's store.
14. **A/B comparability.** Two records differing only in `energyPerBeamGeV` compare `COMPLETED` with a real delta; records differing in `collisionModelVersion`, `detectorConfigVersion`, or species pair each return `BLOCKED_NOT_COMPARABLE` with the corresponding distinct reason (§8). Promoted into this canonical list rather than living only in the P7 plan row.
15. **Isotropy of the orientation draw.** Over many seeds, the CM-frame `cosθ` distribution is uniform on `[-1, 1]` within a stated statistical tolerance — proves §4.4's isotropic measure was implemented as `cosθ`-uniform, not the common `θ`-uniform mistake, which would bias every reconstructed angular distribution.

---

## 10. Implementation plan, P0–P7

Each stage lands as its own reviewable commit with full local validation (`lint`, frontend+backend tests, `tsc --noEmit`, build, `git diff --check`) before the next starts — the same discipline every prior sprint in this repository has followed. **No stage is implemented by this document.**

| Stage | Scope | New files (proposed) | Tests added |
|---|---|---|---|
| **P0** | Data model + unit policy + `ParticleSpecies` table (a handful of real species, real PDG rest masses/charges) + the `assertPlausibleRestMassMeV` guard. Zero physics logic. | `core/particleFoundation/contracts.ts`, `units.ts` | Unit round-trip (§9.7), mass-plausibility guard, type-level shape checks |
| **P1** | Deterministic, isolated RNG. | `core/particleFoundation/rng.ts` | Same/different-seed stream tests (§9.2, §9.3, RNG-only) |
| **P2** | Collision model: beam geometry (§4.1), threshold/impossible-channel handling (§4.2), tolerance (§4.3), two-body decay-channel table with exact conservation (§4.4). | `core/particleFoundation/collisionModel.ts` | Conservation (§9.1), determinism (§9.2), impossible channel (§9.11), isotropy (§9.15), `notModeled` disclosure present |
| **P3** | Detector projection: pure `computeDetectorReadout()` reusing the `r = p_t/(qB)` relation as a testable function (not the Three.js rendering code) + invariant-mass reconstruction. | `core/particleFoundation/detector.ts` | Purity/determinism (§9.8), invariant-mass sanity (§9.9) |
| **P4** | Fingerprinting for all three records. | `core/particleFoundation/fingerprint.ts` | Order-independence, tamper-sensitivity, quantization stability (mirrors `matrixFoundation.test.ts`) |
| **P5** | Evidence persistence, using `readableRecord`/`readableIds` wrapping per §6 — **no change to `recordStore.ts`**. | `core/particleFoundation/evidenceStore.ts` | `'reject-if-different'` conflict + corrupted-record tests (§9.6), idempotent re-put (§9.13) |
| **P6** | Replay. | `core/particleFoundation/replay.ts` | MATCH / DRIFT / NOT_REPRODUCIBLE (§9.4, §9.5) + BLOCKED (§9.12) |
| **P7** | A/B via Experiment Fabric `case` + `compareEvidenceRecords()`. | One `case` in `experimentFabric/executor.ts` (existing file, additive case only) + `core/particleFoundation/compare.ts` | Full comparability matrix (§9.14) |

P0–P6 touch **no existing file**. P7 is the only stage that touches an existing file (`executor.ts`), and only by adding one new `case` arm, in the same additive style as every other scenario id already registered there — no existing case is modified.

---

## Boundaries carried forward from the readiness audit, unchanged

- **Educational, not real-accelerator.** Every `EvidenceRecord` carries `datasetStatus: 'SCENARIO'` and a non-empty `notModeled` list, exactly like `HazardRun`/`HazardModuleDescriptor`. No claim of calibration to a real accelerator or real collision data is made anywhere in this spec.
- **The existing Particle Lab (`src/labs/particle.ts`, `particle-detector-3d.ts`, `particle-invmass.ts`) is untouched by this plan.** It remains the live, honesty-labeled interactive demo it already is. A future UI could eventually visualize an `EvidenceRecord`, but that is explicitly out of scope for P0–P7 and is not designed here.
- **No merge.** This branch waits for Manus's independent review, as does `claude/hadron-collider-capability-audit` and `claude/matrix-foundation-sprint`.

---

## Remediation record

This spec was revised after an independent red-team review of its own first draft (`aa0dffd`), recorded in `docs/PARTICLE_COLLIDER_SPEC_RED_TEAM_REVIEW.md` (branch `claude/collider-spec-red-team-review`, verdict `NEEDS_SPEC_REMEDIATION`). All ten findings are addressed:

| # | Finding (severity) | Resolution |
|---|---|---|
| 1 | `recordStore.ts` validator-injection API does not exist (**HIGH**) | §6 rewritten against the real `readableRecord`/`readableIds` wrapping pattern from `hazardProvenanceStore.ts`; both constructor signatures now stated correctly; `recordStore.ts` explicitly not modified |
| 2 | `docs/PHASE0_2_PERSISTENCE_INTEGRITY.md` / `isHazardInputShape` cited as live but are not (**HIGH**) | Citation removed; §6 now cites only the real live symbols (`isHazardInputRecord`, `readableRecord`, `MalformedRecordCollectionError`, `UnsafeRecordIdError`) |
| 3 | Undisclosed dependency on unmerged `claude/matrix-foundation-sprint` (**MEDIUM**) | New "Prerequisite" section at the top states it as a hard gate with two explicit resolution paths |
| 4 | Conservation contract underspecified (**MEDIUM**) | §4 expanded into §4.1 frame/beam geometry, §4.2 input domain + impossible-channel rule, §4.3 stated relative tolerance, §4.4 generation procedure |
| 5 | `EvidenceRecord` claimed two conflicting analogues (**MEDIUM**) | Resolved: `CollisionEvent` is the `HazardRun` analogue (now carries `codeCommitHash`/`createdAt`/`status`); `EvidenceRecord` is the persistence envelope only, with no scientific field of its own |
| 6 | Three test categories missing from §9 (**MEDIUM**) | Tests 11–15 added: impossible channel, `BLOCKED` replay, idempotence, A/B comparability, plus isotropy |
| 7 | `BASELINE_REST_MASS_MEV` misattributed to `physics.ts` (**LOW**) | Corrected to `core/modelGraph/relativisticEnergyGraph.ts` in both places |
| 8 | Experiment Fabric shape omitted required `summary` (**LOW**) | Added to both the prose shape description and the illustrative case |
| 9 | A/B comparability rule incomplete (**LOW**) | §8 now states four ordered rules, with energy named as the intended A/B axis and species-pair changes explicitly blocked |
| 10 | No guard against a wrong-unit rest mass (**LOW**) | `MAX_PLAUSIBLE_REST_MASS_MEV` + `assertPlausibleRestMassMeV()` added to §2, tested in P0 |

The review found **no NO-GO condition** — no finding indicated an unsound direction, a duplicated engine, a scope violation, or a false scientific claim. With these ten resolved, the review's five GO conditions are met, and this spec is ready for the separate implementation-approval decision.

**NO CODE IMPLEMENTED / NO COLLIDER PHYSICS BEYOND A DISCLOSED TOY MODEL / NO NEW SOLVER / NO CERN DATA / NO LIVE DATA / NO ACCELERATOR CONTROL / NO UI / NO CITY3D / NO GIS / NO MATRIX WORLD CHANGE / NO EPIDEMIC CORE CHANGE / NO EARTHQUAKE CHANGE / NO SCENARIOENGINE CHANGE.**
