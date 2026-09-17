import { canonicalJson, fnv1a } from '../events/hash';
import type { Candidate, OrchestratorAdapters } from './contracts';

/**
 * SYNTHETIC_TEST_ONLY adapters — sandbox + test fixtures ONLY, never a
 * production implementation. Every port here is a small, honest fixture,
 * not a real Genesis mechanism: `adjudicate` always returns `NO_WINNER`
 * (a sandbox default is never a forced WINNER), and no candidate, seal, or
 * evidence produced here is real.
 *
 * Hash: reuses the existing Genesis hash provider (`core/events/hash.ts`,
 * fnv1a) rather than a bundled hand-rolled hash — same resolution as
 * physics-world (D-052) and virtual-bio (D-054): one shared provider, not
 * a third reimplementation.
 *
 * Wiring these ports to REAL Genesis modules (govDrugDiscoveryCampaign.ts,
 * govDrugLowerHarmFunnel.ts, generateDifferentiatingExperiment,
 * genesisAdjudicationProtocol.ts, a real RecipeBuilder) for `PRODUCTION`
 * mode is explicit future work — see `contracts.ts`'s module header and
 * docs/DECISIONS.md D-055's "what this entry does NOT do".
 */

const hash = (value: unknown): string => fnv1a(canonicalJson(value));

function toyCandidates(n: number): readonly Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    candidateId: `TOY-C${i}`,
    mechanismClass: `M${i % 6}`,
    score: 1 - i * 0.03,
    riskGrade: i % 5 === 0 ? 'VETO' : 'LOW',
    evidenceRefs: [`toy-r${i}`],
  }));
}

export const toyAdapters: OrchestratorAdapters = {
  generate: () => toyCandidates(24),
  normalizeDedup: (cs) => cs.slice(0, 20),
  hardFilter: (cs) => cs.filter((c) => c.riskGrade !== 'VETO'),
  diversity: (cs) => cs,
  rank: (cs) => [...cs].sort((a, b) => b.score - a.score),
  top10: (cs) => cs.slice(0, 10),
  top2: (cs) => cs.slice(0, 2),
  seal: (p) => ({
    decisionRule: 'toy-frozen',
    falsificationCriteria: 'toy-frozen',
    evidenceMinimum: p.evidenceMinimum,
    comparisonRule: 'toy-frozen',
    sealFingerprint: hash(p),
    sealedAt: '1970-01-01T00:00:00Z',
  }),
  verifySealUnchanged: () => true,
  planExperiments: (t2) => t2.map((c) => `toy-exp-${c.candidateId}`),
  execute: (plan) => plan.map((p) => ({ experimentId: p, evidenceClass: 'SYNTHETIC_TEST_ONLY', summary: { v: 1 } })),
  ingestEvidence: (ex) => ex.map((_, i) => ({ ref: `toy-e${i}`, provenance: 'synthetic-only' })),
  falsify: (t2) => ({ survived: t2.map(() => true), note: 'toy' }),
  // Sandbox default is honestly NO_WINNER — a forced WINNER only ever appears in this module's own unit tests, via a distinct test-only adapter.
  adjudicate: () => ({ verdict: 'NO_WINNER' }),
  compare: () => 'toy-comparison',
  buildRecipe: (w) => ({ recipeFingerprint: hash(w) }),
  recommendNext: (r) => `toy-next: gap analysis after ${r.verdict}`,
  hash,
};
