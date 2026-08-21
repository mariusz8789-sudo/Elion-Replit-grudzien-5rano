import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmBackendEvidenceGuidedExperiment,
  capsuleFromConfirmedExperiment,
  isBackendEvidenceGuidedPlan,
  parseScienceChatMessage,
  planEvidenceGuidedExperiment,
} from '../core/experimentFabric';

function fakeResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const meepRun = {
  runId: '0aa4e400-0000-4000-8000-000000000001',
  modelId: 'electrodynamics-maxwell-fdtd',
  modelVersion: '1.0.0',
  domain: 'electrodynamics',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: {
    computedTransmittance: 0.8895759491718322,
    computedReflectance: 0.11042405082816775,
    analyticTransmittance: 8 / 9,
    analyticReflectance: 1 / 9,
    transmittanceAbsoluteError: 0.000687060282943408,
    reflectanceAbsoluteError: 0.0006870602829433525,
    energyClosure: 1,
    incidentFlux: 4.002570088097233,
    reflectedFlux: 0.44198000285135275,
  },
  units: {
    computedTransmittance: '', computedReflectance: '', analyticTransmittance: '', analyticReflectance: '',
    transmittanceAbsoluteError: '', reflectanceAbsoluteError: '', energyClosure: '',
    incidentFlux: 'jednostki Meep', reflectedFlux: 'jednostki Meep',
  },
  warnings: ['PyMeep 1.34.0; real FDTD.'],
  validity: 'Ograniczona granica dielektryczna 1D.',
  assumptions: ['Ośrodki bezstratne i niedyspersyjne.'],
  provenance: {
    source: 'compute/meep_worker.py via compute/meepAdapter.mjs',
    formula: 'Maxwell FDTD + reflected-flux incident-field subtraction',
    honesty: 'real_external_engine',
    engine: 'PyMeep',
    requiredEnvironmentVariable: 'GENESIS_MEEP_PYTHON',
  },
};

const rdkitRun = {
  runId: '0aa4e400-0000-4000-8000-000000000003',
  modelId: 'chem-rdkit-descriptors',
  modelVersion: '1.0.0',
  domain: 'chemistry',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { molWt: 46.069, exactMolWt: 46.04186, crippenLogP: -0.0014, hbd: 1, hba: 1, rotatableBonds: 0, ringCount: 0, aromaticRings: 0, fractionCsp3: 1, tpsa: 20.23, heavyAtomCount: 3, heteroatomCount: 1, formalCharge: 0, lipinskiViolations: 0, canonicalSmiles: 'CCO', molecularFormula: 'C2H6O' },
  units: { molWt: 'g/mol', exactMolWt: 'g/mol', crippenLogP: '', hbd: '', hba: '', rotatableBonds: '', ringCount: '', aromaticRings: '', fractionCsp3: '', tpsa: 'Å²', heavyAtomCount: '', heteroatomCount: '', formalCharge: '', lipinskiViolations: '' },
  warnings: ['RDKit descriptors are not QSAR, docking, ADMET or biological activity.'],
  validity: 'Valid SMILES and configured RDKit runtime only.',
  assumptions: ['Two-dimensional topological molecular descriptors.'],
  provenance: {
    source: 'RDKit via compute/rdkitAdapter.mjs', formula: 'RDKit Descriptors / Lipinski / Crippen', honesty: 'real_external_engine', engine: 'RDKit 2026.03.5', requiredEnvironmentVariable: 'GENESIS_RDKIT_PYTHON',
  },
};

const depmapRun = {
  runId: '0aa4e400-0000-4000-8000-000000000002',
  modelId: 'biology-depmap-crispr-senescence-panel',
  modelVersion: '1.0.0',
  domain: 'biology',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { cellLineCount: 1150, matrixGeneCount: 18443, controlCalibrationPass: 1, controlMedianSeparation: -1.0028181467925583, cdkn1aMedian: 0.27315700381056046 },
  units: { cellLineCount: 'modele komórkowe', matrixGeneCount: 'geny', controlCalibrationPass: '0/1', controlMedianSeparation: 'CERES gene effect', cdkn1aMedian: 'CERES gene effect' },
  warnings: ['Descriptive cancer-cell-line result only; not clinical evidence.'],
  validity: 'Checksum-verified DepMap 24Q2 source artefacts only.',
  assumptions: ['Predeclared p53/p21 and p16/RB panel.'],
  provenance: {
    source: 'DepMap 24Q2 Public, DOI:10.25452/figshare.plus.25880521 via compute/depmap_worker.py',
    formula: 'Descriptive corrected CERES gene-effect summaries.',
    honesty: 'real_versioned_dataset',
    engine: 'DepMap 24Q2 CRISPR Gene Effect (Chronos/CERES)',
    requiredEnvironmentVariable: 'GENESIS_DEPMAP_24Q2_DATA_DIR',
  },
};

describe('backend Evidence-Guided execution', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('confirms a reviewed Meep plan only by delegating to the canonical backend Fabric endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: meepRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom Meep FDTD dla granicy dielektrycznej n1=1 n2=2 frequency=1 resolution=80.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);

    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/compute/fabric/run');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'electrodynamics-maxwell-fdtd', domainId: 'electrodynamics',
      inputs: { n1: 1, n2: 2, frequency: 1, resolution: 80 },
    });
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.outputs.computedTransmittance).toBeCloseTo(0.8895759491718322, 12);
    expect(confirmed.run.provenance.resultOrigin).toBe('real-engine');
    expect(confirmed.run.provenance.backendExecution).toMatchObject({
      backendRunId: meepRun.runId,
      backendEngine: 'genesis-compute@1.0.0',
      backendModelVersion: '1.0.0',
      backendProvenance: { engine: 'PyMeep' },
    });
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.backendExecution?.backendRunId).toBe(meepRun.runId);
    expect(capsule.backendExecution?.backendProvenance.engine).toBe('PyMeep');
    expect(confirmed.handoff.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(confirmed.handoff.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('confirms a reviewed RDKit descriptor plan through the same canonical Fabric endpoint and preserves structure provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: rdkitRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom RDKit deskryptory SMILES: CCO'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'chem-rdkit-descriptors', domainId: 'chemistry', inputs: { smiles: 'CCO' },
    });
    expect(confirmed.run.result.outputs.molWt).toBeCloseTo(46.069, 12);
    expect(confirmed.run.result.outputs.canonicalSmiles).toBe('CCO');
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('RDKit 2026.03.5');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(rdkitRun.runId);
  });

  it('confirms a reviewed DepMap data plan through the same canonical Fabric endpoint and preserves data provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: depmapRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom DepMap CRISPR panel p53 i p21.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);

    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'biology-depmap-crispr-senescence-panel', domainId: 'biology-aging-lab', inputs: {},
    });
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.outputs.cellLineCount).toBe(1150);
    expect(confirmed.run.result.summary).toContain('DepMap 24Q2 CRISPR Gene Effect');
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toContain('DepMap 24Q2');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(depmapRun.runId);
  });

  it('rejects a backend response whose model identity differs from the reviewed plan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: { ...meepRun, modelId: 'wrong-model' }, persisted: false })));
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom Meep FDTD dla granicy dielektrycznej.'));
    await expect(confirmBackendEvidenceGuidedExperiment(reviewed)).rejects.toThrow('model identity or version');
  });

  it('keeps the plan without a result when the backend reports a blocked runtime', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ error: 'BLOCKED_BY_RUNTIME', message: 'PyMeep runtime is not configured.' }, 400)));
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom Meep FDTD dla granicy dielektrycznej.'));
    await expect(confirmBackendEvidenceGuidedExperiment(reviewed)).rejects.toThrow('BLOCKED_BY_RUNTIME');
  });
});
