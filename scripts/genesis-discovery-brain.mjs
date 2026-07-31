/**
 * GENESIS LIVE DISCOVERY BRAIN — Grand Challenge V2 (Live Discovery Brain Mandate, Phases 12–16).
 *
 * Executes ONE bounded biomedical Grand Challenge through the FULL product path:
 *   problem → live-source probe → evidence → claim registry → reasoning (capability-blocked)
 *   → target funnel + Truth-Engine gate → real RDKit chemistry loop → Dossier V2.
 *
 * BRUTAL HONESTY FOR THIS ENVIRONMENT:
 *  - Live literature/structure/compound sources (Europe PMC / RCSB / PubChem) are policy-blocked
 *    here; the probe records SOURCE_UNAVAILABLE. NO literature is fabricated.
 *  - There is NO configured live reasoning model → every reasoning capability is CAPABILITY_BLOCKED.
 *  - The evidence below is OPERATOR-SUPPLIED input carrying real-form public identifiers, used
 *    ONLY to exercise the evidence→claim→target gate. It is NOT verified against live sources in
 *    this run and is NOT presented as Genesis-established fact.
 *  - Chemistry is REAL (RDKit). Output is COMPUTATIONAL candidates only — not drugs, not validated.
 * This is a COMPUTATIONAL DISCOVERY ARCHITECTURE TRIAL, not a clinical or experimental claim.
 */
import { openDatabase } from '../packages/backend/src/store.mjs';
import * as store from '../packages/backend/src/store.mjs';
import * as ev from '../packages/backend/src/cognitive/evidenceIntelligence.mjs';
import * as v2 from '../packages/backend/src/cognitive/discoveryControllerV2.mjs';

const log = (...a) => console.log(...a);
const hr = () => log('─'.repeat(74));

/* -------- Grand Challenge selection (bounded, honest) -------- */
const CRITERIA = ['UNMET_NEED', 'EVIDENCE_ACCESSIBILITY', 'TARGET_LANDSCAPE', 'STRUCTURE_AVAIL', 'CHEM_MATTER', 'ENGINE_TRACTABILITY', 'ETHICS_SCOPE', 'FALSIFIABILITY'];
const CHALLENGES = [
  { id: 'braf-melanoma-analogues', name: 'Computational analogue triage around a validated oncology scaffold (BRAF/MAPK context)', scores: [5, 2, 4, 3, 4, 5, 4, 4] },
  { id: 'amr-efflux', name: 'Antimicrobial-resistance efflux-pump inhibitor discovery', scores: [5, 2, 3, 2, 3, 3, 4, 3] },
  { id: 'neglected-chagas', name: 'Neglected tropical disease (Chagas) scaffold discovery', scores: [5, 2, 3, 2, 3, 3, 4, 3] },
];
const tot = (c) => c.scores.reduce((a, b) => a + b, 0);
log('=== GRAND CHALLENGE SELECTION MATRIX (V2) ===');
log(['challenge'.padEnd(46), ...CRITERIA.map((c) => c.slice(0, 4)), 'TOT'].join(' '));
for (const c of CHALLENGES) log([c.id.padEnd(46), ...c.scores.map((s) => String(s).padStart(4)), String(tot(c)).padStart(4)].join(' '));
const selected = CHALLENGES.slice().sort((a, b) => tot(b) - tot(a))[0];
hr();
log(`SELECTED: ${selected.id} (score ${tot(selected)})`);
log('RATIONALE: best engine-tractability + chemical-matter + ethics scope for a bounded');
log('computational trial with the CURRENT installed engines. NOTE: EVIDENCE_ACCESSIBILITY is');
log('low for ALL candidates because live sources are policy-blocked here — so the evidence stage');
log('runs on OPERATOR-SUPPLIED inputs and is explicitly a replayable architecture validation.');
hr();

/* -------- Operator-supplied evidence (real-form identifiers; NOT live-verified here) -------- */
const problem = { title: 'Computational analogue triage around a validated oncology scaffold', scope: 'small-molecule, computational-only; no therapeutic/clinical claim', maxMolWt: 340, maxAlerts: 0 };
const userEvidence = [
  { sourceType: 'PUBMED', pmid: '20818844', direction: 'supporting', title: 'BRAF(V600E) inhibition context (operator-supplied identifier; not live-verified in this run)', claimText: 'BRAF V600E is an oncogenic driver in melanoma' },
  { sourceType: 'RCSB_PDB', pdbId: '3OG7', direction: 'supporting', title: 'BRAF kinase domain structure exists (operator-supplied identifier; not live-verified)', claimText: 'A crystal structure of the BRAF kinase domain is publicly catalogued' },
];
const eids = ev.ingestUserEvidence(userEvidence).map((x) => x.evidenceId);
const claims = [
  { text: 'BRAF V600E is an oncogenic driver in melanoma', supportingEvidenceIds: [eids[0]], claimType: 'MECHANISM' },
  { text: 'BRAF kinase domain structure is publicly catalogued', supportingEvidenceIds: [eids[1]], claimType: 'STRUCTURE' },
];
// Link both claims to the target (claim ids are deterministic from content).
const reg = ev.buildClaimRegistry(claims, ev.ingestUserEvidence(userEvidence)).registry;
const targets = [{
  targetName: 'BRAF (V600E)', targetType: 'kinase', mechanismRationale: 'oncogenic MAPK pathway activation',
  claimIds: reg.map((c) => c.claimId), structureAvailable: true, knownChemicalMatter: true,
  noveltyOpportunity: 0.4, cheapestFalsification: 'genetic knockdown / structural binding assay',
}];

// Real chemistry engines (default = real RDKit) around non-sensitive textbook scaffolds.
const seeds = [
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1' },
];

const db = openDatabase(':memory:');
log('RUNNING V2 campaign (live probe → evidence → claim → target gate → real RDKit chemistry)…');
const result = await v2.runCampaignV2(db, { projectId: 'grand-challenge-v2', problem, userEvidence, claims, targets, seeds, maxGenerations: 3, maxCandidatesPerGen: 14 });

const events = store.listDiscoveryEvents(db, result.campaignId);
const first = (t) => events.find((e) => e.type === t)?.payload ?? {};
hr(); log('=== BRAIN PATH ARTIFACTS ===');
const probe = first('SOURCE_PROBE').sources ?? {};
log('1. live-source probe:', Object.entries(probe).map(([k, v]) => `${k}=${v.status}`).join(', '));
log('2. evidence ingested:', (first('EVIDENCE').count ?? 0), 'USER_SUPPLIED record(s)');
const cr = first('CLAIM_REGISTRY');
log('3. claim registry:', (cr.registry ?? []).map((c) => `${c.status}`).join(', '), '| rejected:', (cr.rejected ?? []).length);
const reason = events.filter((e) => e.type === 'REASONING_STEP').map((e) => `${e.payload.capability}=${e.payload.status}`);
log('4. reasoning brain:', reason.join(', '));
const tf = first('TARGET_FUNNEL').funnel ?? {};
log('5. target funnel: primary', tf.primaryTarget?.targetName, 'score', tf.primaryTarget?.totalPriorityScore, '→ gate', tf.primaryGate?.gate, `(${tf.primaryGate?.reason})`);
hr();

/* -------- WOW proof from the child chemistry campaign -------- */
const chem = result.chemistry;
if (chem) {
  const ce = store.listDiscoveryEvents(db, chem.campaignId);
  const cfirst = (t) => ce.find((e) => e.type === t)?.payload ?? {};
  const cohorts = ce.filter((e) => e.type === 'COHORT');
  const mut = cfirst('PLAN_MUTATION');
  log('=== WOW PROOF (real chemistry adaptation) ===');
  log('BEFORE plan hash:', (cfirst('CAMPAIGN_INIT').planHash ?? '').slice(0, 20), '…');
  const g0 = cohorts.find((c) => c.generation === 0)?.payload;
  const g1 = cohorts.find((c) => c.generation === 1)?.payload;
  log('OBSERVATION gen0:', g0?.candidates.length, 'candidates; failures recorded in Necropolis:', (cfirst('NECROPOLIS').recorded ?? []).length);
  log('MUTATION:', mut.mutationType, '→ new plan hash', (mut.newPlanHash ?? '').slice(0, 20), '… (changed:', mut.previousPlanHash !== mut.newPlanHash, ')');
  if (g1) {
    const via0 = [...new Set(g0.candidates.map((c) => c.via))].sort();
    const via1 = [...new Set(g1.candidates.map((c) => c.via))].sort();
    log('AFTER gen1 transforms:', via1.join(','), '| dead-ends avoided:', g1.skipped.filter((s) => /necropolis/.test(s.reason)).length);
    const wow = mut.previousPlanHash !== mut.newPlanHash && JSON.stringify(via0) !== JSON.stringify(via1);
    log('WOW PROOF:', wow ? 'PASS' : 'FAIL', '— chemistry campaign adapted from observed real results.');
  }
}
hr();
const d = v2.buildDossierV2(db, result.campaignId);
log('=== DISCOVERY DOSSIER V2 ===');
log('status:', d.finalStatus, '| dossier hash:', d.dossierHash.slice(0, 16), '…');
log('evidence origin:', d.evidenceOrigin);
log('reasoning:', d.reasoningStatus);
log('chemistry engines executed:', d.chemistry?.enginesExecuted.join(', '));
log('capability gaps:');
for (const g of d.capabilityGaps) log('  -', g);
log('classification:', d.classification);
log('\nDID GENESIS FIND A DRUG?  NO. Strongest honest output: COMPUTATIONAL CANDIDATE / HYPOTHESIS.');
log(d.limitationStatement);
db.close();
