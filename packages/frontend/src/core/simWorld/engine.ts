import { canonicalJson, fnv1a } from '../events/hash';

/**
 * SIM WORLD — deterministic procedural telemetry engine (docs/DECISIONS.md
 * D-056). `state = f(seed, params, t)`: every sampled value is a pure,
 * closed-form/noise function of time and the frozen spec, never a live
 * simulation or a physical prediction. `DISCLOSURE` is mandatory in any UI
 * surface that shows this engine's output.
 *
 * SCOPE (see docs/DECISIONS.md D-056's own "what this entry does NOT do"):
 * this file is ONLY the deterministic sampling/fingerprinting core from the
 * source bundle. The bundle's first-person 3D scenes (`LabScene`/
 * `SpaceScene`, built on `@react-three/fiber`/`@react-three/drei`, neither
 * of which is a dependency of this repo) are NOT built in this pass —
 * deliberately scoped down to what is real, tested, and verifiable without
 * a live 3D render, rather than shipping several hundred lines of WebGL
 * component code with no way to visually confirm it renders correctly.
 *
 * Hash: reuses the existing Genesis provider (`core/events/hash.ts`,
 * fnv1a) — same resolution as D-052/D-053/D-054/D-055, not a fourth
 * reimplementation of a SHA-256 system.
 */

export type SimKind = 'LAB_CELL' | 'LAB_PLASMA' | 'LAB_CENTRIFUGE' | 'SPACE_BLACKHOLE' | 'SPACE_WORMHOLE' | 'SPACE_PHILLY' | 'WORLD_CITY';

export interface SimParams {
  readonly [key: string]: number;
}

export interface SimSpec {
  readonly kind: SimKind;
  readonly seed: number;
  readonly params: SimParams;
  readonly dt: number;
  readonly tEnd: number;
}

export interface SimState {
  readonly t: number;
  readonly scalars: Readonly<Record<string, number>>;
  readonly series: readonly number[];
}

export const DISCLOSURE =
  "PROCEDURAL SIMULATION / VISUALIZATION ONLY — not a physical prediction, not real equipment, not evidence. 'Philadelphia' scenario = science-fiction legend (unconfirmed), labelled as such.";

export const RANGES: Readonly<Record<string, readonly [number, number]>> = {
  dose_uM: [0, 1000],
  drive_Hz: [0.1, 120],
  rpmTarget: [0, 15000],
  isco_r: [1.1, 20],
  spin_a: [0, 0.998],
  throat_r: [0.2, 5],
  flow_rate: [0, 100],
  field_strength: [0, 1],
  cityBlocks: [8, 256],
  citySeedJitter: [0, 1],
};

export class FailClosedError extends Error {
  constructor(message: string) {
    super(`FAIL_CLOSED: ${message}`);
    this.name = 'FailClosedError';
  }
}

export const specFingerprint = (spec: SimSpec): string => fnv1a(canonicalJson(spec));

function noiseHash(x: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(a: number, b: number, u: number): number {
  return a + (b - a) * (u * u * (3 - 2 * u));
}
function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  return smooth(noiseHash(i, seed), noiseHash(i + 1, seed), f);
}

function P(spec: SimSpec, key: string, dflt: number): number {
  const v = spec.params[key];
  if (v === undefined) return dflt;
  const range = RANGES[key];
  if (range && (v < range[0] || v > range[1])) {
    throw new FailClosedError(`param ${key}=${v} out of range [${range[0]},${range[1]}]`);
  }
  return v;
}

export function sampleAt(spec: SimSpec, t: number): Readonly<Record<string, number>> {
  const s = spec.seed;
  switch (spec.kind) {
    case 'LAB_CELL': {
      const dose = P(spec, 'dose_uM', 5);
      const viab = (1 / (1 + Math.pow(dose / 4, 2))) * (0.7 + 0.3 * noise1(t * 0.2, s));
      return { viability: viab, glow: viab, pump: 0.5 + 0.5 * Math.sin(t * 0.8) };
    }
    case 'LAB_PLASMA': {
      const f = P(spec, 'drive_Hz', 27);
      const arc = Math.max(0, Math.sin(t * f * 0.05)) * (0.6 + 0.4 * noise1(t * 3, s));
      return { arc, coil: arc, hum: 0.3 + 0.7 * arc };
    }
    case 'LAB_CENTRIFUGE': {
      const target = P(spec, 'rpmTarget', 9000);
      const rpm = target * (1 - Math.exp(-t / 4));
      return { rpm, spin: rpm / 1000, vibration: 0.02 + 0.02 * noise1(t * 8, s) };
    }
    case 'SPACE_BLACKHOLE': {
      const a = P(spec, 'spin_a', 0.9);
      const isco = P(spec, 'isco_r', 6);
      return { diskSpeed: (0.4 + a) / isco, photonFlicker: 0.75 + 0.25 * noise1(t * 2, s), horizonR: 1, lensTilt: 0.35 + 0.1 * Math.sin(t * 0.1) };
    }
    case 'SPACE_WORMHOLE': {
      const r = P(spec, 'throat_r', 1.4);
      const flow = P(spec, 'flow_rate', 40);
      return { throat: r * (1 + 0.08 * Math.sin(t * 0.7)), flow, swirl: t * (0.5 + flow / 100) };
    }
    case 'SPACE_PHILLY': {
      const F = P(spec, 'field_strength', 0.8);
      const ramp = Math.min(1, t / 12) * F;
      return { field: ramp, shimmer: ramp * (0.6 + 0.4 * noise1(t * 5, s)), visibility: 1 - ramp * 0.85 };
    }
    default:
      return { h: 0 };
  }
}

export function runSim(spec: SimSpec): SimState {
  const steps = Math.max(1, Math.floor(spec.tEnd / spec.dt));
  const series: number[] = [];
  let last: Readonly<Record<string, number>> = {};
  for (let i = 0; i <= steps; i++) {
    last = sampleAt(spec, i * spec.dt);
    const firstKey = Object.keys(last)[0];
    series.push(firstKey !== undefined ? last[firstKey]! : 0);
  }
  if (spec.kind === 'WORLD_CITY') {
    const n = Math.floor(P(spec, 'cityBlocks', 64));
    const arr: number[] = [];
    for (let b = 0; b < n; b++) arr.push(0.2 + noiseHash(b, spec.seed) * 0.8 * (0.4 + 0.6 * noise1(b * 0.05, spec.seed)));
    return { t: spec.tEnd, scalars: { blocks: n }, series: arr };
  }
  return { t: spec.tEnd, scalars: last, series };
}

/** Real re-run: two independent `runSim` calls on fingerprint-equal specs must produce byte-identical state. */
export const replayEqual = (a: SimSpec, b: SimSpec): boolean => specFingerprint(a) === specFingerprint(b) && canonicalJson(runSim(a)) === canonicalJson(runSim(b));
