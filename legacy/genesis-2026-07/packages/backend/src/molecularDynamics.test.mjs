/**
 * Molecular Dynamics + MM-GBSA integration (Genesis V3, Phases 2/3). Honest capability gating: a
 * protein-ligand MD system needs a ligand force field; absent it, MD and (dependent) MM-GBSA are
 * BLOCKED_BY_RUNTIME — never fabricated. Docking and MM-GBSA scores are kept strictly separate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectMdCapability, runComplexMd, mmgbsaRescore, runMdStage } from './cognitive/molecularDynamics.mjs';

const capOff = { openmm: { available: true }, ligandForceField: { available: false }, canRunComplexMd: false, reason: 'ligand force-field parameterisation unavailable (no OpenFF / openmmforcefields)' };

describe('molecularDynamics — capability gating (honest, no fabrication)', () => {
  test('detectMdCapability: OpenMM present but no ligand FF → cannot run complex MD', () => {
    const cap = detectMdCapability({ openmmDetect: () => ({ available: true }), ligandFfProbe: () => ({ available: false }) });
    assert.equal(cap.canRunComplexMd, false);
    assert.match(cap.reason, /force-field/);
  });
  test('detectMdCapability: OpenMM absent → blocked at the engine', () => {
    const cap = detectMdCapability({ openmmDetect: () => ({ available: false, reason: 'no openmm' }), ligandFfProbe: () => ({ available: true }) });
    assert.equal(cap.canRunComplexMd, false);
    assert.match(cap.reason, /OpenMM unavailable/);
  });

  test('runComplexMd without capability → BLOCKED_BY_RUNTIME, no metrics', () => {
    const r = runComplexMd({ candidateId: 'c1', ligandSmiles: 'CCO' }, capOff);
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(r.metrics, null);
    assert.equal(r.blockedStage, 'ligand_parameterisation');
  });

  test('mmgbsaRescore requires a completed MD trajectory (blocked otherwise), separate from docking', () => {
    const r = mmgbsaRescore({ mdResult: { status: 'BLOCKED_BY_RUNTIME' }, dockingScoreKcalMol: -6.1 });
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(r.bindingFreeEnergyKcalMol, null);
    assert.equal(r.dockingScoreKcalMol, -6.1); // docking score preserved, never conflated with ΔG
  });
});

describe('molecularDynamics — campaign stage', () => {
  test('runMdStage runs only on top-N docked candidates and blocks honestly', () => {
    const docked = [
      { candidateId: 'a', canonicalSmiles: 'CCO', docking: { bestAffinityKcalMol: -5 } },
      { candidateId: 'b', canonicalSmiles: 'CCC', docking: { bestAffinityKcalMol: -6 } },
      { candidateId: 'c', canonicalSmiles: 'CCN', docking: { bestAffinityKcalMol: -4 } },
    ];
    const s = runMdStage(docked, { topN: 2, capability: capOff });
    assert.equal(s.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(s.candidatesConsidered, 2);
    assert.ok(s.results.every((r) => r.md.status === 'BLOCKED_BY_RUNTIME' && r.mmgbsa.status === 'BLOCKED_BY_RUNTIME'));
    assert.equal(s.results[0].mmgbsa.dockingScoreKcalMol, -5);
  });
});

// Guarded: the real runtime probe reports BLOCKED here (OpenMM present, ligand FF absent).
describe('molecularDynamics — REAL runtime capability probe', () => {
  test('real detectMdCapability reflects the actual runtime (no fabrication)', () => {
    const cap = detectMdCapability();
    assert.ok(typeof cap.canRunComplexMd === 'boolean');
    if (!cap.canRunComplexMd) assert.ok(typeof cap.reason === 'string' && cap.reason.length > 0);
  });
});
