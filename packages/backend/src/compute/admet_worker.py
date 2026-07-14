#!/usr/bin/env python3
"""ADMET + Toxicity worker — REAL predictions via ADMET-AI (Swanson et al. 2024,
Bioinformatics, MIT license). Chemprop D-MPNN ensembles trained on the
Therapeutics Data Commons (TDC) ADMET Benchmark Group; pretrained weights are
bundled in the installed package (no network at inference). Short-lived
subprocess. Protocol: argv[1] is a JSON request {"cmd": ...}. Output is one
JSON line: {"ok": true, ...} or {"ok": false, "error": ...}. No admet-ai ->
import fails and the adapter treats the capability as unavailable (never faked).

Commands:
  detect            -> { ok, version }
  endpoints         -> { ok, endpoints: [...52 endpoint metadata rows...] }
  reference         -> real prediction on aspirin; checks determinism (two
                        independent predict() calls must match bit-for-bit)
                        and RDKit physchem cross-check (MW/logP within tight
                        tolerance of literature values). Endpoint predictions
                        are probabilistic ML outputs (published per-endpoint
                        AUROC/R^2 in the endpoint table, not 100% accuracy on
                        any single molecule) — the reference case therefore
                        validates EXECUTION and REPRODUCIBILITY, the two
                        properties that are actually deterministic, rather
                        than asserting a specific molecule's classification
                        as ground truth (which would misrepresent a
                        probabilistic model as infallible)
  predict {smiles}  -> real per-endpoint predictions for one or more SMILES

EVERY prediction is a MODEL_ESTIMATE from a trained ML ensemble — never
experimental evidence, never a therapeutic/clinical claim, never "SAFE" /
"NON-TOXIC" / "CLINICALLY SAFE" framing. Endpoint identity, model version, and
the endpoint's own published TDC benchmark metric (AUROC/AUPRC/R^2/MAE) are
always attached so the caller can judge applicability domain and confidence.
"""
import contextlib
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

_MODEL_CACHE = None


@contextlib.contextmanager
def _suppress_stdout():
    """Chemprop/Lightning/rich write progress bars straight to fd 1, bypassing
    sys.stdout redirection. Since this worker's contract is exactly one JSON
    line on stdout, redirect the real file descriptor to /dev/null for the
    noisy call and restore it before printing the result."""
    stdout_fd = sys.stdout.fileno()
    saved_fd = os.dup(stdout_fd)
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    try:
        sys.stdout.flush()
        os.dup2(devnull_fd, stdout_fd)
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, stdout_fd)
        os.close(devnull_fd)
        os.close(saved_fd)


def _endpoint_table():
    """Loads the bundled endpoint metadata (id/category/task_type/units/metric)."""
    from importlib import resources
    import csv
    with resources.path("admet_ai", "resources") as resources_dir:
        path = resources_dir / "data" / "admet.csv"
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            metric_name = "AUROC" if row.get("AUROC") else ("R^2" if row.get("R^2") else None)
            metric_value = None
            if metric_name and row.get(metric_name):
                try:
                    metric_value = float(row[metric_name])
                except ValueError:
                    metric_value = None
            rows.append({
                "id": row["id"], "name": row["name"], "category": row["category"],
                "taskType": row["task_type"], "units": row["units"],
                "publishedMetric": metric_name, "publishedMetricValue": metric_value,
                "source": "TDC ADMET Benchmark Group (Huang et al. 2021) via ADMET-AI (Swanson et al. 2024)",
            })
    return rows


def _get_model():
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        from admet_ai import ADMETModel
        _MODEL_CACHE = ADMETModel(num_workers=0)
    return _MODEL_CACHE


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_request: %s" % e}))
        return

    cmd = req.get("cmd")

    try:
        import admet_ai
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "admet_ai_unavailable: %s" % e}))
        return

    version = getattr(admet_ai, "__version__", "2.0.1")

    if cmd == "detect":
        print(json.dumps({"ok": True, "version": version}))
        return

    if cmd == "endpoints":
        try:
            print(json.dumps({"ok": True, "endpoints": _endpoint_table()}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "endpoints_failed: %s" % str(e)[:180]}))
        return

    if cmd == "reference":
        try:
            aspirin = "CC(=O)Oc1ccccc1C(=O)O"
            with _suppress_stdout():
                model = _get_model()
                r1 = model.predict(aspirin)
                r2 = model.predict(aspirin)  # second independent call -> must be bit-identical (determinism)
            deterministic = all(
                (abs(r1[k] - r2[k]) < 1e-9) if isinstance(r1.get(k), (int, float)) else (r1.get(k) == r2.get(k))
                for k in r1.keys()
            )

            mw = r1.get("molecular_weight")
            logp = r1.get("logP")
            mw_ok = mw is not None and abs(mw - 180.16) < 0.5   # aspirin MW = 180.16 g/mol (literature)
            logp_ok = logp is not None and abs(logp - 1.19) < 0.6  # aspirin Crippen logP ~1.19 (RDKit reference)

            expected_endpoints = {row["id"] for row in _endpoint_table()}
            present_endpoints = {k for k in r1.keys() if k in expected_endpoints}
            structure_ok = expected_endpoints.issubset(present_endpoints)

            passed = bool(deterministic and mw_ok and logp_ok and structure_ok)
            print(json.dumps({
                "ok": True, "version": version, "pass": passed,
                "case": "aspirin ADMET-AI prediction: execution + determinism + RDKit physchem cross-check + endpoint completeness",
                "checks": {
                    "deterministic_repeated_call": deterministic,
                    "molecular_weight": mw, "molecular_weight_expected": 180.16, "molecular_weight_ok": mw_ok,
                    "logP": logp, "logP_expected": 1.19, "logP_ok": logp_ok,
                    "all_52_published_endpoints_present": structure_ok,
                },
                "nEndpoints": len(present_endpoints),
                "note": "Per-endpoint classification/regression accuracy is NOT asserted here as ground truth "
                        "(these are probabilistic ML outputs with published TDC AUROC/R^2, not deterministic "
                        "physics) - see the 'endpoints' command for each endpoint's own literature benchmark metric.",
            }))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "reference_failed: %s" % str(e)[:200]}))
        return

    if cmd == "predict":
        smiles = req.get("smiles")
        if isinstance(smiles, str):
            smiles = [smiles]
        if not isinstance(smiles, list) or len(smiles) == 0:
            print(json.dumps({"ok": False, "error": "smiles_required"}))
            return
        if len(smiles) > 200:
            print(json.dumps({"ok": False, "error": "too_many_smiles (limit 200 per call)"}))
            return
        try:
            with _suppress_stdout():
                model = _get_model()
                preds = model.predict(smiles)  # a list input -> always a DataFrame indexed by input SMILES order
            # Use positional order (not the index label) since admet-ai indexes by SMILES string,
            # which breaks on duplicate inputs; position always matches the request list 1:1.
            results = {}
            for i, s in enumerate(smiles):
                row = preds.iloc[i].to_dict()
                results[s] = {k: (None if v != v else v) for k, v in row.items()}
            print(json.dumps({"ok": True, "version": version, "predictions": results}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "predict_failed: %s" % str(e)[:200]}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
