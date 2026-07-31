#!/usr/bin/env python3
"""Protein-structure ingestion & validation worker — REAL parsing via Biopython.

Biopython (BSD) is a mature bioinformatics library. Short-lived subprocess.
Protocol: argv[1] is a JSON request {"cmd": ...}. Output is a single JSON line.
Missing engine -> import fails and the adapter treats the capability as
unavailable (never faked).

Commands:
  detect                 -> { ok, version }
  reference              -> parses a tiny embedded valid PDB (ingestion validation)
  validate {pdb}         -> real structural validation report from PDB text

Never silently modifies a structure. If material preparation decisions are
required (missing atoms, alt-locs, multiple models), returns needsPreparation +
ADDITIONAL_INPUT_REQUIRED so the user/campaign must approve a strategy.
"""
import io
import json
import sys
import warnings

# Minimalny, poprawny PDB (dwie reszty ALA) — do walidacji potoku ingestii.
REFERENCE_PDB = """HEADER    GENESIS REFERENCE (software validation)
ATOM      1  N   ALA A   1      -0.677  -1.230  -0.491  1.00  0.00           N
ATOM      2  CA  ALA A   1      -0.001   0.064  -0.491  1.00  0.00           C
ATOM      3  C   ALA A   1       1.499  -0.110  -0.491  1.00  0.00           C
ATOM      4  O   ALA A   1       2.030  -1.227  -0.502  1.00  0.00           O
ATOM      5  CB  ALA A   1      -0.509   0.856   0.708  1.00  0.00           C
ATOM      6  N   ALA A   2       2.203   1.006  -0.480  1.00  0.00           N
ATOM      7  CA  ALA A   2       3.660   1.014  -0.469  1.00  0.00           C
ATOM      8  C   ALA A   2       4.220   2.428  -0.469  1.00  0.00           C
ATOM      9  O   ALA A   2       3.486   3.417  -0.485  1.00  0.00           O
ATOM     10  CB  ALA A   2       4.180   0.271   0.759  1.00  0.00           C
TER      11      ALA A   2
END
"""

# Minimalny zbiór atomów szkieletu oczekiwany dla reszty aminokwasowej.
BACKBONE = {"N", "CA", "C", "O"}


def validate_pdb(pdb_text):
    from Bio.PDB import PDBParser, is_aa
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure("s", io.StringIO(pdb_text))

    models = list(structure)
    n_models = len(models)
    chains = []
    n_residues = 0
    n_hetero = 0
    n_waters = 0
    n_aa = 0
    altloc_atoms = 0
    residues_missing_backbone = []
    coord_invalid = 0

    model = models[0] if models else None
    if model is not None:
        for chain in model:
            cres = 0
            for res in chain:
                cres += 1
                n_residues += 1
                hetflag = res.id[0]
                if hetflag == "W":
                    n_waters += 1
                elif hetflag.strip():
                    n_hetero += 1
                atom_names = set()
                for atom in res:
                    atom_names.add(atom.get_name())
                    if atom.is_disordered():
                        altloc_atoms += 1
                    c = atom.get_coord()
                    if any((v != v or abs(float(v)) > 1e5) for v in c):
                        coord_invalid += 1
                if is_aa(res, standard=True):
                    n_aa += 1
                    missing = BACKBONE - atom_names
                    if missing:
                        residues_missing_backbone.append(
                            {"chain": chain.id, "resSeq": res.id[1], "resName": res.get_resname(),
                             "missing": sorted(missing)})
            chains.append({"id": chain.id, "residues": cres})

    needs_prep = bool(n_models > 1 or altloc_atoms > 0 or residues_missing_backbone or n_hetero > 0)
    reasons = []
    if n_models > 1:
        reasons.append("multiple_models (%d) — wybór modelu wymagany" % n_models)
    if altloc_atoms > 0:
        reasons.append("alternate_locations (%d atomów) — wybór altloc wymagany" % altloc_atoms)
    if residues_missing_backbone:
        reasons.append("missing_backbone_atoms (%d reszt)" % len(residues_missing_backbone))
    if n_hetero > 0:
        reasons.append("heteroatoms/ligands (%d) — decyzja o zachowaniu/usunięciu" % n_hetero)

    return {
        "parseable": True,
        "models": n_models,
        "chains": chains,
        "residues": n_residues,
        "aminoAcids": n_aa,
        "heteroResidues": n_hetero,
        "waters": n_waters,
        "alternateLocationAtoms": altloc_atoms,
        "residuesMissingBackbone": residues_missing_backbone[:50],
        "invalidCoordinates": coord_invalid,
        "needsPreparation": needs_prep,
        "preparationReasons": reasons,
        "status": "ADDITIONAL_INPUT_REQUIRED" if needs_prep else "READY",
    }


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_request: %s" % e}))
        return

    cmd = req.get("cmd")

    try:
        import Bio
        from Bio.PDB import PDBParser  # noqa: F401
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "biopython_unavailable: %s" % e}))
        return

    if cmd == "detect":
        print(json.dumps({"ok": True, "version": Bio.__version__}))
        return

    if cmd == "reference":
        try:
            report = validate_pdb(REFERENCE_PDB)
            passed = (report["parseable"] and report["chains"] == [{"id": "A", "residues": 2}]
                      and report["aminoAcids"] == 2 and report["invalidCoordinates"] == 0)
            print(json.dumps({"ok": True, "version": Bio.__version__, "pass": bool(passed),
                              "case": "2-residue ALA PDB ingestion validation", "report": report}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "protein_reference_failed: %s" % str(e)[:180]}))
        return

    if cmd == "validate":
        pdb_text = req.get("pdb")
        if not isinstance(pdb_text, str) or len(pdb_text) < 20:
            print(json.dumps({"ok": False, "error": "pdb_text_required"}))
            return
        if len(pdb_text) > 8_000_000:
            print(json.dumps({"ok": False, "error": "pdb_too_large"}))
            return
        try:
            report = validate_pdb(pdb_text)
            print(json.dumps({"ok": True, "version": Bio.__version__, "report": report}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "pdb_parse_failed: %s" % str(e)[:180]}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
