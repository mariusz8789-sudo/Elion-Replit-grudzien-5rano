import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldChrome } from '../components/genesis-ui/WorldChrome';

describe('WorldChrome (D-118)', () => {
  it('renders title, purpose, every badge with its tone and every KPI exactly as given', () => {
    const html = renderToStaticMarkup(
      <WorldChrome glyph="◫" domain="Epidemiology World" title="Miasto epidemiologiczne" purpose="Cel badawczy"
        badges={[{ label: 'REAL RUN', tone: 'real' }, { label: 'SCENA 3D · WIZUALIZACJA', tone: 'visual' }]}
        kpis={[{ label: 'dzień', value: 47 }]} actions={<button type="button">Tryb 2D</button>} />,
    );
    expect(html).toContain('data-testid="world-chrome"');
    expect(html).toContain('Miasto epidemiologiczne');
    expect(html).toContain('Cel badawczy');
    expect(html).toContain('gx-status real');
    expect(html).toContain('gx-status visual');
    expect(html).toContain('<b>47</b>');
    expect(html).toContain('Tryb 2D');
  });

  it('omits the state row entirely when there is nothing real to show', () => {
    const html = renderToStaticMarkup(<WorldChrome glyph="⬡" domain="X" title="Y" purpose="Z" />);
    expect(html).not.toContain('world-chrome-state');
  });
});
