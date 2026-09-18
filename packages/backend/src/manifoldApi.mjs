/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * GENESIS 5D MANIFOLD + SYSTEM TELEMETRY — the backend side of the 2040 HUD.
 *
 *   POST /api/manifold/evaluate  { nodeId?, points: [{x,y,z,temporalT,hyperspaceW}, …] }
 *     → Genesis5DManifoldEngine (discrete differential geometry in R^5, CPU SDF of the
 *       Tartaria architecture, SHA-256 provenance) wrapped in a GenesisEnterpriseCore
 *       receipt whose telemetry is sampled from THIS machine (os.cpus / totalmem /
 *       freemem / loadavg). Label GEOMETRIC_MODEL; nothing here feeds the Winner Gate.
 *   GET  /api/system/telemetry
 *     → the same real sample plus process facts (uptime, node version, pid). No constants.
 *
 * Wall-clock timestamps here are the backend's own clock (like knowledgeApi); all
 * geometry is deterministic and independent of it.
 */
import { Genesis5DManifoldEngine, GenesisEnterpriseCore, telemetryFromSample, osSampler, MAX_MANIFOLD_POINTS } from './compute/manifold-core.mjs';

const KEYS = ['x', 'y', 'z', 'temporalT', 'hyperspaceW'];
const fail = (error, message, status = 400) => ({ ok: false, error, message, status });

export function validatePoints(raw) {
  if (!Array.isArray(raw)) return fail('invalid_request', 'points must be an array');
  if (raw.length > MAX_MANIFOLD_POINTS) return fail('too_many_points', `at most ${MAX_MANIFOLD_POINTS} points`);
  const points = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || typeof p !== 'object') return fail('invalid_point', `point ${i} is not an object`);
    const out = {};
    for (const k of KEYS) {
      const v = p[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail('invalid_point', `point ${i}.${k} must be a finite number`);
      out[k] = v;
    }
    points.push(out);
  }
  return { ok: true, points };
}

const clock = { now: () => Date.now() };

/** deps.sampler lets tests inject a deterministic machine sample; production uses the OS. */
export function evaluateManifold(body, deps = {}) {
  const nodeId = typeof body?.nodeId === 'string' && body.nodeId.trim() ? body.nodeId.trim().slice(0, 64) : 'NODE-LOCAL';
  const v = validatePoints(body?.points);
  if (!v.ok) return v;
  const started = clock.now();
  try {
    const core = new GenesisEnterpriseCore(deps.clock ?? clock, deps.sampler ?? osSampler);
    const receipt = core.executePipeline(nodeId, v.points);
    return { ok: true, ...receipt, elapsedMs: clock.now() - started };
  } catch (e) {
    return fail('evaluation_failed', e instanceof Error ? e.message : String(e));
  }
}

export function systemTelemetry(deps = {}) {
  const sample = (deps.sampler ?? osSampler).sample();
  const t = telemetryFromSample(deps.nodeId ?? 'NODE-LOCAL', sample, (deps.clock ?? clock).now());
  return {
    ok: true,
    ...t,
    process: { uptimeSec: Math.round(process.uptime()), node: process.versions.node, pid: process.pid, platform: process.platform, arch: process.arch },
    label: 'MEASURED',
  };
}

/** Exposed so a test can assert the engine class the API uses is the core one, not a stub. */
export const ManifoldEngine = Genesis5DManifoldEngine;
