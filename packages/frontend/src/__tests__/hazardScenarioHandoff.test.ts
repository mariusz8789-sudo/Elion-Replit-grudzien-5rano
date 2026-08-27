import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearPendingHazardScenarios,
  consumePendingHazardScenario,
  registerPendingHazardScenario,
  setPendingHazardScenario,
} from '../core/experimentFabric/hazardScenarioHandoff';

const SPEC = { hazardType: 'earthquake' as const, magnitude: 6.1, depthKm: 15, epicenterX: 2, epicenterY: -1, seed: 7 };

describe('Hazard scenario handoff — ephemeral pointer, not a provenance registry', () => {
  beforeEach(() => clearPendingHazardScenarios());

  it('round-trips a registered scenario through set/consume', () => {
    registerPendingHazardScenario('run-1', SPEC);
    expect(setPendingHazardScenario('run-1')).toBe(true);
    const consumed = consumePendingHazardScenario();
    expect(consumed).toEqual({ runId: 'run-1', ...SPEC });
  });

  it('returns false when marking an unregistered runId as pending', () => {
    expect(setPendingHazardScenario('never-registered')).toBe(false);
  });

  it('returns null when nothing has been marked pending', () => {
    registerPendingHazardScenario('run-1', SPEC);
    expect(consumePendingHazardScenario()).toBeNull();
  });

  it('consumption is one-shot: a second consume call returns null', () => {
    registerPendingHazardScenario('run-1', SPEC);
    setPendingHazardScenario('run-1');
    expect(consumePendingHazardScenario()).not.toBeNull();
    expect(consumePendingHazardScenario()).toBeNull();
  });

  it('marking a second runId pending replaces the first, never merging both', () => {
    registerPendingHazardScenario('run-1', SPEC);
    registerPendingHazardScenario('run-2', { ...SPEC, magnitude: 7.7 });
    setPendingHazardScenario('run-1');
    setPendingHazardScenario('run-2');
    const consumed = consumePendingHazardScenario();
    expect(consumed?.runId).toBe('run-2');
    expect(consumed?.magnitude).toBe(7.7);
  });

  it('retains at most the newest 8 registered scenarios', () => {
    for (let i = 0; i < 10; i++) registerPendingHazardScenario(`run-${i}`, SPEC);
    expect(setPendingHazardScenario('run-0')).toBe(false);
    expect(setPendingHazardScenario('run-1')).toBe(false);
    expect(setPendingHazardScenario('run-9')).toBe(true);
  });

  it('clearPendingHazardScenarios removes every registered and pending scenario', () => {
    registerPendingHazardScenario('run-1', SPEC);
    setPendingHazardScenario('run-1');
    clearPendingHazardScenarios();
    expect(consumePendingHazardScenario()).toBeNull();
  });
});
