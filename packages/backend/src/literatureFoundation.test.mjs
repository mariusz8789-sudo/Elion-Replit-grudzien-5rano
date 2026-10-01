import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyLiteratureLicence,
  deduplicateLiteratureSources,
  LITERATURE_LICENCE_STATUS,
} from './literature/literatureContracts.mjs';
import { queryEuropePmc } from './literature/europePmcConnector.mjs';
import { searchLiterature } from './literature/literatureService.mjs';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const headers = (values = {}) => ({ get: (name) => values[name.toLowerCase()] ?? null });
const response = (status, body, extraHeaders = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: headers(extraHeaders),
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});

const fixture = {
  resultList: {
    result: [{
      id: '40123456', source: 'MED', pmid: '40123456', pmcid: 'PMC1234567',
      doi: '10.1000/GENESIS.1', title: 'A reproducible GLP-1R study',
      authorList: { author: [{ fullName: 'Ada Example' }, { fullName: 'Jan Test' }] },
      firstPublicationDate: '2025-03-04', inEPMC: 'Y', license: 'CC BY 4.0',
    }],
  },
};

describe('literature foundation', () => {
  it('maps Europe PMC metadata with deterministic identity, provenance and conservative licence status', async () => {
    let requested;
    const result = await queryEuropePmc({ text: 'GLP-1R', limit: 5 }, {
      now: () => NOW,
      fetchImpl: async (url, init) => { requested = { url: url.toString(), init }; return response(200, fixture); },
    });
    assert.equal(result.status, 'METADATA_ONLY');
    assert.equal(result.sources.length, 1);
    const [source] = result.sources;
    assert.equal(source.sourceId, 'europe-pmc:MED:40123456');
    assert.equal(source.doi, '10.1000/genesis.1');
    assert.equal(source.pmid, '40123456');
    assert.equal(source.pmcid, 'PMC1234567');
    assert.equal(source.licenceStatus, 'CONDITIONAL');
    assert.equal(source.fullTextAvailability, 'EUROPE_PMC');
    assert.match(source.metadataHash, /^[a-f0-9]{64}$/);
    assert.equal(source.retrievalTimestamp, NOW.toISOString());
    assert.match(requested.url, /^https:\/\/www\.ebi\.ac\.uk\/europepmc\/webservices\/rest\/search\?/);
    assert.equal(requested.init.redirect, 'manual');
  });

  it('does not infer commercial rights from open/full-text availability', async () => {
    const unknownLicence = JSON.parse(JSON.stringify(fixture));
    delete unknownLicence.resultList.result[0].license;
    const result = await queryEuropePmc({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: async () => response(200, unknownLicence) });
    assert.equal(result.sources[0].fullTextAvailability, 'EUROPE_PMC');
    assert.equal(result.sources[0].licence, null);
    assert.equal(result.sources[0].licenceStatus, 'UNKNOWN');
  });

  it('classifies non-commercial licences as blocked and unknown values as unknown', () => {
    assert.equal(classifyLiteratureLicence('CC BY-NC 4.0').licenceStatus, LITERATURE_LICENCE_STATUS.BLOCKED);
    assert.equal(classifyLiteratureLicence('publisher-specific').licenceStatus, LITERATURE_LICENCE_STATUS.UNKNOWN);
  });

  it('fails closed on rate limit, invalid JSON and invalid queries', async () => {
    const limited = await queryEuropePmc({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: async () => response(429, {}) });
    assert.deepEqual([limited.status, limited.failureCode, limited.sources.length], ['BLOCKED_BY_NETWORK', 'EUROPE_PMC_RATE_LIMITED', 0]);
    const invalidJson = await queryEuropePmc({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: async () => response(200, '{bad') });
    assert.deepEqual([invalidJson.status, invalidJson.failureCode, invalidJson.sources.length], ['NO_ACCESS', 'EUROPE_PMC_INVALID_JSON', 0]);
    const invalidQuery = await queryEuropePmc({ text: '' }, { now: () => NOW, fetchImpl: async () => { throw new Error('must not fetch'); } });
    assert.deepEqual([invalidQuery.status, invalidQuery.failureCode], ['NO_ACCESS', 'INVALID_QUERY']);
  });

  it('rejects redirects outside the Europe PMC API allowlist', async () => {
    const result = await queryEuropePmc({ text: 'GLP-1R' }, {
      now: () => NOW,
      fetchImpl: async () => response(302, '', { location: 'https://127.0.0.1/private' }),
    });
    assert.deepEqual([result.status, result.failureCode, result.sources.length], ['NO_ACCESS', 'EUROPE_PMC_REDIRECT_NOT_ALLOWLISTED', 0]);
  });

  it('deduplicates canonical DOI identities and keeps contradictory records available to later claim binding', () => {
    const first = { sourceId: 'a', doi: '10.1/X', pmid: null, pmcid: null };
    const duplicate = { sourceId: 'b', doi: '10.1/x', pmid: '2', pmcid: null };
    const distinct = { sourceId: 'c', doi: null, pmid: '3', pmcid: null };
    assert.deepEqual(deduplicateLiteratureSources([first, duplicate, distinct]), [first, distinct]);
  });

  it('aggregates connectors without inventing fallback sources', async () => {
    const connectors = [
      { id: 'ONE', query: async () => ({ status: 'NOT_FOUND', sources: [], provenance: {} }) },
      { id: 'TWO', query: async () => { throw new Error('offline'); } },
    ];
    const result = await searchLiterature({ text: 'unknown' }, { connectors });
    assert.equal(result.status, 'BLOCKED_BY_NETWORK');
    assert.deepEqual(result.sources, []);
    assert.equal(result.connectors[1].failureCode, 'LITERATURE_CONNECTOR_UNHANDLED_FAILURE');
  });
});
