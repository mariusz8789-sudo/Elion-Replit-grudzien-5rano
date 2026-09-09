import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatrixPanel } from '../components/visual-simulation/GenesisWorldScreen';
import type { GenesisMatrixView } from '../core/agent/genesisMatrix';
import type { StrategyRun } from '../core/agent/discoveryStrategy';
import type { NextAction } from '../core/agent/nextAction';

/**
 * GENESIS INVESTIGATION UX — MatrixPanel is the one screen the product directive asked to elevate
 * (HYPOTHESES status, WHY THIS EXPERIMENT, MEMORY, DECLARED_SPACE_INSUFFICIENT framing,
 * SIMULATION provenance badge, honest INFORMATION GAIN "not available"). These tests exercise the
 * real component with realistic-shaped fixtures (not the live discovery loop — that is already
 * covered by genesisMatrix.test.ts/competingModels.test.ts/modelSufficiency.test.ts) to pin the
 * markup contract those upstream real fields must keep satisfying.
 */

const baseView: GenesisMatrixView = {
  contractVersion: '1.0.0',
  domainId: 'flood-hydrology',
  question: 'minimize peak flood depth',
  shape: 'MECHANISM',
  strategyId: 'flood-mechanism-strategy',
  admission: 'REAL',
  admissionCaveat: null,
  refusalReason: null,
  entries: [
    {
      round: 1,
      entityId: null,
      what: 'Widening the floodplain outlet',
      why: 'Testing h:outlet-capacity',
      verdicts: [{ hypothesisId: 'h:outlet-capacity', assessment: 'FALSIFIED_WITHIN_PROTOCOL', predicted: null }],
      reference: 1.45,
      observed: 1.45,
    },
  ],
  stopReason: 'ALL_HYPOTHESES_RESOLVED',
  resultFingerprint: 'fp-test',
  limitations: [],
  openQuestions: [],
  nextExperiment: null,
  evidence: null,
  sufficiency: null,
  competingModels: null,
  priorInvestigation: null,
};

const baseRun: StrategyRun = {
  contractVersion: '1.0.0',
  dataProvenance: {
    origin: 'SIMULATED',
    origins: ['SIMULATED'],
    derivedFrom: 'test fixture, hand-built',
    why: 'A hand-built fixture: no measurement was taken.',
  },
  strategyId: 'flood-mechanism-strategy',
  shape: 'MECHANISM',
  question: 'minimize peak flood depth',
  domainId: 'flood-hydrology',
  rounds: [],
  surviving: [],
  falsified: ['h:outlet-capacity'],
  untested: [],
  stopReason: 'ALL_HYPOTHESES_RESOLVED',
  nextExperiment: null,
  openQuestions: [],
  limitations: [],
  resultFingerprint: 'fp-test',
  native: null,
};

const nextExperiment: NextAction = {
  contractVersion: '1.0.0',
  selectorId: 'hypothesis-loop-next-action',
  domain: 'flood-hydrology',
  status: 'READY_TO_RUN',
  action: 'Test h:infiltration-capacity next',
  why: 'It is the only untested mechanism that could still explain the observed depth reduction.',
  resolves: 'Whether infiltration, not the outlet, drives the peak depth',
  rule: 'first-untested-mechanism',
  request: null,
  about: ['h:infiltration-capacity'],
  native: null,
};

describe('MatrixPanel — SIMULATION provenance badge (item 16)', () => {
  it('always shows the SIMULATION badge, since nothing on this panel is real-apparatus data', () => {
    const markup = renderToStaticMarkup(<MatrixPanel view={baseView} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-provenance-badge"');
    expect(markup).toContain('SIMULATION');
  });
});

describe('MatrixPanel — HYPOTHESES status list (items 3 & 5)', () => {
  it('renders NOT AVAILABLE when no StrategyRun exists yet, never an empty list guessed to mean "no hypotheses"', () => {
    const markup = renderToStaticMarkup(<MatrixPanel view={baseView} roundNumber={1} run={null} />);
    expect(markup).toContain('data-testid="matrix-hypotheses-unavailable"');
    expect(markup).toContain('NOT AVAILABLE');
  });

  it('labels each real hypothesis id with its real run-level status (SUPPORTED/FALSIFIED/UNTESTED)', () => {
    const run: StrategyRun = { ...baseRun, surviving: ['h:infiltration'], falsified: ['h:outlet-capacity'], untested: ['h:pump-trip'] };
    const markup = renderToStaticMarkup(<MatrixPanel view={baseView} roundNumber={1} run={run} />);
    expect(markup).toContain('data-testid="matrix-hypothesis-h:infiltration"');
    expect(markup).toContain('data-testid="matrix-hypothesis-h:outlet-capacity"');
    expect(markup).toContain('data-testid="matrix-hypothesis-h:pump-trip"');
    expect(markup).toContain('SUPPORTED');
    expect(markup).toContain('FALSIFIED');
    expect(markup).toContain('UNTESTED');
  });
});

describe('MatrixPanel — DECLARED_SPACE_INSUFFICIENT framing (item 7)', () => {
  it('renders a real discovery-moment block, never present when sufficiency is a different status', () => {
    const markup = renderToStaticMarkup(<MatrixPanel view={baseView} roundNumber={1} run={baseRun} />);
    expect(markup).not.toContain('data-testid="matrix-space-insufficient"');
  });

  it('surfaces the real nextStep/caveat text verbatim when the run actually exhausted its declared space', () => {
    const view: GenesisMatrixView = {
      ...baseView,
      sufficiency: {
        contractVersion: '1.0.0',
        status: 'DECLARED_SPACE_INSUFFICIENT',
        question: baseView.question!,
        domainId: baseView.domainId!,
        declaredMechanismCount: 2,
        survivingCount: 0,
        falsifiedCount: 2,
        untestedCount: 0,
        reachedMetricCount: 1,
        inertCount: 1,
        everyTestedMechanismInert: false,
        nextStep: 'A next step must declare an untried mechanism, or propose a different model, and test it.',
        caveat: 'This is insufficiency of the DECLARED search space — the mechanisms this run was given — not proof the model cannot explain the observation.',
      },
    };
    const markup = renderToStaticMarkup(<MatrixPanel view={view} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-space-insufficient"');
    expect(markup).toContain('Known mechanisms exhausted');
    expect(markup).toContain('data-testid="matrix-insufficient-next-step"');
    expect(markup).toContain('propose a different model');
    expect(markup).not.toMatch(/eureka/i);
  });
});

describe('MatrixPanel — WHY THIS EXPERIMENT? (item 4)', () => {
  it('shows "Reason not yet available" rather than fabricating a reason mid-run', () => {
    const view: GenesisMatrixView = { ...baseView, entries: [...baseView.entries, { ...baseView.entries[0]!, round: 2 }] };
    const markup = renderToStaticMarkup(<MatrixPanel view={view} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-why-unavailable"');
    expect(markup).toContain('Reason not yet available.');
  });

  it("renders the selector's own real why-text verbatim once the run has actually proposed a next experiment", () => {
    const view: GenesisMatrixView = { ...baseView, nextExperiment };
    const markup = renderToStaticMarkup(<MatrixPanel view={view} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-genesis-decided"');
    expect(markup).toContain('Test h:infiltration-capacity next');
    expect(markup).toContain('data-testid="matrix-why-text"');
    expect(markup).toContain('It is the only untested mechanism');
    expect(markup).toContain('h:infiltration-capacity');
  });
});

describe('MatrixPanel — MEMORY (item 14)', () => {
  it('states plainly that no prior investigation influenced this run, when priorInvestigation is null', () => {
    const markup = renderToStaticMarkup(<MatrixPanel view={baseView} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-memory-none"');
    expect(markup).toContain('No prior investigation influenced this run.');
  });

  it("renders the real memory reason sentence verbatim when memory did narrow this run's hypotheses", () => {
    const view: GenesisMatrixView = {
      ...baseView,
      priorInvestigation: { skippedHypothesisIds: ['h:pump-trip'], reason: 'Skipped 1 hypothesis already falsified in a prior investigation of this same system.' },
    };
    const markup = renderToStaticMarkup(<MatrixPanel view={view} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-memory-text"');
    expect(markup).toContain('already falsified in a prior investigation');
  });
});

describe('MatrixPanel — INFORMATION GAIN (item 3)', () => {
  it('honestly states NOT AVAILABLE rather than inventing a number no selector computes', () => {
    const markup = renderToStaticMarkup(<MatrixPanel view={baseView} roundNumber={1} run={baseRun} />);
    expect(markup).toContain('data-testid="matrix-information-gain-unavailable"');
    expect(markup).toContain('NOT AVAILABLE');
  });
});
