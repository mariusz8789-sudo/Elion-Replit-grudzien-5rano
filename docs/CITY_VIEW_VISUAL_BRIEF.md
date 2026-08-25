# High-fidelity City View: visual brief

## Baseline audit

The unmodified 1920×1080 City 3D view exposes the complete street grid but reads as a sparse demonstration board. The main limitations are broad empty parcels, uniform low-rise blocks, a road material without curb hierarchy, a high enough camera to flatten the scene, and vegetation concentrated in a central cone cluster. The city is visible, but it is not yet the compositional subject.

## Chosen direction: dense district observatory

The visual pass will retain the existing city bounds, real objects, road topology, and agents. It will make a single 3–5 block district read as a compact digital twin by adding visual-only parcel infill around the existing model objects, varied facade massing and windows, road curbs and crossing detail sourced from the same topology, smaller distributed canopy trees, and a higher-quality sun/sky/shadow composition.

The city camera remains a shared `OrbitControls` camera. Its default framing will show the district from a 45–60° elevated angle with the city occupying most of the canvas. Agents will remain compact population-scale markers in the city view; agent focus remains available but is not the default composition.

> Scientific Core movement, epidemiological contacts, hospital behavior, Scenario Engine, replay, cohort logic, transmission semantics, and `WorldEngineContract` remain untouched. Infill structures are renderer-only context geometry and cannot be interpreted as model locations or contact destinations.

## Measurable visual targets

| Element | Baseline condition | Target condition |
| --- | --- | --- |
| City composition | Sparse blocks separated by large blank parcels | Dense readable blocks with open space retained only as a deliberate park/courtyard |
| Road hierarchy | Flat road strips and markings | Asphalt, curbs, sidewalks, crossings, intersection texture, street fixtures |
| Buildings | Repeated simple massing | Existing building assets with deterministic height, facade, roof, window, balcony, and setback variation |
| Vegetation | Central cone cluster | Smaller trees distributed along edges and public open space without blocking buildings |
| Agents | Visually compete at near range | Small population-scale crowd with unchanged state coloring and selection behavior |
| Lighting | Flat high-key scene | Directional sunlight, ambient sky fill, grounded shadows, restrained bloom and fog |

## Final visual verification

The matched 1920×1080 after capture shows a closer elevated overview with the primary three-by-three street grid occupying the main canvas. Existing public buildings and residential blocks remain legible, while visual-only mid-rise infill fills the previously empty frontage between them. Roads now have a curb/sidewalk hierarchy, crossings remain aligned to the existing topology, and the park vegetation is smaller and distributed rather than a dominant cone cluster. The City View continues to render the same right-side routing topology, hospital, hotspot, and epidemic controls; no Scientific Core data semantics were changed.
