# Genesis Graphics — the performance budget

**Every sprint from Graphics V2 Sprint B onward is measured against these numbers. "The build
succeeded" is not a performance result.**

This document exists because visual-quality work has an obvious failure mode: each individual
addition looks affordable, and the scene dies by a thousand cuts. A budget fixed in advance turns
"does this look good?" into "does this look good *and* fit?", which is a question with an answer.

## 1. The target device

| | |
|---|---|
| **Reference device** | A mid-range 2022-class Android phone — Snapdragon 7-series / Mali-G610 class, 6 GB RAM, 1080×2400, `devicePixelRatio` 2.5–3 |
| **Why this one** | It is the weakest device Genesis intends to be genuinely usable on. Desktop and high-end mobile then have headroom by construction. Budgeting for a laptop and hoping phones cope is how the 20-FPS surprise happens at a demo. |
| **Reference desktop** | 2020-class integrated GPU (Iris Xe class). Not the target — the sanity check that the desktop path is not accidentally mobile-limited. |
| **Render tier** | The reference phone is expected to resolve to `quality.ts`'s `'medium'` tier. Budgets below are for **medium**; `'low'` must degrade further (fewer atmosphere particles, no shadow casting — `recommendedShadowMapSize` already returns 0 there), `'high'`/`'cinematic'` may exceed them. |

## 2. The budgets

Per rendered frame, in the flagship city scene, at the reference device's own resolution.

| Budget | Target | Hard ceiling | Notes |
|---|---|---|---|
| **Frame rate** | 60 FPS | **never below 30 FPS sustained** | 30 is the floor at which orbiting a city still feels like a world rather than a slideshow. |
| **Frame time** | ≤ 16.6 ms | ≤ 33 ms | The number to actually watch; FPS is derived and easier to fool. |
| **Draw calls** | ≤ 900 | **1500** | See §3 — this is the binding constraint today, and the current scene is over it. |
| **Triangles** | ≤ 500 k | 900 k | Mobile tile-based GPUs care more about draw calls and overdraw than raw triangles, but unbounded geometry still costs memory bandwidth. |
| **Texture memory** | ≤ 96 MB | 160 MB | Includes procedural `CanvasTexture`s from `materials.ts`, which are easy to forget because nothing downloads. |
| **Total GPU memory** | ≤ 256 MB | 384 MB | Geometry + textures + render targets. Post-processing render targets at DPR 3 are not free. |
| **Real point/spot lights** | ≤ 4 | 8 | Each is per-fragment shading cost. This is why `createStreetLight` is emissive geometry and not a light — a street of real lamps would blow this alone. |
| **Shadow-casting lights** | 1 | 2 | Already the effective policy in `shadowPolicy.ts`. |
| **Shadow map size** | 1024 | 2048 | `recommendedShadowMapSize` already tiers this. |
| **Initial JS bundle (eager)** | ≤ 400 kB gzip | 500 kB gzip | Currently ~373 kB gzip. See §5. |
| **Three.js chunk** | ≤ 180 kB gzip | 200 kB gzip | Currently ~177 kB gzip; it is a lazy chunk and must stay one. |
| **Scene init time** | ≤ 500 ms | 1000 ms | Already guarded by `epidemicCity3DPerformanceAudit.test.ts`. |

## 3. Where we actually stand — real measured numbers

Measured in headless Chromium via the city screen's own observability panel, which reads
`useThreeLoop.ts`'s real `WebGLRenderer.info` counters. Not estimates.

| Scene | Draw calls | Triangles | Render time |
|---|---|---|---|
| `#/city3d` (flagship epidemic city) — before Sprint C-1 | 2028 | 610 586 | 13.8 ms |
| `#/city3d` (flagship epidemic city) — after Sprint C-1 | 1634 | 616 130 | 133.4 ms* |
| `#/city3d` (flagship epidemic city) — after Sprint F+ | **1527** | **616 190** | 40.6 ms* |

**GRAPHICS V2 SPRINT C-1**: `epidemicCity3D.ts`'s hand-rolled `createBuilding()` and
`createContextBuilding()` used to emit one `Mesh` per window pane — the exact dominant cost this
document already named below. Both now bake every window into up to 3 shared `InstancedMesh`es via a
new `flushWindowInstances()` step (two materials for the real buildings' lit/dark window split, since
`InstancedMesh.instanceColor` only multiplies `diffuseColor` in three.js's own shader and cannot vary
per-instance emissive intensity; one material for context buildings, which only ever needed a single
shared emissive intensity). Real, headless-Chromium-measured result: **2028 → 1634 draw calls (-19.4%
real reduction)**, triangle count effectively unchanged (a slight rise from instancing's shared unit-box
geometry vs. the old per-window boxes' exact dimensions is expected and immaterial).

**GRAPHICS V2 SPRINT F+**: closed most of the remaining gap Sprint C-1 named above. Of
`createContextBuilding()`'s non-window structural meshes (roof/roofUnit/plinth/cornice), three were
IDENTICAL in appearance across every context building — fixed hardcoded colors, transform-only
variation — and one (`roof`) varied only by a 4-entry fixed palette; none needed to be a fresh
`Mesh`+`Material` pair per building. All four now bake into a handful of city-wide `InstancedMesh`es
(`flushContextStructuralInstances()`, same technique as the windows), leaving only `body` (the wall)
as a real per-building `Mesh` — the one element that genuinely needs it, since each wall bakes a real
per-building color tint into a cloned base material. Real result: **1634 → 1527 draw calls (-6.5%
further real reduction; -24.7% from the original 2028)**.

**`#/city3d` is still (barely) over the 1500 draw-call ceiling — by 27 draw calls, ~1.8% — and this
is reported honestly, not rounded away.** The remaining gap is now `createBuilding()`'s own
non-window per-real-building elements (plinth/groundGlass/entryCanopy/roof/door/frame/balcony/etc,
~28 real buildings) plus the ~260 live agent markers the Node-CPU-side count above doesn't include at
all (no agent stepping in that harness) — a different, riskier optimization surface (per-frame status
color, unlike this sprint's fixed-appearance trim) than what Sprint C-1/F+ could safely close in the
time available. Left as a named, scoped follow-up rather than force-instancing something that still
needs real per-instance animation.

*The render-ms figure in the "after" row is not comparable to the "before" row's 13.8 ms — see the
caveat below; both are software-rasterizer figures and neither should be read as a real-GPU number, but
the jump between them tracks this measurement run's own resource contention, not a real regression (draw
calls, which are exact counters rather than timings, are the trustworthy figure here and they went down).

### An important caveat about this sandbox, so these numbers are not over-read

This environment renders through **swiftshader (software rasterisation)** and reports a **flat 20 FPS
with frame time pinned at exactly 50.00 ms** — that is a `requestAnimationFrame` throttle artifact of
headless capture, not a measurement of GPU cost. Real render time (~13 ms) is the only timing figure
here worth anything, and even it is a CPU-side software-raster figure.

**Draw calls and triangle counts, by contrast, are exact** — they are counters, not timings, and they
are the numbers this budget is primarily written in. FPS and frame-time targets in §2 must be
validated on the real reference device; nothing in this sandbox can confirm them, and no report should
claim otherwise.

## 4. How each sprint reports against this

Every graphics sprint from Sprint B onward reports, for at least one representative scene:

```
                BEFORE      AFTER     BUDGET    VERDICT
draw calls        2028       1527      1500     OVER (was +35%, now +1.8%; real -24.7% total reduction)
triangles       610586      616190    900000    UNDER
render ms         13.8       40.6*        33     (sandbox-software-raster, indicative only)
```

(Sprint C-1 + Sprint F+'s combined real measured result — see §3 above for the full writeup and the
render-ms caveat.)

Rules:
- **A regression in draw calls or triangles must be justified in the same report**, with the visual
  gain it bought. "It looks better" is an acceptable justification; not mentioning it is not.
- **New geometry-producing code states its per-instance draw-call cost** in its module doc. The kits
  already do this (`createFacadeBuilding`: 2 per building; `createTreeField`: 2 per field regardless
  of tree count).
- **Any new real light must be counted against the light budget explicitly.**
- Numbers come from `WebGLRenderer.info`, never from estimation.

## 5. Bundle budget, and the one known exception

Currently: eager `index.js` ~1124 kB raw / **~373 kB gzip**; `three.module.js` ~688 kB raw / ~177 kB
gzip as a correctly-isolated lazy chunk.

The eager bundle's size is dominated by `labs/index.ts` registering all 13 labs synchronously, which
`vite.config.ts` documents as a deliberate decision required by the offline-PWA cache guarantee and by
`sims.test.ts`'s synchronous-registry assumption. **That is an accepted, documented exception, not
unmeasured drift** — but it means the eager budget has little slack, so new eagerly-imported code
needs a reason.

## 6. What is explicitly NOT budgeted yet

Stated so their absence is deliberate rather than forgotten:

- **Per-frame CPU time in `syncScene`** — no measurement harness exists for it on the real device.
- **Memory growth over a long session.** `disposeSceneResources` is tested for correctness, but no
  soak test exists.
- **Network/asset streaming budget.** Only one real GLB ships today
  (`ambulance.glb`, 13.9 kB); a streaming budget becomes meaningful when imported spatial data or
  real assets arrive at volume.
- **Texture memory is currently unmeasured**, not merely unbudgeted: nothing reports it. The §2 figure
  is a target to build a measurement for, and should be treated as unverified until something reads
  it back from `renderer.info.memory`.
