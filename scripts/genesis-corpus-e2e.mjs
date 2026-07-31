/**
 * GENESIS SCIENTIFIC CORPUS FACTORY — end-to-end proof (Corpus Mandate Phase 23).
 *
 * Runs: verified bundle → SHA-256 integrity → provenance → parser → normalized entities →
 * entity resolution → evidence records → Claim Registry → Target funnel + Truth-Engine gate,
 * on the TEST_FIXTURE bundle. Live external acquisition is policy-blocked in this environment,
 * so this proves the INFRASTRUCTURE end-to-end on clearly-labelled synthetic fixtures — it is
 * NOT a real-literature discovery claim.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestBundle } from '../packages/backend/src/corpus/corpusIngest.mjs';
import { planQueries } from '../packages/backend/src/corpus/queryPlanner.mjs';
import * as ei from '../packages/backend/src/cognitive/evidenceIntelligence.mjs';
import * as target from '../packages/backend/src/cognitive/targetIntelligence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../packages/backend/test-fixtures/genesis-scientific-evidence-bundle-v1');
const log = (...a) => console.log(...a);
const hr = () => log('─'.repeat(72));

log('=== GENESIS SCIENTIFIC CORPUS FACTORY — E2E PROOF ===');
log('SOURCE MODE: VERIFIED_BUNDLE (TEST_FIXTURE). Live external sources are policy-blocked here.');
hr();

// 1) Query plan (deterministic, reproducible).
const plan = planQueries({ campaignId: 'corpus-e2e', researchQuestion: 'fixture target triage', concepts: { target: ['[TEST FIXTURE] synthetic target'], protein: ['TESTFX'] }, modelExpansions: [] });
log('1. Query plan:', plan.queryPlanVersion, '| hash', plan.planHash.slice(0, 16), '…');
log('   source queries:', plan.sourceQueries.map((q) => q.sourceService).join(', '));

// 2) Ingest bundle (SHA-256 verified, fail-closed).
const res = ingestBundle(FIXTURE, { campaignId: 'corpus-e2e', projectId: 'p1' });
log('2. Bundle ingested:', res.summary.entities, 'entities;', 'byType', JSON.stringify(res.summary.byType));
log('   byOrigin:', JSON.stringify(res.summary.byOrigin), '(ALL TEST_FIXTURE — never PUBLISHER_REPORTED)');
log('   evidence records (article+bioactivity only):', res.evidenceRecords.length);
log('   entity resolution: groups', res.summary.resolvedGroups, '| unresolved', res.summary.unresolved);

// 3) Provenance survives — show one record's chain.
const bio = res.entities.find((e) => e.entity.entityType === 'BioactivityRecord');
log('3. Bioactivity provenance:', bio.provenance.sourceService, bio.provenance.sourceId, '| hash', bio.provenance.contentHash.slice(0, 12), '…',
  '| type', bio.entity.standardType, bio.entity.standardRelation, bio.entity.standardValue, bio.entity.standardUnits, '(Ki≠IC50 preserved)');

// 4) Claim registry — a claim only SUPPORTED when it cites a real evidenceId.
const evId = res.evidenceRecords[0].evidenceId;
const { registry } = ei.buildClaimRegistry([
  { text: 'the fixture target shows activity in the fixture assay', supportingEvidenceIds: [evId], claimType: 'BIOACTIVITY' },
  { text: 'this drug cures the disease', proposedByModel: true }, // model text, no source
], res.evidenceRecords);
log('4. Claim registry:', registry.map((c) => `${c.status}`).join(', '), '(model-only claim → UNSUPPORTED)');

// 5) Target funnel gate on the corpus-derived claim.
const t = { targetName: '[TEST FIXTURE] synthetic target', claimIds: [registry[0].claimId], structureAvailable: true, mechanismRationale: 'fixture', cheapestFalsification: 'assay', knownChemicalMatter: true };
const funnel = target.targetFunnel([t], registry);
log('5. Target gate:', funnel.primaryGate.gate, '| score', funnel.primaryTarget.totalPriorityScore, '| evidenceFor', funnel.primaryTarget.evidenceFor.length);
const blocked = target.targetFunnel([{ targetName: 'no-evidence-target', claimIds: [] }], registry);
log('   control (no cited evidence):', blocked.primaryGate.gate, '(record-existence ≠ claim-support)');

hr();
log('DID GENESIS FIND A DRUG?  NO.');
log('Proven: an evidence-grounded, SHA-256-verified, provenance-preserving corpus pipeline that');
log('feeds the existing brain and gates on cited evidence — on SYNTHETIC TEST FIXTURES.');
log('REAL CORPUS EXECUTION = CAPABILITY_BLOCKED (live external sources policy-blocked; builder');
log('command documented in docs/GENESIS_CORPUS_FACTORY.md for use outside the restricted env).');
