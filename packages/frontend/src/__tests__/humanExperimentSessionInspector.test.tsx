import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HumanExperimentSessionInspector } from '../components/HumanExperimentSessionInspector';
import type { ExperimentSession } from '../core/scientificWorlds/experimentSession';

const SESSION: ExperimentSession = {
  sessionId: 'ses-1', worldId: 'human-world', stationId: 'hyperscope', experimentId: 'histology', seed: 7,
  inputs: { tissue: 'cardiac' }, steps: ['prepare', 'render'], outputs: { cells: 12 },
  evidenceHashes: ['evidence-1'], contentHash: 'content-hash', epistemicStatus: 'MODEL',
  engineLabel: 'HISTOLOGY_VIRTUAL_MODEL', replayFingerprint: 'replay-fingerprint', createdAtLogicalTime: 4,
};

describe('HumanExperimentSessionInspector', () => {
  it('shows the real sealed session identities without upgrading its epistemic status', () => {
    const html = renderToStaticMarkup(<HumanExperimentSessionInspector session={SESSION} />);
    expect(html).toContain('HISTOLOGY_VIRTUAL_MODEL');
    expect(html).toContain('content-hash');
    expect(html).toContain('replay-fingerprint');
    expect(html).toContain('evidence-1');
    expect(html).toContain('does not upgrade a model or simulation to an observation');
  });

  it('reports the honest empty state', () => {
    expect(renderToStaticMarkup(<HumanExperimentSessionInspector session={null} />))
      .toContain('No executed experiment is attached');
  });
});
