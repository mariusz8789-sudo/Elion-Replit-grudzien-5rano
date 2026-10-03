#!/usr/bin/env python3
"""Freeze seal B for Run 9 from two independent phase D runs. Docks nothing, opens no Run 9 result.

Refuses unless seal A's fingerprint recomputes, the two phase D outputs are byte-identical (the
determinism proof: same inputs, different worker counts) and neither stopped with FIX REQUIRED.
Writes, in docs/evidence/run9/:
  run9-phase-d-result.json   the phase D output (one of the two identical files)
  run9-similarity-bins.json  seal A's secondary similarity thirds, from the annotations only
  run9-seal-b.json           {"seal": ..., "sealFingerprintSha256": sha256(json.dumps(seal, sort_keys=True))}

Usage: run9-seal-b.py --phase-d A.json --phase-d-repeat B.json --gnina PATH --gt-tar PATH
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import run9_similarity_bins as SB  # noqa: E402

D = "docs/evidence/run9"
SEAL_A = D + "/run9-ranking-prereg.json"
CASES = D + "/seal-b-draft/fresh-set-cases.json"
DRAFT = D + "/seal-b-draft/seal-b-draft-manifest.json"
ANNOT = "docs/evidence/source-data/zenodo-14794785-runs-n-poses/v18366081/annotations.csv"
DOWNLOAD = "docs/evidence/source-data/zenodo-14794785-runs-n-poses/DOWNLOAD.json"
PHASE_D_OUT = D + "/run9-phase-d-result.json"
BINS_OUT = D + "/run9-similarity-bins.json"
SEAL_B_OUT = D + "/run9-seal-b.json"
RUN8_PREREG = "docs/evidence/posebusters-unseen-benchmark-prereg.json"
RUN8_RESULT = "docs/evidence/posebusters-run8-unseen-benchmark.json"
RUN9_CODE = ["scripts/run9_rankers.py", "scripts/run9-phase-d.py", "scripts/run9_gnina_receptor.py",
             "scripts/run9_fresh_inputs.py", "scripts/run9_similarity_bins.py", "scripts/run9-final.py",
             "scripts/posebusters-unseen-benchmark.py", "scripts/test-run9-rankers.py"]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase-d", required=True)
    ap.add_argument("--phase-d-repeat", required=True)
    ap.add_argument("--gnina", required=True)
    ap.add_argument("--gt-tar", required=True)
    a = ap.parse_args(argv)
    os.chdir(ROOT)

    sa = json.load(open(SEAL_A))
    fp_a = hashlib.sha256(json.dumps(sa["protocol"], sort_keys=True).encode()).hexdigest()
    if fp_a != sa["protocolFingerprintSha256"]:
        sys.exit("STOP / FIX REQUIRED: seal A fingerprint does not recompute")
    h1, h2 = sha(a.phase_d), sha(a.phase_d_repeat)
    if h1 != h2:
        sys.exit("STOP / FIX REQUIRED: phase D is not deterministic (%s vs %s)" % (h1, h2))
    pd = json.load(open(a.phase_d))
    if "stopped" in pd or pd.get("kind") != "RUN9_PHASE_D" or pd.get("sealAFingerprint") != fp_a:
        sys.exit("STOP / FIX REQUIRED: phase D output is not a completed run under this seal A")

    shutil.copyfile(a.phase_d, PHASE_D_OUT)
    cases = json.load(open(CASES))
    with open(BINS_OUT, "w") as fh:
        json.dump(SB.similarity_bins(cases, ANNOT), fh, indent=1, sort_keys=True)
        fh.write("\n")

    import meeko
    import posebusters
    import rdkit
    import vina
    import biotite
    run8 = json.load(open(RUN8_PREREG))["protocol"]["codeIdentity"]["pinnedFileSha256"]
    dl = json.load(open(DOWNLOAD))
    seal = {
        "kind": "run9-seal-b",
        "sealA": {"path": SEAL_A, "sha256": sha(SEAL_A), "protocolFingerprintSha256": fp_a},
        "selectedRanker": pd["selection"]["selected"],
        "phaseD": {"path": PHASE_D_OUT, "sha256": h1, "selection": pd["selection"], "top1": pd["top1"],
                   "run8Reproduction": pd.get("run8Reproduction"),
                   "determinism": "two independent runs with different worker counts, byte-identical output"},
        "caseList": {"file": CASES, "sha256": sha(CASES), "cases": len(cases)},
        "drawManifest": {"file": DRAFT, "sha256": sha(DRAFT)},
        "freshData": {"zenodoConcept": "14794785", "zenodoRecord": "18366081", "download": DOWNLOAD,
                      "downloadSha256": sha(DOWNLOAD),
                      "annotations": {"file": ANNOT, "sha256": sha(ANNOT)},
                      "groundTruthTarGzSha256": sha(a.gt_tar)},
        "similarityBins": {"file": BINS_OUT, "sha256": sha(BINS_OUT)},
        "pinnedFileSha256": dict(sorted({**{p: sha(p) for p in RUN9_CODE}, **run8}.items())),
        "run8Inputs": {"prereg": {"file": RUN8_PREREG, "sha256": sha(RUN8_PREREG)},
                       "result": {"file": RUN8_RESULT, "sha256": sha(RUN8_RESULT)}},
        "gninaBinarySha256": sha(a.gnina),
        "versions": {"vina": vina.__version__, "meeko": meeko.__version__, "rdkit": rdkit.__version__,
                     "biotite": biotite.__version__, "posebusters": posebusters.__version__,
                     "python": sys.version.split()[0]},
        "unchangedFromSealA": "candidates, weights, selection rule, +2.0 pp floor, fresh-set rule, 300-case "
                              "size, success definition, verdict thresholds and prediction",
        "rule": "Run 9 phase F runs once, only on the owner's explicit GO, with scripts/run9-final.py, "
                "which refuses if anything above has changed.",
    }
    for p, want in run8.items():
        if sha(p) != want:
            sys.exit("STOP / FIX REQUIRED: Run 8 pinned file changed: %s" % p)
    doc = {"seal": seal, "sealFingerprintSha256": hashlib.sha256(json.dumps(seal, sort_keys=True).encode()).hexdigest(),
           "fingerprintRecipe": "sha256(json.dumps(seal, sort_keys=True))"}
    with open(SEAL_B_OUT, "w") as fh:
        json.dump(doc, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(json.dumps({"selectedRanker": seal["selectedRanker"], "sealB": doc["sealFingerprintSha256"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
