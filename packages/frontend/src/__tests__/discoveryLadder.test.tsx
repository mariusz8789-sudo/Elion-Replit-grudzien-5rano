import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConclusionContent, DiscoveryLadder, EvidenceContent, ReplayContent, type LadderStep } from '../components/visual-simulation/DiscoveryLadder';
import { conclusionFor, nextExperimentFor } from '../components/visual-simulation/discoveryNarrative';
import type { PanelState } from '../components/visual-simulation/WorldDiscoveryPanel';
import type { DiscoveryLoopResult, HypothesisBelief } from '../core/agent/discoveryLoop';

/**
 * REUSABLE DISCOVERY LADDER — these tests exercise `DiscoveryLadder`/`discoveryNarrative.ts` in
 * isolation from `CellLabScreen.tsx`, with a synthetic non-cell-biology hypothesis id
 * ("h:synthetic-lever" for a made-up "flux-inhibitor" domain), proving the shell and the narrative
 * lookup are genuinely domain-agnostic rather than only incidentally working for one screen.
 */

function beliefFixture(hypothesisId: string, status: HypothesisBelief['status'], reason: string): HypothesisBelief {
  return {
    hypothesisId,
    statement: `${hypothesisId} statement`,
    status,
    confidence: status === 'SUPPORTED' ? 'SUPPORTED_AT_TWO_MAGNITUDES' : 'REFUTED_BY_CRITERION',
    supportedInRounds: status === 'SUPPORTED' ? [1] : [],
    refutedInRounds: status === 'REFUTED' ? [1] : [],
    testedAtStrengths: [1],
    observedEffects: [1.0],
    reason,
  };
}

function completeStateFixture(bestSupported: HypothesisBelief[], failedHypotheses: HypothesisBelief[], unresolvedQuestions: string[]): PanelState {
  const result: DiscoveryLoopResult = {
    contractVersion: '1.0.0',
    question: 'synthetic goal',
    worldId: 'synthetic-world',
    domainId: 'synthetic-domain',
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
    goal: 'synthetic goal',
    intent: {
      contractVersion: '1.0.0',
      sourceText: 'synthetic goal',
      objectiveMetric: 'flux',
      direction: 'maximize',
      requestedLeverIds: [],
      unknownLeverPhrases: [],
      maxRounds: 2,
      unresolved: [],
    },
    result,
    report: 'report',
    memory: null,
    evidence: { bundleId: 'bundle-synth', scientificContentFingerprint: 'fp', replayVerdict: 'MATCH', replayMessage: 'ok' },
    replay: { status: 'MATCH', reason: 'matches' },
    savedExperimentId: 'exp-synth',
    mechanismComposition: null,
  };
}

describe('discoveryNarrative — domain-agnostic (works for a hypothesis id no cell-biology code declares)', () => {
  it('conclusionFor looks up a synthetic hypothesis id by exact match, no cell-biology assumption', () => {
    const supported = beliefFixture('h:flux-inhibitor', 'SUPPORTED', 'Held at full strength.');
    const state = completeStateFixture([supported], [], []);
    const conclusion = conclusionFor(state, 'h:flux-inhibitor');
    expect(conclusion).toEqual({ verdict: 'SUPPORTED', text: 'SUPPORTED_AT_TWO_MAGNITUDES. Held at full strength.' });
  });

  it('nextExperimentFor surfaces a synthetic unresolved question verbatim', () => {
    const state = completeStateFixture([], [], ['Does flux inhibition generalise to a second substrate?']);
    expect(nextExperimentFor(state)).toBe('Does flux inhibition generalise to a second substrate?');
  });
});

describe('DiscoveryLadder — a generic shell that computes nothing itself', () => {
  const steps: LadderStep[] = [
    { key: 'goal', label: 'GOAL', content: <p>Maximise flux</p> },
    { key: 'hypothesis', label: 'HYPOTHESIS', content: <p>h:flux-inhibitor</p>, color: '#abcdef' },
  ];

  it('renders exactly the steps it is given, in order, with per-step testids', () => {
    const markup = renderToStaticMarkup(<DiscoveryLadder steps={steps} testId="synthetic-ladder" />);
    expect(markup).toContain('data-testid="synthetic-ladder"');
    expect(markup).toContain('data-testid="ladder-goal"');
    expect(markup).toContain('data-testid="ladder-hypothesis"');
    expect(markup.indexOf('ladder-goal')).toBeLessThan(markup.indexOf('ladder-hypothesis'));
    expect(markup).toContain('Maximise flux');
    expect(markup).toContain('color:#abcdef');
  });

  it('renders with no per-step color when none is given', () => {
    const markup = renderToStaticMarkup(<DiscoveryLadder steps={[{ key: 'x', label: 'X', content: <p>y</p> }]} />);
    expect(markup).not.toContain('style=');
  });
});

describe('ConclusionContent — the shared CONCLUSION rendering every domain reuses', () => {
  it('renders the honest pending state when no conclusion exists yet', () => {
    const markup = renderToStaticMarkup(<ConclusionContent conclusion={null} pendingText="Nothing decided yet." />);
    expect(markup).toContain('Nothing decided yet.');
    expect(markup).not.toContain('SUPPORTED');
    expect(markup).not.toContain('FALSIFIED');
  });

  it('renders a real SUPPORTED verdict with its own reason text', () => {
    const markup = renderToStaticMarkup(<ConclusionContent conclusion={{ verdict: 'SUPPORTED', text: 'evidence text' }} pendingText="unused" />);
    expect(markup).toContain('dl-supported');
    expect(markup).toContain('SUPPORTED');
    expect(markup).toContain('evidence text');
  });

  it('renders a real FALSIFIED verdict with its own reason text', () => {
    const markup = renderToStaticMarkup(<ConclusionContent conclusion={{ verdict: 'FALSIFIED', text: 'refuted text' }} pendingText="unused" />);
    expect(markup).toContain('dl-falsified');
    expect(markup).toContain('FALSIFIED');
    expect(markup).toContain('refuted text');
  });
});

describe('EvidenceContent — the shared EVIDENCE rendering every domain reuses', () => {
  it('renders the honest pending state before any Evidence Bundle exists', () => {
    const markup = renderToStaticMarkup(<EvidenceContent evidence={null} provenance="SIMULATED" pendingText="No evidence yet." />);
    expect(markup).toContain('No evidence yet.');
    expect(markup).not.toContain('Evidence Bundle');
  });

  it('renders a real Evidence Bundle id, its own replay verdict, and the given provenance badge', () => {
    const evidence = { bundleId: 'bundle-xyz', scientificContentFingerprint: 'fp-xyz', replayVerdict: 'MATCH' as const, replayMessage: 'ok' };
    const markup = renderToStaticMarkup(<EvidenceContent evidence={evidence} provenance="SIMULATED" pendingText="unused" />);
    expect(markup).toContain('bundle-xyz');
    expect(markup).toContain('wd-replay-MATCH');
    expect(markup).toContain('MATCH');
    expect(markup).toContain('SIMULATION');
  });
});

describe('ReplayContent — the shared REPLAY rendering every domain reuses', () => {
  it('renders the honest pending state before any replay has run', () => {
    const markup = renderToStaticMarkup(<ReplayContent replay={null} pendingText="Not replayed yet." />);
    expect(markup).toContain('Not replayed yet.');
  });

  it('renders a real MATCH verdict with its own reason', () => {
    const markup = renderToStaticMarkup(<ReplayContent replay={{ status: 'MATCH', reason: 'Re-executed and matched.' }} pendingText="unused" />);
    expect(markup).toContain('wd-replay-MATCH');
    expect(markup).toContain('MATCH');
    expect(markup).toContain('Re-executed and matched.');
  });

  it('renders a real DRIFT verdict distinctly from MATCH', () => {
    const markup = renderToStaticMarkup(<ReplayContent replay={{ status: 'DRIFT', reason: 'Re-execution diverged.' }} pendingText="unused" />);
    expect(markup).toContain('wd-replay-DRIFT');
    expect(markup).toContain('DRIFT');
    expect(markup).toContain('Re-execution diverged.');
  });
});
