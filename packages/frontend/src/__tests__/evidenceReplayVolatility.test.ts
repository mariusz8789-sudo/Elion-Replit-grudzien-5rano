import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseScienceChatMessage,
  designScientificExperiment,
  executeScientificBackendExperiment,
  createScientificEvidencePack,
} from '../core/experimentFabric';

/**
 * A real backend mints a fresh run id for every execution. The scientific fingerprint,
 * evidenceId and Evidence Pack id must depend only on the protocol, parameters and outputs —
 * never on that volatile identifier — or an honest re-run would report DRIFT against itself.
 *
 * The existing PySCF A/B replay test in backendEvidenceExecution.test.ts pins the same
 * invariant, but its mock returns a fixed run id per basis, so it cannot observe a regression
 * that re-admits `backendRunId` into the hashed input. This suite varies the id on every call.
 */

function fakeResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const BASE_RUN = {
  modelId: 'quantum-chemistry-pyscf-h2-rhf',
  modelVersion: '1.1.0',
  domain: 'quantum-chemistry',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  units: { energyHartree: 'Ha', nElectrons: '', nBasisFunctions: '' },
  validity: 'RHF w bazie prerejestrowanej; H2 singlet.',
  assumptions: ['Neutralny H2, singlet.'],
  provenance: {
    source: 'compute/pyscf_worker.py via compute/qmAdapter.mjs',
    formula: 'PySCF RHF single-point',
    honesty: 'real_external_engine',
    engine: 'PySCF 2.14.0',
    requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON',
  },
};

/** Deterministic physics, volatile run identifier — exactly what a real backend returns. */
function volatileBackendMock() {
  let call = 0;
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const basis = body.inputs?.basis ?? 'sto-3g';
    const isSto3g = basis === 'sto-3g';
    call += 1;
    const run = {
      ...BASE_RUN,
      runId: `0aa4e400-0000-4000-8000-${String(900000000000 + call)}`,
      outputs: { energyHartree: isSto3g ? -1.11675931 : -1.12675532, nElectrons: 2, nBasisFunctions: isSto3g ? 2 : 6 },
      warnings: [`PySCF 2.14.0; RHF/${basis}; neutral H2 singlet.`],
      assumptions: [`Neutralny H2, singlet, RHF/${basis}.`],
      provenance: { ...BASE_RUN.provenance, formula: `PySCF RHF single-point; H2 singlet; ${basis.toUpperCase()}` },
    };
    return fakeResponse({ contractVersion: '1.0.0', request: body, run, persisted: false });
  });
}

function preregisteredDesign(bondLengthAngstrom = 0.74) {
  return designScientificExperiment({
    hypothesis: {
      statement: 'W tej samej geometrii zmiana prerejestrowanej bazy zmienia energię RHF H2.',
      domainId: 'chemistry',
      modelId: 'quantum-chemistry-pyscf-h2-rhf',
      declaredAssumptions: [],
      falsification: { metric: 'energyHartree', relation: 'less-than', expectedValue: -1.1, rationale: 'Oba realne arms muszą zwrócić energię poniżej prerejestrowanego progu.' },
    },
    baselineRequest: {
      ...parseScienceChatMessage('Uruchom PySCF RHF dla H2; długość wiązania 0.74 Å.'),
      domainId: 'chemistry',
      modelId: 'quantum-chemistry-pyscf-h2-rhf',
      parameters: { bondLengthAngstrom, basis: 'sto-3g' },
    },
    sweep: { parameter: 'basis', values: ['sto-3g', '6-31g'], label: 'Baza obliczeniowa' },
    repetitionsPerArm: 1,
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('scientific replay is independent of volatile backend run identifiers', () => {
  it('keeps run fingerprints, evidenceId and Evidence Pack id stable when every backendRunId differs', async () => {
    const mock = volatileBackendMock();
    vi.stubGlobal('fetch', mock);
    const design = preregisteredDesign();

    const reference = await executeScientificBackendExperiment(design);
    const referencePack = createScientificEvidencePack(reference);
    const replay = await executeScientificBackendExperiment(design);
    const replayPack = createScientificEvidencePack(replay);

    expect(mock).toHaveBeenCalledTimes(4);
    const referenceIds = reference.allRuns.map((run) => run.provenance.backendExecution?.backendRunId);
    const replayIds = replay.allRuns.map((run) => run.provenance.backendExecution?.backendRunId);
    // The premise of this suite: the identifiers really are volatile.
    expect(new Set([...referenceIds, ...replayIds]).size).toBe(4);

    expect(replay.allRuns.map((run) => run.provenance.runFingerprint))
      .toEqual(reference.allRuns.map((run) => run.provenance.runFingerprint));
    expect(replay.evidenceId).toBe(reference.evidenceId);
    expect(replayPack.evidencePackId).toBe(referencePack.evidencePackId);
    expect(replay.arms.every((arm) => arm.reproduction === 'MATCH')).toBe(true);
    expect(replayPack.reproducibility.allArmsMatched).toBe(true);
  });

  it('still reports a different protocol and pack when a real parameter changes', async () => {
    vi.stubGlobal('fetch', volatileBackendMock());
    const reference = await executeScientificBackendExperiment(preregisteredDesign(0.74));
    const shifted = await executeScientificBackendExperiment(preregisteredDesign(0.8));

    expect(shifted.design.protocolFingerprint).not.toBe(reference.design.protocolFingerprint);
    expect(createScientificEvidencePack(shifted).evidencePackId)
      .not.toBe(createScientificEvidencePack(reference).evidencePackId);
  });
});
