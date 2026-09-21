/* Proprietary / All Rights Reserved - Genesis OS */
import { SpeculativeSolverRegistry, RetrocausalTreeSolver, TorsionBoundarySolver, WarpMetricSolver } from './compute/speculative-core.mjs';

const registry = new SpeculativeSolverRegistry();
registry.register(new RetrocausalTreeSolver());
registry.register(new TorsionBoundarySolver());
registry.register(new WarpMetricSolver());
const SOLVERS = new Set(['retrocausal-tree', 'torsion-boundary', 'warp-metric']);
const finiteParams = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 32).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k.slice(0, 48), v]));
};
const solverParams = (solverId, value) => {
  const params = finiteParams(value);
  if (solverId === 'torsion-boundary') return { radii: [2, 4], pitch: [0.5, 1], reflectivity: [0.8, 0.6], gridSize: 24, D: 0.2, lambda: 0.05, alpha: 0.2, beta: 0.5, I0: 0.1, ell: 3, ...params };
  if (solverId === 'retrocausal-tree') return { depth: 4, branches: 4, temperature: 0.7, gamma: 0.9, maxIter: 50, tol: 1e-6, eta: 0.2, ...params };
  return { R: 1, sigma: 2, vS: 0.6, pathLength: 10, ...params };
};
const errorFor = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_request';
  if (!SOLVERS.has(body.solverId)) return 'unknown_solver';
  if (!body.context || body.context.allowUnphysicalSandbox !== true) return 'sandbox_disabled';
  if (!Number.isFinite(body.context.dt) || body.context.dt <= 0 || body.context.dt > 10) return 'invalid_context';
  if (!Number.isInteger(body.context.seed) || body.context.seed < 0 || body.context.seed > 0xffffffff) return 'invalid_context';
  return null;
};
const clock = { now: () => 0 };
export function runSpeculative(body) {
  const error = errorFor(body);
  if (error) return { ok: false, error };
  const ctx = { allowUnphysicalSandbox: true, dt: body.context.dt, seed: body.context.seed, clock };
  const result = registry.run(body.solverId, solverParams(body.solverId, body.params), ctx);
  if (!result.ok) return result;
  return {
    ok: true,
    solverId: body.solverId,
    warnings: result.warnings,
    fingerprint: result.fingerprint,
    provenanceHash: result.state?.provenanceHash,
    summary: body.solverId === 'retrocausal-tree' ? 'Backend registry: retrocausal fixed-point step completed.' : body.solverId === 'torsion-boundary' ? 'Backend registry: torsion boundary relaxation step completed.' : 'Backend registry: warp metric step completed; exotic-energy warning retained.',
    state: result.state,
    source: 'backend-registry',
    epistemicTag: result.state?.tag,
    allowUnphysicalSandbox: true,
  };
}
