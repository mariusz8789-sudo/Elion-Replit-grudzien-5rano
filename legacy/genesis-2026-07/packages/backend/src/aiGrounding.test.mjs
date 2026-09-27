import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groundChatAnswer, groundingEnabled } from './aiGrounding.mjs';

/**
 * AI-chat ↔ Grounding integration glue. End-to-end over the exact function
 * server.mjs calls on a model answer: flag OFF → byte-identical pass-through;
 * flag ON → grounded / unverified-redacted / contradicted-redacted (or blocked).
 * Uses a fake compute (no subprocess) and explicit flag overrides (no real env).
 */
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const FACTS = { molWt: 180.159, crippenLogP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' };
const fakeCompute = (s) => (s === ASPIRIN ? { ok: true, canonicalSmiles: ASPIRIN, properties: FACTS } : { ok: false, error: 'invalid_smiles' });

describe('groundingEnabled — the single feature flag', () => {
  test('true only for the exact string "true"', () => {
    assert.equal(groundingEnabled({ GROUNDING_ENABLED: 'true' }), true);
    assert.equal(groundingEnabled({ GROUNDING_ENABLED: 'false' }), false);
    assert.equal(groundingEnabled({ GROUNDING_ENABLED: '1' }), false);
    assert.equal(groundingEnabled({}), false); // default OFF
  });
});

describe('Grounding OFF → identical to current behaviour (pass-through)', () => {
  test('answer with molecular numbers is returned byte-for-byte unchanged', () => {
    const answer = 'Masa molowa wynosi 999.9 g/mol, LogP to 8.5.'; // would be redacted if ON
    const r = groundChatAnswer(answer, { enabled: false, compute: fakeCompute, activeSmiles: ASPIRIN });
    assert.equal(r.text, answer);
    assert.equal(r.grounded, false);
    assert.equal(r.status, 'disabled');
  });
});

describe('Grounding ON', () => {
  test('correctly grounded answer passes unchanged (claims block stripped)', () => {
    const answer = 'Masa molowa wynosi 180.16 g/mol.\n\n```genesis-claims\n[{"smiles":"CC(=O)Oc1ccccc1C(=O)O","property":"molWt","value":180.16}]\n```';
    const r = groundChatAnswer(answer, { enabled: true, compute: fakeCompute, activeSmiles: ASPIRIN });
    assert.equal(r.grounded, true);
    assert.equal(r.status, 'grounded');
    assert.ok(r.text.includes('180.16'));
    assert.ok(!r.text.includes('genesis-claims'));
  });

  test('unverified claim (no backing computation) → redacted', () => {
    const r = groundChatAnswer('Masa molowa wynosi 250.3 g/mol.', { enabled: true, compute: fakeCompute });
    assert.equal(r.status, 'redacted');
    assert.ok(!r.text.includes('250.3'));
    assert.ok(r.text.includes('niepotwierdzone'));
  });

  test('answer contradicting RDKit (LogP 8.5 vs real 1.31) → redacted, wrong value removed', () => {
    const r = groundChatAnswer('LogP wynosi 8.5.', { enabled: true, compute: fakeCompute, activeSmiles: ASPIRIN });
    assert.equal(r.status, 'redacted');
    assert.ok(!r.text.includes('8.5'));
  });

  test('block policy → whole answer replaced with an honest refusal (no leaked value)', () => {
    const r = groundChatAnswer('LogP wynosi 8.5.', { enabled: true, compute: fakeCompute, activeSmiles: ASPIRIN, policy: 'block' });
    assert.equal(r.status, 'blocked');
    assert.ok(!r.text.includes('8.5'));
  });

  test('non-molecular / general answer is untouched (physics numbers not flagged)', () => {
    const answer = 'Czynnik Lorentza rośnie do nieskończoności przy prędkości światła.';
    const r = groundChatAnswer(answer, { enabled: true, compute: fakeCompute });
    assert.equal(r.status, 'grounded');
    assert.equal(r.text, answer);
  });
});
