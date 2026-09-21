/**
 * D-084 — endpoint-family separation.
 *
 * ======================== THE FINDING THIS ENFORCES ======================
 *
 * A harvest probe reported that the ChEMBL GLP-1R activity pages beyond the
 * first (offsets 1000/2000/3000) are 100% `standard_type = POTENCY`, with no
 * EC50/IC50/Ki/Kd at all. That is ~3000 rows — more than ten times the
 * current pin — sitting one HTTP call away from a model that is failing its
 * frozen gate by 0.0425 pActivity.
 *
 * Pouring them in would be the most tempting available cheat, and it would be
 * a cheat. `POTENCY` in ChEMBL is a catch-all for assay-specific potency
 * readouts whose underlying measurement, direction and units are not
 * commensurable with a Ki/Kd/IC50/EC50 binding-affinity series. Concatenating
 * them produces a larger dataset that measures something different, and the
 * resulting MAE would not be comparable to the number the frozen gate was
 * sealed against.
 *
 * NOTE ON PROVENANCE: this repository's egress is refused by proxy policy
 * (403 on CONNECT), so the 3000-row claim could NOT be independently verified
 * here. It is recorded as an UNVERIFIED UPSTREAM CLAIM. The rule below does
 * not depend on the claim being true — it is enforced on whatever rows are
 * actually presented at ingest.
 *
 * ============================ FAIL-CLOSED ENUM ==========================
 *   ENDPOINT_FAMILY_MIXING  rows from two families offered to one model
 *   UNKNOWN_ENDPOINT_TYPE   a standard_type outside every declared family
 */

/**
 * The family the frozen GLP-1R and GIPR gates were sealed against. These are
 * concentration-at-effect measurements that share a -log10(molar) scale, so a
 * single pActivity axis is meaningful across them.
 */
export const AFFINITY_FAMILY = Object.freeze(['EC50', 'IC50', 'Ki', 'Kd']);

/** Assay-specific potency readouts. A real family, but NOT the sealed one. */
export const POTENCY_FAMILY = Object.freeze(['POTENCY', 'AC50', 'ACTIVITY']);

export const ENDPOINT_FAMILIES = Object.freeze({
  AFFINITY: AFFINITY_FAMILY,
  POTENCY: POTENCY_FAMILY,
});

/**
 * Which family a standard_type belongs to, or null if this repository has
 * never classified it.
 *
 * The case-folding is done on BOTH sides. A first version folded only the
 * input and compared it against the mixed-case literals `Ki`/`Kd`, so the two
 * most common affinity endpoints in ChEMBL classified as UNKNOWN and would
 * have been refused as unclassifiable. Found by running it, not by reading it.
 */
const AFFINITY_UPPER = Object.freeze(AFFINITY_FAMILY.map((t) => t.toUpperCase()));
const POTENCY_UPPER = Object.freeze(POTENCY_FAMILY.map((t) => t.toUpperCase()));

export function familyOf(standardType) {
  const t = String(standardType ?? '').trim().toUpperCase();
  if (AFFINITY_UPPER.includes(t)) return 'AFFINITY';
  if (POTENCY_UPPER.includes(t)) return 'POTENCY';
  return null;
}

/**
 * The gate. Refuses any row set that is not wholly inside the family the
 * consuming model was sealed against.
 *
 * This is deliberately NOT a filter that silently drops the offending rows:
 * quietly discarding 3000 rows and reporting a clean run hides the fact that
 * a large, real dataset exists and is unusable for this model. The caller is
 * told, and must route them to their own pin.
 */
export function assertSingleEndpointFamily(rows, expectedFamily = 'AFFINITY') {
  const counts = new Map();
  const unknown = new Set();
  for (const r of rows) {
    const f = familyOf(r.standardType);
    if (f === null) { unknown.add(String(r.standardType ?? '(missing)')); continue; }
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }

  const reasons = [];
  if (unknown.size > 0) {
    reasons.push(`UNKNOWN_ENDPOINT_TYPE: ${[...unknown].sort().join(', ')} — this repository has never classified these, so it cannot know whether they are commensurable with ${expectedFamily}`);
  }
  const foreign = [...counts.keys()].filter((f) => f !== expectedFamily);
  for (const f of foreign) {
    reasons.push(`ENDPOINT_FAMILY_MIXING: ${counts.get(f)} row(s) of family ${f} were offered to a model sealed against ${expectedFamily}; a larger dataset that measures something else is not a larger dataset. Route them to their own pin.`);
  }

  return Object.freeze({
    ok: reasons.length === 0,
    expectedFamily,
    counts: Object.freeze(Object.fromEntries(counts)),
    unknownTypes: Object.freeze([...unknown].sort()),
    reasons: Object.freeze(reasons),
  });
}

/** Splits a mixed row set into per-family buckets so each can become its own pin. */
export function partitionByFamily(rows) {
  const out = { AFFINITY: [], POTENCY: [], UNCLASSIFIED: [] };
  for (const r of rows) out[familyOf(r.standardType) ?? 'UNCLASSIFIED'].push(r);
  return Object.freeze({
    AFFINITY: Object.freeze(out.AFFINITY),
    POTENCY: Object.freeze(out.POTENCY),
    UNCLASSIFIED: Object.freeze(out.UNCLASSIFIED),
  });
}
