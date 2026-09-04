#!/usr/bin/env python3
"""Quantum-chemistry worker — REAL ab initio / DFT via PySCF, called by the Node adapter.

PySCF is mature, open-source (Apache-2.0) quantum chemistry. We run it in a
short-lived subprocess. Protocol: argv[1] is a JSON request {"cmd": ...}. Output
is a single JSON line: {"ok": true, ...} or {"ok": false, "error": ...}. No PySCF
-> import fails and the adapter treats the capability as unavailable (never faked).

Commands:
  detect                     -> { ok, version }
  reference                  -> runs the documented H2 RHF/STO-3G reference case
  singlepoint {atoms, charge, spin, basis, method}
                             -> real energy, HOMO/LUMO, dipole, Mulliken charges

Units: energy in Hartree (a.u.), orbital energies in Hartree and eV, dipole in
Debye. Geometry in Angstrom. This is a computational MODEL_ESTIMATE, not
experimental evidence. Semiempirical/low-basis results are NOT equivalent to
high-level ab initio; the method + basis are always reported.
"""
import sys
import json

HARTREE_TO_EV = 27.211386245988

# Metody dozwolone (jawna lista — bez wykonywania dowolnych łańcuchów z API).
METHODS = {"RHF", "UHF", "RKS", "UKS"}
# Bazy dozwolone (walidowane, powszechnie udokumentowane).
BASES = {"sto-3g", "3-21g", "6-31g", "6-31g*", "6-31g(d)", "cc-pvdz", "def2-svp"}
# Funkcjonały DFT dozwolone dla RKS/UKS.
XC = {"lda", "pbe", "b3lyp"}


def build_mol(gto, req):
    atoms = req.get("atoms")
    if not isinstance(atoms, list) or len(atoms) == 0:
        raise ValueError("atoms_required")
    if len(atoms) > 60:
        raise ValueError("too_many_atoms (limit 60)")
    lines = []
    for a in atoms:
        el = str(a.get("element", "")).strip()
        if not el or not el.isalpha() or len(el) > 2:
            raise ValueError("invalid_element: %r" % el)
        x, y, z = float(a["x"]), float(a["y"]), float(a["z"])
        for v in (x, y, z):
            if v != v or abs(v) > 1e4:
                raise ValueError("invalid_coordinate")
        lines.append("%s %.10f %.10f %.10f" % (el, x, y, z))
    basis = str(req.get("basis", "sto-3g")).lower()
    if basis not in BASES:
        raise ValueError("unsupported_basis: %s" % basis)
    charge = int(req.get("charge", 0))
    spin = int(req.get("spin", 0))  # 2S = n_alpha - n_beta
    if abs(charge) > 10 or spin < 0 or spin > 10:
        raise ValueError("charge/spin_out_of_range")
    mol = gto.M(atom="; ".join(lines), basis=basis, charge=charge,
                spin=spin, verbose=0)
    return mol, basis, charge, spin


def run_scf(scf, dft, mol, method, xc):
    if method == "RHF":
        mf = scf.RHF(mol)
    elif method == "UHF":
        mf = scf.UHF(mol)
    elif method == "RKS":
        mf = dft.RKS(mol); mf.xc = xc
    elif method == "UKS":
        mf = dft.UKS(mol); mf.xc = xc
    else:
        raise ValueError("unsupported_method: %s" % method)
    mf.max_cycle = 200
    energy = float(mf.kernel())
    return mf, energy


def homo_lumo(mol, mf, method):
    import numpy as np
    if method in ("RHF", "RKS"):
        mo_e = mf.mo_energy
        nocc = mol.nelectron // 2
        if nocc == 0 or nocc >= len(mo_e):
            return None, None
        return float(mo_e[nocc - 1]), float(mo_e[nocc])
    # UHF/UKS: alpha spin frontier orbitals
    mo_e = np.array(mf.mo_energy)
    occ = np.array(mf.mo_occ)
    e_occ = mo_e[0][occ[0] > 0] if mo_e.ndim == 2 else mo_e[occ > 0]
    e_vir = mo_e[0][occ[0] == 0] if mo_e.ndim == 2 else mo_e[occ == 0]
    homo = float(max(e_occ)) if len(e_occ) else None
    lumo = float(min(e_vir)) if len(e_vir) else None
    return homo, lumo


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_request: %s" % e}))
        return

    cmd = req.get("cmd")

    try:
        import pyscf
        from pyscf import gto, scf, dft
        import numpy as np  # noqa: F401
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "pyscf_unavailable: %s" % e}))
        return

    if cmd == "detect":
        print(json.dumps({"ok": True, "version": pyscf.__version__}))
        return

    if cmd == "reference":
        # Udokumentowany przypadek referencyjny: H2 @ 0.74 Å, RHF/STO-3G.
        # Wartość z literatury ~ -1.1168 Hartree (odtwarzalna).
        mol = gto.M(atom="H 0 0 0; H 0 0 0.74", basis="sto-3g",
                    charge=0, spin=0, verbose=0)
        mf = scf.RHF(mol)
        e = float(mf.kernel())
        print(json.dumps({"ok": True, "version": pyscf.__version__,
                          "case": "H2 RHF/STO-3G @0.74A",
                          "energyHartree": e, "converged": bool(mf.converged),
                          "expected": -1.1168, "tol": 0.02}))
        return

    if cmd == "singlepoint":
        try:
            method = str(req.get("method", "RHF")).upper()
            if method not in METHODS:
                raise ValueError("unsupported_method: %s" % method)
            xc = str(req.get("xc", "b3lyp")).lower()
            if method in ("RKS", "UKS") and xc not in XC:
                raise ValueError("unsupported_xc: %s" % xc)
            mol, basis, charge, spin = build_mol(gto, req)
            mf, energy = run_scf(scf, dft, mol, method, xc)
            homo, lumo = homo_lumo(mol, mf, method)
            try:
                dip = mf.dip_moment(verbose=0)
                import numpy as np
                dipole_debye = float(np.linalg.norm(dip))
            except Exception:  # noqa: BLE001
                dipole_debye = None
            gap = (lumo - homo) if (homo is not None and lumo is not None) else None
            data = {
                "energyHartree": round(energy, 8),
                "homoHartree": round(homo, 6) if homo is not None else None,
                "lumoHartree": round(lumo, 6) if lumo is not None else None,
                "homoLumoGapHartree": round(gap, 6) if gap is not None else None,
                "homoLumoGapEv": round(gap * HARTREE_TO_EV, 4) if gap is not None else None,
                "dipoleDebye": round(dipole_debye, 4) if dipole_debye is not None else None,
                "converged": bool(mf.converged),
                "nElectrons": int(mol.nelectron),
                "nBasisFunctions": int(mol.nao_nr()),
            }
            meta = {"method": method, "basis": basis, "charge": charge,
                    "multiplicity": spin + 1,
                    "xc": xc if method in ("RKS", "UKS") else None,
                    "engine": "PySCF %s" % pyscf.__version__}
            print(json.dumps({"ok": True, "data": data, "meta": meta}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "qm_failed: %s" % str(e)[:180]}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
