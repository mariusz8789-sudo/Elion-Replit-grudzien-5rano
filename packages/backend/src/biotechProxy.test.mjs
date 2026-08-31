import test from 'node:test';
/* global Response */

import assert from 'node:assert/strict';
import { allowlistedBiotechUrl, fetchBiotechSource } from './biotechProxy.mjs';

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
