import { describe, expect, it } from 'vitest';
import { resolveDiscoveryStage, stageIndex, DISCOVERY_STAGES } from '../core/scienceChat/discoveryStage';

describe('Science Chat discovery stage — derived from real conversation state', () => {
  it('an empty conversation stays at Question — no fake progress', () => {
    expect(resolveDiscoveryStage([])).toBe('question');
    expect(resolveDiscoveryStage([{ role: 'genesis', tag: 'SYSTEM' }])).toBe('question');
  });

  it('a user turn alone never advances the stage', () => {
    expect(resolveDiscoveryStage([{ role: 'user' }, { role: 'user' }])).toBe('question');
  });

  it('PROPOSE_EXPERIMENT lifts the process to Hypothesis', () => {
    expect(resolveDiscoveryStage([{ role: 'genesis', intent: 'PROPOSE_EXPERIMENT' }])).toBe('hypothesis');
  });

  it('a plan awaiting confirmation means we are at Experiment', () => {
    expect(resolveDiscoveryStage([], { hasPendingPlan: true })).toBe('experiment');
  });

  it('an open live simulation reaches Simulation', () => {
    expect(resolveDiscoveryStage([], { hasLiveSimulation: true })).toBe('simulation');
  });

  it('a real result (WYNIK) reaches Analysis', () => {
    expect(resolveDiscoveryStage([{ role: 'genesis', tag: 'WYNIK' }])).toBe('analysis');
  });

  it('a confirmed capsule is the only thing that reaches Discovery', () => {
    expect(resolveDiscoveryStage([{ role: 'genesis', tag: 'WYNIK' }])).not.toBe('discovery');
    expect(resolveDiscoveryStage([], { hasConfirmedCapsule: true })).toBe('discovery');
  });

  it('keeps the furthest stage reached — asking a new question does not undo a finished run', () => {
    const signals = [
      { role: 'genesis' as const, tag: 'WYNIK' as const },   // analysis
      { role: 'user' as const },
      { role: 'genesis' as const, tag: 'SYSTEM' as const },  // would be "question"
    ];
    expect(resolveDiscoveryStage(signals)).toBe('analysis');
  });

  it('stage order matches the brief and stageIndex is monotonic', () => {
    expect([...DISCOVERY_STAGES]).toEqual(['question', 'hypothesis', 'experiment', 'simulation', 'analysis', 'discovery']);
    for (let i = 1; i < DISCOVERY_STAGES.length; i++) {
      expect(stageIndex(DISCOVERY_STAGES[i])).toBeGreaterThan(stageIndex(DISCOVERY_STAGES[i - 1]));
    }
  });
});
