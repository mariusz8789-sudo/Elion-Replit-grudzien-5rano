/* global AbortSignal */
/**
 * D-149 — live scientific ingestion with a hash on every fetch.
 *
 * Four public sources (PDB/RCSB, ChEMBL, UniProt, ClinicalTrials.gov), one
 * function. Every attempt records the exact URL, the HTTP status, the sha256
 * of the RAW payload bytes, the byte count and the time, and an access status
 * that is never inferred:
 *
 *   LIVE             — HTTP 200 from the allowlisted URL, non-empty body; the
 *                      sha256 is of those bytes and of nothing else.
 *   NO_ACCESS        — the network refused, timed out, or answered non-200.
 *                      The reason travels with the result (`error`,
 *                      `httpStatus`). Nothing is substituted.
 *   PINNED_FALLBACK  — the live attempt failed AND a hash-recorded copy for
 *                      that EXACT id already exists in this repository. The
 *                      result names the file, its sha256 (re-computed from the
 *                      bytes on disk, compared with the recorded one) and what
 *                      the file is (a prepared receptor, a narrowed extraction)
 *                      so it is never mistaken for a live download.
 *
 * Allowlist mirrors biotechProxy.mjs (D-085): the id is validated by a
 * per-source regex BEFORE a URL is built, the URL is checked against a host +
 * path-prefix allowlist, redirects are re-validated hop by hop, and a live
 * result is never cached. An id that does not match its source's pattern is
 * rejected without any network call.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from './determinism.mjs';
import { allowlistedBiotechUrl } from './biotechProxy.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_REDIRECT_HOPS = 3;
/** Raw payloads are hashed in full, but a single PDB or trial record is well under this. */
export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Pinned copies already in the repository, keyed by source then by the exact
 * id. `recordedSha256` is what the repo's own provenance file says the bytes
 * should hash to (SOURCE.json / meta.json); `nature` says what the file IS,
 * because neither is the raw upstream payload.
 */
const PINNED = {
  pdb: {
    '1IEP': {
      path: 'packages/backend/src/compute/targets/abl1-1iep/1iep_receptorH.pdb',
      recordedSha256: '5f6aee6029f9a2a2c2be32d4eb948ae70808690573e1b69a0850cdffd7048ca7',
      recordedIn: 'packages/backend/src/compute/targets/abl1-1iep/SOURCE.json',
      nature: 'PDB 1IEP chain A, ligand and waters removed, hydrogens added (AutoDock Vina tutorial input) — a PREPARED receptor, not the raw RCSB file',
    },
  },
  clinicaltrials: {
    NCT03987919: {
      path: 'packages/frontend/src/core/biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json',
      recordedSha256: '385c58a1b7a19bedac0bb303846a8cffb23242d912edd7fc91fa93d5b278a8b0',
      recordedIn: 'packages/frontend/src/core/biotechData/a2-ozempic-substitute/meta.json (narrowSha256)',
      nature: 'narrowed extraction of the ClinicalTrials.gov v2 record (SURPASS-2 semaglutide safety reference); the raw payload hash recorded at fetch time was 1e72fb8ddc9131e0a384d49b83ed2b5ed17915d805458fbc4c659d8c06f70f12 (120327 bytes) and the raw bytes are NOT in the repository',
    },
  },
};

export const INGESTION_SOURCES = Object.freeze({
  pdb: Object.freeze({
    label: 'PDB / RCSB',
    idPattern: '^[1-9][A-Za-z0-9]{3}$',
    allowlist: 'https://files.rcsb.org/download/<ID>.pdb',
    accept: 'text/plain',
    defaultId: '1IEP',
  }),
  chembl: Object.freeze({
    label: 'ChEMBL',
    idPattern: '^CHEMBL[0-9]{1,9}$',
    allowlist: 'https://www.ebi.ac.uk/chembl/api/data/molecule/<ID>.json (biotechProxy allowlist)',
    accept: 'application/json',
    defaultId: 'CHEMBL941',
  }),
  uniprot: Object.freeze({
    label: 'UniProt',
    // Official UniProtKB accession grammar (6 or 10 characters).
    idPattern: '^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$',
    allowlist: 'https://rest.uniprot.org/uniprotkb/<ACC>.json',
    accept: 'application/json',
    defaultId: 'P00519',
  }),
  clinicaltrials: Object.freeze({
    label: 'ClinicalTrials.gov',
    idPattern: '^NCT[0-9]{8}$',
    allowlist: 'https://clinicaltrials.gov/api/v2/studies/<NCT>',
    accept: 'application/json',
    defaultId: 'NCT03987919',
  }),
});

const ALLOWED_PREFIXES = [
  { host: 'files.rcsb.org', pathPrefix: '/download/' },
  { host: 'rest.uniprot.org', pathPrefix: '/uniprotkb/' },
  { host: 'clinicaltrials.gov', pathPrefix: '/api/v2/studies/' },
];

/** Same shape as allowlistedBiotechUrl: URL object when allowed, null otherwise. ChEMBL defers to the existing allowlist. */
export function allowlistedIngestionUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2_000) return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (ALLOWED_PREFIXES.some(({ host, pathPrefix }) => parsed.hostname === host && parsed.pathname.startsWith(pathPrefix))) return parsed;
  return allowlistedBiotechUrl(rawUrl);
}

/** Validates the id against its source's grammar and returns the canonical id, or null. */
export function normalizeIngestionId(source, id) {
  const spec = INGESTION_SOURCES[source];
  if (!spec || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  // All four grammars are upper-case; a lower-case PDB id ("1iep") is the same entry.
  const canonical = trimmed.toUpperCase();
  return new RegExp(spec.idPattern).test(canonical) ? canonical : null;
}

/** Deterministic URL per source for a VALIDATED id — never built from an unvalidated string. */
export function buildIngestionUrl(source, canonicalId) {
  switch (source) {
    case 'pdb': return `https://files.rcsb.org/download/${canonicalId}.pdb`;
    case 'chembl': return `https://www.ebi.ac.uk/chembl/api/data/molecule/${canonicalId}.json`;
    case 'uniprot': return `https://rest.uniprot.org/uniprotkb/${canonicalId}.json`;
    case 'clinicaltrials': return `https://clinicaltrials.gov/api/v2/studies/${canonicalId}`;
    default: return null;
  }
}

/** The repo's pinned copy for this exact id, hashed from disk right now, or null. */
export function pinnedCopyFor(source, canonicalId, { repoRoot = REPO_ROOT } = {}) {
  const entry = PINNED[source]?.[canonicalId];
  if (!entry) return null;
  const abs = path.join(repoRoot, entry.path);
  if (!existsSync(abs)) return null;
  const bytes = readFileSync(abs);
  const sha256 = sha256Hex(bytes);
  return {
    path: entry.path,
    sha256,
    bytes: bytes.byteLength,
    recordedSha256: entry.recordedSha256,
    recordedIn: entry.recordedIn,
    matchesRecord: sha256 === entry.recordedSha256,
    nature: entry.nature,
  };
}

async function readBodyBytes(response) {
  const buf = new Uint8Array(await response.arrayBuffer());
  if (buf.byteLength > MAX_PAYLOAD_BYTES) throw new Error(`payload_too_large:${buf.byteLength}`);
  return buf;
}

/**
 * One live attempt: follows allowlisted redirects only, returns
 * { httpStatus, bytes, sha256 } on 200, or { httpStatus, error } otherwise.
 */
async function attemptLive(url, accept, fetchImpl) {
  let current = url;
  let hops = 0;
  for (;;) {
    let response;
    try {
      response = await fetchImpl(current, {
        headers: { accept, 'user-agent': 'genesis-os-scientific-ingestion/1.0 (+D-149)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const msg = String(err?.message ?? err);
      return { httpStatus: null, error: /abort|timeout/i.test(msg) ? `timeout_after_${FETCH_TIMEOUT_MS}ms` : `network_error: ${msg.slice(0, 200)}` };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (!location) return { httpStatus: response.status, error: 'redirect_without_location' };
      if ((hops += 1) > MAX_REDIRECT_HOPS) return { httpStatus: response.status, error: 'too_many_redirects' };
      const next = allowlistedIngestionUrl(new URL(location, current).toString());
      if (!next) return { httpStatus: response.status, error: 'redirect_not_allowlisted' };
      current = next;
      continue;
    }
    if (response.status !== 200) return { httpStatus: response.status, error: `http_${response.status}` };
    let bytes;
    try {
      bytes = await readBodyBytes(response);
    } catch (err) {
      return { httpStatus: 200, error: String(err?.message ?? err).slice(0, 200) };
    }
    if (bytes.byteLength === 0) return { httpStatus: 200, error: 'empty_body' };
    return { httpStatus: 200, bytes: bytes.byteLength, sha256: sha256Hex(bytes), finalUrl: current.toString() };
  }
}

/**
 * @param {{source: string, id: string}} req
 * @param {{fetchImpl?: typeof fetch, now?: () => Date, repoRoot?: string}} deps
 * @returns {Promise<{ok: boolean, status?: number, error?: string, result?: object}>}
 */
export async function ingestScientificSource({ source, id } = {}, { fetchImpl = fetch, now = () => new Date(), repoRoot = REPO_ROOT } = {}) {
  if (!Object.hasOwn(INGESTION_SOURCES, String(source))) {
    return { ok: false, status: 400, error: 'unknown_source', message: `Dozwolone źródła: ${Object.keys(INGESTION_SOURCES).join(', ')}.` };
  }
  const canonicalId = normalizeIngestionId(source, id);
  if (!canonicalId) {
    return { ok: false, status: 400, error: 'invalid_id', message: `Identyfikator nie pasuje do wzorca ${INGESTION_SOURCES[source].idPattern} dla źródła ${source}.` };
  }
  const url = allowlistedIngestionUrl(buildIngestionUrl(source, canonicalId));
  if (!url) return { ok: false, status: 500, error: 'url_not_allowlisted', message: 'Zbudowany URL nie przeszedł allowlisty — odmowa.' };

  const fetchedAt = now().toISOString();
  const live = await attemptLive(url, INGESTION_SOURCES[source].accept, fetchImpl);
  const base = { source, id: canonicalId, url: url.toString(), fetchedAt, httpStatus: live.httpStatus };

  if (live.sha256) {
    return { ok: true, result: { ...base, status: 'LIVE', sha256: live.sha256, bytes: live.bytes, finalUrl: live.finalUrl } };
  }
  const pinned = pinnedCopyFor(source, canonicalId, { repoRoot });
  if (pinned) {
    return {
      ok: true,
      result: {
        ...base,
        status: 'PINNED_FALLBACK',
        sha256: pinned.sha256,
        bytes: pinned.bytes,
        error: live.error,
        pinned,
        note: 'Pobranie na żywo NIE powiodło się; sha256 pochodzi z kopii przypiętej w repozytorium dla tego identyfikatora, nie z sieci.',
      },
    };
  }
  return { ok: true, result: { ...base, status: 'NO_ACCESS', sha256: null, bytes: 0, error: live.error } };
}

/* ------------------------------------------------------------------ status */

const lastResults = new Map();

export function recordIngestionResult(result) {
  if (result && typeof result.source === 'string') lastResults.set(result.source, result);
  return result;
}

export function resetIngestionStatusForTests() {
  lastResults.clear();
}

/** The four sources with their allowlist, id grammar, pinned ids and last in-memory result (never persisted). */
export function ingestionStatus({ repoRoot = REPO_ROOT } = {}) {
  return {
    sources: Object.entries(INGESTION_SOURCES).map(([source, spec]) => ({
      source,
      label: spec.label,
      idPattern: spec.idPattern,
      allowlist: spec.allowlist,
      defaultId: spec.defaultId,
      pinnedIds: Object.keys(PINNED[source] ?? {}).filter((id) => pinnedCopyFor(source, id, { repoRoot }) !== null),
      lastResult: lastResults.get(source) ?? null,
    })),
    statuses: ['LIVE', 'NO_ACCESS', 'PINNED_FALLBACK'],
    caveat: 'LIVE tylko przy HTTP 200 z allowlistowanego URL; NO_ACCESS gdy sieć odmówiła; PINNED_FALLBACK tylko gdy w repozytorium istnieje kopia z zapisanym hashem dla dokładnie tego identyfikatora. Wyniki nie są cache’owane.',
  };
}
