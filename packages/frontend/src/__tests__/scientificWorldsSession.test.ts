import { describe, expect, it } from 'vitest';
import { createExperimentSession, replayExperimentSession, replayFingerprintOf, verifySessionIntegrity, type ExperimentRunner } from '../core/scientificWorlds/experimentSession';

/** A deterministic toy runner: the "engine" is a seeded LCG so the tests own the arithmetic. */
const runner: ExperimentRunner<{ series: number[] }> = (experimentId, seed, inputs) => {
  let s = seed >>> 0;
  const series: number[] = [];
  for (let i = 0; i < 5; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; series.push(s % 1000); }
  const n = Number(inputs.n ?? 1);
  return { outputs: { sum: series.reduce((a, b) => a + b, 0) * n, id: experimentId }, evidenceHashes: ['a'.repeat(64)], epistemicStatus: 'SIMULATION', engineLabel: 'TOY', steps: ['seed', 'lcg x5', 'sum'], artifact: { series } };
};

describe('ExperimentSession — one run owns inputs, outputs, evidence and replay', () => {
  it('seals a session with content hash and replay fingerprint; the artifact is the same run', () => {
    const { session, artifact } = createExperimentSession({ worldId: 'w', stationId: 'st', experimentId: 'toy', seed: 42, inputs: { n: 2 }, logicalTime: 10 }, runner);
    expect(session.sessionId).toMatch(/^ses-[0-9a-f]{16}$/);
    expect(session.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.replayFingerprint).toBe(replayFingerprintOf('toy', 42, { n: 2 }, session.outputs));
    expect(session.outputs.sum).toBe(artifact.series.reduce((a, b) => a + b, 0) * 2);
    expect(session.epistemicStatus).toBe('SIMULATION');
    expect(session.steps).toEqual(['seed', 'lcg x5', 'sum']);
    expect(verifySessionIntegrity(session)).toBe(true);
    expect(verifySessionIntegrity({ ...session, outputs: { ...session.outputs, sum: 1 } })).toBe(false);
  });
  it('same spec → identical session; a different seed or input → different fingerprint and id', () => {
    const a = createExperimentSession({ worldId: 'w', experimentId: 'toy', seed: 1, inputs: { n: 1 }, logicalTime: 0 }, runner).session;
    const b = createExperimentSession({ worldId: 'w', experimentId: 'toy', seed: 1, inputs: { n: 1 }, logicalTime: 0 }, runner).session;
    expect(a).toEqual(b);
    expect(createExperimentSession({ worldId: 'w', experimentId: 'toy', seed: 2, inputs: { n: 1 }, logicalTime: 0 }, runner).session.replayFingerprint).not.toBe(a.replayFingerprint);
    expect(createExperimentSession({ worldId: 'w', experimentId: 'toy', seed: 1, inputs: { n: 3 }, logicalTime: 0 }, runner).session.sessionId).not.toBe(a.sessionId);
  });
  it('replay reruns and reports MATCH only after comparing; a drifting engine is reported as DRIFT with the keys', () => {
    const { session } = createExperimentSession({ worldId: 'w', experimentId: 'toy', seed: 7, inputs: { n: 1 }, logicalTime: 0 }, runner);
    const ok = replayExperimentSession(session, runner);
    expect(ok.status).toBe('MATCH');
    expect(ok.rerunFingerprint).toBe(session.replayFingerprint);
    expect(ok.driftedKeys).toEqual([]);
    let calls = 0;
    const drifting: ExperimentRunner = (id, seed, inputs) => { const r = runner(id, seed, inputs); calls++; return { ...r, outputs: { ...r.outputs, sum: Number(r.outputs.sum) + calls } }; };
    const { session: s2 } = createExperimentSession({ worldId: 'w', experimentId: 'toy', seed: 7, inputs: { n: 1 }, logicalTime: 0 }, drifting);
    const bad = replayExperimentSession(s2, drifting);
    expect(bad.status).toBe('DRIFT');
    expect(bad.driftedKeys).toEqual(['sum']);
    expect(bad.message).toContain('real reproducibility failure');
  });
  it('refuses non-primitive outputs, unknown epistemic status and a bad seed', () => {
    const badOut: ExperimentRunner = () => ({ outputs: { x: [1, 2] as unknown as number }, evidenceHashes: [], epistemicStatus: 'MODEL', engineLabel: 'x', steps: [], artifact: null });
    expect(() => createExperimentSession({ worldId: 'w', experimentId: 't', seed: 1, inputs: {}, logicalTime: 0 }, badOut)).toThrow('must be a finite number');
    const badStatus: ExperimentRunner = () => ({ outputs: {}, evidenceHashes: [], epistemicStatus: 'PROVEN' as unknown as 'MODEL', engineLabel: 'x', steps: [], artifact: null });
    expect(() => createExperimentSession({ worldId: 'w', experimentId: 't', seed: 1, inputs: {}, logicalTime: 0 }, badStatus)).toThrow('unknown epistemic status');
    expect(() => createExperimentSession({ worldId: 'w', experimentId: 't', seed: -1, inputs: {}, logicalTime: 0 }, runner)).toThrow('seed');
  });
});
