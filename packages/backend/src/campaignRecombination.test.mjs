import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect, bricsRecombine, transform, listTransformations } from './compute/rdkitAdapter.mjs';
import {
  RECOMBINATION_SOURCE,
  availableProposalSources,
  availableTransformations,
  generateProposals,
  generateRecombinationProposals,
  parentPairs,
} from './campaign/drugAdapter.mjs';
import { createCampaign, addCandidate, getCandidate, listCandidates } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { whyCandidate } from './campaign/why.mjs';
import { buildDiscoveryGraph } from './campaign/discoveryGraph.mjs';

/**
 * REKOMBINACJA FRAGMENTÓW BRICS — przeszukiwanie POZA wyliczoną listą transformacji.
 *
 * Jedyna luka, jaką miał silnik odkrywania w chemii: `generateProposals` potrafiło
 * stosować wyłącznie stałą listę transformacji JEDNOrodzicielskich. Reguły BRICS
 * (Degen i in. 2008, implementacja w `rdkit.Chem.BRICS`) rozkładają rodziców na
 * fragmenty po wiązaniach syntetycznie dostępnych i łączą je z powrotem tylko tam,
 * gdzie typy punktów przyłączenia pasują — więc produkt z fragmentów DWOJGA rodziców
 * jest realną chemią.
 *
 * Czego to NIE jest: generatywnego projektowania de novo. Nie ma tu modelu
 * proponującego nowe rusztowania, a przeszukiwanie pozostaje kombinatoryczne i
 * ograniczone do fragmentów obecnych w rodzicach. Testy niżej sprawdzają dokładnie
 * to, co moduł naprawdę robi — nie więcej.
 *
 * Test jest ŚWIADOMY DOSTĘPNOŚCI, jak `rdkit.test.mjs`: z RDKit sprawdza realną
 * chemię, bez niego — uczciwą degradację. Zielony w OBU środowiskach.
 */

const RDKIT = detect().available;
const maybe = RDKIT ? test : test.skip;

const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const IBUPROFEN = 'CC(C)Cc1ccc(cc1)C(C)C(=O)O';
const CAFFEINE = 'Cn1cnc2c1c(=O)n(C)c(=O)n2C';

describe(`BRICS recombination (RDKit available=${RDKIT})`, () => {
  maybe('recombines two parents into hybrids no single transformation can reach', () => {
    const r = bricsRecombine([ASPIRIN, IBUPROFEN], { maxProducts: 8 });
    assert.equal(r.ok, true);
    assert.ok(r.products.length > 0, 'realne produkty rekombinacji');

    // Sedno tej zmiany: te produkty są POZA zasięgiem listy transformacji.
    // Sprawdzamy to wprost — każda transformacja, na każdym rodzicu, i żadna
    // z nich nie daje tego, co dała rekombinacja.
    const transformations = listTransformations().transformations;
    const reachableInOneStep = new Set();
    for (const parent of [ASPIRIN, IBUPROFEN]) {
      for (const t of transformations) {
        const tr = transform(parent, t);
        if (tr.ok) for (const p of tr.products) reachableInOneStep.add(p);
      }
    }
    const beyondTheList = r.products.filter((p) => !reachableInOneStep.has(p));
    assert.ok(
      beyondTheList.length > 0,
      'co najmniej jeden produkt jest nieosiągalny żadną pojedynczą transformacją z listy',
    );
  });

  maybe('produces a genuine cross-parent hybrid, not a rearrangement of one parent', () => {
    const r = bricsRecombine([ASPIRIN, IBUPROFEN], { maxProducts: 8 });
    // Fragment octanowy pochodzi z aspiryny, łańcuch izobutylowy z ibuprofenu.
    // Produkt zawierający oba pochodzi z DWOJGA rodziców naraz.
    const hybrid = r.products.find((p) => p.includes('CC(=O)O') && p.includes('CC(C)'));
    assert.ok(hybrid, `oczekiwano hybrydy dwojga rodziców, otrzymano: ${r.products.join(', ')}`);
  });

  maybe('is deterministic: the same parents give the same products every call', () => {
    const a = bricsRecombine([ASPIRIN, IBUPROFEN], { maxProducts: 6 });
    const b = bricsRecombine([ASPIRIN, IBUPROFEN], { maxProducts: 6 });
    assert.deepEqual(b.products, a.products);
    // Kolejność wejścia nie może zmieniać wyniku — pula fragmentów jest sortowana.
    const swapped = bricsRecombine([IBUPROFEN, ASPIRIN], { maxProducts: 6 });
    assert.deepEqual(swapped.products, a.products);
  });

  maybe('never returns a reconstructed parent as a new candidate', () => {
    const r = bricsRecombine([ASPIRIN, IBUPROFEN], { maxProducts: 12 });
    // Aspiryna daje się złożyć z powrotem z własnych fragmentów; to nie jest nowy kandydat.
    for (const product of r.products) {
      assert.notEqual(product, 'CC(=O)Oc1ccccc1C(=O)O');
      assert.notEqual(product, 'CC(C)Cc1ccc(C(C)C(=O)O)cc1');
    }
  });

  maybe('says so plainly when a molecule is not decomposable, instead of inventing products', () => {
    const r = bricsRecombine([CAFFEINE], { maxProducts: 5 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.products, []);
    assert.equal(r.reason, 'not_decomposable');
  });

  maybe('rejects invalid SMILES rather than silently skipping them', () => {
    const r = bricsRecombine([ASPIRIN, 'this_is_not_smiles!!!']);
    assert.equal(r.ok, false);
  });

  if (!RDKIT) {
    test('without RDKit recombination is blocked by runtime, never faked', () => {
      const r = bricsRecombine([ASPIRIN, IBUPROFEN]);
      assert.equal(r.ok, false);
      assert.equal(r.error, 'BLOCKED_BY_RUNTIME');
      assert.deepEqual(availableProposalSources(), []);
    });
  }
});

describe(`Recombination as a weighted proposal source (RDKit available=${RDKIT})`, () => {
  maybe('is offered alongside the transformations, not instead of them', () => {
    const sources = availableProposalSources();
    assert.ok(sources.includes(RECOMBINATION_SOURCE));
    for (const t of availableTransformations()) assert.ok(sources.includes(t));
  });

  maybe('pairs parents deterministically and within the declared bound', () => {
    const pairs = parentPairs([IBUPROFEN, ASPIRIN, CAFFEINE], 2);
    assert.equal(pairs.length, 2);
    assert.deepEqual(parentPairs([IBUPROFEN, ASPIRIN, CAFFEINE], 2), pairs);
    // Kanoniczne sortowanie: ta sama para niezależnie od kolejności wejścia.
    assert.deepEqual(parentPairs([ASPIRIN, IBUPROFEN], 5), [[ASPIRIN, IBUPROFEN].sort()]);
  });

  maybe('records BOTH parents on every recombinant, in canonical form', () => {
    const { proposals } = generateRecombinationProposals([ASPIRIN, IBUPROFEN], { maxProductsPerPair: 4 });
    assert.ok(proposals.length > 0);
    for (const p of proposals) {
      assert.equal(p.transformation, RECOMBINATION_SOURCE);
      assert.ok(p.parentSmiles);
      assert.ok(p.coParentSmiles, 'rekombinat ma dwoje rodziców, nie jednego');
      assert.notEqual(p.parentSmiles, p.coParentSmiles);
      // Kanoniczna forma RDKit, nie forma wejściowa.
      assert.equal(p.coParentSmiles, 'CC(C)Cc1ccc(C(C)C(=O)O)cc1');
    }
  });

  maybe('a weight of 0 really disables it — strategy controls execution', () => {
    const weights = Object.fromEntries(availableProposalSources().map((t) => [t, 1]));
    const on = generateProposals([ASPIRIN, IBUPROFEN], weights, { maxPerTransform: 2 });
    assert.ok(on.proposals.some((p) => p.transformation === RECOMBINATION_SOURCE));
    assert.ok(on.attempts[RECOMBINATION_SOURCE] > 0);

    const off = generateProposals([ASPIRIN, IBUPROFEN], { ...weights, [RECOMBINATION_SOURCE]: 0 }, { maxPerTransform: 2 });
    assert.ok(!off.proposals.some((p) => p.transformation === RECOMBINATION_SOURCE));
    assert.equal(off.attempts[RECOMBINATION_SOURCE], undefined);
  });

  maybe('leaves single-parent transformations byte-identical when recombination is off', () => {
    // Regresja: nowe źródło nie może po cichu zmienić istniejącej ścieżki.
    const tx = Object.fromEntries(availableTransformations().map((t) => [t, 1]));
    const before = generateProposals([ASPIRIN], tx, { maxPerTransform: 2 });
    const after = generateProposals([ASPIRIN], { ...tx, [RECOMBINATION_SOURCE]: 0 }, { maxPerTransform: 2 });
    assert.deepEqual(after.proposals, before.proposals);
  });

  maybe('marks every single-parent proposal as having no co-parent', () => {
    const tx = Object.fromEntries(availableTransformations().map((t) => [t, 1]));
    const { proposals } = generateProposals([ASPIRIN], tx, { maxPerTransform: 1 });
    for (const p of proposals) assert.equal(p.coParentSmiles, null);
  });
});

describe(`Recombinant lineage survives persistence and explanation (RDKit available=${RDKIT})`, () => {
  test('the co-parent round-trips through the database', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'brics@lab.org', displayName: 'B', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'BRICS', ownerId: u.id });
    const c = createCampaign(db, {
      projectId: p.id, objective: 'MPO benchmark (software validation)', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
      stopping: { patience: 2, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: [ASPIRIN] }, createdBy: u.id,
    });
    const id = addCandidate(db, {
      campaignId: c.id, generation: 1, parentSmiles: ASPIRIN, coParentSmiles: IBUPROFEN,
      transformation: RECOMBINATION_SOURCE, canonicalSmiles: 'CC(=O)OC(C)=O', status: 'retained',
    });
    const stored = getCandidate(db, id);
    assert.equal(stored.coParentSmiles, IBUPROFEN);
    assert.equal(stored.parentSmiles, ASPIRIN);

    // WHY musi wymienić OBOJE rodziców — nazwanie jednego byłoby fałszywym rodowodem.
    const why = whyCandidate(db, id);
    assert.equal(why.ok, true);
    assert.ok(why.answer.includes(ASPIRIN));
    assert.ok(why.answer.includes(IBUPROFEN));
    assert.equal(why.evidence.coParentSmiles, IBUPROFEN);
  });

  test('a single-parent candidate still reports exactly one parent', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'single@lab.org', displayName: 'S', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'Single', ownerId: u.id });
    const c = createCampaign(db, {
      projectId: p.id, objective: 'MPO benchmark (software validation)', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
      stopping: { patience: 2, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: { startingSmiles: [ASPIRIN] }, createdBy: u.id,
    });
    const id = addCandidate(db, {
      campaignId: c.id, generation: 1, parentSmiles: ASPIRIN, transformation: 'add-methyl',
      canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)OC', status: 'retained',
    });
    const stored = getCandidate(db, id);
    assert.equal(stored.coParentSmiles, null);
    const why = whyCandidate(db, id);
    assert.ok(!why.answer.includes('rekombinacj'));
  });

  maybe('a real campaign run reaches the Pareto machinery through the new source', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'camp@lab.org', displayName: 'C', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'Camp', ownerId: u.id });
    const sources = availableProposalSources();
    const c = createCampaign(db, {
      projectId: p.id, objective: 'MPO benchmark (software validation)', domain: 'DRUG_DISCOVERY',
      budget: { maxGenerations: 2, maxGeneratedCandidates: 20 },
      stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
      strategy: {
        startingSmiles: [ASPIRIN, IBUPROFEN],
        transformationWeights: Object.fromEntries(sources.map((t) => [t, 1])),
        parentSelection: 'pareto',
      },
      createdBy: u.id,
    });
    // Musi przejść całą pętlę bez wyjątku: statystyki, Pareto, decyzje, graf.
    const result = runCampaign(db, c.id);
    assert.ok(result.generations >= 1);

    const candidates = listCandidates(db, c.id);
    const recombinants = candidates.filter((x) => x.transformation === RECOMBINATION_SOURCE);
    assert.ok(recombinants.length > 0, 'kampania naprawdę wygenerowała rekombinanty');
    for (const r of recombinants) assert.ok(r.coParentSmiles, 'rodowód dwojga rodziców przetrwał kampanię');

    // Graf rodowodu pokazuje OBIE krawędzie pochodzenia tam, gdzie oboje rodzice są kandydatami.
    const graph = buildDiscoveryGraph(db, c.id);
    assert.ok(graph.nodes.some((n) => n.type === 'TRANSFORMATION' && n.label === RECOMBINATION_SOURCE));
    const withBothParents = recombinants.find((r) =>
      candidates.some((x) => x.canonicalSmiles === r.coParentSmiles) && r.parentId,
    );
    if (withBothParents) {
      const incoming = graph.edges.filter((e) => e.to === `cand:${withBothParents.id}` && e.type === 'GENERATED_FROM');
      assert.equal(incoming.length, 2, 'rekombinat ma dwie krawędzie GENERATED_FROM');
    }
  });
});
