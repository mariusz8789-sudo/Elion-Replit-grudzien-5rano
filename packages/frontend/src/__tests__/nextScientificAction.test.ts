import { describe, expect, it } from 'vitest';
import { buildNextScientificAction, rankNextScientificActions, type NextScientificAction } from '../core/discovery/nextScientificAction';

function baseInput(overrides: Partial<Parameters<typeof buildNextScientificAction>[0]> = {}) {
  return {
    actionId: 'a1',
    question: 'q',
    targetHypothesisIds: ['h1'],
    requiredInputs: ['x'],
    availableInputs: ['x'],
    method: 'm',
    expectedDiscriminatingPower: 'MODERATE' as const,
    discriminatingPowerReasoning: 'r',
    constraints: [],
    expectedOutputs: [],
    successCriteria: 's',
    falsificationCriteria: 'f',
    availability: 'RUNNABLE_IN_GENESIS' as const,
    estimatedBurden: 'UNKNOWN' as const,
    burdenReasoning: 'b',
    ...overrides,
  };
}

describe('nextScientificAction — fail-closed construction', () => {
  it('computes missingInputs as required minus available, never independently declared', () => {
    const action = buildNextScientificAction(baseInput({ requiredInputs: ['x', 'y'], availableInputs: ['x'], availability: 'REQUIRES_EXTERNAL_DATA' }));
    expect(action.missingInputs).toEqual(['y']);
  });

  it('refuses RUNNABLE_IN_GENESIS when a required input is missing', () => {
    expect(() => buildNextScientificAction(baseInput({ requiredInputs: ['x', 'y'], availableInputs: ['x'], availability: 'RUNNABLE_IN_GENESIS' }))).toThrow(/missing required input/);
  });

  it('accepts RUNNABLE_IN_GENESIS when every required input is available', () => {
    const action = buildNextScientificAction(baseInput({ requiredInputs: ['x'], availableInputs: ['x', 'y'], availability: 'RUNNABLE_IN_GENESIS' }));
    expect(action.missingInputs).toEqual([]);
  });
});

describe('nextScientificAction — ranking', () => {
  it('ranks RUNNABLE_IN_GENESIS above any action requiring external work, regardless of discriminating power', () => {
    const runnable = buildNextScientificAction(baseInput({ actionId: 'runnable', availability: 'RUNNABLE_IN_GENESIS', expectedDiscriminatingPower: 'LOW' }));
    const external = buildNextScientificAction(baseInput({ actionId: 'external', requiredInputs: ['x', 'y'], availableInputs: ['x'], availability: 'REQUIRES_EXTERNAL_EXPERIMENT', expectedDiscriminatingPower: 'HIGH' }));
    const ranked = rankNextScientificActions([external, runnable]);
    expect(ranked[0]!.actionId).toBe('runnable');
    expect(ranked[1]!.actionId).toBe('external');
  });

  it('within the same availability tier, ranks HIGH discriminating power before LOW', () => {
    const low = buildNextScientificAction(baseInput({ actionId: 'low', availability: 'REQUIRES_EXTERNAL_DATA', requiredInputs: ['x', 'y'], availableInputs: ['x'], expectedDiscriminatingPower: 'LOW' }));
    const high = buildNextScientificAction(baseInput({ actionId: 'high', availability: 'REQUIRES_EXTERNAL_DATA', requiredInputs: ['x', 'y'], availableInputs: ['x'], expectedDiscriminatingPower: 'HIGH' }));
    const ranked = rankNextScientificActions([low, high]);
    expect(ranked[0]!.actionId).toBe('high');
    expect(ranked[1]!.actionId).toBe('low');
  });

  it('is a pure sort: does not mutate the input array', () => {
    const a = buildNextScientificAction(baseInput({ actionId: 'a' }));
    const b = buildNextScientificAction(baseInput({ actionId: 'b', availability: 'REQUIRES_EXTERNAL_EXPERIMENT', requiredInputs: ['x', 'y'], availableInputs: ['x'] }));
    const input: readonly NextScientificAction[] = [b, a];
    rankNextScientificActions(input);
    expect(input[0]!.actionId).toBe('b');
    expect(input[1]!.actionId).toBe('a');
  });
});
