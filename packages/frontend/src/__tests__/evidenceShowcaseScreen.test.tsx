import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPERIMENT_FABRIC_VERSION } from '../core/experimentFabric/types';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import type { ScientificEvidencePack } from '../core/experimentFabric/evidencePack';

/**
 * EVIDENCE & REPLAY SHOWCASE SCREEN — `EvidenceShowcaseScreen` reads Scientific Memory through a
 * synchronous lazy `useState` initializer (not `useEffect`), exactly so its FIRST render already
 * reflects real data under `renderToStaticMarkup` — no interactive mount required to exercise the real
 * data path, matching this repo's existing SSR-markup test convention (see `cellLabScreen.test.tsx`,
 * `discoveryLadder.test.tsx`).
 *
 * The DRIFT/BLOCKED test below uses a hand-built, type-shaped `ScientificEvidencePack` fixture (the
 * same convention `cellLabScreen.test.tsx`'s `completeStateFixture()` uses) rather than a full solver
 * run, specifically so a non-MATCH verdict is deterministic and fast to produce — this round's
 * directive asks explicitly for a fixture-based proof that DRIFT/BLOCKED render as visibly as MATCH.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function evidencePackFixture(overrides: {
  evidencePackId: string;
  allArmsMatched: boolean;
  armsWithDrift?: readonly string[];
  armsNotExecuted?: readonly string[];
}): ScientificEvidencePack {
  const domainId = 'genesis-electrical-generator';
  const request = { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: 'fixture', domainId, operation: 'simulate' as const, parameters: {} };
  const provenance = {
    contractVersion: EXPERIMENT_FABRIC_VERSION, requestFingerprint: 'rf-fixture', runFingerprint: 'runf-fixture',
    knowledgeSources: [], supplementalKnowledgeIds: [], domainId, engine: null, parameterSnapshot: {},
    deterministic: true, resultOrigin: 'real-engine' as const, dataProvenance: 'SIMULATED' as const,
  };
  const result = {
    contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed' as const, summary: 'fixture run',
    outputs: {}, units: {}, warnings: [], assumptions: [], visualization: [], route: { kind: 'none' as const },
  };
  const criterion: FalsificationCriterion = {
    metric: 'fixtureMetric', relation: 'equal-within-tolerance', tolerance: 1, rationale: 'fixture criterion',
  };
  return {
    contractVersion: '1.0.0',
    evidencePackId: overrides.evidencePackId,
    evidenceChainId: `${overrides.evidencePackId}-chain`,
    protocol: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      designId: `${overrides.evidencePackId}-design`,
      hypothesis: {
        contractVersion: EXPERIMENT_FABRIC_VERSION,
        hypothesisId: 'h:fixture',
        statement: 'Fixture hypothesis statement for a legacy Evidence Pack.',
        modelId: 'fixture-model',
        domainId,
        assessment: 'SUPPORTED_WITHIN_PROTOCOL',
        knowledgeSources: [],
        declaredAssumptions: [],
        falsification: criterion,
        disclaimer: 'fixture disclaimer',
      },
      primaryMetric: 'fixtureMetric',
      arms: [{ armId: 'arm-1', label: 'Arm 1', kind: 'baseline', request, expectedRole: 'baseline' }],
      repetitionsPerArm: 1,
      protocolAssumptions: [],
      protocolFingerprint: `${overrides.evidencePackId}-protocol-fp`,
    },
    hypothesisAssessment: { assessment: 'SUPPORTED_WITHIN_PROTOCOL', message: 'Fixture assessment message.', criterion, referenceRunIds: [] },
    runCount: 1,
    runs: [{ runId: `${overrides.evidencePackId}-run-1`, engine: null, parameters: {}, status: 'completed', result, provenance }],
    reproducibility: {
      allArmsMatched: overrides.allArmsMatched,
      armsWithDrift: overrides.armsWithDrift ?? [],
      armsNotExecuted: overrides.armsNotExecuted ?? [],
    },
    eventSummaries: [],
    disclaimer: 'Fixture Evidence Pack for tests — not a real laboratory or solver result.',
  };
}

async function seedPackExperiment(pack: ScientificEvidencePack) {
  const { saveScientificEvidencePack } = await import('../core/experimentFabric');
  const { saveExperiment } = await import('../core/scienceMemory');
  saveScientificEvidencePack(pack);
  return saveExperiment({
    labId: 'legacy-pilot', experimentId: `legacy:${pack.evidencePackId}`, experimentName: `Legacy pilot run — ${pack.evidencePackId}`,
    params: {}, stats: {}, evidencePackId: pack.evidencePackId,
    honesty: 'simplified', honestyNote: 'test fixture', assumptions: [], epistemicStatus: 'SIMULATION',
  });
}

describe('EvidenceShowcaseScreen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the honest empty state when Scientific Memory has no Evidence Bundle yet', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), print: () => {}, location: { hash: '' } });
    const { EvidenceShowcaseScreen } = await import('../components/visual-simulation/EvidenceShowcaseScreen');
    const markup = renderToStaticMarkup(<EvidenceShowcaseScreen />);
    expect(markup).toContain('data-testid="ecs-empty-state"');
    expect(markup).not.toContain('data-testid="ecs-case-study"');
  });

  it('renders a real SIMULATED case study end to end, including a live MATCH replay', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), print: () => {}, location: { hash: '' } });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { GENESIS_GENERATOR_CATALOG_ID } = await import('../core/agent/electricalGeneratorLeverCatalog');

    const goal = 'Maximise remaining fuel, at most 12 experiments.';
    const state = runWorldDiscoveryAndRemember(goal, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);

    const { EvidenceShowcaseScreen } = await import('../components/visual-simulation/EvidenceShowcaseScreen');
    const markup = renderToStaticMarkup(<EvidenceShowcaseScreen />);

    expect(markup).toContain('data-testid="ecs-case-study"');
    expect(markup).toContain(goal);
    expect(markup).toContain('data-testid="ecs-step-question"');
    expect(markup).toContain('data-testid="ecs-step-evidence-bundle"');
    expect(markup).toContain('SIMULATION');
    expect(markup).toContain('data-testid="ecs-replay-verdict"');
    expect(markup).toContain('MATCH');
    expect(markup).toContain('data-testid="ecs-download-json"');
    // Honesty: a fully simulated case study never wears the REAL_EXPERIMENTAL badge — the word can
    // still appear in the honest contrastive prose ("no such badge here; that other kind exists").
    expect(markup).not.toContain('REAL EXPERIMENTAL DATA');
  }, 30_000);

  it('renders DRIFT with the exact same markup shape (testid + verdict text) as MATCH — never hidden or softened', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), print: () => {}, location: { hash: '' } });
    const pack = evidencePackFixture({ evidencePackId: 'pack-screen-drift', allArmsMatched: false, armsWithDrift: ['arm-1'] });
    await seedPackExperiment(pack);

    const { EvidenceShowcaseScreen } = await import('../components/visual-simulation/EvidenceShowcaseScreen');
    const markup = renderToStaticMarkup(<EvidenceShowcaseScreen />);

    expect(markup).toContain('data-testid="ecs-case-study"');
    expect(markup).toContain('data-testid="ecs-replay-verdict"');
    expect(markup).toContain('wd-replay-DRIFT');
    expect(markup).toContain('>DRIFT<');
    // Honesty: this kind's replay is a save-time snapshot, not a fresh re-execution — the caption says so.
    expect(markup).toMatch(/not recomputed just now/i);
  });

  it('renders BLOCKED with the exact same markup shape as MATCH — never hidden or softened', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), print: () => {}, location: { hash: '' } });
    const pack = evidencePackFixture({ evidencePackId: 'pack-screen-blocked', allArmsMatched: false, armsNotExecuted: ['arm-1'] });
    await seedPackExperiment(pack);

    const { EvidenceShowcaseScreen } = await import('../components/visual-simulation/EvidenceShowcaseScreen');
    const markup = renderToStaticMarkup(<EvidenceShowcaseScreen />);

    expect(markup).toContain('data-testid="ecs-case-study"');
    expect(markup).toContain('data-testid="ecs-replay-verdict"');
    expect(markup).toContain('wd-replay-BLOCKED');
    expect(markup).toContain('>BLOCKED<');
  });
});
