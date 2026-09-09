import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CellCultureLabSim,
  CellLabScreen,
  deriveArmStats,
  TREATMENTS,
  type TreatmentId,
} from '../components/visual-simulation/CellLabScreen';
import { conclusionFor, nextExperimentFor } from '../components/visual-simulation/discoveryNarrative';
import type { PanelState } from '../components/visual-simulation/WorldDiscoveryPanel';
import type { DiscoveryLoopResult, HypothesisBelief } from '../core/agent/discoveryLoop';
import { CELL_CYCLE_DEFAULTS, CULTURE_STATE_CODE } from '../core/worldModel/domains/cellCycle';

/**
 * VIRTUAL CELL LAB — Control vs Treatment (C2 Master directive: flagship narrative, Demo Mode,
 * Real Experiment Interface scaffold, provenance badge).
 *
 * These exercise the REAL solver path (`rk4CellCycleStep`, via `CellCultureLabSim`) and the real
 * `PanelState` shape `WorldDiscoveryPanel` actually produces — a bug here would mean the on-screen
 * CONCLUSION/NEXT EXPERIMENT stopped being a real reading of a real Discovery Loop result.
 */

function runFor(sim: CellCultureLabSim, treatment: TreatmentId, dose: number, hours: number) {
  sim.init(800, 600);
  let stats = sim.getStats();
  let guard = 0;
  while ((stats.hoursElapsed ?? 0) < hours && guard < 5000) {
    sim.update(0.05, { treatment, dose });
    stats = sim.getStats();
    guard++;
  }
  return stats;
}

describe('CellCultureLabSim — real G1/S/G2M solver, not decoration', () => {
  it('exposes exactly the four real levers the Discovery Loop catalogue already declares', () => {
    expect(Object.keys(TREATMENTS).sort()).toEqual(
      ['cytotoxic', 'mitogen', 's-phase-inhibitor', 'vessel-capacity'].sort(),
    );
  });

  it('dose 0 leaves the treatment arm identical to control — no substance applied', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'mitogen', 0, 48);
    expect(stats.treatmentTotal).toBeCloseTo(stats.controlTotal, 6);
  });

  it('mitogen at full dose (shorter G1) grows the treatment arm faster than control', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'mitogen', 1, 96);
    expect(stats.treatmentTotal).toBeGreaterThan(stats.controlTotal);
  });

  it('s-phase inhibitor at full dose (longer S) grows the treatment arm slower than control', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 's-phase-inhibitor', 1, 96);
    expect(stats.treatmentTotal).toBeLessThan(stats.controlTotal);
  });

  it('cytotoxic agent at full dose reduces growth and accumulates real, non-zero deaths', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'cytotoxic', 1, 96);
    expect(stats.treatmentTotal).toBeLessThan(stats.controlTotal);
    expect(stats.treatmentDeaths).toBeGreaterThan(0);
    expect(stats.controlDeaths).toBe(0); // control's death rate is the model's own zero default
  });

  it('a larger vessel raises the treatment arm above control once contact inhibition would otherwise bind', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'vessel-capacity', 1, 200);
    expect(stats.treatmentTotal).toBeGreaterThan(stats.controlTotal);
  });

  it('switching treatment mid-run relaunches both cultures from t=0, never mixing two histories', () => {
    const sim = new CellCultureLabSim();
    runFor(sim, 'mitogen', 1, 48);
    sim.update(0.05, { treatment: 'cytotoxic', dose: 1 });
    expect(sim.getStats().hoursElapsed).toBeLessThan(1);
  });

  it('never advances the simulated clock past the declared 240h horizon', () => {
    const sim = new CellCultureLabSim();
    runFor(sim, 'mitogen', 1, 240);
    for (let i = 0; i < 50; i++) sim.update(0.05, { treatment: 'mitogen', dose: 1 });
    expect(sim.getStats().hoursElapsed).toBeLessThanOrEqual(240);
  });

  it('reset() restarts the current treatment/dose from t=0', () => {
    const sim = new CellCultureLabSim();
    runFor(sim, 'mitogen', 1, 48);
    sim.reset?.();
    expect(sim.getStats().hoursElapsed).toBe(0);
  });

  it('a demo-mode speed multiplier advances more real hours per real second, through the same RK4 steps', () => {
    const normal = new CellCultureLabSim();
    normal.init(800, 600);
    normal.update(0.05, { treatment: 'mitogen', dose: 1, speed: 1 });

    const fast = new CellCultureLabSim();
    fast.init(800, 600);
    fast.update(0.05, { treatment: 'mitogen', dose: 1, speed: 4 });

    expect(fast.getStats().hoursElapsed).toBeCloseTo(normal.getStats().hoursElapsed * 4, 6);
  });
});

describe('deriveArmStats — pure derived-stat formulas', () => {
  it('phase fractions sum to 1 and occupancy/stateLabel reflect the real thresholds', () => {
    const arm = {
      phases: { g1: 495_000, s: 400_000, g2m: 100_000 },
      params: { ...CELL_CYCLE_DEFAULTS, carryingCapacityCells: 1_000_000 },
      history: [],
      hoursElapsed: 100,
      netGrowthPerHour: 5,
      cumulativeDeaths: 0,
    };
    const stats = deriveArmStats(arm);
    expect(stats.g1Fraction + stats.sFraction + stats.g2mFraction).toBeCloseTo(1, 9);
    expect(stats.occupancyFraction).toBeCloseTo(0.995, 3);
    expect(stats.stateCode).toBe(CULTURE_STATE_CODE.ARRESTED);
  });
});

/** A real-shaped `PanelState` COMPLETE fixture — every field `WorldDiscoveryPanel` actually produces,
 * not a subset, so `conclusionFor`/`nextExperimentFor` are tested against the true contract. */
function beliefFixture(hypothesisId: string, status: HypothesisBelief['status'], reason: string): HypothesisBelief {
  return {
    hypothesisId,
    statement: `${hypothesisId} statement`,
    status,
    confidence: status === 'SUPPORTED' ? 'SUPPORTED_AT_TWO_MAGNITUDES' : 'REFUTED_BY_CRITERION',
    supportedInRounds: status === 'SUPPORTED' ? [1] : [],
    refutedInRounds: status === 'REFUTED' ? [1] : [],
    testedAtStrengths: [1],
    observedEffects: [123.4],
    reason,
  };
}

function completeStateFixture(bestSupported: HypothesisBelief[], failedHypotheses: HypothesisBelief[], unresolvedQuestions: string[]): PanelState {
  const result: DiscoveryLoopResult = {
    contractVersion: '1.0.0',
    question: 'increase cell count',
    worldId: 'genesis-cell-culture-lab',
    domainId: 'cell-biology',
    beliefs: [...bestSupported, ...failedHypotheses],
    rounds: [],
    trace: [],
    stopReason: 'ALL_HYPOTHESES_RESOLVED',
    failedHypotheses,
    bestSupported,
    unresolvedQuestions,
    declaredAssumptions: [],
    notModelledFactors: [],
  };
  return {
    kind: 'COMPLETE',
    goal: 'Increase cell count using a substance, at most 2 experiments.',
    intent: {
      contractVersion: '1.0.0',
      sourceText: 'Increase cell count using a substance, at most 2 experiments.',
      objectiveMetric: 'totalCells',
      direction: 'maximize',
      requestedLeverIds: [],
      unknownLeverPhrases: [],
      maxRounds: 2,
      unresolved: [],
    },
    result,
    report: 'report text',
    memory: null,
    evidence: { bundleId: 'bundle-1', scientificContentFingerprint: 'fp-1', replayVerdict: 'MATCH', replayMessage: 'ok' },
    replay: { status: 'MATCH', reason: 'matches' },
    savedExperimentId: 'exp-1',
    mechanismComposition: null,
  };
}

describe('conclusionFor — reads the SAME verdict the real Discovery Loop reached, never a second one', () => {
  it('returns null before any search has run', () => {
    expect(conclusionFor(null, 'h:mitogen')).toBeNull();
  });

  it('returns null while a search is running or was refused', () => {
    expect(conclusionFor({ kind: 'RUNNING', goal: 'x' }, 'h:mitogen')).toBeNull();
  });

  it('reports SUPPORTED verbatim when the real hypothesis id survived', () => {
    const supported = beliefFixture('h:mitogen', 'SUPPORTED', 'Held up at two magnitudes.');
    const state = completeStateFixture([supported], [], []);
    const conclusion = conclusionFor(state, 'h:mitogen');
    expect(conclusion).not.toBeNull();
    expect(conclusion!.verdict).toBe('SUPPORTED');
    expect(conclusion!.text).toContain('Held up at two magnitudes.');
  });

  it('reports FALSIFIED verbatim when the real hypothesis id was refuted', () => {
    const failed = beliefFixture('h:cytotoxic', 'REFUTED', 'Moved the count the wrong direction.');
    const state = completeStateFixture([], [failed], []);
    const conclusion = conclusionFor(state, 'h:cytotoxic');
    expect(conclusion).not.toBeNull();
    expect(conclusion!.verdict).toBe('FALSIFIED');
    expect(conclusion!.text).toContain('wrong direction');
  });

  it('returns null when the completed search never tested the requested hypothesis id', () => {
    const supported = beliefFixture('h:mitogen', 'SUPPORTED', 'reason');
    const state = completeStateFixture([supported], [], []);
    expect(conclusionFor(state, 'h:cytotoxic')).toBeNull();
  });
});

describe('nextExperimentFor — the real unresolved question, or an honest UI affordance, never fabricated', () => {
  it('prompts to run a search first, when none has completed', () => {
    expect(nextExperimentFor(null)).toMatch(/run a discovery search/i);
  });

  it("surfaces the search's own first unresolved question verbatim", () => {
    const state = completeStateFixture([], [], ['Does the S-phase inhibitor generalise at half dose?']);
    expect(nextExperimentFor(state)).toBe('Does the S-phase inhibitor generalise at half dose?');
  });

  it('falls back to a plain UI prompt when the search left nothing outstanding', () => {
    const state = completeStateFixture([beliefFixture('h:mitogen', 'SUPPORTED', 'r')], [], []);
    expect(nextExperimentFor(state)).toMatch(/try a different substance/i);
  });
});

describe('CellLabScreen — markup contract (SIMULATION badge, narrative, honesty)', () => {
  it('always shows the SIMULATION provenance badge and MODEL_ESTIMATE grounding', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-provenance-badge"');
    expect(markup).toContain('SIMULATION');
    expect(markup).toContain('MODEL_ESTIMATE');
  });

  it('renders the full flagship narrative ladder: CONTROL -> TREATMENT -> OBSERVATION -> DIFFERENCE -> CONCLUSION -> NEXT EXPERIMENT -> EVIDENCE -> REPLAY', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-narrative"');
    for (const stage of ['control', 'treatment', 'observation', 'difference', 'conclusion', 'next-experiment', 'evidence', 'replay']) {
      expect(markup).toContain(`data-testid="ladder-${stage}"`);
    }
    expect(markup).toContain('CONTROL');
    expect(markup).toContain('TREATMENT');
    expect(markup).toContain('OBSERVATION');
    expect(markup).toContain('DIFFERENCE');
    expect(markup).toContain('CONCLUSION');
    expect(markup).toContain('NEXT EXPERIMENT');
    expect(markup).toContain('EVIDENCE');
    expect(markup).toContain('REPLAY');
  });

  it('shows the honest "no conclusion yet" state before any Discovery search has run', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toMatch(/run a discovery search.*reach a real conclusion/i);
  });

  it('shows the honest "not yet" state for EVIDENCE and REPLAY before any Discovery search has run', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toMatch(/run a discovery search.*evidence bundle/i);
    expect(markup).toMatch(/available once a search has run/i);
  });

  it('renders the Real Experiment Interface pipeline with Prediction real and every later stage honestly refused before a search has run', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="real-experiment-pipeline"');
    expect(markup).toContain('data-testid="rex-stage-prediction"');
    expect(markup).toContain('data-testid="rex-stage-request"');
    expect(markup).toContain('data-testid="rex-stage-waiting"');
    expect(markup).toContain('data-testid="rex-stage-data"');
    expect(markup).toContain('AVAILABLE');
    expect(markup).toContain('NOT YET AVAILABLE');
    // No discovery search has run yet, so there is no completed prediction to
    // measure a real reading against — the form only appears once one exists.
    expect(markup).toMatch(/run a discovery search on the left first/i);
    expect(markup).not.toContain('data-testid="rex-entry-form"');
    // Product/demo copy: the "not yet" reason is plain language for a demo audience, not an
    // engineering changelog — no internal function names on screen.
    expect(markup).not.toContain('createRealExperimentRun');
  });

  it('exposes a Demo Mode toggle', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-demo-toggle"');
    expect(markup).toContain('Demo Mode');
  });

  it('discloses the real model simplification (dose applied at t=0) rather than hiding it', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-honesty"');
    expect(markup).toContain('representative textbook values');
    expect(markup).toContain('12h');
  });

  it('embeds the real Discovery Loop panel pre-selected onto this domain (P1)', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('wd-panel');
  });
});
