import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createAgentComposer,
  composeCampaignStep,
  ACTUAL_CONTRACT_VERSIONS,
  EXPECTED_CONTRACT_VERSIONS,
  type AgentComposerPorts,
} from '../core/agent/agentBridge';
import { assessNovelty, NOVELTY_GATE_CONTRACT_VERSION } from '../core/agent/noveltyGate';
import { buildPredictionMatrix, experimentGaps, assessObservable } from '../core/agent/differentiatingExperimentGenerator';
import { runSelfFalsificationBattery } from '../core/agent/selfFalsificationBattery';
import { hypothesisLoopNextAction } from '../core/agent/nextAction';

const SRC = resolve(__dirname, '..');

function realPorts(): AgentComposerPorts {
  return {
    assessNovelty,
    runSelfFalsificationBattery,
    buildPredictionMatrix,
    experimentGaps,
    assessObservable,
    hypothesisLoopNextAction,
  };
}

describe('agentBridge — composer over the four canonical agent modules', () => {
  it('composes from the REAL exports, so the signatures are checked by the compiler', () => {
    const composer = createAgentComposer(realPorts());
    expect(composer.contractVersions).toEqual(EXPECTED_CONTRACT_VERSIONS);
  });

  it('every module still reports the contract version this composer was written against', () => {
    expect(ACTUAL_CONTRACT_VERSIONS).toEqual(EXPECTED_CONTRACT_VERSIONS);
    expect(NOVELTY_GATE_CONTRACT_VERSION).toBe('1.0.0');
  });

  it('a moved contract version fails closed instead of being used silently', () => {
    expect(() =>
      createAgentComposer(realPorts(), { ...ACTUAL_CONTRACT_VERSIONS, noveltyGate: '0.9.0' }),
    ).toThrow(/CONTRACT_VERSION_MISMATCH/);
  });

  it('a missing port fails closed rather than becoming a skipped step', () => {
    const ports = realPorts() as unknown as Record<string, unknown>;
    delete ports.assessNovelty;
    expect(() => createAgentComposer(ports as unknown as AgentComposerPorts)).toThrow(/AGENT_MODULE_MISSING/);
  });

  it('differentiate returns the real matrix and its real gaps', () => {
    const composer = createAgentComposer(realPorts());
    const out = composer.differentiate(
      [
        { hypothesisId: 'h1', predictions: { o1: 1.0 } },
        { hypothesisId: 'h2', predictions: { o1: 5.0 } },
        { hypothesisId: 'h3', predictions: { o1: null } },
      ],
      [{ observableId: 'o1', quantity: 'q', unit: 'u', instrumentClass: 'i', available: true, sigma: 1 }],
    );
    // 3 hypotheses x 1 observable = 3 entries; h3 predicted nothing, so it is
    // a reported EXPERIMENT_GAP rather than a silently dropped row.
    expect(out.matrix).toHaveLength(3);
    expect(out.gaps).toEqual([{ hypothesisId: 'h3', observableId: 'o1' }]);
    // h1 and h2 are 4 sigma apart, so this observable really does separate them
    expect(composer.assessObservable(out.matrix, 'o1', 1).discriminability).toBeCloseTo(4.0, 10);
  });

  it('composeCampaignStep calls every one of the four modules, none optional', () => {
    const called: string[] = [];
    const composer = createAgentComposer({
      assessNovelty: ((() => { called.push('novelty'); return { level: 'UNKNOWN' } as never; })) as never,
      runSelfFalsificationBattery: ((() => { called.push('falsify'); return {}; })) as never,
      buildPredictionMatrix: ((() => { called.push('matrix'); return [] as never; })) as never,
      experimentGaps: ((() => { called.push('gaps'); return [] as never; })) as never,
      assessObservable: ((() => ({})) as never),
      hypothesisLoopNextAction: ((() => { called.push('next'); return {} as never; })) as never,
    });
    composeCampaignStep(composer, {
      noveltyInput: {} as never,
      falsificationInput: {} as never,
      hypotheses: [],
      observables: [],
      loopState: {} as never,
    });
    expect(called).toEqual(['novelty', 'falsify', 'matrix', 'gaps', 'next']);
  });
});

describe('import direction — the cycle the reviewed bridge would have closed', () => {
  it('core/agent imports experimentFabric, and experimentFabric does NOT import core/agent', () => {
    // nextAction.ts already imports hypothesisLoop, so the dependency runs
    // agent -> experimentFabric. Had the proposed wireAgentIntoLoop landed,
    // hypothesisLoop would call back into agent and close the cycle.
    const nextAction = readFileSync(resolve(SRC, 'core/agent/nextAction.ts'), 'utf8');
    expect(nextAction).toMatch(/from '\.\.\/experimentFabric\/hypothesisLoop'/);

    const loop = readFileSync(resolve(SRC, 'core/experimentFabric/hypothesisLoop.ts'), 'utf8');
    const importsAgent = /from '\.\.\/agent\//.test(loop);
    expect(importsAgent).toBe(false);
  });

  it('hypothesisLoop still owns its anti-HARK machinery — the composer did not move it', () => {
    const loop = readFileSync(resolve(SRC, 'core/experimentFabric/hypothesisLoop.ts'), 'utf8');
    expect(loop).toMatch(/export function verifyAntiHarkingAnchor/);
    expect(loop).toMatch(/export function verifyPreregistrationIntact/);
  });

  it('agentBridge installs no callbacks into the loop', () => {
    const bridge = readFileSync(resolve(SRC, 'core/agent/agentBridge.ts'), 'utf8');
    for (const forbidden of ['wireAgentIntoLoop', 'onCandidate', 'onHypothesis', 'onReplication']) {
      expect(bridge.includes(`${forbidden}(`)).toBe(false);
    }
  });
});
