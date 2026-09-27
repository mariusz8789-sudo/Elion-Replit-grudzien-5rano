/**
 * De Novo Molecular Design (Genesis V4, Phase 1). Real RDKit BRICS/scaffold-hop/bioisostere
 * generation + multi-criteria ranking. Fake engines exercise the logic deterministically; a guarded
 * case drives real RDKit. Novelty is computational; no fabricated activity.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeNovo, DESIGN_METHODS } from './cognitive/denovoDesign.mjs';
import * as rdkit from './compute/rdkitAdapter.mjs';

function fakeEngines() {
  return {
    rdkitDetect: () => ({ available: true }),
    validate: (s) => ({ ok: true, canonicalSmiles: String(s) }),
    denovo: ({ mode, seeds }) => ({ ok: true, mode, generated: [0, 1, 2, 3].map((i) => ({ smiles: `${mode}-${seeds[0]}-${i}`, scaffold: `scaf${i % 2}` })) }),
    listTransformations: () => ({ ok: true, transformations: ['add-methyl', 'add-fluoro'] }),
    transform: (s, t) => ({ ok: true, products: [`${s}${t}`] }),
    descriptors: (s) => ({ ok: true, data: { molWt: 200 + s.length, lipinskiViolations: s.length % 3, tpsa: 60 } }),
    alerts: (s) => ({ ok: true, nAlerts: s.length % 2 }),
    saScore: (s) => ({ ok: true, saScore: 2 + (s.length % 5) }),
    novelty: (s) => ({ ok: true, maxTanimoto: (s.length % 10) / 10, nReference: 3 }),
  };
}

describe('denovoDesign — generation + multi-criteria ranking (fake engines)', () => {
  test('generates novel molecules across design methods and ranks them', () => {
    const r = generateDeNovo({ seeds: ['CCO'], count: 6, methods: DESIGN_METHODS, engines: fakeEngines() });
    assert.equal(r.status, 'COMPLETED');
    assert.ok(r.generatedCount > 0);
    assert.ok(r.molecules.length > 0 && r.molecules.length <= 6);
    assert.ok(r.molecules.every((m) => typeof m.multiCriteriaScore === 'number' && m.epistemicStatus === 'COMPUTATIONAL_NOVEL_STRUCTURE'));
    // ranked descending, contiguous
    for (let i = 1; i < r.molecules.length; i++) assert.ok(r.molecules[i - 1].multiCriteriaScore >= r.molecules[i].multiCriteriaScore);
    assert.deepEqual(r.molecules.map((m) => m.rank), r.molecules.map((_, i) => i + 1));
    // seeds excluded from output
    assert.ok(!r.molecules.some((m) => m.smiles === 'CCO'));
  });

  test('multi-criteria score blends drug-likeness, novelty, synthesizability minus alerts', () => {
    const r = generateDeNovo({ seeds: ['CCO'], count: 4, methods: ['brics_build'], engines: fakeEngines() });
    const m = r.molecules[0];
    for (const k of ['druglikeness', 'novelty', 'synthAccessibility', 'alertPenalty']) assert.ok(k in m.components);
    assert.ok(m.multiCriteriaScore >= 0 && m.multiCriteriaScore <= 1);
  });

  test('deterministic — identical inputs produce identical ranking', () => {
    const a = generateDeNovo({ seeds: ['CCO'], count: 6, engines: fakeEngines() });
    const b = generateDeNovo({ seeds: ['CCO'], count: 6, engines: fakeEngines() });
    assert.deepEqual(a.molecules.map((m) => m.smiles), b.molecules.map((m) => m.smiles));
  });

  test('RDKit unavailable → BLOCKED_BY_RUNTIME (never fabricated)', () => {
    const eng = fakeEngines(); eng.rdkitDetect = () => ({ available: false, reason: 'no rdkit' });
    assert.equal(generateDeNovo({ seeds: ['CCO'], engines: eng }).status, 'BLOCKED_BY_RUNTIME');
  });

  test('no valid seeds → NO_VALID_SEEDS', () => {
    const eng = fakeEngines(); eng.validate = () => ({ ok: false });
    assert.equal(generateDeNovo({ seeds: ['x'], engines: eng }).status, 'NO_VALID_SEEDS');
  });
});

describe('denovoDesign — REAL RDKit BRICS generation', () => {
  (rdkit.detect().available ? test : test.skip)('generates genuinely new valid structures from seeds', () => {
    const r = generateDeNovo({ seeds: ['CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)Nc1ccc(O)cc1'], count: 4, methods: ['brics_build'], evalCap: 8 });
    assert.equal(r.status, 'COMPLETED');
    assert.ok(r.generatedCount >= 4);
    assert.ok(r.molecules.length >= 1);
    // every molecule is a real, RDKit-parseable, novel structure not equal to a seed
    assert.ok(r.molecules.every((m) => m.descriptors && typeof m.descriptors.molWt === 'number'));
    assert.ok(!r.molecules.some((m) => r.seeds.includes(m.smiles)));
    assert.ok(r.molecules.every((m) => typeof m.noveltyMaxTanimoto === 'number'));
  });
});
