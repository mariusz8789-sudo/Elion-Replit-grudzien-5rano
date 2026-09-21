/**
 * D-082 — tests for the amide-count defect repair and the preclinical protocol.
 *
 * The first suite is a REGRESSION suite in the strict sense: it encodes a bug
 * that shipped, was measured on real pinned data, and is now fixed. The second
 * proves the new artifact cannot be mistaken for a promotion.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { countAmideBonds, FROZEN_PEPTIDE_AMIDE_MIN } from './campaign/glp1rQsarV2.mjs';
import { peptideParseBatch, detect } from './compute/rdkitAdapter.mjs';
import { loadGiprPin } from './campaign/giprQsar.mjs';
import { buildPreclinicalProtocol, protocolInvariantHolds, PROTOCOL_KIND, ALLOWED_AXIS_EVIDENCE } from './campaign/preclinicalProtocol.mjs';

const rd = detect();

describe('D-082 amide counting — the defect, measured and repaired', () => {
  it('the shipped string counter really does double count a urea (this is the bug, asserted)', () => {
    // Not a hypothetical: `NC(=O)N` matches BOTH `NC(=O)` and `C(=O)N`, so the
    // two patterns the module's comment calls "disjoint as written" overlap.
    assert.equal(countAmideBonds('NC(=O)N'), 2);
    assert.equal(countAmideBonds('NC(=O)NC(=O)N'), 4);
    // One real amide is still one.
    assert.equal(countAmideBonds('CC(=O)NC'), 1);
  });

  it('RDKit peptide parse scores a urea, a biuret and a carbamate as ZERO peptide bonds', { skip: !rd.available }, () => {
    const r = peptideParseBatch(['CC(=O)NC', 'NC(=O)N', 'NC(=O)NC(=O)N', 'COC(=O)N', 'CC(N)C(=O)NC(C)C(=O)O']);
    assert.equal(r.ok, true);
    const pep = r.results.map((x) => x.data.peptideAmideBonds);
    assert.deepEqual(pep, [1, 0, 0, 0, 1]);
    // And it reports the naive count alongside, so the difference is visible
    // rather than silently corrected.
    assert.deepEqual(r.results.map((x) => x.data.naiveAmideBonds), [1, 2, 4, 1, 1]);
  });

  it('negative: the naive SMARTS a reviewer would reach for reproduces the same defect — which is why it is not the one used', { skip: !rd.available }, () => {
    const r = peptideParseBatch(['NC(=O)N']);
    // naiveAmideBonds IS that SMARTS. It says 2. peptideAmideBonds says 0.
    assert.equal(r.results[0].data.naiveAmideBonds, 2);
    assert.equal(r.results[0].data.peptideAmideBonds, 0);
  });

  it('negative: an unparseable molecule fails in its own slot, indices never shift', { skip: !rd.available }, () => {
    const r = peptideParseBatch(['CCO', 'not-a-smiles', 'CC(=O)NC']);
    assert.equal(r.results.length, 3);
    assert.equal(r.results[1].ok, false);
    assert.equal(r.results[2].data.peptideAmideBonds, 1);
  });

  it('MEASURED IMPACT on the real GIPR pin: 11 rows flip across the peptideLike boundary', { skip: !rd.available }, () => {
    const pin = loadGiprPin();
    assert.equal(pin.ok, true);
    const smiles = pin.rows.map((r) => r.canonicalSmiles);
    const r = peptideParseBatch(smiles);
    assert.equal(r.ok, true);
    let flips = 0;
    for (let i = 0; i < smiles.length; i += 1) {
      const oldLike = countAmideBonds(smiles[i]) >= FROZEN_PEPTIDE_AMIDE_MIN;
      const newLike = (r.results[i]?.data?.peptideAmideBonds ?? 0) >= FROZEN_PEPTIDE_AMIDE_MIN;
      if (oldLike !== newLike) flips += 1;
    }
    // Pinned so a future change to either counter shows up as a test failure
    // rather than as a quiet shift in what "peptide-like" means.
    assert.equal(flips, 11);
  });
});

describe('D-082 preclinical protocol — the artifact a NEW molecule can receive', () => {
  const ok = (over = {}) => buildPreclinicalProtocol({
    candidateId: 'cand-1',
    canonicalSmiles: 'CC(=O)Nc1ccc(O)cc1',
    scaffold: 'c1ccccc1',
    axes: [{ axis: 'GLP1R_ACTIVITY', value: 7.1, uncertainty: 0.4, evidenceClass: 'MODEL_ESTIMATE', outOfDomain: false }],
    falsificationSurvived: ['STRUCTURE_VALID'],
    falsificationOpen: ['PRIOR_ART_UNVERIFIABLE'],
    noveltyStatus: 'PRIOR_ART_UNVERIFIED',
    requiredWetLab: [{ id: 'W1', assay: 'GLP-1R cAMP functional EC50', rankIfPassed: 'OBSERVATIONAL' }],
    provenance: ['campaign/glp1rQsarV2.mjs'],
    ...over,
  });

  it('builds, and the invariant holds', () => {
    const r = ok();
    assert.equal(r.ok, true);
    assert.equal(r.protocol.kind, PROTOCOL_KIND);
    assert.ok(protocolInvariantHolds(r.protocol));
  });

  it('gateLock is written by the module and is literally false on both fields', () => {
    const p = ok().protocol;
    assert.equal(p.gateLock.winnerRecordPossibleNow, false);
    assert.equal(p.gateLock.recipePossibleNow, false);
    assert.ok(!('recipe' in p));
    assert.ok(!('winnerRecord' in p));
  });

  it('negative: a caller cannot smuggle a recipe, a winnerRecord, or their own gateLock in', () => {
    assert.equal(ok({ recipe: { anything: true } }).code, 'INPUT_CARRIES_RECIPE');
    assert.equal(ok({ winnerRecord: { anything: true } }).code, 'INPUT_CARRIES_WINNER_RECORD');
    assert.equal(ok({ gateLock: { winnerRecordPossibleNow: true } }).code, 'INPUT_OVERRIDES_GATE_LOCK');
  });

  it('negative: an axis claiming randomised evidence is REFUSED — that belongs in front of the canonical gate', () => {
    const r = ok({ axes: [{ axis: 'X', value: 1, uncertainty: 0, evidenceClass: 'DIRECT_RANDOMISED' }] });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'AXIS_EVIDENCE_TOO_STRONG');
    assert.ok(ALLOWED_AXIS_EVIDENCE.every((c) => r.detail.includes(c)));
  });

  it('negative: a protocol that requests no experiment is refused as a conclusion in disguise', () => {
    assert.equal(ok({ requiredWetLab: [] }).code, 'NO_WETLAB_REQUESTED');
  });

  it('negative: a wet-lab step may not claim it would reach DIRECT_RANDOMISED — one assay is not a trial', () => {
    const r = ok({ requiredWetLab: [{ id: 'W', assay: 'binding', rankIfPassed: 'DIRECT_RANDOMISED' }] });
    assert.equal(r.code, 'WETLAB_RANK_INVALID');
  });

  it('negative: no structure and no axes are each refused rather than producing an empty protocol', () => {
    assert.equal(ok({ canonicalSmiles: '' }).code, 'NO_STRUCTURE');
    assert.equal(ok({ axes: [] }).code, 'NO_AXES');
  });

  it('a BLOCKED axis is reported as blocked, not omitted — absence of a number is itself the finding', () => {
    const p = ok({ axes: [{ axis: 'GIPR_ACTIVITY', evidenceClass: 'MODEL_ESTIMATE', blockedReason: 'INSUFFICIENT_DATA: nTrain=146 < 150' }] }).protocol;
    assert.equal(p.axes[0].value, null);
    assert.match(p.axes[0].blockedReason, /INSUFFICIENT_DATA/);
  });

  it('the fingerprint is deterministic and changes with the candidate', () => {
    assert.equal(ok().protocol.protocolFingerprint, ok().protocol.protocolFingerprint);
    assert.notEqual(ok({ candidateId: 'other' }).protocol.protocolFingerprint, ok().protocol.protocolFingerprint);
  });

  it('50 computational axes still leave both gate locks false — accumulation buys nothing here either', () => {
    const p = ok({ axes: Array.from({ length: 50 }, (_, i) => ({ axis: `SIM_${i}`, value: 1, uncertainty: 0.1, evidenceClass: 'COMPUTATIONAL' })) }).protocol;
    assert.equal(p.gateLock.winnerRecordPossibleNow, false);
    assert.equal(p.gateLock.recipePossibleNow, false);
    assert.ok(protocolInvariantHolds(p));
  });
});
