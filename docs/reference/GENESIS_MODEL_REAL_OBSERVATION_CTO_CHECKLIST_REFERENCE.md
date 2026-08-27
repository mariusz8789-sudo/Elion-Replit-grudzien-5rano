# Genesis — Model ↔ Real Observation CTO Review Checklist

**Purpose:** evaluate a future Perplexity candidate without prematurely implementing an adapter, solver or instrument integration.

## Admission rule

A candidate is eligible for `BUILD NOW` only when an existing Genesis model **predicts** an observable that the real observation can falsify. Injecting the observed value into a model input and reading downstream calculations is parameterization, not validation.

## Required evidence

| Gate | Required evidence | Failure status |
|---|---|---|
| Model identity | Existing file, model ID, version and executable path | `VERIFY_REQUIRED` |
| Observable direction | Model output is the quantity compared to data; it is not an input | `REJECT` or `BUILD LATER` |
| Real source | Official/public source with exact URL, dataset/version and license | `VERIFY_REQUIRED` |
| Semantics | Clear definition of what is measured or estimated | `BLOCKED` |
| Units | Source unit, normalized unit and pinned transform | `BLOCKED` |
| Time/space scope | Timestamp, window, location and aggregation semantics | `BLOCKED` |
| Raw preservation | Exact raw artifact with SHA-256 | `VERIFY_REQUIRED` |
| Quality | Approval, uncertainty, qualifier and provisional/revision policy | `VERIFY_REQUIRED` |
| Boundary conditions | Model assumptions match the observation context | `REJECT` if incompatible |
| Reference/ground truth | Measurement or authoritative reference, not another unvalidated calculation | `BUILD LATER` if absent |
| Tolerance | Preregistered, bidirectional and scientifically justified | `BLOCKED` |
| Provenance | Source, transform, model, version and environment recorded | `BLOCKED` |
| Replay | Pinned artifact only; no network refetch; tamper detection | `BLOCKED` |
| Negative tests | Payload/source/unit/time/transform changes produce DRIFT/BLOCKED | `BLOCKED` |
| Product boundary | No unsupported scientific claim in UI or report | `REJECT` until corrected |

## Status vocabulary

`EXISTS` means an artifact or source is present. `MODEL_AVAILABLE` means a model descriptor or local implementation exists. `CONNECTED` requires a real executable path and proof. `FULLY_CONNECTED` requires the complete tested workflow. `VERIFY_REQUIRED` means evidence is incomplete. `PARTIAL` means only some contract or workflow layers are connected. `BUILD LATER` is used when the direction is valid but admission evidence or compatibility is incomplete. `PARKED` means intentionally deferred. `BLOCKED` means a required gate cannot pass. `REJECT` means the proposed model–observation mapping is scientifically invalid under current assumptions.

## Candidate decision template

For each candidate, record:

1. Existing Genesis model and exact predicted observable.
2. Real source, raw artifact, license and retrieval context.
3. Source semantics, units, quality, uncertainty and temporal/spatial scope.
4. Model assumptions, boundary conditions and validity range.
5. Prediction versus observation directionality.
6. Preregistered comparison metric and tolerance.
7. Evidence Pack fields and pinned replay policy.
8. Negative tests for payload, source identity, units, time window and transform version.
9. What is already implemented versus what requires a new change.
10. Decision: `BUILD NOW`, `BUILD LATER`, `PARK`, `REJECT` or `VERIFY_REQUIRED`.

## Current Genesis hold

The USGS `00060` discharge fixture is preserved and replayable, but the current `water-pump-pipe` model takes `volumetricFlow` as a closed-pipe design input and does not predict river discharge. It remains `PARTIALLY COMPATIBLE — BUILD LATER`; this checklist does not authorize a live USGS adapter.

The computational E2E remains the regression gate:

> Science Chat → Protocol/A-B → real backend → Evidence → Scientific Memory → explicit Replay → MATCH/DRIFT/BLOCKED.

No new solver, domain, instrument connector or live provider is admitted by this document.
