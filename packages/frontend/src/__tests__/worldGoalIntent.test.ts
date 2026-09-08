import { describe, expect, it } from 'vitest';
import { runAutonomousDiscovery } from '../core/agent/discoveryLoop';
import { renderDiscoveryReport } from '../core/agent/discoveryReport';
import {
  buildWorldDiscoveryPlan,
  GENESIS_FLOOD_CATALOG,
  parseWorldDiscoveryGoal,
} from '../core/agent/worldGoalIntent';

/**
 * ONE SENTENCE, ONE REAL SEARCH.
 *
 * The parser may only SELECT mechanisms the world genuinely has; it can never
 * create one. So the tests care most about the two refusals: a goal naming a
 * metric this world does not compute, and a goal naming a lever it cannot act
 * on.
 */

const parse = (text: string) => parseWorldDiscoveryGoal(text, GENESIS_FLOOD_CATALOG);
const plan = (text: string) => buildWorldDiscoveryPlan(parse(text), GENESIS_FLOOD_CATALOG);
const isError = (value: unknown): value is { error: string } =>
  typeof value === 'object' && value !== null && 'error' in value;

describe('A goal sentence is read into a real search', () => {
  it('reads the objective, the direction and the round budget', () => {
    const intent = parse('Minimise peak flood depth in the city, using at most 3 experiments.');
    expect(intent.objectiveMetric).toBe('maxDepthM');
    expect(intent.direction).toBe('minimize');
    expect(intent.maxRounds).toBe(3);
    expect(intent.unresolved).toEqual([]);
  });

  it('reads the same goal in Polish', () => {
    const intent = parse('Zmniejsz głębokość zalania, maksymalnie 2 rundy.');
    expect(intent.objectiveMetric).toBe('maxDepthM');
    expect(intent.direction).toBe('minimize');
    expect(intent.maxRounds).toBe(2);
  });

  it('searches every declared lever when the goal names none', () => {
    const intent = parse('Reduce peak flood depth.');
    expect(intent.requestedLeverIds).toEqual([]);
    const built = plan('Reduce peak flood depth.');
    expect(isError(built)).toBe(false);
    expect((built as { hypotheses: readonly unknown[] }).hypotheses).toHaveLength(GENESIS_FLOOD_CATALOG.levers.length);
  });

  it('narrows the search to the lever the goal actually asked about', () => {
    const intent = parse('Can we reduce peak flood depth by infiltration?');
    expect(intent.requestedLeverIds).toEqual(['lever:infiltration']);
    const built = plan('Can we reduce peak flood depth by infiltration?');
    expect((built as { hypotheses: readonly { hypothesisId: string }[] }).hypotheses.map((h) => h.hypothesisId))
      .toEqual(['h:infiltration']);
  });
});

describe('It refuses rather than searching something it cannot mean', () => {
  it('refuses a metric this world does not compute, and says what it does', () => {
    const intent = parse('Minimise the number of insurance claims.');
    expect(intent.objectiveMetric).toBeNull();
    expect(intent.unresolved).toContain('OBJECTIVE_METRIC');
    const built = plan('Minimise the number of insurance claims.');
    expect(isError(built)).toBe(true);
    expect((built as { error: string }).error).toMatch(/maxDepthM/);
  });

  it('refuses a goal that never says which way to move the objective', () => {
    const intent = parse('Peak flood depth in the city.');
    expect(intent.direction).toBeNull();
    expect(isError(plan('Peak flood depth in the city.'))).toBe(true);
  });

  it('names a lever the world cannot act on instead of silently ignoring it', () => {
    const intent = parse('Reduce peak flood depth by relocating residents.');
    expect(intent.unknownLeverPhrases.join(' ')).toMatch(/relocating residents/);
    expect(intent.unresolved).toContain('NAMED_LEVER_NOT_IN_WORLD');
    // The search still runs on what IS modelled, but the gap travels with it.
    const built = plan('Reduce peak flood depth by relocating residents.') as { notModelledFactors: readonly string[] };
    expect(built.notModelledFactors.join(' ')).toMatch(/Named in the goal but not modelled/);
  });
});

describe('A sentence really drives the loop, end to end', () => {
  const built = plan('Minimise peak flood depth, at most 4 experiments.') as Parameters<typeof runAutonomousDiscovery>[0];
  const result = runAutonomousDiscovery(built);

  it('runs the real search and finds the mechanism that works in this world', () => {
    expect(result.rounds.length).toBeGreaterThan(1);
    expect(result.bestSupported.map((b) => b.hypothesisId)).toContain('h:infiltration');
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:outlet-capacity');
  });

  it('reports the search in a form a person can read', () => {
    const report = renderDiscoveryReport(result);
    expect(report).toMatch(/QUESTION: Minimise peak flood depth/);
    expect(report).toMatch(/SURVIVED:/);
    expect(report).toMatch(/REFUTED:/);
    expect(report).toMatch(/STILL UNKNOWN:/);
    expect(report).toMatch(/h:pump-capacity/); // never tested — named, not hidden
    expect(report).toMatch(/THIS SEARCH DID NOT MODEL:/);
    expect(report).toMatch(/statement about this model, not about the world/);
  });

  it('never promotes a survivor that does not exist', () => {
    // A one-round budget on the outlet lever alone leaves nothing supported here.
    const narrow = plan('Reduce peak flood depth by outlet, at most 1 experiment.') as Parameters<typeof runAutonomousDiscovery>[0];
    const narrowResult = runAutonomousDiscovery(narrow);
    expect(narrowResult.bestSupported).toEqual([]);
    expect(renderDiscoveryReport(narrowResult)).toMatch(/SURVIVED: nothing/);
  });
});
