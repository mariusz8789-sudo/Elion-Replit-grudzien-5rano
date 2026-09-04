import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EvidenceReplayPanel, formatEvidenceStatusLine } from '../components/visual-simulation/EvidenceReplayPanel';

describe('Evidence Replay panel accessibility boundary', () => {
  it('starts collapsed with an accessible disclosure control and no fabricated experiment result', () => {
    const markup = renderToStaticMarkup(<EvidenceReplayPanel />);

    expect(markup).toContain('EVIDENCE &amp; REPLAY');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('0 zapisanych');
    expect(markup).not.toContain('MATCH');
    expect(markup).not.toContain('DRIFT');
  });
});

describe('Evidence Replay status honesty', () => {
  it('labels persisted verdict as snapshot until a fresh replay exists', () => {
    const current = { record: { scenarios: { baseline: 'BASELINE', variant: 'ISOLATION' }, replay: { status: 'MATCH' } } } as never;
    expect(formatEvidenceStatusLine(current, 1, null)).toContain('snapshot MATCH');
    expect(formatEvidenceStatusLine(current, 1, { status: 'MATCH' } as never)).toContain('replay MATCH');
  });
});
