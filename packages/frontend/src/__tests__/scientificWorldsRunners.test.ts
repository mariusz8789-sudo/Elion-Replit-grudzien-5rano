import { describe, expect, it } from 'vitest';
import { MaterialsDiscoveryEngine } from '@genesis/core/cern/MaterialsDiscoveryEngine.js';
import { createLabExperimentRunner, epidemicParamsFrom, type CrystalArtifact, type EpidemicArtifact } from '../core/scientificWorlds/experimentRunners';
import { createExperimentSession, replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { ION_PRESETS } from '../core/scientificWorlds/ionPresets';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import { DEFAULT_EPIDEMIC } from '../core/epidemic/sir';

/**
 * The runners are the only way a session touches an engine, and they go
 * through the single kernel's providers. Each result carries the engine's
 * label, an explicit epistemic status and a ledger anchor that really exists
 * in the kernel ledger.
 */
const runner = createLabExperimentRunner('lab-runner-test', kernelLedger);

describe('lab experiment runners — real engines through the kernel', () => {
  it('crystal-synthesis: the same structure the engine gives directly, anchored, labelled as a model estimate, replay MATCH', () => {
    const { session, artifact } = createExperimentSession({ worldId: 'lab-runner-test', stationId: 'st-synthesizer', experimentId: 'crystal-synthesis', seed: 21, inputs: { composition: 'SrTiO3' }, logicalTime: 1 }, runner);
    const direct = new MaterialsDiscoveryEngine(21).synthesize(ION_PRESETS.SrTiO3);
    expect(session.outputs.structureHash).toBe(direct.structureHash);
    expect(session.outputs.lattice).toBe('perovskite');
    expect(session.epistemicStatus).toBe('MODEL');
    expect(session.engineLabel).toBe('EMPIRICAL_ESTIMATE_MODEL');
    expect(kernelLedger.getEntries().some((e) => e.contentHash === session.evidenceHashes[0])).toBe(true);
    const a = artifact as CrystalArtifact;
    expect(a.kind).toBe('crystal');
    expect(a.sites.length).toBe(direct.sites.length);
    expect(replayExperimentSession(session, runner).status).toBe('MATCH');
  });
  it('collision-batch and micro-blackhole: labelled toy MC / speculative, anchored', () => {
    const c = createExperimentSession({ worldId: 'lab-runner-test', experimentId: 'collision-batch', seed: 3, inputs: { batch: 3 }, logicalTime: 2 }, runner);
    expect(c.session.outputs.events).toBe(3);
    expect(c.session.engineLabel).toBe('TOY_MC_MODEL');
    expect(c.session.epistemicStatus).toBe('SIMULATION');
    expect(c.artifact.kind).toBe('collision');
    const miss = createExperimentSession({ worldId: 'lab-runner-test', experimentId: 'micro-blackhole', seed: 1, inputs: { sqrtSGeV: 13000 }, logicalTime: 3 }, runner);
    expect(miss.session.outputs.formed).toBe(false);
    expect(miss.session.epistemicStatus).toBe('MODEL');
    const add = createExperimentSession({ worldId: 'lab-runner-test', experimentId: 'micro-blackhole', seed: 1, inputs: { sqrtSGeV: 14000, addThresholdTeV: 5 }, logicalTime: 4 }, runner);
    expect(add.session.outputs.formed).toBe(true);
    expect(add.session.epistemicStatus).toBe('SPECULATIVE');
    expect(add.session.engineLabel).toBe('speculative');
  });
  it('seir-epidemic: multipliers act on tabulated defaults; twice the transmission gives an earlier, higher peak; deterministic replay', () => {
    const base = createExperimentSession({ worldId: 'lab-runner-test', experimentId: 'seir-epidemic', seed: 5, inputs: {}, logicalTime: 5 }, runner);
    const twice = createExperimentSession({ worldId: 'lab-runner-test', experimentId: 'seir-epidemic', seed: 5, inputs: { transmissionMultiplier: 2, hospitalCapacityMultiplier: 0.7 }, logicalTime: 6 }, runner);
    expect(base.session.outputs.r0).toBe(DEFAULT_EPIDEMIC.r0);
    expect(twice.session.outputs.r0).toBe(DEFAULT_EPIDEMIC.r0 * 2);
    expect(Number(twice.session.outputs.peakInfected)).toBeGreaterThan(Number(base.session.outputs.peakInfected));
    expect(Number(twice.session.outputs.peakDay)).toBeLessThan(Number(base.session.outputs.peakDay));
    expect(Number(twice.session.outputs.hospitalBeds)).toBeLessThan(Number(base.session.outputs.hospitalBeds));
    expect(twice.session.epistemicStatus).toBe('SIMULATION');
    expect(twice.session.engineLabel).toBe('SEIRD_RK4_MODEL');
    expect(kernelLedger.getEntries().some((e) => e.contentHash === twice.session.evidenceHashes[0])).toBe(true);
    const art = twice.artifact as EpidemicArtifact;
    expect(art.series.length).toBeGreaterThan(100);
    expect(replayExperimentSession(twice.session, runner).status).toBe('MATCH');
    expect(epidemicParamsFrom({ transmissionMultiplier: 0.5 }).r0).toBe(DEFAULT_EPIDEMIC.r0 * 0.5);
  });
  it('an unknown experiment or composition throws, so a session is never sealed around nothing', () => {
    expect(() => createExperimentSession({ worldId: 'w', experimentId: 'teleport', seed: 1, inputs: {}, logicalTime: 1 }, runner)).toThrow('unknown experiment');
    expect(() => createExperimentSession({ worldId: 'w', experimentId: 'crystal-synthesis', seed: 1, inputs: { composition: 'Unobtainium' }, logicalTime: 1 }, runner)).toThrow('unknown composition');
  });
});
