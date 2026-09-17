/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../../expansionHash.js';
import type { SandboxContext, SpeculativeSolverState, SpeculativeSolverPlugin, WarningFlag } from './speculativeTypes.js';
export interface TorsionParams { readonly radii: readonly number[]; readonly pitch: readonly number[]; readonly reflectivity: readonly number[]; readonly gridSize: number; readonly D: number; readonly lambda: number; readonly alpha: number; readonly beta: number; readonly I0: number; readonly ell: number; }
export interface TorsionState extends SpeculativeSolverState { readonly I: Float64Array; readonly tau: Float64Array; readonly C: number; }
const configFactor = (p: TorsionParams): number => { let C = 0; for (let m = 0; m < p.radii.length; m++) C += (p.reflectivity[m] ?? 0) * (1 / Math.max(1e-6, p.radii[m])) * Math.exp(-(p.pitch[m] ?? 0)); return C; };
/** Kozyrev-inspired nested-reflector boundary: relaxation PDE for information density I and clock-skew tau(x). */
export class TorsionBoundarySolver implements SpeculativeSolverPlugin<TorsionParams> {
  readonly id = 'torsion-boundary'; readonly tag = 'UNPHYSICAL_THEORY' as const;
  createInitialState(ctx: SandboxContext, p: TorsionParams): TorsionState {
    const n = p.gridSize * p.gridSize;
    return { solverId: this.id, tag: this.tag, step: 0, fields: {}, scalars: { gridSize: p.gridSize, D: p.D, lambda: p.lambda, alpha: p.alpha, beta: p.beta, I0: p.I0, ell: p.ell }, warnings: ['TORSION_BOUNDARY_SPECULATIVE'], provenanceHash: sha256hex(stableStringify({ seed: ctx.seed, p })), I: new Float64Array(n), tau: new Float64Array(n).fill(1), C: configFactor(p) };
  }
  step(state: TorsionState, _ctx: SandboxContext, p: TorsionParams): TorsionState {
    const g = p.gridSize; const I = Float64Array.from(state.I); const next = Float64Array.from(I);
    const c = state.C; const center = (g - 1) / 2;
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
      const i = y * g + x;
      const l = x > 0 ? I[i - 1] : I[i], r = x < g - 1 ? I[i + 1] : I[i], u = y > 0 ? I[i - g] : I[i], d = y < g - 1 ? I[i + g] : I[i];
      const lap = l + r + u + d - 4 * I[i];
      const dist = Math.hypot(x - center, y - center);
      const S = c * Math.exp(-dist / Math.max(1e-6, p.ell));
      next[i] = I[i] + p.alpha * (p.D * lap - p.lambda * I[i] + S);
    }
    const tau = Float64Array.from(next, v => 1 / (1 + p.beta * Math.max(0, v - p.I0)));
    return { ...state, step: state.step + 1, I: next, tau, warnings: ['TORSION_BOUNDARY_SPECULATIVE'] };
  }
  warnings(_state: TorsionState): readonly WarningFlag[] { return ['TORSION_BOUNDARY_SPECULATIVE']; }
  fingerprint(state: TorsionState): string { const samp = Array.from(state.I).filter((_, i) => i % 7 === 0).map(v => +v.toFixed(9)); const ts = Array.from(state.tau).filter((_, i) => i % 7 === 0).map(v => +v.toFixed(9)); return sha256hex(stableStringify({ samp, ts, C: +state.C.toFixed(9), prov: state.provenanceHash })); }
}
