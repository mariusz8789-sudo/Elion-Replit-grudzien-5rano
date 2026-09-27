import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KnowledgeSourcesScreen } from '../components/KnowledgeSourcesScreen';

/**
 * Lightweight render test (no DOM, no fetch mock — the same technique
 * ChemistrySessionVisual.test.tsx uses): `renderToStaticMarkup` does not run
 * effects, so `listKnowledgeProposals()` is never actually called here. This
 * exercises the screen's real initial state — loading placeholder, the
 * sign-in hint for a logged-out browser, the static copy explaining the
 * `/ingest` -> proposal -> human-publish flow — without touching the network.
 */
describe('KnowledgeSourcesScreen — initial render (SW-5 knowledge/public-source surface)', () => {
  it('renders the screen root and explains the /ingest -> proposal -> publish flow', () => {
    const markup = renderToStaticMarkup(<KnowledgeSourcesScreen />);
    expect(markup).toContain('knowledge-sources-screen');
    expect(markup).toContain('/ingest');
    expect(markup).toContain('Wiedza i źródła publiczne');
  });

  it('shows the loading placeholder before the proposals listing resolves', () => {
    const markup = renderToStaticMarkup(<KnowledgeSourcesScreen />);
    expect(markup).toContain('Ładowanie');
  });

  it('shows the sign-in hint for a logged-out browser, since publishing needs an approver', () => {
    const markup = renderToStaticMarkup(<KnowledgeSourcesScreen />);
    expect(markup).toContain('knowledge-signin-hint');
    expect(markup).toContain('zalogowania');
  });
});
