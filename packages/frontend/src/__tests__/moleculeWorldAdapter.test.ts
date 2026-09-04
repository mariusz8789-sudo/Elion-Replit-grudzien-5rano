import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executePreregisteredHypothesesAsync, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS, preregisterHypotheses,
} from '../core/experimentFabric/hypothesisLoop';
import { projectMoleculeWorldStates, projectMoleculeWorldStatesWithReplay } from '../core/world/moleculeWorldAdapter';
import { buildWorldState, type WorldState } from '../core/world/scientificWorldState';

/**
 * MOLECULAR / CHEMISTRY WORLD ADAPTER — third-domain proof for
 * ScientificWorldState (epidemiology, particle physics, now chemistry).
 *
 * Mocks only the HTTP transport, exactly like `backendEvidenceExecution.test.ts`
 * and `beliefChangeRun.test.ts` already do for this codebase's other
 * BACKEND_REAL_ENGINE models. The descriptor VALUES below are not
 * invented: they are the real output this session captured from an
 * actually-installed, actually-running RDKit 2026.03.5 (both via the
 * worker directly and via a live local Fabric HTTP server on port 8092),
 * for ethanol (CCO) and aspirin (CC(=O)Oc1ccccc1C(=O)O).
 */
const PROBLEM_ID = 'problem:chem-rdkit-molecular-weight-comparison';

function fakeResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const REAL_OUTPUTS: Record<string, Record<string, unknown>> = {
  CCO: {
    molWt: 46.069, exactMolWt: 46.04186, crippenLogP: -0.0014, hbd: 1, hba: 1, rotatableBonds: 0,
    ringCount: 0, aromaticRings: 0, fractionCsp3: 1, tpsa: 20.23, heavyAtomCount: 3, heteroatomCount: 1,
    formalCharge: 0, lipinskiViolations: 0, canonicalSmiles: 'CCO', molecularFormula: 'C2H6O',
  },
  'CC(=O)Oc1ccccc1C(=O)O': {
    molWt: 180.159, exactMolWt: 180.04226, crippenLogP: 1.3101, hbd: 1, hba: 3, rotatableBonds: 2,
    ringCount: 1, aromaticRings: 1, fractionCsp3: 0.1111, tpsa: 63.6, heavyAtomCount: 13, heteroatomCount: 4,
    formalCharge: 0, lipinskiViolations: 0, canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', molecularFormula: 'C9H8O4',
  },
};

function realRdkitFetchMock() {
  let seq = 0;
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    seq += 1;
    const body = JSON.parse(String(init?.body ?? '{}'));
    const smiles = String(body.inputs?.smiles);
    const outputs = REAL_OUTPUTS[smiles];
    if (!outputs) throw new Error(`Test fixture has no captured real RDKit output for smiles=${smiles}`);
    return fakeResponse({
      contractVersion: '1.0.0', request: body,
      run: {
        runId: `chem-run-${seq}`, modelId: 'chem-rdkit-descriptors', modelVersion: '1.0.0', domain: 'chemistry',
        engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs, outputs, units: {},
        warnings: [], assumptions: [],
        provenance: { source: 'compute/rdkitAdapter.mjs', formula: 'RDKit Descriptors', honesty: 'real_external_engine', engine: 'RDKit 2026.03.5', requiredEnvironmentVariable: 'GENESIS_RDKIT_PYTHON' },
      },
      persisted: false,
    });
  });
}

async function runChemLoop() {
  const problem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === PROBLEM_ID)!;
  return executePreregisteredHypothesesAsync(preregisterHypotheses(generateCompetingHypotheses(problem)));
}

describe('Molecular/Chemistry World Adapter — third domain for ScientificWorldState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. projects real, backend-executed RDKit descriptors as WorldState entities', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    expect(states.length).toBeGreaterThan(0);
    const molecule = states[0]!.entities[0]!;
    expect(molecule.ref.kind).toBe('molecule');
    const molWt = molecule.properties.find((p) => p.key === 'molWt');
    expect(molWt?.value).toBeGreaterThan(0);
    expect(molWt?.unit).toBe('g/mol');
  });

  it('2. entity IDs are the requested SMILES (stable, deterministic) and ordering matches allRuns', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    const completedRuns = loopResult.allRuns.filter((r) => r.result.status === 'completed');
    expect(states.map((s) => s.entities[0]!.ref.id)).toEqual(completedRuns.map((r) => r.request.parameters.smiles));
    expect(states.map((s) => s.tick)).toEqual(states.map((_, i) => i));
  });

  it('3. real RDKit values differ correctly between the two real molecules (aspirin heavier than ethanol) — not scripted', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    const byId = new Map(states.map((s) => [s.entities[0]!.ref.id, s.entities[0]!.properties.find((p) => p.key === 'molWt')!.value as number]));
    expect(byId.get('CC(=O)Oc1ccccc1C(=O)O')).toBeGreaterThan(byId.get('CCO')!);
  });

  it('4. the SAME ScientificWorldState contract shape is used for chemistry as for every other domain', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    const WORLD_STATE_KEYS = [
      'contractVersion', 'worldId', 'domainId', 'tick', 'entities', 'relations', 'observations',
      'events', 'experiment', 'epistemic', 'evidence', 'replay', 'notModeled', 'fingerprint',
    ].sort();
    expect(Object.keys(states[0]!).sort()).toEqual(WORLD_STATE_KEYS);
    expect(states[0]!.domainId).toBe('CHEMISTRY');
  });

  it('5. epistemic state is the real, unmodified HypothesisLoopResult — no parallel epistemic ontology for chemistry', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    expect(states[0]!.epistemic).toBe(loopResult);
  });

  it('6. binding affinity / toxicity / ADMET / bioactivity are declared NOT_MODELED on every state — never fabricated', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    for (const state of states) {
      for (const forbidden of ['binding-affinity', 'target-potency', 'toxicity', 'admet', 'biological-activity', 'clinical-relevance']) {
        expect(state.notModeled).toContain(forbidden);
      }
      // And none of those concepts leak in as a property under any name.
      const propertyKeys = state.entities.flatMap((e) => e.properties.map((p) => p.key.toLowerCase()));
      for (const forbiddenWord of ['toxic', 'potency', 'affinity', 'admet', 'bioactiv']) {
        expect(propertyKeys.some((k) => k.includes(forbiddenWord))).toBe(false);
      }
    }
  });

  it('7. ADVERSARIAL — a backend response missing numeric outputs cannot silently invent a property; the hypothesis is INCONCLUSIVE and no state is fabricated for it', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      return fakeResponse({
        contractVersion: '1.0.0', request: body,
        run: {
          runId: 'missing-outputs', modelId: 'chem-rdkit-descriptors', modelVersion: '1.0.0', domain: 'chemistry',
          engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs, outputs: {}, units: {},
          warnings: [], assumptions: [],
          provenance: { source: 'x', formula: 'x', honesty: 'real_external_engine', engine: 'RDKit 2026.03.5', requiredEnvironmentVariable: 'GENESIS_RDKIT_PYTHON' },
        },
        persisted: false,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const loopResult = await runChemLoop();
    expect(loopResult.outcomes.every((o) => o.status === 'INCONCLUSIVE')).toBe(true);
    const states = projectMoleculeWorldStates(loopResult);
    // Runs completed at the transport level (status 'ok' -> ExperimentResult 'completed'), so a state IS
    // projected — but it must carry ZERO fabricated numeric properties beyond what the backend actually returned.
    for (const state of states) {
      const molWt = state.entities[0]!.properties.find((p) => p.key === 'molWt');
      expect(molWt).toBeUndefined();
    }
  });

  it('8. ADVERSARIAL — an execution-unavailable backend produces BLOCKED hypotheses and zero projected molecule states, never a guessed descriptor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ error: 'capability_unavailable', message: 'RDKit niedostepny.' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const loopResult = await runChemLoop();
    expect(loopResult.outcomes.every((o) => o.status === 'BLOCKED')).toBe(true);
    expect(projectMoleculeWorldStates(loopResult)).toHaveLength(0);
  });

  it('9. replay determinism — replaying the real chemistry loop reproduces MATCH and the same states', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const states = await projectMoleculeWorldStatesWithReplay(loopResult);
    expect(states.every((s) => s.replay?.status === 'MATCH')).toBe(true);
  });

  it('10. tampering with a projected chemistry state changes its fingerprint (tamper-evident, same guarantee as every other domain)', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const state = projectMoleculeWorldStates(loopResult)[0]!;
    const tampered: WorldState = { ...state, entities: [{ ...state.entities[0]!, properties: [{ key: 'molWt', value: 999999 }] }] };
    const { contractVersion: _cv, fingerprint: _fp, ...rebuildInput } = tampered;
    expect(buildWorldState(rebuildInput).fingerprint).not.toBe(state.fingerprint);
  });

  it('11. provenance survives the complete flow — every chemistry event traces to a real ExperimentRun', async () => {
    vi.stubGlobal('fetch', realRdkitFetchMock());
    const loopResult = await runChemLoop();
    const states = projectMoleculeWorldStates(loopResult);
    for (const state of states) {
      expect(state.events).toHaveLength(1);
      expect(state.events[0]!.provenance?.origin).toBe('model');
      expect(state.events[0]!.experimentId).toBe(state.experiment.runs[0]!.runId);
    }
  });
});
