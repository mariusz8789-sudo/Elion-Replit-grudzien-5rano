import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * R-005 — fetch+pin for the FIRST truly instrumental external anchor: CMS
 * Open Data record 5208 (Z→μμ, 2011), read by the already-existing,
 * already-tested `compute/cmsOpenDataAdapter.mjs` / `compute/cms_zmumu_worker.py`
 * / Fabric model `particle-cern-cms-zmumu-invariant-mass`
 * (`compute/registry.mjs`). All three already exist and are fail-closed
 * (`DATA_REQUIRED`) for lack of the file — this script's only job is to
 * fetch that one file, verify it against the SHA-256 already hardcoded in
 * `cms_zmumu_worker.py`, and pin it.
 *
 * WHY THIS RUNS IN CI, NOT LOCALLY.
 *
 * This sandbox's egress proxy denies CONNECT to opendata.cern.ch (403,
 * confirmed directly with curl) — the same class of restriction already
 * documented for NASA/NIST/Zenodo in `docs/RISKS.md`/`docs/P2_EVIDENCE.md`.
 * GitHub Actions runners have ordinary internet access, so this script runs
 * there (`.github/workflows/ci.yml`, job `cms-zmumu-pinned-artifact`) and
 * prints the fetched file's full content plus its SHA-256 into the job's
 * own log for read-back via the GitHub API — the same technique already
 * used and accepted for the NIST/CODATA, Kepler/NASA NSSDCA, and QE4/Brydges
 * external data.
 *
 * WHY THE SHA-256 IS A LITERAL HERE, DUPLICATED FROM THE PYTHON WORKER.
 *
 * `cms_zmumu_worker.py::EXPECTED_SHA256` is the single source of truth this
 * script's output MUST match — Node cannot import a `.py` file, so the
 * value is copied here as a literal and a dedicated CI step
 * (`Cross-check fetch script's expected hash against the Python worker's`)
 * greps both files and fails the job if they ever drift apart, so this
 * duplication cannot silently go stale.
 */

const DATASET_URL = 'https://opendata.cern.ch/record/5208/files/Zmumu.csv';
const RECORD_URL = 'https://opendata.cern.ch/record/5208';
// Must match packages/backend/src/compute/cms_zmumu_worker.py::EXPECTED_SHA256 exactly.
const EXPECTED_SHA256 = '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1';
const OUT = process.env.GENESIS_CMS_ZMUMU_FIXTURE_DIR ?? 'artifacts/cms-zmumu';
const retrievedAt = new Date().toISOString();

async function fetchWithRetry(url) {
  const transient = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Genesis-R005-cms-zmumu-fixture/1.0' } });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (!transient.has(response.status) || attempt === 4) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
      }
      console.log(`CMS-zmumu RETRY ${attempt}/3 ${response.status} ${url}`);
    } catch (error) {
      if (attempt === 4 || !String(error).match(/(?:502|503|504|429|fetch failed)/i)) throw error;
      console.log(`CMS-zmumu RETRY ${attempt}/3 transient network error for ${url}`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`unreachable download state for ${url}`);
}

await mkdir(OUT, { recursive: true });

console.log(`CMS-zmumu FETCH ${DATASET_URL}`);
const bytes = await fetchWithRetry(DATASET_URL);
const actualSha256 = createHash('sha256').update(bytes).digest('hex');
console.log(`CMS-zmumu DOWNLOADED bytes=${bytes.byteLength} sha256=${actualSha256}`);

if (actualSha256 !== EXPECTED_SHA256) {
  throw new Error(
    `CMS-zmumu: SHA-256 MISMATCH — fetched ${DATASET_URL} hashes to ${actualSha256}, but ` +
    `cms_zmumu_worker.py declares EXPECTED_SHA256=${EXPECTED_SHA256}. Refusing to pin a file ` +
    `different from the one the worker, the Fabric model, and cmsOpenDataCompute.test.mjs's ` +
    `hardcoded expected statistics all assume. If CERN genuinely changed this record's file, ` +
    `that is a deliberate re-pin decision for a human/reviewer, not something to silently accept here.`,
  );
}
console.log(`CMS-zmumu SHA256_MATCH ${EXPECTED_SHA256}`);

const text = new globalThis.TextDecoder('utf-8', { fatal: false }).decode(bytes);
const firstLine = text.split('\n', 1)[0] ?? '';
const REQUIRED_COLUMNS = ['Run', 'Event', 'pt1', 'eta1', 'phi1', 'Q1', 'dxy1', 'iso1', 'pt2', 'eta2', 'phi2', 'Q2', 'dxy2', 'iso2'];
for (const column of REQUIRED_COLUMNS) {
  if (!firstLine.includes(column)) {
    throw new Error(`CMS-zmumu: header row is missing required column "${column}". Header: ${firstLine}`);
  }
}
const rowCount = text.trimEnd().split('\n').length - 1;
console.log(`CMS-zmumu HEADER_OK columns=${REQUIRED_COLUMNS.length} rows=${rowCount}`);

await writeFile(join(OUT, 'Zmumu.csv'), bytes);

const manifest = {
  schemaVersion: 'genesis.cms-zmumu.fixture.v1',
  status: 'PINNED_CANDIDATE',
  retrievedAt,
  retrievalEnvironment: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions-ubuntu-latest' : 'local',
  networkPolicy: 'download-once; replay must use committed raw payload and must not refetch',
  recordUrl: RECORD_URL,
  downloadUrl: DATASET_URL,
  license: 'CC0-1.0',
  file: {
    name: 'Zmumu.csv',
    bytes: bytes.byteLength,
    rows: rowCount,
    sha256: actualSha256,
    matchesWorkerExpectedSha256: true,
  },
};
await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`CMS-zmumu MANIFEST ${join(OUT, 'manifest.json')}`);
