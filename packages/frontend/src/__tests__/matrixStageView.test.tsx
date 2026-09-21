import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatrixStageView } from '../components/MatrixStageView';

/**
 * `#/matrix` is the clean stage: the WebGL world is the page and the only
 * markup is one right-hand HUD column. No cards, no opaque panels, no number
 * that the backend did not send (in static markup there is no backend, so the
 * readout must say so instead of inventing a value).
 */
describe('MatrixStageView — a HUD column over the stage, nothing else', () => {
  const html = renderToStaticMarkup(<MatrixStageView />);
  it('renders exactly one HUD column and no hub cards', () => {
    expect(html).toContain('class="matrix-stage-hud"');
    expect(html).not.toContain('matrix-card');
    expect(html).not.toContain('matrix-hub-grid');
    expect((html.match(/<aside/g) ?? []).length).toBe(1);
  });
  it('shows the four controls and no stage props (no figures, no legend of props)', () => {
    for (const c of ['Zapytaj Genesis', 'Światy 3D', 'Konsola badawcza', 'Mapa systemu']) expect(html).toContain(c);
    expect(html).not.toContain('matrix-stage-legend');
  });
  it('without a backend the readout says so instead of showing a number', () => {
    expect(html).toContain('brak backendu');
    expect(html).not.toMatch(/CPU \d/);
    expect(html).toContain('nic nie zasila Winner Gate');
  });
});
