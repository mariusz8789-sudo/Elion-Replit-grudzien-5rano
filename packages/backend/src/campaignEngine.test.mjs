import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect } from './compute/rdkitAdapter.mjs';
import { generateProposals, availableTransformations, canonicalize } from './campaign/drugAdapter.mjs';
import { createCampaign, listCandidates, listDecisions, listEvents, getCampaign } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';

/**
 * Silnik kampanii na REALNYM RDKit. Pomijany, gdy RDKit niedostępny (wtedy
 * zdolność jest BLOCKED_BY_RUNTIME i to jest uczciwy stan, nie porażka).
 */
const RDKIT = detect().available;
const maybe = RDKIT ? test : test.skip;

describe('drug campaign adapter (real RDKit)', () => {
  maybe('a weight-0 transformation is NOT executed (strategy changes execution)', () => {
    // benzen: dozwolona tylko add-methyl; add-fluoro wyłączona (waga 0).
    const { proposals, attempts } = generateProposals(['c1ccccc1'], { 'add-methyl': 1, 'add-fluoro': 0 });
    assert.ok(proposals.length >= 1);
    assert.ok(proposals.every((p) => p.transformation === 'add-methyl'), 'tylko add-methyl powinna się wykonać');
    assert.equal(attempts['add-fluoro'], undefined); // wyłączona = brak prób
    // realna chemia: benzen + metyl → toluen
    assert.ok(proposals.some((p) => p.canonicalSmiles === 'Cc1ccccc1'));
  });

  maybe('canonicalize rejects malformed SMILES, accepts valid', () => {
    assert.equal(canonicalize('c1ccccc1').ok, true);
    assert.equal(canonicalize('not-a-molecule((').ok, false);
  });

  maybe('a minimal real campaign persists candidates, decisions, events and moves the Pareto front', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'c@lab.org', displayName: 'C', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'Camp', ownerId: u.id });
    const tx = availableTransformations();
    const c = createCampaign(db, {
      projectId: p.id, objective: 'MPO benchmark (software validation)', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 2, maxGeneratedCandidates: 10 },
      stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: Object.fromEntries(tx.map((t) => [t, 1])), parentSelection: 'pareto' },
      createdBy: u.id,
    });
    const s = runCampaign(db, c.id);

    // Real execution happened and was persisted.
    const cands = listCandidates(db, c.id);
    assert.ok(cands.length >= 2, 'kandydaci utrwaleni');
    assert.ok(cands.some((x) => x.status === 'retained' && x.descriptors.molWt > 0), 'realne deskryptory RDKit');
    assert.ok(cands.every((x) => x.canonicalSmiles && x.runIds !== undefined));
    // Lineage: generation-1 candidates have a parent + transformation.
    const gen1 = cands.filter((x) => x.generation === 1 && x.status === 'retained');
    assert.ok(gen1.length >= 1 && gen1.every((x) => x.transformation && x.parentSmiles), 'rodowód zachowany');

    // Decisions and events are append-only and present.
    assert.ok(listDecisions(db, c.id).length >= 1, 'decyzje strategiczne utrwalone');
    const events = listEvents(db, c.id);
    assert.ok(events.some((e) => e.type === 'OBJECTIVE_RECEIVED'));
    assert.ok(events.some((e) => e.type === 'GENERATION_COMPLETED'));
    assert.ok(events.some((e) => e.type === 'STOPPING_CONDITION_REACHED'));

    // Pareto front moved (hypervolume non-decreasing, ended > 0).
    assert.ok(s.hypervolumeEnd >= s.hypervolumeStart, 'hiperobjętość nie maleje');
    assert.ok(s.paretoCount >= 1);
    assert.ok(['STOP_RESOURCE_LIMIT', 'STOP_NO_IMPROVEMENT', 'STOP_OBJECTIVE_REACHED'].includes(s.stopReason));

    // Campaign persisted as completed with a final result set.
    const final = getCampaign(db, c.id);
    assert.equal(final.status, 'completed');
    assert.ok(final.final && final.final.paretoFront.length >= 1);
  });
});
