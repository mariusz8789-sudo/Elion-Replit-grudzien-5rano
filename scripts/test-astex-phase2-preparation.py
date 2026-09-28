#!/usr/bin/env python3
"""Unit tests for the Astex phase-2 preparation rules (scripts/astex_phase2_prep.py).

    python3 scripts/test-astex-phase2-preparation.py [--data <p2rank-datasets>/joined/astex]

Tests that need deposited structures are skipped (and counted as skipped, never as passed)
when --data is not given and the default path does not exist. Everything else runs on
synthetic PDB text built inside the test, so the rules are tested, not the dataset.
"""
import argparse
import importlib.util
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "scripts"))
import astex_phase2_prep as P  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "astex_bench", os.path.join(REPO, "scripts/astex-redock-benchmark.py"))
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)

PASS, FAIL, SKIP = [], [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("%-6s %s%s" % ("ok" if cond else "FAIL", name, (" — " + detail) if detail else ""))


def skip(name, why):
    SKIP.append(name)
    print("%-6s %s — %s" % ("skip", name, why))


def atom(serial, name, res, chain, resseq, x, y, z, el, rec="HETATM"):
    return "%-6s%5d %-4s %3s %s%4d    %8.3f%8.3f%8.3f  1.00  0.00          %2s" % (
        rec, serial, (" " + name) if len(name) < 4 else name, res, chain, resseq, x, y, z, el)


def kw():
    return dict(is_hydrogen=B.is_hydrogen, waters=B.WATERS, metals=B.METALS, additives=B.ADDITIVES)


# ---------------------------------------------------------------- RULE 1
def test_rule1_synthetic():
    """A C-N pair at 1.35 A is absorbed; the same pair at 2.40 A is not."""
    lig = [atom(1, "C", "LIG", "L", 1, 0.0, 0.0, 0.0, "C")]
    for d, expect in ((1.35, True), (1.80, True), (1.90, False), (2.40, False)):
        other = [atom(2, "N", "OTH", "A", 2, d, 0.0, 0.0, "N")]
        extra, rep = P.covalent_ligand_residues("\n".join(lig + other), lig, **kw())
        check("rule1 C-N at %.2f A %s absorbed" % (d, "is" if expect else "is NOT"),
              bool(extra) == expect,
              "cutoff %.2f A" % (P.COVALENT_RADII_A["C"] + P.COVALENT_RADII_A["N"] + P.LINK_TOLERANCE_A))


def test_rule1_element_dependence():
    """The criterion is element-dependent, not a single hard-coded number: an S-S pair at
    2.10 A is a bond while a C-C pair at the same distance is not."""
    lig_s = [atom(1, "SG", "LIG", "L", 1, 0.0, 0.0, 0.0, "S")]
    oth_s = [atom(2, "SD", "OTH", "A", 2, 2.10, 0.0, 0.0, "S")]
    e1, _ = P.covalent_ligand_residues("\n".join(lig_s + oth_s), lig_s, **kw())
    lig_c = [atom(1, "C", "LIG", "L", 1, 0.0, 0.0, 0.0, "C")]
    oth_c = [atom(2, "C", "OTH", "A", 2, 2.10, 0.0, 0.0, "C")]
    e2, _ = P.covalent_ligand_residues("\n".join(lig_c + oth_c), lig_c, **kw())
    check("rule1 S-S at 2.10 A absorbed but C-C at 2.10 A not", bool(e1) and not e2)


def test_rule1_negative_second_copy():
    """NEGATIVE CASE: a second copy of the same ligand 4 A away must NOT be absorbed."""
    lig = [atom(1, "C1", "LIG", "L", 1, 0.0, 0.0, 0.0, "C"),
           atom(2, "N1", "LIG", "L", 1, 1.40, 0.0, 0.0, "N")]
    copy = [atom(3, "C1", "LIG", "A", 9, 4.00, 0.0, 0.0, "C"),
            atom(4, "N1", "LIG", "A", 9, 5.40, 0.0, 0.0, "N")]
    extra, rep = P.covalent_ligand_residues("\n".join(lig + copy), lig, **kw())
    # closest heavy-atom pair is LIG N1 (1.40) to copy C1 (4.00) = 2.60 A, well outside the
    # 1.87 A C-N covalent cutoff, so the copy is rejected and reported as the nearest contact.
    check("rule1 negative: second ligand copy 2.60 A away not absorbed",
          not extra and rep["nearestRejected"]
          and rep["nearestRejected"][0]["closestContactA"] == 2.6
          and rep["nearestRejected"][0]["shortfallA"] > 0,
          str(rep["nearestRejected"][:1]))


def test_rule1_negative_additive_and_water():
    """A glycerol and a water in contact distance are excluded by class, not by distance."""
    lig = [atom(1, "C1", "LIG", "L", 1, 0.0, 0.0, 0.0, "C")]
    gol = [atom(2, "O1", "GOL", "A", 5, 1.40, 0.0, 0.0, "O")]
    hoh = [atom(3, "O", "HOH", "A", 6, 0.0, 1.40, 0.0, "O")]
    zn = [atom(4, "ZN", "ZN", "A", 7, 0.0, 0.0, 1.50, "ZN")]
    extra, rep = P.covalent_ligand_residues("\n".join(lig + gol + hoh + zn), lig, **kw())
    check("rule1 negative: additive / water / metal never absorbed", not extra and not rep["absorbed"])


def test_rule1_excluded_cofactor():
    """A residue the cofactor rule already keeps is not absorbed even in bonding contact."""
    lig = [atom(1, "C1", "LIG", "L", 1, 0.0, 0.0, 0.0, "C")]
    cof = [atom(2, "N1", "FAD", "A", 8, 1.40, 0.0, 0.0, "N")]
    extra, _ = P.covalent_ligand_residues("\n".join(lig + cof), lig,
                                          exclude_labels=["FAD:A8"], **kw())
    check("rule1 respects the cofactor exclusion list", not extra)


def test_rule1_transitive():
    """Absorption is transitive: A-B-C chains are taken whole."""
    lig = [atom(1, "C1", "LIG", "L", 1, 0.0, 0.0, 0.0, "C")]
    b = [atom(2, "N1", "RB", "A", 2, 1.40, 0.0, 0.0, "N")]
    c = [atom(3, "C2", "RC", "A", 3, 2.80, 0.0, 0.0, "C")]
    extra, rep = P.covalent_ligand_residues("\n".join(lig + b + c), lig, **kw())
    check("rule1 transitive absorption of a 3-residue chain", len(extra) == 2 and len(rep["absorbed"]) == 2)


def test_rule1_1gkc(data):
    """1GKC: the deposited ligand is two BUM residues joined by a 1.35 A C-N bond."""
    path = os.path.join(data, "1gkc.pdb")
    txt = open(path).read()
    resname, heavy = B.ligand_lines(txt, "NFH")
    picked, _ = B.cofactor_residues(txt, heavy)
    extra, rep = P.covalent_ligand_residues(txt, heavy, exclude_labels=[p[0] for p in picked], **kw())
    check("rule1 1GKC: 10 -> 22 heavy atoms", len(heavy) == 10 and len(heavy) + len(extra) == 22,
          "absorbed %s" % [a["residue"] for a in rep["absorbed"]])
    a = rep["absorbed"][0] if rep["absorbed"] else {}
    check("rule1 1GKC: the accepted bond is 1.35 A with a positive margin",
          a.get("bondLengthA") == 1.35 and a.get("marginA", 0) > 0,
          "cutoff %s A, margin %s A" % (a.get("covalentCutoffA"), a.get("marginA")))
    # and the merged ligand must be chemically assignable from the CCD
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        used, _fixed = B.ligand_sdf(heavy + extra, resname, "NFH", os.path.join(td, "l.sdf"))
    check("rule1 1GKC: merged ligand matches the NFH CCD template", used == "NFH")


def test_rule1_all85_no_false_positive(data):
    """Over all 85, the only absorbed residue is 1GKC's, and the nearest rejected contact
    anywhere is far outside bonding distance."""
    import json
    prereg = json.load(open(B.PREREG))
    changed, nearest = [], []
    for c in prereg["cases"]:
        txt = open(os.path.join(data, c["pdbId"].lower() + ".pdb")).read()
        _rn, heavy = B.ligand_lines(txt, c["ligand"])
        picked, _ = B.cofactor_residues(txt, heavy)
        extra, rep = P.covalent_ligand_residues(txt, heavy, exclude_labels=[p[0] for p in picked], **kw())
        if extra:
            changed.append(c["pdbId"])
        for r in rep["nearestRejected"][:1]:
            nearest.append(r["closestContactA"])
    check("rule1 changes exactly one of the 85 (1GKC)", changed == ["1GKC"], str(changed))
    check("rule1 nearest rejected contact over all 85 is >= 4.0 A",
          nearest and min(nearest) >= 4.0, "min %.3f A" % min(nearest))


# ---------------------------------------------------------------- RULE 2
def test_rule2_ccd_template():
    """The CCD subset template drops OXT and caps the open valence."""
    from rdkit import Chem
    mol, removed = P.ccd_subset_template("CSO", ["N", "CA", "CB", "SG", "C", "O", "OD"])
    check("rule2 CSO template has 7 heavy atoms and drops OXT",
          mol.GetNumAtoms() == 7 and removed == ["OXT"], "removed %s" % removed)
    mol2, removed2 = P.ccd_subset_template("CME", ["N", "CA", "CB", "SG", "SD", "CE", "CZ", "OH", "C", "O"])
    check("rule2 CME template has 10 heavy atoms and drops OXT",
          mol2.GetNumAtoms() == 10 and removed2 == ["OXT"], "removed %s" % removed2)
    ok = False
    try:
        P.ccd_subset_template("CSO", ["N", "CA", "NOPE"])
    except ValueError as e:
        ok = "atom_names_not_in_ccd" in str(e)
    check("rule2 an atom name the CCD does not know is an error, not a silent drop", ok)


def test_rule2_synthetic_polymer_requirement():
    """A free amino acid not peptide-bonded to the chain is NOT a modified chain residue."""
    prot = [atom(1, "C", "ALA", "A", 10, 0.0, 0.0, 0.0, "C", rec="ATOM"),
            atom(2, "N", "ALA", "A", 11, 3.00, 0.0, 0.0, "N", rec="ATOM")]
    lig = [atom(9, "C1", "LIG", "L", 1, 50.0, 50.0, 50.0, "C")]
    linked = [atom(3, "N", "CSO", "A", 20, 1.33, 0.0, 0.0, "N"),
              atom(4, "CA", "CSO", "A", 20, 2.30, 0.0, 0.0, "C"),
              atom(5, "C", "CSO", "A", 20, 3.30, 0.0, 0.0, "C"),
              atom(6, "O", "CSO", "A", 20, 4.30, 0.0, 0.0, "O")]
    free = [atom(3, "N", "CSO", "A", 30, 20.0, 0.0, 0.0, "N"),
            atom(4, "CA", "CSO", "A", 30, 21.0, 0.0, 0.0, "C"),
            atom(5, "C", "CSO", "A", 30, 22.0, 0.0, 0.0, "C"),
            atom(6, "O", "CSO", "A", 30, 23.0, 0.0, 0.0, "O")]
    got = P.modified_amino_acid_residues("\n".join(prot + lig + linked + free), lig, **kw())
    check("rule2 keeps the peptide-bonded residue and rejects the free one",
          [g[0] for g in got] == ["CSO:A20"], str([g[0] for g in got]))


def test_rule2_real(data):
    """1MEH CSO A319 and 1XM6 CME A432 are found, typed, and written as rigid PDBQT."""
    import tempfile
    for pid, code, want in (("1MEH", "MOA", "CSO:A319"), ("1XM6", "5RM", "CME:A432")):
        txt = open(os.path.join(data, pid.lower() + ".pdb")).read()
        _rn, heavy = B.ligand_lines(txt, code)
        picked, _ = B.cofactor_residues(txt, heavy)
        mods = P.modified_amino_acid_residues(txt, heavy, exclude_labels=[p[0] for p in picked], **kw())
        labels = [m[0] for m in mods]
        check("rule2 %s finds %s" % (pid, want), want in labels, str(labels))
        m = [x for x in mods if x[0] == want][0]
        with tempfile.TemporaryDirectory() as td:
            n, removed = P.modified_residue_pdbqt(m[1], m[2], os.path.join(td, "m.pdbqt"), B.elements_from_ccd)
        check("rule2 %s types %s as rigid PDBQT" % (pid, want), n > len(m[2]),
              "%d heavy in, %d pdbqt atoms out, removed %s" % (len(m[2]), n, removed))


def test_rule2_all85(data):
    """Over all 85 the rule fires on exactly four cases and never fails to type a residue."""
    import json, tempfile
    prereg = json.load(open(B.PREREG))
    fired, untyped = [], []
    for c in prereg["cases"]:
        txt = open(os.path.join(data, c["pdbId"].lower() + ".pdb")).read()
        _rn, heavy = B.ligand_lines(txt, c["ligand"])
        picked, _ = B.cofactor_residues(txt, heavy)
        extra, _rep = P.covalent_ligand_residues(txt, heavy, exclude_labels=[p[0] for p in picked], **kw())
        mods = P.modified_amino_acid_residues(
            txt, heavy + extra, exclude_labels=[p[0] for p in picked], **kw())
        if mods:
            fired.append(c["pdbId"])
        with tempfile.TemporaryDirectory() as td:
            for label, rn, lines, _link in mods:
                try:
                    P.modified_residue_pdbqt(rn, lines, os.path.join(td, "m.pdbqt"), B.elements_from_ccd)
                except Exception as e:  # noqa: BLE001
                    untyped.append((c["pdbId"], label, str(e)[:60]))
    check("rule2 fires on exactly 1HVY, 1JLA, 1MEH, 1XM6",
          fired == ["1HVY", "1JLA", "1MEH", "1XM6"], str(fired))
    check("rule2 types every residue it keeps", not untyped, str(untyped))


# ---------------------------------------------------------------- RULE 3
def test_rule3_audit_helper():
    """The histidine audit reads AD4-typed PDBQT text and reports one state per residue."""
    hie = "\n".join([
        "ATOM      1  ND1 HIS A  10       0.000   0.000   0.000  0.00  0.00    -0.350 NA",
        "ATOM      2  NE2 HIS A  10       1.000   0.000   0.000  0.00  0.00    -0.350 N ",
        "ATOM      3  HE2 HIS A  10       2.000   0.000   0.000  0.00  0.00     0.160 HD",
    ])
    a = P.histidine_audit(hie)
    check("rule3 audit reports HIE for an NE2-protonated histidine",
          a == {"residues": 1, "states": {"HIE": 1}}, str(a))
    hip = hie + "\nATOM      4  HD1 HIS A  10       0.000   1.000   0.000  0.00  0.00     0.160 HD"
    check("rule3 audit reports HIP when both ring nitrogens carry H",
          P.histidine_audit(hip)["states"] == {"HIP": 1})


def test_rule3_no_rule_implemented():
    """RULE 3 deliberately adds no machinery: the module exposes an audit helper and nothing
    that sets a protonation state. This test fails if such a function is ever added without
    the evidence document being updated alongside it."""
    setters = [n for n in dir(P) if n.startswith(("set_protonation", "assign_his", "protonate"))]
    check("rule3 implements no protonation-setting function (audit only)", not setters, str(setters))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="/tmp/claude-0/p2r/joined/astex")
    args = ap.parse_args()
    from rdkit import RDLogger
    RDLogger.DisableLog("rdApp.*")

    test_rule1_synthetic()
    test_rule1_element_dependence()
    test_rule1_negative_second_copy()
    test_rule1_negative_additive_and_water()
    test_rule1_excluded_cofactor()
    test_rule1_transitive()
    test_rule2_ccd_template()
    test_rule2_synthetic_polymer_requirement()
    test_rule3_audit_helper()
    test_rule3_no_rule_implemented()

    if os.path.isdir(args.data):
        test_rule1_1gkc(args.data)
        test_rule1_all85_no_false_positive(args.data)
        test_rule2_real(args.data)
        test_rule2_all85(args.data)
    else:
        for n in ("rule1 1GKC", "rule1 all 85", "rule2 1MEH/1XM6", "rule2 all 85"):
            skip(n, "--data %s not present" % args.data)

    print("\n%d passed, %d failed, %d skipped" % (len(PASS), len(FAIL), len(SKIP)))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
