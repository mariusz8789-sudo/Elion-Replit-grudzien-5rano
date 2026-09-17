import { mulberry32, stableStringify, sha256hex, assessCandidate } from './GenesisPhysicoChemicalSandbox.js';
import type { MolecularGraph, CandidateAssessment, ElementId } from './GenesisPhysicoChemicalSandbox.js';
export interface Clock { now(): number; }

export interface Fragment { readonly name: string; readonly atoms: readonly ElementId[]; readonly internalBonds: readonly (readonly [number, number, number])[]; }
export const FRAGMENTS: readonly Fragment[] = Object.freeze([
  Object.freeze({ name: 'methyl', atoms: ['C'], internalBonds: [] }),
  Object.freeze({ name: 'benzene', atoms: ['C', 'C', 'C', 'C', 'C', 'C'], internalBonds: [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 0, 2]] }),
  Object.freeze({ name: 'carboxyl', atoms: ['C', 'O', 'O'], internalBonds: [[0, 1, 2], [0, 2, 1]] }),
  Object.freeze({ name: 'amine', atoms: ['N'], internalBonds: [] }),
  Object.freeze({ name: 'hydroxyl', atoms: ['O'], internalBonds: [] }),
  Object.freeze({ name: 'amide', atoms: ['C', 'N', 'O'], internalBonds: [[0, 1, 1], [0, 2, 2]] }),
  Object.freeze({ name: 'thiol', atoms: ['S'], internalBonds: [] }),
]);
export type Genome = readonly number[];
export interface SearchParams { seed: number; maxIterations: number; populationSize: number; targetMW: number; targetLogP: number; targetFitness: number; plateauLimit: number; }
export interface HistoryEntry { readonly iteration: number; readonly bestFitness: number; readonly bestFingerprint: string; }
export interface SearchResult {
  readonly seed: number; readonly iterations: number; readonly visitedCount: number;
  readonly best: { readonly genome: Genome; readonly fingerprint: string; readonly assessment: CandidateAssessment } | null;
  readonly history: readonly HistoryEntry[]; readonly startedAt: number; readonly finishedAt: number;
  readonly dataLabel: 'SYNTHETIC_CANDIDATE'; readonly resultFingerprint: string;
}
const VALENCE_MAX: Record<ElementId, number> = { H: 1, C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, P: 3 };

/** Build a molecular graph from a fragment genome; connecting bonds respect free valence. */
export function buildGraph(genome: Genome): MolecularGraph {
  const atoms: ElementId[] = []; const bonds: [number, number, number][] = []; const free: number[] = [];
  const offsets: number[] = [];
  for (const fi of genome) {
    const f = FRAGMENTS[fi % FRAGMENTS.length]; const off = atoms.length; offsets.push(off);
    for (const a of f.atoms) { atoms.push(a); free.push(VALENCE_MAX[a]); }
    for (const [a, b, o] of f.internalBonds) { if (free[off + a] >= o && free[off + b] >= o) { bonds.push([off + a, off + b, o]); free[off + a] -= o; free[off + b] -= o; } }
  }
  for (let k = 1; k < offsets.length; k++) { const a = offsets[k - 1], b = offsets[k]; if (free[a] >= 1 && free[b] >= 1) { bonds.push([a, b, 1]); free[a] -= 1; free[b] -= 1; } }
  return { atoms, bonds };
}
export const genomeFingerprint = (g: Genome): string => sha256hex(stableStringify(g));

/** Never-Give-Up iterative evolutionary search. Fully deterministic from seed. */
export class GenesisMolecularSearchCore {
  constructor(private clock: Clock, private params: SearchParams) {}
  private fitness(a: CandidateAssessment): number {
    if (!a.valenceOk) return -1;
    const mwScore = 1 - Math.min(1, Math.abs(a.descriptors.mw - this.params.targetMW) / 150);
    const logpScore = 1 - Math.min(1, Math.abs(a.descriptors.logP - this.params.targetLogP) / 2.5);
    const lip = a.lipinskiPass ? 1 : 0;
    return +(0.3 * mwScore + 0.25 * logpScore + 0.25 * lip + 0.2 * a.stabilityScore).toFixed(6);
  }
  private randomGenome(rng: () => number): Genome { const len = 4 + Math.floor(rng() * 5); return Array.from({ length: len }, () => Math.floor(rng() * FRAGMENTS.length)); }
  private mutate(g: Genome, rng: () => number): Genome {
    const arr = [...g]; const op = rng();
    if (op < 0.5 || arr.length <= 2) { const i = Math.floor(rng() * arr.length); arr[i] = Math.floor(rng() * FRAGMENTS.length); }
    else if (op < 0.75) { arr.splice(Math.floor(rng() * arr.length), 0, Math.floor(rng() * FRAGMENTS.length)); }
    else { arr.splice(Math.floor(rng() * arr.length), 1); }
    return arr;
  }
  private crossover(a: Genome, b: Genome, rng: () => number): Genome { const cut = Math.floor(rng() * Math.min(a.length, b.length)); return [...a.slice(0, cut), ...b.slice(cut)]; }
  run(): SearchResult {
    const rng = mulberry32(this.params.seed);
    const startedAt = this.clock.now();
    let pop: Genome[] = Array.from({ length: this.params.populationSize }, () => this.randomGenome(rng));
    const ledger = new Map<string, number>();
    const history: HistoryEntry[] = [];
    let best: { genome: Genome; fingerprint: string; assessment: CandidateAssessment } | null = null;
    let bestFit = -Infinity; let plateau = 0; let iter = 0;
    for (; iter < this.params.maxIterations; iter++) {
      const evaluated = pop.map(g => {
        const fp = genomeFingerprint(g);
        const cached = ledger.get(fp);
        if (cached !== undefined) return { g, fp, fit: cached, assessment: null as CandidateAssessment | null };
        const assessment = assessCandidate(buildGraph(g), this.params.seed);
        const fit = this.fitness(assessment); ledger.set(fp, fit); return { g, fp, fit, assessment };
      });
      evaluated.sort((x, y) => y.fit - x.fit);
      const cur = evaluated[0];
      if (cur.fit > bestFit) { bestFit = cur.fit; best = { genome: cur.g, fingerprint: cur.fp, assessment: cur.assessment ?? assessCandidate(buildGraph(cur.g), this.params.seed) }; plateau = 0; }
      else plateau++;
      history.push({ iteration: iter, bestFitness: +bestFit.toFixed(6), bestFingerprint: best?.fingerprint ?? '' });
      if (bestFit >= this.params.targetFitness) { iter++; break; }
      if (plateau >= this.params.plateauLimit) { pop = [best?.genome ?? cur.g, ...Array.from({ length: this.params.populationSize - 1 }, () => this.mutate(best?.genome ?? cur.g, rng))]; plateau = 0; continue; }
      const next: Genome[] = [evaluated[0].g, evaluated[1].g];
      while (next.length < this.params.populationSize) { const a = evaluated[Math.floor(rng() * evaluated.length)].g; const b = evaluated[Math.floor(rng() * evaluated.length)].g; next.push(this.mutate(this.crossover(a, b, rng), rng)); }
      pop = next;
    }
    const finishedAt = this.clock.now();
    const resultFingerprint = sha256hex(stableStringify({ seed: this.params.seed, bestFit: +bestFit.toFixed(6), iterations: iter, visited: ledger.size }));
    return { seed: this.params.seed, iterations: iter, visitedCount: ledger.size, best, history, startedAt, finishedAt, dataLabel: 'SYNTHETIC_CANDIDATE', resultFingerprint };
  }
}
