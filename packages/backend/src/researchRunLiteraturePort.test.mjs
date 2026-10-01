import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contradictionLiteratureQuery, createResearchRunLiteraturePort } from './literature/researchRunLiteraturePort.mjs';

const source = (id) => ({ sourceId: id, title: id, metadataHash: 'a'.repeat(64), licence: null, licenceStatus: 'UNKNOWN' });

describe('literature -> ResearchRun port', () => {
  it('returns source-bound UNKNOWN links without pretending retrieval proves a claim', async () => {
    const port = createResearchRunLiteraturePort({
      search: async () => ({ status: 'METADATA_ONLY', sources: [source('epmc:1')], connectors: [{ connectorId: 'EUROPE_PMC', status: 'METADATA_ONLY' }] }),
    });
    const result = await port.findForClaim({ researchRunId: 'rr-1', claimId: 'claim-1', claim: 'GLP-1R activation changes glucose response.' });
    assert.equal(result.status, 'METADATA_ONLY');
    assert.equal(result.links[0].relationship, 'UNKNOWN');
    assert.equal(result.links[0].humanReviewed, false);
    assert.equal(result.links[0].epistemicStatus, 'NOT_EVIDENCE');
    assert.deepEqual(result.support, []);
    assert.deepEqual(result.contradictions, []);
  });

  it('keeps extracted support and contradiction as proposals, never Evidence', async () => {
    const port = createResearchRunLiteraturePort({
      search: async () => ({ status: 'METADATA_ONLY', sources: [source('epmc:1'), source('epmc:2')], connectors: [] }),
      linker: async () => [
        { sourceId: 'epmc:1', relationship: 'SUPPORTS', extractedStatement: 'support', locationInSource: 'abstract', extractionMethod: 'LLM', extractionConfidence: 0.8, humanReviewed: true },
        { sourceId: 'epmc:2', relationship: 'CONTRADICTS', extractedStatement: 'contradiction', locationInSource: 'results', extractionMethod: 'RULE', extractionConfidence: 0.7 },
      ],
    });
    const result = await port.findForClaim({ researchRunId: 'rr-1', claimId: 'claim-1', claim: 'claim' });
    assert.equal(result.support.length, 1);
    assert.equal(result.contradictions.length, 1);
    assert.ok(result.links.every((link) => link.status === 'PROPOSED' && link.humanReviewed === false && link.epistemicStatus === 'NOT_EVIDENCE'));
  });

  it('drops a hallucinated source identity from a linker', async () => {
    const port = createResearchRunLiteraturePort({
      search: async () => ({ status: 'METADATA_ONLY', sources: [source('epmc:1')], connectors: [] }),
      linker: async () => [{ sourceId: 'invented:404', relationship: 'SUPPORTS', extractedStatement: 'fiction' }],
    });
    const result = await port.findForClaim({ researchRunId: 'rr-1', claimId: 'claim-1', claim: 'claim' });
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].sourceId, 'epmc:1');
    assert.equal(result.links[0].relationship, 'UNKNOWN');
  });

  it('surfaces a linker failure explicitly while retaining retrieved sources as UNKNOWN', async () => {
    const port = createResearchRunLiteraturePort({
      search: async () => ({ status: 'METADATA_ONLY', sources: [source('epmc:1')], connectors: [] }),
      linker: async () => { throw new Error('provider unavailable'); },
    });
    const result = await port.findForClaim({ researchRunId: 'rr-1', claimId: 'claim-1', claim: 'claim' });
    assert.equal(result.status, 'METADATA_ONLY');
    assert.equal(result.sources.length, 1);
    assert.equal(result.links[0].relationship, 'UNKNOWN');
    assert.deepEqual(result.accessBlockers, [{
      sourceProvider: 'CLAIM_EVIDENCE_LINKER',
      status: 'NO_ACCESS',
      failureCode: 'CLAIM_EVIDENCE_LINKER_FAILURE',
      message: 'Claim-to-source extraction failed; retrieved sources remain available with UNKNOWN relationships.',
    }]);
  });

  it('surfaces access blockers and never creates substitute sources', async () => {
    const port = createResearchRunLiteraturePort({
      search: async () => ({ status: 'BLOCKED_BY_NETWORK', sources: [], connectors: [{ connectorId: 'EUROPE_PMC', status: 'BLOCKED_BY_NETWORK', failureCode: 'RATE_LIMITED' }] }),
    });
    const result = await port.findForClaim({ researchRunId: 'rr-1', claimId: 'claim-1', claim: 'claim' });
    assert.equal(result.status, 'BLOCKED_BY_NETWORK');
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.links, []);
    assert.equal(result.accessBlockers[0].failureCode, 'RATE_LIMITED');
  });

  it('fails closed before retrieval when ResearchRun identity is incomplete', async () => {
    let called = false;
    const port = createResearchRunLiteraturePort({ search: async () => { called = true; return {}; } });
    const result = await port.findForClaim({ claimId: 'claim-1', claim: 'claim' });
    assert.equal(result.status, 'NO_ACCESS');
    assert.equal(called, false);
  });

  it('runs a separate contradiction-candidate query without classifying search matches as contradictions', async () => {
    const queries = [];
    const port = createResearchRunLiteraturePort({
      search: async (query) => {
        queries.push(query);
        return { status: 'METADATA_ONLY', sources: [source('epmc:negative')], connectors: [] };
      },
    });
    const result = await port.findContradictionsForClaim({ researchRunId: 'rr-1', claimId: 'claim-1', claim: 'GLP-1R agonism improves glucose response' });
    assert.equal(result.intent, 'CONTRADICTION_SEARCH');
    assert.equal(result.query, contradictionLiteratureQuery('GLP-1R agonism improves glucose response'));
    assert.match(queries[0].text, /negative result/);
    assert.equal(result.sources.length, 1);
    assert.equal(result.links[0].relationship, 'UNKNOWN');
    assert.deepEqual(result.contradictions, []);
    assert.ok(result.missingEvidence.some((message) => message.includes('candidates only')));
  });
});
