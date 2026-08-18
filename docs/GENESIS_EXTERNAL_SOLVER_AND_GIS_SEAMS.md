# Genesis External Solver and GIS Seams

**Status:** architecture and capability contracts only. No external solver, spatial query, data download, or third-party runtime is enabled by this document or by the corresponding registry.

Genesis already has real local analytical graphs, an agent-based epidemic world, and a minimal engineering model. The next scale requires a different operational boundary: a model adapter must receive a declared case, run in a bounded environment, preserve artifacts and version metadata, and return normalized outputs with provenance. It must not silently substitute a simpler calculation for a failed external solver.

| Priority seam | Candidate runtime | What the official material supports | Genesis status | Required execution evidence |
|---|---|---|---|---|
| CFD and continuum flow | OpenFOAM | Case assembly, meshes, boundary conditions, solver applications and post-processing are documented. [1] | `ENGINE_NOT_AVAILABLE` | Container digest, case/mesh/boundary hashes, solver log, field artifact hashes. |
| General PDE / FEM | FEniCSx | The FEniCS project publishes DOLFINx, FFCx, Basix and UFL documentation for C++ and Python interfaces. [2] | `ENGINE_NOT_AVAILABLE` | DOLFINx/UFL/PETSc versions, weak-form hash, mesh and boundary-condition hashes. |
| Numerical relativity | Einstein Toolkit | The project describes a computational platform for relativistic astrophysics and gravitational physics. [3] | `ENGINE_NOT_AVAILABLE` | Thorn manifest, parameter file, resource allocation, checkpoint and wave-extraction artifacts. |
| Radiation and neutron transport | OpenMC | The documentation describes Monte Carlo neutron/photon transport, statepoints and Python/C++ APIs. [4] | `ENGINE_NOT_AVAILABLE` | Geometry, material and nuclear-data references, seed, tally definition, statepoint artifacts. |
| Quantum tunnelling | Validated Schrödinger backend | A Genesis contract exists for Hamiltonian, state/grid and numerical tolerances; a solver is not selected or installed. | `ENGINE_NOT_AVAILABLE` | Solver version, Hamiltonian/grid hash, integrator, tolerance and conservation diagnostics. |

> **Policy:** A capability entry with `ENGINE_NOT_AVAILABLE` has no numerical output. It only reports the required input schema, provenance and runtime condition. It is not a fallback result.

## GIS and real-world import seam

A real world import is an immutable **source dataset** rather than a renderer scene. `GenesisSpatialDataset@1.0.0` must retain the source query, capture timestamp, bbox, coordinate reference system, license/attribution and normalized artifact hash before any world is constructed from it.

| Source seam | Candidate source | Supported planned layers | Genesis status | Mandatory provenance |
|---|---|---|---|---|
| `osm-overpass` | OpenStreetMap / Overpass | Buildings, roads, rail, waterways and boundaries | `NOT_CONFIGURED` | Endpoint, query hash, OSM base timestamp, bbox, CRS, attribution and normalized artifact hash. |
| `usgs-national-map` | USGS National Map / 3DEP | DEM/terrain, hydrography, transport, structures and boundaries | `NOT_CONFIGURED` | Product ID, URL, capture timestamp, bbox, CRS, vertical datum and artifact hash. |

The Overpass documentation describes OpenStreetMap as worldwide geographic base data and Overpass as an API designed for software data queries, including data selected by location and tags. [5] The USGS National Map describes downloadable elevation, hydrography, transportation, structures and related geospatial layers, as well as web services and its access API. [6]

## Required Genesis path

```text
External source or solver case
  → validated adapter request
  → bounded job/runtime
  → artifact + metadata capture
  → normalized result or GenesisSpatialDataset
  → one ExperimentRun + provenance
  → existing Event/World/Visualization consumers
```

No adapter can mutate the active scientific model directly. A normalized result must first pass its schema and provenance validation; a world import must be materialized as an explicit input dataset. This prevents real-world data, model execution and display state from becoming a hidden second World State.

## References

[1]: https://www.openfoam.com/documentation/overview "OpenFOAM Documentation"
[2]: https://docs.fenicsproject.org/ "FEniCSx Documentation"
[3]: https://einsteintoolkit.org/ "The Einstein Toolkit"
[4]: https://docs.openmc.org/en/stable/ "The OpenMC Monte Carlo Code"
[5]: https://dev.overpass-api.de/overpass-doc/en/preface/preface.html "OpenStreetMap and the Overpass API"
[6]: https://www.usgs.gov/the-national-map-data-delivery/gis-data-download "USGS National Map GIS Data Download"
