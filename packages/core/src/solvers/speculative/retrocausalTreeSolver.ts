/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../../expansionHash.js';
import { mulberry32 } from '../../expansionHash.js';
import type { SandboxContext, SpeculativeSolverState, SpeculativeSolverPlugin, WarningFlag } from './speculativeTypes.js';
export interface RetrocausalParams { readonly depth: number; readonly branches: number; readonly temperature: number; readonly gamma: number; readonly maxIter: number; readonly tol: number; readonly eta: number; }
export interface RetrocausalState extends SpeculativeSolverState { readonly weights: Float64Array; readonly V: Float64Array; readonly iterations: number; readonly converged: boolean; }
const softmax = (z: Float64Array, T: number): Float64Array => { const m = Math.max(...Array.from(z)); const e = Float64Array.from(z, v => Math.exp((v - m) / Math.max(1e-9, T))); const s = Array.from(e).reduce((a, b) => a + b, 0); return Float64Array.from(e, v => v / s); };
/** Looking-Glass-style retrocausal tree: backward induction + future→past weight feedback as bounded fixed point. */
export class RetrocausalTreeSolver implements SpeculativeSolverPlugin<RetrocausalParams> {
  readonly id = 'retrocausal-tree'; readonly tag = 'SPECULATIVE_SANDBOX_SOLVER' as const;
  createInitialState(ctx: SandboxContext, p: RetrocausalParams): RetrocausalState {
    const rng = mulberry32(ctx.seed);
    const dS = Float64Array.from({ length: p.branches }, () => 0.2 + rng() * 1.8);
    const weights = softmax(dS, p.temperature);
    const V = new Float64Array(p.depth + 1);
    return { solverId: this.id, tag: this.tag, step: 0, fields: { dS }, scalars: { temperature: p.temperature, gamma: p.gamma, eta: p.eta, tol: p.tol, maxIter: p.maxIter, depth: p.depth, branches: p.branches }, warnings: this.warningsOf(V, 0, p.maxIter, false), provenanceHash: sha256hex(stableStringify({ seed: ctx.seed, p })), weights, V, iterations: 0, converged: false };
  }
  step(state: RetrocausalState, _ctx: SandboxContext, p: RetrocausalParams): RetrocausalState {
    const { dS } = state.fields; const V = Float64Array.from(state.V); let weights: Float64Array<ArrayBufferLike> = state.weights;
    let iter = state.iterations; let converged = state.converged;
    const rng = mulberry32(state.provenanceHash.length); void rng;
    const obsLeaf = 0.5 + 0.5 * Math.sin(state.scalars['temperature'] ?? 1);
    if (iter < p.maxIter) {
      const Vprev = Float64Array.from(V);
      V[p.depth] = obsLeaf;
      for (let d = p.depth - 1; d >= 0; d--) { let acc = 0; for (let i = 0; i < p.branches; i++) acc += weights[i] * V[d + 1]; V[d] = 0.1 * (d + 1) + p.gamma * acc; }
      const z = Float64Array.from(dS, (v, i) => -(v + p.eta * V[1] * (i + 1) / p.branches));
      weights = softmax(z, p.temperature);
      let maxDiff = 0; for (let d = 0; d <= p.depth; d++) maxDiff = Math.max(maxDiff, Math.abs(V[d] - Vprev[d]));
      iter += 1; converged = maxDiff < p.tol;
    }
    return { ...state, step: state.step + 1, V, weights, iterations: iter, converged, warnings: this.warningsOf(V, iter, p.maxIter, converged) };
  }
  private warningsOf(_V: Float64Array, iter: number, maxIter: number, converged: boolean): WarningFlag[] {
    const w: WarningFlag[] = ['RETROCAUSAL_FIXED_POINT'];
    if (!converged && iter >= maxIter) w.push('UNCONVERGED_FIXED_POINT');
    return w;
  }
  warnings(state: RetrocausalState): readonly WarningFlag[] { return this.warningsOf(state.V, state.iterations, state.scalars['maxIter'] ?? 0, state.converged); }
  fingerprint(state: RetrocausalState): string { return sha256hex(stableStringify({ V: Array.from(state.V).map(v => +v.toFixed(9)), w: Array.from(state.weights).map(v => +v.toFixed(9)), iter: state.iterations, conv: state.converged, prov: state.provenanceHash })); }
}
