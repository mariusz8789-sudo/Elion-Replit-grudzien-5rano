# Quantum Lab core audit — tunneling and the Bloch decoherence extraction

Audit of the remaining Quantum Lab experiments, following the double-slit extraction. One
experiment needed no work; one hid three pieces of model inside a Three.js renderer.

## Audit result — where each Quantum Lab model lives

| Experiment | Physics lives in | Verdict |
| --- | --- | --- |
| `quantum-tunneling` | `core/quantum/tunnelingRunner.ts` | **NO ACTION REQUIRED** |
| `quantum-chsh` | `core/physics.ts` (`chshS`, `sampleSingletPair`, `singletCorrelation`) | already in core |
| `quantum-teleport` | `core/quantumState.ts` + `core/quantum/teleportationRunner.ts` | already in core |
| `quantum-photon-consequence` | `core/modelGraph/photonGraph.ts` | already in core |
| `quantum-kitaev-bulk` | `core/compute/kitaevBulk.ts` | already in core |
| double-slit | `core/physics.ts` | extracted in the previous pass |
| **`quantum-bloch-3d`** | **partly inside the renderer class** | **extracted in this pass** |

### Tunneling — NO ACTION REQUIRED

`core/quantum/tunnelingRunner.ts` already holds the whole numerical core: split-step Fourier
solution of the Schrödinger equation in natural units ħ = m = 1, a 512-point grid over a domain of
length 100, an in-place radix-2 FFT, absorbing edge damping, and bounded input validation
(`energy` 0.2–1.6, `barrier` 0.4–2.5, `width` 1–8, `frames` 1–2400).

Verified rather than assumed:

- no `Math.random`, no `Date.now`, no `document`/`window`, no Three.js, no module-level mutable
  bindings anywhere in the file;
- the Canvas class is `class TunnelingSim extends TunnelingSolver` — it **inherits** the solver and
  adds only `render()`. There is no second solver and no copy of the integrator;
- the same runner serves the Canvas, the local Fabric path and the backend bundle.

This is exactly the target state the double-slit pass was aiming for, reached earlier. **Creating a
commit here would have been cosmetic, so none was made.**

## DONE — the real gap: Bloch sphere

Three pieces of model lived inside `labs/experiments/quantum-bloch-3d.ts`, a 561-line `Sim3D` class
that imports Three.js:

1. **Decoherence** — private field `shrink`, evolved in `update()`. The interface renders it to the
   user as `|r⃗|`, a physical quantity, and the narration prints `Dekoherencja: |r⃗| = …`.
2. **Projective measurement** — the `apply('M')` branch: draw, compare against `|α|²`, collapse to a
   basis state.
3. **The Born rule** — `getStats()` recomputed `a[0]**2 + a[1]**2` inline, a second copy of a
   formula `runBlochCircuitScenario` already computed.

Nothing about this was testable, fingerprintable or replayable. `quantum-bloch.ts` — the pure module
of this pair — even *documented* the decoherence model in its header while not implementing it.

| File | Change |
| --- | --- |
| `packages/frontend/src/labs/experiments/quantum-bloch.ts` | **added** `stepBlochVectorLength()`, `collapseByMeasurement()`, `probabilityOfZero()`, three model constants, `BlochMeasurementOutcome` |
| `packages/frontend/src/labs/experiments/quantum-bloch-3d.ts` | **removed** the decoherence loop, the measurement branch body and the inline Born rule; the renderer now calls the pure functions |
| `packages/frontend/src/__tests__/blochDecoherenceModel.test.ts` | **added** — 17 tests |
| `screenshots/bloch-decoherence-{desktop,mobile}.png` | Chromium evidence |

```ts
export const BLOCH_DECOHERENCE_RATE_PER_SECOND = 0.12;
export const BLOCH_RECOHERENCE_RATE_PER_SECOND = 0.3;
export const BLOCH_MIN_VECTOR_LENGTH = 0.02;

export function stepBlochVectorLength(current: number, dt: number, decohering: boolean): number;
export function probabilityOfZero(state: [C, C]): number;
export function collapseByMeasurement(state: [C, C], draw: number): BlochMeasurementOutcome;
```

`collapseByMeasurement` takes the random draw as a parameter, so the measurement *rule* is
deterministic and the randomness stays at the call site. That is the pattern already used by
`sampleSingletPair(a, b, rnd = Math.random)` in `core/physics.ts`, and the same split the double-slit
pass used for its sampler — not a new convention.

## SCIENCE

**Decoherence** — `|r⃗|`, the length of the Bloch vector. `|r⃗| = 1` is a pure state; `|r⃗| < 1` is a
statistical mixture. The model is **phenomenological**: the length falls linearly at 0.12 per second
while the environment coupling is on and returns linearly at 0.3 per second when it is off, with a
floor at 0.02 so the vector keeps a defined direction. It is **not** a Lindblad solution and **not**
fitted to any device — the rates are visual constants, not measured T₁/T₂ times.

**Measurement** — projection in the computational basis. P(|0⟩) = |α|² (Born rule); the post-measurement
state is a basis state, not a rotation of the pre-measurement state, because projection is
discontinuous while unitary evolution is not.

**Status: `MODEL`.** Not `MEASUREMENT`, not `FACT`. No many-worlds reading, no "parallel universes",
no "quantum consciousness". Losing coherence here is a statement about this phenomenological model's
Bloch-vector length, not evidence for any interpretation of quantum mechanics, and the decoherence
rates correspond to no laboratory qubit.

**One documented property, deliberately not "fixed":** the 0.02 floor is applied only in the
decohering branch. An input below the floor with the coupling off is not raised to it. That state is
unreachable in the app (the field starts at 1 and the floor holds it), but changing the behaviour
would be changing physics rather than moving it, so it is asserted and documented instead.

## REGRESSION

**Tolerance was fixed before the assertions were written: zero.** The extraction preserves the exact
order of floating-point operations, so oracle and extracted function must produce identical
`double` values. Comparison is `toBe`, not `toBeCloseTo`. No tolerance was tuned after seeing output.

The test file keeps verbatim copies of the pre-extraction decoherence loop and measurement branch as
oracles:

- **decoherence:** 10 `dt` values (0, 1/240, 1/120, 1/60, 1/30, 0.1, 0.25, 0.5, 1, 2.5) × both
  coupling states × 101 vector lengths = **2,020 exact comparisons**;
- **measurement:** 6 states (|0⟩, |1⟩, H|0⟩, HS|0⟩, HTZ|0⟩, XH|0⟩) × 101 draws = **606 exact
  comparisons** of outcome and collapsed state.

Also asserted: the three constants match their pre-extraction values; a pure state with coupling off
does not move; `|r⃗|` decreases monotonically to exactly the floor and returns to exactly 1;
reachable states never leave [floor, 1] and never produce NaN; decay and recovery rates differ;
repeated calls interleaved with other calls give identical results (no module state); collapse lands
on a basis state with |z| = 1 and x = y = 0; the Born threshold is exact at the boundary; and a
deterministic sweep of 10,000 draws reproduces P(|0⟩) to three decimals. Source-level tests assert
the renderer imports the three functions, no longer contains `Math.max(0.02`, `dt * 0.12`,
`dt * 0.3` or the inline Born expression, and that `Math.random` appears in the renderer but not in
the model.

| Gate | Result |
| --- | --- |
| Targeted quantum tests (bloch, tunneling, double-slit, sims, physics) | 5 files / 178 tests passed |
| Frontend suite | 142 files / 1464 tests passed, 1 skipped |
| Backend suite | 271 passed, 0 failed |
| Typecheck / lint / production build / `git diff --check` | clean |
| Chromium desktop 1440×900 and mobile 390×844 | Bloch experiment loads, decoherence toggle present, toggling changes the rendered scene, in-scene pointer interaction survives, zero runtime errors |
| Full smoke desktop / mobile | 27 routes, 13 labs, 240 / 242 interactions, zero runtime errors |

**Honest limit of the browser evidence:** the numeric `|r⃗|` readout is drawn into a WebGL texture and
its narration copy sits behind the "Zapytaj" button, which is disabled without an AI key. The browser
run therefore proves the experiment renders, reacts to the decoherence toggle and survives
interaction — it does not read the number back. The numeric behaviour is proven by the 2,020-point
oracle comparison instead.

## CAPTURE / REPLAY

`stepBlochVectorLength` and `collapseByMeasurement` are pure and deterministic, so both are
fingerprintable today with the existing `core/events/hash.ts` primitives — one test does exactly that
for the measurement outcome.

Not yet captured, and not forced here. The gap is the same one the double-slit pass recorded: the
scene-capture contract is not on LIVE, and it takes a `ModelGraph` whose nodes are scalar. A Bloch
capture would additionally need a time-series representation, since `|r⃗|` is a trajectory rather than
a single value — the contract has no place for a profile. That is a contract decision, not a
refactor, and it is now blocking two extracted models rather than one.

## NEXT

One concrete gap: **the scene-capture contract cannot represent a profile or a trajectory.** The
double-slit produces `number[]` over screen position and the Bloch model produces `|r⃗|` over time;
both are pure and fingerprintable, and neither can enter capture/replay while `ModelGraph` nodes are
scalar-only. Extending the contract with a declared observable kind — scalar versus series — is the
smallest change that unblocks both, and it needs a CTO decision because it touches the capture
contract rather than any single experiment.
