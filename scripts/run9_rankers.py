"""Run 9 ranking rules - the candidate family frozen in seal A, as pure functions.

Seal A: docs/evidence/run9/run9-ranking-prereg.json, protocol.phaseD_development.candidateRankerFamily.
Every function takes a case's pooled poses (the dicts Run 8 stored, plus two per-pose features
added by the phase-D feature pass) and returns a NEW list, best first. Nothing here reads files,
draws random numbers or depends on dict or set iteration order.

Per-pose fields used:
  cnnScore, affinityKcalMol, seedIndex, rank   - as stored by Run 8
  plausible        - True if the pose passes every check in PLAUSIBILITY_CHECKS
  clusterSupport   - number of OTHER pooled poses within CLUSTER_RMSD_A of it
"""

CLUSTER_RMSD_A = 2.0

# The checks named in seal A, by their PoseBusters 0.6.x column names. 'protein-ligand_maximum_distance'
# is produced by the same PoseBusters module but is not a clash check and is not in seal A, so it is
# deliberately absent here.
PLAUSIBILITY_CHECKS = (
    "bond_lengths",
    "bond_angles",
    "internal_steric_clash",
    "aromatic_ring_flatness",
    "double_bond_flatness",
    "internal_energy",
    "minimum_distance_to_protein",
    "volume_overlap_with_protein",
)

# w in {0.3, 0.5, 0.7} as integer pairs, so the rank sum is exact integer arithmetic and a tie is
# a real tie, never a floating-point accident.
WEIGHTS = {"0.3": (3, 7), "0.5": (5, 5), "0.7": (7, 3)}


def vina_key(p):
    """Run 6/8 pooled order: Vina affinity ascending, then seed index, then rank."""
    return (p["affinityKcalMol"], p["seedIndex"], p["rank"])


def gnina_key(p):
    """Run 8 rule: CNNscore descending, ties by the pooled order."""
    return (-p["cnnScore"], p["affinityKcalMol"], p["seedIndex"], p["rank"])


def _ident(p):
    return (p["seedIndex"], p["rank"])


def c0(pool):
    return sorted(pool, key=gnina_key)


def vina(pool):
    return sorted(pool, key=vina_key)


def c1(pool, w):
    wg, wv = WEIGHTS[w]
    g = {_ident(p): i for i, p in enumerate(sorted(pool, key=gnina_key))}
    v = {_ident(p): i for i, p in enumerate(sorted(pool, key=vina_key))}
    return sorted(pool, key=lambda p: (wg * g[_ident(p)] + wv * v[_ident(p)],) + vina_key(p))


def plausible_subset(pool):
    """The C2 filter: drop implausible poses; if every pose is implausible, drop none."""
    kept = [p for p in pool if p["plausible"]]
    return kept if kept else list(pool)


def c2(pool, w):
    return c1(plausible_subset(pool), w)


def _support_tiebreak(ordered):
    """Among the first two, the one with more cluster support goes first; a tie keeps the order."""
    if len(ordered) < 2:
        return list(ordered)
    a, b = ordered[0], ordered[1]
    if b["clusterSupport"] > a["clusterSupport"]:
        return [b, a] + list(ordered[2:])
    return list(ordered)


def c3(pool, w):
    return _support_tiebreak(c2(pool, w))


def c4(pool):
    """Product-eligible arm, no GNINA: Vina order after the C2 filter, then the C3 tie-break."""
    return _support_tiebreak(sorted(plausible_subset(pool), key=vina_key))


# The nine selectable variants, in the tie-break order seal A fixes: fewer components first
# (C1 before C2 before C3), then w = 0.5 first. The order of this tuple IS the tie-break.
SELECTABLE = tuple(
    (name, fn, w)
    for name, fn in (("C1", c1), ("C2", c2), ("C3", c3))
    for w in ("0.5", "0.3", "0.7")
)


def variant_label(name, w):
    return "%s(%s)" % (name, w)


def select(top1_by_variant, c0_top1, denominator, floor_pp=2.0):
    """Seal A selection rule. `top1_by_variant` maps variant label -> top-1 count.

    Highest top-1 wins; ties go to the earliest entry of SELECTABLE. Returns the selected label, or
    NO_RANKER_SELECTED if the winner does not beat C0 by at least `floor_pp` percentage points."""
    best_label, best = None, -1
    for name, _fn, w in SELECTABLE:
        label = variant_label(name, w)
        if top1_by_variant[label] > best:
            best_label, best = label, top1_by_variant[label]
    gain_pp = 100.0 * (best - c0_top1) / denominator
    selected = best_label if gain_pp >= floor_pp else "NO_RANKER_SELECTED"
    return {"winner": best_label, "winnerTop1": best, "gainOverC0pp": round(gain_pp, 4),
            "floorPp": floor_pp, "selected": selected}
