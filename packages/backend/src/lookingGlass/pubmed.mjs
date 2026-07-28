/**
 * Looking Glass — PubMed E-utilities client.
 *
 * ⚠ NOT VERIFIED AGAINST LIVE NCBI OUTPUT. The environment this was written in
 * refuses outbound connections to eutils.ncbi.nlm.nih.gov (403 on CONNECT), so
 * the parser below is written against the documented PubMed DTD and exercised
 * against fixtures built from that documentation — NOT against a real response.
 * `verifyAgainstLive()` exists precisely so the first person with network access
 * can check it in one command, and nothing here should be described as working
 * until that has been run.
 *
 * WHY A HAND-WRITTEN PARSER. The backend has no third-party dependencies —
 * node:sqlite, node:test and nothing else. Adding an XML library for four fields
 * would be the largest supply-chain surface in the project. The parser is
 * therefore deliberately narrow: it extracts PMID, year, title, journal and MeSH
 * headings and ignores everything else, which is also what makes it safe. It is
 * not a general XML parser and must never be used as one.
 *
 * RATE LIMITS ARE NOT OPTIONAL. NCBI permits 3 requests/second without an API
 * key and 10 with one, and enforces it by blocking. Exceeding it gets an
 * institution's IP banned, which is a real and embarrassing way to end a pilot.
 */

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/** Conservative defaults — the documented ceilings minus a margin. */
export const RATE_LIMITS = { withoutKey: 3, withKey: 9 };

/** Simple serialising rate limiter. Requests queue rather than burst. */
export function createRateLimiter(perSecond) {
  const minGap = 1000 / Math.max(1, perSecond);
  let last = 0;
  let chain = Promise.resolve();
  return (fn) => {
    chain = chain.then(async () => {
      const wait = Math.max(0, last + minGap - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return fn();
    });
    return chain;
  };
}

/* ------------------------------- parsing ------------------------------- */

/** Every occurrence of a simple element's text content. */
function tagContents(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function firstTag(xml, tag) {
  return tagContents(xml, tag)[0] ?? null;
}

/** XML entities that appear in PubMed titles. Deliberately minimal. */
function decode(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')              // PubMed permits inline markup in titles
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Publication year. PubDate carries either <Year> or a free-text <MedlineDate>
 * such as "2016 Nov-Dec" or "1998-1999". Returning null for an unparseable date
 * is correct: a wrong year silently corrupts every time-sliced analysis, and
 * time-slicing is the module's most valuable capability.
 */
export function parseYear(pubDateXml) {
  if (!pubDateXml) return null;
  const year = firstTag(pubDateXml, 'Year');
  if (year && /^\d{4}$/.test(year.trim())) return Number(year.trim());
  const medline = firstTag(pubDateXml, 'MedlineDate');
  const match = medline && medline.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * MeSH headings for one citation. `MajorTopicYN` on the DescriptorName marks the
 * article's principal subjects; major-only co-occurrence is far less noisy, so
 * the flag is preserved rather than flattened.
 */
export function parseMeshHeadings(citationXml) {
  const list = firstTag(citationXml, 'MeshHeadingList');
  if (!list) return [];
  const out = [];
  const re = /<DescriptorName\b([^>]*)>([\s\S]*?)<\/DescriptorName>/g;
  let m;
  while ((m = re.exec(list)) !== null) {
    const attrs = m[1];
    const ui = (attrs.match(/UI="([^"]+)"/) ?? [])[1];
    if (!ui) continue;
    out.push({
      ui,
      name: decode(m[2]),
      isMajor: /MajorTopicYN="Y"/.test(attrs),
      // Tree numbers are NOT present in an article record — they live in the MeSH
      // descriptor database. Left undefined so the store keeps 'unclassified'
      // until fetchMeshDescriptors() supplies them.
      treeNumbers: undefined,
    });
  }
  return out;
}

/** One <PubmedArticle> block into the shape ingestArticles expects. */
export function parseArticle(articleXml) {
  const pmid = firstTag(articleXml, 'PMID');
  if (!pmid) return null;
  const id = decode(pmid);
  // A PMID is always numeric. Anything else means the parse went wrong, and a
  // non-numeric id would be rejected by isCitable() downstream anyway.
  if (!/^\d+$/.test(id)) return null;

  const journal = firstTag(articleXml, 'Journal') ?? '';
  return {
    id,
    year: parseYear(firstTag(journal, 'PubDate') ?? firstTag(articleXml, 'PubDate')),
    title: decode(firstTag(articleXml, 'ArticleTitle') ?? ''),
    journal: decode(firstTag(journal, 'Title') ?? firstTag(articleXml, 'MedlineTA') ?? ''),
    concepts: parseMeshHeadings(articleXml),
  };
}

/** A full EFetch response into articles. Malformed records are skipped, not guessed at. */
export function parseEFetch(xml) {
  const blocks = String(xml ?? '').split('<PubmedArticle>').slice(1);
  const articles = [];
  let skipped = 0;
  for (const block of blocks) {
    const parsed = parseArticle(block);
    if (parsed) articles.push(parsed); else skipped += 1;
  }
  return { articles, skipped, seen: blocks.length };
}

/** ESearch JSON into a PMID list plus the total the query would return. */
export function parseESearch(json) {
  const result = json?.esearchresult ?? {};
  return {
    ids: Array.isArray(result.idlist) ? result.idlist.filter((x) => /^\d+$/.test(x)) : [],
    total: Number(result.count ?? 0),
    webenv: result.webenv ?? null,
    queryKey: result.querykey ?? null,
  };
}

/** MeSH descriptor summaries (db=mesh) into tree numbers, which articles lack. */
export function parseMeshSummary(json) {
  const uids = json?.result?.uids ?? [];
  return uids.map((uid) => {
    const rec = json.result[uid] ?? {};
    return {
      ui: rec.ds_meshui ?? uid,
      name: rec.ds_meshterms?.[0] ?? rec.title ?? uid,
      treeNumbers: rec.ds_idxlinks?.map?.((l) => l.treenum).filter(Boolean) ?? (rec.ds_treenum ?? []),
    };
  }).filter((d) => d.ui);
}

/* ------------------------------ fetching ------------------------------ */

export class PubMedClient {
  /**
   * @param apiKey   NCBI API key. Without one the rate ceiling is 3 req/s.
   * @param fetchImpl Injected so the parser can be tested without a network,
   *                  and so a caller can supply a proxy-aware fetch.
   */
  constructor({ apiKey = null, fetchImpl = globalThis.fetch, tool = 'genesis-looking-glass', email = null } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.tool = tool;
    this.email = email;
    this.limit = createRateLimiter(apiKey ? RATE_LIMITS.withKey : RATE_LIMITS.withoutKey);
  }

  params(extra) {
    const p = new URLSearchParams({ tool: this.tool, ...extra });
    // NCBI asks for a contact address so they can warn before blocking.
    if (this.email) p.set('email', this.email);
    if (this.apiKey) p.set('api_key', this.apiKey);
    return p;
  }

  async get(path, extra, { json = false } = {}) {
    const url = `${EUTILS}/${path}?${this.params(extra)}`;
    return this.limit(async () => {
      const res = await this.fetchImpl(url);
      if (!res.ok) {
        const err = new Error(`NCBI responded ${res.status} for ${path}`);
        err.status = res.status;
        // 429 is the documented signal that the rate limit was exceeded.
        err.rateLimited = res.status === 429;
        throw err;
      }
      return json ? res.json() : res.text();
    });
  }

  /** PMIDs matching a query. `mindate`/`maxdate` restrict by publication year. */
  async search(query, { retmax = 100, retstart = 0, minYear = null, maxYear = null } = {}) {
    const extra = { db: 'pubmed', term: query, retmax: String(retmax), retstart: String(retstart), retmode: 'json' };
    if (minYear || maxYear) {
      extra.datetype = 'pdat';
      extra.mindate = String(minYear ?? 1800);
      extra.maxdate = String(maxYear ?? new Date().getFullYear());
    }
    return parseESearch(await this.get('esearch.fcgi', extra, { json: true }));
  }

  /** Full records for up to 200 PMIDs. NCBI's documented ceiling for GET is higher; 200 keeps URLs sane. */
  async fetchArticles(pmids) {
    if (pmids.length === 0) return { articles: [], skipped: 0, seen: 0 };
    if (pmids.length > 200) throw new Error('fetchArticles accepts at most 200 PMIDs per call');
    return parseEFetch(await this.get('efetch.fcgi', { db: 'pubmed', id: pmids.join(','), retmode: 'xml' }));
  }

  /** Tree numbers for MeSH descriptors, which article records do not carry. */
  async fetchMeshDescriptors(meshUids) {
    if (meshUids.length === 0) return [];
    return parseMeshSummary(await this.get('esummary.fcgi', { db: 'mesh', id: meshUids.join(','), retmode: 'json' }, { json: true }));
  }
}

/**
 * Ingest a query into a corpus, in pages, reporting progress.
 *
 * Deliberately NOT parallelised. NCBI's limit is per IP, so concurrency here buys
 * nothing and risks a block; a corpus build is an overnight job, not an
 * interactive one.
 */
export async function ingestQuery(db, client, storeModule, { query, maxArticles = 1000, pageSize = 100, minYear = null, maxYear = null, onProgress = null } = {}) {
  const { ingestArticles, recordIngest } = storeModule;
  const startedAt = Date.now();
  const ingestId = `ing-${startedAt}`;
  let retrieved = 0;
  let skipped = 0;

  const first = await client.search(query, { retmax: 0, minYear, maxYear });
  const target = Math.min(maxArticles, first.total);

  for (let start = 0; start < target; start += pageSize) {
    const page = await client.search(query, { retmax: Math.min(pageSize, target - start), retstart: start, minYear, maxYear });
    if (page.ids.length === 0) break;
    const fetched = await client.fetchArticles(page.ids);
    ingestArticles(db, fetched.articles, { source: 'pubmed' });
    retrieved += fetched.articles.length;
    skipped += fetched.skipped;
    onProgress?.({ retrieved, skipped, target, total: first.total });
  }

  recordIngest(db, {
    id: ingestId, query, requested: target, retrieved,
    fromYear: minYear, toYear: maxYear, startedAt, finishedAt: Date.now(),
  });
  return { ingestId, query, total: first.total, target, retrieved, skipped };
}

/**
 * One-command check for the first environment that can reach NCBI.
 *
 * Verifies what the fixtures cannot: that the live response still matches the
 * shape this parser assumes. Until it has been run and reported, the client
 * should be described as written, not as working.
 */
export async function verifyAgainstLive({ apiKey = null, email = null } = {}) {
  const client = new PubMedClient({ apiKey, email });
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok, detail });

  try {
    const search = await client.search('cellular senescence AND SASP', { retmax: 5 });
    record('esearch returns PMIDs', search.ids.length > 0, `${search.ids.length} ids of ${search.total} total`);

    const fetched = await client.fetchArticles(search.ids.slice(0, 3));
    record('efetch parses articles', fetched.articles.length > 0, `${fetched.articles.length} parsed, ${fetched.skipped} skipped`);

    const withYear = fetched.articles.filter((a) => a.year !== null);
    record('publication years parse', withYear.length === fetched.articles.length,
      `${withYear.length}/${fetched.articles.length} — a missing year breaks time-sliced analysis`);

    const withMesh = fetched.articles.filter((a) => a.concepts.length > 0);
    record('MeSH headings present', withMesh.length > 0,
      `${withMesh.length}/${fetched.articles.length} carry headings (very recent records may not be indexed yet)`);

    const uis = [...new Set(fetched.articles.flatMap((a) => a.concepts.map((c) => c.ui)))].slice(0, 5);
    record('MeSH UIs look like descriptors', uis.every((u) => /^D\d+$/.test(u)), uis.join(', '));
  } catch (err) {
    record('network reachable', false, `${err.message}${err.rateLimited ? ' (rate limited)' : ''}`);
  }

  return { ok: checks.every((c) => c.ok), checks };
}
