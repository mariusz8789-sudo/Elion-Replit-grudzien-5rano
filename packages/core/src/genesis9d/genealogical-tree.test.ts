import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateLineage, analyzeGraph, detectParadoxes, GenesisGenealogicalTreeEngine } from './GenesisGenealogicalTreeEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisGenealogicalTreeEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('genealogical tree engine', () => {
  it('binary DAG node count = 2^(g+1)-1', () => { const { nodes } = generateLineage(7, 3, 1900); expect(nodes.length).toBe(15); });
  it('graph fingerprint deterministic', () => { const a = analyzeGraph(generateLineage(7, 2, 1900).nodes, 'N-0'); const b = analyzeGraph(generateLineage(7, 2, 1900).nodes, 'N-0'); expect(a.fingerprint).toBe(b.fingerprint); });
  it('no paradoxes in generated lineage', () => { const { nodes } = generateLineage(7, 3, 1900); expect(detectParadoxes(nodes).length).toBe(0); });
  it('detects birth-after-descendant paradox', () => { const { nodes } = generateLineage(7, 1, 1900); const bad = nodes.map(n => n.nodeId === 'N-1' ? { ...n, birthYear: 1950 } : n); expect(detectParadoxes(bad).some(p => p.kind === 'BIRTH_AFTER_DESCENDANT')).toBe(true); });
  it('detects cycle', () => { const cyc = [{ nodeId: 'A', name: 'a', birthYear: 1900, deathYear: null, region: 'ANDES' as const, parents: ['B'], migrationRoute: ['ANDES'] }, { nodeId: 'B', name: 'b', birthYear: 1870, deathYear: null, region: 'ANDES' as const, parents: ['A'], migrationRoute: ['ANDES'] }]; expect(detectParadoxes(cyc).some(p => p.kind === 'CYCLE')).toBe(true); });
  it('detects missing parent', () => { const bad = [{ nodeId: 'A', name: 'a', birthYear: 1900, deathYear: null, region: 'ANDES' as const, parents: ['GHOST'], migrationRoute: ['ANDES'] }]; expect(detectParadoxes(bad).some(p => p.kind === 'MISSING_PARENT')).toBe(true); });
  it('link ledger chains & verifies', () => { const e = new GenesisGenealogicalTreeEngine(clock, 7); e.buildLineage(2, 1900); expect(e.getLinkLedger().length).toBe(6); expect(e.verifyLinkLedger().ok).toBe(true); });
  it('label GENETIC_HISTORICAL_ESTIMATE', () => { const e = new GenesisGenealogicalTreeEngine(clock, 7); expect(e.buildLineage(1, 1900).dataLabel).toBe('GENETIC_HISTORICAL_ESTIMATE'); });
  it('iron rules', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); });
});
