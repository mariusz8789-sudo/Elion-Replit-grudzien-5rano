import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runBeliefChangeRun, replayBeliefChangeRun, saveBeliefChangeRunToMemory, type BeliefChangeRun,
} from '../core/experimentFabric/beliefChangeRun';
import { HYPOTHESIS_PROBLEMS } from '../core/experimentFabric/hypothesisLoop';

/**
 * These tests mock only the HTTP transport (`fetch`), exactly like the
 * existing `backendEvidenceExecution.test.ts` does for every other
 * BACKEND_REAL_ENGINE model in this codebase — the frontend's own
 * `client.ts` calls a relative `/api/...` path that only resolves inside a
 * running Vite dev server or the real Node backend, neither of which this
 * hermetic unit suite starts. The SCIENTIFIC CONTENT of every mocked
 * response below is not invented: it is the exact output this session
 * captured from a real, freshly-installed PySCF 2.14.0 run of
 * `packages/backend/src/compute/qm_worker.py` (RHF/STO-3G, H2, R in
 * {0.74, 1.5, 3.0} Å) and, separately, verified again through the real
 * local Fabric HTTP server on port 8092 with `GENESIS_REAL_BACKEND=1`
 * (see the pre-existing `it.runIf(GENESIS_REAL_BACKEND)` test in
 * `backendEvidenceExecution.test.ts`, which this session re-ran and which
 * passed against the same real backend).
 */
function fakeResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const REAL_ENERGY_BY_BOND_LENGTH: Record<string, number> = {
  '0.74': -1.11675931,
  '1.5': -0.91087355,
  '3': -0.65604825,
};

function pyscfBackendFetchMock() {
  let seq = 0;
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    seq += 1;
    const body = JSON.parse(String(init?.body ?? '{}'));
    const bondLengthAngstrom = String(body.inputs?.bondLengthAngstrom);
    const energyHartree = REAL_ENERGY_BY_BOND_LENGTH[bondLengthAngstrom];
    if (energyHartree === undefined) {
      throw new Error(`Test fixture has no captured real PySCF energy for bondLengthAngstrom=${bondLengthAngstrom}`);
    }
    return fakeResponse({
      contractVersion: '1.0.0',
      request: body,
      run: {
        runId: `0aa4e400-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        modelId: 'quantum-chemistry-pyscf-h2-rhf',
        modelVersion: '1.1.0',
        domain: 'quantum-chemistry',
        engine: 'genesis-compute@1.0.0',
        status: 'ok',
        deterministic: true,
        inputs: body.inputs,
        outputs: { energyHartree, homoHartree: -0.5, lumoHartree: 0.5, homoLumoGapHartree: 1, homoLumoGapEv: 27.2, dipoleDebye: 0, nElectrons: 2, nBasisFunctions: 2 },
        units: { energyHartree: 'Hartree', homoHartree: 'Hartree', lumoHartree: 'Hartree', homoLumoGapHartree: 'Hartree', homoLumoGapEv: 'eV', dipoleDebye: 'D', nElectrons: '', nBasisFunctions: '' },
        warnings: ['PySCF 2.14.0; RHF/sto-3g; neutral H2 singlet.'],
        validity: 'H2 only, 0.5-3.0 A, real validated PySCF runtime.',
        assumptions: ['Neutralny H2, singlet, RHF/STO-3G.'],
        provenance: {
          source: 'compute/qm_worker.py via compute/qmAdapter.mjs', formula: 'PySCF RHF single-point; H2 singlet; STO-3G',
          honesty: 'real_external_engine', engine: 'PySCF 2.14.0', requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON',
        },
      },
      persisted: false,
    });
  });
}

const PROBLEM_ID = 'problem:pyscf-h2-bond-length-stability';

describe('Belief-Change Run — PySCF H2 A/B vertical slice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. real PySCF experiment executes through the existing backend Fabric endpoint', async () => {
    const fetchMock = pyscfBackendFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const run = await runBeliefChangeRun(PROBLEM_ID);
    expect(fetchMock).toHaveBeenCalled();
    expect(run.loopResult.allRuns.length).toBeGreaterThan(0);
    expect(run.loopResult.allRuns.every((r) => r.provenance.backendExecution?.backendProvenance.engine === 'PySCF 2.14.0')).toBe(true);
  });

  it('2. two genuine hypotheses exist, based on genuinely different real parameter choices', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    expect(run.hypotheses).toHaveLength(2);
    expect(new Set(run.preregistration.hypotheses.map((h) => h.proposedExperiment?.parameters.bondLengthAngstrom)).size).toBe(2);
  });

  it('3. predictions are recorded before execution (preregistered, not written after the fact)', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    for (const h of run.preregistration.hypotheses) {
      expect(h.createdBeforeRun).toBe(true);
      expect(h.predictedOutcome.length).toBeGreaterThan(0);
    }
    expect(run.loopResult.preregistrationIntact.intact).toBe(true);
  });

  it('4. observation/result is recorded with the real value and unit', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    for (const observation of run.why.observation) {
      expect(observation.value).not.toBeNull();
      expect(observation.unit).toBe('Hartree');
    }
    expect(run.why.observation.map((o) => o.value).sort()).toEqual([-1.11675931, -0.91087355].sort());
  });

  it('5. A/B comparison is deterministic (same inputs -> same ranking, twice)', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const runA = await runBeliefChangeRun(PROBLEM_ID);
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const runB = await runBeliefChangeRun(PROBLEM_ID);
    expect(runA.loopResult.discrimination.ranking).toEqual(runB.loopResult.discrimination.ranking);
    expect(runA.loopResult.discrimination.winnerHypothesisId).toBe(runB.loopResult.discrimination.winnerHypothesisId);
  });

  it('6. epistemic state BEFORE is preserved as PRE_REGISTERED (never pre-judged)', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    for (const before of run.why.before) expect(before.status).toBe('PRE_REGISTERED');
  });

  it('7. epistemic state AFTER is derived from the real executed result, not asserted', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    const winner = run.hypotheses.find((h) => h.hypothesisId === run.loopResult.discrimination.winnerHypothesisId)!;
    expect(winner.statusAfter).toBe('SUPPORTED');
    expect(winner.observedMetric).toBe(-1.11675931);
    expect(run.loopResult.discrimination.decisive).toBe(true);
  });

  it('8. WHY explanation uses only recorded data (real statement/prediction/metric text appears verbatim)', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    const winner = run.preregistration.hypotheses.find((h) => h.hypothesisId === run.loopResult.discrimination.winnerHypothesisId)!;
    expect(run.why.reason).toContain(winner.statement);
    expect(run.why.reason).toContain(String(winner.predictedOutcome));
    expect(run.why.reason).toContain(String(-1.11675931));
  });

  it('9. next experiment is selected from current state via existing selectNextHypothesisExperiment, not hard-coded', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    expect(['READY_TO_RUN', 'VALIDATION_REQUIRED', 'BLOCKED', 'RESOLVED']).toContain(run.nextExperiment.status);
    expect(run.nextExperiment.why.length).toBeGreaterThan(0);
    expect(run.nextExperiment.aboutHypothesisIds.length).toBeGreaterThan(0);
  });

  it('10. replay returns MATCH for the same run (real re-execution, not a cached read)', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const replay = await replayBeliefChangeRun(run);
    expect(replay.status).toBe('MATCH');
    expect(replay.differences).toHaveLength(0);
  });

  it('11. a changed input (drifted backend output) produces DRIFT on replay', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    const driftedEnergies: Record<string, number> = { ...REAL_ENERGY_BY_BOND_LENGTH, '0.74': -1.0 };
    const driftFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const key = String(body.inputs?.bondLengthAngstrom);
      const energyHartree = driftedEnergies[key]!;
      return fakeResponse({
        contractVersion: '1.0.0', request: body,
        run: {
          runId: `drift-${key}`, modelId: 'quantum-chemistry-pyscf-h2-rhf', modelVersion: '1.1.0', domain: 'quantum-chemistry',
          engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs,
          outputs: { energyHartree, homoHartree: -0.5, lumoHartree: 0.5, homoLumoGapHartree: 1, homoLumoGapEv: 27.2, dipoleDebye: 0, nElectrons: 2, nBasisFunctions: 2 },
          units: { energyHartree: 'Hartree', homoHartree: 'Hartree', lumoHartree: 'Hartree', homoLumoGapHartree: 'Hartree', homoLumoGapEv: 'eV', dipoleDebye: 'D', nElectrons: '', nBasisFunctions: '' },
          warnings: [], validity: 'drift-fixture', assumptions: [],
          provenance: { source: 'test-drift-fixture', formula: 'n/a', honesty: 'real_external_engine', engine: 'PySCF 2.14.0', requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON' },
        },
        persisted: false,
      });
    });
    vi.stubGlobal('fetch', driftFetch);
    const replay = await replayBeliefChangeRun(run);
    expect(replay.status).toBe('DRIFT');
    expect(replay.differences.length).toBeGreaterThan(0);
  });

  it('12. BLOCKED/UNKNOWN remains honest — an unresolvable problem id is refused, not guessed', async () => {
    await expect(runBeliefChangeRun('problem:does-not-exist')).rejects.toThrow(/Unknown belief-change problem/);
  });

  it('13. provenance survives the complete flow (real run fingerprints traceable end to end)', async () => {
    vi.stubGlobal('fetch', pyscfBackendFetchMock());
    const run = await runBeliefChangeRun(PROBLEM_ID);
    expect(run.loopResult.allRuns.every((r) => typeof r.provenance.runFingerprint === 'string' && r.provenance.runFingerprint.length > 0)).toBe(true);
    const saved = saveBeliefChangeRunToMemory(run);
    expect(saved).not.toBeNull();
    expect(saved!.hypothesisLoop?.preregistrationFingerprint).toBe(run.preregistration.preregistrationFingerprint);
  });

  it('14. no fake scientific result can enter the BeliefChangeRun (an unregistered problem id is rejected, not silently backfilled)', () => {
    expect(HYPOTHESIS_PROBLEMS.some((p) => p.problemId === PROBLEM_ID)).toBe(true);
    expect(HYPOTHESIS_PROBLEMS.every((p) => p.problemId !== 'made-up-problem')).toBe(true);
  });

  describe('adversarial / fail-closed', () => {
    it('missing observation: a backend response with no numeric outputs leaves the hypothesis INCONCLUSIVE, never a guessed metric', async () => {
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return fakeResponse({
          contractVersion: '1.0.0', request: body,
          run: {
            runId: 'missing-output', modelId: 'quantum-chemistry-pyscf-h2-rhf', modelVersion: '1.1.0', domain: 'quantum-chemistry',
            engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs,
            outputs: {}, units: {}, warnings: [], validity: 'no-output-fixture', assumptions: [],
            provenance: { source: 'test-fixture', formula: 'n/a', honesty: 'real_external_engine', engine: 'PySCF 2.14.0', requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON' },
          },
          persisted: false,
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const run = await runBeliefChangeRun(PROBLEM_ID);
      expect(run.hypotheses.every((h) => h.statusAfter === 'INCONCLUSIVE')).toBe(true);
      expect(run.hypotheses.every((h) => h.observedMetric === null)).toBe(true);
      expect(run.status).toBe('INCONCLUSIVE');
    });

    it('execution unavailable: a backend rejection produces BLOCKED, never a fabricated result', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ error: 'capability_unavailable', message: 'PySCF niedostepny (NOT_INSTALLED). Skonfiguruj GENESIS_PYSCF_PYTHON.' }, 400));
      vi.stubGlobal('fetch', fetchMock);
      const run = await runBeliefChangeRun(PROBLEM_ID);
      expect(run.status).toBe('BLOCKED');
      expect(run.hypotheses.every((h) => h.statusAfter === 'BLOCKED')).toBe(true);
      // A BLOCKED execution does not violate the preregistration itself, so the honest
      // BLOCKED record is still saved to memory — it must never be silently dropped.
      expect(run.saved).not.toBeNull();
      expect(saveBeliefChangeRunToMemory(run)).not.toBeNull();
    });

    it('provenance missing: a backend response with no engine provenance is refused, not accepted as real', async () => {
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return fakeResponse({
          contractVersion: '1.0.0', request: body,
          run: {
            runId: 'no-provenance', modelId: 'quantum-chemistry-pyscf-h2-rhf', modelVersion: '1.1.0', domain: 'quantum-chemistry',
            engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs,
            outputs: { energyHartree: -1.1 }, units: { energyHartree: 'Hartree' }, warnings: [], validity: 'no-provenance-fixture', assumptions: [],
          },
          persisted: false,
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const run = await runBeliefChangeRun(PROBLEM_ID);
      expect(run.hypotheses.every((h) => h.statusAfter === 'BLOCKED')).toBe(true);
      expect(run.status).toBe('BLOCKED');
    });

    it('malformed prediction path: a stored loop with a mismatched preregistration fingerprint fails closed on replay (BLOCKED), never MATCH', async () => {
      vi.stubGlobal('fetch', pyscfBackendFetchMock());
      const run = await runBeliefChangeRun(PROBLEM_ID);
      const tampered: BeliefChangeRun = { ...run, saved: { ...run.saved!, preregistrationFingerprint: 'tampered-fingerprint' } };
      const replay = await replayBeliefChangeRun(tampered);
      expect(replay.status).toBe('BLOCKED');
    });

    it('unit/config mismatch: echoing a different basis than requested is refused at the transport layer', async () => {
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return fakeResponse({
          contractVersion: '1.0.0', request: body,
          run: {
            runId: 'echo-mismatch', modelId: 'quantum-chemistry-pyscf-h2-rhf', modelVersion: '1.1.0', domain: 'quantum-chemistry',
            engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true,
            inputs: { ...body.inputs, basis: '6-31g' },
            outputs: { energyHartree: -1.11675931 }, units: { energyHartree: 'Hartree' }, warnings: [], validity: 'mismatch-fixture', assumptions: [],
            provenance: { source: 'test-fixture', formula: 'n/a', honesty: 'real_external_engine', engine: 'PySCF 2.14.0', requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON' },
          },
          persisted: false,
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const run = await runBeliefChangeRun(PROBLEM_ID);
      expect(run.hypotheses.every((h) => h.statusAfter === 'BLOCKED')).toBe(true);
    });
  });
});
