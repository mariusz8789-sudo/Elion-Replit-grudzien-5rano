import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalSimulationSnapshotPanel, formatLocalSimulationSnapshotStatusLine } from '../components/visual-simulation/LocalSimulationSnapshotPanel';

describe('LOCAL_SIMULATION_SNAPSHOT panel accessibility boundary', () => {
  it('starts collapsed with an accessible disclosure control and no fabricated experiment result', () => {
    const markup = renderToStaticMarkup(<LocalSimulationSnapshotPanel />);

    expect(markup).toContain('LOCAL_SIMULATION_SNAPSHOT (DEMO)');
    // The old name must not come back: it is what made a browser-local demo readable as
    // canonical Genesis Evidence (D-172).
    expect(markup).not.toContain('EVIDENCE &amp; REPLAY');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('0 zapisanych');
    expect(markup).not.toContain('MATCH');
    expect(markup).not.toContain('DRIFT');
  });
});

describe('DEMO_REPLAY status honesty', () => {
  it('labels the persisted verdict as a snapshot until a fresh DEMO_REPLAY exists', () => {
    const current = { record: { scenarios: { baseline: 'BASELINE', variant: 'ISOLATION' }, demoReplay: { status: 'MATCH' } } } as never;
    expect(formatLocalSimulationSnapshotStatusLine(current, 1, null)).toContain('snapshot MATCH');
    expect(formatLocalSimulationSnapshotStatusLine(current, 1, { status: 'MATCH' } as never)).toContain('DEMO_REPLAY MATCH');
  });
});
