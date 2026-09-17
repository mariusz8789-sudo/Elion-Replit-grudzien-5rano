/**
 * D-084 — cross-source independence.
 *
 * ======================== THE FINDING THIS ENFORCES ======================
 *
 * A harvest probe reported that PubChem assay AID 2240461 ("Agonist activity
 * at ... human GIPR ... cAMP accumulation") carries `aid_source.db = ChEMBL`
 * with source id CHEMBL6113419 — i.e. it is a ChEMBL DEPOSIT re-served by
 * PubChem, not an independent measurement.
 *
 * This matters because the GIPR axis is 4 training rows short of its frozen
 * MIN_TRAIN. Importing PubChem GIPR assays would appear to close that gap.
 * But re-importing ChEMBL's own rows under PubChem identifiers would count
 * the SAME observations twice: the dataset would cross the gate threshold
 * without a single new measurement existing anywhere in the world. That is
 * moving the threshold with extra steps, and it is exactly what the standing
 * rule against "filtering to get a green result" forbids.
 *
 * NOTE ON PROVENANCE: egress is refused by proxy policy here (403 on CONNECT),
 * so the AID 2240461 claim could NOT be independently verified in this
 * runtime. It is recorded as an UNVERIFIED UPSTREAM CLAIM. The filter does
 * not rely on it: it reads `aid_source` from whatever payload arrives.
 *
 * ============================ FAIL-CLOSED ENUM ==========================
 *   PUBCHEM_SHAPE_MISMATCH   the payload is not a PubChem assay description
 *   CROSS_SOURCE_DUPLICATE   the assay is a deposit of a source already pinned
 */

/**
 * Databases whose records this repository ALREADY holds as primary pins.
 * An aggregator record that originates from one of these is a duplicate of
 * something we have, never an addition to it.
 */
export const ALREADY_PINNED_SOURCES = Object.freeze(['ChEMBL']);

/** Fail-closed parse of a PubChem assay description payload. Throws rather than guessing. */
export function parseAssayDescription(json) {
  const descr = json?.PC_AssayContainer?.[0]?.assay?.descr;
  if (!descr || typeof descr.aid?.id !== 'number') {
    throw new Error('FAIL_CLOSED[PUBCHEM_SHAPE_MISMATCH]: payload is not a PubChem assay description; refusing to guess at its provenance');
  }
  const db = descr.aid_source?.db ?? {};
  return Object.freeze({
    aid: descr.aid.id,
    sourceDb: typeof db.name === 'string' ? db.name : 'UNKNOWN',
    sourceId: typeof db.source_id?.str === 'string' ? db.source_id.str : '',
    name: typeof descr.name === 'string' ? descr.name : '',
  });
}

/**
 * Is this assay an independent observation, or a re-serving of a source we
 * already pin?
 *
 * UNKNOWN provenance is NOT independent. An aggregator record that does not
 * say where it came from cannot be shown to be new, and "we could not tell"
 * has to fail the same way as "we could tell, and it was a duplicate".
 */
export function assessIndependence(meta, alreadyPinned = ALREADY_PINNED_SOURCES) {
  if (meta.sourceDb === 'UNKNOWN' || meta.sourceDb === '') {
    return Object.freeze({
      independent: false,
      code: 'CROSS_SOURCE_DUPLICATE',
      reason: `assay AID ${meta.aid} declares no originating database; unprovenanced data cannot be shown to be independent of the pins already held, and unknown provenance fails closed`,
    });
  }
  if (alreadyPinned.includes(meta.sourceDb)) {
    return Object.freeze({
      independent: false,
      code: 'CROSS_SOURCE_DUPLICATE',
      reason: `assay AID ${meta.aid} is a ${meta.sourceDb} deposit (${meta.sourceId || 'no source id'}) re-served by PubChem; this repository already pins ${meta.sourceDb} directly, so importing it would count the same observations twice`,
    });
  }
  return Object.freeze({ independent: true, code: 'INDEPENDENT_SOURCE', reason: `assay AID ${meta.aid} originates from ${meta.sourceDb}, which is not among the sources already pinned` });
}

/** Convenience predicate over a raw payload. Throws on shape, false on duplicate. */
export function isIndependentAssay(json, alreadyPinned = ALREADY_PINNED_SOURCES) {
  return assessIndependence(parseAssayDescription(json), alreadyPinned).independent;
}

/** Partitions parsed assay metadata into what may be ingested and what must be refused. */
export function partitionAssays(metas, alreadyPinned = ALREADY_PINNED_SOURCES) {
  const independent = [];
  const duplicates = [];
  for (const m of metas) {
    const a = assessIndependence(m, alreadyPinned);
    (a.independent ? independent : duplicates).push(Object.freeze({ ...m, assessment: a }));
  }
  return Object.freeze({ independent: Object.freeze(independent), duplicates: Object.freeze(duplicates) });
}
