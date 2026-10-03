import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { queryPubmed } from './literature/pubmedConnector.mjs';
import { queryEuropePmc } from './literature/europePmcConnector.mjs';
import { searchLiterature } from './literature/literatureService.mjs';
import { proposeClaimEvidenceLink, unknownClaimEvidenceLink } from './literature/claimEvidenceLink.mjs';
import { executionProvenanceClass, isProvenanceClass, PROVENANCE_CLASS, researchRunProvenance } from './provenanceClass.mjs';

const NOW = new Date('2026-10-03T00:00:00.000Z');
const headers = (values = {}) => ({ get: (name) => values[name.toLowerCase()] ?? null });
const response = (status, body, extraHeaders = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: headers(extraHeaders),
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});

const ESEARCH = { esearchresult: { count: '2', idlist: ['40123456', '40999999'] } };
const ESUMMARY = {
  result: {
    uids: ['40123456', '40999999', '11111111'],
    40123456: {
      uid: '40123456', title: 'A reproducible GLP-1R study', sortpubdate: '2025/03/04 00:00',
      authors: [{ name: 'Example A' }, { name: 'Test J' }],
      articleids: [{ idtype: 'pubmed', value: '40123456' }, { idtype: 'doi', value: '10.1000/GENESIS.1' }, { idtype: 'pmc', value: 'pmc1234567' }],
    },
    40999999: { uid: '40999999', title: 'Second record', pubdate: '2024', authors: [], articleids: [] },
    // Not in the search result: must never become a source.
    11111111: { uid: '11111111', title: 'Injected record', articleids: [] },
  },
};

function pubmedFetch(routes, calls = []) {
  return async (url) => {
    const u = new URL(url.toString());
    calls.push(u);
    const route = routes[u.pathname];
    if (!route) throw new Error(`unexpected ${u}`);
    return typeof route === 'function' ? route(u) : route;
  };
}

describe('PubMed connector (NCBI E-utilities)', () => {
  it('maps esearch + esummary to metadata-only sources with provenance, unknown licence and SOURCE_FACT', async () => {
    const calls = [];
    const esummaryRaw = JSON.stringify(ESUMMARY);
    const result = await queryPubmed({ text: 'GLP-1R', limit: 5 }, {
      now: () => NOW,
      fetchImpl: pubmedFetch({
        '/entrez/eutils/esearch.fcgi': response(200, ESEARCH),
        '/entrez/eutils/esummary.fcgi': response(200, esummaryRaw),
      }, calls),
    });
    assert.equal(result.status, 'METADATA_ONLY');
    assert.deepEqual(result.sources.map((s) => s.sourceId), ['pubmed:40123456', 'pubmed:40999999']);
    const [first] = result.sources;
    assert.equal(first.doi, '10.1000/genesis.1');
    assert.equal(first.pmcid, 'PMC1234567');
    assert.equal(first.fullTextAvailability, 'PMC');
    assert.equal(first.licenceStatus, 'UNKNOWN');
    assert.equal(first.licence, null);
    assert.equal(first.provenanceClass, PROVENANCE_CLASS.SOURCE_FACT);
    assert.equal(first.canonicalUrl, 'https://pubmed.ncbi.nlm.nih.gov/40123456/');
    assert.equal(first.provenance.responseHash, createHash('sha256').update(esummaryRaw).digest('hex'));
    assert.match(first.metadataHash, /^[0-9a-f]{64}$/);
    assert.equal(calls[0].origin, 'https://eutils.ncbi.nlm.nih.gov');
    assert.equal(calls[0].searchParams.get('retmax'), '5');
    assert.equal(calls[1].searchParams.get('id'), '40123456,40999999');
  });

  it('fails closed: rate limit, API error in a 200, invalid JSON, redirect off the allowlist, empty search', async () => {
    const limited = await queryPubmed({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: pubmedFetch({ '/entrez/eutils/esearch.fcgi': response(429, {}) }) });
    assert.equal(limited.status, 'BLOCKED_BY_NETWORK');
    assert.equal(limited.failureCode, 'PUBMED_RATE_LIMITED');

    const apiError = await queryPubmed({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: pubmedFetch({ '/entrez/eutils/esearch.fcgi': response(200, { error: 'API rate limit exceeded' }) }) });
    assert.equal(apiError.failureCode, 'PUBMED_RATE_LIMITED');

    const invalid = await queryPubmed({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: pubmedFetch({ '/entrez/eutils/esearch.fcgi': response(200, '{bad') }) });
    assert.equal(invalid.failureCode, 'PUBMED_INVALID_JSON');

    const redirected = await queryPubmed({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: pubmedFetch({ '/entrez/eutils/esearch.fcgi': response(302, '', { location: 'https://127.0.0.1/private' }) }) });
    assert.equal(redirected.status, 'NO_ACCESS');
    assert.equal(redirected.failureCode, 'PUBMED_REDIRECT_NOT_ALLOWLISTED');

    const empty = await queryPubmed({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: pubmedFetch({ '/entrez/eutils/esearch.fcgi': response(200, { esearchresult: { idlist: [] } }) }) });
    assert.equal(empty.status, 'NOT_FOUND');
    assert.deepEqual(empty.sources, []);

    const network = await queryPubmed({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(network.status, 'BLOCKED_BY_NETWORK');

    const invalidQuery = await queryPubmed({ text: '' }, { fetchImpl: async () => { throw new Error('must not fetch'); } });
    assert.equal(invalidQuery.failureCode, 'INVALID_QUERY');
  });

  it('is a default connector next to Europe PMC; the same DOI from both counts once', async () => {
    const epmc = { resultList: { result: [{ id: '40123456', source: 'MED', pmid: '40123456', doi: '10.1000/GENESIS.1', title: 'A reproducible GLP-1R study' }] } };
    const fetchImpl = async (url) => {
      const u = new URL(url.toString());
      if (u.origin === 'https://www.ebi.ac.uk') return response(200, epmc);
      if (u.pathname.endsWith('esearch.fcgi')) return response(200, ESEARCH);
      return response(200, ESUMMARY);
    };
    const result = await searchLiterature({ text: 'GLP-1R', limit: 5 }, { now: () => NOW, fetchImpl });
    assert.deepEqual(result.connectors.map((c) => c.connectorId), ['EUROPE_PMC', 'PUBMED']);
    assert.deepEqual(result.sources.map((s) => s.sourceId), ['europe-pmc:MED:40123456', 'pubmed:40999999']);
    assert.ok(result.sources.every((s) => s.provenanceClass === PROVENANCE_CLASS.SOURCE_FACT));
  });

  it('one connector blocked does not hide the other, and nothing substitutes for it', async () => {
    const epmc = { resultList: { result: [{ id: '1', source: 'MED', title: 'Only Europe PMC' }] } };
    const fetchImpl = async (url) => {
      const u = new URL(url.toString());
      if (u.origin === 'https://www.ebi.ac.uk') return response(200, epmc);
      throw new Error('NCBI denied');
    };
    const result = await searchLiterature({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl });
    assert.equal(result.status, 'METADATA_ONLY');
    assert.equal(result.sources.length, 1);
    assert.equal(result.connectors[1].status, 'BLOCKED_BY_NETWORK');
  });
});

describe('provenance classes', () => {
  it('has exactly the five classes', () => {
    assert.deepEqual(Object.values(PROVENANCE_CLASS), ['SOURCE_FACT', 'MODEL_PROPOSAL', 'GENESIS_COMPUTATION', 'REAL_MEASUREMENT', 'UNKNOWN']);
    assert.equal(isProvenanceClass('FACT'), false);
  });

  it('Europe PMC sources are SOURCE_FACT', async () => {
    const result = await queryEuropePmc({ text: 'GLP-1R' }, { now: () => NOW, fetchImpl: async () => response(200, { resultList: { result: [{ id: '1', source: 'MED', title: 'T' }] } }) });
    assert.equal(result.sources[0].provenanceClass, 'SOURCE_FACT');
  });

  it('an unread relationship is UNKNOWN; a proposed one is MODEL_PROPOSAL and never evidence', () => {
    const unknown = unknownClaimEvidenceLink('c1', 'pubmed:1');
    assert.equal(unknown.provenanceClass, 'UNKNOWN');
    const proposed = proposeClaimEvidenceLink({ claimId: 'c1', sourceId: 'pubmed:1', relationship: 'SUPPORTS', extractionMethod: 'LLM' }, new Set(['pubmed:1']));
    assert.equal(proposed.provenanceClass, 'MODEL_PROPOSAL');
    assert.equal(proposed.epistemicStatus, 'NOT_EVIDENCE');
    assert.equal(proposed.status, 'PROPOSED');
  });

  it('only an executed engine with an output hash is GENESIS_COMPUTATION; a run never reports a real measurement', () => {
    assert.equal(executionProvenanceClass({ status: 'EXECUTED', outputHash: 'a'.repeat(64) }), 'GENESIS_COMPUTATION');
    assert.equal(executionProvenanceClass({ status: 'INPUT_REJECTED', outputHash: null }), 'UNKNOWN');
    assert.equal(executionProvenanceClass(null), 'UNKNOWN');
    const p = researchRunProvenance({
      plan: { hypotheses: [] },
      literatureSnapshots: [{ sourceCount: 2 }],
      experiments: [{ experimentId: 'e1', execution: { status: 'EXECUTED', outputHash: 'b'.repeat(64) } }, { experimentId: 'e2', execution: null }],
    });
    assert.deepEqual(p, {
      plan: 'MODEL_PROPOSAL',
      literatureSources: 'SOURCE_FACT',
      claimSourceLinks: 'PER_LINK',
      hypothesisCitations: [],
      datasets: [],
      experimentExecutions: [{ experimentId: 'e1', provenanceClass: 'GENESIS_COMPUTATION', datasetId: null }, { experimentId: 'e2', provenanceClass: 'UNKNOWN', datasetId: null }],
      realMeasurements: [],
    });
    assert.deepEqual(researchRunProvenance({ plan: null }), { plan: null, literatureSources: null, claimSourceLinks: null, hypothesisCitations: [], datasets: [], experimentExecutions: [], realMeasurements: [] });
  });
});
