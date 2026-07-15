/**
 * Local Verified Bundle Adapter (Corpus Mandate Phases 5, 6, 20, 28).
 *
 * A first-class, production-capable adapter that ingests a `genesis-scientific-evidence-bundle-v1`:
 * an offline, SHA-256-verified scientific evidence snapshot. It FAILS CLOSED on hash mismatch,
 * missing provenance, missing/oversized payload, malformed/oversized manifest, unsupported
 * version, path traversal / absolute-path / symlink escape, and unsupported source service.
 * A corrupted bundle can NEVER quietly become scientific evidence.
 *
 * Raw payloads are preserved and referenced; normalized entities are projections carrying the
 * provenance (source, id, url, retrievedAt, contentHash, license, ingestionMode).
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseFor } from './parsers.mjs';
import { SOURCE_SERVICE, INGESTION_MODE, EVIDENCE_ORIGIN, RIGHTS, HASH_ALGO, PORT_STATUS, defaultOrigin } from './sourcePort.mjs';

export const SUPPORTED_MANIFEST_VERSION = 'genesis-scientific-evidence-bundle-v1';
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_ENTRIES = 10000;

function sha256File(absPath) { return createHash('sha256').update(readFileSync(absPath)).digest('hex'); }

/** Resolve a manifest-relative path and REFUSE any escape from the bundle root (traversal/symlink/absolute). */
function safeResolve(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) throw new Error('empty path');
  if (path.isAbsolute(rel)) throw new Error(`absolute path rejected: ${rel}`);
  if (rel.split(/[\\/]/).includes('..')) throw new Error(`path traversal rejected: ${rel}`);
  const resolved = path.resolve(root, rel);
  const rootReal = realpathSync(root);
  if (!(resolved === rootReal || resolved.startsWith(rootReal + path.sep))) throw new Error(`path escapes bundle root: ${rel}`);
  // Symlink escape: the real path (following links) must also stay inside the root.
  let real;
  try { real = realpathSync(resolved); } catch { throw new Error(`unresolvable path: ${rel}`); }
  if (!(real === rootReal || real.startsWith(rootReal + path.sep))) throw new Error(`symlink escapes bundle root: ${rel}`);
  return resolved;
}

/**
 * Open + validate a bundle directory. Returns an adapter implementing the source port.
 * Throws (fail-closed) on a structurally invalid or unsupported manifest.
 */
export function openBundle(bundleRoot) {
  const rootReal = realpathSync(bundleRoot);
  const manifestPath = safeResolve(rootReal, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (e) { throw new Error(`malformed manifest.json: ${e.message}`, { cause: e }); }
  if (!manifest || manifest.manifestVersion !== SUPPORTED_MANIFEST_VERSION) throw new Error(`unsupported manifest version: ${manifest?.manifestVersion}`);
  if (!Array.isArray(manifest.entries)) throw new Error('manifest.entries missing');
  if (manifest.entries.length > MAX_MANIFEST_ENTRIES) throw new Error('manifest too large');
  const ingestionMode = manifest.ingestionMode === INGESTION_MODE.TEST_FIXTURE ? INGESTION_MODE.TEST_FIXTURE : INGESTION_MODE.VERIFIED_BUNDLE;

  const index = new Map(); // `${service}:${sourceId}` -> entry
  for (const e of manifest.entries) {
    if (!e || typeof e !== 'object') throw new Error('malformed manifest entry');
    for (const k of ['entryId', 'sourceService', 'sourceId', 'payloadRef', 'contentHash', 'hashAlgorithm', 'provenanceRef']) {
      if (!e[k]) throw new Error(`manifest entry missing '${k}' (entryId=${e.entryId ?? '?'})`);
    }
    if (e.hashAlgorithm !== HASH_ALGO) throw new Error(`entry ${e.entryId}: unsupported hash algorithm ${e.hashAlgorithm} (require ${HASH_ALGO})`);
    if (!Object.values(SOURCE_SERVICE).includes(e.sourceService)) throw new Error(`entry ${e.entryId}: unsupported source service ${e.sourceService}`);
    const key = `${e.sourceService}:${e.sourceId}`;
    if (index.has(key)) throw new Error(`duplicate source identity ${key} (entry ${e.entryId})`);
    index.set(key, e);
  }

  function loadRaw(entry) {
    const payloadPath = safeResolve(rootReal, entry.payloadRef);
    const st = statSync(payloadPath);
    if (!st.isFile()) throw new Error(`payload is not a file: ${entry.payloadRef}`);
    if (st.size > MAX_PAYLOAD_BYTES) throw new Error(`payload too large (${st.size} bytes): ${entry.payloadRef}`);
    const actualHash = sha256File(payloadPath);
    if (actualHash !== entry.contentHash) throw new Error(`INTEGRITY FAILURE: ${entry.entryId} hash ${actualHash.slice(0, 12)}… != manifest ${String(entry.contentHash).slice(0, 12)}…`);
    // Provenance MUST exist and load.
    const provPath = safeResolve(rootReal, entry.provenanceRef);
    let provenance;
    try { provenance = JSON.parse(readFileSync(provPath, 'utf8')); } catch (e) { throw new Error(`missing/malformed provenance for ${entry.entryId}: ${e.message}`, { cause: e }); }
    const rawText = readFileSync(payloadPath, 'utf8');
    let raw;
    try { raw = JSON.parse(rawText); } catch (e) { throw new Error(`malformed payload JSON for ${entry.entryId}: ${e.message}`, { cause: e }); }
    return { raw, rawText, provenance, payloadPath };
  }

  function normalize(entry) {
    const { raw, provenance } = loadRaw(entry);
    const entity = parseFor(entry.sourceService, raw); // parser may throw on malformed → fail closed
    const rights = Object.values(RIGHTS).includes(entry.license) ? entry.license : RIGHTS.UNKNOWN;
    const origin = ingestionMode === INGESTION_MODE.TEST_FIXTURE ? EVIDENCE_ORIGIN.TEST_FIXTURE : defaultOrigin(entry.sourceService);
    const normalizedProvenance = {
      provenanceId: provenance.provenanceId ?? `prov_${entry.entryId}`,
      sourceService: entry.sourceService, sourceType: entry.sourceType ?? entry.sourceService, sourceId: entry.sourceId,
      sourceUrl: entry.sourceUrl ?? provenance.sourceUrl ?? null, retrievedAt: provenance.retrievedAt ?? entry.retrievedAt ?? null,
      contentHash: entry.contentHash, hashAlgorithm: entry.hashAlgorithm,
      license: rights, sourceVersion: provenance.sourceVersion ?? null, rawPayloadReference: entry.payloadRef,
      parserVersion: entry.parserVersion ?? 'v1', ingestionMode, evidenceOrigin: origin,
    };
    return { status: PORT_STATUS.OK, entity, provenance: normalizedProvenance, rawPayloadReference: entry.payloadRef };
  }

  return {
    manifestVersion: manifest.manifestVersion, ingestionMode,
    bundleId: manifest.bundleId ?? null, campaignId: manifest.campaignId ?? null,
    size: index.size,
    capabilities: () => ({ modes: [ingestionMode], services: [...new Set(manifest.entries.map((e) => e.sourceService))] }),
    listEntries: () => [...index.values()].map((e) => ({ entryId: e.entryId, sourceService: e.sourceService, sourceId: e.sourceId })),
    getById(sourceService, sourceId) {
      const entry = index.get(`${sourceService}:${sourceId}`);
      if (!entry) return { status: PORT_STATUS.NOT_FOUND, reason: `no entry ${sourceService}:${sourceId}` };
      return normalize(entry); // throws (fail-closed) on integrity/parse failure — caller must not swallow
    },
    query(sourceService) {
      const entries = [...index.values()].filter((e) => e.sourceService === sourceService);
      return { status: PORT_STATUS.OK, entities: entries.map((e) => normalize(e)) };
    },
    // Verify the WHOLE bundle up front (used by the importer / E2E). Returns per-entry result.
    verifyAll() {
      const results = [];
      for (const e of index.values()) {
        try { normalize(e); results.push({ entryId: e.entryId, ok: true }); }
        catch (err) { results.push({ entryId: e.entryId, ok: false, error: err.message }); }
      }
      return { ok: results.every((r) => r.ok), results };
    },
  };
}
