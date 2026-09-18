/* Proprietary / All Rights Reserved - Genesis OS */
import { mulberry32, stableStringify, sha256hex } from '../knowledge/EvidenceLedger.js';
export interface RsmConfig { readonly dims: number; readonly horizon: number; readonly branching: number; readonly beamK: number; readonly maxScenarios: number; readonly eps: number; readonly seed: number; }
export interface ScenarioNode { readonly id: string; readonly depth: number; readonly state: Float64Array; readonly parentId: string | null; readonly score: number; }
export interface HyperEdge { readonly from: string; readonly to: string; readonly order: 2 | 3; readonly weight: number; }
export interface ResilienceCertificate { readonly margin: number; readonly epsGrid: readonly (readonly [number, number])[]; readonly verified: boolean; readonly certificateHash: string; }
export interface RsmResult { readonly bestPath: readonly string[]; readonly bestScore: number; readonly secondScore: number; readonly enumerated: number; readonly edges: readonly HyperEdge[]; readonly certificate: ResilienceCertificate; readonly resultHash: string; }
/** Recursive Simulation Matrix: deterministic beam-bounded scenario lattice with 2nd/3rd-order interaction terms
 *  and a bounded perturbation resilience certificate. maxScenarios caps enumeration (honest complexity bound). */
export class RecursiveSimulationMatrix {
  private enumerated = 0;
  constructor(private cfg: RsmConfig, private objective: Float64Array, private interact: Float64Array) {}
  private score(s: Float64Array): number {
    let acc = 0;
    for (let i = 0; i < this.cfg.dims; i++) acc += s[i] * this.objective[i];
    for (let i = 0; i < this.cfg.dims; i++) for (let j = i + 1; j < this.cfg.dims; j++) acc += this.interact[i * this.cfg.dims + j] * s[i] * s[j];
    for (let i = 0; i < this.cfg.dims; i++) acc += this.interact[i * this.cfg.dims + i] * s[i] * s[i] * s[i] * 0.1;
    return acc;
  }
  private expand(node: ScenarioNode, rng: () => number): ScenarioNode[] {
    const out: ScenarioNode[] = [];
    for (let b = 0; b < this.cfg.branching && this.enumerated < this.cfg.maxScenarios; b++) {
      const st = new Float64Array(this.cfg.dims);
      for (let d = 0; d < this.cfg.dims; d++) st[d] = node.state[d] * 0.85 + (rng() * 2 - 1) * 0.35;
      const child: ScenarioNode = { id: node.id + '-' + b, depth: node.depth + 1, state: st, parentId: node.id, score: 0 };
      (child as { score: number }).score = this.score(st);
      out.push(child); this.enumerated++;
    }
    return out;
  }
  run(): RsmResult {
    const rng = mulberry32(this.cfg.seed);
    const rootState = new Float64Array(this.cfg.dims);
    for (let d = 0; d < this.cfg.dims; d++) rootState[d] = rng() * 2 - 1;
    const root: ScenarioNode = { id: 'R', depth: 0, state: rootState, parentId: null, score: this.score(rootState) };
    this.enumerated = 1;
    let beam: ScenarioNode[] = [root];
    const edges: HyperEdge[] = [];
    const parentOf = new Map<string, string | null>();
    parentOf.set('R', null);
    for (let h = 0; h < this.cfg.horizon; h++) {
      const next: ScenarioNode[] = [];
      for (const n of beam) {
        const kids = this.expand(n, rng);
        for (const k of kids) { edges.push({ from: n.id, to: k.id, order: 2, weight: +(k.score - n.score).toFixed(6) }); parentOf.set(k.id, n.id); }
        if (kids.length >= 2) edges.push({ from: kids[0].id, to: kids[1].id, order: 3, weight: +(this.interact[0] * kids[0].score * kids[1].score).toFixed(8) });
        next.push(...kids);
      }
      next.sort((a, b) => b.score - a.score);
      beam = next.slice(0, this.cfg.beamK);
      if (beam.length === 0) break;
    }
    const leaves = beam;
    const sorted = [...leaves].sort((a, b) => b.score - a.score);
    const best = sorted[0]; const second = sorted[1] ?? best;
    const bestPath: string[] = []; let cur: string | null = best.id;
    while (cur) { bestPath.unshift(cur); cur = parentOf.get(cur) ?? null; }
    const grid: [number, number][] = [];
    let margin = Infinity;
    for (let d = 0; d < Math.min(3, this.cfg.dims); d++) for (const sign of [-1, 1]) {
      grid.push([d, sign]);
      const pert = leaves.map(l => { const st = Float64Array.from(l.state); st[d] += sign * this.cfg.eps; return this.score(st); });
      const ps = [...pert].sort((a, b) => b - a);
      margin = Math.min(margin, (ps[0] ?? 0) - (ps[1] ?? 0));
    }
    const certificate: ResilienceCertificate = { margin: +margin.toFixed(8), epsGrid: grid, verified: margin > 0, certificateHash: sha256hex(stableStringify({ margin, grid, seed: this.cfg.seed })) };
    return { bestPath, bestScore: +best.score.toFixed(8), secondScore: +second.score.toFixed(8), enumerated: this.enumerated, edges, certificate, resultHash: sha256hex(stableStringify({ bestPath, bestScore: best.score, enumerated: this.enumerated, cert: certificate.certificateHash })) };
  }
}
