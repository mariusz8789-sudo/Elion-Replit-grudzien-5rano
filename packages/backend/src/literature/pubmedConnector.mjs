/* global AbortSignal */
import { canonicalHash } from '../provenance.mjs';
import { sha256Hex } from '../determinism.mjs';
import { PROVENANCE_CLASS } from '../provenanceClass.mjs';
import {
  classifyLiteratureLicence,
  literatureMetadataHash,
  LITERATURE_RETRIEVAL_STATUS,
  validateLiteratureQuery,
} from './literatureContracts.mjs';

/**
 * PubMed through NCBI E-utilities: `esearch` finds PMIDs, `esummary` returns their records. Metadata only;
 * PubMed carries no licence, so every record is UNKNOWN and no right to reuse is implied. Same fail-closed
 * rules as Europe PMC: one allowlisted origin and two paths, no redirect off them, no fallback source.
 */
const PROVIDER = 'PUBMED';
const API_ORIGIN = 'https://eutils.ncbi.nlm.nih.gov';
const ESEARCH_PATH = '/entrez/eutils/esearch.fcgi';
const ESUMMARY_PATH = '/entrez/eutils/esummary.fcgi';
const ALLOWED_PATHS = new Set([ESEARCH_PATH, ESUMMARY_PATH]);
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 2;
const TOOL = 'genesis';

function allowlistedPubmedUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.origin !== API_ORIGIN || !ALLOWED_PATHS.has(url.pathname)) return null;
  return url;
}

function blocked(status, failureCode, message, provenance = {}) {
  return { status, sources: [], failureCode, message, provenance: { provider: PROVIDER, ...provenance } };
}

async function fetchAllowlisted(initialUrl, fetchImpl, timeoutMs) {
  let url = allowlistedPubmedUrl(initialUrl);
  if (!url) return { ok: false, kind: 'CONFIGURATION', error: 'PUBMED_URL_NOT_ALLOWLISTED' };
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, kind: 'NETWORK', error: 'PUBMED_NETWORK_ERROR' };
    }
    if (!REDIRECT_CODES.has(response.status)) return { ok: true, response, url };
    const location = response.headers?.get?.('location');
    if (!location) return { ok: false, kind: 'NETWORK', error: 'PUBMED_REDIRECT_WITHOUT_LOCATION' };
    url = allowlistedPubmedUrl(new URL(location, url).toString());
    if (!url) return { ok: false, kind: 'CONFIGURATION', error: 'PUBMED_REDIRECT_NOT_ALLOWLISTED' };
  }
  return { ok: false, kind: 'NETWORK', error: 'PUBMED_TOO_MANY_REDIRECTS' };
}

/** One E-utilities call, read and parsed; returns `{ ok, body, provenance }` or a fail-closed result. */
async function getJson(url, fetchImpl, timeoutMs, provenance) {
  const fetched = await fetchAllowlisted(url, fetchImpl, timeoutMs);
  if (!fetched.ok) {
    const status = fetched.kind === 'NETWORK' ? LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK : LITERATURE_RETRIEVAL_STATUS.NO_ACCESS;
    return { ok: false, result: blocked(status, fetched.error, 'PubMed request failed closed.', provenance) };
  }
  const response = fetched.response;
  const responseProvenance = { ...provenance, responseStatus: response.status };
  if (response.status === 404) return { ok: false, result: blocked(LITERATURE_RETRIEVAL_STATUS.NOT_FOUND, 'PUBMED_NOT_FOUND', 'No PubMed endpoint result.', responseProvenance) };
  if (response.status === 401 || response.status === 403) return { ok: false, result: blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'PUBMED_ACCESS_DENIED', 'PubMed denied access.', responseProvenance) };
  if (response.status === 429 || response.status >= 500) return { ok: false, result: blocked(LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK, response.status === 429 ? 'PUBMED_RATE_LIMITED' : 'PUBMED_UPSTREAM_ERROR', 'PubMed is temporarily unavailable.', responseProvenance) };
  if (!response.ok) return { ok: false, result: blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'PUBMED_HTTP_ERROR', `PubMed returned HTTP ${response.status}.`, responseProvenance) };
  let rawBody;
  try { rawBody = await response.text(); } catch {
    return { ok: false, result: blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'PUBMED_RESPONSE_READ_ERROR', 'PubMed response could not be read.', responseProvenance) };
  }
  const bodyProvenance = { ...responseProvenance, responseHash: sha256Hex(rawBody), responseBytes: Buffer.byteLength(rawBody, 'utf8') };
  let body;
  try { body = JSON.parse(rawBody); } catch {
    return { ok: false, result: blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'PUBMED_INVALID_JSON', 'PubMed returned invalid JSON.', bodyProvenance) };
  }
  // E-utilities report a bad query or an over-limit as 200 with an `error` field.
  const apiError = body?.error ?? body?.esearchresult?.ERROR ?? null;
  if (apiError) {
    const limited = /rate limit/i.test(String(apiError));
    return { ok: false, result: blocked(limited ? LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK : LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, limited ? 'PUBMED_RATE_LIMITED' : 'PUBMED_API_ERROR', 'PubMed rejected the request.', bodyProvenance) };
  }
  return { ok: true, body, provenance: bodyProvenance };
}

function articleId(record, type) {
  const found = (Array.isArray(record.articleids) ? record.articleids : []).find((id) => id?.idtype === type);
  return typeof found?.value === 'string' && found.value.trim().length > 0 ? found.value.trim() : null;
}

function mapRecord(pmid, record, context) {
  if (!record || record.error || typeof record.title !== 'string' || record.title.trim().length === 0) return null;
  const doi = articleId(record, 'doi');
  const pmcid = articleId(record, 'pmc');
  const licence = classifyLiteratureLicence(null);
  const source = {
    sourceId: `pubmed:${pmid}`,
    title: record.title.trim(),
    authors: (Array.isArray(record.authors) ? record.authors : []).map((author) => author?.name).filter(Boolean),
    doi: doi ? doi.toLowerCase() : null,
    pmid: String(pmid),
    pmcid: pmcid ? pmcid.toUpperCase() : null,
    canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`,
    publicationDate: record.sortpubdate || record.pubdate || record.epubdate || null,
    sourceProvider: PROVIDER,
    licence: licence.licence,
    licenceStatus: licence.licenceStatus,
    retrievalStatus: LITERATURE_RETRIEVAL_STATUS.METADATA_ONLY,
    fullTextAvailability: pmcid ? 'PMC' : 'NONE',
    retrievalTimestamp: context.retrievedAt,
    provenanceClass: PROVENANCE_CLASS.SOURCE_FACT,
    provenance: {
      provider: PROVIDER,
      providerRecordId: String(pmid),
      requestHash: context.requestHash,
      responseStatus: context.responseStatus,
      responseHash: context.responseHash,
      responseBytes: context.responseBytes,
      searchResponseHash: context.searchResponseHash,
      retrievedAt: context.retrievedAt,
    },
  };
  return { ...source, metadataHash: literatureMetadataHash(source) };
}

export async function queryPubmed(query, options = {}) {
  const validated = validateLiteratureQuery(query);
  if (!validated.ok) return blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, validated.error, validated.message);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const requestHash = canonicalHash({ provider: PROVIDER, query: validated.value });
  const common = { requestHash, retrievedAt };

  const search = new URL(ESEARCH_PATH, API_ORIGIN);
  search.searchParams.set('db', 'pubmed');
  search.searchParams.set('term', validated.value.text);
  search.searchParams.set('retmax', String(validated.value.limit));
  search.searchParams.set('retmode', 'json');
  search.searchParams.set('tool', TOOL);
  const searched = await getJson(search, fetchImpl, timeoutMs, common);
  if (!searched.ok) return searched.result;
  const ids = (Array.isArray(searched.body?.esearchresult?.idlist) ? searched.body.esearchresult.idlist : [])
    .map(String).filter((id) => /^\d{1,12}$/.test(id)).slice(0, validated.value.limit);
  if (ids.length === 0) return blocked(LITERATURE_RETRIEVAL_STATUS.NOT_FOUND, 'PUBMED_NO_RESULTS', 'No PubMed records matched the query.', searched.provenance);

  const summary = new URL(ESUMMARY_PATH, API_ORIGIN);
  summary.searchParams.set('db', 'pubmed');
  summary.searchParams.set('id', ids.join(','));
  summary.searchParams.set('retmode', 'json');
  summary.searchParams.set('tool', TOOL);
  const summarised = await getJson(summary, fetchImpl, timeoutMs, { ...common, searchResponseHash: searched.provenance.responseHash });
  if (!summarised.ok) return summarised.result;
  const result = summarised.body?.result ?? {};
  // Only records for PMIDs this search returned; anything else in the payload is ignored.
  const sources = ids.map((pmid) => mapRecord(pmid, result[pmid], summarised.provenance)).filter(Boolean);
  if (sources.length === 0) return blocked(LITERATURE_RETRIEVAL_STATUS.NOT_FOUND, 'PUBMED_NO_RECORDS', 'PubMed returned no readable records.', summarised.provenance);
  return {
    status: LITERATURE_RETRIEVAL_STATUS.METADATA_ONLY,
    sources,
    failureCode: null,
    message: null,
    provenance: { provider: PROVIDER, ...summarised.provenance },
  };
}
