"""Run 9 secondary analysis bins: thirds of the authors' sucos_shape_pocket_qcov similarity.

Seal A names the split ("the result split into thirds of the authors' sucos_shape_pocket_qcov
similarity") but not how to cut thirds or what to do with a case that has no value. Fixed here,
from the annotations alone, before any Run 9 docking, and pinned by seal B:
  * a case is matched to its annotations row by (system_id, ligand_instance_chain); exactly one row
    must match, otherwise the bins are refused;
  * cases with an empty or non-numeric value go to NO_SIMILARITY_VALUE, reported on their own and
    never imputed or moved into a third;
  * the rest are sorted by the value ascending (ties by drawKey) and cut into LOW / MID / HIGH with
    sizes as equal as possible, any remainder going to the lower thirds first.
The bins are descriptive: no verdict is taken from them.
"""
import csv
import math

COLUMN = "sucos_shape_pocket_qcov"
NAMES = ("LOW", "MID", "HIGH")
MISSING = "NO_SIMILARITY_VALUE"


def _value(text):
    try:
        v = float(text)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def similarity_bins(cases, annotations_csv):
    rows = {}
    with open(annotations_csv, newline="") as fh:
        for r in csv.DictReader(fh):
            rows.setdefault((r["system_id"], r["ligand_instance_chain"]), []).append(r)
    valued, missing = [], []
    for c in cases:
        match = rows.get((c["systemId"], c["ligandInstanceChain"]), [])
        if len(match) != 1:
            raise ValueError("annotations rows for %s: %d, expected 1" % (c["groupKey"], len(match)))
        v = _value(match[0][COLUMN])
        (missing if v is None else valued).append((v, c["drawKey"], c["pdbId"]))
    valued.sort()
    n, out = len(valued), {}
    base, extra = divmod(n, 3)
    start = 0
    for i, name in enumerate(NAMES):
        size = base + (1 if i < extra else 0)
        part = valued[start:start + size]
        start += size
        out[name] = {"pdbIds": [p for _, _, p in part],
                     "minValue": part[0][0] if part else None, "maxValue": part[-1][0] if part else None}
    out[MISSING] = {"pdbIds": sorted(p for _, _, p in missing)}
    return {"column": COLUMN, "bins": out}
