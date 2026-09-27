/**
 * Scientific Resource Layer (Phase 3E — ZEFIR).
 *
 * A strict import path for scientific data. Egress is currently blocked, so a REMOTE
 * fetch returns BLOCKED_BY_RESOURCES (never faked) — but a legitimate LOCAL_CURATED or
 * USER_PROVIDED resource can be imported to activate previously-blocked workflows
 * (e.g. a real target structure enabling docking). Every resource records source
 * identity/type, license, version, content hash, parser version, validation status.
 * We do not fake COCONUT / RCSB / patent data.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';

export const RESOURCE_TYPE = Object.freeze({
  LOCAL_CURATED_RESOURCE: 'LOCAL_CURATED_RESOURCE', USER_PROVIDED_RESOURCE: 'USER_PROVIDED_RESOURCE',
  REMOTE_VERIFIED_RESOURCE: 'REMOTE_VERIFIED_RESOURCE', SYNTHETIC_TEST_FIXTURE: 'SYNTHETIC_TEST_FIXTURE',
});
export const VALIDATION_STATUS = Object.freeze({ VALIDATED: 'VALIDATED', UNVALIDATED: 'UNVALIDATED', REJECTED: 'REJECTED' });

/** Import a local/user/synthetic resource. `content` is hashed for provenance. A
 * SYNTHETIC_TEST_FIXTURE is force-labelled so it can never masquerade as real. */
export function importResource(db, { resourceId, sourceIdentity = null, sourceType, license = null, version = null, parserVersion = null, content, validate = null }) {
  if (!resourceId) throw new Error('resourceId required');
  if (!Object.values(RESOURCE_TYPE).includes(sourceType)) throw new Error(`invalid sourceType: ${sourceType}`);
  const contentHash = canonicalHash(content ?? {});
  let validationStatus = VALIDATION_STATUS.UNVALIDATED;
  if (typeof validate === 'function') validationStatus = validate(content) ? VALIDATION_STATUS.VALIDATED : VALIDATION_STATUS.REJECTED;
  const meta = { synthetic: sourceType === RESOURCE_TYPE.SYNTHETIC_TEST_FIXTURE };
  return store.saveResource(db, { resourceId, sourceIdentity, sourceType, license, version, contentHash, parserVersion, validationStatus, meta });
}

/** A remote fetch. Egress is blocked in this environment → BLOCKED_BY_RESOURCES,
 * honestly, with no fabricated content. `fetcher` is injectable for future use. */
export function requestRemote(db, { resourceId, url, fetcher = null }) {
  if (typeof fetcher !== 'function') {
    return { ok: false, status: 'BLOCKED_BY_RESOURCES', reason: `remote egress blocked; cannot fetch ${url}. Provide a LOCAL_CURATED or USER_PROVIDED resource instead.` };
  }
  try {
    const content = fetcher(url);
    const r = importResource(db, { resourceId, sourceIdentity: url, sourceType: RESOURCE_TYPE.REMOTE_VERIFIED_RESOURCE, content });
    return { ok: true, resource: r };
  } catch (e) {
    return { ok: false, status: 'BLOCKED_BY_RESOURCES', reason: String(e?.message ?? e).slice(0, 160) };
  }
}

export function getResource(db, resourceId) { return store.getResource(db, resourceId); }
export function listResources(db) { return store.listResources(db); }
