"""Run 9: stage one Runs N' Poses system for the unchanged Run 8 preparation.

Run 8 built each receptor input with build_receptor_pdb() from a whole deposited mmCIF and handed
it, with the ligand's CCD code, to prepare_case(). Runs N' Poses distributes one directory per
PLINDER system: system.cif (the system's receptor chains plus its ligand chains), receptor.cif,
and one SDF per ligand chain. This adapter feeds system.cif through the SAME frozen
build_receptor_pdb() - model 1, first altloc, hydrogens dropped, every other atom kept, long chain
ids remapped - so the ligand is found, typed from the CCD and boxed exactly as in Run 8.

What this changes against Run 8, stated rather than hidden: Run 8 saw the whole deposited entry,
this sees the PLINDER system, so chains and cofactors PLINDER did not assign to the system are
absent from the receptor. That is a property of the distribution, it is the same for every arm
of the comparison, and it is fixed here before any fresh-set structure is opened.
"""
import hashlib
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
_RUN8 = os.path.join(HERE, "posebusters-unseen-benchmark.py")


def _run8():
    spec = importlib.util.spec_from_file_location("run8_runner_for_run9", _RUN8)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def stage_fresh_inputs(case, gt_root, data_dir):
    """Write data_dir/<pdbid>.pdb from <gt_root>/<systemId>/system.cif. Never raises for a bad
    input: returns {"ok": False, "reason": ...} so the case is counted as a failure."""
    sysdir = os.path.join(gt_root, case["systemId"])
    cif = os.path.join(sysdir, "system.cif")
    if not os.path.exists(cif):
        return {"ok": False, "reason": "missing_system_cif", "path": cif}
    pdb = os.path.join(data_dir, case["pdbId"].lower() + ".pdb")
    try:
        _run8().build_receptor_pdb(case["pdbId"], cif, pdb)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": "build_receptor_pdb_failed: %s" % str(e)[:200]}
    return {"ok": True, "systemCif": cif, "systemCifSha256": sha256_file(cif),
            "pdb": pdb, "receptorInputPdbSha256": sha256_file(pdb),
            "ligandCcd": case["ligandCcd"]}
