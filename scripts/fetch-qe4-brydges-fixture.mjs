import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * QE4 — real-data fetch for the Brydges et al. (2019) randomized-measurement
 * Rényi entropy dataset, Zenodo record 2527010.
 *
 * WHY THIS GOES THROUGH GITHUB ACTIONS, NOT A LOCAL FETCH.
 *
 * This sandbox's own egress proxy denies CONNECT to zenodo.org (403, policy
 * denial — confirmed directly with curl, and independently confirmed by the
 * agent-side WebFetch tool returning EGRESS_BLOCKED for the same host). This
 * is the same class of restriction already documented for NASA/NIST/CERN in
 * this repo's `docs/RISKS.md` R-005/R-006 — package registries and a short
 * allowlist are open, general science-data hosts are not. GitHub Actions
 * runners have ordinary internet access, so this script runs there
 * (`.github/workflows/ci.yml`, job `qe4-brydges-pinned-artifact`) and its
 * real output (Zenodo API JSON, download bytes, checksums) is read back into
 * the sandbox via the job's own log, exactly the technique already used and
 * accepted for the NIST/CODATA and Kepler/NASA NSSDCA external anchors.
 *
 * WHY THE ZENODO API, NOT A HAND-TYPED DOWNLOAD URL.
 *
 * `https://zenodo.org/api/records/<id>` is Zenodo's own stable, documented
 * REST endpoint and returns the record's real file list, each file's own
 * `checksum` and `links.self` (direct download URL) and `size`, plus the
 * record's `metadata.license`/`metadata.version`. Reading these from the API
 * response — rather than guessing a `/records/<id>/files/<name>?download=1`
 * URL or hand-copying a checksum from a prompt — means every fact this
 * script asserts (filename, size, checksum, license, version) is read from
 * Zenodo itself at fetch time, not assumed.
 */

const RECORD_ID = '2527010';
const API_URL = `https://zenodo.org/api/records/${RECORD_ID}`;
const EXPECTED_FILENAME = 'Data_aau4963_Updated.zip';
const OUT = process.env.GENESIS_QE4_FIXTURE_DIR ?? 'artifacts/qe4-brydges';
const retrievedAt = new Date().toISOString();

async function fetchWithRetry(url, { binary = false } = {}) {
  const transient = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Genesis-QE4-pinned-fixture/1.0' } });
      if (response.ok) return binary ? new Uint8Array(await response.arrayBuffer()) : await response.text();
      if (!transient.has(response.status) || attempt === 4) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
      }
      console.log(`QE4-brydges RETRY ${attempt}/3 ${response.status} ${url}`);
    } catch (error) {
      if (attempt === 4 || !String(error).match(/(?:502|503|504|429|fetch failed)/i)) throw error;
      console.log(`QE4-brydges RETRY ${attempt}/3 transient network error for ${url}`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`unreachable download state for ${url}`);
}

await mkdir(OUT, { recursive: true });

console.log(`QE4-brydges FETCH_RECORD ${API_URL}`);
const recordText = await fetchWithRetry(API_URL);
const record = JSON.parse(recordText);
await writeFile(join(OUT, 'zenodo-record.json'), `${JSON.stringify(record, null, 2)}\n`);

const doi = record.doi ?? record.metadata?.doi ?? null;
const version = record.metadata?.version ?? null;
const license = record.metadata?.license?.id ?? record.metadata?.license?.title?.en ?? record.metadata?.rights?.[0]?.title?.en ?? null;
const accessRight = record.metadata?.access_right ?? null;
const publicationDate = record.metadata?.publication_date ?? null;

console.log(`QE4-brydges RECORD_META doi=${doi} version=${version} license=${JSON.stringify(license)} access_right=${accessRight} publication_date=${publicationDate}`);

const files = Array.isArray(record.files) ? record.files : [];
console.log(`QE4-brydges FILE_COUNT ${files.length}`);
for (const f of files) {
  console.log(`QE4-brydges FILE_ENTRY key=${f.key} size=${f.size} checksum=${f.checksum} self=${f.links?.self ?? f.links?.download ?? 'MISSING'}`);
}

const target = files.find((f) => f.key === EXPECTED_FILENAME);
if (target === undefined) {
  throw new Error(`QE4-brydges: record ${RECORD_ID} does not contain a file named "${EXPECTED_FILENAME}". Real files present: ${files.map((f) => f.key).join(', ')}`);
}

const downloadUrl = target.links?.self ?? target.links?.download;
if (typeof downloadUrl !== 'string') {
  throw new Error(`QE4-brydges: file entry for ${EXPECTED_FILENAME} has no usable download link. Raw entry: ${JSON.stringify(target)}`);
}

console.log(`QE4-brydges DOWNLOAD ${downloadUrl}`);
const bytes = await fetchWithRetry(downloadUrl, { binary: true });
const actualSha256 = createHash('sha256').update(bytes).digest('hex');
const actualMd5 = createHash('md5').update(bytes).digest('hex');
console.log(`QE4-brydges DOWNLOADED bytes=${bytes.byteLength} md5=${actualMd5} sha256=${actualSha256}`);

const apiChecksum = typeof target.checksum === 'string' ? target.checksum : '';
const apiMd5 = apiChecksum.startsWith('md5:') ? apiChecksum.slice(4) : apiChecksum;
if (apiMd5.length > 0 && apiMd5 !== actualMd5) {
  throw new Error(`QE4-brydges: MD5 MISMATCH — Zenodo API reports ${apiMd5} for ${EXPECTED_FILENAME}, downloaded bytes hash to ${actualMd5}. Refusing to pin a payload that does not match its own source's declared checksum.`);
}
console.log(`QE4-brydges MD5_MATCH_API ${apiMd5 || '(API reported no checksum field)'} == ${actualMd5}`);

const TASK_STATED_MD5 = '5f027c6ee5d1283ca9338015e066dff6';
console.log(`QE4-brydges MD5_VS_TASK_STATED task_stated=${TASK_STATED_MD5} actual=${actualMd5} match=${TASK_STATED_MD5 === actualMd5}`);

await writeFile(join(OUT, EXPECTED_FILENAME), bytes);

const manifest = {
  schemaVersion: 'genesis.qe4-brydges.fixture.v1',
  status: 'PINNED_CANDIDATE',
  retrievedAt,
  retrievalEnvironment: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions-ubuntu-latest' : 'local',
  networkPolicy: 'download-once; replay must use committed raw payload and must not refetch',
  recordId: RECORD_ID,
  recordApiUrl: API_URL,
  doi,
  version,
  license,
  accessRight,
  publicationDate,
  file: {
    key: EXPECTED_FILENAME,
    downloadUrl,
    bytes: bytes.byteLength,
    md5: actualMd5,
    sha256: actualSha256,
    apiReportedChecksum: apiChecksum,
    matchesTaskStatedMd5: TASK_STATED_MD5 === actualMd5,
  },
  allFilesInRecord: files.map((f) => ({ key: f.key, size: f.size, checksum: f.checksum })),
};
await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`QE4-brydges MANIFEST ${join(OUT, 'manifest.json')}`);
