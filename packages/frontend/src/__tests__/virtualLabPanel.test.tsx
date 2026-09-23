import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VirtualLabPanel } from '../components/VirtualLabPanel';

describe('VirtualLabPanel', () => {
  it('exposes the canonical bounded loop and an explicit computational claim boundary', () => {
    const html = renderToStaticMarkup(
      <VirtualLabPanel
        projectId="project-1"
        campaignId="campaign-1"
        candidates={[{
          id: 'candidate-1', generation: 0, parentSmiles: null, transformation: null,
          canonicalSmiles: 'CCO', valid: true, descriptors: {}, objectiveVector: {},
          constraintViolations: [], pareto: true, status: 'retained', rejectedReason: null, runIds: [],
        }]}
      />,
    );

    expect(html).toContain('data-testid="virtual-lab-panel"');
    expect(html).toContain('Plan experiment');
    expect(html).toContain('Execute with registered engine');
    expect(html).toContain('Replay result');
    expect(html).toContain('Clinical efficacy: UNKNOWN');
    expect(html).toContain('Molecular dynamics (currently unbound)');
  });
});
