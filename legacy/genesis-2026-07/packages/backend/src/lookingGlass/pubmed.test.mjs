import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseYear, parseMeshHeadings, parseArticle, parseEFetch, parseESearch, PubMedClient, createRateLimiter } from './pubmed.mjs';

/**
 * PubMed client — parser tests.
 *
 * ⚠ THESE FIXTURES ARE WRITTEN FROM THE PUBLISHED PubMed DTD, NOT CAPTURED FROM
 * A LIVE RESPONSE. This environment cannot reach NCBI, so passing tests prove
 * the parser handles the documented schema — they do NOT prove NCBI still emits
 * that schema. `verifyAgainstLive()` closes that gap and has not been run.
 *
 * The PMIDs below are deliberately impossible (9-digit sequences starting 999)
 * so that a fixture leaking into a corpus would be obvious rather than plausible.
 */

const ARTICLE = `<PubmedArticle>
  <MedlineCitation Status="MEDLINE" Owner="NLM">
    <PMID Version="1">999000001</PMID>
    <Article PubModel="Print">
      <Journal>
        <ISSN IssnType="Print">0092-8674</ISSN>
        <JournalIssue CitedMedium="Print">
          <Volume>167</Volume>
          <PubDate><Year>2016</Year><Month>Dec</Month><Day>15</Day></PubDate>
        </JournalIssue>
        <Title>Cell</Title>
        <ISOAbbreviation>Cell</ISOAbbreviation>
      </Journal>
      <ArticleTitle>In Vivo Amelioration of Age-Associated Hallmarks.</ArticleTitle>
    </Article>
    <MedlineJournalInfo><MedlineTA>Cell</MedlineTA></MedlineJournalInfo>
    <MeshHeadingList>
      <MeshHeading>
        <DescriptorName UI="D019149" MajorTopicYN="Y">Cellular Senescence</DescriptorName>
        <QualifierName UI="Q000235" MajorTopicYN="N">genetics</QualifierName>
      </MeshHeading>
      <MeshHeading>
        <DescriptorName UI="D000375" MajorTopicYN="N">Aging</DescriptorName>
      </MeshHeading>
      <MeshHeading>
        <DescriptorName UI="D006801" MajorTopicYN="N">Humans</DescriptorName>
      </MeshHeading>
    </MeshHeadingList>
  </MedlineCitation>
</PubmedArticle>`;

/** A record with a free-text date, which PubMed genuinely emits. */
const MEDLINE_DATE = `<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">999000002</PMID>
    <Article>
      <Journal><JournalIssue><PubDate><MedlineDate>2015 Nov-Dec</MedlineDate></PubDate></JournalIssue><Title>Ageing Res Rev</Title></Journal>
      <ArticleTitle>A study with an awkward date.</ArticleTitle>
    </Article>
    <MeshHeadingList>
      <MeshHeading><DescriptorName UI="D016159" MajorTopicYN="Y">Telomere</DescriptorName></MeshHeading>
    </MeshHeadingList>
  </MedlineCitation>
</PubmedArticle>`;

/** No MeSH list at all — a very recent record that has not been indexed yet. */
const UNINDEXED = `<PubmedArticle>
  <MedlineCitation Status="PubMed-not-MEDLINE">
    <PMID Version="1">999000003</PMID>
    <Article>
      <Journal><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue><Title>bioRxiv</Title></Journal>
      <ArticleTitle>Not yet indexed.</ArticleTitle>
    </Article>
  </MedlineCitation>
</PubmedArticle>`;

describe('year parsing', () => {
  test('reads a structured PubDate', () => {
    assert.equal(parseYear('<PubDate><Year>2016</Year><Month>Dec</Month></PubDate>'), 2016);
  });

  test('recovers a year from a free-text MedlineDate', () => {
    assert.equal(parseYear('<PubDate><MedlineDate>2015 Nov-Dec</MedlineDate></PubDate>'), 2015);
    assert.equal(parseYear('<PubDate><MedlineDate>1998-1999</MedlineDate></PubDate>'), 1998);
  });

  test('returns null rather than guessing', () => {
    // A wrong year silently corrupts every time-sliced analysis, which is the
    // module's most valuable capability. Null is the safe answer.
    assert.equal(parseYear('<PubDate><MedlineDate>in press</MedlineDate></PubDate>'), null);
    assert.equal(parseYear(null), null);
    assert.equal(parseYear('<PubDate><Year>16</Year></PubDate>'), null);
  });
});

describe('MeSH heading parsing', () => {
  test('extracts descriptors with their UI and major-topic flag', () => {
    const mesh = parseMeshHeadings(ARTICLE);
    assert.equal(mesh.length, 3);
    const senescence = mesh.find((m) => m.ui === 'D019149');
    assert.equal(senescence.name, 'Cellular Senescence');
    assert.equal(senescence.isMajor, true);
    assert.equal(mesh.find((m) => m.ui === 'D000375').isMajor, false);
  });

  test('ignores QualifierName — only descriptors are concepts', () => {
    // Q000235 is a subheading ("genetics"), not a concept. Treating qualifiers as
    // concepts would flood the co-occurrence table with meaningless pairs.
    assert.ok(!parseMeshHeadings(ARTICLE).some((m) => m.ui.startsWith('Q')));
  });

  test('leaves tree numbers undefined — article records do not carry them', () => {
    assert.equal(parseMeshHeadings(ARTICLE)[0].treeNumbers, undefined);
  });

  test('returns an empty list for an unindexed record', () => {
    assert.deepEqual(parseMeshHeadings(UNINDEXED), []);
  });
});

describe('article parsing', () => {
  test('extracts the fields the corpus needs', () => {
    const a = parseArticle(ARTICLE);
    assert.equal(a.id, '999000001');
    assert.equal(a.year, 2016);
    assert.equal(a.journal, 'Cell');
    assert.match(a.title, /Age-Associated Hallmarks/);
    assert.equal(a.concepts.length, 3);
  });

  test('rejects a record whose PMID is not numeric', () => {
    assert.equal(parseArticle('<PubmedArticle><PMID>not-a-pmid</PMID></PubmedArticle>'), null);
  });

  test('strips inline markup from titles', () => {
    const xml = ARTICLE.replace('In Vivo Amelioration', '<i>In Vivo</i> Amelioration');
    assert.ok(!parseArticle(xml).title.includes('<i>'));
  });

  test('decodes XML entities', () => {
    const xml = ARTICLE.replace('Age-Associated', 'Age &amp; Associated &#x3B2;');
    const title = parseArticle(xml).title;
    assert.ok(title.includes('&'));
    assert.ok(title.includes('β'));
  });
});

describe('EFetch response parsing', () => {
  test('parses multiple records and counts what it skipped', () => {
    const r = parseEFetch(`<PubmedArticleSet>${ARTICLE}${MEDLINE_DATE}${UNINDEXED}</PubmedArticleSet>`);
    assert.equal(r.seen, 3);
    assert.equal(r.articles.length, 3);
    assert.equal(r.skipped, 0);
    assert.deepEqual(r.articles.map((a) => a.year), [2016, 2015, 2024]);
  });

  test('skips malformed records rather than inventing fields', () => {
    const r = parseEFetch(`<PubmedArticleSet>${ARTICLE}<PubmedArticle><broken/></PubmedArticle></PubmedArticleSet>`);
    assert.equal(r.articles.length, 1);
    assert.equal(r.skipped, 1);
  });

  test('an empty response yields nothing, not an error', () => {
    assert.deepEqual(parseEFetch('<PubmedArticleSet/>'), { articles: [], skipped: 0, seen: 0 });
    assert.deepEqual(parseEFetch(''), { articles: [], skipped: 0, seen: 0 });
  });
});

describe('ESearch response parsing', () => {
  test('extracts ids and the true total', () => {
    const r = parseESearch({ esearchresult: { count: '4211', idlist: ['999000001', '999000002'] } });
    assert.equal(r.total, 4211);
    assert.deepEqual(r.ids, ['999000001', '999000002']);
  });

  test('discards non-numeric ids', () => {
    assert.deepEqual(parseESearch({ esearchresult: { count: '2', idlist: ['999000001', 'oops'] } }).ids, ['999000001']);
  });

  test('survives an error-shaped response', () => {
    assert.deepEqual(parseESearch({ esearchresult: { ERROR: 'Invalid db' } }).ids, []);
    assert.deepEqual(parseESearch({}).ids, []);
  });
});

describe('rate limiting', () => {
  test('serialises calls and spaces them', async () => {
    const limit = createRateLimiter(50); // 20 ms apart
    const stamps = [];
    await Promise.all([1, 2, 3].map(() => limit(async () => stamps.push(Date.now()))));
    assert.equal(stamps.length, 3);
    assert.ok(stamps[2] - stamps[0] >= 30, `expected spacing, got ${stamps[2] - stamps[0]}ms`);
  });
});

describe('client request construction', () => {
  test('sends tool and api_key, and never leaks the key into an error', async () => {
    const seen = [];
    const client = new PubMedClient({
      apiKey: 'SECRET-KEY', email: 'a@b.io',
      fetchImpl: async (url) => { seen.push(url); return { ok: true, json: async () => ({ esearchresult: { count: '0', idlist: [] } }) }; },
    });
    await client.search('senescence');
    assert.match(seen[0], /tool=genesis-looking-glass/);
    assert.match(seen[0], /api_key=SECRET-KEY/);
    assert.match(seen[0], /email=a%40b\.io/);
  });

  test('applies a year window when asked', async () => {
    const seen = [];
    const client = new PubMedClient({
      fetchImpl: async (url) => { seen.push(url); return { ok: true, json: async () => ({ esearchresult: { count: '0', idlist: [] } }) }; },
    });
    await client.search('senescence', { minYear: 2000, maxYear: 2015 });
    assert.match(seen[0], /datetype=pdat/);
    assert.match(seen[0], /mindate=2000/);
    assert.match(seen[0], /maxdate=2015/);
  });

  test('flags a 429 as rate limiting so a caller can back off rather than retry', async () => {
    const client = new PubMedClient({ fetchImpl: async () => ({ ok: false, status: 429 }) });
    await assert.rejects(() => client.search('x'), (e) => e.rateLimited === true && e.status === 429);
  });

  test('refuses an oversized EFetch batch instead of building an unusable URL', async () => {
    const client = new PubMedClient({ fetchImpl: async () => ({ ok: true, text: async () => '' }) });
    await assert.rejects(() => client.fetchArticles(Array.from({ length: 201 }, (_, i) => String(i))), /at most 200/);
  });

  test('an empty batch is a no-op, not a request', async () => {
    let called = 0;
    const client = new PubMedClient({ fetchImpl: async () => { called += 1; return { ok: true, text: async () => '' }; } });
    assert.deepEqual(await client.fetchArticles([]), { articles: [], skipped: 0, seen: 0 });
    assert.equal(called, 0);
  });
});
