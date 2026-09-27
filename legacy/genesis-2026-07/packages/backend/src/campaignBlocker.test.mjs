/**
 * Campaign blocker dossier tests (Grand-Challenge Mandate Phase 12, outcome C).
 * Proves the honest fail-closed path: with mandatory real sources blocked, the campaign emits
 * CAMPAIGN_BLOCKED — never a fabricated or fixture candidate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockerDossier, CAMPAIGN_OUTCOME } from './campaign/campaignBlocker.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.resolve(__dirname, '../../../campaigns/real-scientific-campaign-001/ACQUISITION_ATTEMPT_LOG.json');

describe('campaign blocker dossier', () => {
  test('all mandatory sources blocked → CAMPAIGN_BLOCKED, no fabrication', () => {
    const acquisitionResults = [
      { sourceService: 'CHEMBL', failureClass: 'CONNECT_TUNNEL_REJECTED_403', diagnosis: 'egress policy' },
      { sourceService: 'PUBCHEM', failureClass: 'CONNECT_TUNNEL_REJECTED_403' },
      { sourceService: 'UNIPROT', failureClass: 'CONNECT_TUNNEL_REJECTED_403' },
    ];
    const engineMatrix = { RDKit: { status: 'AVAILABLE' }, Docking: { status: 'BLOCKED_BY_RUNTIME', reason: 'no receptor' } };
    const d = buildBlockerDossier({ campaignId: 'c1', acquisitionResults, engineMatrix, mandatorySources: ['CHEMBL', 'PUBCHEM', 'UNIPROT'], operatorResume: 'node scripts/build-real-campaign-001-bundle.mjs' });
    assert.equal(d.outcome, CAMPAIGN_OUTCOME.CAMPAIGN_BLOCKED);
    assert.equal(d.honesty.fabricatedPayloads, 0);
    assert.equal(d.honesty.fixtureSubstitution, false);
    assert.deepEqual(d.missingMandatorySources.sort(), ['CHEMBL', 'PUBCHEM', 'UNIPROT']);
    assert.equal(d.evidenceBlockers.length, 3);
    assert.ok(d.capabilityBlockers.some((c) => c.engine === 'Docking'));
    assert.equal(d.didGenesisFindADrug, 'NO');
    assert.match(d.dossierHash, /^[0-9a-f]{64}$/);
  });

  test('mandatory sources present → not CAMPAIGN_BLOCKED (INSUFFICIENT_EVIDENCE if no candidate)', () => {
    const d = buildBlockerDossier({ campaignId: 'c2', acquisitionResults: [{ sourceService: 'CHEMBL', failureClass: 'OK' }, { sourceService: 'PUBCHEM', failureClass: 'OK' }, { sourceService: 'UNIPROT', failureClass: 'OK' }], engineMatrix: {}, mandatorySources: ['CHEMBL', 'PUBCHEM', 'UNIPROT'] });
    assert.equal(d.outcome, CAMPAIGN_OUTCOME.INSUFFICIENT_EVIDENCE);
    assert.equal(d.missingMandatorySources.length, 0);
  });

  test('the recorded real acquisition attempt log reflects a genuine blocked attempt', () => {
    const log = JSON.parse(readFileSync(LOG, 'utf8'));
    assert.equal(log.results.length, 5);
    assert.ok(log.results.every((r) => r.failureClass === 'CONNECT_TUNNEL_REJECTED_403'));
    assert.equal(log.builderBehavior.payloadsFabricated, 0);
    assert.equal(log.builderBehavior.manifestWritten, false);
  });
});
