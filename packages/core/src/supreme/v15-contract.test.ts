import { describe, expect, it } from 'vitest';
import { GenesisSentinelOpsAgent } from './GenesisSentinelOpsAgent.js';
import { GenesisCinematicMatrixRenderer } from '../../../ui/src/render/GenesisCinematicMatrixRenderer.js';
import { GenesisCosmicTimeMachineEngine } from './GenesisCosmicTimeMachineEngine.js';

const clock = { t: 1700000000, now() { return this.t; } };

describe('Genesis Omni-Core V15 contracts', () => {
  it('sentinel creates and verifies a chained SHA-256 overlay ledger', () => {
    const agent = new GenesisSentinelOpsAgent(clock, 7);
    agent.addRule({ metricId: 'latency', min: 0, max: 100 });
    const anomalies = agent.ingestTelemetry([{ frameId: 'f1', t: 1, metricId: 'latency', value: 150 }]);
    expect(anomalies).toHaveLength(1);
    expect(agent.patchedTelemetry([{ frameId: 'f1', t: 1, metricId: 'latency', value: 150 }])[0].value).toBe(100);
    expect(agent.verifyLedger()).toEqual({ ok: true, errors: [] });
    expect(agent.disclaimer()).toContain('Synthetic ops model');
  });

  it('matrix renderer is deterministic and chains frames', () => {
    const a = new GenesisCinematicMatrixRenderer(clock, 42);
    const b = new GenesisCinematicMatrixRenderer(clock, 42);
    expect(a.renderFrame(3)).toEqual(b.renderFrame(3));
    const sequence = a.renderSequence(0, 3);
    expect(sequence).toHaveLength(3);
    expect(sequence[0].chainHash).not.toBe(sequence[1].chainHash);
    expect(sequence[0].dataLabel).toBe('SYNTHETIC_CINEMATIC');
  });

  it('cosmic engine preserves Honest Mode claim and fiction disclaimer', () => {
    const engine = new GenesisCosmicTimeMachineEngine(clock, 11);
    const pkg = engine.launchTimeMachine({ targetDateIso: '2029-01-01', destination: 'NIBIRU_PRIME', timeDilationFactor: 0, darkMatterIndex: 0.2 });
    expect(pkg.skybox.claimStatus).toBe('UNSUBSTANTIATED_CLAIM');
    expect(pkg.tiktokScript.at(-1)).toContain('DISCLAIMER');
    expect(pkg.dataLabel).toBe('SYNTHETIC_CINEMATIC');
    expect(() => engine.launchTimeMachine({ targetDateIso: 'bad', destination: 'NIBIRU_PRIME', timeDilationFactor: 0, darkMatterIndex: 0.2 })).toThrow('INVALID_DATE');
  });
});
