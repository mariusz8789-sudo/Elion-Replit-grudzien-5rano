import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenesisMatrixHub, kindsOf, type MatrixKind } from '../components/GenesisMatrixHub';
import type { SavedExperiment } from '../core/scienceMemory';

/**
 * This repo's component tests run without a DOM (`renderToStaticMarkup`,
 * no `window`) — `core/storage.ts::isAvailable()` already degrades
 * gracefully to an empty store in that environment, so `GenesisMatrixHub`
 * renders its real, honest empty state here rather than needing a mocked
 * localStorage. The classification logic (`kindsOf`) is real, pure, and
 * exported specifically so it can be tested directly against real
 * `SavedExperiment` shapes, without needing a DOM or a seeded store at all.
 */

const baseRecord = (overrides: Partial<SavedExperiment> = {}): SavedExperiment => ({
  id: 'exp-1', createdAt: new Date().toISOString(), labId: 'lab-1', experimentId: 'e-1',
  experimentName: 'Test experiment', params: {}, stats: {}, honesty: 'simplified', honestyNote: 'test fixture',
  equations: [], assumptions: [], epistemicStatus: 'PREDICTION', contentHash: 'test-hash',
  ...overrides,
});

describe('kindsOf — real classification, never fabricated or uncategorized', () => {
  it('a record with no optional shape is still classified, as EXPERIMENT', () => {
    expect(kindsOf(baseRecord())).toEqual(['EXPERIMENT']);
  });

  it('discoveryLoop/hypothesisLoop/parameterInquiry all mean HYPOTHESIS', () => {
    expect(kindsOf(baseRecord({ discoveryLoop: {} as SavedExperiment['discoveryLoop'] }))).toContain('HYPOTHESIS');
    expect(kindsOf(baseRecord({ hypothesisLoop: {} as SavedExperiment['hypothesisLoop'] }))).toContain('HYPOTHESIS');
    expect(kindsOf(baseRecord({ parameterInquiry: {} as SavedExperiment['parameterInquiry'] }))).toContain('HYPOTHESIS');
  });

  it('biotech, realExperimentVerification, substitutionInvestigation, and evidence ids all mean EVIDENCE', () => {
    expect(kindsOf(baseRecord({ biotech: {} as SavedExperiment['biotech'] }))).toContain('EVIDENCE');
    expect(kindsOf(baseRecord({ realExperimentVerification: {} as SavedExperiment['realExperimentVerification'] }))).toContain('EVIDENCE');
    expect(kindsOf(baseRecord({ substitutionInvestigation: {} as SavedExperiment['substitutionInvestigation'] }))).toContain('EVIDENCE');
    expect(kindsOf(baseRecord({ evidencePackId: 'pack-1' }))).toContain('EVIDENCE');
  });

  it('a record can honestly carry multiple kinds at once', () => {
    const kinds = kindsOf(baseRecord({
      discoveryLoop: {} as SavedExperiment['discoveryLoop'],
      biotech: {} as SavedExperiment['biotech'],
    }));
    expect(kinds).toContain('HYPOTHESIS');
    expect(kinds).toContain('EVIDENCE');
    expect(kinds).toHaveLength(2);
  });

  it('scenario and counterfactual both mean SCENARIO; cyberInvestigation means CYBER; worldDiscovery means WORLD', () => {
    expect(kindsOf(baseRecord({ scenario: {} as SavedExperiment['scenario'] }))).toEqual<MatrixKind[]>(['SCENARIO']);
    expect(kindsOf(baseRecord({ counterfactual: {} as SavedExperiment['counterfactual'] }))).toEqual<MatrixKind[]>(['SCENARIO']);
    expect(kindsOf(baseRecord({ cyberInvestigation: {} as SavedExperiment['cyberInvestigation'] }))).toEqual<MatrixKind[]>(['CYBER']);
    expect(kindsOf(baseRecord({ worldDiscovery: {} as SavedExperiment['worldDiscovery'] }))).toEqual<MatrixKind[]>(['WORLD']);
  });
});

describe('GenesisMatrixHub (no DOM — storage.ts degrades to an empty store)', () => {
  it('renders the honest empty state rather than fabricating data', () => {
    const html = renderToStaticMarkup(<GenesisMatrixHub />);
    expect(html).toContain('Scientific Memory jest pusta');
    expect(html).toContain('0 pozycji');
    expect(html).not.toContain('matrix-card"');
  });

  it('never claims to be the only place to interact with a kind — links out to existing dedicated screens', () => {
    const html = renderToStaticMarkup(<GenesisMatrixHub />);
    expect(html).toContain('Matrix');
  });
});
