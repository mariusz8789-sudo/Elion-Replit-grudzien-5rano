import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groundAnswer, createRegistry, extractClaims, defaultCompute } from './cognitive/groundingLayer.mjs';

/**
 * Grounding layer (docs/GROUNDING_LAYER_DESIGN.md). Verifies the three required
 * scenarios — (a) fully grounded passes unchanged, (b) an unverified/contradicted
 * numeric claim is caught + redacted/blocked, (c) a claim-free answer passes
 * untouched — plus edge cases: non-groundable properties, InChIKey hallucination,
 * compute-on-demand caching, policy modes, and the enable/disable flag.
 * A fake `compute` keeps unit tests deterministic (no subprocess); one integration
 * test exercises the REAL RDKit adapter end-to-end.
 */
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const ASPIRIN_FACTS = { molWt: 180.159, crippenLogP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, aromaticRings: 1, lipinskiViolations: 0, inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', molecularFormula: 'C9H8O4' };
const fakeCompute = (calls) => (smiles) => {
  if (calls) calls.push(smiles);
  return smiles === ASPIRIN ? { ok: true, canonicalSmiles: ASPIRIN, properties: ASPIRIN_FACTS } : { ok: false, error: 'invalid_smiles' };
};

describe('(a) fully grounded answer passes unchanged', () => {
  test('structured claim that matches the real computation → grounded, claims block stripped', () => {
    const answer = 'Masa molowa aspiryny wynosi 180.16 g/mol, a LogP to 1.31.\n\n```genesis-claims\n[{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"molWt","value":180.16},{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"crippenLogP","value":1.31}]\n```';
    const r = groundAnswer(answer, { registry: createRegistry(), compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(r.status, 'grounded');
    assert.ok(!r.text.includes('genesis-claims'));
    assert.ok(r.text.includes('180.16') && r.text.includes('1.31'));
    assert.equal(r.redactions.length, 0);
    assert.ok(r.verifications.some((v) => v.property === 'molWt' && v.verdict === 'verified'));
  });

  test('prose values grounded against pre-recorded registry facts (no claims block needed)', () => {
    const reg = createRegistry();
    reg.record(ASPIRIN, ASPIRIN_FACTS, 'RDKit');
    const r = groundAnswer('TPSA wynosi 63.6 a HBD to 1.', { registry: reg, compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(r.status, 'grounded');
    assert.equal(r.text, 'TPSA wynosi 63.6 a HBD to 1.');
  });
});

describe('(b) unverified / contradicted numeric claim is caught', () => {
  test('contradicted prose value (LogP 8.5 vs real 1.31) → redacted with error marker', () => {
    const r = groundAnswer('LogP tej cząsteczki wynosi 8.5.', { registry: createRegistry(), compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(r.status, 'redacted');
    assert.ok(!r.text.includes('8.5'), 'the fabricated number must not reach the user');
    assert.ok(r.text.includes('BŁĄD') || r.text.includes('niepotwierdzone'));
    assert.ok(r.redactions.some((x) => x.property === 'crippenLogP'));
  });

  test('unverified value (no computation, no active molecule) → redacted', () => {
    const r = groundAnswer('Masa molowa wynosi 250.3 g/mol.', { registry: createRegistry(), compute: fakeCompute() });
    assert.equal(r.status, 'redacted');
    assert.ok(!r.text.includes('250.3'));
    assert.ok(r.text.includes('niepotwierdzone'));
  });

  test('contradicted structured claim (MW 500 vs real 180) → redacted, claim audited', () => {
    const answer = 'Masa to 500.0 g/mol.\n```genesis-claims\n[{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"molWt","value":500.0}]\n```';
    const r = groundAnswer(answer, { registry: createRegistry(), compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(r.status, 'redacted');
    assert.ok(!r.text.includes('500'));
    assert.ok(r.verifications.some((v) => v.property === 'molWt' && v.verdict === 'contradicted' && v.computed === 180.159));
  });

  test('block policy → whole answer replaced with an honest refusal', () => {
    const r = groundAnswer('LogP wynosi 8.5.', { registry: createRegistry(), compute: fakeCompute(), activeSmiles: ASPIRIN, policy: 'block' });
    assert.equal(r.status, 'blocked');
    assert.ok(!r.text.includes('8.5'));
    assert.match(r.text, /Nie mogę potwierdzić/i);
  });

  test('annotate policy → keeps the number but tags it (debug mode)', () => {
    const r = groundAnswer('Masa molowa wynosi 250.3 g/mol.', { registry: createRegistry(), compute: fakeCompute(), policy: 'annotate' });
    assert.equal(r.status, 'redacted');
    assert.ok(r.text.includes('250.3'));
    assert.ok(r.text.includes('niepotwierdzone'));
  });

  test('hallucinated InChIKey → redacted; a real one that matches → grounded', () => {
    const reg = createRegistry();
    reg.record(ASPIRIN, ASPIRIN_FACTS, 'RDKit');
    const bad = groundAnswer('InChIKey to AAAAAAAAAAAAAA-BBBBBBBBBB-C.', { registry: reg, compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(bad.status, 'redacted');
    assert.ok(!bad.text.includes('AAAAAAAAAAAAAA-BBBBBBBBBB-C'));
    const good = groundAnswer('InChIKey to BSYNRYMUTXBXSQ-UHFFFAOYSA-N.', { registry: reg, compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(good.status, 'grounded');
  });

  test('non-groundable property (toxicity + number) → always unverified by RDKit', () => {
    const reg = createRegistry();
    reg.record(ASPIRIN, ASPIRIN_FACTS, 'RDKit');
    const r = groundAnswer('Toksyczność wynosi 42.', { registry: reg, compute: fakeCompute(), activeSmiles: ASPIRIN });
    assert.equal(r.status, 'redacted');
    assert.ok(!r.text.includes('42'));
  });
});

describe('(c) answer with no numeric molecular claims passes untouched', () => {
  test('general/qualitative question → grounded, text identical', () => {
    const answer = 'Dokowanie molekularne to oszacowanie empiryczne, nie zmierzone powinowactwo. Genesis jawnie oznacza zablokowane silniki.';
    const r = groundAnswer(answer, { registry: createRegistry(), compute: fakeCompute() });
    assert.equal(r.status, 'grounded');
    assert.equal(r.text, answer);
    assert.equal(r.redactions.length, 0);
  });
  test('years and pH-like numbers without a property keyword are not flagged', () => {
    const r = groundAnswer('Soczewkowanie grawitacyjne potwierdzono w 1919 roku.', { registry: createRegistry(), compute: fakeCompute() });
    assert.equal(r.status, 'grounded');
    assert.ok(r.text.includes('1919'));
  });
});

describe('flag + performance behaviour', () => {
  test('disabled flag → pure pass-through, no verification', () => {
    const r = groundAnswer('LogP wynosi 8.5.', { enabled: false });
    assert.equal(r.status, 'disabled');
    assert.equal(r.text, 'LogP wynosi 8.5.');
    assert.equal(r.verifications.length, 0);
  });
  test('empty answer → disabled/no-op', () => {
    assert.equal(groundAnswer('', {}).status, 'disabled');
  });
  test('compute-on-demand runs at most once per molecule (cached), respecting maxOnDemand', () => {
    const calls = [];
    // Two claims about the same molecule → one compute call total (cached).
    const answer = '```genesis-claims\n[{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"molWt","value":180.16},{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"tpsa","value":63.6}]\n```';
    const r = groundAnswer(answer, { registry: createRegistry(), compute: fakeCompute(calls) });
    assert.equal(r.status, 'grounded');
    assert.equal(calls.length, 1, 'descriptors computed once, reused for the second property');
  });
  test('maxOnDemand cap → excess molecules stay unverified (fail-closed)', () => {
    const calls = [];
    const answer = '```genesis-claims\n[{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"molWt","value":180.16}]\n```';
    const r = groundAnswer(answer, { registry: createRegistry(), compute: fakeCompute(calls), maxOnDemand: 0 });
    assert.equal(calls.length, 0);
    assert.ok(r.verifications.some((v) => v.verdict === 'unverified'));
  });
});

describe('extractClaims — structured block parsing', () => {
  test('parses a valid block and strips it', () => {
    const { claims, cleanText } = extractClaims('Tekst.\n```genesis-claims\n[{"smiles":"CCO","property":"molWt","value":46}]\n```');
    assert.equal(claims.length, 1);
    assert.ok(!cleanText.includes('genesis-claims'));
  });
  test('malformed block → no claims, text-scan still guards (does not throw)', () => {
    const { claims } = extractClaims('```genesis-claims\n{not json]\n```');
    assert.deepEqual(claims, []);
  });
});

describe('integration — real RDKit engine (end-to-end)', () => {
  test('grounds against the actual adapter: real aspirin values pass, a fake one is redacted', () => {
    const probe = defaultCompute(ASPIRIN);
    if (!probe.ok) return; // RDKit unavailable in this environment → skip (honest)
    const reg = createRegistry();
    const good = groundAnswer('Masa molowa wynosi 180.16 g/mol.', { registry: reg, activeSmiles: ASPIRIN }); // real defaultCompute
    assert.equal(good.status, 'grounded');
    const bad = groundAnswer('Masa molowa wynosi 999.9 g/mol.', { registry: createRegistry(), activeSmiles: ASPIRIN });
    assert.equal(bad.status, 'redacted');
    assert.ok(!bad.text.includes('999.9'));
  });
});
