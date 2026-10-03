# Run 9, seal B: DRAFT (not sealed)

Fetched and drawn on 2026-10-03 (Saturday), after the project's network environment was widened.
Nothing was docked, scored or opened. Seal A (`../run9-ranking-prereg.json`) was read, not edited.
Seal B is frozen only on the owner's word.

## What was done

1. Downloaded `annotations.csv` and `ground_truth.tar.gz` from Zenodo, no redirect off zenodo.org,
   Zenodo md5 matched for both. Details: `docs/evidence/source-data/zenodo-14794785-runs-n-poses/DOWNLOAD.json`.
2. Applied `protocol.freshSet` of seal A mechanically: `scripts/run9-seal-b-draft.py`.
3. Wrote the case list `fresh-set-cases.json` and `seal-b-draft-manifest.json` (every input hashed).

## Result

| step | count |
|---|---|
| rows in annotations.csv | 4235 |
| ligand not proper, or not exactly one proper ligand chain | 2057 out |
| heavy atoms outside 10 to 60 | 0 out |
| rotatable bonds over 15 | 9 out |
| PDB id in PoseBusters 308 | 71 out |
| PDB id in Astex 85 / CrossDocked2020 / PDBbind2016 | 0 / 0 / 0 out |
| eligible systems | 2098 |
| second system of the same PDB id | 9 out |
| **drawn (first 300 by sha256('run9\|' + group_key))** | **300** |

Case list sha256: `92bf6db77c89e4aaf405838554735a3fdf9824e6fe9fa0d8ab0921bb0fedad89`.

## Three things the owner decides before sealing

1. **Zenodo version.** Seal A names the concept DOI 10.5281/zenodo.14794785, which today resolves to
   version 18366081. `annotations.csv` exists in two variants across the 6 versions; the first variant
   gives a list with 299 of the same 300 cases. `ground_truth.tar.gz` is identical in all versions.
2. **PDBbind2016 id count.** The Run 8 prereg states 12670 unique ids; the types files reachable at
   gnina/models commit 0207e025 give 11577 here (CrossDocked2020 reproduces exactly at 25752, and the
   Astex intersections reproduce exactly at 63 / 47 / 76). It cannot change this draw: every Runs N'
   Poses entry was released on or after 2021-10-06, after both lists were published.
3. **Terms.** The record carries a pointer to the AlphaFold 3 Output Terms of Use without saying which
   files it covers; the record licence is CC-BY-4.0.

## Where the files are

- `annotations.csv`, raw: `docs/evidence/source-data/zenodo-14794785-runs-n-poses/v18366081/`
- `ground_truth.tar.gz`, raw (414 MB, too large for git): project files,
  `run9-data/zenodo-18366081/ground_truth.tar.gz`, sha256 `1b9f778b…1d51`
- GNINA id lists: re-fetchable from raw.githubusercontent.com at commit
  0207e0250ac7066d4d2b137d2735487608ee6e5a; every file's sha256 is in the manifest.
