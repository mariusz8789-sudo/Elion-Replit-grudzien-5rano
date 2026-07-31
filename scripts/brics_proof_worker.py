#!/usr/bin/env python3
"""BRICS proof-of-capability worker — REAL RDKit BRICS, deterministic.

argv[1] = JSON config. Emits one JSON line:
  { ok, engine, fragments:[...], molecules:[canonical SMILES...] }
No RDKit -> honest failure (never faked).

Determinism: BRICSDecompose is order-deterministic; BRICSBuild is driven with a
fixed seed. Products are sanitized, canonicalized, validity-checked, deduplicated,
and sorted so the output (and therefore its downstream SHA-256 contentHash) is
byte-stable across runs.
"""
import sys
import json
import random


def main():
    try:
        cfg = json.loads(sys.argv[1])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_config: %s" % e}))
        return

    try:
        import rdkit
        from rdkit import Chem, RDLogger
        from rdkit.Chem import BRICS
        RDLogger.DisableLog("rdApp.*")
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "rdkit_unavailable: %s" % e}))
        return

    seed = int(cfg.get("seed", 42))
    max_products = int(cfg.get("maxProducts", 24))
    min_heavy = int(cfg.get("minHeavyAtoms", 6))
    max_heavy = int(cfg.get("maxHeavyAtoms", 40))
    scaffolds = cfg.get("referenceScaffolds", {})

    # Parse reference scaffolds (real, non-sensitive textbook compounds).
    mols = []
    for name, smi in sorted(scaffolds.items()):
        m = Chem.MolFromSmiles(smi)
        if m is None:
            print(json.dumps({"ok": False, "error": "invalid_reference:%s" % name}))
            return
        mols.append(m)

    # Real BRICS decomposition -> deterministic sorted fragment set.
    frag_set = set()
    for m in mols:
        for f in BRICS.BRICSDecompose(m):
            frag_set.add(f)
    fragments = sorted(frag_set)

    frag_mols = [Chem.MolFromSmiles(f) for f in fragments]
    frag_mols = [f for f in frag_mols if f is not None]

    # Deterministic reconstruction. BRICSBuild's randomness comes ONLY from
    # scrambleReagents; disabling it makes fragment combination order fixed, so
    # the output (and its downstream contentHash) is byte-stable. `uniquify`
    # deduplicates by canonical SMILES inside RDKit as well.
    random.seed(seed)  # provenance-recorded; no effect once scrambleReagents=False
    seen = set()
    products = []
    try:
        gen = BRICS.BRICSBuild(
            frag_mols, onlyCompleteMols=True, uniquify=True, scrambleReagents=False
        )
        for prod in gen:
            if prod is None:
                continue
            try:
                Chem.SanitizeMol(prod)
                canon = Chem.MolToSmiles(prod)
            except Exception:  # noqa: BLE001
                continue
            if not canon or canon in seen:
                continue
            check = Chem.MolFromSmiles(canon)
            if check is None:
                continue
            hv = check.GetNumHeavyAtoms()
            if hv < min_heavy or hv > max_heavy:
                continue
            seen.add(canon)
            products.append(canon)
            if len(products) >= max_products:
                break
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "brics_build_failed: %s" % e}))
        return

    molecules = sorted(seen)

    print(json.dumps({
        "ok": True,
        "engine": "RDKit " + rdkit.__version__,
        "fragments": fragments,
        "molecules": molecules,
    }))


if __name__ == "__main__":
    main()
