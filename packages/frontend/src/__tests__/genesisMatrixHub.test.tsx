import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenesisMatrixHub, kindsOf, computeGraphLayout, domainCenters, countIsolatedNodes, type MatrixKind } from '../components/GenesisMatrixHub';
import type { SavedExperiment } from '../core/scienceMemory';

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

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

  it('with zero records, the graph says so honestly rather than rendering an empty canvas', () => {
    expect(html).toContain('Graf relacji');
    expect(html).toContain('Brak rekordów, więc graf jest pusty');
  });
});

describe('computeGraphLayout / domainCenters (master gap plan P1.4) — deterministic, domain-grouped, never randomised', () => {
  it('is deterministic: the same input always produces the same positions', () => {
    const nodes = [{ id: 'a', labId: 'cyber-security' }, { id: 'b', labId: 'decipherment' }, { id: 'c', labId: 'cyber-security' }];
    const first = computeGraphLayout(nodes);
    const second = computeGraphLayout(nodes);
    for (const id of ['a', 'b', 'c']) expect(first.get(id)).toEqual(second.get(id));
  });

  it('is stable to input ORDER, not just input identity — a re-render with records in a different order does not reshuffle the layout', () => {
    const nodes = [{ id: 'a', labId: 'cyber-security' }, { id: 'b', labId: 'decipherment' }, { id: 'c', labId: 'cyber-security' }];
    const shuffled = [nodes[2]!, nodes[0]!, nodes[1]!];
    const a = computeGraphLayout(nodes);
    const b = computeGraphLayout(shuffled);
    for (const id of ['a', 'b', 'c']) expect(a.get(id)).toEqual(b.get(id));
  });

  it('groups nodes by domain: two nodes in the SAME labId are closer together than either is to a node in a DIFFERENT labId', () => {
    const nodes = [
      { id: 'cyber-1', labId: 'cyber-security' }, { id: 'cyber-2', labId: 'cyber-security' },
      { id: 'decipherment-1', labId: 'decipherment' },
    ];
    const positions = computeGraphLayout(nodes);
    const withinDomain = distance(positions.get('cyber-1')!, positions.get('cyber-2')!);
    const acrossDomain = distance(positions.get('cyber-1')!, positions.get('decipherment-1')!);
    expect(withinDomain).toBeLessThan(acrossDomain);
  });

  it('places a single node at the origin rather than an arbitrary offset', () => {
    const positions = computeGraphLayout([{ id: 'only', labId: 'cyber-security' }]);
    // `-0` from the trig here is numerically zero (`Object.is(-0, 0)` is the
    // only thing that disagrees) — `toBeCloseTo` treats them as equal, `toEqual` does not.
    expect(positions.get('only')?.x).toBeCloseTo(0);
    expect(positions.get('only')?.y).toBeCloseTo(0);
  });

  it('domainCenters reports one center per real domain, with an honest count', () => {
    const nodes = [
      { id: 'a', labId: 'cyber-security' }, { id: 'b', labId: 'cyber-security' }, { id: 'c', labId: 'decipherment' },
    ];
    const centers = domainCenters(nodes);
    expect(centers).toHaveLength(2);
    expect(centers.find((c) => c.labId === 'cyber-security')?.count).toBe(2);
    expect(centers.find((c) => c.labId === 'decipherment')?.count).toBe(1);
  });
});

/**
 * countIsolatedNodes — triaged out of the abandoned
 * `claude/genesis-graphics-engine-v1-wd0r66` branch: the one real gap its
 * self-relation/isolated-band work found underneath a lot that duplicated
 * what this file already has. A record with zero real edges used to be
 * indistinguishable, in the toolbar count, from a well-connected one.
 */
describe('countIsolatedNodes — an honest count of records with zero real edges', () => {
  it('counts a node with no edges at all as isolated', () => {
    expect(countIsolatedNodes(['a', 'b'], [{ fromId: 'a', toId: 'a' }])).toBe(1); // 'b' unreferenced
  });

  it('a node referenced as either fromId or toId is not isolated', () => {
    expect(countIsolatedNodes(['a', 'b', 'c'], [{ fromId: 'a', toId: 'b' }])).toBe(1); // only 'c'
  });

  it('zero edges means every node is isolated', () => {
    expect(countIsolatedNodes(['a', 'b'], [])).toBe(2);
  });

  it('zero nodes means zero isolated, never a negative or fabricated count', () => {
    expect(countIsolatedNodes([], [])).toBe(0);
  });

  it('every node connected means zero isolated', () => {
    expect(countIsolatedNodes(['a', 'b', 'c'], [
      { fromId: 'a', toId: 'b' }, { fromId: 'b', toId: 'c' },
    ])).toBe(0);
  });
});
