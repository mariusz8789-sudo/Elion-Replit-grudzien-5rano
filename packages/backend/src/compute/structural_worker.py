"""Biopython PDB structural-comparison worker for Genesis Fabric.

Protocol: argv[1] is JSON. Output is exactly one JSON line. The worker performs
an auditable comparison of public deposited PDB structures 5GHW and 4G6F for
HIV MPER / broadly neutralizing antibody 10E8. It does not dock, model a
mutation, estimate affinity, or make a clinical prediction.

Required runtime configuration:
  GENESIS_BIOPYTHON_PYTHON  - interpreter containing Biopython
  GENESIS_PDB_STRUCTURES_DIR - directory containing verified 5GHW.pdb and 4G6F.pdb
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

EXPECTED_PDBS = {"5GHW", "4G6F"}
FAB_CHAINS = ("H", "L")
MPER_CHAIN = "P"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_structure(parser, root: Path, pdb_id: str):
    path = root / f"{pdb_id}.pdb"
    if not path.is_file():
        raise ValueError(f"missing_pdb_artifact:{pdb_id}")
    return parser.get_structure(pdb_id, path)[0], path


def standard_residues(chain):
    return [residue for residue in chain.get_residues() if residue.id[0] == " " and "CA" in residue]


def atom_pairs_by_residue_id(reference_chain, mobile_chain):
    reference = {residue.id[1]: residue for residue in standard_residues(reference_chain)}
    mobile = {residue.id[1]: residue for residue in standard_residues(mobile_chain)}
    pairs = []
    for residue_id in sorted(set(reference) & set(mobile)):
        ref_residue = reference[residue_id]
        mob_residue = mobile[residue_id]
        # Compare homologous, residue-identical C-alpha atoms only.
        if ref_residue.resname == mob_residue.resname:
            pairs.append((ref_residue["CA"], mob_residue["CA"], residue_id))
    return pairs


def detect():
    try:
        import Bio  # noqa: F401
        from Bio.PDB import PDBParser  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"biopython_unavailable:{exc}"}
    root = os.environ.get("GENESIS_PDB_STRUCTURES_DIR", "")
    if not root:
        return {"ok": False, "error": "missing_GENESIS_PDB_STRUCTURES_DIR"}
    directory = Path(root)
    missing = [pdb_id for pdb_id in sorted(EXPECTED_PDBS) if not (directory / f"{pdb_id}.pdb").is_file()]
    if missing:
        return {"ok": False, "error": f"missing_pdb_artifact:{','.join(missing)}"}
    import Bio
    return {"ok": True, "version": Bio.__version__, "artifacts": {pdb_id: sha256(directory / f"{pdb_id}.pdb") for pdb_id in sorted(EXPECTED_PDBS)}}


def compare(req):
    from Bio import __version__ as biopython_version
    from Bio.PDB import PDBParser, Superimposer

    reference_id = req.get("referencePdb", "")
    mobile_id = req.get("mobilePdb", "")
    if reference_id not in EXPECTED_PDBS or mobile_id not in EXPECTED_PDBS or reference_id == mobile_id:
        return {"ok": False, "error": "unsupported_pdb_pair"}

    root = Path(os.environ["GENESIS_PDB_STRUCTURES_DIR"])
    parser = PDBParser(QUIET=True)
    reference, reference_path = load_structure(parser, root, reference_id)
    mobile, mobile_path = load_structure(parser, root, mobile_id)

    fab_pairs = []
    for chain_id in FAB_CHAINS:
        fab_pairs.extend(atom_pairs_by_residue_id(reference[chain_id], mobile[chain_id]))
    if len(fab_pairs) < 3:
        return {"ok": False, "error": "insufficient_fab_ca_pairs"}

    superimposer = Superimposer()
    superimposer.set_atoms([pair[0] for pair in fab_pairs], [pair[1] for pair in fab_pairs])
    fab_rmsd = float(superimposer.rms)

    mper_pairs = atom_pairs_by_residue_id(reference[MPER_CHAIN], mobile[MPER_CHAIN])
    if len(mper_pairs) < 3:
        return {"ok": False, "error": "insufficient_mper_ca_pairs"}
    transformed_mobile = [pair[1].copy() for pair in mper_pairs]
    superimposer.apply(transformed_mobile)
    squared_distances = [
        float(((pair[0].coord - transformed.coord) ** 2).sum())
        for pair, transformed in zip(mper_pairs, transformed_mobile)
    ]
    mper_rmsd = float((sum(squared_distances) / len(squared_distances)) ** 0.5)

    return {
        "ok": True,
        "data": {
            "fab10e8RmsdAngstrom": fab_rmsd,
            "fabMatchedCaAtoms": len(fab_pairs),
            "mperInFabAlignedFrameRmsdAngstrom": mper_rmsd,
            "mperMatchedIdenticalCaAtoms": len(mper_pairs),
        },
        "engine": f"Biopython {biopython_version}",
        "provenance": {
            "method": "PDBParser + C-alpha least-squares superposition",
            "referencePdb": reference_id,
            "mobilePdb": mobile_id,
            "referenceSha256": sha256(reference_path),
            "mobileSha256": sha256(mobile_path),
            "fabChains": list(FAB_CHAINS),
            "mperChain": MPER_CHAIN,
            "requiredEnvironmentVariables": ["GENESIS_BIOPYTHON_PYTHON", "GENESIS_PDB_STRUCTURES_DIR"],
            "classification": "COMPUTATIONAL_RESULT",
        },
    }


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"bad_request:{exc}"}))
        return

    if req.get("cmd") == "detect":
        print(json.dumps(detect()))
        return
    if req.get("cmd") == "compare10e8Mper":
        status = detect()
        if not status.get("ok"):
            print(json.dumps(status))
            return
        try:
            print(json.dumps(compare(req)))
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": f"comparison_failed:{exc}"}))
        return
    print(json.dumps({"ok": False, "error": "unknown_command"}))


if __name__ == "__main__":
    main()
