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
import { descriptors } from './compute/rdkitAdapter.mjs';
import { getTool, TOOL_STATUS } from './campaign/toolchain.mjs';

export const PREDICTION_OPERATORS = Object.freeze(['<', '<=', '>', '>=', '==', '!=']);
export const MAX_PREDICTIONS = 8;
const MAX_SMILES = 500;

export const RESEARCH_RUN_EXECUTORS = Object.freeze({
  rdkit: Object.freeze({
    engineId: 'rdkit',
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
