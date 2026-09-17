import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }

export type ElementId = 'H' | 'C' | 'N' | 'O';
export const ELEMENTS: Record<ElementId, { mass: number; vdw: number; charge: number }> = {
  H: { mass: 1.008, vdw: 1.2, charge: 0.1 }, C: { mass: 12.011, vdw: 1.7, charge: 0.0 },
  N: { mass: 14.007, vdw: 1.55, charge: -0.2 }, O: { mass: 15.999, vdw: 1.52, charge: -0.3 },
};
export interface Atom { readonly id: number; readonly element: ElementId; x: number; y: number; z: number; vx: number; vy: number; vz: number; }
export interface Bond { readonly a: number; readonly b: number; readonly k: number; readonly rest: number; }
export interface QuantumState { atoms: Atom[]; bonds: Bond[]; t: number; seed: number; }
export interface ForceMatrixResult { matrix: Float64Array; n: number; symmetric: boolean; }

/** Deterministic non-opioid scaffold builder (6-ring + polar substituents) from seed. */
export function buildMolecule(seed: number): QuantumState {
  const rng = mulberry32(seed); const atoms: Atom[] = []; const bonds: Bond[] = [];
  const ringEls: ElementId[] = ['C', 'C', 'N', 'C', 'C', 'O'];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = 1.4;
    atoms.push({ id: i, element: ringEls[i], x: Math.cos(a) * r, y: Math.sin(a) * r, z: (rng() - 0.5) * 0.1, vx: 0, vy: 0, vz: 0 });
    const j = (i + 1) % 6; bonds.push({ a: i, b: j, k: 300, rest: 1.4 }); }
  const subs: ElementId[] = ['O', 'N', 'H'];
  subs.forEach((el, s) => { const base = s * 2; const a = (base / 6) * Math.PI * 2; const r = 2.4;
    const id = atoms.length; atoms.push({ id, element: el, x: Math.cos(a) * r, y: Math.sin(a) * r, z: (rng() - 0.5) * 0.3, vx: 0, vy: 0, vz: 0 });
    bonds.push({ a: base, b: id, k: 250, rest: 1.2 }); });
  return { atoms, bonds, t: 0, seed };
}
const dist = (a: Atom, b: Atom) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Effective symmetric spring-coupling matrix (bonds + short-range nonbonded). */
export function computeForceMatrix(st: QuantumState, cutoff = 3.0): ForceMatrixResult {
  const n = st.atoms.length; const m = new Float64Array(n * n);
  for (const b of st.bonds) { m[b.a * n + b.b] = b.k; m[b.b * n + b.a] = b.k; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = dist(st.atoms[i], st.atoms[j]);
    if (d < cutoff && m[i * n + j] === 0) { const c = 40 / (d * d); m[i * n + j] = c; m[j * n + i] = c; } }
  let symmetric = true; for (let i = 0; i < n && symmetric; i++) for (let j = 0; j < n; j++) if (Math.abs(m[i * n + j] - m[j * n + i]) > 1e-9) { symmetric = false; break; }
  return { matrix: m, n, symmetric };
}
function forces(st: QuantumState): Float64Array {
  const n = st.atoms.length; const f = new Float64Array(n * 3);
  for (const b of st.bonds) { const a = st.atoms[b.a], c = st.atoms[b.b]; const d = Math.max(1e-6, dist(a, c)); const s = b.k * (d - b.rest);
    const ux = (c.x - a.x) / d, uy = (c.y - a.y) / d, uz = (c.z - a.z) / d;
    f[b.a * 3] += s * ux; f[b.a * 3 + 1] += s * uy; f[b.a * 3 + 2] += s * uz;
    f[b.b * 3] -= s * ux; f[b.b * 3 + 1] -= s * uy; f[b.b * 3 + 2] -= s * uz; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = st.atoms[i], c = st.atoms[j]; const d = Math.max(0.8, dist(a, c));
    if (d < 3.0) { const rep = 60 / (d * d * d); const ux = (c.x - a.x) / d, uy = (c.y - a.y) / d, uz = (c.z - a.z) / d;
      f[i * 3] -= rep * ux; f[i * 3 + 1] -= rep * uy; f[i * 3 + 2] -= rep * uz;
      f[j * 3] += rep * ux; f[j * 3 + 1] += rep * uy; f[j * 3 + 2] += rep * uz; } }
  return f;
}
/** Velocity-Verlet deterministic integrator. */
export function stepQuantum(st: QuantumState, dt: number): QuantumState {
  const n = st.atoms.length; const f0 = forces(st);
  const atoms = st.atoms.map(a => ({ ...a }));
  for (let i = 0; i < n; i++) { const m = ELEMENTS[atoms[i].element].mass;
    atoms[i].x += atoms[i].vx * dt + 0.5 * (f0[i * 3] / m) * dt * dt;
    atoms[i].y += atoms[i].vy * dt + 0.5 * (f0[i * 3 + 1] / m) * dt * dt;
    atoms[i].z += atoms[i].vz * dt + 0.5 * (f0[i * 3 + 2] / m) * dt * dt; }
  const mid: QuantumState = { atoms, bonds: st.bonds, t: st.t + dt, seed: st.seed };
  const f1 = forces(mid);
  for (let i = 0; i < n; i++) { const m = ELEMENTS[atoms[i].element].mass;
    atoms[i].vx += 0.5 * ((f0[i * 3] + f1[i * 3]) / m) * dt;
    atoms[i].vy += 0.5 * ((f0[i * 3 + 1] + f1[i * 3 + 1]) / m) * dt;
    atoms[i].vz += 0.5 * ((f0[i * 3 + 2] + f1[i * 3 + 2]) / m) * dt; }
  return mid;
}
export function totalEnergy(st: QuantumState): number {
  let e = 0; for (const a of st.atoms) { const m = ELEMENTS[a.element].mass; e += 0.5 * m * (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz); }
  for (const b of st.bonds) { const d = dist(st.atoms[b.a], st.atoms[b.b]); e += 0.5 * b.k * (d - b.rest) ** 2; }
  return +e.toFixed(6);
}
export function quantumFingerprint(st: QuantumState): string {
  return sha256hex(stableStringify({ seed: st.seed, t: +st.t.toFixed(4), atoms: st.atoms.map(a => [a.id, a.element, +a.x.toFixed(4), +a.y.toFixed(4), +a.z.toFixed(4)]) }));
}
