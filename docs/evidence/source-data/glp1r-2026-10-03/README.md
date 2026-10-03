# GLP-1R source data, fetched 2026-10-03 (Saturday)

Raw files exactly as each host served them. Per-file sourceId, sourceUrl, retrievedAt, bytes and sha256
are in `SOURCES.json`; structure metadata (species, UniProt, resolution, stated mutations, ligands,
method) is copied from RCSB's Data API JSON stored next to each mmCIF. Fetch script:
`scripts/fetch-glp1r-sources.py`. Hosts: files.rcsb.org, data.rcsb.org, reactome.org,
www.proteinatlas.org, www.ebi.ac.uk. No mirror was used.

| source | what | as stated by the source |
|---|---|---|
| RCSB 7C2E | mmCIF, entry/entity/assembly JSON, wwPDB validation report | cryo-EM 4.2 Å, GLP-1R (P43220, human) with Gs, Gβ1, Gγ2, Nb35; ligand FFR; mutation stated L260F |
| RCSB 7S15 | mmCIF, entry/entity/assembly JSON, wwPDB validation report | cryo-EM 3.8 Å, GLP-1R (P43220, human) alone; ligand 82L; 8 stated mutations I146Y, A208R, Q213E, S219R, L260A, Y291A, L339E, K346Q |
| Reactome R-HSA-381684 | event + participants JSON | "GLP1R [plasma membrane]", Homo sapiens (Reactome release 97) |
| Reactome R-HSA-381706 | event + participants JSON | "GLP1R:GLP1 activates G(s)", reaction, Homo sapiens |
| HPA ENSG00000112164 | gene JSON and TSV | GLP1R, tissue enhanced (pancreas 8.6 nTPM, heart muscle 2.6 nTPM) |
| ChEMBL (release ChEMBL_37) | 16 assay records missing until now | all 16 have a description, target CHEMBL1784, Homo sapiens |

What this is not: no structure is registered as the canonical GLP-1R docking target, no model was
trained, no candidate compared, and the 16 assay descriptions have not been classified (that is a
D-151 rerun for the GLP-1R owner). Reactome stays source Evidence, not a Genesis model.
