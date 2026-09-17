import test from 'node:test';
/* global Response */

import assert from 'node:assert/strict';
import { allowlistedBiotechUrl, fetchBiotechSource, MAX_REDIRECT_HOPS } from './biotechProxy.mjs';

test('allowlists only PubChem and ChEMBL source paths', () => {
  assert.equal(allowlistedBiotechUrl('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519/property/Title/JSON')?.hostname, 'pubchem.ncbi.nlm.nih.gov');
  assert.equal(allowlistedBiotechUrl('https://www.ebi.ac.uk/chembl/api/data/activity.json?limit=1')?.hostname, 'www.ebi.ac.uk');
  assert.equal(allowlistedBiotechUrl('https://example.com/?url=https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519'), null);
  assert.equal(allowlistedBiotechUrl('http://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519/property/Title/JSON'), null);
});

test('proxies a source response without inventing a payload', async () => {
  const result = await fetchBiotechSource(
    'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2519/property/Title/JSON',
    async (url, init) => {
      assert.equal(url.hostname, 'pubchem.ncbi.nlm.nih.gov');
      assert.equal(init.headers.accept, 'application/json');
      return new Response('{"PropertyTable":{"Properties":[{"CID":2519}]}}', { status: 200 });
    },
  );
  assert.deepEqual(result, { status: 200, body: { PropertyTable: { Properties: [{ CID: 2519 }] } } });
});

test('blocks non-allowlisted requests before fetch', async () => {
  let called = false;
  const result = await fetchBiotechSource('https://example.com/', async () => {
    called = true;
    return new Response('{}');
  });
  assert.equal(called, false);
  assert.equal(result.status, 400);
});

/* ------------------------------------------------- D-085 redirect custody */

const redirectResponse = (status, location) => ({
  status,
  headers: { get: (h) => (h.toLowerCase() === 'location' ? location : null) },
  text: async () => '{}',
});
const okResponse = (body) => ({ status: 200, headers: { get: () => null }, text: async () => body });

test('a redirect off the allowlist is refused, and the redirect target is never fetched', async () => {
  // `fetch` follows redirects by default, so before D-085 the allowlist was
  // checked once and the server was then free to send the request anywhere —
  // including the cloud metadata endpoint.
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    return fetched.length === 1
      ? redirectResponse(302, 'http://169.254.169.254/latest/meta-data/')
      : okResponse('{"leaked":true}');
  };
  const res = await fetchBiotechSource('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1/property/CanonicalSMILES/JSON', fetchImpl);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'source_redirect_not_allowlisted');
  assert.equal(fetched.length, 1, 'the redirect target must never be requested');
});

test('a redirect that stays inside the allowlist is followed', async () => {
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    return fetched.length === 1
      ? redirectResponse(301, 'https://www.ebi.ac.uk/chembl/api/data/target/CHEMBL1784.json')
      : okResponse('{"ok":1}');
  };
  const res = await fetchBiotechSource('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1/property/CanonicalSMILES/JSON', fetchImpl);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: 1 });
  assert.equal(fetched.length, 2);
});

test('a redirect loop is capped instead of spinning', async () => {
  let n = 0;
  const fetchImpl = async () => { n += 1; return redirectResponse(302, `https://www.ebi.ac.uk/chembl/api/data/x${n}`); };
  const res = await fetchBiotechSource('https://www.ebi.ac.uk/chembl/api/data/y', fetchImpl);
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'source_too_many_redirects');
  assert.ok(n <= MAX_REDIRECT_HOPS + 1, `expected at most ${MAX_REDIRECT_HOPS + 1} requests, made ${n}`);
});

test('a redirect with no Location header fails closed', async () => {
  const res = await fetchBiotechSource('https://www.ebi.ac.uk/chembl/api/data/y', async () => redirectResponse(302, null));
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'source_redirect_without_location');
});
