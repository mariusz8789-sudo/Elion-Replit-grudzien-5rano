import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export type GateOp = { type: 'H' | 'X'; q: number } | { type: 'CNOT'; q: number; q2: number } | { type: 'Rz'; q: number; theta: number };
export interface CircuitResult { readonly probs: Float64Array; readonly stateFingerprint: string; readonly dataLabel: 'RELATIVISTIC_SIMULATION'; }
/** Deterministic complex state-vector quantum simulator (amplitudes exact; no sampling randomness). */
export class GenesisQuantumComputeEngine {
  private re: Float64Array; private im: Float64Array; readonly n: number;
  constructor(nQubits: number) { this.n = nQubits; const dim = 1 << nQubits; this.re = new Float64Array(dim); this.im = new Float64Array(dim); this.re[0] = 1; }
  apply(op: GateOp): void { const dim = 1 << this.n;
    if (op.type === 'H') { const s = Math.SQRT1_2; for (let i = 0; i < dim; i++) { if ((i >> op.q) & 1) continue; const j = i | (1 << op.q); const a = this.re[i], ai = this.im[i], b = this.re[j], bi = this.im[j]; this.re[i] = s * (a + b); this.im[i] = s * (ai + bi); this.re[j] = s * (a - b); this.im[j] = s * (ai - bi); } }
    else if (op.type === 'X') { for (let i = 0; i < dim; i++) { if ((i >> op.q) & 1) continue; const j = i | (1 << op.q); const tr = this.re[i], ti = this.im[i]; this.re[i] = this.re[j]; this.im[i] = this.im[j]; this.re[j] = tr; this.im[j] = ti; } }
    else if (op.type === 'CNOT') { for (let i = 0; i < dim; i++) { if (!((i >> op.q) & 1)) continue; if ((i >> op.q2) & 1) continue; const j = i | (1 << op.q2); const tr = this.re[i], ti = this.im[i]; this.re[i] = this.re[j]; this.im[i] = this.im[j]; this.re[j] = tr; this.im[j] = ti; } }
    else { for (let i = 0; i < dim; i++) { const bit = (i >> op.q) & 1; const ph = bit ? -op.theta / 2 : op.theta / 2; const c = Math.cos(ph), s = Math.sin(ph); const r = this.re[i], im = this.im[i]; this.re[i] = r * c - im * s; this.im[i] = r * s + im * c; } } }
  measureProbs(q: number): { p0: number; p1: number } { let p1 = 0; for (let i = 0; i < this.re.length; i++) if ((i >> q) & 1) p1 += this.re[i] * this.re[i] + this.im[i] * this.im[i]; return { p0: +(1 - p1).toFixed(8), p1: +p1.toFixed(8) }; }
  result(): CircuitResult { const probs = new Float64Array(this.re.length); for (let i = 0; i < probs.length; i++) probs[i] = +(this.re[i] * this.re[i] + this.im[i] * this.im[i]).toFixed(8); return { probs, stateFingerprint: sha256hex(stableStringify(Array.from(probs))), dataLabel: 'RELATIVISTIC_SIMULATION' }; }
}
export type ClaimStatus = 'VERIFIED_HISTORICAL' | 'VERIFIED_EXPERIMENT' | 'VERIFIED_SCIENCE_COMMUNICATION' | 'THEORETICAL_PHYSICS' | 'SPECULATIVE_FICTION' | 'UNSUBSTANTIATED_CLAIM';
export interface FrontierEntry { readonly id: string; readonly title: string; readonly claimStatus: ClaimStatus; readonly evidenceNote: string; }
export const FRONTIER_KNOWLEDGE: readonly FrontierEntry[] = [
  { id: 'MAJORANA_PHYSICIST', title: 'Ettore Majorana (1906–1938)', claimStatus: 'VERIFIED_HISTORICAL', evidenceNote: 'Włoski fizyk teoretyczny; zaginął w 1938 r. (rejs Palermo–Neapol). Fakt zaginięcia potwierdzony; teorie o losie = niesprawdzone.' },
  { id: 'MAJORANA_FERMION', title: 'Fermiony Majorany / zero-modes', claimStatus: 'THEORETICAL_PHYSICS', evidenceNote: 'Równanie Majorany (1937) realne; kwazicząstki Majorany w materii skondensowanej są przedmiotem badań; brak jednoznacznego potwierdzenia.' },
  { id: 'GERDA_EXPERIMENT', title: 'GERDA (Gran Sasso)', claimStatus: 'VERIFIED_EXPERIMENT', evidenceNote: 'Realny eksperyment poszukujący bezneutrinowego podwójnego rozpadu beta Ge-76; wyznaczył limity czasu połowicznego rozpadu; brak potwierdzonej detekcji.' },
  { id: 'INTERSTELLAR_GARGANTUA', title: 'Gargantua / soczewkowanie (Interstellar)', claimStatus: 'VERIFIED_SCIENCE_COMMUNICATION', evidenceNote: 'Kip Thorne: wizualizacja czarnej dziury Kerra i dylatacji czasu opublikowana naukowo (Class. Quantum Grav. 2015); obraz filmu zgodny z OTW.' },
  { id: 'TESSERACT_BULK', title: 'Tesseract / istoty z bulk', claimStatus: 'SPECULATIVE_FICTION', evidenceNote: 'Urządzenie i motyw z filmu; nie model naukowy.' },
  { id: 'CLOSED_TIMELIKE_CURVES', title: 'Zamknięte krzywe czasopodobne (CTC)', claimStatus: 'THEORETICAL_PHYSICS', evidenceNote: 'Rozwiązania OTW (Gödel, Tipler) dopuszczają CTC tylko z egzotyczną materią; niezrealizowane fizycznie.' },
  { id: 'TIME_TRAVELER_CLAIMS', title: 'Twierdzenia o podróżnikach w czasie', claimStatus: 'UNSUBSTANTIATED_CLAIM', evidenceNote: 'Brak zweryfikowanych dowodów; traktować jako folklor internetowy, nie dane.' },
];
/** Frontier knowledge + deterministic visualization params for the cinematic/5D engine. */
export class GenesisQuantumFrontierEngine {
  constructor(private clock: Clock, private seed: number) {}
  getKnowledge(id: string): FrontierEntry | undefined { return FRONTIER_KNOWLEDGE.find(e => e.id === id); }
  listKnowledge(): readonly FrontierEntry[] { return FRONTIER_KNOWLEDGE; }
  visualizationParams(id: string): { id: string; spin: number; lensRing: number; warp: number; claimStatus: ClaimStatus; fingerprint: string } | undefined {
    const e = this.getKnowledge(id); if (!e) return undefined;
    const rng = mulberry32(this.seed ^ parseInt(sha256hex(id).slice(0, 8), 16));
    const spin = +(rng()).toFixed(3); const lensRing = +(1.5 + rng() * 2).toFixed(3); const warp = +(0.1 + rng() * 0.4).toFixed(3);
    return { id, spin, lensRing, warp, claimStatus: e.claimStatus, fingerprint: sha256hex(stableStringify({ id, spin, lensRing, warp, seed: this.seed })) };
  }
}
