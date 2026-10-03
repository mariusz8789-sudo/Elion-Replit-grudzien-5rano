#!/usr/bin/env python3
"""Fetch the GLP-1R source data that was blocked by the network policy, raw and unmodified.

Every file is saved byte-for-byte as the host served it, with sourceId, sourceUrl,
retrievedAt and sha256 in SOURCES.json next to it. Structure metadata (species, UniProt,
resolution, mutations, ligands, method) is read from RCSB's own Data API JSON, never
inferred. Nothing here registers a docking target, trains a model or compares candidates.

usage: fetch-glp1r-sources.py OUT_DIR
"""
import datetime
import hashlib
import json
import os
import sys
import urllib.request

STRUCTURES = ["7C2E", "7S15"]
REACTOME = ["R-HSA-381684", "R-HSA-381706"]
HPA_GENE = "ENSG00000112164"  # GLP1R
CHEMBL_ASSAYS = ["CHEMBL1246709", "CHEMBL1648248", "CHEMBL1924543", "CHEMBL1925821",
                 "CHEMBL1937452", "CHEMBL829559", "CHEMBL874550", "CHEMBL884187",
                 "CHEMBL911100", "CHEMBL923946", "CHEMBL937687", "CHEMBL972348",
                 "CHEMBL972349", "CHEMBL977343", "CHEMBL991608", "CHEMBL991609"]


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Fetcher:
    def __init__(self, out):
        self.out = out
        self.records = []

    def get(self, source_id, url, rel_path, kind):
        path = os.path.join(self.out, rel_path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        at = now()
        req = urllib.request.Request(url, headers={"User-Agent": "genesis-source-fetch/1"})
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            final = r.geturl()
            status = r.status
        with open(path, "wb") as f:
            f.write(body)
        rec = {"sourceId": source_id, "kind": kind, "sourceUrl": url, "finalUrl": final,
               "httpStatus": status, "retrievedAt": at, "path": rel_path,
               "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
        self.records.append(rec)
        return body


def structure_meta(entry, polymers, nonpolymers):
    poly = []
    for p in polymers:
        ids = p.get("rcsb_polymer_entity_container_identifiers", {})
        ent = p.get("rcsb_polymer_entity", {})
        src = p.get("rcsb_entity_source_organism") or []
        poly.append({
            "entityId": ids.get("entity_id"),
            "description": ent.get("pdbx_description"),
            "chains": ids.get("auth_asym_ids"),
            "uniprot": ids.get("uniprot_ids"),
            "species": sorted({s.get("ncbi_scientific_name") for s in src if s.get("ncbi_scientific_name")}),
            "mutationsStated": ent.get("pdbx_mutation"),
            "engineeredMutationCount": p.get("entity_poly", {}).get("rcsb_mutation_count"),
            "polymerType": p.get("entity_poly", {}).get("rcsb_entity_polymer_type"),
        })
    lig = []
    for n in nonpolymers:
        c = n.get("pdbx_entity_nonpoly", {})
        lig.append({"compId": c.get("comp_id"), "name": c.get("name"),
                    "entityId": n.get("rcsb_nonpolymer_entity_container_identifiers", {}).get("entity_id")})
    info = entry.get("rcsb_entry_info", {})
    return {
        "method": [e.get("method") for e in entry.get("exptl", [])],
        "resolutionA": info.get("resolution_combined"),
        "title": entry.get("struct", {}).get("title"),
        "initialRelease": entry.get("rcsb_accession_info", {}).get("initial_release_date"),
        "polymerEntities": poly,
        "nonPolymerLigands": lig,
        "readFrom": "data.rcsb.org REST JSON saved alongside; values copied, not inferred",
    }


def main(out):
    f = Fetcher(out)
    summary = {"structures": {}, "reactome": {}, "hpa": {}, "chembl": {}}

    for pdb in STRUCTURES:
        d = "rcsb/%s" % pdb
        f.get(pdb, "https://files.rcsb.org/download/%s.cif" % pdb, d + "/%s.cif" % pdb, "mmCIF")
        entry = json.loads(f.get(pdb, "https://data.rcsb.org/rest/v1/core/entry/%s" % pdb,
                                 d + "/entry.json", "rcsb-entry"))
        ids = entry["rcsb_entry_container_identifiers"]
        polys = [json.loads(f.get(pdb, "https://data.rcsb.org/rest/v1/core/polymer_entity/%s/%s" % (pdb, e),
                                  d + "/polymer_entity_%s.json" % e, "rcsb-polymer-entity"))
                 for e in ids.get("polymer_entity_ids") or []]
        nonp = [json.loads(f.get(pdb, "https://data.rcsb.org/rest/v1/core/nonpolymer_entity/%s/%s" % (pdb, e),
                                 d + "/nonpolymer_entity_%s.json" % e, "rcsb-nonpolymer-entity"))
                for e in ids.get("non_polymer_entity_ids") or []]
        for a in ids.get("assembly_ids") or []:
            f.get(pdb, "https://data.rcsb.org/rest/v1/core/assembly/%s/%s" % (pdb, a),
                  d + "/assembly_%s.json" % a, "rcsb-assembly")
        lo = pdb.lower()
        try:
            f.get(pdb, "https://files.rcsb.org/pub/pdb/validation_reports/%s/%s/%s_validation.xml.gz"
                  % (lo[1:3], lo, lo), d + "/%s_validation.xml.gz" % lo, "wwpdb-validation-report")
        except Exception as e:  # recorded, never guessed
            summary.setdefault("notFetched", []).append({"sourceId": pdb, "what": "validation report", "error": str(e)})
        summary["structures"][pdb] = structure_meta(entry, polys, nonp)

    f.get("reactome-version", "https://reactome.org/ContentService/data/database/version",
          "reactome/database-version.txt", "reactome-version")
    for st in REACTOME:
        q = json.loads(f.get(st, "https://reactome.org/ContentService/data/query/enhanced/%s" % st,
                             "reactome/%s.enhanced.json" % st, "reactome-event"))
        f.get(st, "https://reactome.org/ContentService/data/participants/%s" % st,
              "reactome/%s.participants.json" % st, "reactome-participants")
        summary["reactome"][st] = {"displayName": q.get("displayName"), "schemaClass": q.get("schemaClass"),
                                   "species": q.get("speciesName")}

    h = json.loads(f.get(HPA_GENE, "https://www.proteinatlas.org/%s.json" % HPA_GENE,
                         "hpa/%s.json" % HPA_GENE, "hpa-gene"))
    f.get(HPA_GENE, "https://www.proteinatlas.org/%s.tsv" % HPA_GENE, "hpa/%s.tsv" % HPA_GENE, "hpa-gene-tsv")
    summary["hpa"] = {"gene": h.get("Gene"), "ensembl": h.get("Ensembl"), "uniprot": h.get("Uniprot")}

    st = json.loads(f.get("chembl-status", "https://www.ebi.ac.uk/chembl/api/data/status.json",
                          "chembl/status.json", "chembl-status"))
    summary["chembl"]["release"] = st.get("chembl_db_version")
    for a in CHEMBL_ASSAYS:
        j = json.loads(f.get(a, "https://www.ebi.ac.uk/chembl/api/data/assay/%s.json" % a,
                             "chembl/assay/%s.json" % a, "chembl-assay"))
        summary["chembl"][a] = {"descriptionPresent": bool(j.get("description")),
                                "target": j.get("target_chembl_id"), "organism": j.get("assay_organism")}

    with open(os.path.join(out, "SOURCES.json"), "w") as fh:
        json.dump({"kind": "glp1r-source-fetch", "rawFilesUnmodified": True,
                   "files": f.records, "summary": summary}, fh, indent=1)
        fh.write("\n")
    print(json.dumps(summary, indent=1)[:6000])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
