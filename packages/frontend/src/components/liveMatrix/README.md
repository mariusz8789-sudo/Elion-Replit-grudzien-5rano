# Live Matrix Background

Procedural, seeded "data field" background for a scientific command-center look.
Canvas 2D, no images, no video, no DOM-per-glyph, no external libraries.

**Status: INTEGRATED.** `App.tsx` mounts one persistent instance for the
app's whole lifetime, configured via `genesisVisualState.ts`'s `toMatrixConfig`
adapter fed by `core/genesisMatrixPolicy.ts` (route + `hasActiveSim()` → visual
tier — see that file). Nothing under THIS directory imports Genesis — the
dependency still runs one way, App.tsx → adapter → this component, never the
reverse; enforced by `src/__tests__/liveMatrixBoundary.test.tsx`, not by
convention.

## Layout

```
matrixEngine.ts        pure functions: seeded layout, update, render. No React, no DOM, no globals.
matrixController.ts    animation lifecycle over an injected `MatrixHost`. No React.
LiveMatrixBackground.tsx  thin React adapter: canvas, ResizeObserver, matchMedia, visibilitychange.
genesisVisualState.ts  the Genesis → visual contract. Types and one pure mapping function only.
```

The dependency arrow is one-way and deliberate:

```
Genesis → VisualStateAdapter → LiveMatrixBackground → Canvas
```

## Why a controller instead of hooks

This repository has **no jsdom and no @testing-library**, and vitest runs on
`node`. Lifecycle logic held inside a React component would therefore be
untestable here — and the lifecycle is exactly where the real defects live
(duplicate rAF loops, stale closures, cleanup, resize races). So the lifecycle
lives in `MatrixController` behind an injected host, and 37 lifecycle tests run
in plain Node with a fake host that hands frame timing to the test.

## Configuration: one source of truth

`MatrixController.input` is the only config state. Props and the imperative API
both write into it, **last write wins**, and props write only fields that
actually changed since the previous render. So:

- a re-render with unchanged props never clobbers `setActivityLevel(3)`;
- a genuinely changed `activity` prop still takes effect;
- there is no permanent "override" layer shadowing props, and no `useMemo`
  object whose identity decides whether the engine rebuilds.

## Usage

```tsx
<LiveMatrixBackground activity={1} density="MEDIUM" glow="MEDIUM" quality="HIGH" seed={1337} />
```

```ts
// The real integration (App.tsx) — the adapter, not the component, meets Genesis.
import { toMatrixConfig, type GenesisVisualState } from './genesisVisualState';
<LiveMatrixBackground {...toMatrixConfig({ activity: 'RUNNING', intensity: 0.6 })} />
```

Imperative handle: `setActivityLevel()`, `setQuality()`, `getTelemetry()`.

## Accessibility

`prefers-reduced-motion` is honoured, and an explicit `reducedMotion` prop
overrides the OS setting in both directions. In reduced motion the component
composes **one static frame** — full columns with gradient falloff, glow kept,
layout unchanged — and starts **no animation loop at all** (asserted by
`framesRendered === 0`, not inferred).

## Telemetry

`getTelemetry()` reports the renderer's own measurements. `fps`, `frameTimeMs`
and `renderTimeMs` are `null` until genuinely measured, and go back to `null`
when the loop stops — a paused renderer reports "not measured", never a
comforting 60.

## Measured performance

Headless Chromium (SwiftShader **software** rasterization), 3–4 s per scenario,
`activity=RUNNING`:

| Scenario | FPS | streams | backing store |
|---|---|---|---|
| 1440×900 HIGH @DPR1 | 59 | 128 | 1440×900 |
| 1920×1080 HIGH @DPR1 | 60 | 171 | 1920×1080 |
| 1920×1080 HIGH @DPR2 | 58.5 | 171 | 3840×2160 |
| 1920×1080 HIGH @DPR2, density HIGH | 60 | 274 | 3840×2160 |
| 1920×1080 MEDIUM @DPR1.75 | 59.8 | 137 | 3360×1890 |
| 1920×1080 LOW @DPR1.25 (no glow) | 60 | 94 | 2400×1350 |
| 390×844 mobile HIGH @DPR2 | 60 | 34 | 780×1688 |

**What these numbers are, precisely.** FPS is end-to-end frame pacing, so it
does include rasterization and compositing. The separately reported
`renderTimeMs` (0.2–1.2 ms) measures only the **JavaScript command-recording**
time inside `renderFrame` — a controlled glow-on/glow-off A/B over an identical
field came back 0.4 ms vs 0.5 ms, which is not a claim that `shadowBlur` is
free, but evidence that its cost lands in the rasterizer, after the JS call
returns. Software rasterization also makes these figures conservative relative
to a GPU-composited desktop browser rather than representative of it.

**Not measured:** a real GPU-accelerated desktop browser, a real mobile device,
and battery/thermal behaviour over long sessions. Re-run with the harness
described in the repository history, or profile in a real browser, before
claiming anything about those.

## Known limitations

- Trail fade keeps state in the canvas bitmap, so a resize rebuilds the field
  and clears the trail. Deliberate, and deterministic from the seed.
- Determinism covers layout and glyph selection, not frame timing.
- No WebGL fallback. Canvas 2D is sufficient at these densities on the measured
  configurations; WebGL would be a separate decision with its own evidence.
