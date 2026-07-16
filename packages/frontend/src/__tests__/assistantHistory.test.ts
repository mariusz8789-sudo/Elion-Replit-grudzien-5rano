/**
 * assistantHistory (Stage 4) — per-user localStorage "My Analyses" store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const REPORT = { inchiKey: 'X', molecularFormula: 'C9H8O4', props: { molWt: 180, logP: 1.3, tpsa: 63, hbd: 1, hba: 3, lipinskiViolations: 0, lipinskiPass: true }, notes: [] };

describe('assistantHistory', () => {
  it('saves and lists analyses newest-first, scoped to the owner', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    const m = await import('../core/assistantHistory');
    m.saveAnalysis({ ownerId: 'u1', name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O', status: 'VERIFIED', report: REPORT, date: 1 });
    m.saveAnalysis({ ownerId: 'u1', name: 'Etanol', smiles: 'CCO', status: 'VERIFIED', report: REPORT, date: 2 });
    m.saveAnalysis({ ownerId: 'u2', name: 'Other', smiles: 'C', status: 'VERIFIED', report: REPORT, date: 3 });
    const mine = m.listAnalyses('u1');
    expect(mine.length).toBe(2);
    expect(mine[0].name).toBe('Etanol'); // newest first
    expect(m.listAnalyses('u2').length).toBe(1);
  });
  it('reopens a saved analysis by id (report preserved for the report screen)', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    const m = await import('../core/assistantHistory');
    const saved = m.saveAnalysis({ ownerId: 'u1', name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O', status: 'VERIFIED', report: REPORT });
    const got = m.getAnalysis('u1', saved.id);
    expect(got?.smiles).toBe('CC(=O)Oc1ccccc1C(=O)O');
    expect(got?.report?.molecularFormula).toBe('C9H8O4');
    expect(m.getAnalysis('u2', saved.id)).toBe(null); // not visible to another user
  });
  it('deletes an analysis for the owner only', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    const m = await import('../core/assistantHistory');
    const s = m.saveAnalysis({ ownerId: 'u1', name: 'x', smiles: 'C', status: 'INVALID', report: null });
    m.deleteAnalysis('u1', s.id);
    expect(m.listAnalyses('u1').length).toBe(0);
  });
  it('ignores malformed persisted data', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    const m = await import('../core/assistantHistory');
    (window.localStorage as Storage).setItem('genesis-os:assistant-history/v1', '{"bad":true}');
    expect(m.listAnalyses('u1')).toEqual([]);
  });
});
