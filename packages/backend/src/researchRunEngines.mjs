/**
 * R1-b — which proposed experiments a ResearchRun can execute itself, and how.
 *
 * This is not a second toolchain. Availability comes from the canonical toolchain
 * (campaign/toolchain.mjs: an engine is AVAILABLE only when its own reference case passed here) and
 * execution goes through the engine's existing adapter. What this file adds is the contract between a
 * model-proposed experiment and a machine check: which input an engine takes and which of its output
 * fields a frozen prediction may name. An engine without an entry here is not executable from a
 * ResearchRun (NO_RESEARCH_RUN_ADAPTER); nothing is ever substituted for it.
 */
import { descriptors, embed3d } from './compute/rdkitAdapter.mjs';
import { singlePoint as pyscfSinglePoint } from './compute/qmAdapter.mjs';
import { dock as vinaDock } from './compute/dockingAdapter.mjs';
import { referenceCase as openmmWaterBox } from './compute/mdAdapter.mjs';
import { predict as admetPredict } from './compute/admetAdapter.mjs';
import { admitAdmetUse } from './compute/admetResearchRunExecutor.mjs';
import { resolveEngineUsePurpose } from './compute/engineUsePurpose.mjs';
import { endpointCategories, splitAdmetPrediction } from './campaign/multiFidelity.mjs';
import { DEFAULT_DOCKING_TARGET, listDockingTargets, prepareDockingTarget } from './compute/dockingTargets.mjs';
import { getTool, TOOL_STATUS } from './campaign/toolchain.mjs';

export const PREDICTION_OPERATORS = Object.freeze(['<', '<=', '>', '>=', '==', '!=']);
export const MAX_PREDICTIONS = 8;
const MAX_SMILES = 500;
// PySCF is bounded on purpose: small molecules, minimal/split-valence bases, Hartree-Fock only.
const PYSCF_BASES = Object.freeze(['sto-3g', '3-21g', '6-31g']);
const PYSCF_MAX_ATOMS = 12;

export const RESEARCH_RUN_EXECUTORS = Object.freeze({
  rdkit: Object.freeze({
    engineId: 'rdkit',
    /**
     * The canonical Scientific Run capability this output is stored under, so the existing replay
     * (campaign/verify.mjs, the 'molecular-descriptors' replayer) re-runs the same RDKit call.
     */
    scienceCapability: 'molecular-descriptors',
    inputShape: '{ "smiles": string }',
    /** Output fields of compute/rdkit_worker.py `descriptors` a prediction may name, and their type. */
    observables: Object.freeze({
      molWt: 'number', exactMolWt: 'number', heavyAtomCount: 'number', hbd: 'number', hba: 'number',
      rotatableBonds: 'number', ringCount: 'number', aromaticRings: 'number', fractionCsp3: 'number',
      tpsa: 'number', crippenLogP: 'number', formalCharge: 'number', heteroatomCount: 'number',
      lipinskiViolations: 'number', lipinskiPass: 'boolean',
    }),
    parseInput(parameters) {
      const smiles = typeof parameters?.smiles === 'string' ? parameters.smiles.trim() : '';
      if (!smiles) return { ok: false, reason: 'smiles_required' };
      if (smiles.length > MAX_SMILES || /\s/.test(smiles)) return { ok: false, reason: 'smiles_invalid_shape' };
      return { ok: true, input: { smiles } };
    },
    run(input) {
      const r = descriptors(input.smiles);
      if (r.ok) return { ok: true, output: r.data, engineLabel: r.engine };
      if (r.error === 'BLOCKED_BY_RUNTIME') return { ok: false, status: 'BLOCKED', reason: r.reason ?? r.error };
      if (r.error === 'invalid_smiles') return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: r.error };
      // A timeout, a killed worker or any other fault says nothing about the hypothesis: it is BLOCKED,
      // nothing is sealed, and the same frozen experiment runs again once the engine works.
      return { ok: false, status: 'BLOCKED', reason: `ENGINE_FAILED: ${r.error}${r.reason ? `: ${r.reason}` : ''}` };
    },
  }),
  pyscf: Object.freeze({
    engineId: 'pyscf',
    /** Same capability the existing replayer ('quantum-chemistry' in campaign/verify.mjs) re-runs, bit-exact. */
    scienceCapability: 'quantum-chemistry',
    inputShape: '{ "smiles": string, "basis"?: "sto-3g"|"3-21g"|"6-31g", "charge"?: integer }',
    observables: Object.freeze({
      energyHartree: 'number', homoHartree: 'number', lumoHartree: 'number', homoLumoGapHartree: 'number',
      homoLumoGapEv: 'number', dipoleDebye: 'number', converged: 'boolean', nElectrons: 'number', nBasisFunctions: 'number',
    }),
    parseInput(parameters) {
      const smiles = typeof parameters?.smiles === 'string' ? parameters.smiles.trim() : '';
      if (!smiles) return { ok: false, reason: 'smiles_required' };
      if (smiles.length > MAX_SMILES || /\s/.test(smiles)) return { ok: false, reason: 'smiles_invalid_shape' };
      const basis = parameters?.basis ?? 'sto-3g';
      if (!PYSCF_BASES.includes(basis)) return { ok: false, reason: 'basis_not_supported' };
      const input = { smiles, method: 'RHF', basis };
      if (parameters?.charge !== undefined) {
        if (!Number.isInteger(parameters.charge) || Math.abs(parameters.charge) > 2) return { ok: false, reason: 'charge_invalid' };
        input.charge = parameters.charge;
      }
      return { ok: true, input };
    },
    run(input) {
      const emb = embed3d(input.smiles);
      if (!emb.ok) {
        if (emb.error === 'BLOCKED_BY_RUNTIME') return { ok: false, status: 'BLOCKED', reason: emb.reason ?? emb.error };
        return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: emb.error };
      }
      if (emb.atoms.length > PYSCF_MAX_ATOMS) return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: `too_many_atoms_${emb.atoms.length}_max_${PYSCF_MAX_ATOMS}` };
      const r = pyscfSinglePoint({ atoms: emb.atoms, charge: input.charge ?? emb.charge ?? 0, method: input.method, basis: input.basis });
      if (r.ok) return { ok: true, output: r.data, engineLabel: String(r.meta?.engine ?? '').replace('PySCF ', '') };
      if (r.error === 'BLOCKED_BY_RUNTIME') return { ok: false, status: 'BLOCKED', reason: r.reason ?? r.error };
      if (r.error === 'invalid_input') return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: r.error };
      return { ok: false, status: 'BLOCKED', reason: `ENGINE_FAILED: ${r.error}${r.reason ? `: ${r.reason}` : ''}` };
    },
  }),

  vina: Object.freeze({
    engineId: 'vina',
    /** Same capability the existing replayer ('molecular-docking' in campaign/verify.mjs) re-runs, same fixed seed. */
    scienceCapability: 'molecular-docking',
    inputShape: '{ "ligandSmiles": string, "targetId"?: a vetted docking target id, "exhaustiveness"?: 1-16, "nPoses"?: 1-5, "seed"?: integer }',
    observables: Object.freeze({ bestAffinityKcalMol: 'number', nPoses: 'number' }),
    parseInput(parameters) {
      const ligandSmiles = typeof parameters?.ligandSmiles === 'string' ? parameters.ligandSmiles.trim() : '';
      if (!ligandSmiles) return { ok: false, reason: 'ligand_smiles_required' };
      if (ligandSmiles.length > MAX_SMILES || /\s/.test(ligandSmiles)) return { ok: false, reason: 'smiles_invalid_shape' };
      const targetId = parameters?.targetId ?? DEFAULT_DOCKING_TARGET;
      if (!listDockingTargets().includes(targetId)) return { ok: false, reason: 'unknown_docking_target' };
      const exhaustiveness = parameters?.exhaustiveness ?? 8;
      const nPoses = parameters?.nPoses ?? 3;
      const seed = parameters?.seed ?? 42;
      if (!Number.isInteger(exhaustiveness) || exhaustiveness < 1 || exhaustiveness > 16) return { ok: false, reason: 'exhaustiveness_out_of_range' };
      if (!Number.isInteger(nPoses) || nPoses < 1 || nPoses > 5) return { ok: false, reason: 'n_poses_out_of_range' };
      if (!Number.isInteger(seed)) return { ok: false, reason: 'seed_invalid' };
      // The receptor identity is part of the frozen input: the prediction is made against exactly this PDBQT.
      const target = prepareDockingTarget(targetId);
      if (!target.ok) return { ok: false, reason: target.error ?? 'target_preparation_failed' };
      return { ok: true, input: { ligandSmiles, targetId, receptorPdbqtSha256: target.receptorPdbqtSha256, center: target.center, boxSize: target.boxSize, exhaustiveness, nPoses, seed } };
    },
    run(input) {
      const target = prepareDockingTarget(input.targetId);
      if (!target.ok) return { ok: false, status: 'BLOCKED', reason: `TARGET: ${target.error}${target.reason ? `: ${target.reason}` : ''}` };
      if (target.receptorPdbqtSha256 !== input.receptorPdbqtSha256) return { ok: false, status: 'BLOCKED', reason: 'RECEPTOR_PREPARATION_DRIFT' };
      const r = vinaDock({
        ligandSmiles: input.ligandSmiles, receptorPdbqtPath: target.receptorPdbqtPath,
        center: input.center, boxSize: input.boxSize, exhaustiveness: input.exhaustiveness, nPoses: input.nPoses, seed: input.seed,
      });
      if (r.ok) return { ok: true, output: { bestAffinityKcalMol: r.data.bestAffinityKcalMol, nPoses: r.data.nPoses, poseSha256: r.data.poseSha256 }, engineLabel: r.data.vinaVersion };
      if (r.error === 'BLOCKED_BY_RUNTIME') return { ok: false, status: 'BLOCKED', reason: r.reason ?? r.error };
      if (r.error === 'invalid_input') return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: r.error };
      return { ok: false, status: 'BLOCKED', reason: `ENGINE_FAILED: ${r.error}${r.reason ? `: ${r.reason}` : ''}` };
    },
  }),

  openmm: Object.freeze({
    engineId: 'openmm',
    // No scienceCapability: platform numerics are not bit-exact, so no replay path is wired and the
    // ResearchRun records replay as NOT_APPLICABLE instead of claiming a MATCH it cannot verify.
    inputShape: '{ "steps"?: integer 100-2000 }  (the only OpenMM system Genesis runs is a TIP3P water box: software integration, not candidate stability)',
    observables: Object.freeze({
      waters: 'number', atoms: 'number', steps: 'number', temperatureK: 'number', potentialEnergyInitialKjmol: 'number',
      potentialEnergyMinimizedKjmol: 'number', potentialEnergyProductionKjmol: 'number',
    }),
    parseInput(parameters) {
      const steps = parameters?.steps ?? 300;
      if (!Number.isInteger(steps) || steps < 100 || steps > 2000) return { ok: false, reason: 'steps_out_of_range' };
      return { ok: true, input: { steps } };
    },
    run(input) {
      const r = openmmWaterBox({ steps: input.steps });
      if (r.ok) return { ok: true, output: r.data, engineLabel: `${r.version} ${r.platform}` };
      if (r.error === 'BLOCKED_BY_RUNTIME') return { ok: false, status: 'BLOCKED', reason: r.reason ?? r.error };
      return { ok: false, status: 'BLOCKED', reason: `ENGINE_FAILED: ${r.error}${r.reason ? `: ${r.reason}` : ''}` };
    },
  }),

  admet: Object.freeze({
    engineId: 'admet',
    /** Same capability the existing replayer ('admet-estimation' in campaign/verify.mjs) re-runs, 1e-4 tolerance. */
    scienceCapability: 'admet-estimation',
    inputShape: '{ "smiles": string }  (absorption, distribution, metabolism, excretion and physicochemical endpoints; MODEL_ESTIMATE, never a measurement)',
    // The endpoint list comes from the installed model, so it is read when needed and empty when the engine is absent.
    get observables() {
      return Object.fromEntries(Object.entries(endpointCategories())
        .filter(([id, meta]) => meta.category !== 'Toxicity' && !id.endsWith('_drugbank_approved_percentile'))
        .map(([id]) => [id, 'number']));
    },
    parseInput(parameters) {
      const smiles = typeof parameters?.smiles === 'string' ? parameters.smiles.trim() : '';
      if (!smiles) return { ok: false, reason: 'smiles_required' };
      if (smiles.length > MAX_SMILES || /\s/.test(smiles)) return { ok: false, reason: 'smiles_invalid_shape' };
      return { ok: true, input: { smiles } };
    },
    run(input) {
      // The licence gate is evaluated at execution time, not cached: COMMERCIAL_PRODUCT stays BLOCKED_BY_LICENSE.
      const admission = admitAdmetUse({ purpose: resolveEngineUsePurpose().admet });
      if (!admission.ok) return { ok: false, status: 'BLOCKED', reason: `${admission.status}: ${admission.failureCode}` };
      const r = admetPredict([input.smiles]);
      if (!r.ok) {
        if (r.error === 'BLOCKED_BY_RUNTIME') return { ok: false, status: 'BLOCKED', reason: r.reason ?? r.error };
        if (r.error === 'invalid_input') return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: r.error };
        return { ok: false, status: 'BLOCKED', reason: `ENGINE_FAILED: ${r.error}${r.reason ? `: ${r.reason}` : ''}` };
      }
      const full = r.predictions[input.smiles] ?? {};
      const { admetOut } = splitAdmetPrediction(full, endpointCategories());
      if (Object.keys(admetOut).length === 0) return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: 'no_endpoints_for_input' };
      return { ok: true, output: admetOut, engineLabel: r.version };
    },
  }),
});

/** The engine's state right now, read from the canonical toolchain. */
export function researchEngineStatus(engineId) {
  const tool = getTool(engineId);
  if (!tool) return { available: false, reason: `UNKNOWN_ENGINE: ${engineId}` };
  return {
    available: tool.status === TOOL_STATUS.AVAILABLE,
    reason: tool.status === TOOL_STATUS.AVAILABLE ? null : `${tool.status}${tool.reason ? `: ${tool.reason}` : ''}`,
    engineName: tool.engineName,
    version: tool.version,
    engine: tool.engine,
    toolchainFingerprint: tool.fingerprint,
    evidenceClass: tool.evidenceClass,
    environment: tool.environment,
    validationCaseIds: tool.provenance?.validationCaseIds ?? [],
  };
}

export const DEFAULT_RESEARCH_TOOLS = Object.freeze({ executors: RESEARCH_RUN_EXECUTORS, engineStatus: researchEngineStatus });

/** One line per executable engine for the model's prompt. */
export function executorPromptLines(executors = RESEARCH_RUN_EXECUTORS) {
  return Object.values(executors).map((e) => `   - "${e.engineId}": parameters ${e.inputShape.replace(/ }$/, ', "predictions": [...] }')}; observables: ${Object.entries(e.observables).map(([k, t]) => `${k} (${t})`).join(', ')}`);
}
