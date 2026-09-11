import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenesisDashboard, decideNextAction } from '../components/GenesisDashboard';
import type { MatrixKind } from '../components/GenesisMatrixHub';

/**
 * Like the Matrix Hub tests, these run without a DOM: `core/storage.ts`
 * degrades to an empty store, effects never fire under
 * `renderToStaticMarkup`, so the dashboard renders exactly the state it
 * shows a brand-new user — which is the state most worth pinning, because
 * "never show an empty page" and "never fabricate data" pull in opposite
 * directions and this is where they meet.
 */

const counts = (over: Partial<Record<MatrixKind, number>> = {}): Record<MatrixKind, number> => ({
  HYPOTHESIS: 0, WORLD: 0, MODEL: 0, SCENARIO: 0, EVIDENCE: 0,
  CYBER: 0, RESEARCH_CHAIN: 0, REPLAY: 0, EXPERIMENT: 0,
  ...over,
});

describe('decideNextAction — grounded in real counts, never a generated recommendation', () => {
  it('an empty Science Memory sends the user to start a hypothesis', () => {
    const action = decideNextAction(counts());
    expect(action.hash).toBe('#/genesis-world');
    expect(action.why).toContain('pusta');
  });

  it('hypotheses without evidence send the user to collect evidence, and say how many', () => {
    const action = decideNextAction(counts({ HYPOTHESIS: 3 }));
    expect(action.hash).toBe('#/drug');
    expect(action.why).toContain('3');
  });

  it('singular vs plural is rendered correctly for exactly one hypothesis', () => {
    const action = decideNextAction(counts({ HYPOTHESIS: 1 }));
    expect(action.why).toContain('1 hipoteza jest zapisana');
  });

  it('evidence without any scenario sends the user to branch a scenario', () => {
    const action = decideNextAction(counts({ HYPOTHESIS: 2, EVIDENCE: 1 }));
    expect(action.hash).toBe('#/what-if');
  });

  it('a loop that is closed at every stage points back at the Matrix map', () => {
    const action = decideNextAction(counts({ HYPOTHESIS: 2, EVIDENCE: 1, SCENARIO: 1 }));
    expect(action.hash).toBe('#/matrix');
  });
});

describe('GenesisDashboard (no DOM — the brand-new-user state)', () => {
  const html = renderToStaticMarkup(<GenesisDashboard />);

  it('is never an empty page: it names the missing mission and offers the real first step', () => {
    expect(html).toContain('Brak aktywnej misji');
    expect(html).toContain('Postaw pierwszą hipotezę');
    expect(html).toContain('Otwórz World Engine'); // the empty state carries a real next step, not a dead card
  });

  it('states plainly that nothing is seeded, rather than padding the screen with demo records', () => {
    expect(html).toContain('nie zarejestrował jeszcze żadnego przebiegu');
    expect(html).toContain('Brak zapisanych przebiegów');
  });

  it('reports the backend as still being checked rather than claiming a fake green light', () => {
    expect(html).toContain('Sprawdzam backend');
    expect(html).not.toContain('dash-ok');
  });

  it('exposes the Science Chat command bar as part of the page, not as a floating widget', () => {
    expect(html).toContain('dash-ask-input');
    expect(html).toContain('Science Chat');
  });
});
