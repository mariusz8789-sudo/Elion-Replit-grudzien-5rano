/* eslint-disable @typescript-eslint/no-unused-vars -- esbuild bundle of packages/core/src/solvers/speculative; regenerate, do not edit */
// packages/core/src/expansionHash.ts
import { createHash } from "node:crypto";
var stableStringify = (v) => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (typeof v === "object") {
    const o = v;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
};
var sha256hex = (t) => createHash("sha256").update(t, "utf8").digest("hex");
var mulberry32 = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// packages/core/src/solvers/speculative/speculativeRegistry.ts
var SpeculativeSolverRegistry = class {
  plugins = /* @__PURE__ */ new Map();
  ledger = [];
  register(p) {
    if (p.tag === "VERIFIED_PHYSICS") throw new Error("SPECULATIVE_REGISTRY_REJECTS_VERIFIED_TAG:" + p.id);
    this.plugins.set(p.id, p);
  }
  run(id, params, ctx) {
    const plugin = this.plugins.get(id);
    if (!plugin) return { ok: false, error: "UNKNOWN_SOLVER" };
    if (!ctx.allowUnphysicalSandbox) return { ok: false, error: "SANDBOX_DISABLED" };
    let state = plugin.createInitialState(ctx, params);
    state = plugin.step(state, ctx, params);
    const warnings = plugin.warnings(state);
    const fingerprint = plugin.fingerprint(state);
    const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : "GENESIS";
    const at = ctx.clock.now();
    const index = this.ledger.length;
    this.ledger.push(Object.freeze({ index, solverId: id, fingerprint, warnings, at, prevHash: prev, hash: sha256hex(stableStringify({ index, solverId: id, fingerprint, warnings, at, prevHash: prev })) }));
    if (ctx.ecs) {
      const e = ctx.ecs.createEntity();
      ctx.ecs.setComponent(e, "speculativeState", { solverId: id, tag: plugin.tag, fingerprint, warnings });
    }
    return { ok: true, state, warnings, fingerprint };
  }
  getLedger() {
    return this.ledger;
  }
  verifyLedger() {
    const errors = [];
    let prev = "GENESIS";
    for (const e of this.ledger) {
      if (e.prevHash !== prev) errors.push("CHAIN_BREAK@" + e.index);
      if (e.hash !== sha256hex(stableStringify({ index: e.index, solverId: e.solverId, fingerprint: e.fingerprint, warnings: e.warnings, at: e.at, prevHash: e.prevHash }))) errors.push("HASH_MISMATCH@" + e.index);
      prev = e.hash;
    }
    return { ok: errors.length === 0, errors };
  }
};

// packages/core/src/solvers/speculative/retrocausalTreeSolver.ts
var softmax = (z, T) => {
  const m = Math.max(...Array.from(z));
  const e = Float64Array.from(z, (v) => Math.exp((v - m) / Math.max(1e-9, T)));
  const s = Array.from(e).reduce((a, b) => a + b, 0);
  return Float64Array.from(e, (v) => v / s);
};
var RetrocausalTreeSolver = class {
  id = "retrocausal-tree";
  tag = "SPECULATIVE_SANDBOX_SOLVER";
  createInitialState(ctx, p) {
    const rng = mulberry32(ctx.seed);
    const dS = Float64Array.from({ length: p.branches }, () => 0.2 + rng() * 1.8);
    const weights = softmax(dS, p.temperature);
    const V = new Float64Array(p.depth + 1);
    return { solverId: this.id, tag: this.tag, step: 0, fields: { dS }, scalars: { temperature: p.temperature, gamma: p.gamma, eta: p.eta, tol: p.tol, maxIter: p.maxIter, depth: p.depth, branches: p.branches }, warnings: this.warningsOf(V, 0, p.maxIter, false), provenanceHash: sha256hex(stableStringify({ seed: ctx.seed, p })), weights, V, iterations: 0, converged: false };
  }
  step(state, _ctx, p) {
    const { dS } = state.fields;
    const V = Float64Array.from(state.V);
    let weights = state.weights;
    let iter = state.iterations;
    let converged = state.converged;
    const rng = mulberry32(state.provenanceHash.length);
    void rng;
    const obsLeaf = 0.5 + 0.5 * Math.sin(state.scalars["temperature"] ?? 1);
    if (iter < p.maxIter) {
      const Vprev = Float64Array.from(V);
      V[p.depth] = obsLeaf;
      for (let d = p.depth - 1; d >= 0; d--) {
        let acc = 0;
        for (let i = 0; i < p.branches; i++) acc += weights[i] * V[d + 1];
        V[d] = 0.1 * (d + 1) + p.gamma * acc;
      }
      const z = Float64Array.from(dS, (v, i) => -(v + p.eta * V[1] * (i + 1) / p.branches));
      weights = softmax(z, p.temperature);
      let maxDiff = 0;
      for (let d = 0; d <= p.depth; d++) maxDiff = Math.max(maxDiff, Math.abs(V[d] - Vprev[d]));
      iter += 1;
      converged = maxDiff < p.tol;
    }
    return { ...state, step: state.step + 1, V, weights, iterations: iter, converged, warnings: this.warningsOf(V, iter, p.maxIter, converged) };
  }
  warningsOf(_V, iter, maxIter, converged) {
    const w = ["RETROCAUSAL_FIXED_POINT"];
    if (!converged && iter >= maxIter) w.push("UNCONVERGED_FIXED_POINT");
    return w;
  }
  warnings(state) {
    return this.warningsOf(state.V, state.iterations, state.scalars["maxIter"] ?? 0, state.converged);
  }
  fingerprint(state) {
    return sha256hex(stableStringify({ V: Array.from(state.V).map((v) => +v.toFixed(9)), w: Array.from(state.weights).map((v) => +v.toFixed(9)), iter: state.iterations, conv: state.converged, prov: state.provenanceHash }));
  }
};

// packages/core/src/solvers/speculative/torsionBoundarySolver.ts
var configFactor = (p) => {
  let C = 0;
  for (let m = 0; m < p.radii.length; m++) C += (p.reflectivity[m] ?? 0) * (1 / Math.max(1e-6, p.radii[m])) * Math.exp(-(p.pitch[m] ?? 0));
  return C;
};
var TorsionBoundarySolver = class {
  id = "torsion-boundary";
  tag = "UNPHYSICAL_THEORY";
  createInitialState(ctx, p) {
    const n = p.gridSize * p.gridSize;
    return { solverId: this.id, tag: this.tag, step: 0, fields: {}, scalars: { gridSize: p.gridSize, D: p.D, lambda: p.lambda, alpha: p.alpha, beta: p.beta, I0: p.I0, ell: p.ell }, warnings: ["TORSION_BOUNDARY_SPECULATIVE"], provenanceHash: sha256hex(stableStringify({ seed: ctx.seed, p })), I: new Float64Array(n), tau: new Float64Array(n).fill(1), C: configFactor(p) };
  }
  step(state, _ctx, p) {
    const g = p.gridSize;
    const I = Float64Array.from(state.I);
    const next = Float64Array.from(I);
    const c = state.C;
    const center = (g - 1) / 2;
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
      const i = y * g + x;
      const l = x > 0 ? I[i - 1] : I[i], r = x < g - 1 ? I[i + 1] : I[i], u = y > 0 ? I[i - g] : I[i], d = y < g - 1 ? I[i + g] : I[i];
      const lap = l + r + u + d - 4 * I[i];
      const dist = Math.hypot(x - center, y - center);
      const S = c * Math.exp(-dist / Math.max(1e-6, p.ell));
      next[i] = I[i] + p.alpha * (p.D * lap - p.lambda * I[i] + S);
    }
    const tau = Float64Array.from(next, (v) => 1 / (1 + p.beta * Math.max(0, v - p.I0)));
    return { ...state, step: state.step + 1, I: next, tau, warnings: ["TORSION_BOUNDARY_SPECULATIVE"] };
  }
  warnings(_state) {
    return ["TORSION_BOUNDARY_SPECULATIVE"];
  }
  fingerprint(state) {
    const samp = Array.from(state.I).filter((_, i) => i % 7 === 0).map((v) => +v.toFixed(9));
    const ts = Array.from(state.tau).filter((_, i) => i % 7 === 0).map((v) => +v.toFixed(9));
    return sha256hex(stableStringify({ samp, ts, C: +state.C.toFixed(9), prov: state.provenanceHash }));
  }
};

// packages/core/src/solvers/speculative/warpMetricSolver.ts
var shape = (rs, R, sigma) => (Math.tanh(sigma * (rs + R)) - Math.tanh(sigma * (rs - R))) / (2 * Math.tanh(sigma * R));
var dShape = (rs, R, sigma, h = 1e-4) => (shape(rs + h, R, sigma) - shape(rs - h, R, sigma)) / (2 * h);
var WarpMetricSolver = class {
  id = "warp-metric";
  tag = "UNPHYSICAL_THEORY";
  createInitialState(ctx, p) {
    const rs = p.pathLength;
    const f = shape(rs, p.R, p.sigma);
    const df = dShape(rs, p.R, p.sigma);
    const dtaudt = Math.sqrt(Math.max(0, 1 - p.vS * p.vS * f * f));
    return { solverId: this.id, tag: this.tag, step: 0, fields: {}, scalars: { R: p.R, sigma: p.sigma, vS: p.vS, pathLength: p.pathLength }, warnings: this.warns(p, df), provenanceHash: sha256hex(stableStringify({ seed: ctx.seed, p })), xS: 0, properTime: 0, coordinateTime: 0, f, theta: -p.vS * df, rhoEff: -df * df * p.vS * p.vS, dtaudt };
  }
  step(state, ctx, p) {
    const xS = state.xS + p.vS * ctx.dt;
    const rs = Math.max(0, p.pathLength - xS);
    const f = shape(rs, p.R, p.sigma);
    const df = dShape(rs, p.R, p.sigma);
    const dtaudt = Math.sqrt(Math.max(0, 1 - p.vS * p.vS * f * f));
    const gain = xS / Math.max(1e-9, state.properTime + dtaudt * ctx.dt);
    const warns = this.warns(p, df);
    if (gain > 1) warns.push("NON_METRIC_SHORTCUT");
    return { ...state, step: state.step + 1, xS, properTime: state.properTime + dtaudt * ctx.dt, coordinateTime: state.coordinateTime + ctx.dt, f, theta: -p.vS * df, rhoEff: -df * df * p.vS * p.vS, dtaudt, warnings: warns };
  }
  warns(p, df) {
    const w = ["NEGATIVE_ENERGY_REQUIRED"];
    if (Math.abs(df) > 0 && p.vS > 1) w.push("NON_METRIC_SHORTCUT");
    return w;
  }
  warnings(state) {
    return state.warnings;
  }
  fingerprint(state) {
    return sha256hex(stableStringify({ xS: +state.xS.toFixed(9), pt: +state.properTime.toFixed(9), ct: +state.coordinateTime.toFixed(9), f: +state.f.toFixed(9), rho: +state.rhoEff.toFixed(12), prov: state.provenanceHash }));
  }
};
export {
  RetrocausalTreeSolver,
  SpeculativeSolverRegistry,
  TorsionBoundarySolver,
  WarpMetricSolver
};
