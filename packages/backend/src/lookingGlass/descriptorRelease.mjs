import { createHash } from 'node:crypto';
import { parseDescriptorRecord, loadDescriptors } from './mesh.mjs';

/**
 * Looking Glass — NLM descriptor release loader.
 *
 * ⚠ NOT VERIFIED AGAINST A LIVE NLM SERVER. The environment this was written in
 * cannot reach nlmpubs.nlm.nih.gov, so the URL construction and the streaming
 * parser are exercised against fixtures built from the published DTD only.
 * `verifyAgainstLive()` below is the check that closes the gap and has not been
 * run. Until it has, nothing produced by this module may be described as a
 * historical vocabulary.
 *
 * WHY STREAMING. desc2015.xml is roughly 300 MB of XML holding ~27,000
 * descriptors. Reading it into one string to hand to `parseDescriptorFile` works
 * until it does not, so records are parsed off the stream and written in
 * batches. Batches commit as they go — SQLite has no nested transaction to hold
 * them all — which means an interrupted load leaves real rows behind. A
 * half-loaded vocabulary is the dangerous case, because every row in it is
 * correct and the corpus still looks auditable, so the load marks itself
 * incomplete on entry and only clears that mark on success. `meshRelease()`
 * reports an interrupted load as incomplete rather than as a vocabulary.
 *
 * WHY THE YEAR IS CHECKED AGAINST THE FILE. The single worst failure available
 * here is loading the current release while believing it is the archived one for
 * the cut-off year. Every establishment date would still be correct, so nothing
 * would look wrong, and yet descriptors deleted before the cut-off would be
 * missing and later renames would be silently applied. NLM stamps the release
 * date into the DOCTYPE line; this module reads it and refuses on a mismatch.
 */

/** Archived releases live under the year; the current one lives under MESH_FILES. */
const ARCHIVE_BASE = 'https://nlmpubs.nlm.nih.gov/projects/mesh';

/**
 * Candidate URLs for a release, most specific first.
 *
 * Two paths are tried because NLM moves the newest release out of the year-keyed
 * archive. Returning a list rather than one URL keeps the fallback visible
 * instead of hiding it inside the fetch loop.
 */
export function releaseUrls(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1999 || y > 2100) {
    throw new Error(`releaseUrls: ${year} is not a plausible MeSH release year.`);
  }
  return [
    `${ARCHIVE_BASE}/${y}/xmlmesh/desc${y}.xml`,
    `${ARCHIVE_BASE}/MESH_FILES/xmlmesh/desc${y}.xml`,
  ];
}

/**
 * The release year NLM stamped into the file itself.
 *
 * The DOCTYPE references a dated DTD — nlmdescriptorrecordset_20150101.dtd — and
 * that is the only self-description the file carries. Returns null when the
 * header does not contain one, which is treated as "cannot confirm" rather than
 * "fine".
 */
export function parseReleaseYear(header) {
  const m = /nlmdescriptorrecordset_(\d{4})\d{4}\.dtd/i.exec(String(header ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Descriptor records off a byte or text stream, one at a time.
 *
 * Accepts anything async-iterable yielding strings or Uint8Arrays: a fetch
 * response body, a file read stream, or an array of chunks in a test. Chunk
 * boundaries fall anywhere, so a record is only emitted once its closing tag has
 * arrived; the tail is carried forward.
 */
export async function* streamDescriptorRecords(source) {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let headerEmitted = false;

  for await (const chunk of source) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

    if (!headerEmitted) {
      // Everything before the first record is the XML declaration and DOCTYPE.
      // The header is a few hundred bytes, so buffering until it closes is safe.
      const start = buffer.search(/<DescriptorRecord(?=[\s>])/);
      if (start === -1) continue;
      yield { header: buffer.slice(0, start).slice(0, 4096) };
      headerEmitted = true;
      buffer = buffer.slice(start);
    }

    let end;
    while ((end = buffer.indexOf('</DescriptorRecord>')) !== -1) {
      const record = buffer.slice(0, end + '</DescriptorRecord>'.length);
      buffer = buffer.slice(end + '</DescriptorRecord>'.length);
      yield { record };
    }
  }

  // A file whose records never closed is truncated. Saying so beats loading the
  // prefix and reporting success on a partial vocabulary.
  if (/<DescriptorRecord(?=[\s>])/.test(buffer)) {
    throw new Error('streamDescriptorRecords: stream ended inside a <DescriptorRecord> — the release is truncated.');
  }
  if (!headerEmitted) yield { header: buffer.slice(0, 4096) };
}

/**
 * Read a descriptor release off a stream into the corpus vocabulary.
 *
 * Refuses, rather than warns, when the file does not identify itself as the
 * requested year. `expectYear: null` disables that check and is meant only for
 * fixtures — a real load that cannot confirm its own provenance is exactly the
 * thing this module exists to prevent.
 */
export async function loadReleaseFromStream(db, source, {
  expectYear = null, url = null, batchSize = 2000, now = Date.now(), onProgress = null,
} = {}) {
  const hash = createHash('sha256');
  // Set before the first row is written and cleared only on success. If the
  // stream dies, the process is killed, or the year check fires after some
  // batches have already committed, this stays set and the vocabulary reads as
  // incomplete instead of as a smaller-than-expected but plausible release.
  putMeta(db, META_KEYS.state, 'loading');
  let declaredYear = null;
  let seen = 0;
  let skipped = 0;
  let loaded = 0;
  let batch = [];

  const hashing = async function* () {
    for await (const chunk of source) {
      hash.update(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
      yield chunk;
    }
  };

  const flush = () => {
    if (batch.length === 0) return;
    loaded += loadDescriptors(db, batch);
    batch = [];
    if (onProgress) onProgress({ seen, loaded, skipped });
  };

  for await (const item of streamDescriptorRecords(hashing())) {
    if (item.header !== undefined) {
      declaredYear = parseReleaseYear(item.header);
      if (expectYear !== null && declaredYear !== Number(expectYear)) {
        throw new Error(
          `loadReleaseFromStream: expected the ${expectYear} release but the file declares `
          + `${declaredYear ?? 'no year'}. Loading a different release would change which descriptors exist `
          + 'without changing any establishment date, so the corpus would look correct and not be.',
        );
      }
      continue;
    }
    seen += 1;
    const parsed = parseDescriptorRecord(item.record);
    if (!parsed || !parsed.name) { skipped += 1; continue; }
    batch.push({ ...parsed, vocabularyYear: declaredYear ?? (expectYear === null ? null : Number(expectYear)) });
    if (batch.length >= batchSize) flush();
  }
  flush();

  const release = {
    year: declaredYear ?? (expectYear === null ? null : Number(expectYear)),
    url,
    sha256: hash.digest('hex'),
    records: seen,
    loaded,
    skipped,
    loadedAt: now,
  };
  recordRelease(db, release);
  return release;
}

/**
 * Download and load a release.
 *
 * The candidate URLs are tried in order and the one that worked is recorded, so
 * a later reader can tell whether the archived or the current release was used —
 * which changes what the vocabulary means.
 */
export async function downloadRelease(db, year, { fetchImpl = globalThis.fetch, urls = null, ...options } = {}) {
  const candidates = urls ?? releaseUrls(year);
  const failures = [];

  for (const url of candidates) {
    let response;
    try {
      response = await fetchImpl(url);
    } catch (err) {
      failures.push(`${url}: ${err.message}`);
      continue;
    }
    if (!response?.ok) {
      failures.push(`${url}: HTTP ${response?.status ?? 'no response'}`);
      continue;
    }
    if (!response.body) {
      failures.push(`${url}: response carried no body stream`);
      continue;
    }
    return loadReleaseFromStream(db, response.body, { expectYear: year, url, ...options });
  }

  throw new Error(
    `downloadRelease: could not retrieve the ${year} MeSH release. Tried:\n  ${failures.join('\n  ')}\n`
    + 'Archived releases are also distributed over FTP; download manually and use loadReleaseFromStream '
    + 'with a file stream rather than proceeding without a vocabulary.',
  );
}

/* ------------------------------- provenance ------------------------------- */

const META_KEYS = {
  year: 'mesh_release_year',
  url: 'mesh_release_url',
  sha256: 'mesh_release_sha256',
  records: 'mesh_release_records',
  loadedAt: 'mesh_release_loaded_at',
  state: 'mesh_release_state',
};

function putMeta(db, key, value) {
  db.prepare('INSERT INTO lg_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function recordRelease(db, release) {
  putMeta(db, META_KEYS.year, release.year ?? '');
  putMeta(db, META_KEYS.url, release.url ?? 'stream');
  putMeta(db, META_KEYS.sha256, release.sha256);
  putMeta(db, META_KEYS.records, release.records);
  putMeta(db, META_KEYS.loadedAt, release.loadedAt);
  putMeta(db, META_KEYS.state, 'complete');
}

/**
 * Which release the vocabulary came from, or null if none was ever loaded.
 *
 * The checksum is the point: it makes a run reproducible by someone who does not
 * trust the authors, which is the only kind of reproducibility worth having.
 *
 * An interrupted load is reported with `complete: false` and no year, because a
 * partial vocabulary answering to a release number is worse than no vocabulary.
 */
export function meshRelease(db) {
  const get = (key) => db.prepare('SELECT value AS v FROM lg_meta WHERE key = ?').get(key)?.v ?? null;
  const state = get(META_KEYS.state);
  if (state === 'loading') {
    return { complete: false, year: null, url: get(META_KEYS.url), sha256: null, records: 0, loadedAt: 0 };
  }
  const year = get(META_KEYS.year);
  if (!year) return null;
  return {
    complete: true,
    year: Number(year),
    url: get(META_KEYS.url),
    sha256: get(META_KEYS.sha256),
    records: Number(get(META_KEYS.records) ?? 0),
    loadedAt: Number(get(META_KEYS.loadedAt) ?? 0),
  };
}

/**
 * Whether the loaded release is the right one for a cut-off, and what is lost if
 * it is not.
 *
 * A current release is not useless for a historical analysis — establishment
 * dates are historical facts and do not change — but it is weaker, and the
 * benchmark must say which it used rather than let a reader assume the stronger
 * one.
 */
export function releaseSuitability(db, cutoffYear) {
  const release = meshRelease(db);
  const cutoff = Number(cutoffYear);
  if (!release) {
    return {
      release: null,
      suitable: false,
      statement: 'No MeSH release has been loaded. Establishment dates are unavailable, so no analysis may be described as historical.',
    };
  }
  if (!release.complete) {
    return {
      release,
      suitable: false,
      statement: 'A descriptor load was interrupted and never completed. The vocabulary holds real but partial rows, which is the '
        + 'most misleading state available — re-run the load before any analysis.',
    };
  }
  if (release.year === cutoff) {
    return {
      release,
      suitable: true,
      statement: `Vocabulary is the archived ${release.year} MeSH release (sha256 ${release.sha256.slice(0, 12)}…), matching the cut-off.`,
    };
  }
  if (release.year > cutoff) {
    return {
      release,
      suitable: false,
      statement: `Vocabulary is the ${release.year} MeSH release but the cut-off is ${cutoff}. Establishment dates remain valid, so `
        + `descriptors introduced after ${cutoff} are still excluded; however descriptors that existed in ${cutoff} and were later `
        + `deleted are absent, and later renames are applied. Report this as a limitation, or load desc${cutoff}.xml.`,
    };
  }
  return {
    release,
    suitable: false,
    statement: `Vocabulary is the ${release.year} MeSH release, older than the ${cutoff} cut-off. Descriptors introduced between `
      + `${release.year} and ${cutoff} are missing, so the corpus understates what was knowable at the cut-off.`,
  };
}

/**
 * Confirms the loader still works against the live NLM distribution.
 *
 * Not a test — it is a network probe that must be run by hand from an
 * environment with egress, because a test that silently passes when the network
 * is unavailable is worse than no test at all. Reads only the first chunk.
 */
export async function verifyAgainstLive(year, { fetchImpl = globalThis.fetch } = {}) {
  const checked = [];
  for (const url of releaseUrls(year)) {
    try {
      const response = await fetchImpl(url);
      if (!response?.ok) { checked.push({ url, ok: false, detail: `HTTP ${response?.status}` }); continue; }
      const reader = response.body.getReader();
      const { value } = await reader.read();
      await reader.cancel();
      const header = new TextDecoder('utf-8').decode(value ?? new Uint8Array()).slice(0, 4096);
      const declared = parseReleaseYear(header);
      checked.push({
        url,
        ok: declared === Number(year),
        declaredYear: declared,
        detail: declared === Number(year)
          ? 'header declares the expected release year'
          : `header declares ${declared ?? 'no year'}; the DOCTYPE format may have changed`,
      });
    } catch (err) {
      checked.push({ url, ok: false, detail: err.message });
    }
  }
  return { year: Number(year), checked, verified: checked.some((c) => c.ok) };
}
