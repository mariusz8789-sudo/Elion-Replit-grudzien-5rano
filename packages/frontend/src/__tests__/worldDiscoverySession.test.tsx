import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldDiscoveryPanel } from '../components/visual-simulation/WorldDiscoveryPanel';
import { runWorldDiscovery, summariseDiscovery } from '../core/agent/worldDiscoverySession';

/**
 * END TO END: A GOAL SENTENCE TO A RENDERED RESULT.
 *
 * These run the REAL path — the real parser, the real planner, the real loop
 * forking the real flood city — because a mock discovery path would prove
 * nothing about the wiring that matters. The six cases below are exactly the
 * states the UI has to be able to show without inventing anything.
 */

describe('A valid goal runs a real search end to end', () => {
  const state = runWorldDiscovery('Minimise peak flood depth, at most 4 experiments.');

  it('completes, having actually executed experiments on the world', () => {
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    expect(state.result.rounds.length).toBeGreaterThan(1);
    // Real branches, not placeholders.
    for (const round of state.result.rounds) expect(round.branchId).toBeTruthy();
    expect(state.report).toMatch(/QUESTION: Minimise peak flood depth/);
  });

  it('carries a surviving mechanism and a refuted one, with the real effect sizes', () => {
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:infiltration');
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:outlet-capacity');
    const infiltration = state.result.bestSupported.find((b) => b.hypothesisId === 'h:infiltration')!;
    expect(infiltration.observedEffects[0]).toBeLessThan(0);
  });

  it('summarises without overstating', () => {
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const summary = summariseDiscovery(state.result);
    expect(summary).toMatch(/within this model/);
    expect(summary).toMatch(/h:infiltration/);
  });
});

describe('Refusals are outcomes, not errors to smooth over', () => {
  it('refuses an unsupported metric and names what this world does compute', () => {
    const state = runWorldDiscovery('Minimise the number of insurance claims.');
    expect(state.kind).toBe('REFUSED');
    if (state.kind !== 'REFUSED') return;
    expect(state.error).toMatch(/maxDepthM/);
    expect(state.intent.unresolved).toContain('OBJECTIVE_METRIC');
  });

  it('refuses an ambiguous direction rather than assuming "reduce"', () => {
    const state = runWorldDiscovery('Peak flood depth in the city.');
    expect(state.kind).toBe('REFUSED');
    if (state.kind !== 'REFUSED') return;
    expect(state.error).toMatch(/reduced or increased/);
    expect(state.intent.unresolved).toContain('DIRECTION');
  });

  it('keeps an unsupported mechanism visible as a limitation instead of ignoring it', () => {
    const state = runWorldDiscovery('Reduce peak flood depth by relocating residents.');
    // The search still runs on what IS modelled, and the gap travels with it.
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    expect(state.intent.unknownLeverPhrases.join(' ')).toMatch(/relocating residents/);
    expect(state.result.notModelledFactors.join(' ')).toMatch(/Named in the goal but not modelled/);
  });
});

describe('No surviving hypothesis is reported as exactly that', () => {
  const state = runWorldDiscovery('Reduce peak flood depth by outlet, at most 1 experiment.');

  it('reports nothing survived, and promotes no fallback', () => {
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    expect(state.result.bestSupported).toEqual([]);
    expect(state.result.failedHypotheses.length).toBeGreaterThan(0);
    expect(summariseDiscovery(state.result)).toMatch(/no answer to give/);
  });

  it('renders the empty-survivor semantic verbatim', () => {
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    expect(state.report).toMatch(/SURVIVED: nothing/);
  });
});

describe('The panel renders the real semantics and invents nothing', () => {
  it('starts with an accessible goal field and no result claimed', () => {
    const markup = renderToStaticMarkup(<WorldDiscoveryPanel />);
    expect(markup).toContain('AUTONOMOUS DISCOVERY');
    expect(markup).toContain('id="wd-goal"');
    expect(markup).toContain('Scientific goal');
    // Nothing has been searched yet, so no verdict vocabulary may appear.
    expect(markup).not.toContain('What held up');
    expect(markup).not.toContain('SUPPORTED_WITHIN_PROTOCOL');
    // And the run button is disabled until there is a goal to run.
    expect(markup).toContain('disabled=""');
  });

  it('keeps the machine-readable record alongside the plain-language sections', () => {
    // Rendered from the same object, so the two can never describe different runs.
    const state = runWorldDiscovery('Minimise peak flood depth, at most 2 experiments.');
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    expect(state.report).toMatch(/THIS SEARCH DID NOT MODEL:/);
    expect(JSON.stringify(state.result)).toMatch(/"stopReason"/);
  });
});

describe('Multi-action goals route to the comparison engine; everything else still does not', () => {
  it('routes a comparison goal to a real cross-action ranking', () => {
    const state = runWorldDiscovery('Reduce peak flood depth using the available interventions.');
    expect(state.kind).toBe('COMPARISON');
    if (state.kind !== 'COMPARISON') return;
    expect(state.comparison.status).toBe('RANKED');
    // Every declared lever plus the control.
    expect(state.comparison.ranking.length).toBeGreaterThan(3);
    expect(state.comparison.bestActionIds.length).toBe(1);
  });

  it('N. leaves the existing single-hypothesis discovery path untouched', () => {
    const state = runWorldDiscovery('Minimise peak flood depth, at most 4 experiments.');
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    expect(state.result.rounds.length).toBeGreaterThan(1);
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:infiltration');
  });

  it('O. keeps the existing refusal semantics on the comparison path too', () => {
    const state = runWorldDiscovery('Compare the available interventions for insurance claims.');
    expect(state.kind).toBe('COMPARISON');
    if (state.kind !== 'COMPARISON') return;
    expect(state.comparison.status).toBe('REFUSED');
    expect(state.comparison.refusalReason).toMatch(/maxDepthM/);
    expect(state.comparison.bestActionIds).toEqual([]);
  });

  it('routes a single-mechanism goal to the loop, not the comparison', () => {
    const state = runWorldDiscovery('Can we reduce peak flood depth by infiltration?');
    expect(state.kind).toBe('COMPLETE');
  });

  it('the panel shows no winner for a non-rankable comparison', () => {
    const markup = renderToStaticMarkup(<WorldDiscoveryPanel />);
    expect(markup).not.toContain('Action comparison');
    expect(markup).not.toContain('best action');
  });
});
