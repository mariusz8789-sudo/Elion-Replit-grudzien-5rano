# Observer at the Junction — status

Vertical demonstrator on the existing Reality Navigator (`#/reality`). One renderer, one world,
one Evidence discipline. No new solver, no second engine, no AI-generated video.

## What this is

The scene already existed: a persistent 3D engine with a fixed central observer, a parameter-branch
store, a transit state machine between branches, and a ghost overlay for comparing two worlds. What
it could not do was say **what it was claiming** or **whether it could be reproduced**. A scene you
cannot re-derive is an illustration, not a result.

This sprint added exactly that spine:

```
SceneRequest → Scientific Model Graph (recomputed) → SceneCapture
             → EpistemicStatus + "what this does not prove"
             → fingerprint → Replay (MATCH / DRIFT / NOT_REPRODUCIBLE / BLOCKED)
```

`packages/frontend/src/core/reality/sceneCapture.ts` is the whole contract. It contains no physics:
every number comes from `core/modelGraph/orbitalGraph.ts`, which in turn calls the already-verified
Kepler and vis-viva functions in `core/physics.ts`. Fingerprints use the existing
`core/events/hash.ts`.

## Epistemic status

| Status | Reachable here | Meaning |
| --- | --- | --- |
| `MODEL` | yes | one variant, computed by an explicit model graph |
| `SCENARIO` | yes | two or more variants compared — counterfactual, not observation |
| `CINEMATIC` | yes | scene contains a layer with no approved solver |
| `NOT_MODELED` | yes | no model graph behind the scene |
| `BLOCKED` | yes | the scene declared a claim Genesis does not make |
| `PREDICTION`, `HYPOTHESIS`, `VERIFY_REQUIRED` | vocabulary only | needs a protocol/reference this path does not carry |
| `FACT`, `MEASUREMENT` | **never from this path** | both require a source outside the model; recomputing a graph is not one |

That last row is deliberate and test-enforced. A simulation cannot promote itself to a measurement.

### Ordering rules

1. **No model beats everything.** A scene with no graph is `NOT_MODELED`, even if it also declares a
   forbidden claim — "there is nothing to compute" is the more basic fact.
2. **A forbidden claim beats a pretty picture.** Declaring `traversable-wormhole-confirmed`,
   `fifth-spatial-dimension-observed`, `parallel-universes-exist`,
   `superposition-grants-access-to-all-realities` or `mind-reading-confirmed` yields `BLOCKED` — the
   scene is refused a scientific status, not shown with an asterisk.
3. **An unsolved visual layer caps at `CINEMATIC`.** The wormhole threshold may be rendered; it may
   not be claimed.
4. **More than one branch makes the scene `SCENARIO`** and forces the parallel-universe disclaimer
   into `doesNotProve`.

The tesseract is intentionally **not** on the unsolved list. `core/physics.ts` computes it with exact
linear algebra (4D plane rotation plus perspective projection), so a scene showing it stays `MODEL`.
What is forbidden is the *claim* that it shows a physical fifth dimension — rule 2 catches that
regardless of which layers are on.

## Time: world vs display

`TIME_SCALES` maps one display second to 1 s / 1 hour / 1 day / 1 year / 1 century of world time.
World time is **computed**, not fast-forwarded: the model has no idea how fast the screen draws.
Changing the scale changes the scene fingerprint, so "the same scene at a different time scale" is a
different capture and replays as such.

## Replay honesty

`replaySceneCapture` recomputes the graph from the stored parameter snapshot and compares structure,
status and every observable. It never reads back a stored answer.

The fingerprint deliberately excludes branch id, branch label and `createdAt`. `branches.ts` mints
ids from a module counter and stamps `Date.now()`, so including them would make two physically
identical configurations fingerprint differently and report `DRIFT` with nothing actually different.
The fingerprint covers only what drives the result.

Differences are reported with the node name and **both** values, so `DRIFT` says what moved rather
than merely that something did.

## Verified in the browser

Production build, Chromium, desktop (1440×900) and mobile (390×844), identical results:

| Step | Result |
| --- | --- |
| Capture the default scene | `MODEL` |
| Replay it | `MATCH` |
| Enable the "threshold/bridge" layer, re-capture | `CINEMATIC` |
| Capture at `1 s = 1 century` vs `1 s = 1 year` | `state_7fe62070` vs `state_bd769a1d` |
| "What this does not prove" lines rendered | 3 |
| ErrorBoundary / runtime errors | none |

Screenshots: `screenshots/observer-junction-desktop.png`, `screenshots/observer-junction-mobile.png`.

## Scientific limits

This demonstrator does **not**:

- show parallel universes. Branches are variants of one model's parameters, compared side by side.
- model a traversable wormhole. There is no approved GR solver behind the threshold layer; it is
  scenery, and the status says so.
- observe a fifth spatial dimension. The tesseract is a 4D→3D projection of a mathematical object.
- claim superposition grants access to other realities.
- produce a measurement. Every number is a model output under stated assumptions (circular orbit,
  e = 0, point masses).

## Known gap, not worked around

The double-slit |ψ|² lives as a **private method on a renderer class** in `labs/quantum.ts`, so the
required "superposition with and without measurement" assertion cannot be written against it without
refactoring a file that is under active edit elsewhere. The model is correct — it is the packaging
that is untestable: a scientific model encapsulated inside a renderer cannot be tested, fingerprinted,
captured or replayed. Extracting it to a pure exported function is the next smallest step, and it is
a coordination question, not a technical one.
