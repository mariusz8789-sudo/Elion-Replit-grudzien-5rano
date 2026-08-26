# Earthquake Demo Execution Envelope

**Status:** synthetic, `SCENARIO`-only and non-operational.
**Owner:** domain execution only. Explicit coordinate mapping, overlay eligibility and City3D display remain outside this module.

## Purpose

`buildEarthquakeDemoEnvelope()` is the sole upstream path used by the Earthquake Command Center for one existing synthetic scenario. It sequences existing contracts; it does not calculate new science, invent provenance, or render a city.

```text
validated synthetic spec
  → existing Earthquake runner
  → immutable HazardProvenanceStore persistence
  → registered module compatibility fence
  → existing Evidence Pack
  → canonical replay MATCH gate
  → existing pure Earthquake projection
  → READY envelope

READY envelope only
  → explicit fixture-to-CityWorld display mapping
  → scenario overlay gate
  → one existing read-only City3D overlay
```

## Contract

`READY` carries the actual immutable scenario result, completed run, registered descriptor, evidence pack, canonical replay report, pure projection, provenance identifiers/fingerprints and the source `NOT_MODELED` list. It is the only envelope state eligible for display mapping.

`BLOCKED` carries a stable block code and actual reason. Its projection is `null`; consumers must clear or withhold any overlay rather than treating a partial result as display-safe.

| Block code | Real trigger | Display consequence |
|---|---|---|
| `INVALID_SCENARIO_SPEC` | Existing semantic scenario validation rejects the supplied synthetic input. | No run, replay, projection, mapping or overlay. |
| `PROVENANCE_CONFLICT` | Existing immutable store finds different canonical content under the deterministic record ID. | No projection mapping or overlay. |
| `REGISTRY_INCOMPATIBLE` | Registered type, input/run linkage, module version or projection schema admission fails. | No projection mapping or overlay. |
| `EVIDENCE_INCOMPLETE` | Existing evidence admission reports one or more missing required paths. | No projection mapping or overlay. |
| `REPLAY_NOT_MATCH` | Canonical replay verdict is not `MATCH`, including real drift. | No projection mapping or overlay. |

## Store and determinism policy

The envelope defaults to `InMemoryHazardProvenanceStore` only for isolated domain/tests. The live Command Center explicitly injects `LocalHazardProvenanceStore`, so real artifact/input/run records remain available to canonical replay across a browser refresh.

With separate stores, an identical spec and code commit produce the same scientific fingerprints and projection values. Wall-clock provenance timestamps are intentionally not treated as scientific determinism. Reusing the same scenario label with different canonical content in one immutable store is an honest `PROVENANCE_CONFLICT`, never a silent overwrite.

## Boundaries

The envelope imports no React, Three.js, City3D renderer, CityWorld, routing, Hospital Model, EpidemicCitySimulation, Discovery Engine, GIS, GeoJSON, live provider, cascade engine or second hazard solver. It does not claim observations, calibration, real geography, casualties, structural damage, evacuation, infrastructure effects, forecast or operational guidance.
