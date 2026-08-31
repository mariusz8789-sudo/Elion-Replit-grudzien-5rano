/* global AbortSignal */

const ALLOWED_PREFIXES = [
  { host: 'pubchem.ncbi.nlm.nih.gov', pathPrefix: '/rest/pug/compound/' },
  { host: 'www.ebi.ac.uk', pathPrefix: '/chembl/api/data/' },
];

export function allowlistedBiotechUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2_000) return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return ALLOWED_PREFIXES.some(({ host, pathPrefix }) => parsed.hostname === host && parsed.pathname.startsWith(pathPrefix)) ? parsed : null;
}

export async function fetchBiotechSource(rawUrl, fetchImpl = fetch) {
  const url = allowlistedBiotechUrl(rawUrl);
  if (!url) return { status: 400, body: { error: 'source_not_allowlisted', message: 'Dozwolone są wyłącznie jawne endpointy PubChem i ChEMBL.' } };
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: 'source_invalid_json' }; }
    return { status: response.status, body };
  } catch {
    return { status: 504, body: { error: 'source_timeout', message: 'Źródło zewnętrzne nie odpowiedziało w limicie 8 s.' } };
  }
}
