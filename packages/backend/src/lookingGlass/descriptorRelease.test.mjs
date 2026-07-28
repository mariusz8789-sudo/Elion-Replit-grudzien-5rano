import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openCorpus, getConcept } from './store.mjs';
import {
  releaseUrls, parseReleaseYear, streamDescriptorRecords,
  loadReleaseFromStream, downloadRelease, meshRelease, releaseSuitability,
} from './descriptorRelease.mjs';

/**
 * NLM descriptor release loader.
 *
 * ⚠ NOT VERIFIED AGAINST LIVE NLM. Every fixture here is built from the
 * published descriptor DTD; this environment cannot reach nlmpubs.nlm.nih.gov.
 * Passing tests prove the loader handles the documented format and refuses the
 * dangerous cases. They do NOT prove NLM still serves that format, and until
 * `verifyAgainstLive()` has been run from a networked machine, nothing loaded by
 * this module may be described as a verified historical vocabulary.
 *
 * The tests worth reading are the refusals. A loader that quietly fetches the
 * current release when asked for the 2015 one produces a corpus in which every
 * establishment date is correct and the vocabulary is still wrong — the failure
 * leaves no trace, so it has to be made impossible rather than detectable.
 */

const HEADER_2015 = `<?xml version="1.0"?>
<!DOCTYPE DescriptorRecordSet SYSTEM "https://www.nlm.nih.gov/databases/dtd/nlmdescriptorrecordset_20150101.dtd">
<DescriptorRecordSet LanguageCode="eng">
`;

const HEADER_2024 = HEADER_2015.replace('20150101', '20240101');

function record(ui, name, tree, established) {
  return `<DescriptorRecord DescriptorClass="1">
  <DescriptorUI>${ui}</DescriptorUI>
  <DescriptorName><String>${name}</String></DescriptorName>
  ${established ? `<DateEstablished><Year>${established}</Year><Month>01</Month><Day>01</Day></DateEstablished>` : ''}
  <TreeNumberList><TreeNumber>${tree}</TreeNumber></TreeNumberList>
</DescriptorRecord>
`;
}

const RELEASE_2015 = HEADER_2015
  + record('D019149', 'Cellular Senescence', 'G04.299.176', 1999)
  + record('D000375', 'Aging', 'G07.345.087', null)
  + record('D016159', 'Telomere', 'A11.284.187', 1990)
  + '</DescriptorRecordSet>\n';

/** Split a string into fixed-size chunks, so record boundaries fall mid-chunk. */
function chunks(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** An async iterable of Uint8Array, which is what a fetch body yields. */
async function* bytes(text, size = 64) {
  const encoder = new TextEncoder();
  for (const chunk of chunks(text, size)) yield encoder.encode(chunk);
}

let db;
beforeEach(() => { db = openCorpus(':memory:'); });

describe('release URLs', () => {
  test('tries the year-keyed archive before the current-release path', () => {
    const [archive, current] = releaseUrls(2015);
    assert.match(archive, /\/mesh\/2015\/xmlmesh\/desc2015\.xml$/);
    assert.match(current, /MESH_FILES\/xmlmesh\/desc2015\.xml$/);
  });

  test('refuses an implausible year rather than building a nonsense URL', () => {
    assert.throws(() => releaseUrls(1066), /not a plausible MeSH release year/);
    assert.throws(() => releaseUrls('desc2015'), /not a plausible/);
  });
});

describe('reading the release year out of the file', () => {
  test('recovers it from the dated DTD reference', () => {
    assert.equal(parseReleaseYear(HEADER_2015), 2015);
    assert.equal(parseReleaseYear(HEADER_2024), 2024);
  });

  test('returns null when the header does not declare one', () => {
    // Null must mean "cannot confirm", never "fine" — the caller decides.
    assert.equal(parseReleaseYear('<?xml version="1.0"?><DescriptorRecordSet>'), null);
    assert.equal(parseReleaseYear(null), null);
  });
});

describe('streaming records off a byte stream', () => {
  test('emits the header first, then every record', async () => {
    const items = [];
    for await (const item of streamDescriptorRecords(bytes(RELEASE_2015))) items.push(item);
    assert.equal(items[0].header !== undefined, true);
    assert.match(items[0].header, /nlmdescriptorrecordset_20150101/);
    assert.equal(items.length - 1, 3);
  });

  test('reassembles records split across chunk boundaries', async () => {
    // The real failure mode: a 300 MB download arrives in 64 KB pieces that cut
    // through the middle of a <DescriptorUI>.
    for (const size of [1, 7, 64, 4096]) {
      const records = [];
      for await (const item of streamDescriptorRecords(bytes(RELEASE_2015, size))) {
        if (item.record) records.push(item.record);
      }
      assert.equal(records.length, 3, `chunk size ${size}`);
      assert.ok(records[0].includes('D019149'), `chunk size ${size}`);
      assert.ok(records[2].includes('</DescriptorRecord>'), `chunk size ${size}`);
    }
  });

  test('accepts string chunks as well as bytes', async () => {
    const records = [];
    for await (const item of streamDescriptorRecords(chunks(RELEASE_2015, 128))) {
      if (item.record) records.push(item.record);
    }
    assert.equal(records.length, 3);
  });

  test('a truncated release throws instead of loading its prefix', async () => {
    // Silently loading 12,000 of 27,000 descriptors would leave a vocabulary in
    // which every row is correct and the whole is wrong.
    const truncated = RELEASE_2015.slice(0, RELEASE_2015.length - 120);
    await assert.rejects(async () => {
      for await (const _ of streamDescriptorRecords(bytes(truncated))) { /* drain */ }
    }, /truncated/);
  });
});

describe('loading a release', () => {
  test('stores descriptors, dates and the semantic type', async () => {
    const result = await loadReleaseFromStream(db, bytes(RELEASE_2015), { expectYear: 2015, url: 'fixture://desc2015.xml', now: 1000 });
    assert.equal(result.loaded, 3);
    assert.equal(result.records, 3);
    assert.equal(result.year, 2015);
    assert.equal(getConcept(db, 'D019149').date_established, '1999-01-01');
    assert.equal(getConcept(db, 'D019149').semantic_type, 'process');
    assert.equal(getConcept(db, 'D000375').date_established, null);
    assert.equal(getConcept(db, 'D016159').semantic_type, 'anatomy');
  });

  test('works when records span many small chunks', async () => {
    const result = await loadReleaseFromStream(db, bytes(RELEASE_2015, 3), { expectYear: 2015, batchSize: 2 });
    assert.equal(result.loaded, 3);
  });

  test('refuses a file that declares a different release year', async () => {
    // The failure this check exists for: asking for 2015, receiving the current
    // release, and getting a corpus where nothing looks wrong.
    const wrong = RELEASE_2015.replace('20150101', '20240101');
    await assert.rejects(
      () => loadReleaseFromStream(db, bytes(wrong), { expectYear: 2015 }),
      /expected the 2015 release but the file declares 2024/,
    );
  });

  test('refuses a file that declares no year at all', async () => {
    const headerless = RELEASE_2015.replace(/<!DOCTYPE[^>]*>/, '');
    await assert.rejects(
      () => loadReleaseFromStream(db, bytes(headerless), { expectYear: 2015 }),
      /declares no year/,
    );
  });

  test('reports a checksum of the bytes it actually read', async () => {
    const a = await loadReleaseFromStream(db, bytes(RELEASE_2015), { expectYear: 2015 });
    const b = await loadReleaseFromStream(openCorpus(':memory:'), bytes(RELEASE_2015, 7), { expectYear: 2015 });
    assert.match(a.sha256, /^[0-9a-f]{64}$/);
    assert.equal(a.sha256, b.sha256, 'the checksum must not depend on how the stream was chunked');

    const different = await loadReleaseFromStream(openCorpus(':memory:'), bytes(RELEASE_2015 + ' '), { expectYear: 2015 });
    assert.notEqual(a.sha256, different.sha256);
  });

  test('skips malformed records rather than inventing descriptors', async () => {
    const withJunk = RELEASE_2015.replace(
      '</DescriptorRecordSet>',
      '<DescriptorRecord><DescriptorUI>D999999</DescriptorUI></DescriptorRecord></DescriptorRecordSet>',
    );
    const result = await loadReleaseFromStream(db, bytes(withJunk), { expectYear: 2015 });
    assert.equal(result.records, 4);
    assert.equal(result.skipped, 1);
    assert.equal(result.loaded, 3);
    assert.equal(getConcept(db, 'D999999'), null);
  });
});

describe('provenance', () => {
  test('records the release, its source and its checksum', async () => {
    await loadReleaseFromStream(db, bytes(RELEASE_2015), { expectYear: 2015, url: 'fixture://desc2015.xml', now: 1234 });
    const release = meshRelease(db);
    assert.equal(release.complete, true);
    assert.equal(release.year, 2015);
    assert.equal(release.url, 'fixture://desc2015.xml');
    assert.equal(release.records, 3);
    assert.equal(release.loadedAt, 1234);
    assert.match(release.sha256, /^[0-9a-f]{64}$/);
  });

  test('a corpus with no release loaded reports nothing rather than a default', () => {
    assert.equal(meshRelease(db), null);
  });

  test('an interrupted load is reported as incomplete, not as a smaller release', async () => {
    // Batches commit as they go, so a load that dies partway leaves real rows
    // behind. Every one of them is correct, which is exactly why the corpus must
    // not be allowed to answer to a release number.
    const truncated = RELEASE_2015.slice(0, RELEASE_2015.length - 120);
    await assert.rejects(() => loadReleaseFromStream(db, bytes(truncated), { expectYear: 2015, batchSize: 1 }), /truncated/);
    const release = meshRelease(db);
    assert.equal(release.complete, false);
    assert.equal(release.year, null);
    assert.match(releaseSuitability(db, 2015).statement, /interrupted/);
    assert.equal(releaseSuitability(db, 2015).suitable, false);
  });

  test('a wrong-year refusal leaves the corpus unusable rather than half-built', async () => {
    const wrong = RELEASE_2015.replace('20150101', '20240101');
    await assert.rejects(() => loadReleaseFromStream(db, bytes(wrong), { expectYear: 2015 }), /expected the 2015 release/);
    assert.equal(meshRelease(db).complete, false);
  });
});

describe('is this release the right one for the cut-off', () => {
  test('an archived release matching the cut-off is stated as such', async () => {
    await loadReleaseFromStream(db, bytes(RELEASE_2015), { expectYear: 2015 });
    const s = releaseSuitability(db, 2015);
    assert.equal(s.suitable, true);
    assert.match(s.statement, /archived 2015 MeSH release/);
    assert.match(s.statement, /sha256/);
  });

  test('a later release is usable but the limitation is named', async () => {
    // Establishment dates are historical facts and do not change, so a current
    // release still excludes post-cut-off descriptors. What it cannot recover is
    // descriptors that existed then and were later deleted.
    const later = RELEASE_2015.replace('20150101', '20240101');
    await loadReleaseFromStream(db, bytes(later), { expectYear: 2024 });
    const s = releaseSuitability(db, 2015);
    assert.equal(s.suitable, false);
    assert.match(s.statement, /later deleted are absent/);
    assert.match(s.statement, /load desc2015\.xml/);
  });

  test('an earlier release understates what was knowable', async () => {
    await loadReleaseFromStream(db, bytes(RELEASE_2015), { expectYear: 2015 });
    const s = releaseSuitability(db, 2020);
    assert.equal(s.suitable, false);
    assert.match(s.statement, /understates what was knowable/);
  });

  test('with no release at all, nothing may be called historical', () => {
    assert.match(releaseSuitability(db, 2015).statement, /No MeSH release has been loaded/);
  });
});

describe('downloading', () => {
  /** Minimal stand-in for a fetch Response with a web stream body. */
  const ok = (text) => ({
    ok: true,
    status: 200,
    body: (async function* () { yield new TextEncoder().encode(text); }()),
  });

  test('loads from the first URL that works', async () => {
    const tried = [];
    const result = await downloadRelease(db, 2015, {
      fetchImpl: async (url) => { tried.push(url); return ok(RELEASE_2015); },
    });
    assert.equal(tried.length, 1);
    assert.match(tried[0], /\/2015\/xmlmesh\/desc2015\.xml$/);
    assert.equal(result.loaded, 3);
    assert.equal(meshRelease(db).url, tried[0]);
  });

  test('falls back to the current-release path on a 404', async () => {
    const tried = [];
    await downloadRelease(db, 2015, {
      fetchImpl: async (url) => {
        tried.push(url);
        return tried.length === 1 ? { ok: false, status: 404 } : ok(RELEASE_2015);
      },
    });
    assert.equal(tried.length, 2);
    assert.match(meshRelease(db).url, /MESH_FILES/);
  });

  test('reports every URL it tried instead of a bare failure', async () => {
    // A load that fails silently is how a benchmark ends up running without a
    // vocabulary, so the error has to be actionable by whoever reads it.
    await assert.rejects(
      () => downloadRelease(db, 2015, { fetchImpl: async () => ({ ok: false, status: 403 }) }),
      (err) => /could not retrieve the 2015 MeSH release/.test(err.message)
        && /HTTP 403/.test(err.message)
        && /download manually/.test(err.message),
    );
    assert.equal(meshRelease(db), null, 'a failed download must not leave a release recorded');
  });

  test('a network error is surfaced with its URL, not swallowed', async () => {
    await assert.rejects(
      () => downloadRelease(db, 2015, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }),
      /ECONNREFUSED/,
    );
  });

  test('the year check still applies to a downloaded file', async () => {
    await assert.rejects(
      () => downloadRelease(db, 2015, { fetchImpl: async () => ok(RELEASE_2015.replace('20150101', '20240101')) }),
      /expected the 2015 release but the file declares 2024/,
    );
  });
});
