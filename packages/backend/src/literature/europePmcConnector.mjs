/* global AbortSignal */
import { canonicalHash } from '../provenance.mjs';
import {
  classifyLiteratureLicence,
  literatureMetadataHash,
  LITERATURE_RETRIEVAL_STATUS,
  validateLiteratureQuery,
} from './literatureContracts.mjs';

const PROVIDER = 'EUROPE_PMC';
const API_ORIGIN = 'https://www.ebi.ac.uk';
const API_PATH = '/europepmc/webservices/rest/search';
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 2;

function allowlistedEuropePmcUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.origin !== API_ORIGIN || url.pathname !== API_PATH) return null;
  return url;
}

function authorsOf(result) {
  const detailed = result.authorList?.author;
  if (Array.isArray(detailed)) {
    return detailed.map((author) => author.fullName || author.collectiveName).filter(Boolean);
  }
  if (typeof result.authorString === 'string') {
    return result.authorString.split(',').map((author) => author.trim()).filter(Boolean);
  }
  return [];
}

function canonicalArticleUrl(result) {
  if (result.doi) return `https://doi.org/${String(result.doi).toLowerCase()}`;
  const source = encodeURIComponent(result.source || 'MED');
  const id = encodeURIComponent(result.id || result.pmid || result.pmcid);
  return `https://europepmc.org/article/${source}/${id}`;
}

function fullTextAvailability(result) {
  if (result.inEPMC === 'Y' || result.inEPMC === true || result.pmcid) return 'EUROPE_PMC';
  if (result.inPMC === 'Y' || result.inPMC === true) return 'PMC';
  return 'NONE';
}

function mapResult(result, context) {
  const providerId = result.id || result.pmid || result.pmcid;
  if (!providerId || typeof result.title !== 'string' || result.title.trim().length === 0) return null;
  const licence = classifyLiteratureLicence(result.license ?? result.licence);
  const source = {
    sourceId: `europe-pmc:${result.source || 'UNKNOWN'}:${providerId}`,
    title: result.title.trim(),
    authors: authorsOf(result),
    doi: result.doi ? String(result.doi).toLowerCase() : null,
    pmid: result.pmid ? String(result.pmid) : (result.source === 'MED' ? String(result.id) : null),
    pmcid: result.pmcid ? String(result.pmcid).toUpperCase() : null,
    canonicalUrl: canonicalArticleUrl(result),
    publicationDate: result.firstPublicationDate || result.electronicPublicationDate || result.journalInfo?.printPublicationDate || null,
    sourceProvider: PROVIDER,
    licence: licence.licence,
    licenceStatus: licence.licenceStatus,
    retrievalStatus: LITERATURE_RETRIEVAL_STATUS.METADATA_ONLY,
    fullTextAvailability: fullTextAvailability(result),
    retrievalTimestamp: context.retrievedAt,
    provenance: {
      provider: PROVIDER,
      providerRecordId: String(providerId),
      requestHash: context.requestHash,
      responseStatus: context.responseStatus,
      retrievedAt: context.retrievedAt,
    },
  };
  return { ...source, metadataHash: literatureMetadataHash(source) };
}

function blocked(status, failureCode, message, provenance = {}) {
  return { status, sources: [], failureCode, message, provenance: { provider: PROVIDER, ...provenance } };
}

async function fetchAllowlisted(initialUrl, fetchImpl, timeoutMs) {
  let url = allowlistedEuropePmcUrl(initialUrl);
  if (!url) return { ok: false, kind: 'CONFIGURATION', error: 'EUROPE_PMC_URL_NOT_ALLOWLISTED' };
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, kind: 'NETWORK', error: 'EUROPE_PMC_NETWORK_ERROR' };
    }
    if (!REDIRECT_CODES.has(response.status)) return { ok: true, response, url };
    const location = response.headers?.get?.('location');
    if (!location) return { ok: false, kind: 'NETWORK', error: 'EUROPE_PMC_REDIRECT_WITHOUT_LOCATION' };
    url = allowlistedEuropePmcUrl(new URL(location, url).toString());
    if (!url) return { ok: false, kind: 'CONFIGURATION', error: 'EUROPE_PMC_REDIRECT_NOT_ALLOWLISTED' };
  }
  return { ok: false, kind: 'NETWORK', error: 'EUROPE_PMC_TOO_MANY_REDIRECTS' };
}

export async function queryEuropePmc(query, options = {}) {
  const validated = validateLiteratureQuery(query);
  if (!validated.ok) return blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, validated.error, validated.message);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const url = new URL(API_PATH, API_ORIGIN);
  url.searchParams.set('query', validated.value.text);
  url.searchParams.set('format', 'json');
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('pageSize', String(validated.value.limit));
  const requestHash = canonicalHash({ provider: PROVIDER, query: validated.value });
  const fetched = await fetchAllowlisted(url, fetchImpl, timeoutMs);
  const commonProvenance = { requestHash, retrievedAt };
  if (!fetched.ok) {
    const status = fetched.kind === 'NETWORK'
      ? LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK
      : LITERATURE_RETRIEVAL_STATUS.NO_ACCESS;
    return blocked(status, fetched.error, 'Europe PMC request failed closed.', commonProvenance);
  }
  const response = fetched.response;
  const responseProvenance = { ...commonProvenance, responseStatus: response.status };
  if (response.status === 404) return blocked(LITERATURE_RETRIEVAL_STATUS.NOT_FOUND, 'EUROPE_PMC_NOT_FOUND', 'No Europe PMC endpoint result.', responseProvenance);
  if (response.status === 401 || response.status === 403) return blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'EUROPE_PMC_ACCESS_DENIED', 'Europe PMC denied access.', responseProvenance);
  if (response.status === 429 || response.status >= 500) return blocked(LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK, response.status === 429 ? 'EUROPE_PMC_RATE_LIMITED' : 'EUROPE_PMC_UPSTREAM_ERROR', 'Europe PMC is temporarily unavailable.', responseProvenance);
  if (!response.ok) return blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'EUROPE_PMC_HTTP_ERROR', `Europe PMC returned HTTP ${response.status}.`, responseProvenance);
  let body;
  try { body = JSON.parse(await response.text()); } catch {
    return blocked(LITERATURE_RETRIEVAL_STATUS.NO_ACCESS, 'EUROPE_PMC_INVALID_JSON', 'Europe PMC returned invalid JSON.', responseProvenance);
  }
  const results = Array.isArray(body?.resultList?.result) ? body.resultList.result : [];
  const sources = results.map((result) => mapResult(result, responseProvenance)).filter(Boolean);
  if (sources.length === 0) return blocked(LITERATURE_RETRIEVAL_STATUS.NOT_FOUND, 'EUROPE_PMC_NO_RESULTS', 'No literature records matched the query.', responseProvenance);
  return {
    status: LITERATURE_RETRIEVAL_STATUS.METADATA_ONLY,
    sources,
    failureCode: null,
    message: null,
    provenance: { provider: PROVIDER, ...responseProvenance },
  };
}
