# Genesis visual asset strategy — zero-budget first

Research date: **2026-09-21**. This is a **non-production planning manifest**, not a runtime asset registry or approval to purchase. No external asset files were saved to the repository, converted, or integrated by this audit; source pages and their browser previews were inspected. Existing source code was inspected read-only. Candidate approval below is limited to the evidence explicitly described; production admission still belongs to the existing `WORLD_ENGINE_ASSET_MANIFEST` in `packages/frontend/src/core/three/assetGovernance.ts`.

## What to preserve

- The current canonical scene/world pipeline, `WorldGraph` ROOM/ASSET_SLOT entities, `WorldFrameRenderer`, `TemporalEngine`, Human Digital Twin manifest, evidence/replay infrastructure, and command routing. Imported meshes must be representations of existing entities, not a new world or anatomy database.
- `biologyLabKit.ts` already constructs the chamber and anatomy representations; `scientificInteriorVisuals.ts` reuses benches, cabinets, monitors, pipes, platforms, a scanner, microscope, reactor, hospital bed, and pump station. These are useful layout and interaction foundations, although geometry is simplified.
- `humanMacroMicroLayer.ts` already provides procedural organ/tissue/cell/organelle/molecule representations inside the existing scene. Those representations remain illustrative `MODEL`; they are not tissue scans or validated physiological simulations merely because their materials improve.
- The shared PBR palette, lighting/post-processing infrastructure, Human Explorer selection/isolation/cross-section controls, and `LiveMatrixBackground`. Matrix remains dashboard decoration only, without figures or a second renderer.

The local approved outer-body asset `mpfb-lod0.glb` was read without alteration. Its SHA-256 matches the existing manifest: `ec47cffd0a56d201869afb9c10ea957e237c55d4e12c197fc9d9c30d5772a8d2`. The file is **17,667,228 bytes**, with **8 stored meshes, 8 materials, 7 textures, and 83,686 triangles** counted from glTF primitive accessor counts. It uses `EXT_texture_webp`. This count does not measure draw calls or scene-instance multiplication. It is an outer person, with animation bones and facial morphs, **not separate anatomical bones, organs, vessels, or nerves**. Its upstream author explicitly assigns CC0 to `mpfb.glb`; other sample avatars in that repository have different terms. [TalkingHead author declarations](https://github.com/met4citizen/TalkingHead#license-information).

## Category coverage and decisions

`EXISTING` means reuse a current asset or component. `BUILD_PROCEDURALLY` means improve geometry/materials in the current implementation. `FREE_ASSET` means investigate the named candidate under the gate below; it does not mean already installed. `PAID_ASSET_JUSTIFIED` is reserved for a demonstrated remaining gap after the free version is rendered. **No category has reached that last status yet.**

| Category | Current decision | Reuse / next action | Candidate IDs |
| --- | --- | --- | --- |
| Dashboard | EXISTING | Scope LiveMatrixBackground to dashboard; falling green code, low mobile cost, reduced-motion static mode, no input interception. | P0 |
| General scientific laboratories | BUILD_PROCEDURALLY | Reuse room shell, furniture, railings, glazing and monitors; improve proportion, arrangement, bevels and material separation. | P1, F1–F5 |
| Biology laboratory | BUILD_PROCEDURALLY | Preserve chamber, twin placement and instrument interactions; correct lighting, floor and camera before adding detail. | P1, E1, F4–F5 |
| Neuroscience | FREE_ASSET | Keep canonical neuro-region semantics; evaluate selected atlas brain/nervous structures. Do not merge an unrelated neuron artwork into anatomy semantics. | A1; N3 rejected |
| Chemistry | FREE_ASSET | Existing reactor/bench remains the interaction owner; add selected glassware only after asset checks. | F1, F2 |
| Materials | BUILD_PROCEDURALLY | Develop the canonical spectrometer/thermal-stage visuals, panels and sample holders; tie every interactive unit to its ASSET_SLOT. | P1, F3 |
| Imaging / microscopy | BUILD_PROCEDURALLY | Refine existing scanner and microscope geometry. Display source-backed or explicitly synthetic imagery; do not imitate a clinical measurement with a decorative texture. | P1; A1 for anatomy |
| Compute | BUILD_PROCEDURALLY | Extend existing console/monitor/rack primitives and canonical COMPUTE_STATION behavior; no stand-alone workstation runtime. | P1, F3 |
| External human body | EXISTING | Fix loading and lifecycle of the approved MPFB asset, preserve controls, evaluate LOD only from measurements. | E1 |
| Skeleton | FREE_ASSET | Select anatomical bone meshes, retain stable source IDs and map them to the existing twin; animation bones are insufficient. | A1 |
| Muscles | FREE_ASSET | Evaluate separate muscle meshes and anatomical registration, then materials; availability/coverage must be confirmed per selected part. | A1 |
| Organs | FREE_ASSET | Prioritize a heart pilot, then lung/brain; verify identifiers, dimensions, orientation, separability and geometry. | A1, N1 |
| Vasculature | FREE_ASSET | Evaluate source vessel parts and completeness; preserve spatial alignment and clearly identify missing branches. | A1 |
| Nervous system | FREE_ASSET | Evaluate anatomical nerves separately from illustrative cellular neuron models. | A1; N3 rejected |
| Tissue | BUILD_PROCEDURALLY | Improve existing tissue slab/cellular geometry; keep SYNTHETIC/MODEL provenance. No verified histology-image candidate is approved here. | P2 |
| Cell | BUILD_PROCEDURALLY | Improve membrane, nucleus and organelle composition in current layer; no import of the NC-restricted NIH candidate. | P2; N2 rejected |
| Organelles | BUILD_PROCEDURALLY | Improve current capsule/sphere representations, membranes and mitochondrion folds. Do not imply measured ultrastructure. | P2 |
| Molecules | EXISTING | Preserve current molecule/DNA rendering and source/structure identifiers; use real coordinates where already available, not artistic shapes as solver input. | P2 |
| Laboratory equipment | FREE_ASSET | Use existing instruments first; glassware/burner candidates can add detail without purchasing a complete environment. | P1, F1, F2 |
| PBR materials | EXISTING | Reuse approved maps and scalar materials; trial brushed/smooth metal. Do not use outdoor rough concrete as a clean lab floor merely because it is available. | E2, F3, F4 |
| HDRI / environment lighting | FREE_ASSET | Retain street HDRI for outdoors; evaluate studio or lab lighting for reflections only, with controlled exposure. | E3, F5, F6 |
| City / street | EXISTING | Preserve governed facade, street lamp, pavement and road maps; do not unblock unverified street models by filename alone. | E2, E3, E4 |
| Physics / CERN and space worlds | BUILD_PROCEDURALLY | Retain current apparatus/world semantics; improve materials, scale, camera and lighting consistently. No off-the-shelf world replacement. | P1, F3, F5 |

## Candidate manifest

License evidence is linked beside each candidate. `UNKNOWN` means not measured or not stated by the source; it must not be converted into an invented polygon count or scientific resolution. No candidate has a new local asset checksum because no candidate binary was acquired for the repository.

| ID / asset and source | License / attribution | Format / complexity evidence | Intended use / optimization | Provenance risk / status |
| --- | --- | --- | --- | --- |
| **P0 — Genesis LiveMatrixBackground**, `packages/frontend/src/components/liveMatrix/` | Existing project code; repository license applies, no new third-party asset. | Canvas/code, polygons N/A. | Reuse controller and reduced-motion behavior; scope to dashboard. | EXISTING; do not add a second Matrix implementation. |
| **P1 — Genesis labKit / biologyLabKit / scientificInteriorVisuals** | Existing project code under repository terms. Generated geometry is not automatically CC0 unless explicitly dedicated. | Three.js procedural geometry; whole-scene triangle count UNKNOWN. | Improve proportions/materials; share/instance repeated fittings; retain ROOM/ASSET_SLOT ownership. | EXISTING / BUILD_PROCEDURALLY; instrument appearance does not establish instrument capability. |
| **P2 — Genesis HumanMacroMicroLayer**, `packages/frontend/src/core/three/humanMacroMicroLayer.ts` | Existing project code under repository terms. | Procedural meshes; total complexity varies by level and is UNKNOWN until measured. | Reuse layer and canonical selection, improve topology/materials; distinguish display magnification from acquisition resolution. | EXISTING / BUILD_PROCEDURALLY; scientific shape accuracy is not established. |
| **E1 — MPFB outer human**, met4citizen/TalkingHead [`avatars/mpfb.glb`](https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb) | CC0-1.0 per [author statement](https://github.com/met4citizen/TalkingHead#license-information); attribution optional, provenance retained. | Local GLB details measured above; 1K WebP derivative recorded in existing manifest. | Stable loading, human framing, material quality; preserve rig/morphs. If needed, author and verify lower LOD instead of treating compressed textures as geometry reduction. | APPROVED already in canonical registry; author declaration is not independent legal/scientific validation. |
| **E2 — Concrete Floor 01**, Poly Haven [asset page](https://polyhaven.com/a/concrete_floor_01) | CC0-1.0, no required attribution. | PBR JPG/PNG/EXR; source up to 8K, current governed derivative 1K; polygons N/A. | Suitable existing concrete for exterior/utility surfaces. For a clean floor, use existing LAB_FLOOR with subtler normals/roughness; do not force this weathered outdoor texture into the reference lab. | APPROVED local derivative; compare files with existing hashes before reuse. |
| **E3 — Braustuble Alley**, Poly Haven [asset page](https://polyhaven.com/a/braustuble_alley) | CC0-1.0 per existing registry and [provider policy](https://polyhaven.com/license); attribution optional. | Existing HDR 1K; polygons N/A. | Keep for street environment. Not the default clean-lab illumination. | APPROVED local entry; current binary/lighting fit not reassessed here. |
| **E4 — Modular Urban Apartments Facade / Street Lamp 01**, Poly Haven [facade](https://polyhaven.com/a/modular_urban_apartments_facade), [lamp](https://polyhaven.com/a/street_lamp_01) | Existing registry: CC0-1.0; attribution optional. | Local glTF; facade 118,000 polygons per registry (not independently recounted here), lamp UNKNOWN. | Retain for city, instance repeated objects and audit all dependent textures/buffers. | APPROVED registry entries, not proof every external glTF dependency is covered by the currently recorded root-file hash. |
| **F1 — Chemistry Set**, Jiří Ptáček / Poly Haven [source](https://polyhaven.com/a/chemistry_set) | CC0-1.0; no mandatory attribution. | glTF / Blender / FBX / USD; source lists about 42K triangles and 1K–4K textures. | Use selected glassware/stands on canonical benches; remove excessive vintage dirt for the intended style, consolidate materials, create LOD and package GLB. | CANDIDATE_NOT_IMPORTED; website facts verified, topology/material count and fit in Genesis not inspected. |
| **F2 — Bunsen Burner**, BKS / Poly Haven [source](https://polyhaven.com/a/bunsen_burner) | CC0-1.0; no mandatory attribution. | glTF / Blender / FBX / USD; source lists about 8K triangles, 0.2 m height, 1K–4K textures. | Optional bench detail; use 1K maps and shared materials, measure repeated-instance cost. | CANDIDATE_NOT_IMPORTED; not a simulated physical burner merely by importing its mesh. |
| **F3 — Metal 010 / Metal 030**, ambientCG [brushed steel](https://ambientcg.com/view?id=Metal010), [smooth metal](https://ambientcg.com/view?id=Metal030) | CC0-1.0, attribution optional; [license](https://docs.ambientcg.com/license/). | PBR JPG/PNG sets; Metal010 offers 1K–8K; polygons N/A. | Lab steel housing/shafts; start 1K, preserve linear data for normal/roughness maps, test restrained normal strength and world-scale tiling. | CANDIDATE_NOT_IMPORTED; measured reflectance and real-world microgeometry are UNKNOWN. |
| **F4 — procedural dry lab floor / glass / painted panels**, existing Genesis material palette | Existing project code; no new asset license. | Scalar PBR plus existing procedural pattern; polygons N/A for materials. | Highest-priority free correction: avoid wet-floor ripples, reduce bloom/reflection dominance, separate transparent glass from coated metal. | BUILD_PROCEDURALLY; visual improvement, not a calibrated material model. |
| **F5 — Studio Small 03**, Greg Zaal / Poly Haven [source](https://polyhaven.com/a/studio_small_03) | CC0-1.0, attribution optional. | HDR/EXR 1K–16K; polygons N/A. | Candidate neutral studio reflections for the human/instrument close-up; preprocess environment lighting using the current renderer, start 1K. | CANDIDATE_NOT_IMPORTED; high-contrast softbox highlights may worsen clipping if exposure is not corrected. |
| **F6 — Vintage Measuring Lab**, Oliksiy Yakovlyev / Poly Haven [source](https://polyhaven.com/a/vintage_measuring_lab) | CC0-1.0, attribution optional. | HDR/EXR 1K–17K; polygons N/A. | Optional indoor lighting reference, not a replacement for laboratory geometry. | CANDIDATE_NOT_IMPORTED; older industrial palette differs from the futuristic target. |
| **A1 — BodyParts3D release 4.0, current archive**, DBCLS [download](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), [current README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html) | Current official archive states **CC BY 4.0**; mandatory credit, license link and change notice. [License](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html). | OBJ element meshes with FMA/concept/representation tables; provided archives list 99% reduction; individual triangle counts UNKNOWN. Compound organs are described as collections of element meshes, not necessarily one mesh. | Pilot heart/bones before wider systems. Preserve IDs/coordinates, convert to GLB, check units/normals, materialize, create LOD, map to current twin IDs. Do not import its ontology as another runtime twin. | CANDIDATE_NOT_IMPORTED; old licenses differ; reduced mesh quality, anatomical gaps and correspondence to the existing avatar require review. |
| **N1 — Human Heart 3d Model, 3DPX-022787 v1.01**, Sourav Pan / NIH 3D [entry](https://3d.nih.gov/entries/3DPX-022787?version=1.01), [file list](https://3d.nih.gov/entries/download/22787/1.01) | Entry's live Licensing link reads Public Domain and links **CC0-1.0**. Credit not required by CC0, retain author/version/source for provenance. | Input `heart.glb`; converted STL/WRL/X3D available. Output metadata reports no texture, rig, animation or UV. Input GLB internal mesh count and triangles UNKNOWN. | Alternative isolated-heart pilot; inspect separability, coordinate frame, lumen/topology and model evidence before considering integration. | CANDIDATE_NOT_IMPORTED; uploader declaration verified in live browser; clinical/scientific validation and source acquisition are UNKNOWN. |
| **N2 — Animal Cell, 3DPX-015797 v2**, destacados tv / NIH 3D [entry](https://3d.nih.gov/entries/3DPX-015797) | Live Licensing link: **CC BY-NC-SA 4.0**; attribution + noncommercial + share-alike. | Input STL / processed GLB listed; polygons UNKNOWN. | No use in commercial Genesis baseline; keep current procedural cell. | REJECTED_FOR_COMMERCIAL_BASELINE. Separate commercial permission was not sought. |
| **N3 — Neuron, 3DPX-015796 v2**, destacados tv / NIH 3D [entry](https://3d.nih.gov/entries/3DPX-015796) | Live Licensing link: **CC BY-NC-SA 4.0**. | Processed 3D view; precise downloadable format/triangles not audited. | No use in commercial baseline; preserve procedural neuron or choose another audited source. | REJECTED_FOR_COMMERCIAL_BASELINE. Not anatomical peripheral-nerve system coverage. |

## License findings that change decisions

**Poly Haven and ambientCG are appropriate first sources, but the asset and the service are different things.** Poly Haven's asset policy permits commercial use, modification and redistribution without attribution; website copy, logos and example renders are not all included in that grant. Its live API has separate conditions. Genesis can use individually recorded, self-hosted derivatives without adding a live-API dependency. [Poly Haven license](https://polyhaven.com/license), [API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md). ambientCG explicitly includes raw asset files in projects such as games and makes attribution optional. [ambientCG license](https://docs.ambientcg.com/license/).

**BodyParts3D requires version-specific evidence.** The current license page was updated on 2025-02-27 and identifies CC BY 4.0. Its required attribution is:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

That is the current archive's statement, not permission to relabel all old mirrors. The [older official information page](https://lifesciencedb.jp/bp3d/info/index.html) and [2011 archive README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html) still state CC BY-SA 2.1 Japan. For a future acquisition, record the exact current archive filename, retrieval date, hash, associated current license and change history. If the actual package contradicts that record, keep it unapproved pending clarification. CC BY 4.0 permits commercial adaptation but requires attribution, license notice and identifying modifications; do not apply Genesis' proprietary restrictions to the CC-licensed parts. [CC BY 4.0 terms](https://creativecommons.org/licenses/by/4.0/).

The original BodyParts3D maintainers also warn that some structures are incomplete, artist-created or adjusted to fit and can contain anatomical errors. That makes it a plausible visual/educational starting point with source metadata, not automatic clinical truth. [Maintainer description](https://lifesciencedb.jp/bp3d/info/index.html).

**NIH 3D is not a blanket permissive license.** Three exact entries were checked in the live browser because the web text extraction omitted their license icons/links. N1 is CC0; N2 and N3 are noncommercial/share-alike. NIH itself requires checking each file's assigned terms and does not warrant scientific accuracy or contributor rights. [NIH terms](https://3d.nih.gov/terms), [NIH FAQ](https://3d.nih.gov/faqs). NC assets stay out of the commercial baseline; being free to download, government-hosted, or useful for education does not remove NC. [CC BY-NC-SA 4.0 terms](https://creativecommons.org/licenses/by-nc-sa/4.0/).

## Admission and optimization procedure

1. Record the exact source entry/version, creator, asset license URL/text/date, attribution wording, intended commercial/web use, and known restrictions **before any asset download**. Download only if the legal provenance record permits it; leave ambiguity marked `LEGAL_REVIEW_REQUIRED`.
2. After a permitted download, record archive and extracted-file SHA-256, formats, all dependencies, measured triangles/materials/texture sizes, units, bounds and rig/LOD availability. No `APPROVED` record based solely on matching a filename.
3. Keep authoring files separate from runtime derivatives. Record every transformation and hash each distributed dependency, including external `.bin` and textures referenced by glTF; prefer self-contained GLB for new mesh candidates when appropriate.
4. Reuse existing loaders, material pipeline and scene owners. Map source IDs into the canonical anatomy/ROOM/ASSET_SLOT model, retaining source identifiers for traceability. Do not import an asset pack's viewer, world state or anatomy hierarchy as another production subsystem.
5. Start at 1K textures for repeated equipment/mobile and at most 2K for a justified close-up. These are proposed budgets, not claims about source accuracy. Measure GPU memory, visible triangles, draw calls, overdraw, frame time and decode cost before raising resolution.
6. Verify isolated organ/system selection, clipping, surface modes, exact position/scale and LOD transitions. A merged attractive body mesh that cannot expose individual organs fails the Human Explorer use case.
7. Preserve epistemic labels and scientific provenance independently of visual assets. Texture pixels, polygon density and zoom factors must not become invented measurement resolution or confidence.

### Existing governance items to reconcile, without bypassing the current gate

- `public/assets/genesis-hf/ASSETS.md` starts with a blanket statement that everything in that folder is Poly Haven, while its own table includes the TalkingHead avatar. Make that scope precise when the governance docs are next edited.
- That document records sources/hashes for older `genesis-hf/pbr/` maps, while the canonical registry currently treats the folder as unverified. Reconcile exact files against primary-source records before promotion; this planning document does not override the blocked status.
- Current approved facade/lamp registry hashes name their root `.gltf`. Confirm closure over referenced buffers/textures before claiming package-level integrity. A root JSON hash does not itself hash external dependencies.
- Procedural Genesis geometry is project-owned code/output unless an explicit asset-specific dedication exists. Do not label all generated lab assets CC0 just because one exported ambulance has such a registry record.

## Paid assets: compatibility assessment, no purchase

**No paid product is recommended or approved at this checkpoint.** Earlier marketplace prices in conversation were not independently verified for an exact current listing and license; they are excluded from the decision. Price and license remain `UNKNOWN` until a specific listing is audited. The strongest possible future justification is anatomy with separately selectable structures and better topology, after an A1/N1 pilot shows the remaining gap. Buying a whole lab is not currently justified while reusable room geometry and free equipment/materials exist.

Any proposed purchase must pass all of these checks:

| Check | Required evidence |
| --- | --- |
| Format and shader compatibility | Actual GLB/glTF sample preferred; FBX/Blender source needs a tested conversion. List required glTF extensions, textures and PBR channels; marketplace screenshots are insufficient. |
| Anatomy semantics | Named separate meshes for requested structures, reliable coordinate registration, correspondence to source anatomy, usable system/organ isolation and clipping. |
| Runtime cost | Measured triangles, materials/draw calls, texture memory, file size and LODs. A cinematic 8K asset can fail a mobile interactive use case. |
| Rigging and animation | Verify only when required; outer-body animation rigs do not provide anatomical mesh parts or physiologically valid motion. |
| Commercial/public-web rights | Explicit permission for the intended software use and client-delivered packaged assets; raw redistribution limits must be compatible with a browser downloading the geometry. GLB compression is not rights protection. |
| AI conditions | Any ambiguous “no AI” or similar restriction is `LEGAL_REVIEW_REQUIRED`; distinguish model training, inference input, AI-assisted development and an AI-enabled product. Never infer permission from a generic royalty-free label. |
| Attribution and source record | Preserve author, invoice/license version when acquired, legal text, URLs, timestamps and hashes. Assess all bundled textures/derivatives, not just the main mesh. |

Engineering effort below is an **internal planning estimate**, not a vendor quote, promised schedule or asset price. It assumes the license passes and an experienced developer/technical artist can use the current stack:

| Work package | Estimated integration effort | Purchase cost |
| --- | --- | --- |
| One PBR set or HDRI variant with baseline comparison | 0.5–1 engineer day | Free candidates above: 0; paid alternatives unquoted |
| Selected static lab equipment set | 1–3 engineer/technical-artist days for conversion, materials, LOD and tests | Free candidates above: 0; paid alternatives unquoted |
| One source-backed organ pilot with canonical mapping and interactions | 2–5 engineer/technical-artist days | Free candidate: 0; scientific reviewer time separate and UNKNOWN |
| Multi-system anatomy with many selectable structures | 10–30+ engineer/technical-artist days, to be re-estimated after pilot | UNKNOWN for any paid pack; specialist review additional |

These estimates do not include new simulations, clinical validation, new solver integration or authoring missing anatomy. The free route saves acquisition cost, not all integration labor.

## Independent implementation review points

- `core/visualStages/**` remains reference/test-only; do not buy or import a ready-made viewer merely to show a better screenshot alongside the real app.
- Browser evidence requires the production scene, completed asset state, licensed-asset tier and a rendered frame. A canvas, imported GLB or passing Node test alone does not prove the complete browser path.
- The current avatar can improve external body realism. Its lack of internal anatomical geometry cannot be corrected by bloom, transparency or an animation skeleton.
- Distinguish loading-time fallback, actual load failure and intentional illustrative representation in both UI and reports.
- Performance claims need measurements on declared devices; desktop screenshots or emulated viewport width are not a measured physical-phone result.
- Reference illustrations guide composition/material/lighting choices. They do not supply anatomical truth, validated MRI/tissue data or permissions for medical claims. Candidate scientific metadata stays `UNKNOWN`/`UNSPECIFIED` when sources do not supply it.
- The asset strategy itself supplies no capability-matrix PASS and no browser evidence. Technical compatibility, distribution rights, scientific fidelity and visual quality are separate acceptance questions.
