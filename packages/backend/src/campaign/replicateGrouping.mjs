/**
 * D-091 — the ONE definition of a replicate group.
 *
 * A REPLICATE is the same molecule, measured for the SAME endpoint, under at
 * least TWO GENUINELY DISTINCT ASSAYS. All three conditions are load-bearing:
 *
 *   same molecule      — otherwise it is not a repeat measurement
 *   same endpoint      — EC50 and IC50 are different physical quantities, so
 *                        their difference is disagreement, not noise (D-089
 *                        measured that gap at 1.7618 pActivity across 65
 *                        molecules; treating it as noise produced a spurious
 *                        "floor" of 1.1212 that is now recorded WITHDRAWN)
 *   >= 2 distinct assays — two rows from ONE assay are a duplicated record,
 *                        not an independent repeat. Counting them yields a
 *                        spread near zero and a falsely LOW noise floor, which
 *                        is the dangerous direction: it would make the data
 *                        look more reliable than it is.
 *
 * ===================== WHY THIS IS VERIFIED, NOT ASSUMED =================
 *
 * Measured on the frozen pin (287 rows): 25 distinct ChEMBL assay ids, ZERO
 * null or empty, all strings, no assay carrying more than one endpoint type,
 * and ZERO (molecule, assay) pairs appearing twice. So on THIS pin the
 * distinct-assay condition is currently redundant — `length >= 2` already
 * implies it. The condition stays anyway, because that redundancy is a
 * property of today's data, not of the rule: bulk sources routinely carry
 * several rows per assay, and the first extension would make it load-bearing.
 *
 * A guard that is currently inert is not a guard that is unnecessary.
 */

/** Rows must carry these fields or they cannot be grouped honestly. */
export const REQUIRED_ROW_FIELDS = Object.freeze(['canonicalSmiles', 'standardType', 'assayId', 'pActivity']);

export const REPLICATE_RULE = Object.freeze({
  definition: 'same canonicalSmiles + same standardType + >= 2 distinct assayId',
  minDistinctAssays: 2,
  /** Below this many groups, a median is an anecdote rather than a floor. Frozen in D-090. */
  minGroupsForNoiseFloor: 20,
});

function assertGroupable(row) {
  for (const f of REQUIRED_ROW_FIELDS) {
    if (row[f] === undefined || row[f] === null || row[f] === '') {
      throw new Error(`FAIL_CLOSED[ROW_NOT_GROUPABLE]: missing "${f}" — a row without assay provenance cannot be called a replicate`);
    }
  }
}

/**
 * Groups rows into replicates for ONE endpoint type. Returns the groups that
 * satisfy the full rule, plus the ones that were rejected and why — a count of
 * accepted groups alone hides whether the data had repeats at all.
 */
export function replicateGroups(rows, endpointType) {
  const byMolecule = new Map();
  for (const r of rows) {
    if (r.standardType !== endpointType) continue;
    assertGroupable(r);
    const k = r.canonicalSmiles;
    if (!byMolecule.has(k)) byMolecule.set(k, []);
    byMolecule.get(k).push(r);
  }

  const groups = [];
  let singleRecord = 0;
  let sameAssayOnly = 0;
  for (const [smiles, rs] of byMolecule) {
    if (rs.length < 2) { singleRecord += 1; continue; }
    const assays = new Set(rs.map((r) => r.assayId));
    if (assays.size < REPLICATE_RULE.minDistinctAssays) { sameAssayOnly += 1; continue; }
    const values = rs.map((r) => r.pActivity);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    groups.push(Object.freeze({
      canonicalSmiles: smiles,
      endpointType,
      n: rs.length,
      distinctAssays: assays.size,
      spread: Math.max(...values) - Math.min(...values),
      sd: Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)),
    }));
  }

  return Object.freeze({
    endpointType,
    molecules: byMolecule.size,
    groups: Object.freeze(groups),
    rejected: Object.freeze({ singleRecord, sameAssayOnly }),
  });
}

/** MEASURED only when the group count clears the frozen floor. Otherwise NOT_MEASURED, never an estimate. */
export function noiseFloorStatus(result, { minGroups = REPLICATE_RULE.minGroupsForNoiseFloor } = {}) {
  const n = result.groups.length;
  if (n < minGroups) {
    return Object.freeze({
      status: 'NOT_MEASURED',
      endpointType: result.endpointType,
      groups: n,
      required: minGroups,
      reason: `${n} replicate group(s) against a floor of ${minGroups}; a median quoted off this many groups would be an anecdote, not a noise floor`,
    });
  }
  const sds = result.groups.map((g) => g.sd).sort((a, b) => a - b);
  const spreads = result.groups.map((g) => g.spread).sort((a, b) => a - b);
  const med = (xs) => xs[Math.floor(xs.length / 2)];
  return Object.freeze({
    status: 'MEASURED',
    endpointType: result.endpointType,
    groups: n,
    medianSd: +med(sds).toFixed(4),
    medianSpread: +med(spreads).toFixed(4),
  });
}
