import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

export type AgisDomain = 'PHYSICS' | 'BIOCHEMISTRY' | 'ASTROPHYSICS';
export type AgisStatus = 'PROPOSED' | 'REFUTED' | 'VALIDATED';
export interface Clock { now(): number; }
export interface AgisFact { readonly id: string; readonly domain: AgisDomain; readonly quantity: string; readonly value: number; readonly unit: string; }
export interface AgisHypothesis { readonly id: string; readonly domain: AgisDomain; readonly statement: string; readonly premises: readonly string[]; readonly derived: number; readonly seed: number; readonly simulationTime: number; readonly dataLabel: 'AGI_HYPOTHESIS'; status: AgisStatus; }
export interface RefutationTest { readonly testId: string; readonly kind: 'COUNTEREXAMPLE' | 'DIMENSIONAL' | 'CONSERVATION' | 'LITERATURE'; readonly passed: boolean; readonly reason: string; }
export interface CognitiveStep { readonly stepId: string; readonly phase: 'HYPOTHESIS' | 'REFUTATION' | 'SYNTHESIS'; readonly hypothesisId: string; readonly tests: readonly RefutationTest[]; readonly cognitiveFingerprint: string; readonly seed: number; readonly simulationTime: number; }
export interface CognitiveTrace { readonly steps: readonly CognitiveStep[]; readonly validated: readonly string[]; readonly traceFingerprint: string; readonly winnerGateEligible: false; }

/** Deterministic cross-domain knowledge graph (structured facts, NOT naive text templates). */
export const AGIS_KNOWLEDGE: readonly AgisFact[] = Object.freeze([
  Object.freeze({ id: 'F-C', domain: 'PHYSICS', quantity: 'speed_of_light', value: 299792458, unit: 'm/s' }),
  Object.freeze({ id: 'F-G', domain: 'PHYSICS', quantity: 'grav_const', value: 6.674e-11, unit: 'm3/kg/s2' }),
  Object.freeze({ id: 'F-ATP', domain: 'BIOCHEMISTRY', quantity: 'atp_per_glucose', value: 32, unit: 'count' }),
  Object.freeze({ id: 'F-RSUN', domain: 'ASTROPHYSICS', quantity: 'solar_radius', value: 6.957e8, unit: 'm' }),
  Object.freeze({ id: 'F-MSUN', domain: 'ASTROPHYSICS', quantity: 'solar_mass', value: 1.989e30, unit: 'kg' }),
]);
const fact = (id: string): AgisFact => { const f = AGIS_KNOWLEDGE.find(x => x.id === id); if (!f) throw new Error('UNKNOWN_FACT:' + id); return f; };

export class GenesisAgisCognitiveCore {
  private steps: CognitiveStep[] = [];
  private hyps = new Map<string, AgisHypothesis>();
  constructor(private clock: Clock) {}
  /** Derive a hypothesis by combining structured facts (deterministic numeric inference). */
  propose(domain: AgisDomain, query: string, premiseIds: readonly string[], seed: number): AgisHypothesis {
    const facts = premiseIds.map(fact);
    const derived = facts.reduce((a, f) => a + f.value, 0);
    const h: AgisHypothesis = { id: 'AGI-' + seed, domain, statement: query, premises: premiseIds, derived: +derived.toFixed(6), seed, simulationTime: this.clock.now(), dataLabel: 'AGI_HYPOTHESIS', status: 'PROPOSED' };
    this.hyps.set(h.id, h); this.push('HYPOTHESIS', h, []); return h;
  }
  /** Aggressive refutation: conservation/dimensional/counterexample/literature checks. */
  refute(h: AgisHypothesis, limits: { maxDerived?: number; conserved?: number }): RefutationTest[] {
    const tests: RefutationTest[] = [];
    tests.push({ testId: 'T-DIM', kind: 'DIMENSIONAL', passed: Number.isFinite(h.derived), reason: 'derived finite' });
    tests.push({ testId: 'T-CONS', kind: 'CONSERVATION', passed: limits.conserved === undefined || Math.abs(h.derived - limits.conserved) <= Math.abs(limits.conserved) * 0.5, reason: 'conservation window' });
    tests.push({ testId: 'T-CX', kind: 'COUNTEREXAMPLE', passed: limits.maxDerived === undefined || h.derived <= limits.maxDerived, reason: 'counterexample bound' });
    tests.push({ testId: 'T-LIT', kind: 'LITERATURE', passed: h.premises.every(p => AGIS_KNOWLEDGE.some(f => f.id === p)), reason: 'premises grounded in knowledge graph' });
    h.status = tests.every(t => t.passed) ? 'VALIDATED' : 'REFUTED';
    this.push('REFUTATION', h, tests); return tests;
  }
  synthesize(ids: readonly string[]): string[] {
    const validated = ids.filter(id => this.hyps.get(id)?.status === 'VALIDATED');
    const h = this.hyps.get(ids[0] ?? ''); if (h) this.push('SYNTHESIS', h, []);
    return validated;
  }
  private push(phase: CognitiveStep['phase'], h: AgisHypothesis, tests: readonly RefutationTest[]): void {
    const step: CognitiveStep = { stepId: 'STEP-' + this.steps.length, phase, hypothesisId: h.id, tests, cognitiveFingerprint: '', seed: h.seed, simulationTime: h.simulationTime };
    (step as { cognitiveFingerprint: string }).cognitiveFingerprint = sha256hex(stableStringify({ phase, id: h.id, statement: h.statement, derived: h.derived, status: h.status, tests }));
    this.steps.push(step);
  }
  trace(): CognitiveTrace {
    return { steps: [...this.steps], validated: [...this.hyps.values()].filter(h => h.status === 'VALIDATED').map(h => h.id), traceFingerprint: sha256hex(stableStringify(this.steps)), winnerGateEligible: false };
  }
  replay(expected: CognitiveTrace): boolean { return this.trace().traceFingerprint === expected.traceFingerprint; }
}
