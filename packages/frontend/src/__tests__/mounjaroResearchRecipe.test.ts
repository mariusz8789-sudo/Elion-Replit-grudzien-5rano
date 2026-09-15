/**
 * D-081 — recipe-lock tests. Two things must be true at once and are proven
 * separately here: the lock genuinely holds on today's real state, AND the
 * issued-recipe branch is genuinely reachable, so nobody can claim the whole
 * path is decoration.
 */

import { describe, expect, it } from 'vitest';
import { buildMounjaroResearchRecipe, evidenceInventoryFor, NON_CLINICAL_DISCLAIMER, type MolecularDiscoveryArtifact } from '../core/discovery/molecular/mounjaroResearchRecipe';
import { MINIMUM_OBSERVATIONS } from '../core/agent/practicalCandidateGate';

const artifact = (over: Partial<MolecularDiscoveryArtifact> = {}): MolecularDiscoveryArtifact => ({
  missionId: 'GENESIS-MOL-01',
  objectiveFingerprint: '48a3d3f95fc6aa46',
  adjudicationVerdict: 'INSUFFICIENT_EVIDENCE',
  candidateId: 'CC(=O)OC(C)=O',
  canonicalStructure: 'CC(=O)OC(C)=O',
  parentage: [{ parentSmiles: 'CC(=O)Nc1ccc(O)cc1', transformation: 'brics-recombination' }],
  targetHypotheses: ['GLP-1R agonism', 'GIPR agonism'],
  glp1r: { available: false, code: 'GATE_NOT_MET', reasons: ['MAE 1.0425 > MAX_MAE 1.0'], modelFingerprint: null },
  gipr: { available: false, code: 'PIN_MISSING', reasons: ['no pinned GIPR activity artifact'], modelFingerprint: null },
  dualTarget: { outcome: 'NO_DUAL_TARGET_CANDIDATE', blockers: [{ code: 'GIPR_ACTIVITY_UNAVAILABLE', detail: 'no pinned GIPR data' }], fingerprint: 'dt01' },
  modelVersions: { glp1r: 'glp1r-qsar-v2', gipr: 'gipr-qsar-v1' },
  datasetFingerprints: { glp1rGate: 'd2f77a7e6042f0fc', giprGate: 'e648580eeec19aab' },
  evidence: [{ evidenceClass: 'COMPUTATIONAL', observationCount: 1, sourceId: 'dag:E1' }],
  experimentGraph: { runId: 'run01', graphFingerprint: 'gf01', nodes: [{ nodeId: 'E1', status: 'PASS', code: 'STRUCTURE_VALID' }] },
  falsification: [],
  failedAlternatives: [],
  knownUnknowns: ['no GIPR data'],
  reproducibility: { deterministic: true, replayVerdict: 'MATCH' },
  ...over,
});

describe('recipe lock: the negative path, on the real state of this repository', () => {
  it('a non-WINNER verdict locks the recipe, and the recipe field does not exist to be read', () => {
    const out = buildMounjaroResearchRecipe(artifact());
    expect(out.status).toBe('RECIPE_LOCKED');
    // Structural, not a flag: a caller cannot print a recipe that was never issued.
    expect('recipe' in out).toBe(false);
    // The narrowing below is itself the proof: TypeScript refuses to let this
    // test read `reasons` until it has established the locked branch, exactly
    // as it would refuse a caller trying to read `recipe`.
    if (out.status !== 'RECIPE_LOCKED') throw new Error('expected RECIPE_LOCKED');
    expect(out.reasons.some((r: string) => r.includes('VERDICT_NOT_WINNER'))).toBe(true);
  });

  it('the lock explains the science, not only the gate arithmetic', () => {
    const out = buildMounjaroResearchRecipe(artifact());
    expect(out.status).toBe('RECIPE_LOCKED');
    if (out.status !== 'RECIPE_LOCKED') throw new Error('expected RECIPE_LOCKED');
    expect(out.reasons.some((r: string) => r.includes('GIPR_ACTIVITY_UNAVAILABLE'))).toBe(true);
  });

  it('THE DOUBLE WALL: even a WINNER verdict with plenty of COMPUTATIONAL evidence still cannot promote', () => {
    const out = buildMounjaroResearchRecipe(artifact({
      adjudicationVerdict: 'WINNER',
      evidence: Array.from({ length: 50 }, (_, i) => ({ evidenceClass: 'COMPUTATIONAL', observationCount: 1, sourceId: `sim:${i}` })),
    }));
    expect(out.status).toBe('RECIPE_LOCKED');
    if (out.status !== 'RECIPE_LOCKED') throw new Error('expected RECIPE_LOCKED');
    // 50 in-silico runs clear the COUNT but never the STRENGTH bar — in-silico
    // work does not become clinical evidence by accumulating.
    expect(out.promotion.totalObservations).toBe(50);
    expect(out.promotion.strongCount).toBe(0);
    expect(out.reasons.some((r: string) => r.includes('EVIDENCE_STRENGTH'))).toBe(true);
  });

  it('negative: an invented evidence class buys no strength — it is read as UNVERIFIED', () => {
    const inv = evidenceInventoryFor(artifact({ evidence: [{ evidenceClass: 'DEFINITELY_STRONG_TRUST_ME', observationCount: 9, sourceId: 's' }] }));
    expect(inv[0].evidenceClass).toBe('UNVERIFIED');
    const out = buildMounjaroResearchRecipe(artifact({ adjudicationVerdict: 'WINNER', evidence: [{ evidenceClass: 'DEFINITELY_STRONG_TRUST_ME', observationCount: 9, sourceId: 's' }] }));
    expect(out.status).toBe('RECIPE_LOCKED');
  });

  it('negative: too few observations locks even with strong evidence class', () => {
    const out = buildMounjaroResearchRecipe(artifact({
      adjudicationVerdict: 'WINNER',
      evidence: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 1, sourceId: 'rct:1' }],
    }));
    expect(out.status).toBe('RECIPE_LOCKED');
    expect(out.promotion.minimumObservations).toBe(MINIMUM_OBSERVATIONS);
  });

  it('negative: a PROMOTE with no candidate structure is refused rather than issuing a recipe for nothing', () => {
    const out = buildMounjaroResearchRecipe(artifact({
      adjudicationVerdict: 'WINNER',
      candidateId: null,
      canonicalStructure: null,
      evidence: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 3, sourceId: 'rct:1' }],
    }));
    expect(out.status).toBe('RECIPE_LOCKED');
    if (out.status !== 'RECIPE_LOCKED') throw new Error('expected RECIPE_LOCKED');
    expect(out.reasons[0]).toContain('no candidate structure');
  });
});

describe('recipe issue: the positive path is reachable, not dead code', () => {
  const winning = artifact({
    adjudicationVerdict: 'WINNER',
    evidence: [
      { evidenceClass: 'DIRECT_RANDOMISED', observationCount: 2, sourceId: 'rct:NCT0000001' },
      { evidenceClass: 'INDIRECT_RANDOMISED', observationCount: 1, sourceId: 'rct:NCT0000002' },
    ],
  });

  it('a WINNER verdict with real randomised evidence issues a recipe', () => {
    const out = buildMounjaroResearchRecipe(winning);
    expect(out.status).toBe('RECIPE_ISSUED');
    if (out.status !== 'RECIPE_ISSUED') return;
    expect(out.promotion.outcome).toBe('PROMOTE');
    expect(out.promotion.totalObservations).toBe(3);
    expect(out.promotion.strongCount).toBe(3);
  });

  it('the issued recipe carries every field the mission requires, including the non-clinical disclaimer', () => {
    const out = buildMounjaroResearchRecipe(winning);
    if (out.status !== 'RECIPE_ISSUED') throw new Error('expected RECIPE_ISSUED');
    const r = out.recipe;
    for (const field of ['recipeId', 'candidateId', 'canonicalStructure', 'parentage', 'targetHypotheses', 'glp1rResults', 'giprResults', 'modelVersions', 'datasetFingerprints', 'evidenceReferences', 'experimentGraph', 'falsificationHistory', 'failedAlternatives', 'winnerAdjudication', 'evidenceLevel', 'knownUnknowns', 'reproducibility', 'executionRecipe', 'researchNextSteps', 'nonClinicalDisclaimer'] as const) {
      expect(r[field], `recipe is missing ${field}`).toBeDefined();
    }
    expect(r.nonClinicalDisclaimer).toBe(NON_CLINICAL_DISCLAIMER);
    expect(r.nonClinicalDisclaimer).toContain('not a prescription');
  });

  it('the recipe fingerprint is deterministic and changes with the candidate', () => {
    const a = buildMounjaroResearchRecipe(winning);
    const b = buildMounjaroResearchRecipe(winning);
    if (a.status !== 'RECIPE_ISSUED' || b.status !== 'RECIPE_ISSUED') throw new Error('expected RECIPE_ISSUED');
    expect(a.recipe.fingerprint).toBe(b.recipe.fingerprint);
    const other = buildMounjaroResearchRecipe({ ...winning, candidateId: 'CCO', canonicalStructure: 'CCO' });
    if (other.status !== 'RECIPE_ISSUED') throw new Error('expected RECIPE_ISSUED');
    expect(other.recipe.fingerprint).not.toBe(a.recipe.fingerprint);
  });

  it('the issued recipe never claims a drug: no banned clinical phrasing anywhere in it', () => {
    const out = buildMounjaroResearchRecipe(winning);
    if (out.status !== 'RECIPE_ISSUED') throw new Error('expected RECIPE_ISSUED');
    const text = JSON.stringify(out.recipe).toLowerCase();
    for (const banned of ['replaces mounjaro', 'replacement for tirzepatide', 'approved drug', 'safe for human', 'recommended dose']) {
      expect(text.includes(banned), `recipe text contains banned claim "${banned}"`).toBe(false);
    }
  });
});
