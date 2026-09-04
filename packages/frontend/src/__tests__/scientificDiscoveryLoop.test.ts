import { afterEach, describe, expect, it, vi } from 'vitest';
import { runScientificDiscoveryLoop, runScientificDiscoveryLoopAsync, buildEvidenceChain } from '../core/experimentFabric/scientificDiscoveryLoop';
import {
  executePreregisteredHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS, preregisterHypotheses,
} from '../core/experimentFabric/hypothesisLoop';

/**
 * SCIENTIFIC DISCOVERY LOOP — proves the first full, closed, deterministic
 * cycle for ONE real epidemiological question:
 * Question → Hypothesis → Experiment Design → Execution → Observation →
 * Analysis → Falsification → Comparison → Next Experiment.
 *
 * Nothing here is a second engine: `runScientificDiscoveryLoop` composes
 * the EXISTING `hypothesisLoop.ts` (Question/Hypothesis/Design/Execution/
 * Falsification/Comparison/Next-Experiment) with the EXISTING
 * `observationAnalysis/*` (Observation/Analysis/Findings, merged via PR #4).
 */
const QUESTION_ID = 'problem:intervention-timing';

describe('Scientific Discovery Loop — one real epidemiological question, closed cycle', () => {
  it('1. runs the full closed loop end to end for a real question', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    expect(result.problem.problemId).toBe(QUESTION_ID);
    expect(result.loop.preregistration.hypotheses.length).toBeGreaterThan(0);
    expect(result.loop.outcomes.length).toBe(result.loop.preregistration.hypotheses.length);
    expect(result.evidenceChain.length).toBe(result.loop.outcomes.length);
    expect(result.nextExperiment).toBeDefined();
  });

  it('2. is deterministic — the same real question produces the same statuses and metrics twice', () => {
    const a = runScientificDiscoveryLoop(QUESTION_ID);
    const b = runScientificDiscoveryLoop(QUESTION_ID);
    expect(a.loop.outcomes.map((o) => [o.hypothesisId, o.status, o.observedMetric, o.baselineMetric])).toEqual(
      b.loop.outcomes.map((o) => [o.hypothesisId, o.status, o.observedMetric, o.baselineMetric]),
    );
    expect(a.loop.preregistration.preregistrationFingerprint).toBe(b.loop.preregistration.preregistrationFingerprint);
  });

  it('3. every non-blocked hypothesis gets real Observations tied to a real resultFingerprint/day', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    const executed = result.evidenceChain.filter((link) => link.status !== 'BLOCKED' && link.variantRunId !== null);
    expect(executed.length).toBeGreaterThan(0);
    for (const link of executed) {
      expect(link.observations.length).toBeGreaterThan(0);
      for (const observation of link.observations) {
        expect(observation.evidence.resultFingerprint.length).toBeGreaterThan(0);
        expect(Number.isFinite(observation.evidence.day)).toBe(true);
        expect(Number.isFinite(observation.evidence.sampleIndex)).toBe(true);
      }
      expect(link.analysis).not.toBeNull();
      expect(link.findings.length).toBeGreaterThan(0);
    }
  });

  it('4. Falsification status comes from the real evidence chain assessment, not from Observation/Analysis', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    for (const outcome of result.loop.outcomes) {
      expect(['SUPPORTED', 'FALSIFIED', 'INCONCLUSIVE', 'BLOCKED', 'UNKNOWN']).toContain(outcome.status);
    }
    // At least one real falsification-relevant status must have actually occurred (not all silently UNKNOWN).
    expect(result.loop.outcomes.some((o) => o.status !== 'UNKNOWN')).toBe(true);
  });

  it('5. Comparison (discrimination) ranks candidates using real measured metrics only', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    for (const entry of result.loop.discrimination.ranking) {
      expect(Number.isFinite(entry.metric)).toBe(true);
    }
  });

  it('6. Next Experiment is a real, existing decision (selectNextHypothesisExperiment), never fabricated', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    expect(['READY_TO_RUN', 'VALIDATION_REQUIRED', 'BLOCKED', 'RESOLVED']).toContain(result.nextExperiment.status);
    expect(result.nextExperiment.why.length).toBeGreaterThan(0);
  });

  it('7. an unknown question throws instead of silently fabricating a loop', () => {
    expect(() => runScientificDiscoveryLoop('problem:does-not-exist')).toThrow(/Nieznany problem badawczy/);
  });

  it('8. a chemistry/physics hypothesis (no scenario-timeline) reports NOT_MODELED for Observation/Analysis, never fabricates it', () => {
    const chemProblem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === 'problem:chem-rdkit-molecular-weight-comparison')!;
    // Local sync executor cannot run a BACKEND_REAL_ENGINE model — outcome is BLOCKED, which is itself a real, honest status.
    const loop = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(chemProblem)));
    const chain = buildEvidenceChain(loop);
    expect(chain.length).toBeGreaterThan(0);
    for (const link of chain) {
      expect(link.observations).toEqual([]);
      expect(link.analysis).toBeNull();
      expect(link.notModeled).toBeDefined();
    }
  });

  it('9. evidence chain link ids trace back to the real evidence chain/pack the loop already produced', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    for (const link of result.evidenceChain) {
      const outcome = result.loop.outcomes.find((o) => o.hypothesisId === link.hypothesisId)!;
      expect(link.evidenceChainId).toBe(outcome.evidenceChainId);
      expect(link.evidencePackId).toBe(outcome.evidencePackId);
    }
  });

  it('10. re-running does not mutate the original HypothesisProblem catalog entry', () => {
    const before = JSON.stringify(HYPOTHESIS_PROBLEMS.find((p) => p.problemId === QUESTION_ID));
    runScientificDiscoveryLoop(QUESTION_ID);
    const after = JSON.stringify(HYPOTHESIS_PROBLEMS.find((p) => p.problemId === QUESTION_ID));
    expect(after).toBe(before);
  });
});

/**
 * GENERALITY — proves `runScientificDiscoveryLoop*` is a reusable entry
 * point over the whole declared `HYPOTHESIS_PROBLEMS` catalog, not a
 * function that only happens to work for `problem:intervention-timing`.
 */
describe('Scientific Discovery Loop — reusable across domains, not a single hardcoded demo', () => {
  it('11. the SAME sync entry point closes a second, different local-model problem outside epidemiology (particle physics), honestly reporting notModeled for a domain Observation/Analysis does not cover', () => {
    const result = runScientificDiscoveryLoop('problem:particle-relativistic-kinetic-energy-velocity');
    expect(result.problem.domainId).toBe('particle');
    expect(result.loop.outcomes.length).toBeGreaterThan(0);
    // Real falsification/comparison ran (not BLOCKED-by-construction like the chemistry case).
    expect(result.loop.outcomes.some((o) => o.status !== 'BLOCKED')).toBe(true);
    // This domain has no registered Scenario Engine timeline, so Observation/Analysis
    // must never fabricate a result for it — same honesty boundary as the chemistry case.
    for (const link of result.evidenceChain) {
      expect(link.observations).toEqual([]);
      expect(link.analysis).toBeNull();
      expect(link.notModeled).toBeDefined();
    }
    expect(result.nextExperiment).toBeDefined();
  });

  it('12. runScientificDiscoveryLoopAsync genuinely closes a BACKEND_REAL_ENGINE problem (real RDKit via mocked HTTP transport) instead of reporting a foregone BLOCKED', async () => {
    // Real RDKit 2026.03.5 descriptor outputs captured for ethanol (baseline) and
    // aspirin (candidate) — same fixture values as moleculeWorldAdapter.test.ts,
    // mocking only the HTTP transport per this codebase's established convention.
    const REAL_OUTPUTS: Record<string, Record<string, unknown>> = {
      CCO: { molWt: 46.069, exactMolWt: 46.04186, crippenLogP: -0.0014, hbd: 1, hba: 1, rotatableBonds: 0, ringCount: 0, aromaticRings: 0, fractionCsp3: 1, tpsa: 20.23, heavyAtomCount: 3, heteroatomCount: 1, formalCharge: 0, lipinskiViolations: 0, canonicalSmiles: 'CCO', molecularFormula: 'C2H6O' },
      'CC(=O)Oc1ccccc1C(=O)O': { molWt: 180.159, exactMolWt: 180.04226, crippenLogP: 1.3101, hbd: 1, hba: 3, rotatableBonds: 2, ringCount: 1, aromaticRings: 1, fractionCsp3: 0.1111, tpsa: 63.6, heavyAtomCount: 13, heteroatomCount: 4, formalCharge: 0, lipinskiViolations: 0, canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', molecularFormula: 'C9H8O4' },
    };
    let seq = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      seq += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      const smiles = String(body.inputs?.smiles);
      const outputs = REAL_OUTPUTS[smiles];
      if (!outputs) throw new Error(`No captured real RDKit output for smiles=${smiles}`);
      return {
        ok: true, status: 200,
        json: async () => ({
          contractVersion: '1.0.0', request: body,
          run: {
            runId: `chem-run-${seq}`, modelId: 'chem-rdkit-descriptors', modelVersion: '1.0.0', domain: 'chemistry',
            engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs, outputs, units: {},
            warnings: [], assumptions: [],
            provenance: { source: 'compute/rdkitAdapter.mjs', formula: 'RDKit Descriptors', honesty: 'real_external_engine', engine: 'RDKit 2026.03.5', requiredEnvironmentVariable: 'GENESIS_RDKIT_PYTHON' },
          },
          persisted: false,
        }),
      } as Response;
    }));

    const result = await runScientificDiscoveryLoopAsync('problem:chem-rdkit-molecular-weight-comparison');
    expect(result.problem.domainId).toBe('chemistry');
    expect(result.loop.outcomes.length).toBeGreaterThan(0);
    // The sync path (test 8) can only ever report BLOCKED here; the async path must
    // genuinely execute and reach a real falsification assessment.
    expect(result.loop.outcomes.every((o) => o.status !== 'BLOCKED')).toBe(true);
    expect(result.loop.outcomes[0]!.observedMetric).toBeCloseTo(180.159, 2);
    expect(result.loop.outcomes[0]!.baselineMetric).toBeCloseTo(46.069, 2);
    // RDKit runs are not registered Scenario Engine timelines — Observation/Analysis
    // still must not fabricate a result for them.
    for (const link of result.evidenceChain) {
      expect(link.observations).toEqual([]);
      expect(link.notModeled).toBeDefined();
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
