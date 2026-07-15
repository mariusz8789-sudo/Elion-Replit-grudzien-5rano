/**
 * External real-bundle builder for Campaign #001 (Corpus Mandate Phase 13.7).
 *
 * RUN THIS OUTSIDE the policy-restricted agent environment (it needs real network egress to
 * Europe PMC / RCSB PDB / PubChem / ChEMBL / UniProt). It acquires ONLY official/public sources
 * listed in campaigns/real-scientific-campaign-001/REAL_CAMPAIGN_INPUT_REQUIREMENTS.json,
 * preserves raw payloads, computes SHA-256, records provenance + licence (UNKNOWN when unknown),
 * builds a genesis-scientific-evidence-bundle-v1 manifest (ingestionMode: VERIFIED_BUNDLE), and
 * FAILS CLOSED if any mandatory source is missing. It NEVER fabricates a record.
 *
 * Usage: node scripts/build-real-campaign-001-bundle.mjs --out <dir>
 */
/* global setTimeout, clearTimeout, AbortController, Buffer */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REQ = path.resolve(__dirname, '../campaigns/real-scientific-campaign-001/REAL_CAMPAIGN_INPUT_REQUIREMENTS.json');
const args = process.argv.slice(2);
const OUT = (() => { const i = args.indexOf('--out'); return i >= 0 ? path.resolve(args[i + 1]) : path.resolve(__dirname, '../campaigns/real-scientific-campaign-001/bundle'); })();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const nowIso = () => new Date().toISOString();

/** Rate-aware fetch with retries + exponential backoff, 429/5xx handling, timeout. */
async function politeFetch(url, { attempts = 4, baseDelayMs = 500, timeoutMs = 30000 } = {}) {
  for (let a = 0; a < attempts; a++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'genesis-corpus-builder/1 (research; contact operator)' } });
      clearTimeout(to);
      if (res.status === 429 || res.status >= 500) { await sleep(baseDelayMs * 2 ** a); continue; }
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, text: await res.text() };
    } catch (e) {
      if (a === attempts - 1) return { ok: false, error: String(e?.message ?? e) };
      await sleep(baseDelayMs * 2 ** a);
    }
  }
  return { ok: false, error: 'exhausted retries' };
}

function subdirFor(sourceType) {
  return { protein: 'proteins', bioactivity: 'bioactivity', compound: 'compounds', article: 'articles', structure: 'structures' }[sourceType] ?? 'metadata';
}

async function main() {
  const req = JSON.parse(readFileSync(REQ, 'utf8'));
  for (const d of ['payloads/articles', 'payloads/structures', 'payloads/compounds', 'payloads/proteins', 'payloads/bioactivity', 'provenance']) mkdirSync(path.join(OUT, d), { recursive: true });

  const entries = [];
  const acquiredServices = new Set();
  console.log(`[builder] acquiring ${req.sources.length} source specs into ${OUT}`);
  for (const s of req.sources) {
    // The operator must resolve any 'resolve:' sourceId first; a template endpoint with an
    // unresolved <placeholder> is skipped with a clear message (fail-closed for mandatory later).
    if (/[<>]/.test(s.officialEndpoint)) { console.warn(`[builder] SKIP ${s.sourceService}: endpoint has unresolved placeholders — operator must resolve source IDs first (see requirements).`); continue; }
    console.log(`[builder] GET ${s.officialEndpoint}`);
    const r = await politeFetch(s.officialEndpoint);
    await sleep(250); // conservative pacing (well under PubChem 5 req/s)
    if (!r.ok) { console.warn(`[builder] FAILED ${s.sourceService}: ${r.status ?? r.error} — not fabricating; leaving unacquired.`); continue; }
    const buf = Buffer.from(r.text);
    const sub = subdirFor(s.campaignRole ? undefined : undefined) || subdirFor('metadata');
    const dir = subdirFor((s.expectedFilename ?? '').includes('/proteins/') ? 'protein' : (s.expectedFilename ?? '').includes('/bioactivity/') ? 'bioactivity' : (s.expectedFilename ?? '').includes('/compounds/') ? 'compound' : (s.expectedFilename ?? '').includes('/articles/') ? 'article' : 'structure');
    void sub;
    const entryId = `e-${s.sourceService.toLowerCase()}-${sha256(buf).slice(0, 8)}`;
    const payloadRef = `payloads/${dir}/${entryId}.json`;
    writeFileSync(path.join(OUT, payloadRef), buf);
    const contentHash = sha256(buf);
    const provenanceRef = `provenance/${entryId}.json`;
    writeFileSync(path.join(OUT, provenanceRef), Buffer.from(JSON.stringify({ provenanceId: `prov_${entryId}`, sourceService: s.sourceService, sourceId: s.sourceId, sourceUrl: s.officialEndpoint, retrievedAt: nowIso(), sourceVersion: null, licenceNote: s.licenceMetadataRequirement, note: 'REAL acquired payload' }, null, 2)));
    entries.push({ entryId, sourceService: s.sourceService, sourceType: (s.expectedFilename ?? '').split('/')[1]?.replace(/s$/, '') ?? 'metadata', sourceId: String(s.sourceId), payloadRef, sourceUrl: s.officialEndpoint, contentHash, hashAlgorithm: 'sha256', provenanceRef, license: 'UNKNOWN', parserVersion: 'v1', retrievedAt: nowIso() });
    acquiredServices.add(s.sourceService);
  }

  // Fail closed on missing MANDATORY sources.
  const missing = (req.mandatoryForRanking ?? []).filter((m) => !acquiredServices.has(m));
  if (missing.length) { console.error(`[builder] FAIL CLOSED — missing mandatory source(s): ${missing.join(', ')}. No usable bundle written.`); process.exit(2); }

  const manifest = { manifestVersion: 'genesis-scientific-evidence-bundle-v1', bundleId: 'real-scientific-campaign-001-bundle', campaignId: 'real-scientific-campaign-001', ingestionMode: 'VERIFIED_BUNDLE', builtAt: nowIso(), builtBy: 'build-real-campaign-001-bundle.mjs', entries };
  writeFileSync(path.join(OUT, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
  console.log(`[builder] wrote manifest with ${entries.length} REAL entries. Verify with bundleAdapter.openBundle(...).verifyAll().`);
}

main().catch((e) => { console.error('[builder] fatal:', e); process.exit(1); });
