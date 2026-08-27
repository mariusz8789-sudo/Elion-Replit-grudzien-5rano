# Phase 3/4 — Genesis Evolution / Spacetime Navigator

**Status:** PARKED SPECIFICATION  
**Source of truth:** LIVE Genesis code and verified model contracts remain authoritative.

## Product definition

Genesis is a **Scientific Discovery OS**, not a time machine and not a game. The Navigator is a future layer for exploring the evolution of a modeled world and comparing explicit scenarios. It may only display results produced by an admitted model, with provenance, assumptions, uncertainty and replay status visible at the point of use.

> Genesis allows users to explore modeled world evolution over time and compare alternative scenarios from explicit assumptions. It does not claim to know the future.

## Epistemic time modes

| Mode | Meaning | Required UI treatment |
|---|---|---|
| `HISTORY` | Historical or observationally supported data | Source, date, coverage, license and provenance are visible |
| `MODELLED_FUTURE` | A bounded projection from an admitted model and explicit assumptions | Model identity, horizon, uncertainty and limitations are visible |
| `SPECULATIVE` | A hypothetical “what if” scenario | Strong label, assumptions and no Evidence claim unless a real model was executed |

A year such as 2222 is never a prediction by itself. A future view without a validated model must remain `SPECULATIVE` or `NOT_MODELED`.

## Practical dimensions

**4D** means `X + Y + Z + T`: a spatial world observed at a model-defined time coordinate. A time slider is permitted only when the underlying model can replay or evaluate that time coordinate deterministically.

**5D** means `X + Y + Z + T + SCENARIO`: a parameter/scenario space. It is not a claim of a physical fifth dimension. A comparison must run two explicit compatible scenarios and show their parameter differences, provenance and replay outcomes.

## Future UX functions

| Function | Intended behavior | Admission gate |
|---|---|---|
| Uncertainty rendering | Low-confidence or high-uncertainty projections appear as deliberately unstable holographic/point-cloud layers | Confidence must come from the model or data contract; visual blur may not invent a confidence score |
| Causal intervention | Pause a modeled run, create a named variant, change an allowed parameter, and execute a second run | Explicit baseline/variant protocol, same model identity, compatible units and deterministic provenance |
| Reverse provenance scrubbing | Select a modeled consequence and trace it to an upstream event or parameter | A causal graph and evidence references must exist; no inferred cause from visual proximity |
| Asset resilience timelapse | Evaluate approved asset records across an admitted hazard/climate model | Licensed asset data, timestamped inputs, uncertainty, access control and reportable evidence |

## Visual direction: Genesis Observatory

The visual language may combine **90s scientific-computing instrumentation**, cinematic deep-space scale and tactile control-room materials: dark observatory surfaces, cyan instrument light, amber caution signals, phosphor-like status rails, star-field depth, wireframe geometry, scanline texture and high-contrast telemetry. This is an original Genesis design system.

The direction must not copy franchise names, logos, characters, plot devices, exact interface layouts, title treatments, sound design or recognizable props from any film or series. References to 1990s sliders, interstellar exploration and portal mythology are mood references only. The product must read as a credible scientific command console, not as a replica or promotional imitation.

The strong visual treatment must remain subordinate to truthfulness:

| Visual element | Allowed meaning | Forbidden meaning |
|---|---|---|
| Cyan `REAL RUN` rail | A verified local or backend run exists | Certainty about the real world |
| Amber `ASSUMPTION` rail | A declared model assumption | A warning hidden from the user |
| Blurred/pulsing future layer | Uncertainty supplied by an admitted model | A fabricated probability or confidence score |
| Split-screen A/B | Two executed compatible runs | Two decorative imagined futures |
| Timeline scrub | A replayable/evaluable model coordinate | A claim that Genesis predicts 2222 |

## Current execution boundary

This document does **not** authorize time sliders, split-screen worlds, new renderers, branching engines, causal graphs or asset uploads in the current LIVE sprint. The immediate priority remains:

`Science Chat → Structured Request → Capability Check → existing model/solver → result → one visualization/lab/world → provenance → Evidence → Replay`.

The current City3D visual refresh may use the Genesis Observatory visual language for existing real runs and explicit `NOT_MODELED` states. It must not imply that a future Navigator is already connected.

## Readiness checklist

Before implementation begins, a Navigator milestone must provide a model contract, time-coordinate semantics, parameter schema, uncertainty semantics, compatible baseline/variant protocol, deterministic replay strategy, provenance/export format, single-renderer integration plan, mobile fallback, tests, Chromium proof, production build and green CI.
