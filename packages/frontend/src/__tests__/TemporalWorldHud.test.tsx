import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TemporalWorldHud } from '../components/visual-simulation/TemporalWorldHud';

describe('Temporal World HUD honesty boundary', () => {
  it('does not fabricate a timeline when no handoff exists', () => {
    const markup = renderToStaticMarkup(<TemporalWorldHud timeline={null} day={0} />);
    expect(markup).toContain('NOW · SIMULATED');
    expect(markup).toContain('Brak przekazanego przebiegu czasowego');
    expect(markup).not.toContain('TIMELINE A');
  });

  it('renders measured counterfactual branch data from the existing handoff', () => {
    const timeline = {
      epistemicStatus: 'SIMULATION',
      scenarioLabel: 'Izolacja',
      origin: 'fabric-run',
      runFingerprint: 'abcdef1234567890',
      series: [{}, {}, {}],
      counterfactual: {
        firstDivergentDay: 1,
        baseline: { series: [{ infectious: 4, deceased: 0 }] },
        variant: { series: [{ infectious: 2, deceased: 0 }] },
      },
    } as never;
    const markup = renderToStaticMarkup(<TemporalWorldHud timeline={timeline} day={0} />);
    expect(markup).toContain('TIMELINE A · BASELINE');
    expect(markup).toContain('TIMELINE B · COUNTERFACTUAL');
    expect(markup).toContain('FIRST DIVERGENCE · DAY 1');
    expect(markup).toContain('I 4 · D 0');
    expect(markup).toContain('I 2 · D 0');
  });
});
