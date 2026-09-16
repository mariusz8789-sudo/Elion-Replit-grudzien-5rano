# Live Matrix Background — Evidence Field

Procedural, seeded background for a scientific command-center look: slowly
rising nodes on three depth layers, thin links between neighbours (a
provenance lattice) and sparse 8-hex "fingerprint" tags. Canvas 2D, no images,
no video, no DOM-per-node, no external libraries.

**D-117:** this renderer replaced the earlier "digital rain" (falling katakana
columns). The rain said nothing about Genesis; the evidence field uses the
product's own visual vocabulary — stage fingerprints, custody hashes, evidence
graphs. The public engine API (`buildStreams`/`updateStreams`/`renderFrame`/
`renderStatic`, the config vocabulary, the quality tiers, the determinism
contract) is unchanged, so the controller and the React adapter did not move.
The tags are pure hashes of a node seed — never a real fingerprint of anything.

**Status: integrated.** `App.tsx` mounts it through `genesisVisualState.ts`
only; nothing under this directory imports Genesis. Both facts are enforced by
`src/__tests__/liveMatrixBoundary.test.tsx`, not by convention.

## Layout

```
matrixEngine.ts        pure functions: seeded node layout, drift/respawn, link selection, render. No React, no DOM, no globals.
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
// Future integration, when it is decided — the adapter, not the component, meets Genesis.
import { toMatrixConfig, type GenesisVisualState } from './genesisVisualState';
<LiveMatrixBackground {...toMatrixConfig({ activity: 'RUNNING', intensity: 0.6 })} />
```

Imperative handle: `setActivityLevel()`, `setQuality()`, `getTelemetry()`.

## Accessibility

`prefers-reduced-motion` is honoured, and an explicit `reducedMotion` prop
overrides the OS setting in both directions. In reduced motion the component
composes **one static frame** — the full lattice with links, nodes and tags,
glow kept, layout unchanged — and starts **no animation loop at all** (asserted
by `framesRendered === 0`, not inferred).

## Telemetry

`getTelemetry()` reports the renderer's own measurements. `fps`, `frameTimeMs`
and `renderTimeMs` are `null` until genuinely measured, and go back to `null`
when the loop stops — a paused renderer reports "not measured", never a
comforting 60.

## Measured performance

**These figures were measured for the previous (digital rain) renderer and are
kept only as the harness description. The evidence field draws ~100 discs and
~150 one-pixel lines per frame at 1920×1080 — a lighter command stream than
~170 glyph columns — but it has NOT been re-measured on a GPU browser; re-run
the harness before quoting any number below for the current renderer.**

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

- Afterglow fade keeps state in the canvas bitmap, so a resize rebuilds the
  field and clears the trails. Deliberate, and deterministic from the seed.
- Determinism covers layout, tags and link selection, not frame timing.
- Link selection is O(n²) per frame over ~100 nodes — well under a
  millisecond — so there is no spatial index to keep in sync on resize.
- No WebGL fallback. Canvas 2D is sufficient at these densities on the measured
  configurations; WebGL would be a separate decision with its own evidence.
