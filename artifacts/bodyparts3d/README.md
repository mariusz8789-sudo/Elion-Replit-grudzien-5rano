# BodyParts3D 4.0 pilot source

This directory contains the small official-source subset prepared for the
Genesis anatomy pilot. It is source material for deterministic conversion,
not a runtime asset and not a patient-specific or clinical model.

## Provenance

- Source: BodyParts3D 4.0, Database Center for Life Science (DBCLS)
- Official download page: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>
- Official archive: <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip>
- License: CC BY 4.0
- Required attribution: `BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International`
- Full source archive SHA-256: `40665852C49F218326590E204DB91064A1ECFC3C6F8CBD7BBBCAAC62C7CD409E`
- Pilot ZIP SHA-256: `02C6D0107B82DE7EA7E1166D78AEF6F548040D8832317ACBC12BF3C1F47AE862`

The pilot ZIP contains the official `partof` mapping files, a manifest, and
all 428 referenced OBJ elements for these compound representations:

| Genesis structure | FMA | BP representation | OBJ elements | Approx. triangles after triangulation |
| --- | --- | --- | ---: | ---: |
| Heart | FMA7088 | BP9305 | 83 | 205,604 |
| Liver | FMA7197 | BP9334 | 60 | 383,244 |
| Right lung | FMA7309 | BP9359 | 156 | 146,624 |
| Left lung | FMA7310 | BP9417 | 124 | 82,876 |
| Aorta | FMA3734 | BP10374 | 5 | 20,376 |

The compound definitions are authoritative membership mappings. They do not
identify a safe outer-shell-only subset. Merge and optimization must preserve
the complete mapped structure unless a narrower mapping is independently
verified. BodyParts3D release notes also warn that some segmented lung and
liver concepts may contain mapping inaccuracies; Genesis must present these
assets as a generic anatomical reference model.
