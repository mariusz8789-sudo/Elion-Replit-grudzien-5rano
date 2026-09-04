import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect } from './compute/rdkitAdapter.mjs';
import { availableTransformations } from './campaign/drugAdapter.mjs';
import { createCampaign, listCandidates } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { whyCandidate, whyStatus, whyPareto, whyStop, whichEngine } from './campaign/why.mjs';
import { buildDiscoveryGraph } from './campaign/discoveryGraph.mjs';
import { listToolchain, getTool, TOOL_STATUS } from './campaign/toolchain.mjs';

/**
 * WHY Engine (P10) + Discovery Graph (P11) + Toolchain Registry (P6).
 * Wszystkie odpowiedzi muszą pochodzić z UTRWALONYCH danych realnej kampanii —
 * zero fikcyjnego wstecznego uzasadnienia, zero zmyślonych węzłów grafu.
 */
const RDKIT = detect().available;
const maybe = RDKIT ? test : test.skip;

describe('Toolchain Registry (real RDKit validation)', () => {
  test('lists tools with runtime-determined status', () => {
    const tools = listToolchain();
    assert.ok(tools.length >= 1);
    const rdkit = getTool('rdkit');
    assert.ok(rdkit);
    assert.equal(rdkit.license, 'BSD-3-Clause');
  });

  maybe('RDKit is AVAILABLE only after passing real reference cases', () => {
    const rdkit = getTool('rdkit');
    assert.equal(rdkit.status, TOOL_STATUS.AVAILABLE);
    assert.ok(rdkit.validation && rdkit.validation.length === 2);
    // Dowód: realne przypadki referencyjne przeszły (aspiryna logP, metylowanie benzenu).
    assert.ok(rdkit.validation.every((r) => r.pass === true), 'wszystkie przypadki referencyjne muszą przejść');
    assert.ok(rdkit.version, 'wersja RDKit z detekcji runtime');
  });
});

describe('WHY Engine + Discovery Graph (real campaign)', () => {
  maybe('answers are backed by persisted campaign evidence', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'why@lab.org', displayName: 'W', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'Why', ownerId: u.id });
    const tx = availableTransformations();
    const c = createCampaign(db, {
      projectId: p.id, objective: 'MPO benchmark (software validation)', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 2, maxGeneratedCandidates: 12 },
      stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: Object.fromEntries(tx.map((t) => [t, 1])), parentSelection: 'pareto' },
      createdBy: u.id,
    });
    runCampaign(db, c.id);

    const cands = listCandidates(db, c.id);
    const seed = cands.find((x) => x.generation === 0);
    const child = cands.find((x) => x.generation === 1 && x.status === 'retained' && x.transformation);
    assert.ok(seed && child, 'mamy seed i potomka z rodowodem');

    // WHY: kandydat startowy vs wygenerowany.
    const wSeed = whyCandidate(db, seed.id);
    assert.equal(wSeed.ok, true);
    assert.ok(wSeed.answer.includes('startowa'));
    const wChild = whyCandidate(db, child.id);
    assert.equal(wChild.ok, true);
    assert.equal(wChild.evidence.transformation, child.transformation);
    assert.equal(wChild.evidence.parentSmiles, child.parentSmiles);

    // WHY: status oparty na realnych ograniczeniach.
    const wStatus = whyStatus(db, child.id);
    assert.equal(wStatus.ok, true);
    assert.ok(wStatus.answer.includes('Zachowany'));

    // WHY: Pareto oparte na utrwalonej fladze.
    const wPareto = whyPareto(db, child.id);
    assert.equal(wPareto.ok, true);
    assert.equal(wPareto.evidence.pareto, child.pareto);

    // whichEngine: wskazuje realny Scientific Run (RDKit) który policzył deskryptory.
    const eng = whichEngine(db, child.id);
    assert.equal(eng.ok, true);
    assert.ok(eng.answer.includes('chem-rdkit-descriptors'));
    assert.ok(eng.evidence.length >= 1 && eng.evidence[0].runId);

    // WHY: stop — kampania zatrzymana z jawnym powodem.
    const wStop = whyStop(db, c.id);
    assert.equal(wStop.ok, true);
    assert.ok(['STOP_RESOURCE_LIMIT', 'STOP_NO_IMPROVEMENT', 'STOP_OBJECTIVE_REACHED'].some((r) => wStop.answer.includes(r)));

    // Discovery Graph: zbudowany z realnych kandydatów/decyzji/zdarzeń.
    const g = buildDiscoveryGraph(db, c.id);
    assert.ok(g && g.nodes.length >= 2 && g.edges.length >= 1);
    assert.ok(g.nodes.some((n) => n.type === 'OBJECTIVE'));
    assert.ok(g.nodes.some((n) => n.type === 'CANDIDATE'));
    assert.ok(g.nodes.some((n) => n.type === 'SCIENTIFIC_RUN'));
    assert.ok(g.edges.some((e) => e.type === 'GENERATED_FROM'), 'rodowód jako krawędź');
    assert.ok(g.edges.some((e) => e.type === 'TRANSFORMED_BY'), 'transformacja jako krawędź');
    assert.ok(g.edges.some((e) => e.type === 'EXECUTED_AS'), 'egzekucja jako Scientific Run');
    // Każdy węzeł krawędzi istnieje (graf spójny, bez wymyślonych węzłów).
    const ids = new Set(g.nodes.map((n) => n.id));
    assert.ok(g.edges.every((e) => ids.has(e.from) && ids.has(e.to)), 'krawędzie łączą istniejące węzły');
  });

  test('unknown candidate yields an honest "no evidence" answer, not a fabrication', () => {
    const db = openDatabase();
    const w = whyCandidate(db, 'does-not-exist');
    assert.equal(w.ok, false);
    assert.ok(w.reason.includes('Nieznany'));
  });
});
