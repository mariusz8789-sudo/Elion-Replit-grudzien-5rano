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

/**
 * D-085 — maximum redirect hops. Each hop is re-validated against the SAME
 * allowlist from scratch; a redirect is a brand-new request to a brand-new
 * host, and inheriting the first hop's approval is how an allowlisted URL
 * becomes a request to an internal address.
 */
export const MAX_REDIRECT_HOPS = 3;

export async function fetchBiotechSource(rawUrl, fetchImpl = fetch) {
  let url = allowlistedBiotechUrl(rawUrl);
  if (!url) return { status: 400, body: { error: 'source_not_allowlisted', message: 'Dozwolone są wyłącznie jawne endpointy PubChem i ChEMBL.' } };
  try {
    let response;
    let hops = 0;
    // `redirect: 'manual'` because the default is 'follow': the allowlist would
    // then be checked once, on a URL the server is free to redirect anywhere.
    // Every hop goes back through allowlistedBiotechUrl, so a 302 to an
    // internal address is refused exactly like a direct request to it.
    for (;;) {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers?.get?.('location');
      if (!location) return { status: 502, body: { error: 'source_redirect_without_location' } };
      if ((hops += 1) > MAX_REDIRECT_HOPS) return { status: 502, body: { error: 'source_too_many_redirects' } };
      const next = allowlistedBiotechUrl(new URL(location, url).toString());
      if (!next) return { status: 400, body: { error: 'source_redirect_not_allowlisted', message: 'Przekierowanie poza allowlistę zostało odrzucone.' } };
      url = next;
    }
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: 'source_invalid_json' }; }
    return { status: response.status, body };
  } catch {
    return { status: 504, body: { error: 'source_timeout', message: 'Źródło zewnętrzne nie odpowiedziało w limicie 8 s.' } };
  }
}
