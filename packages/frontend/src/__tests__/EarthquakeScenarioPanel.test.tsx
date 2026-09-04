import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EarthquakeScenarioPanel } from '../components/visual-simulation/EarthquakeScenarioPanel';

describe('Earthquake scenario panel disclosure boundary', () => {
  const renderPanel = () =>
    renderToStaticMarkup(<EarthquakeScenarioPanel onOverlayChange={() => undefined} />);

  it('keeps the synthetic, scenario-only, non-operational disclosure visible before a run', () => {
    const markup = renderPanel();

    expect(markup).toContain('SCENARIO');
    expect(markup).toContain('SYNTHETIC');
    expect(markup).toContain('NON_OPERATIONAL');
    expect(markup).toContain('nie są kalibracją ani obserwacją');
    expect(markup).toContain(
      'Brak danych obserwowanych, GIS, kalibracji, prognozy, oceny ofiar lub szkód, ewakuacji i kaskad infrastruktury.',
    );
  });

  it('renders controls only and cannot create another City3D canvas or renderer', () => {
    const markup = renderPanel();

    expect(markup).toContain('read-only overlay');
    expect(markup).toContain('Uruchom scenariusz');
    expect(markup).toContain('Local persisted runs (0)');
    expect(markup).not.toContain('<canvas');
    expect(markup).not.toContain('OBSERVED');
  });
});
