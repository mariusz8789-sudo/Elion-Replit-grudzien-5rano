#!/usr/bin/env python3
"""GENESIS — Astex phase 2 preparation rules (NEW code; the run-3 path is untouched).

Three global rules, each defined on a chemically defined class and applied identically to
all 85 cases. Nothing here names a PDB id. The preregistered module
`scripts/astex-redock-benchmark.py` is imported, never modified, so run 3 stays replayable.

RULE 1 — multi-residue covalently linked ligands (`covalent_ligand_residues`)
    After the preregistered ligand residue is selected, any other HETATM residue whose heavy
    atoms come within covalent bonding distance of the ligand's heavy atoms is absorbed into
    the ligand, transitively. Bonding distance is element-dependent:
        d(A,B) <= r_cov(A) + r_cov(B) + LINK_TOLERANCE_A
    with Cordero (2008) covalent radii and LINK_TOLERANCE_A = 0.40 A — the same tolerance
    convention used by OpenBabel/ASE style connectivity perception. Water, single-atom metal
    ions, the crystallisation-additive list and any residue the cofactor rule already keeps
    are excluded from absorption, so the classes the pipeline already handles are untouched.

RULE 2 — modified amino-acid residues (`modified_amino_acid_residues`, `modified_residue_pdbqt`)
    A HETATM residue that carries a complete amino-acid backbone by atom name (N, CA, C, O),
    is not water / metal / additive / the ligand / an already-kept cofactor, AND whose backbone
    N or C is within covalent bonding distance (same criterion as rule 1) of a backbone N or C
    of an ATOM record, i.e. it is a residue OF the protein chain. It is kept as
    part of the rigid receptor, typed from its wwPDB CCD entry (as shipped in biotite) with
    the polymer leaving atoms (OXT and any template atom the deposited residue does not
    carry) removed from the template first, then RDKit AddHs + Meeko AD4 typing — the same
    machinery the preregistered cofactor path uses. A residue that cannot be typed is left
    out and the reason is recorded; it is never silently dropped.

RULE 3 — receptor protonation / histidine
    Audited, not changed. See `docs/evidence/astex-phase2-preparation-fixes.md`. The audit
    helper `histidine_audit` is here so the claim can be re-measured.
"""
import math
import os

# Cordero et al., Dalton Trans. 2008, 2832 — covalent radii in A.
COVALENT_RADII_A = {
    "H": 0.31, "B": 0.84, "C": 0.76, "N": 0.71, "O": 0.66, "F": 0.57, "SI": 1.11, "P": 1.07,
    "S": 1.05, "CL": 1.02, "AS": 1.19, "SE": 1.20, "BR": 1.20, "I": 1.39, "ZN": 1.22,
    "MG": 1.41, "CA": 1.76, "MN": 1.61, "FE": 1.52, "CO": 1.50, "NI": 1.24, "CU": 1.32,
    "NA": 1.66, "K": 2.03, "RU": 1.46, "PT": 1.36, "HG": 1.32, "CD": 1.44,
}
DEFAULT_RADIUS_A = 0.77
LINK_TOLERANCE_A = 0.40
BACKBONE_ATOM_NAMES = ("N", "CA", "C", "O")
POLYMER_LEAVING_ATOMS = ("OXT", "HXT", "OC2", "H2")


def _el(line):
    e = line[76:78].strip().upper()
    if e:
        return e
    return line[12:16].strip().lstrip("0123456789").upper()[:1]


def _xyz(line):
    return (float(line[30:38]), float(line[38:46]), float(line[46:54]))


def _radius(el):
    return COVALENT_RADII_A.get(el, DEFAULT_RADIUS_A)


def residue_key(line):
    return (line[17:20], line[21], line[22:27])


def residue_label(key):
    return "%s%s%s" % (key[0].strip(), (":" + key[1]) if key[1].strip() else "", key[2].strip())


def closest_contact(lines_a, lines_b):
    """(min distance, margin vs the covalent cutoff, atom names) over all heavy-atom pairs.

    margin > 0 means the pair is INSIDE covalent bonding distance."""
    best = None
    for la in lines_a:
        ea, (xa, ya, za) = _el(la), _xyz(la)
        for lb in lines_b:
            eb, (xb, yb, zb) = _el(lb), _xyz(lb)
            d = math.sqrt((xa - xb) ** 2 + (ya - yb) ** 2 + (za - zb) ** 2)
            cut = _radius(ea) + _radius(eb) + LINK_TOLERANCE_A
            rec = (d, cut - d, la[12:16].strip(), lb[12:16].strip(), cut)
            if best is None or d < best[0]:
                best = rec
    return best


def covalent_ligand_residues(pdb_text, lig_heavy, exclude_labels=(), is_hydrogen=None,
                             waters=(), metals=(), additives=()):
    """RULE 1. Returns (extra_heavy_lines, report).

    `lig_heavy` are the preregistered ligand residue's heavy-atom lines. Any other HETATM
    residue within covalent bonding distance is absorbed, transitively. `exclude_labels` are
    the residues the cofactor rule already keeps."""
    waters, metals, additives = set(waters), set(metals), set(additives)
    exclude = set(exclude_labels)
    lig_keys = {residue_key(l) for l in lig_heavy}
    groups = {}
    for l in pdb_text.splitlines():
        if not l.startswith("HETATM") or l[16] not in (" ", "A"):
            continue
        if is_hydrogen is not None and is_hydrogen(l):
            continue
        key = residue_key(l)
        if key in lig_keys:
            continue
        name = l[17:20].strip()
        if name in waters or name in metals or name in additives:
            continue
        if residue_label(key) in exclude:
            continue
        groups.setdefault(key, []).append(l)

    accepted, rejected = [], []
    current = list(lig_heavy)
    remaining = dict(groups)
    while True:
        added = None
        for key in sorted(remaining, key=residue_label):
            c = closest_contact(current, remaining[key])
            if c and c[1] > 0:
                added = (key, c)
                break
        if added is None:
            break
        key, c = added
        lines = remaining.pop(key)
        accepted.append({"residue": residue_label(key), "heavyAtoms": len(lines),
                         "bondLengthA": round(c[0], 3), "bondAtoms": "%s...%s" % (c[2], c[3]),
                         "covalentCutoffA": round(c[4], 3), "marginA": round(c[1], 3)})
        current = current + lines
    for key in sorted(remaining, key=residue_label):
        c = closest_contact(current, remaining[key])
        if c:
            rejected.append({"residue": residue_label(key), "heavyAtoms": len(remaining[key]),
                             "closestContactA": round(c[0], 3), "covalentCutoffA": round(c[4], 3),
                             "shortfallA": round(-c[1], 3)})
    rejected.sort(key=lambda r: r["closestContactA"])
    extra = [l for l in current if l not in lig_heavy]
    report = {"rule": "covalentLinkedLigandResidues", "toleranceA": LINK_TOLERANCE_A,
              "absorbed": accepted, "nearestRejected": rejected[:3],
              "changed": bool(accepted)}
    return extra, report


def modified_amino_acid_residues(pdb_text, lig_heavy, is_hydrogen=None,
                                 waters=(), metals=(), additives=(), exclude_labels=()):
    """RULE 2. HETATM residues that are amino-acid residues OF the protein chain.

    Class: a complete amino-acid backbone by atom name (N, CA, C, O) AND a backbone N or C
    within covalent bonding distance of a backbone N or C of an ATOM record. A free
    amino-acid-like small molecule (not peptide-bonded to the chain) is NOT in this class.

    Returns [(label, resname, lines, linkA)] sorted by label."""
    waters, metals, additives = set(waters), set(metals), set(additives)
    exclude = set(exclude_labels)
    lig_keys = {residue_key(l) for l in lig_heavy}
    groups = {}
    for l in pdb_text.splitlines():
        if not l.startswith("HETATM") or l[16] not in (" ", "A"):
            continue
        if is_hydrogen is not None and is_hydrogen(l):
            continue
        key = residue_key(l)
        if key in lig_keys:
            continue
        name = l[17:20].strip()
        if name in waters or name in metals or name in additives:
            continue
        if residue_label(key) in exclude:
            continue
        groups.setdefault(key, []).append(l)
    protein_bb = [l for l in pdb_text.splitlines()
                  if l.startswith("ATOM") and l[16] in (" ", "A")
                  and l[12:16].strip() in ("N", "C")
                  and not (is_hydrogen is not None and is_hydrogen(l))]
    out = []
    for key, lines in groups.items():
        names = {l[12:16].strip() for l in lines}
        if not all(b in names for b in BACKBONE_ATOM_NAMES):
            continue
        bb = [l for l in lines if l[12:16].strip() in ("N", "C")]
        c = closest_contact(bb, protein_bb) if protein_bb else None
        if not c or c[1] <= 0:
            continue
        out.append((residue_label(key), key[0].strip(), lines, round(c[0], 3)))
    out.sort(key=lambda t: t[0])
    return out


def ccd_subset_template(code, atom_names):
    """The CCD entry for `code` as an RDKit mol restricted to `atom_names`.

    Polymer leaving atoms (OXT ...) and any template atom the deposited residue does not carry
    are removed; open valences are filled with implicit hydrogens (a chemically capped fragment).
    Raises if the deposited residue carries an atom name the CCD entry does not know."""
    from rdkit import Chem
    import biotite.structure.info as info
    from biotite.interface import rdkit as brd
    ref = info.residue(code)
    tmpl = brd.to_mol(ref)
    names = list(ref.atom_name)
    if tmpl.GetNumAtoms() != len(names):
        raise ValueError("ccd_atom_count_mismatch")
    wanted = set(atom_names)
    unknown = wanted - set(names)
    if unknown:
        raise ValueError("atom_names_not_in_ccd: %s" % ",".join(sorted(unknown))[:60])
    em = Chem.RWMol(tmpl)
    # every hydrogen, and every heavy atom the deposited residue does not carry (OXT ...)
    drop = [i for i, n in enumerate(names)
            if tmpl.GetAtomWithIdx(i).GetSymbol() == "H" or n not in wanted]
    for i in sorted(drop, reverse=True):
        em.RemoveAtom(i)
    mol = em.GetMol()
    for a in mol.GetAtoms():
        a.SetNoImplicit(False)
        a.SetNumExplicitHs(0)
    Chem.SanitizeMol(mol)
    heavy_removed = sorted(str(n) for i, n in enumerate(names)
                           if tmpl.GetAtomWithIdx(i).GetSymbol() != "H" and n not in wanted)
    return mol, heavy_removed


def modified_residue_pdbqt(code, lines, path, elements_from_ccd):
    """RULE 2 typing: rigid AD4-typed PDBQT of a modified amino acid at its crystal coordinates."""
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from meeko import MoleculePreparation, PDBQTWriterLegacy
    names = [l[12:16].strip() for l in lines]
    tmpl, removed = ccd_subset_template(code, names)
    lines, _ = elements_from_ccd(lines, code)
    xtal = Chem.MolFromPDBBlock("\n".join(lines) + "\nEND\n", removeHs=False, sanitize=False,
                                proximityBonding=True)
    if xtal is None:
        raise ValueError("pdb_block_unreadable")
    mol = AllChem.AssignBondOrdersFromTemplate(tmpl, xtal)
    Chem.SanitizeMol(mol)
    molh = Chem.AddHs(mol, addCoords=True)
    setup = MoleculePreparation().prepare(molh)[0]
    pdbqt, ok, err = PDBQTWriterLegacy.write_string(setup)
    if not ok:
        raise ValueError("pdbqt_write_failed: %s" % err)
    atoms = [l for l in pdbqt.splitlines() if l.startswith(("ATOM", "HETATM"))]
    with open(path, "w") as f:
        f.write("\n".join(atoms) + "\n")
    return len(atoms), removed


def histidine_audit(receptor_pdbqt_text):
    """RULE 3 audit: histidine ND1/NE2 typing in a prepared receptor PDBQT.

    Meeko's AD4 types record the tautomer: a protonated ring nitrogen is NA/N with an attached
    HD, a deprotonated one is NA (acceptor only). Returns counts per (ND1 typed, NE2 typed)."""
    his = {}
    for l in receptor_pdbqt_text.splitlines():
        if not l.startswith(("ATOM", "HETATM")):
            continue
        res = l[17:20].strip()
        if res not in ("HIS", "HIE", "HID", "HIP"):
            continue
        key = (res, l[21], l[22:27].strip())
        name = l[12:16].strip()
        t = l[77:79].strip()
        if name in ("ND1", "NE2", "HD1", "HE2"):
            his.setdefault(key, {})[name] = t
    tally = {}
    for key, d in his.items():
        state = "HID" if "HD1" in d and "HE2" not in d else (
            "HIE" if "HE2" in d and "HD1" not in d else (
                "HIP" if "HD1" in d and "HE2" in d else "UNPROTONATED"))
        tally[state] = tally.get(state, 0) + 1
    return {"residues": len(his), "states": tally}
