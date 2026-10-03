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
