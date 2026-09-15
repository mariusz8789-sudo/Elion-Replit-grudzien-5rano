/**
 * D-083 — GLOBAL PIN MANIFEST with fail-closed custody across every pin.
 *
 * ======================= THE BUG THIS EXISTS TO NOT HAVE ==================
 *
 * The reviewed candidate package proposed:
 *
 *   manifest.pins.filter(p => loaded[p.pinSha256] !== undefined
 *                          && loaded[p.pinSha256] !== p.record.hashes.normalizedSha256)
 *
 * A pin that is ABSENT from `loaded` fails the first condition, so it is not
 * counted as a mismatch and the function returns ok:true. A manifest that
 * REQUIRES the GIPR pin, checked against an empty set, reported OK. That is
 * the precise inversion of fail-closed, and the package's own test asserted
 * the wrong direction (`expect(verifyPinDrift(m, {}).ok).toBe(true)`).
 *
 * Here the three states are distinct and only one of them passes:
 *   MISSING   a required pin is absent      -> FAIL
 *   DRIFTED   present, hash differs         -> FAIL
 *   VERIFIED  present, hash matches         -> pass
 *
 * A manifest with no pins at all is EMPTY_MANIFEST and also fails: an
 * evidence set assembled from nothing is not a verified evidence set.
 */

import { canonicalHash } from '../provenance.mjs';

export const PIN_ROLES = Object.freeze(['base', 'extension', 'auxiliary-patent']);

/**
 * One entry per pinned artifact. `normalizedSha256` is the hash of the
 * NORMALIZED rows as written by `writeActivityPin` — the same digest the
 * loader re-computes on every read — so a manifest check and a loader check
 * cannot disagree about what "the pin" means.
 */
export function pinEntry({ pinId, role, target, species, normalizedSha256, rows, source, license, retrievedAt }) {
  if (!PIN_ROLES.includes(role)) throw new Error(`FAIL_CLOSED[UNKNOWN_PIN_ROLE]: ${role}`);
  if (species !== 'Homo sapiens') throw new Error(`FAIL_CLOSED[NON_HUMAN_PIN]: ${species} — human-only is decided per row at ingestion and re-asserted here`);
  if (typeof normalizedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(normalizedSha256)) throw new Error('FAIL_CLOSED[PIN_HASH_MALFORMED]');
  if (typeof target !== 'string' || target.length === 0) throw new Error('FAIL_CLOSED[PIN_TARGET_MISSING]');
  return Object.freeze({ pinId, role, target, species, normalizedSha256, rows: Math.max(0, Math.trunc(rows ?? 0)), source: String(source ?? ''), license: String(license ?? 'UNSTATED'), retrievedAt: String(retrievedAt ?? '') });
}

export function buildPinManifest(pins, { requiredRoles = ['base'] } = {}) {
  const entries = Object.freeze([...pins]);
  return Object.freeze({
    pins: entries,
    requiredRoles: Object.freeze([...requiredRoles]),
    dedupKey: 'canonicalSmiles|assayId|standardType',
    onMismatch: 'FAIL_CLOSED',
    manifestFingerprint: canonicalHash({ pins: entries.map((p) => [p.pinId, p.normalizedSha256, p.role]), requiredRoles }).slice(0, 16),
  });
}

/**
 * Verifies every declared pin against what actually loaded.
 *
 * `loaded` maps pinId -> the sha256 the loader computed from the bytes on
 * disk. A pin the loader never produced simply is not a key here, which is
 * exactly the case the reviewed version let through.
 */
export function verifyPinManifest(manifest, loaded) {
  const missing = [];
  const drifted = [];
  const verified = [];

  for (const p of manifest.pins) {
    const actual = loaded?.[p.pinId];
    if (actual === undefined || actual === null) { missing.push(p.pinId); continue; }
    if (actual !== p.normalizedSha256) { drifted.push({ pinId: p.pinId, expected: p.normalizedSha256, actual }); continue; }
    verified.push(p.pinId);
  }

  const reasons = [];
  if (manifest.pins.length === 0) reasons.push('EMPTY_MANIFEST: no pin was declared, so nothing was verified — an evidence set assembled from nothing is not verified');
  for (const id of missing) reasons.push(`PIN_MISSING: "${id}" is declared in the manifest but did not load; a declared-and-absent pin is a failure, never a silent pass`);
  for (const d of drifted) reasons.push(`PIN_DRIFT: "${d.pinId}" loaded ${d.actual} but the manifest pins ${d.expected} — refusing a drifted artifact`);

  for (const role of manifest.requiredRoles) {
    const have = manifest.pins.some((p) => p.role === role && verified.includes(p.pinId));
    if (!have) reasons.push(`REQUIRED_ROLE_UNVERIFIED: no verified pin fills the required role "${role}"`);
  }

  return Object.freeze({
    ok: reasons.length === 0,
    missing: Object.freeze(missing),
    drifted: Object.freeze(drifted.map(Object.freeze)),
    verified: Object.freeze(verified),
    reasons: Object.freeze(reasons),
  });
}

/**
 * Cross-pin duplicate detection. A molecule measured in the same assay by two
 * sources is ONE observation, not two — counting it twice would inflate the
 * dataset toward a gate threshold, which is the quiet version of moving the
 * threshold. Both provenances are kept.
 */
export function mergePins(pinRowsById) {
  const byKey = new Map();
  const duplicates = [];
  for (const [pinId, rows] of Object.entries(pinRowsById)) {
    for (const r of rows) {
      const key = `${r.canonicalSmiles}|${r.assayId ?? ''}|${r.standardType}`;
      const existing = byKey.get(key);
      if (existing) {
        duplicates.push({ key, keptFrom: existing.sourcePins[0], alsoIn: pinId });
        existing.sourcePins.push(pinId);
        continue;
      }
      byKey.set(key, { ...r, sourcePins: [pinId] });
    }
  }
  const rows = [...byKey.values()];
  return Object.freeze({
    rows: Object.freeze(rows),
    duplicatesRemoved: duplicates.length,
    duplicates: Object.freeze(duplicates.map(Object.freeze)),
    mergeFingerprint: canonicalHash({ n: rows.length, dup: duplicates.length }).slice(0, 16),
  });
}
