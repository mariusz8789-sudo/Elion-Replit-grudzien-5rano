import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EvidenceReplayPanel } from '../components/visual-simulation/EvidenceReplayPanel';

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
