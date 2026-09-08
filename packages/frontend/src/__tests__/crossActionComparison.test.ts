import { describe, expect, it } from 'vitest';
import {
  compareWorldActions,
  CROSS_ACTION_CONTRACT_VERSION,
  type CrossActionComparison,
} from '../core/agent/crossActionComparison';
import { BASELINE_OPTION_ID } from '../core/worldModel/decision/decisionSupport';
import { GENESIS_FLOOD_CATALOG, type WorldLeverCatalog } from '../core/agent/worldGoalIntent';

/**
 * CROSS-ACTION COMPARISON ON THE REAL FLOOD CITY.
 *
 * Every number here comes from the real solver: each action is forked from the
 * same control and advanced with the same updater. Nothing is hard-coded — the
 * assertions state the RELATIONSHIPS the model must produce (this action helps,
 * that one does not, doing nothing sits between them), never the magnitudes,
 * so the tests keep their meaning if the solver is recalibrated.
 */

const GOAL = 'Reduce peak flood depth using the available interventions.';
const compare = (goal: string, catalog: WorldLeverCatalog = GENESIS_FLOOD_CATALOG, horizonTick?: number) =>
  compareWorldActions({ goal, catalog, horizonTick });

const row = (result: CrossActionComparison, id: string) => result.ranking.find((r) => r.actionId === id);

describe('A. Multiple real actions are compared against one control', () => {
  const result = compare(GOAL);

  it('runs every declared lever plus doing nothing', () => {
    expect(result.contractVersion).toBe(CROSS_ACTION_CONTRACT_VERSION);
    expect(result.status).toBe('RANKED');
    // Three declared levers in this world, and the control.
    expect(result.ranking).toHaveLength(GENESIS_FLOOD_CATALOG.levers.length + 1);
    for (const lever of GENESIS_FLOOD_CATALOG.levers) expect(row(result, lever.leverId)).toBeDefined();
  });

  it('B. always includes "do nothing" as a ranked control', () => {
    const control = row(result, BASELINE_OPTION_ID)!;
    expect(control).toBeDefined();
    expect(control.absoluteDelta).toBe(0);
    expect(control.interventionMetric).toBe(result.baselineMetric);
    expect(control.explanation).toMatch(/The control/);
  });

  it('J. measures every action against the SAME baseline value', () => {
    for (const evidence of result.ranking) expect(evidence.baselineMetric).toBe(result.baselineMetric);
    expect(result.baselineMetric).toBeGreaterThan(0);
  });

  it('K. gives every candidate its own branch forked from the same control', () => {
    const branchIds = result.ranking.map((r) => r.branchId);
    expect(new Set(branchIds).size).toBe(branchIds.length);
    for (const outcome of result.decision!.outcomes) {
      expect(outcome.sharedHistoryUpToTick).toBe(GENESIS_FLOOD_CATALOG.decisionAtTick);
    }
  });

  it('L. leaks no mutation between arms — each footprint is only its own lever', () => {
    for (const outcome of result.decision!.outcomes) {
      // A lever that reached beyond its own mechanism would show extra entities here.
      expect(outcome.interventionFootprint.length).toBeLessThanOrEqual(1);
    }
    // And re-running gives identical numbers, which a leaked mutation would break.
    const again = compare(GOAL);
    expect(again.ranking.map((r) => [r.actionId, r.absoluteDelta]))
      .toEqual(result.ranking.map((r) => [r.actionId, r.absoluteDelta]));
  });

  it('M. reports real numerical deltas with honest relative percentages', () => {
    for (const evidence of result.ranking) {
      if (evidence.actionId === BASELINE_OPTION_ID) {
        expect(evidence.relativeDeltaStatus).toBe('NOT_APPLICABLE');
        continue;
      }
      expect(evidence.interventionMetric).not.toBeNull();
      expect(evidence.absoluteDelta).toBeCloseTo(evidence.interventionMetric! - result.baselineMetric!, 12);
      if (evidence.relativeDeltaStatus === 'AVAILABLE') {
        expect(evidence.relativeDeltaPercent)
          .toBeCloseTo((evidence.absoluteDelta! / result.baselineMetric!) * 100, 9);
      } else {
        expect(evidence.relativeDeltaPercent).toBeNull();
      }
    }
  });
});

describe('C. Ranking follows the declared objective direction', () => {
  const result = compare(GOAL);

  it('orders by real effect, strongest reduction first', () => {
    // Minimising: values ascend down the ranking.
    for (let i = 1; i < result.ranking.length; i++) {
      expect(result.ranking[i].interventionMetric!).toBeGreaterThanOrEqual(result.ranking[i - 1].interventionMetric!);
    }
    const best = result.ranking[0];
    expect(result.bestActionIds).toEqual([best.actionId]);
    expect(best.directionVerdict).toBe('IMPROVED');
    expect(best.explanation).toMatch(/strongest modelled change/);
  });

  it('places an action that helps above doing nothing, and one that hurts below it', () => {
    const controlRank = row(result, BASELINE_OPTION_ID)!.rank!;
    for (const evidence of result.ranking) {
      if (evidence.directionVerdict === 'IMPROVED') expect(evidence.rank!).toBeLessThan(controlRank);
      if (evidence.directionVerdict === 'WORSENED') expect(evidence.rank!).toBeGreaterThan(controlRank);
    }
    // This world really contains all three kinds, so the assertion is exercised.
    const verdicts = new Set(result.ranking.map((r) => r.directionVerdict));
    expect(verdicts.has('IMPROVED')).toBe(true);
  });

  it('D. reverses the order when the objective direction reverses', () => {
    const maximised = compare('Increase peak flood depth using the available interventions.');
    expect(maximised.status).toBe('RANKED');
    expect(maximised.objective!.direction).toBe('maximize');
    // The action that best reduces depth must be last when the goal is to raise it.
    const bestReducer = result.ranking[0].actionId;
    expect(maximised.ranking[maximised.ranking.length - 1].actionId).toBe(bestReducer);
    expect(maximised.bestActionIds).not.toEqual(result.bestActionIds);
  });
});

describe('E. Ties are preserved, never broken', () => {
  it('gives equal rank to actions the model cannot tell apart', () => {
    // At a short horizon the water never reaches the outlet sill, so the outlet
    // lever and doing nothing end identical — a real tie in this world.
    const result = compare('Reduce peak flood depth by outlet.', GENESIS_FLOOD_CATALOG, 24);
    const tied = result.ranking.filter((r) => r.interventionMetric === result.baselineMetric);
    expect(tied.length).toBeGreaterThan(1);
    expect(new Set(tied.map((r) => r.rank)).size).toBe(1);
    expect(result.status).toBe('TIED');
    expect(result.bestActionIds.length).toBeGreaterThan(1);
    expect(result.bestActionIds).toContain(BASELINE_OPTION_ID);
  });
});

describe('F/G/H. Refusals keep the semantics the single-hypothesis path already had', () => {
  it('F. refuses an unsupported metric and names the metrics this world computes', () => {
    const result = compare('Reduce the number of insurance claims using the available interventions.');
    expect(result.status).toBe('REFUSED');
    expect(result.refusalReason).toMatch(/maxDepthM/);
    expect(result.ranking).toEqual([]);
    expect(result.bestActionIds).toEqual([]);
  });

  it('G. refuses an ambiguous objective direction rather than assuming one', () => {
    const result = compare('Peak flood depth using the available interventions.');
    expect(result.status).toBe('REFUSED');
    expect(result.refusalReason).toMatch(/reduced or increased/);
    expect(result.intent!.unresolved).toContain('DIRECTION');
  });

  it('H. reports an unsupported mechanism as a NOT_MODELLED candidate, not a silent omission', () => {
    const result = compare('Reduce peak flood depth by relocating residents.');
    const missing = result.candidates.find((c) => c.availability === 'NOT_MODELLED');
    expect(missing).toBeDefined();
    expect(missing!.label).toMatch(/relocating residents/);
    expect(result.notModelledFactors.join(' ')).toMatch(/Named in the goal but not modelled/);
  });

  it('NOT_MODELLED when the world declares no lever at all', () => {
    const empty: WorldLeverCatalog = { ...GENESIS_FLOOD_CATALOG, levers: [] };
    const result = compare('Reduce peak flood depth.', empty);
    expect(result.status).toBe('NOT_MODELLED');
    expect(result.refusalReason).toMatch(/declares no action/);
    expect(result.bestActionIds).toEqual([]);
  });
});

describe('I. NOT_RANKABLE is never turned into a winner', () => {
  it('refuses to rank when the objective is an entity this world does not carry', () => {
    const broken: WorldLeverCatalog = {
      ...GENESIS_FLOOD_CATALOG,
      entityIdForMetric: { ...GENESIS_FLOOD_CATALOG.entityIdForMetric, maxDepthM: 'entity:does-not-exist' },
    };
    const result = compare('Reduce peak flood depth.', broken);
    expect(result.status).toBe('NOT_RANKABLE');
    expect(result.ranking).toEqual([]);
    expect(result.bestActionIds).toEqual([]);
    expect(result.refusalReason).toBeTruthy();
  });
});

describe('The result is honest about what it is', () => {
  const result = compare(GOAL);

  it('carries the unmodelled factors and the not-a-recommendation statement', () => {
    expect(result.notModelledFactors.join(' ')).toMatch(/cost/i);
    expect(result.disclaimer).toMatch(/not a recommendation/);
    expect(result.disclaimer).toMatch(/cost, build time, legality, maintenance, equity/);
  });

  it('explains every ranked action from its own numbers', () => {
    for (const evidence of result.ranking) expect(evidence.explanation.length).toBeGreaterThan(20);
    const worsened = result.ranking.find((r) => r.directionVerdict === 'WORSENED');
    if (worsened) expect(worsened.explanation).toMatch(/wrong way/);
  });

  it('keeps the full decision report so nothing is lost behind the projection', () => {
    expect(result.decision).not.toBeNull();
    expect(result.decision!.outcomes.length).toBe(GENESIS_FLOOD_CATALOG.levers.length);
    expect(result.decision!.objectiveGrounding).toBe('PROCEDURAL_APPROXIMATION');
  });

  it('stays domain-generic: the engine depends on no world-specific module', async () => {
    // Checked by DEPENDENCY rather than by word, because prose may legitimately
    // mention a world as an example while the code stays generic. What must never
    // appear is an import of a specific world or its catalogue — that is what
    // would make the engine flood-shaped.
    const source = await import('../core/agent/crossActionComparison?raw');
    const text = String((source as { default: string }).default);
    const imports = text.split('\n').filter((line) => line.trimStart().startsWith('import') || /^\s*}\s*from/.test(line));
    const importText = imports.join('\n');
    expect(importText).not.toMatch(/genesisScientificCity3|GENESIS_FLOOD_CATALOG|domains\//);
    // And no flood-specific identifier is used anywhere in the executable code.
    for (const identifier of ['maxDepthM', 'floodplain:', 'infiltrationRateMPerS', 'outletWidthM', 'volumetricFlow']) {
      expect(text).not.toContain(identifier);
    }
  });
});

describe('"the available interventions" means the catalogue, not an unmodelled mechanism', () => {
  it('treats a quantifier over the catalogue as a request for every declared lever', () => {
    const result = compare('Reduce peak flood depth using the available interventions.');
    // It must not appear as a gap: the sentence asks for exactly what the world declares.
    expect(result.candidates.filter((c) => c.availability === 'NOT_MODELLED')).toEqual([]);
    expect(result.notModelledFactors.join(' ')).not.toMatch(/available interventions/);
    // And every declared lever really competed.
    expect(result.ranking.length).toBe(GENESIS_FLOOD_CATALOG.levers.length + 1);
  });

  it('still reports a genuinely named unmodelled mechanism alongside a catalogue quantifier', () => {
    const result = compare('Reduce peak flood depth using the available interventions or by relocating residents.');
    const missing = result.candidates.filter((c) => c.availability === 'NOT_MODELLED');
    expect(missing).toHaveLength(1);
    expect(missing[0].label).toMatch(/relocating residents/);
  });
});
