import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ScientificResultInspector } from '../components/ScientificResultInspector';
import type { ScienceRun, ScienceRunVerification } from '../core/backend/client';

const RUN: ScienceRun = {
  id: 'run-1', campaignId: 'campaign-1', candidateId: 'candidate-1',
  engine: 'rdkit', engineVersion: '2026.3.6', capability: 'molecular-descriptors', method: 'canonical',
  status: 'COMPLETED', evidenceClass: 'MODEL_ESTIMATE', inputs: {}, outputs: {}, units: {},
  warnings: ['Applicability domain is limited.'], provenance: { source: 'canonical-toolchain', modelVersion: '2026.3.6' },
  inputHash: 'input-fingerprint', outputHash: 'output-fingerprint',
  artifacts: [{ kind: 'json', path: 'result.json', sha256_16: '0123456789abcdef' }],
  durationMs: 12, createdAt: 1, environmentHash: 'environment-fingerprint',
};

describe('ScientificResultInspector', () => {
  it('shows canonical identity, provenance, replay and the computational claim boundary', () => {
    const verification: ScienceRunVerification = {
      id: 'verify-1', scienceRunId: RUN.id, verdict: 'MATCH',
      originalOutputHash: RUN.outputHash, replayOutputHash: RUN.outputHash,
      originalEngineVersion: RUN.engineVersion, replayEngineVersion: RUN.engineVersion,
      detail: {}, createdAt: 2,
    };
    const html = renderToStaticMarkup(<ScientificResultInspector run={RUN} verification={verification} onVerify={vi.fn()} />);
    expect(html).toContain('rdkit');
    expect(html).toContain('input-fingerprint');
    expect(html).toContain('output-fingerprint');
    expect(html).toContain('canonical-toolchain');
    expect(html).toContain('MATCH — wynik odtworzony');
    expect(html).toContain('Nie jest pomiarem laboratoryjnym');
  });

  it('does not invent missing hashes or replay', () => {
    const html = renderToStaticMarkup(<ScientificResultInspector run={{ ...RUN, inputHash: null, outputHash: null }} onVerify={vi.fn()} />);
    expect(html).toContain('UNAVAILABLE');
    expect(html).toContain('NOT_VERIFIED');
  });
});
