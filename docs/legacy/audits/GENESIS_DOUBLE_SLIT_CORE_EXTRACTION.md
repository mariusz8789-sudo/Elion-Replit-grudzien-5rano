# Double-slit — extraction of the |ψ|² model into Scientific Core

Small, clean extraction pass. No new model, no new renderer, no new equation, no new Evidence or
Replay system, no large refactor.

## DONE

| File | Change |
| --- | --- |
| `packages/frontend/src/core/physics.ts` | **added** `DoubleSlitConfig`, `doubleSlitProbabilityDensity()`, `doubleSlitProfile()`, and the four model constants |
| `packages/frontend/src/labs/quantum.ts` | **removed** the private `prob()` method; the renderer now calls the core function and keeps only the sampler |
| `packages/frontend/src/__tests__/doubleSlitModel.test.ts` | **added** — 20 tests |
| `screenshots/double-slit-desktop.png`, `screenshots/double-slit-mobile.png` | Chromium evidence |

Extracted API:

```ts
export interface DoubleSlitConfig { wavelength: number; slitDistance: number; measured: boolean }

export const DOUBLE_SLIT_WIDTH = 0.35;
export const DOUBLE_SLIT_WAVENUMBER_SCALE = 5200;
export const DOUBLE_SLIT_MEASURED_OFFSET_SCALE = 0.02;
export const DOUBLE_SLIT_PHASE_SCALE = 0.06;

export function doubleSlitProbabilityDensity(u: number, config: DoubleSlitConfig): number;
export function doubleSlitProfile(config: DoubleSlitConfig, samples: number): number[];
```

Both are pure and deterministic: no DOM, no Three.js, no `Date.now()`, no randomness, no module
state. `doubleSlitProfile` adds no physics — it evaluates the same function on a uniform grid, which
is what turns a point query into something that can be hashed and compared.

### Forensic result

Exactly **one** site computed |ψ|²: the private method `DoubleSlitSim.prob(u, p)`, called from
exactly one place, `sample()`. `narrate()` reads `lambda`, `slitDist` and `measured` for prose only —
no second copy of the formula. `render()` normalises the 96-bin histogram by its own maximum for
display; that is presentation, not physics, and it was left alone.

Inputs were `p.lambda` (400–700), `p.slitDist` (4–20), `p.measured` (boolean) plus four inline
constants. Output is a dimensionless relative density at screen position `u ∈ (−1, 1)`, unnormalised
over the interval but bounded by 1 — which is what lets the renderer use it directly as the
acceptance probability in rejection sampling.

### What stayed in the renderer

The **sampler**. `sample()` still draws `u = Math.random()·2 − 1` and accepts with probability
`doubleSlitProbabilityDensity(u, config)`, up to 60 attempts, falling back to `0`. Randomness belongs
to the renderer precisely so the model function can stay deterministic. Moving the sampler into core
would have carried `Math.random()` into Scientific Core for no benefit.

## SCIENCE

`|ψ|²(u)` is the probability density of detecting one particle at position `u` on the screen, in the
Quantum Lab's visual units.

- **Without a which-way detector:** a single-slit envelope `sinc²(k·a·u)` modulated by the
  interference factor `cos²(k·d·0.06·u)`. Each particle interferes with itself; the fringe pattern
  emerges from many single detections.
- **With a which-way detector:** the interference term is gone and the density becomes
  `½·sinc²(k·a·(u+off)) + ½·sinc²(k·a·(u−off))` — the sum of two displaced envelopes, which is what
  you get once which-way information exists.

The distinction between the two states is explicit in the type (`measured: boolean`) and is asserted
by test, not implied by a comment.

**Status: `MODEL`.** Not `MEASUREMENT`, not `FACT`. Units are conventional visual units, the screen
is one-dimensional, the slit width is a model constant, and the result corresponds to no particular
laboratory apparatus.

**What this does not prove.** It does not demonstrate parallel universes and carries no many-worlds
interpretation. Losing interference under measurement is a statement about this model's distribution,
not evidence for any particular interpretation of quantum mechanics. The values are not a measurement
of any real experiment; the physical experiments the lab's narration cites (electrons, large
molecules) are external results, not outputs of this code.

## REPLAY

**Fingerprintable: yes, now.** `doubleSlitProfile` gives a deterministic array which the existing
`core/events/hash.ts` primitives (`canonicalJson`, `fnv1a`) hash directly. Tests prove the same
config yields the same digest, that changing wavelength, slit distance or `measured` changes it, and
that the digest is stable across interleaved calls with other configurations — so there is no hidden
state.

**Capturable / replayable: not yet on LIVE, and this pass did not force it.** The scene-capture
contract (`SceneRequest → SceneCapture → replay verdict`) lives on branch
`claude/observer-junction-scene` and has not been merged. Two things would be needed and neither
belongs in an extraction pass:

1. That contract takes a `ModelGraph`. `ModelGraph` nodes are scalar (`compute: (inputs) => number`),
   while the double-slit result is a profile. Exposing it as a graph would require choosing scalar
   observables — fringe visibility, fringe spacing, central intensity. **Those are physics-content
   decisions, not refactoring**, and inventing them here would have added new quantities under the
   cover of a move. That needs its own admission.
2. Until then the model is fingerprintable but not wired into a capture/replay path.

The gap is now one adapter wide instead of a locked door: the function is pure, exported and hashed.

## REGRESSION

**Old vs new — proven by execution, not by reading.** The test file keeps a verbatim copy of the
pre-extraction `DoubleSlitSim.prob()` as an oracle and compares it against the extracted function
across the full UI parameter range — 9 wavelengths × 9 slit distances × both measurement states ×
401 screen positions = **64,962 comparisons, asserted with `toBe`, exact equality, no tolerance**.
All pass. The `b === 0` sinc singularity is checked separately, and the four constants are asserted
against their pre-extraction values.

The oracle copy exists only in the test. A separate test reads `labs/quantum.ts` as source and
asserts that the renderer imports from `core/physics`, and that `5200 /`, `Math.sin(b)/b` and
`private prob(` are all gone — one implementation in production, enforced.

| Gate | Result |
| --- | --- |
| Targeted quantum + physics + sims tests | 9 files / 200 tests passed |
| Frontend suite | 141 files / 1458 tests passed, 1 skipped |
| Backend suite | 271 passed, 0 failed |
| Typecheck | clean |
| Lint | clean |
| Production build | ✓ |
| `git diff --check` | clean |
| Chromium desktop 1440×900 | canvas found, pattern accumulating over time, which-way toggle changes the pattern, zero runtime errors |
| Chromium mobile 390×844 | same, zero runtime errors |
| Full smoke desktop / mobile | 27 routes, 13 labs, 240 / 242 interactions, zero runtime errors |

The browser check reads the detection screen's pixel rows directly: the profile changes between two
samples 3.5 s apart (the sampler is running against the extracted function), and it changes again
when the which-way detector is toggled (the `measured` branch is reached through the real UI).

## PARTIAL

- Capture/replay integration — see REPLAY above. Fingerprintable, not yet captured.
- The other five quantum experiments (tunneling, Bloch, CHSH, teleportation, photon consequence,
  Kitaev) were not touched. Whether any of them also hide a model inside a renderer was not audited
  in this pass.

## BLOCKED

Nothing blocked this extraction. The pre-existing G3 Atom-Bohr A4 token guard still fails in CI on
every branch including LIVE; it is unrelated and untouched.

## NEXT

One technical gap: **audit the remaining five Quantum Lab experiments for the same pattern** — a
scientific model living as a private method or closure inside a renderer class. `quantum-tunneling`
is the most likely candidate, since its split-step Fourier evolution is a real numerical method that
should be testable and fingerprintable on the same terms as the double-slit now is.
