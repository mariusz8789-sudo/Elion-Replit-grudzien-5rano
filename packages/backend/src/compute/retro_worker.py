#!/usr/bin/env python3
"""Genesis worker for RETROSYNTHESIS ROUTE SEARCH — a thin bridge to AiZynthFinder.

AiZynthFinder (MolecularAI, MIT) is a published, peer-reviewed retrosynthesis planner: a Monte-Carlo
tree search over single-step disconnections proposed by a trained template-based expansion policy,
stopping when every leaf is a molecule in a purchasable stock. This file runs THAT engine and reports
what it returned. It contains no chemistry of its own: no template, no route, no scoring is written
here, and nothing is produced when the engine cannot run.

Running it requires the engine's published model data (expansion-policy ONNX + template library +
stock), which is NOT redistributable inside this repository. `GENESIS_RETRO_MODEL_DIR` must point at a
directory holding those files; `detect` reports exactly which are present, with their sha256, so a run
is always attributable to the exact model that produced it — and refuses to run when any is missing.

Commands (argv[1] is a JSON object):
  {"cmd":"detect"}
  {"cmd":"plan","smiles":"...","iterationLimit":100,"timeLimitSeconds":120,"maxRoutes":5}

A route returned here is a MODEL_ESTIMATE: a proposal from a policy trained on reaction literature. It
is not a validated procedure, carries no conditions, quantities or safety assessment, and only a
qualified chemist may decide whether any step is performed.
"""
import hashlib
import json
import os
import sys
import time

# The files AiZynthFinder's own `download_public_data` fetches, by role. Genesis does not ship them:
# they are ~1 GB and carry their own upstream licences.
REQUIRED_FILES = [
    ("expansion_policy_model", "uspto_model.onnx", "https://zenodo.org/record/7797465/files/uspto_model.onnx"),
    ("expansion_templates", "uspto_templates.csv.gz", "https://zenodo.org/record/7341155/files/uspto_unique_templates.csv.gz"),
    ("stock", "zinc_stock.hdf5", "https://ndownloader.figshare.com/files/23086469"),
]
OPTIONAL_FILES = [
    ("ringbreaker_policy_model", "uspto_ringbreaker_model.onnx", "https://zenodo.org/record/7797465/files/uspto_ringbreaker_model.onnx"),
    ("ringbreaker_templates", "uspto_ringbreaker_templates.csv.gz", "https://zenodo.org/record/7341155/files/uspto_ringbreaker_unique_templates.csv.gz"),
    ("filter_policy_model", "uspto_filter_model.onnx", "https://zenodo.org/record/7797465/files/uspto_filter_model.onnx"),
]


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _model_dir():
    return os.environ.get("GENESIS_RETRO_MODEL_DIR", "").strip()


def _inspect_models():
    """What model data is actually on disk, with checksums. Never guesses and never downloads."""
    directory = _model_dir()
    files = []
    for role, name, url in REQUIRED_FILES + OPTIONAL_FILES:
        path = os.path.join(directory, name) if directory else None
        present = bool(path) and os.path.isfile(path)
        files.append({
            "role": role,
            "filename": name,
            "required": any(role == r for r, _, _ in REQUIRED_FILES),
            "present": present,
            "bytes": os.path.getsize(path) if present else None,
            "sha256": _sha256(path) if present else None,
            "upstream": url,
        })
    missing = [f["filename"] for f in files if f["required"] and not f["present"]]
    return {
        "modelDir": directory or None,
        "files": files,
        "complete": not missing and bool(directory),
        "missing": missing,
    }


def _versions():
    import importlib.metadata as md

    out = {}
    for pkg in ("aizynthfinder", "rdkit", "rdchiral", "onnxruntime", "pandas", "numpy"):
        try:
            out[pkg] = md.version(pkg)
        except Exception:  # noqa: BLE001 - a missing package is reported, not raised
            out[pkg] = None
    return out


def _detect():
    try:
        from aizynthfinder.aizynthfinder import AiZynthFinder  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": "AIZYNTHFINDER_NOT_INSTALLED", "detail": str(exc)[:300], "versions": _versions()}
    models = _inspect_models()
    return {
        "ok": True,
        "engine": "AiZynthFinder",
        "versions": _versions(),
        "models": models,
        "runnable": models["complete"],
        "reason": None if models["complete"] else (
            "MODEL_FILES_MISSING: set GENESIS_RETRO_MODEL_DIR to a directory holding the engine's "
            "published model data (" + ", ".join(models["missing"] or [f[1] for f in REQUIRED_FILES]) + ")"
        ),
    }


def _config_dict(models):
    by_role = {f["role"]: os.path.join(models["modelDir"], f["filename"]) for f in models["files"] if f["present"]}
    expansion = {"uspto": [by_role["expansion_policy_model"], by_role["expansion_templates"]]}
    if "ringbreaker_policy_model" in by_role and "ringbreaker_templates" in by_role:
        expansion["ringbreaker"] = [by_role["ringbreaker_policy_model"], by_role["ringbreaker_templates"]]
    config = {"expansion": expansion, "stock": {"zinc": by_role["stock"]}}
    if "filter_policy_model" in by_role:
        config["filter"] = {"uspto": by_role["filter_policy_model"]}
    return config, sorted(expansion.keys())


def _plan(req):
    models = _inspect_models()
    if not models["complete"]:
        return {"ok": False, "error": "MODEL_FILES_MISSING", "models": models}
    smiles = req.get("smiles")
    if not isinstance(smiles, str) or not smiles.strip():
        return {"ok": False, "error": "SMILES_REQUIRED"}
    iteration_limit = int(req.get("iterationLimit", 100))
    time_limit = int(req.get("timeLimitSeconds", 120))
    max_routes = int(req.get("maxRoutes", 5))

    from aizynthfinder.aizynthfinder import AiZynthFinder

    config_dict, policies = _config_dict(models)
    finder = AiZynthFinder(configdict=config_dict)
    finder.expansion_policy.select(policies)
    finder.stock.select(list(finder.stock.items))
    if finder.filter_policy.items:
        finder.filter_policy.select(list(finder.filter_policy.items))
    finder.config.search.iteration_limit = iteration_limit
    finder.config.search.time_limit = time_limit
    finder.config.search.return_first = bool(req.get("returnFirst", False))

    finder.target_smiles = smiles
    started = time.time()
    finder.tree_search()
    search_seconds = time.time() - started
    finder.build_routes()

    stats = finder.extract_statistics()
    routes = []
    for index, (tree, score) in enumerate(zip(finder.routes.reaction_trees, finder.routes.scores)):
        if index >= max_routes:
            break
        reactions = []
        for reaction in tree.reactions():
            meta = dict(getattr(reaction, "metadata", {}) or {})
            reactions.append({
                "reactionSmiles": reaction.reaction_smiles(),
                "templateCode": meta.get("template_code"),
                "templateHash": meta.get("template_hash"),
                "classification": meta.get("classification"),
                "policyProbability": meta.get("policy_probability"),
                "policyName": meta.get("policy_name"),
            })
        leaves = [{"smiles": mol.smiles, "inStock": tree.in_stock(mol)} for mol in tree.leafs()]
        routes.append({
            "rank": index + 1,
            "score": score if isinstance(score, (int, float)) else dict(score),
            "steps": len(reactions),
            "reactions": reactions,
            "startingMaterials": leaves,
            "allStartingMaterialsInStock": all(leaf["inStock"] for leaf in leaves) if leaves else False,
            "tree": tree.to_dict(),
        })
    return {
        "ok": True,
        "engine": "AiZynthFinder",
        "versions": _versions(),
        "models": models,
        "target": smiles,
        "search": {
            "algorithm": finder.config.search.algorithm,
            "iterationLimit": iteration_limit,
            "timeLimitSeconds": time_limit,
            "iterations": stats.get("number_of_nodes"),
            "searchSeconds": round(search_seconds, 3),
            # Determinism holds when the ITERATION limit ended the search; a wall-clock cutoff makes a
            # replay machine-dependent, so the caller is told which one stopped it.
            "stoppedBy": "TIME_LIMIT" if search_seconds >= time_limit else "ITERATION_LIMIT",
            "policies": policies,
        },
        "solved": bool(stats.get("is_solved")),
        "routeCount": len(finder.routes),
        "routes": routes,
    }


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
        cmd = req.get("cmd")
        if cmd == "detect":
            print(json.dumps(_detect()))
        elif cmd == "plan":
            print(json.dumps(_plan(req)))
        else:
            print(json.dumps({"ok": False, "error": f"UNKNOWN_COMMAND:{cmd}"}))
    except Exception as exc:  # noqa: BLE001 - the caller needs a JSON error, never a traceback on stdout
        print(json.dumps({"ok": False, "error": type(exc).__name__, "detail": str(exc)[:500]}))


if __name__ == "__main__":
    main()
