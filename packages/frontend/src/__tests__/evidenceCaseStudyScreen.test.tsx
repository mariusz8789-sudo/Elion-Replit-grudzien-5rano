import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * EVIDENCE & REPLAY SCREEN — `EvidenceCaseStudyScreen` reads Scientific Memory through a synchronous
 * lazy `useState` initializer (not `useEffect`), exactly so its FIRST render already reflects real
 * data under `renderToStaticMarkup` — no interactive mount required to exercise the real data path,
 * matching this repo's existing SSR-markup test convention (see `cellLabScreen.test.tsx`,
 * `discoveryLadder.test.tsx`).
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

describe('EvidenceCaseStudyScreen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the honest empty state when Scientific Memory has no Evidence Bundle yet', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), print: () => {}, location: { hash: '' } });
    const { EvidenceCaseStudyScreen } = await import('../components/visual-simulation/EvidenceCaseStudyScreen');
    const markup = renderToStaticMarkup(<EvidenceCaseStudyScreen />);
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

    const { EvidenceCaseStudyScreen } = await import('../components/visual-simulation/EvidenceCaseStudyScreen');
    const markup = renderToStaticMarkup(<EvidenceCaseStudyScreen />);

    expect(markup).toContain('data-testid="ecs-case-study"');
    expect(markup).toContain(goal);
    expect(markup).toContain('data-testid="ecs-step-question"');
    expect(markup).toContain('data-testid="ecs-step-evidence-bundle"');
    expect(markup).toContain('SIMULATION');
    expect(markup).toContain('data-testid="ecs-replay-verdict"');
    expect(markup).toContain('MATCH');
    // Honesty: a fully simulated case study never wears the REAL_EXPERIMENTAL badge — the word can
    // still appear in the honest contrastive prose ("no such badge here; that other kind exists").
    expect(markup).not.toContain('REAL EXPERIMENTAL DATA');
  }, 30_000);
});
