# Dataset governance registry

## Status

Genesis now has a small, domain-neutral **dry dataset-governance registry** at `packages/frontend/src/core/hazard/datasetRegistry.ts`. It is not a source adapter, cache, downloader, GIS subsystem, hazard solver, City3D input, or evidence store. Its single current entry describes only a future candidate source and is permanently in `DRY_METADATA_ONLY` / `REVIEW_REQUIRED` / `NOT_IMPLEMENTED` status.

> A registry entry is a governance record, not possession of a dataset or permission to execute against it.

## Current metadata-only candidate

| Dataset ID                       | Provider               | Documented interface                            | Current ingestion status | Spatial boundary                                                                   |
| -------------------------------- | ---------------------- | ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `usgs-comcat-earthquake-catalog` | U.S. Geological Survey | ComCat documentation and FDSN Event Web Service | `NOT_IMPLEMENTED`        | No CityWorld association until a separate explicit, versioned mapping is approved. |

USGS documents its Earthquake Catalog service as supporting custom event queries and multiple formats, including GeoJSON, while ComCat records source parameters from contributing seismic networks. [1] [2] The registry captures those documentation URLs and future provenance requirements only; it makes no request to either URL.

## Adapter admission matrix

Every current entry yields `eligible: false` with all of the following block codes.

| Block code                       | Meaning                                                                                  | What would be required to remove it                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `METADATA_ONLY`                  | The record is a catalogue entry, not data or an adapter.                                 | A separately reviewed adapter implementation.                                     |
| `LICENSE_REVIEW_REQUIRED`        | No source-use decision is encoded in the registry.                                       | Documented legal/terms and intended-use review.                                   |
| `NO_ADAPTER_IMPLEMENTED`         | Genesis has no fetch, parser, cache, schema adapter or artifact builder for this source. | An independently tested adapter using existing `SourceArtifact` provenance gates. |
| `SPATIAL_POLICY_REVIEW_REQUIRED` | Source geography cannot be associated with CityWorld by inference.                       | A separately approved CRS/vertical-reference and explicit mapping policy.         |

## Required future provenance

Before any future adapter may produce a `SourceArtifact`, the registry requires capture of provider, documentation URL, requested endpoint and parameters, retrieval time, raw-content hash, declared license/terms review, and source coordinate plus vertical-reference metadata. ComCat specifically cautions that depth reference and determination methods vary across contributing networks, so a future adapter must preserve source context and uncertainty rather than normalize depth silently. [2]

## Explicit exclusions

The registry performs no network request and has no imports. It does not add USGS data to the active synthetic Earthquake scenario, change Earthquake coordinates, enable GIS ingestion, translate source geometry to CityWorld, generate a hazard run, attach an overlay, model damage, or couple to epidemic, routing, hospital, cascade or discovery behavior.

The existing Earthquake demonstrator therefore remains **SCENARIO / SYNTHETIC / NON_OPERATIONAL**. Any real-data milestone remains separately gated by the current provenance, replay, mapping and overlay policies.

## Validation

`datasetRegistry.test.ts` covers the immutable metadata entry, exact identifier lookup, full no-adapter block matrix, artifact-provenance prerequisites and explicit limitations. A focused static check confirms the module has no imports, and thus cannot introduce a fetch, GIS, renderer or Scientific Core dependency.

## References

[1]: https://earthquake.usgs.gov/fdsnws/event/1/ 'USGS — API Documentation: Earthquake Catalog'
[2]: https://earthquake.usgs.gov/data/comcat/ 'USGS — ANSS Comprehensive Earthquake Catalog Documentation'
