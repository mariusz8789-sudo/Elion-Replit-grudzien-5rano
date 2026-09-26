# Genesis — BodyParts3D 4.0 anatomy pilot

Five structures from the official BodyParts3D 4.0 atlas (DBCLS) drawn in the existing Human Explorer
twin, replacing the procedural ellipsoids of the same atlas nodes.

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

This is a **generic anatomical reference model**: the surface of one atlas body. It is not specific to any
patient, it is not a measurement of anybody, and it must not be used for clinical or diagnostic purposes.
BodyParts3D contains no histology or cell data, so the tissue, cell and organelle views remain MODEL.

## Source

| | |
|---|---|
| Download page | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html |
| Archive | https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip |
| Archive SHA-256 | `40665852C49F218326590E204DB91064A1ECFC3C6F8CBD7BBBCAAC62C7CD409E` (142,903,898 B, 2,234 OBJ) |
| Licence | CC BY 4.0 — https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html |
| Pilot package | `artifacts/bodyparts3d/bodyparts3d-pilot-source.zip`, SHA-256 `02c6d010…f47ae862`: the manifest, the official `partof_element_parts.txt` / `partof_parts_list_e.txt` and the 428 referenced FJ OBJ files |
| Download date | 2026-09-24. The package does not record a download timestamp; this is the date of the commit that published it. |

## Mapping

The mapping runs FMA concept → BP representation → FJ elements → Genesis ID. The converter proves it
against the official part-of lists and refuses to run on any mismatch. The test suite checks it again.

| Genesis ID | FMA | BP | FJ elements | Official name |
|---|---|---|---:|---|
| `heart` | FMA7088 | BP9305 | 83 | heart |
| `liver` | FMA7197 | BP9334 | 60 | liver |
| `left-lung` | FMA7310 | BP9417 | 124 | left lung |
| `right-lung` | FMA7309 | BP9359 | 156 | right lung |
| `aorta` | FMA3734 | BP10374 | 5 | aorta |

Each structure is the complete official part-of element set, merged into one mesh (one draw call). No
element is dropped or substituted. The complete FJ lists are in `BODYPARTS3D_PILOT_STRUCTURES`
(`packages/frontend/src/core/three/bodyParts3dPilot.ts`), in every GLB's `extras` and in the provenance
JSON. `aorta` is a new atlas `ORGAN` node (`CARDIOVASCULAR`). Its procedural proxy is a thin midline column
until the reference mesh loads.

## Conversion

Script: `packages/frontend/scripts/convertBodyParts3dPilot.mjs`. Run it from `packages/frontend` with
`node scripts/convertBodyParts3dPilot.mjs`. It is deterministic: the unit suite re-runs it and compares
every output byte for byte.

**Frame.** BodyParts3D millimetres become the twin frame in metres: `x = X/1000`, `y = Z/1000`,
`z = −Y/1000`. This is a proper rotation (no mirroring), so left stays left.
- The twin faces +Z; `x` points to the patient's left.
- One shared translation moves the bilateral lung pair's centre to (0, 1.26, 0.045) m. Those values are
  the midline, the atlas lung height, and the approved CC0 body's thoracic antero-posterior centre.
- There is no scaling. Relative positions are the source atlas's own.
- A test re-measures the CC0 body mesh and checks that every structure stays inside its torso at every
  height.

**Encoding.**
- `KHR_mesh_quantization`: int16 positions under a uniform node scale, and int8 normals. three.js's
  `GLTFLoader` decodes these natively, so no decoder library is needed.
- The OBJ's own vertex normals are used; nothing is recomputed.
- No materials are written; Genesis applies its own organ material.
- Draco and Meshopt compression are not used, because Genesis ships no decoder for them.

**Levels of detail.**
- DESKTOP keeps every source triangle.
- MOBILE is simplified with meshoptimizer 0.18.1 (pinned, already in `node_modules`, dev-time only) to
  25% of the triangles. The measured error is recorded per structure.

| Structure | OBJ files | OBJ size | Source triangles | Desktop GLB | Desktop triangles | Mobile GLB | Mobile triangles | Mobile error |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| heart | 83 | 6.82 MB | 102,802 | 1.34 MB | 102,802 | 392 kB | 25,698 | 0.42 mm |
| liver | 60 | 12.94 MB | 191,622 | 3.62 MB | 191,622 | 718 kB | 47,900 | 0.30 mm |
| left lung | 124 | 2.66 MB | 41,438 | 0.56 MB | 41,438 | 170 kB | 10,358 | 0.49 mm |
| right lung | 156 | 4.75 MB | 73,312 | 0.98 MB | 73,312 | 291 kB | 18,328 | 0.35 mm |
| aorta | 5 | 0.64 MB | 10,188 | 0.13 MB | 10,188 | 35 kB | 2,546 | 0.30 mm |
| **Total** | 428 | 27.8 MB | 419,362 | 6.63 MB | 419,362 | 1.61 MB | 104,830 | < 0.5 mm |

Every file has 1 draw call and 0 materials. The pilot package README's "approximate triangles after
triangulation" column is about twice these counts. The OBJ faces are already triangles; the table above
is counted from the files.

## Runtime

There is still one registry, one twin, one renderer and one loader.
- `assetGovernance.ts` has 10 `APPROVED` records, one per runtime file, each with that file's SHA-256.
- `bodyParts3dPilot.ts` holds the mapping table, runtime paths, LOD choice and the registry gate. A file
  is fetched only after its record passes the gate.
- The loader uses the existing `GLTFLoader`.
- `TwinHandle.applyReferenceAnatomy` hands the loaded geometry to the same organ mesh. That mesh keeps its
  id, material, raycast, selection rim, isolation, GHOST shell and clipping.
- `TwinHandle.getOrganFocus` gives the camera the centre of the current geometry.
- `AgentLabScene3D` loads the pilot lazily, the first time one of its structures is shown, selected or
  isolated. It applies the pilot to every twin, including after the CC0 body upgrade.
- The explorer card shows the source, FMA, BP, element count, LOD and triangle count. The attribution
  line is visible whenever any of these meshes is on screen.
- Picking the aorta, which has no explorer ladder, selects it directly without an agent session and
  without a macro→micro claim.

## Known limitations

- This is a generic reference from one atlas body: not patient-specific, not clinical, not diagnostic.
- There are no tissue or cell data. The views below organ level remain MODEL.
- BodyParts3D release notes warn that some segmented lung and liver concepts may contain mapping
  inaccuracies. The part-of membership is used exactly as published.
- The OBJ headers still carry the legacy "CC Attribution-Share Alike 2.1 Japan" notice. The current
  official licence page (CC BY 4.0) governs.
- Registration into the twin is a translation only. Organ sizes are the atlas body's own, not rescaled to
  the twin's height.
- **Existing issue, not changed here.** The procedural atlas (`anatomyAtlas.ts`) places `heart`,
  `left-lung`, `stomach` and other organs at −X, with kidneys at +Z. Both rendered bodies (the CC0 GLB and
  the procedural rig) face +Z, so on screen those ellipsoids sit on the patient's **right**. That is a
  180° yaw relative to the body. The BodyParts3D meshes are placed correctly (heart and left lung on the
  patient's left). While the pilot is loaded, the remaining procedural organs are therefore still
  mirrored relative to it. Fixing the atlas frame is a separate decision about anatomy facts.
- The pre-purchase acceptance screen (`evaluatePremiumAssetAcceptance`) returns `LEGAL_REVIEW_REQUIRED`
  for any licence that requires attribution. For this pilot it is the only reason. The attribution flow
  is implemented and tested; a human confirmation of it is still the gate's rule.
