import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenesisMatrixHub, kindsOf, buildGraphLayout, type MatrixKind } from '../components/GenesisMatrixHub';
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

describe('buildGraphLayout — Etap 3 Matrix graph, deterministic and never reshuffled', () => {
  it('groups by primary kind into columns, ordered by ALL_KINDS, only for kinds actually present', () => {
    const items = [
      { record: baseRecord({ id: 'a', scenario: {} as SavedExperiment['scenario'] }), kinds: ['SCENARIO'] as MatrixKind[] },
      { record: baseRecord({ id: 'b', cyberInvestigation: {} as SavedExperiment['cyberInvestigation'] }), kinds: ['CYBER'] as MatrixKind[] },
    ];
    const layout = buildGraphLayout(items);
    // SCENARIO precedes CYBER in ALL_KINDS order — so with only these two kinds present,
    // SCENARIO's column must come first, and only these two columns should exist at all.
    expect(layout.columns).toEqual(['SCENARIO', 'CYBER']);
    expect(layout.positions.has('a')).toBe(true);
    expect(layout.positions.has('b')).toBe(true);
    expect(layout.positions.get('a')!.x).toBeLessThan(layout.positions.get('b')!.x);
  });

  it('orders records within a column chronologically (oldest first), not by insertion order', () => {
    const items = [
      { record: baseRecord({ id: 'newer', createdAt: '2025-01-02T00:00:00.000Z' }), kinds: ['EXPERIMENT'] as MatrixKind[] },
      { record: baseRecord({ id: 'older', createdAt: '2025-01-01T00:00:00.000Z' }), kinds: ['EXPERIMENT'] as MatrixKind[] },
    ];
    const layout = buildGraphLayout(items);
    expect(layout.positions.get('older')!.y).toBeLessThan(layout.positions.get('newer')!.y);
  });

  it('an empty item list produces a valid, non-zero layout rather than a degenerate one', () => {
    const layout = buildGraphLayout([]);
    expect(layout.columns).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe('GenesisMatrixHub (no DOM — storage.ts degrades to an empty store)', () => {
  const html = renderToStaticMarkup(<GenesisMatrixHub />);

  it('renders the workspace structure even with zero records — never a blank page', () => {
    // The loop, its columns and the rails exist before any data does; that is
    // what stops an empty Matrix from reading as a broken screen.
    expect(html).toContain('matrix-workspace');
    expect(html).toContain('Hypothesis → Prediction → Experiment → Evidence → Verdict → Memory → Next Action');
    expect(html).toContain('matrix-loop-columns');
  });

  it('states the empty state honestly instead of fabricating records', () => {
    expect(html).toContain('Brak aktywnego dochodzenia');
    expect(html).toContain('Brak rekordów w tej kategorii.');
    // Every loop column reports a real count of 0 rather than a seeded number.
    expect(html).toContain('<span class="matrix-loop-column-count">0</span>');
  });

  it('every empty loop stage offers the real screen that would create its first record', () => {
    expect(html).toContain('Uruchom Discovery Loop w World Engine →');
    expect(html).toContain('Uruchom scenariusz lub eksperyment →');
    expect(html).toContain('Zbuduj dochodzenie w Drug Discovery →');
  });

  it('docks the one real Science Chat rather than presenting a second chat surface', () => {
    expect(html).toContain('matrix-chat-dock');
    expect(html).toContain('Ta sama rozmowa co wszędzie w Genesis');
  });

  it('offers the List/Graph toggle even with zero records (defaults to List, per initial state)', () => {
    expect(html).toContain('mx-view-toggle');
    expect(html).toContain('>Lista<');
    expect(html).toContain('>Graf<');
    // Default view is the list — this is a static-markup render, so no click can switch it; the
    // graph's own interactive behavior (toggling, node selection) is proven by real browser E2E.
    expect(html).toContain('matrix-hub-grid');
    expect(html).not.toContain('mx-graph-svg');
  });
});
