/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const GENEALOGY_DISCLAIMER = 'Synthetic genealogical reconstruction (procedural DAG). NOT real genetic, archival, or civil-registry data. Migration routes are modeled estimates.';
export type Region = 'MESOAMERICA' | 'CENTRAL_EUROPE' | 'NEAR_EAST' | 'NORTH_AFRICA' | 'EAST_ASIA' | 'ANDES';
export interface AncestorNode { readonly nodeId: string; readonly name: string; readonly birthYear: number; readonly deathYear: number | null; readonly region: Region; readonly parents: readonly string[]; readonly migrationRoute: readonly Region[]; }
export interface GenealogyLinkEntry { readonly index: number; readonly at: number; readonly childId: string; readonly parentId: string; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; }
export interface GenealogicalGraph { readonly nodes: readonly AncestorNode[]; readonly rootId: string; readonly nodeHashes: Readonly<Record<string, string>>; readonly dataLabel: 'GENETIC_HISTORICAL_ESTIMATE'; readonly fingerprint: string; }
export interface GenealogyParadox { readonly nodeId: string; readonly kind: 'BIRTH_AFTER_DESCENDANT' | 'CYCLE' | 'MISSING_PARENT'; }
const REGIONS: readonly Region[] = ['MESOAMERICA', 'CENTRAL_EUROPE', 'NEAR_EAST', 'NORTH_AFRICA', 'EAST_ASIA', 'ANDES'];
const MIN_GEN_GAP = 12;
export function generateLineage(seed: number, generations: number, rootYear: number): { nodes: AncestorNode[]; rootId: string } {
  const rng = mulberry32(seed); const nodes: AncestorNode[] = [];
  const rootRegion = REGIONS[Math.floor(rng() * REGIONS.length)];
  nodes.push({ nodeId: 'N-0', name: 'ROOT-' + Math.floor(rng() * 900 + 100), birthYear: rootYear, deathYear: rootYear + 60, region: rootRegion, parents: [], migrationRoute: [rootRegion] });
  let frontier = [0]; let counter = 1;
  for (let g = 0; g < generations; g++) {
    const next: number[] = [];
    for (const ci of frontier) {
      const child = nodes[ci]; const parentIds: string[] = [];
      for (let p = 0; p < 2; p++) {
        const pBirth = child.birthYear - (25 + Math.floor(rng() * 10));
        const pRegion = rng() < 0.3 ? REGIONS[Math.floor(rng() * REGIONS.length)] : child.region;
        const id = 'N-' + counter++;
        nodes.push({ nodeId: id, name: 'ANC-' + Math.floor(rng() * 900 + 100), birthYear: pBirth, deathYear: pBirth + 55, region: pRegion, parents: [], migrationRoute: [child.region, pRegion] });
        parentIds.push(id); next.push(nodes.length - 1);
      }
      nodes[ci] = { ...child, parents: parentIds };
    }
    frontier = next;
  }
  return { nodes, rootId: 'N-0' };
}
export function analyzeGraph(nodes: readonly AncestorNode[], rootId: string): GenealogicalGraph {
  const hashes: Record<string, string> = {};
  for (let i = nodes.length - 1; i >= 0; i--) { const n = nodes[i]; hashes[n.nodeId] = sha256hex(stableStringify({ id: n.nodeId, name: n.name, birthYear: n.birthYear, region: n.region, parentHashes: n.parents.map(p => hashes[p] ?? 'MISSING') })); }
  const fingerprint = sha256hex(stableStringify({ rootId, hashes: nodes.map(n => hashes[n.nodeId]).sort() }));
  return { nodes, rootId, nodeHashes: hashes, dataLabel: 'GENETIC_HISTORICAL_ESTIMATE', fingerprint };
}
export function detectParadoxes(nodes: readonly AncestorNode[]): readonly GenealogyParadox[] {
  const byId = new Map(nodes.map(n => [n.nodeId, n])); const out: GenealogyParadox[] = [];
  for (const n of nodes) for (const p of n.parents) {
    const parent = byId.get(p);
    if (!parent) { out.push({ nodeId: n.nodeId, kind: 'MISSING_PARENT' }); continue; }
    if (parent.birthYear > n.birthYear - MIN_GEN_GAP) out.push({ nodeId: n.nodeId, kind: 'BIRTH_AFTER_DESCENDANT' });
  }
  const color = new Map<string, number>();
  const dfs = (id: string): boolean => { color.set(id, 1); const n = byId.get(id); if (n) for (const p of n.parents) { const c = color.get(p) ?? 0; if (c === 1) return true; if (c === 0 && dfs(p)) return true; } color.set(id, 2); return false; };
  for (const n of nodes) if ((color.get(n.nodeId) ?? 0) === 0 && dfs(n.nodeId)) { out.push({ nodeId: n.nodeId, kind: 'CYCLE' }); break; }
  return out;
}
export class GenesisGenealogicalTreeEngine {
  private ledger: GenealogyLinkEntry[] = [];
  constructor(private clock: Clock, private seed: number) {}
  buildLineage(generations: number, rootYear: number): GenealogicalGraph {
    const { nodes, rootId } = generateLineage(this.seed, generations, rootYear);
    for (const n of nodes) for (const p of n.parents) this.logLink(n.nodeId, p);
    return analyzeGraph(nodes, rootId);
  }
  private logLink(childId: string, parentId: string): void { const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS'; const at = this.clock.now(); const index = this.ledger.length; const payloadHash = sha256hex(stableStringify({ childId, parentId })); this.ledger.push(Object.freeze({ index, at, childId, parentId, payloadHash, prevHash: prev, hash: sha256hex(stableStringify({ index, childId, parentId, payloadHash, prevHash: prev, at })) })); }
  getLinkLedger(): readonly GenealogyLinkEntry[] { return this.ledger; }
  verifyLinkLedger(): { ok: boolean; errors: readonly string[] } { const errors: string[] = []; let prev = 'GENESIS'; for (const e of this.ledger) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index); if (e.hash !== sha256hex(stableStringify({ index: e.index, childId: e.childId, parentId: e.parentId, payloadHash: e.payloadHash, prevHash: e.prevHash, at: e.at }))) errors.push('HASH_MISMATCH@' + e.index); prev = e.hash; } return { ok: errors.length === 0, errors }; }
  disclaimer(): string { return GENEALOGY_DISCLAIMER; }
}
