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

const teleportRun = {
  runId: '0aa4e400-0000-4000-8000-000000000006',
  modelId: 'quantum-teleportation',
  modelVersion: '1.0.0',
  domain: 'quantum',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { state: 'plusI', stateLabel: '|+i⟩ = (|0⟩+i|1⟩)/√2', branchCount: 4, minFidelity: 1, averageFidelity: 1, allRecovered: true, branch00Correction: 'I', branch01Correction: 'X', branch10Correction: 'Z', branch11Correction: 'XZ', branch00Fidelity: 1, branch01Fidelity: 1, branch10Fidelity: 1, branch11Fidelity: 1 },
  units: { state: '', stateLabel: '', branchCount: '', minFidelity: '', averageFidelity: '', allRecovered: '', branch00Correction: '', branch01Correction: '', branch10Correction: '', branch11Correction: '', branch00Fidelity: '', branch01Fidelity: '', branch10Fidelity: '', branch11Fidelity: '' },
  warnings: ['Wierność równa 1 wynika z idealnego protokołu stanu-wektora.'],
  validity: 'Idealny pełny wektor stanu trzech kubitów dla teleportacji.',
  assumptions: ['Dwa bity klasyczne są wymagane do korekty Boba.'],
  provenance: {
    source: 'core/quantum/teleportationRunner.ts → core/quantumState.ts via compute/core.bundle.mjs', formula: 'full three-qubit state vector', honesty: 'exact_ideal_state_vector_protocol', engine: 'Genesis three-qubit state-vector teleportation (shared Canvas/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const blochRun = {
  runId: '0aa4e400-0000-4000-8000-000000000009',
  modelId: 'quantum-bloch-circuit',
  modelVersion: '1.1.0',
  domain: 'quantum',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { gates: 'H X', finalAmplitude0Re: 0.7071067811865475, finalAmplitude0Im: 0, finalAmplitude1Re: 0.7071067811865475, finalAmplitude1Im: 0, probability0: 0.5, probability1: 0.5, blochX: 1, blochY: 0, blochZ: 0, normSquared: 1 },
  units: { gates: '', finalAmplitude0Re: '', finalAmplitude0Im: '', finalAmplitude1Re: '', finalAmplitude1Im: '', probability0: '', probability1: '', blochX: '', blochY: '', blochZ: '', normSquared: '' },
  warnings: ['Prawdopodobieństwa wynikają z reguły Borna dla idealnego wektora stanu.'],
  validity: 'Idealne bramki jednokubitowe; bez sprzętu, szumu i pomiaru.',
  assumptions: ['Stan początkowy |0⟩.', 'Nie jest wykonywany pojedynczy losowy pomiar.'],
  provenance: {
    source: 'labs/experiments/quantum-bloch.ts via compute/core.bundle.mjs', formula: 'exact 2×2 complex unitary matrices', honesty: 'exact_ideal_single_qubit_state_vector', engine: 'Genesis single-qubit unitary state-vector (shared Canvas/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const kitaevRun = {
  runId: '0aa4e400-0000-4000-8000-000000000010',
  modelId: 'quantum-kitaev-bulk',
  modelVersion: '1.1.0',
  domain: 'quantum',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { bulkGap: 2, momentumAtGap: Math.PI, topologicalInvariant: -1, phase: 'TOPOLOGICAL_REGIME', criticalChemicalPotentialNegative: -2, criticalChemicalPotentialPositive: 2 },
  units: { bulkGap: 'jedn. energii', momentumAtGap: 'rad', topologicalInvariant: '', phase: '', criticalChemicalPotentialNegative: 'jedn. energii', criticalChemicalPotentialPositive: 'jedn. energii' },
  warnings: ['Klasyfikacja dotyczy translacyjnie niezmiennego bulk modelu.'],
  validity: 'Bulk model only; not a material, nanowire or device.',
  assumptions: ['Translacyjnie niezmienny łańcuch p-wave.'],
  provenance: {
    source: 'core/compute/kitaevBulk.ts via compute/core.bundle.mjs', formula: 'E(k)² = (−2t cos k − μ)² + 4Δ² sin²k', honesty: 'exact_bounded_analytic_bulk_model', engine: 'Genesis Kitaev bulk BdG analytical minimizer (shared frontend/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const chshRun = {
  runId: '0aa4e400-0000-4000-8000-000000000011',
  modelId: 'quantum-chsh-correlation',
  modelVersion: '1.1.0',
  domain: 'quantum',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { eAB: -Math.SQRT1_2, eABP: Math.SQRT1_2, eAPB: -Math.SQRT1_2, eAPBP: -Math.SQRT1_2, s: -2 * Math.SQRT2, absS: 2 * Math.SQRT2, tsirelsonBound: 2 * Math.SQRT2 },
  units: { eAB: '', eABP: '', eAPB: '', eAPBP: '', s: '', absS: '', tsirelsonBound: '' },
  warnings: ['To dokładna predykcja idealnego singletu, nie wynik eksperymentu detektorowego.'],
  validity: 'Ideal singlet correlation only; not a detector experiment.',
  assumptions: ['Idealny stan singletowy i idealne ustawienia pomiarowe.'],
  provenance: {
    source: 'labs/experiments/quantum-chsh.ts via compute/core.bundle.mjs', formula: 'E(a,b)=−cos(a−b); CHSH combination', honesty: 'exact_ideal_singlet_correlation', engine: 'Genesis analytical singlet CHSH correlation (shared frontend/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const photonRun = {
  runId: '0aa4e400-0000-4000-8000-000000000012',
  modelId: 'photon-energy',
  modelVersion: '1.1.0',
  domain: 'electrodynamics',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { photonEnergyEV: 2.479683968, photonFrequencyTHz: 599.584916, photonEnergyKJmol: 239.305005736 },
  units: { photonEnergyEV: 'eV', photonFrequencyTHz: 'THz', photonEnergyKJmol: 'kJ/mol' },
  warnings: [],
  validity: 'Pojedynczy foton w próżni; nie jest modelem oddziaływania z materiałem.',
  assumptions: ['E=hc/λ i f=c/λ.'],
  provenance: {
    source: 'core/modelGraph/photonGraph.ts via compute/core.bundle.mjs', formula: 'E=hc/λ; f=c/λ; E[kJ/mol]=E[eV]·96.485332', honesty: 'exact', engine: 'Genesis photon-energy ModelGraph (shared frontend/backend graph)', requiredEnvironmentVariable: 'not-required',
  },
};

const lawsonRun = {
  runId: '0aa4e400-0000-4000-8000-000000000013',
  modelId: 'nuclear-tokamak-lawson',
  modelVersion: '1.1.0',
  domain: 'nuclear',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { densityExponent: 20, densityPerM3: 1e20, temperatureKeV: 15, confinementSeconds: 1.5, tripleProduct: 2.25e21, lawsonThreshold: 3e21, lawsonRatio: 0.75, ignitionCriterionMet: false },
  units: { densityExponent: '', densityPerM3: 'm⁻³', temperatureKeV: 'keV', confinementSeconds: 's', tripleProduct: 'keV·s/m³', lawsonThreshold: 'keV·s/m³', lawsonRatio: '', ignitionCriterionMet: '' },
  warnings: ['Przekroczenie progu w tym modelu 0D nie dowodzi wykonalności reaktora.'],
  validity: '0D criterion only; not MHD or a reactor prediction.',
  assumptions: ['Jednorodny scenariusz D–T z ustalonym progiem Lawsona.'],
  provenance: {
    source: 'labs/experiments/nuclear-tokamak.ts via compute/core.bundle.mjs', formula: 'n·T·τ_E / (3×10²¹ keV·s/m³)', honesty: 'bounded_0d_lawson_criterion', engine: 'Genesis D–T Lawson 0D criterion (shared frontend/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const nuclideRun = {
  runId: '0aa4e400-0000-4000-8000-000000000014',
  modelId: 'nuclear-nuclide-chart',
  modelVersion: '1.1.0',
  domain: 'nuclear',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { protonNumber: 26, neutronNumber: 30, massNumber: 56, bindingPerNucleonMeV: 8.67, stabilityGradient: 0, knownNuclide: true, measuredSymbol: 'Fe-56', measuredDecayMode: 'stabilny', measuredHalfLife: 'stabilny' },
  units: { protonNumber: '', neutronNumber: '', massNumber: '', bindingPerNucleonMeV: 'MeV/nukleon', stabilityGradient: '', knownNuclide: '', measuredSymbol: '', measuredDecayMode: '', measuredHalfLife: '' },
  warnings: ['Symbol i rozpad pochodzą z ograniczonego lokalnego katalogu; energia pochodzi z SEMF.'],
  validity: 'SEMF plus bounded measured catalog; no decay kinetics.',
  assumptions: ['SEMF jako przybliżenie kroplowe.'],
  provenance: {
    source: 'labs/experiments/nuclear-chart.ts via compute/core.bundle.mjs; data/nuclides.ts', formula: 'SEMF binding per nucleon and local catalog lookup', honesty: 'semf_model_plus_bounded_measured_catalog', engine: 'Genesis nuclide SEMF + bounded measured catalog (shared frontend/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const titrationRun = {
  runId: '0aa4e400-0000-4000-8000-000000000015',
  modelId: 'chemistry-titration',
  modelVersion: '1.1.0',
  domain: 'chemistry',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { acid: 'acetic', acidName: 'Kwas octowy CH₃COOH (pKa≈4,74)', ka: 1.8e-5, vb: 0, ph: 2.88, veq: 25, pKa: 4.744727494896694 },
  units: { acid: '', acidName: '', ka: 'mol/L', vb: 'mL', ph: '', veq: 'mL', pKa: '' },
  warnings: ['Wynik dotyczy ustalonego, idealizowanego scenariusza laboratoryjnego.'],
  validity: 'Charge balance scenario only; not a sample measurement.',
  assumptions: ['Ca=Cb=0,1 mol/L; Va=25 mL; NaOH mocna zasada.'],
  provenance: {
    source: 'labs/experiments/chemistry-titration.ts via compute/core.bundle.mjs; core/physics.ts:titrationPH', formula: 'bilans ładunku słabego kwasu + NaOH z autodysocjacją wody', honesty: 'bounded_charge_balance_scenario', engine: 'Genesis weak-acid charge-balance titration (shared frontend/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const vseprRun = {
  runId: '0aa4e400-0000-4000-8000-000000000016',
  modelId: 'chem-vsepr',
  modelVersion: '1.1.0',
  domain: 'chemistry',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { shapeId: 'ax4', name: 'Tetraedryczna (AX₄)', example: 'CH₄', bonding: 4, lone: 0, angleLabel: '109,5°', angleMeasured: false, bondingVecs: '[[0.577,0.577,0.577]]', loneVecs: '[]' },
  units: { shapeId: '', name: '', example: '', bonding: '', lone: '', angleLabel: '', angleMeasured: '', bondingVecs: 'unit-vector[] (JSON)', loneVecs: 'unit-vector[] (JSON)' },
  warnings: [],
  validity: 'VSEPR domain geometry only; not electronic structure.',
  assumptions: ['Idealna geometria domen VSEPR.'],
  provenance: {
    source: 'labs/experiments/chemistry-vsepr.ts via compute/core.bundle.mjs', formula: 'deterministic VSEPR domain vectors', honesty: 'bounded_vsepr_geometry', engine: 'Genesis VSEPR domain-geometry runner (shared frontend/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const tunnelingRun = {
  runId: '0aa4e400-0000-4000-8000-000000000005',
  modelId: 'quantum-tunneling-1d',
  modelVersion: '1.0.0',
  domain: 'quantum',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { energy: 0.55, barrier: 1, width: 3, frames: 1200, transmission: 0.138912, reflection: 0.784201, remainingProbability: 0.076887 },
  units: { energy: '', barrier: 'j. nat.', width: 'j. nat.', frames: 'kroki', transmission: '', reflection: '', remainingProbability: '' },
  warnings: ['Maska pochłaniająca przy brzegach redukuje numeryczne odbicia.'],
  validity: 'Pakiet Gaussa 1D i pojedyncza bariera prostokątna, ħ=m=1.',
  assumptions: ['Wspólny runner split-step Fourier Canvas/backend.'],
  provenance: {
    source: 'core/quantum/tunnelingRunner.ts via compute/core.bundle.mjs', formula: 'split-step Fourier, ħ=m=1', honesty: 'real_shared_numerical_engine', engine: 'Genesis split-step Fourier 1D (shared Canvas/backend runner)', requiredEnvironmentVariable: 'not-required',
  },
};

const pyscfRun = {
  runId: '0aa4e400-0000-4000-8000-000000000004',
  modelId: 'quantum-chemistry-pyscf-h2-rhf',
  modelVersion: '1.0.0',
  domain: 'quantum-chemistry',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { energyHartree: -1.11675931, homoHartree: -0.578554, lumoHartree: 0.671143, homoLumoGapHartree: 1.249697, homoLumoGapEv: 34.0052, dipoleDebye: 0, nElectrons: 2, nBasisFunctions: 2 },
  units: { energyHartree: 'Hartree', homoHartree: 'Hartree', lumoHartree: 'Hartree', homoLumoGapHartree: 'Hartree', homoLumoGapEv: 'eV', dipoleDebye: 'D', nElectrons: '', nBasisFunctions: '' },
  warnings: ['PySCF 2.13.0; RHF/sto-3g; neutral H2 singlet.'],
  validity: 'H2 only, 0.5–3.0 Å, real validated PySCF runtime.',
  assumptions: ['Neutralny H2, singlet, RHF/STO-3G.'],
  provenance: {
    source: 'compute/qm_worker.py via compute/qmAdapter.mjs', formula: 'PySCF RHF single-point; H2 singlet; STO-3G', honesty: 'real_external_engine', engine: 'PySCF 2.13.0', requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON',
  },
};

const openmmRun = {
  runId: '0aa4e400-0000-4000-8000-000000000008',
  modelId: 'biology-openmm-md-1vii-reference', modelVersion: '1.0.0', domain: 'biology-vaccine-discovery', engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true,
  outputs: { atomCountAfterHydrogenAddition: 596, potentialEnergyBeforeKjPerMol: -798.3842000735617, potentialEnergyMinimizedKjPerMol: -5091.295432895097, potentialEnergyAfterKjPerMol: -3705.2575889291966, simulatedPicoseconds: 0.2 },
  units: { atomCountAfterHydrogenAddition: 'atomy', potentialEnergyBeforeKjPerMol: 'kJ/mol', potentialEnergyMinimizedKjPerMol: 'kJ/mol', potentialEnergyAfterKjPerMol: 'kJ/mol', simulatedPicoseconds: 'ps' },
  warnings: ['COMPUTATIONAL_RESULT: bounded OpenMM runtime benchmark only.'],
  validity: 'PDB 1VII reference only.', assumptions: ['AMBER14 implicit OBC2; single CPU thread; 100 steps.'],
  provenance: { source: 'RCSB PDB 1VII via compute/openmm_worker.py', formula: 'AMBER14 implicit OBC2 + LangevinMiddle MD', honesty: 'real_external_engine_computational_result', engine: 'OpenMM 8.6 CPU', classification: 'COMPUTATIONAL_RESULT', requiredEnvironmentVariables: ['GENESIS_OPENMM_PYTHON', 'GENESIS_OPENMM_DATA_DIR'] },
};

const structuralRun = {
  runId: '0aa4e400-0000-4000-8000-000000000007',
  modelId: 'biology-hiv-10e8-pdb-structural-comparison',
  modelVersion: '1.1.0',
  domain: 'biology-vaccine-discovery',
  engine: 'genesis-compute@1.0.0',
  status: 'ok',
  deterministic: true,
  outputs: { fab10e8RmsdAngstrom: 8.242672750748403, fabMatchedCaAtoms: 422, mperInFabAlignedFrameRmsdAngstrom: 17.041076297900034, mperMatchedIdenticalCaAtoms: 13 },
  units: { fab10e8RmsdAngstrom: 'Å', fabMatchedCaAtoms: 'atomy', mperInFabAlignedFrameRmsdAngstrom: 'Å', mperMatchedIdenticalCaAtoms: 'atomy' },
  warnings: ['COMPUTATIONAL_RESULT: structure-only comparison; not affinity or efficacy.'],
  validity: 'Manifestowane pary 5GHW→4G6F oraz 5GHW→5WDF.',
  assumptions: ['C-alpha least-squares superposition in the Fab 10E8 frame.'],
  provenance: {
    source: 'RCSB PDB 5GHW / 4G6F / 5WDF; compute/structural_worker.py',
    formula: 'C-alpha least-squares superposition + RMSD',
    honesty: 'real_external_engine_computational_result',
    engine: 'Biopython 1.88', classification: 'COMPUTATIONAL_RESULT',
    referencePdb: '5GHW', mobilePdb: '4G6F', referenceSha256: 'a'.repeat(64), mobileSha256: 'b'.repeat(64),
    requiredEnvironmentVariables: ['GENESIS_BIOPYTHON_PYTHON', 'GENESIS_PDB_STRUCTURES_DIR'],
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

  it('confirms a reviewed teleportation plan through the canonical backend Fabric endpoint and preserves state-vector provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: teleportRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom teleportację kwantową stan=plusI.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'quantum-teleportation', domainId: 'quantum', inputs: { state: 'plusI' },
    });
    expect(confirmed.run.result.outputs).toMatchObject({ branchCount: 4, allRecovered: true, minFidelity: 1 });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis three-qubit state-vector teleportation (shared Canvas/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(teleportRun.runId);
  });

  it('confirms a reviewed single-qubit Bloch plan through the canonical backend and preserves shared-runner provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: blochRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Wykonaj obwód kubitowy: H X.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'quantum-bloch-circuit', domainId: 'quantum', inputs: { circuit: 'H X' },
    });
    expect(confirmed.run.result.outputs).toMatchObject({ probability0: 0.5, probability1: 0.5, normSquared: 1, blochX: 1 });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis single-qubit unitary state-vector (shared Canvas/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(blochRun.runId);
  });

  it('confirms a reviewed Kitaev bulk plan through the canonical backend and preserves bounded analytical provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: kitaevRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Zasymuluj łańcuch Kitaeva mu=0 t=1 delta=1.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'quantum-kitaev-bulk', domainId: 'quantum', inputs: { chemicalPotential: 0, hopping: 1, pairing: 1 },
    });
    expect(confirmed.run.result.outputs).toMatchObject({ bulkGap: 2, topologicalInvariant: -1, phase: 'TOPOLOGICAL_REGIME' });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis Kitaev bulk BdG analytical minimizer (shared frontend/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(kitaevRun.runId);
  });

  it('confirms a reviewed CHSH plan through the canonical backend and preserves analytical-singlet provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: chshRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Oblicz korelację CHSH dla nierówności Bella.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'quantum-chsh-correlation', domainId: 'quantum', inputs: {},
    });
    expect(confirmed.run.result.outputs.absS).toBeCloseTo(2 * Math.SQRT2, 12);
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis analytical singlet CHSH correlation (shared frontend/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(chshRun.runId);
  });

  it('confirms a reviewed photon-energy plan through the canonical backend and preserves shared-graph provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: photonRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Oblicz energię fotonu o długości fali 500 nm.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'photon-energy', domainId: 'electrodynamics', inputs: { wavelengthNm: 500 },
    });
    expect(confirmed.run.result.outputs.photonEnergyEV).toBeCloseTo(2.479683968, 12);
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis photon-energy ModelGraph (shared frontend/backend graph)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(photonRun.runId);
  });

  it('confirms a reviewed Lawson 0D plan through the canonical backend and preserves shared-runner provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: lawsonRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Sprawdź kryterium Lawsona tokamak.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'nuclear-tokamak-lawson', domainId: 'nuclear', inputs: {},
    });
    expect(confirmed.run.result.outputs).toMatchObject({ lawsonRatio: 0.75, ignitionCriterionMet: false });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis D–T Lawson 0D criterion (shared frontend/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(lawsonRun.runId);
  });

  it('confirms a reviewed nuclide plan through the canonical backend and preserves model-versus-catalog provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: nuclideRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Pokaż mapę nuklidów dla protony = 26 neutrony = 30.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'nuclear-nuclide-chart', domainId: 'nuclear', inputs: { protonNumber: 26, neutronNumber: 30 },
    });
    expect(confirmed.run.result.outputs).toMatchObject({ massNumber: 56, knownNuclide: true, measuredSymbol: 'Fe-56' });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis nuclide SEMF + bounded measured catalog (shared frontend/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(nuclideRun.runId);
  });

  it('confirms a reviewed titration plan through the canonical backend and preserves shared-runner provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: titrationRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Oblicz miareczkowanie kwasowo-zasadowe NaOH.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'chemistry-titration', domainId: 'chemistry', inputs: {},
    });
    expect(confirmed.run.result.outputs).toMatchObject({ acid: 'acetic', veq: 25 });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis weak-acid charge-balance titration (shared frontend/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(titrationRun.runId);
  });

  it('confirms a reviewed VSEPR plan through the canonical backend and preserves shared-runner provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: vseprRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Pokaż geometrię cząsteczki VSEPR.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'chem-vsepr', domainId: 'chemistry', inputs: {},
    });
    expect(confirmed.run.result.outputs).toMatchObject({ shapeId: 'ax4', example: 'CH₄', bonding: 4, lone: 0 });
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis VSEPR domain-geometry runner (shared frontend/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(vseprRun.runId);
  });

  it('confirms a reviewed tunneling plan through the canonical backend Fabric endpoint and preserves shared-runner provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: tunnelingRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Zasymuluj tunelowanie kwantowe energy=0.55 barrier=1 width=3.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'quantum-tunneling-1d', domainId: 'quantum', inputs: { energy: 0.55, barrier: 1, width: 3 },
    });
    expect(confirmed.run.result.outputs.transmission).toBeCloseTo(0.138912, 12);
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Genesis split-step Fourier 1D (shared Canvas/backend runner)');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(tunnelingRun.runId);
  });

  it('confirms a reviewed PySCF H2 plan through the same canonical Fabric endpoint and preserves real-engine provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: pyscfRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom PySCF RHF dla H2; długość wiązania 0.74 Å.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'quantum-chemistry-pyscf-h2-rhf', domainId: 'quantum-chemistry', inputs: { bondLengthAngstrom: 0.74 },
    });
    expect(confirmed.run.result.outputs.energyHartree).toBeCloseTo(-1.11675931, 12);
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('PySCF 2.13.0');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendRunId).toBe(pyscfRun.runId);
  });

  it('confirms a reviewed OpenMM MD reference plan through the canonical backend and preserves engine provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: openmmRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Uruchom OpenMM MD benchmark 1VII.'));
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'biology-openmm-md-1vii-reference', domainId: 'biology-vaccine-discovery', inputs: {},
    });
    expect(confirmed.run.result.outputs.simulatedPicoseconds).toBe(0.2);
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('OpenMM 8.6 CPU');
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.classification).toBe('COMPUTATIONAL_RESULT');
  });

  it('confirms a reviewed HIV MPER/10E8 PDB RMSD plan through the canonical backend and preserves structural provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contractVersion: '1.0.0', request: {}, run: structuralRun, persisted: false }));
    vi.stubGlobal('fetch', fetchMock);
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Porównaj PDB RMSD HIV MPER 10E8: 5GHW i 4G6F.'));

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(isBackendEvidenceGuidedPlan(reviewed)).toBe(true);
    const confirmed = await confirmBackendEvidenceGuidedExperiment(reviewed);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contractVersion: '1.0.0', modelId: 'biology-hiv-10e8-pdb-structural-comparison', domainId: 'biology-vaccine-discovery',
      inputs: { referencePdb: '5GHW', mobilePdb: '4G6F' },
    });
    expect(confirmed.run.result.outputs.fab10e8RmsdAngstrom).toBeCloseTo(8.242672750748403, 12);
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.engine).toBe('Biopython 1.88');
    expect(confirmed.run.provenance.backendExecution?.backendProvenance.classification).toBe('COMPUTATIONAL_RESULT');
    expect(capsuleFromConfirmedExperiment(confirmed).backendExecution?.backendProvenance.referenceSha256).toBe('a'.repeat(64));
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
