/**
 * Phase 4 P/Q/R/S — Speculative Physics Adversary. Adversarial: try to make Genesis
 * call speculation a fact or a fictional device buildable. It must resist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sp from './cognitive/speculativePhysics.mjs';

test('physical claim classification: FTL/future-info CONTRADICTED, time dilation SUPPORTED', () => {
  assert.equal(sp.assessPhysicalClaim('faster-than-light information transfer').status, 'CONTRADICTED');
  assert.equal(sp.assessPhysicalClaim('receive future information').status, 'CONTRADICTED');
  assert.equal(sp.assessPhysicalClaim('forward time dilation via relativistic travel').status, 'SUPPORTED');
  assert.equal(sp.assessPhysicalClaim('perpetual motion free energy').status, 'CONTRADICTED');
  assert.equal(sp.assessPhysicalClaim('a completely novel unlisted claim').status, 'UNRESOLVED'); // honest unknown
});

test('S3 time machine: forward dilation buildable; backward transfer NOT buildable', () => {
  const fwd = sp.impossibilityToInvention({ target: 'forward time machine', requirements: ['forward time dilation via relativistic travel'] });
  assert.equal(fwd.buildability, 'BUILDABLE_UNDER_KNOWN_PHYSICS');
  const back = sp.impossibilityToInvention({ target: 'backward time machine', requirements: ['backward matter transfer', 'receive future information'], nearestDescendant: 'relativistic forward time-dilation experiment' });
  assert.equal(back.buildability, 'NOT_BUILDABLE_UNDER_CURRENT_MODEL');
  assert.ok(back.dominantBlocker);
  assert.equal(back.nearestBuildableDescendant, 'relativistic forward time-dilation experiment');
});

test('S1 Philadelphia: invisibility supported (metamaterials), matter teleportation not', () => {
  assert.equal(sp.assessPhysicalClaim('optical invisibility cloak').status, 'SUPPORTED');
  assert.equal(sp.assessPhysicalClaim('matter teleportation of a ship').status, 'UNSUPPORTED');
});

test('S2 Sliders: parallel-reality gate is UNRESOLVED/NOT buildable with a named blocker', () => {
  const r = sp.impossibilityToInvention({ target: 'Sliders reality gate', requirements: ['parallel world gate travel'], nearestDescendant: 'branching-quantum decoherence simulation' });
  assert.ok(['UNRESOLVED', 'NOT_BUILDABLE_UNDER_CURRENT_MODEL'].includes(r.buildability));
  assert.ok(r.dominantBlocker);
  assert.equal(r.nearestBuildableDescendant, 'branching-quantum decoherence simulation');
});

test('S4 Looking Glass: future-info receiver NOT buildable; Looking Glass Zero is prediction, never future information', () => {
  const lg = sp.lookingGlass();
  assert.equal(lg.futureInformationReceiver.buildability, 'NOT_BUILDABLE_UNDER_CURRENT_MODEL');
  assert.equal(lg.extremePredictionSystem, 'BUILDABLE_UNDER_KNOWN_PHYSICS');
  assert.equal(lg.quantumComputeRole, 'ACCELERATOR_ONLY'); // quantum compute is not magic
  assert.match(lg.lookingGlassZero.honestyRule, /prediction is labelled prediction/i);
  assert.ok(lg.lookingGlassZero.architecture.includes('FORECAST_FAILURE_MEMORY'));
});

test('Q grandfather paradox: separates math / physical / experimental; claims no time travel', () => {
  const g = sp.grandfatherParadox();
  assert.equal(g.physicalPossibility, 'EXPERIMENTALLY_UNSUPPORTED');
  assert.equal(g.experimentalEvidence, 'none');
  assert.match(g.conclusion, /SPECIFIC causal model, not of physics/);
});

test('P adversary: a linguistic objection to relativity is REJECTED (Einstein not disproved)', () => {
  const bad = sp.challengeModel({ model: 'special relativity' }); // no formal elements
  assert.equal(bad.admissible, false);
  assert.equal(bad.verdict, 'REJECTED_LINGUISTIC_OBJECTION');
  assert.ok(bad.missing.includes('FORMAL_DIVERGENCE') && bad.missing.includes('FALSIFIABLE_TEST'));
  const good = sp.challengeModel({ model: 'special relativity', formalDivergence: 'X', parameterRegion: 'Y', alternativePrediction: 'Z', falsifiableTest: 'W' });
  assert.equal(good.admissible, true);
  assert.match(good.note, /NOT a disproof/);
});

test('HOSTILE: cannot be made to call a fictional device buildable or a contradiction supported', () => {
  const r = sp.impossibilityToInvention({ target: 'over-unity reactor', requirements: ['free energy over-unity generator'] });
  assert.equal(r.buildability, 'NOT_BUILDABLE_UNDER_CURRENT_MODEL');
  assert.equal(sp.assessPhysicalClaim('over-unity free energy').status, 'CONTRADICTED');
});
