/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../../expansionHash.js';
import type { SandboxContext, SpeculativeSolverState, SpeculativeSolverPlugin, WarningFlag } from './speculativeTypes.js';
export interface WarpParams { readonly R: number; readonly sigma: number; readonly vS: number; readonly pathLength: number; }
export interface WarpState extends SpeculativeSolverState { readonly xS: number; readonly properTime: number; readonly coordinateTime: number; readonly f: number; readonly theta: number; readonly rhoEff: number; readonly dtaudt: number; }
const shape = (rs: number, R: number, sigma: number): number => (Math.tanh(sigma * (rs + R)) - Math.tanh(sigma * (rs - R))) / (2 * Math.tanh(sigma * R));
const dShape = (rs: number, R: number, sigma: number, h = 1e-4): number => (shape(rs + h, R, sigma) - shape(rs - h, R, sigma)) / (2 * h);
/** Simplified Alcubierre lapse/shift field solver (natural units c=1). Exotic-matter proxy always flagged. */
export class WarpMetricSolver implements SpeculativeSolverPlugin<WarpParams> {
  readonly id = 'warp-metric'; readonly tag = 'UNPHYSICAL_THEORY' as const;
  createInitialState(ctx: SandboxContext, p: WarpParams): WarpState {
    const rs = p.pathLength; const f = shape(rs, p.R, p.sigma); const df = dShape(rs, p.R, p.sigma);
    const dtaudt = Math.sqrt(Math.max(0, 1 - p.vS * p.vS * f * f));
    return { solverId: this.id, tag: this.tag, step: 0, fields: {}, scalars: { R: p.R, sigma: p.sigma, vS: p.vS, pathLength: p.pathLength }, warnings: this.warns(p, df), provenanceHash: sha256hex(stableStringify({ seed: ctx.seed, p })), xS: 0, properTime: 0, coordinateTime: 0, f, theta: -p.vS * df, rhoEff: -df * df * p.vS * p.vS, dtaudt };
  }
  step(state: WarpState, ctx: SandboxContext, p: WarpParams): WarpState {
    const xS = state.xS + p.vS * ctx.dt;
    const rs = Math.max(0, p.pathLength - xS);
    const f = shape(rs, p.R, p.sigma); const df = dShape(rs, p.R, p.sigma);
    const dtaudt = Math.sqrt(Math.max(0, 1 - p.vS * p.vS * f * f));
    const gain = xS / Math.max(1e-9, state.properTime + dtaudt * ctx.dt);
    const warns = this.warns(p, df); if (gain > 1) warns.push('NON_METRIC_SHORTCUT');
    return { ...state, step: state.step + 1, xS, properTime: state.properTime + dtaudt * ctx.dt, coordinateTime: state.coordinateTime + ctx.dt, f, theta: -p.vS * df, rhoEff: -df * df * p.vS * p.vS, dtaudt, warnings: warns };
  }
  private warns(p: WarpParams, df: number): WarningFlag[] { const w: WarningFlag[] = ['NEGATIVE_ENERGY_REQUIRED']; if (Math.abs(df) > 0 && p.vS > 1) w.push('NON_METRIC_SHORTCUT'); return w; }
  warnings(state: WarpState): readonly WarningFlag[] { return state.warnings; }
  fingerprint(state: WarpState): string { return sha256hex(stableStringify({ xS: +state.xS.toFixed(9), pt: +state.properTime.toFixed(9), ct: +state.coordinateTime.toFixed(9), f: +state.f.toFixed(9), rho: +state.rhoEff.toFixed(12), prov: state.provenanceHash })); }
}
