/**
 * REAL SCIENTIFIC CAMPAIGN #001 — executes the campaign with REAL engines (RDKit + ADMET-AI)
 * on the SHA-256-verified TEST_FIXTURE bundle. Proves which engines actually ran. Live external
 * sources are policy-blocked, so evidence origin is TEST_FIXTURE — this is an ARCHITECTURE
 * execution, NOT a real-literature discovery. Docking/MD/QM are BLOCKED_BY_RUNTIME (not faked).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cr from '../packages/backend/src/campaign/campaignRunner001.mjs';
import * as ei from '../packages/backend/src/cognitive/evidenceIntelligence.mjs';
import { ingestBundle } from '../packages/backend/src/corpus/corpusIngest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../packages/backend/test-fixtures/genesis-scientific-evidence-bundle-v1');
const log = (...a) => console.log(...a);
const hr = () => log('─'.repeat(72));

// --bundle <dir> runs on a REAL VERIFIED_BUNDLE; default is the SYNTHETIC TEST_FIXTURE bundle.
const bi = process.argv.indexOf('--bundle');
const BUNDLE = bi >= 0 ? process.argv[bi + 1] : FIXTURE;
const isFixture = BUNDLE === FIXTURE;

log('=== REAL SCIENTIFIC CAMPAIGN #001 (real RDKit + ADMET-AI engines) ===');
log(isFixture
  ? 'Evidence origin: TEST_FIXTURE (no --bundle given; live external sources policy-blocked). NOT a discovery.'
  : `Evidence bundle: ${BUNDLE} (VERIFIED_BUNDLE if genuinely acquired). Origin flows from the bundle.`);
hr();

// Build an evidence-backed target from the bundle's bioactivity record.
const ing = ingestBundle(BUNDLE, { campaignId: 'real-scientific-campaign-001' });
const bioRec = ing.evidenceRecords.find((e) => e.entityType === 'BioactivityRecord');
if (!bioRec) { log('FAIL CLOSED: bundle has no bioactivity evidence — cannot form an evidence-backed BRAF target.'); process.exit(2); }
const claims = [{ text: isFixture ? 'fixture target shows fixture-assay activity' : 'BRAF has reported small-molecule bioactivity in the acquired evidence', supportingEvidenceIds: [bioRec.evidenceId], claimType: 'BIOACTIVITY' }];
const { registry } = ei.buildClaimRegistry(claims, ing.evidenceRecords);
const target = { targetName: isFixture ? '[TEST FIXTURE] synthetic target' : 'BRAF (from acquired evidence)', claimIds: [registry[0].claimId], structureAvailable: ing.entities.some((e) => e.entity.entityType === 'ProteinStructure'), mechanismRationale: isFixture ? 'fixture' : 'oncogenic MAPK activation (claim requires the acquired literature evidence)', cheapestFalsification: 'assay', knownChemicalMatter: true };

log('Running with REAL engines (this executes real ADMET-AI on candidates — a few seconds)…');
const result = cr.runCampaign001(null, {
  bundleRoot: BUNDLE, targetHypotheses: [target], supplementalClaims: claims,
  // For a real bundle, seeds are the ACQUIRED compounds (runner derives them); no hardcoded aspirin.
  seedCompounds: isFixture ? [{ name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' }] : [],
});

log('Engine status matrix (runtime-detected):');
for (const [k, v] of Object.entries(result.engineMatrix)) log(`  ${k.padEnd(10)} ${v.status}${v.version ? ' ' + v.version : ''}${v.reason ? ' — ' + v.reason : ''}`);
hr();
log('Campaign status:', result.status);
log('Target gate:', result.targetFunnel.primaryGate.gate);
const c0 = result.candidates?.[0];
if (c0) {
  log('Proof of real engine execution on candidate', c0.candidateId, ':');
  log('  RDKit:', JSON.stringify(c0.engineOutputs.rdkit.descriptors), 'alerts', c0.engineOutputs.rdkit.structuralAlerts, '(epistemic', c0.engineOutputs.rdkit.epistemicStatus + ')');
  const admet = c0.engineOutputs.admet;
  log('  ADMET-AI:', admet.status ? admet.status : `ok=${admet.ok} (MODEL_INFERRED)`, admet.predictions ? 'e.g. ' + JSON.stringify(Object.fromEntries(Object.entries(admet.predictions).slice(0, 2))) : '');
  log('  Docking:', c0.engineOutputs.docking.status, '—', c0.engineOutputs.docking.note);
}
hr();
log('Conflict registry (MCRE):', result.conflicts.length, 'conflict(s)');
for (const cf of result.conflicts) log(`  ${cf.conflictType}: ${cf.resolutionResult} — ${cf.detail ?? ''}`);
log('Final deterministic ranking (' + cr.RANKING_POLICY_VERSION + '):');
for (const r of result.ranking) log(`  #${r.rank} ${r.candidateId} score ${r.finalScore} (evidence ${r.evidenceContribution}, chem ${r.chemistryContribution}, admet ${r.admetContribution}, structural ${r.structuralContribution})`);
log('Truth Engine final gate:', result.truthGate.decision, `(${result.truthGate.rejections.length} rejection(s))`);
hr();

const dossier = cr.buildCampaign001Dossier(result, { scientificQuestion: 'Deterministic computational triage of analogues around a fixture compound', selectionRationale: 'Only campaign executable with installed engines + no external access; bounded, reproducible.' });
log('DOSSIER hash:', dossier.dossierHash.slice(0, 16), '…');
log('DID GENESIS DISCOVER A DRUG?', dossier.didGenesisDiscoverADrug);
log(dossier.didGenesisDiscoverADrugExplanation);
