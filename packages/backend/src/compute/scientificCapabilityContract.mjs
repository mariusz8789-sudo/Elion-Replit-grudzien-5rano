/**
 * Canonical remote scientific execution contract (P9).
 *
 * One module, three consumers — so the three sides can never disagree about
 * what a capability request or result looks like:
 *   - compute/workerServer.mjs validates a request and executes it with the
 *     EXISTING adapters (qm/docking/protein/md/admet) — no new engine code;
 *   - compute/remoteScientificWorkerClient.mjs validates what a worker sends
 *     back before anything is persisted;
 *   - campaign/virtualLabClosedLoop.mjs builds the request from a governed
 *     plan and turns a verified result into the SAME ScienceRun shape the
 *     local path persists (see buildScienceRunRecord).
 *
 * This is not a registry: capability and tool ids are the toolchain's own
 * (campaign/toolchain.mjs), and ScienceRun persistence, scientific
 * classification, Evidence and replay remain in the main service. A worker
 * only ever receives scientific inputs — never a project, campaign or
 * candidate id — and never returns a classification.
 */
import { canonicalHash, sha256Hex16 as sha16 } from '../provenance.mjs';
import { capabilityAvailable, getTool } from '../campaign/toolchain.mjs';
import { endpointCategories, splitAdmetPrediction } from '../campaign/multiFidelity.mjs';
import { redact } from '../redact.mjs';
import * as qm from './qmAdapter.mjs';
import * as docking from './dockingAdapter.mjs';
import * as protein from './proteinAdapter.mjs';
import * as md from './mdAdapter.mjs';
import * as admet from './admetAdapter.mjs';

export const WORKER_CONTRACT_VERSION = '1.0.0';

export const WORKER_GROUPS = Object.freeze({
  'chem-light': Object.freeze(['pyscf', 'biopython']),
  structural: Object.freeze(['openmm', 'vina']),
  admet: Object.freeze(['admet', 'toxicity']),
  // Not built/tested (see workers/pymeep/Dockerfile.proposal) and has no
  // execution contract below, so a pymeep worker can only report readiness.
  pymeep: Object.freeze(['pymeep']),
});

/** Every dispatch outcome carries exactly one of these — never a generic success/failure. */
export const DISPATCH_STATE = Object.freeze({
  LOCAL_EXECUTION: 'LOCAL_EXECUTION',
  REMOTE_EXECUTION: 'REMOTE_EXECUTION',
  BLOCKED_WORKER_NOT_CONFIGURED: 'BLOCKED_WORKER_NOT_CONFIGURED',
  BLOCKED_WORKER_UNAVAILABLE: 'BLOCKED_WORKER_UNAVAILABLE',
  BLOCKED_ENGINE_UNAVAILABLE: 'BLOCKED_ENGINE_UNAVAILABLE',
  BLOCKED_INVALID_INPUT: 'BLOCKED_INVALID_INPUT',
  WORKER_TIMEOUT: 'WORKER_TIMEOUT',
  WORKER_RESPONSE_INVALID: 'WORKER_RESPONSE_INVALID',
  ENGINE_FAILED: 'ENGINE_FAILED',
});

/** Shared-secret floor for worker authentication; a shorter token counts as "not configured" on both sides. */
export const MIN_WORKER_TOKEN_LENGTH = 32;
/** executionId charset/length accepted on the wire (the Virtual Lab's own ids are `VEXP-<16 hex>`). */
export const EXECUTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export const MAX_SMILES_LENGTH = 500;
/** Same hard ceiling qm_worker.py enforces itself; checked here so an oversized geometry never leaves the main service. */
export const MAX_QM_ATOMS = 60;
export const MAX_PDB_CHARS = 2_000_000;
export const MAX_RECEPTOR_PDBQT_CHARS = 1_000_000;
const QM_METHODS = Object.freeze(['RHF', 'UHF', 'RKS', 'UKS']);
const QM_BASES = Object.freeze(['sto-3g', '3-21g', '6-31g', '6-31g*', '6-31g(d)', 'cc-pvdz', 'def2-svp']);
const MAX_ERRORS = 20;

export const MD_REFERENCE_SYSTEM =
  'TIP3P water box (LangevinMiddleIntegrator, 300 K target, 0.002 ps timestep — the adapter\'s own documented bounded reference; not the campaign candidate structure)';
export const MD_UNITS = Object.freeze({
  potentialEnergyInitialKjmol: 'kJ/mol', potentialEnergyMinimizedKjmol: 'kJ/mol', potentialEnergyProductionKjmol: 'kJ/mol', temperatureK: 'K', timestepPs: 'ps',
});
export const MD_LIMITATIONS = Object.freeze([
  'This bounded reference execution runs a fixed TIP3P water box, independent of the campaign candidate\'s own molecular structure — it proves OpenMM executes for real, but does not currently simulate this specific candidate.',
  'Random seed and box size are fixed by the underlying adapter and not currently exposed as caller-configurable parameters. Bit-level trajectory reproducibility is not guaranteed by the underlying PME/FFT implementation even single-threaded — deterministic replay is REPLAY_UNSUPPORTED for this capability, never a fabricated MATCH.',
]);

/** Keys that are the main service's job alone. A worker result containing any of them is rejected outright. */
const FORBIDDEN_RESULT_KEYS = new Set([
  'epistemicClassification', 'classification', 'derivedOutput', 'evidenceClass', 'evidence', 'claim',
  'clinicalEfficacy', 'scienceRunId', 'campaignId', 'candidateId', 'projectId',
]);

/* ------------------------------ validation helpers ------------------------------ */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function pushError(errors, message) {
  if (errors.length < MAX_ERRORS) errors.push(message);
}
/** Strict object shape. Error messages name fields and constraints only — never echo a received value. */
function checkShape(value, { required = [], optional = [] }, path, errors) {
  if (!isPlainObject(value)) { pushError(errors, `${path}: must be an object`); return false; }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) pushError(errors, `${path}: unexpected field`);
  for (const key of required) if (value[key] === undefined) pushError(errors, `${path}.${key}: required`);
  return true;
}
const SMILES_RE = /^[A-Za-z0-9@+\-[\]()=#$%\\/.:*]+$/;
function checkSmiles(value, path, errors) {
  const ok = typeof value === 'string' && value.length > 0 && value.length <= MAX_SMILES_LENGTH
    && SMILES_RE.test(value) && !value.startsWith('/') && !value.startsWith('\\') && !value.includes('..');
  if (!ok) pushError(errors, `${path}: must be a SMILES string (1-${MAX_SMILES_LENGTH} characters, SMILES alphabet only)`);
}
function checkInt(value, lo, hi, path, errors) {
  if (!Number.isInteger(value) || value < lo || value > hi) pushError(errors, `${path}: must be an integer in [${lo}, ${hi}]`);
}
function checkFinite(value, lo, hi, path, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < lo || value > hi) pushError(errors, `${path}: must be a finite number in [${lo}, ${hi}]`);
}
function checkVec3(value, lo, hi, path, errors) {
  if (!Array.isArray(value) || value.length !== 3) { pushError(errors, `${path}: must be an array of 3 numbers`); return; }
  value.forEach((v, i) => checkFinite(v, lo, hi, `${path}[${i}]`, errors));
}
function checkEnum(value, allowed, path, errors) {
  if (!allowed.includes(value)) pushError(errors, `${path}: must be one of ${allowed.join(', ')}`);
}
function checkText(value, min, max, path, errors) {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\u0000')) {
    pushError(errors, `${path}: must be text of ${min}-${max} characters`);
  }
}
function checkShortString(value, max, path, errors, re = /^[\x20-\x7E]+$/) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || !re.test(value)) pushError(errors, `${path}: must be a short printable string`);
}
/** A map of engine-reported numbers; null is allowed (an endpoint the engine could not score), any other type is not. */
function checkNumberMap(value, path, errors) {
  if (!isPlainObject(value)) { pushError(errors, `${path}: must be an object`); return; }
  const entries = Object.entries(value);
  if (entries.length === 0) pushError(errors, `${path}: must not be empty`);
  if (entries.length > 256) pushError(errors, `${path}: too many entries`);
  for (const [, v] of entries) {
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) { pushError(errors, `${path}: every value must be a finite number or null`); return; }
  }
}
function checkStringMap(value, path, errors) {
  if (!isPlainObject(value)) { pushError(errors, `${path}: must be an object`); return; }
  for (const v of Object.values(value)) {
    if (v !== null && typeof v !== 'string') { pushError(errors, `${path}: every value must be a string or null`); return; }
  }
}
function done(errors, value) {
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
function pick(obj, keys) {
  const out = {};
  for (const key of keys) if (obj?.[key] !== undefined) out[key] = obj[key];
  return out;
}

/** Deep scan for keys only the main service may set. */
export function findForbiddenResultKey(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) { const hit = findForbiddenResultKey(item, depth + 1); if (hit) return hit; }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_RESULT_KEYS.has(key)) return key;
    const hit = findForbiddenResultKey(item, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Bounded, path-redacted, single-line reason text. */
export function sanitizeReason(value, max = 200) {
  if (value === null || value === undefined) return null;
  return redact(String(value)).replace(/[\r\n\t]+/g, ' ').slice(0, max);
}
function sanitizeCode(value, fallback) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value) ? value : fallback;
}
function engineFailure(r) {
  if (r?.error === 'BLOCKED_BY_RUNTIME') {
    return { ok: false, state: DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE, error: 'ENGINE_UNAVAILABLE', reason: sanitizeReason(r.reason) };
  }
  if (r?.error === 'invalid_input') {
    return { ok: false, state: DISPATCH_STATE.BLOCKED_INVALID_INPUT, error: 'ENGINE_REJECTED_INPUT', reason: sanitizeReason(r.reason) };
  }
  return { ok: false, state: DISPATCH_STATE.ENGINE_FAILED, error: sanitizeCode(r?.error, 'engine_failed'), reason: sanitizeReason(r?.reason) };
}

/* ------------------------------ per-capability contracts ------------------------------ */

function admetContract(capabilityId, toolId, kind) {
  return {
    toolId,
    engineName: 'ADMET-AI',
    validateInput(input) {
      const errors = [];
      if (checkShape(input, { required: ['smiles'] }, 'input', errors)) checkSmiles(input.smiles, 'input.smiles', errors);
      return done(errors, input);
    },
    execute(value) {
      const r = admet.predict([value.smiles]);
      if (!r.ok) return engineFailure(r);
      const full = r.predictions?.[value.smiles];
      if (!isPlainObject(full)) return { ok: false, state: DISPATCH_STATE.ENGINE_FAILED, error: 'admet_no_prediction', reason: null };
      const split = splitAdmetPrediction(full, endpointCategories());
      const outputs = kind === 'toxicity' ? split.toxOut : split.admetOut;
      const units = kind === 'toxicity' ? split.toxUnits : split.admetUnits;
      return { ok: true, engineVersion: String(r.version ?? ''), result: { outputs, units } };
    },
    validateResult(result) {
      const errors = [];
      if (checkShape(result, { required: ['outputs', 'units'] }, 'result', errors)) {
        checkNumberMap(result.outputs, 'result.outputs', errors);
        checkStringMap(result.units, 'result.units', errors);
      }
      return done(errors, result);
    },
    buildRun({ input, result, engineVersion }) {
      const toxicity = kind === 'toxicity';
      return {
        run: {
          engine: 'ADMET-AI', engineVersion, capability: capabilityId,
          method: toxicity ? 'Chemprop D-MPNN ensemble (TDC + Tox21)' : 'Chemprop D-MPNN ensemble (TDC ADMET Benchmark Group)',
          status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
          inputs: { smiles: input.smiles }, outputs: result.outputs, units: result.units,
          provenance: {
            engine: `ADMET-AI ${engineVersion}`,
            source: toxicity ? 'Swanson et al. 2024, Bioinformatics; TDC + Tox21' : 'Swanson et al. 2024, Bioinformatics; TDC ADMET Benchmark Group',
          },
          inputHash: sha16({ s: input.smiles, kind }), outputHash: sha16(result.outputs), artifacts: [],
        },
        extraLimitations: [],
      };
    },
  };
}

const CAPABILITY_CONTRACTS = Object.freeze({
  'quantum-chemistry': {
    toolId: 'pyscf',
    engineName: 'PySCF',
    validateInput(input) {
      const errors = [];
      if (checkShape(input, { required: ['smiles', 'method', 'basis', 'charge', 'forceField', 'atoms'] }, 'input', errors)) {
        checkSmiles(input.smiles, 'input.smiles', errors);
        checkEnum(input.method, QM_METHODS, 'input.method', errors);
        checkEnum(input.basis, QM_BASES, 'input.basis', errors);
        checkInt(input.charge, -10, 10, 'input.charge', errors);
        checkShortString(input.forceField, 40, 'input.forceField', errors, /^[A-Za-z0-9_+-]+$/);
        if (!Array.isArray(input.atoms) || input.atoms.length < 1 || input.atoms.length > MAX_QM_ATOMS) {
          pushError(errors, `input.atoms: must be an array of 1-${MAX_QM_ATOMS} atoms`);
        } else {
          input.atoms.forEach((atom, i) => {
            const path = `input.atoms[${i}]`;
            if (!checkShape(atom, { required: ['element', 'x', 'y', 'z'] }, path, errors)) return;
            if (typeof atom.element !== 'string' || !/^[A-Z][a-z]?$/.test(atom.element)) pushError(errors, `${path}.element: must be an element symbol`);
            for (const axis of ['x', 'y', 'z']) checkFinite(atom[axis], -1e4, 1e4, `${path}.${axis}`, errors);
          });
        }
      }
      return done(errors, input);
    },
    execute(value) {
      const r = qm.singlePoint({ atoms: value.atoms, charge: value.charge, method: value.method, basis: value.basis });
      if (!r.ok) return engineFailure(r);
      const meta = pick(r.meta, ['engine', 'method', 'basis', 'charge', 'multiplicity', 'xc']);
      return { ok: true, engineVersion: String(meta.engine ?? '').replace(/^PySCF /, ''), result: { data: r.data, meta } };
    },
    validateResult(result, input) {
      const errors = [];
      if (checkShape(result, { required: ['data', 'meta'] }, 'result', errors)) {
        if (!isPlainObject(result.data)) pushError(errors, 'result.data: must be an object');
        else checkFinite(result.data.energyHartree, -1e7, 1e7, 'result.data.energyHartree', errors);
        if (checkShape(result.meta, { required: ['engine', 'method', 'basis'], optional: ['charge', 'multiplicity', 'xc'] }, 'result.meta', errors)) {
          checkShortString(result.meta.engine, 60, 'result.meta.engine', errors);
          // The engine must report having run exactly the requested method/basis.
          if (result.meta.method !== input.method) pushError(errors, 'result.meta.method: does not match the requested method');
          if (result.meta.basis !== input.basis) pushError(errors, 'result.meta.basis: does not match the requested basis');
        }
      }
      return done(errors, result);
    },
    buildRun({ input, result, engineVersion }) {
      return {
        run: {
          engine: 'PySCF', engineVersion, capability: 'quantum-chemistry',
          method: `${result.meta.method}/${result.meta.basis}`, status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
          inputs: { smiles: input.smiles, method: input.method, basis: input.basis, charge: input.charge, forceField: input.forceField },
          outputs: result.data, units: { energyHartree: 'Hartree', homoLumoGapEv: 'eV', dipoleDebye: 'Debye' },
          provenance: { engine: result.meta.engine, geometry: `RDKit 3D embed (${input.forceField})` },
          inputHash: sha16({ s: input.smiles, method: input.method, basis: input.basis }), outputHash: sha16(result.data),
          artifacts: [],
        },
        extraLimitations: [],
      };
    },
  },

  'protein-structure-ingestion': {
    toolId: 'biopython',
    engineName: 'Biopython',
    validateInput(input) {
      const errors = [];
      if (checkShape(input, { required: ['pdbText'] }, 'input', errors)) checkText(input.pdbText, 20, MAX_PDB_CHARS, 'input.pdbText', errors);
      return done(errors, input);
    },
    execute(value) {
      const r = protein.validatePdb(value.pdbText);
      if (!r.ok) return engineFailure(r);
      return { ok: true, engineVersion: String(r.version ?? ''), result: { report: r.report } };
    },
    validateResult(result) {
      const errors = [];
      if (checkShape(result, { required: ['report'] }, 'result', errors)) {
        if (!isPlainObject(result.report)) pushError(errors, 'result.report: must be an object');
        else if (typeof result.report.needsPreparation !== 'boolean') pushError(errors, 'result.report.needsPreparation: must be a boolean');
      }
      return done(errors, result);
    },
    buildRun({ input, result, engineVersion }) {
      return buildProteinStructureRun({ pdbText: input.pdbText, report: result.report, version: engineVersion });
    },
  },

  'molecular-dynamics': {
    toolId: 'openmm',
    engineName: 'OpenMM',
    validateInput(input) {
      const errors = [];
      if (checkShape(input, { required: ['steps'] }, 'input', errors)) checkInt(input.steps, 100, 5000, 'input.steps', errors);
      return done(errors, input);
    },
    execute(value) {
      const r = md.referenceCase({ steps: value.steps });
      if (!r.ok) return engineFailure(r);
      return {
        ok: true,
        engineVersion: String(r.version ?? ''),
        result: { case: r.case ?? null, data: r.data, platform: r.platform ?? null, expectation: r.expectation ?? null, pass: Boolean(r.pass) },
      };
    },
    validateResult(result, input) {
      const errors = [];
      if (checkShape(result, { required: ['case', 'data', 'platform', 'expectation', 'pass'] }, 'result', errors)) {
        if (!isPlainObject(result.data)) pushError(errors, 'result.data: must be an object');
        else if (result.data.steps !== input.steps) pushError(errors, 'result.data.steps: does not match the requested steps');
        if (typeof result.pass !== 'boolean') pushError(errors, 'result.pass: must be a boolean');
        if (result.case !== null && typeof result.case !== 'string') pushError(errors, 'result.case: must be a string');
      }
      return done(errors, result);
    },
    buildRun({ input, result, engineVersion }) {
      return buildMolecularDynamicsRun({ steps: input.steps, engineResult: { ...result, version: engineVersion } });
    },
  },

  'molecular-docking': {
    toolId: 'vina',
    engineName: 'AutoDock Vina',
    validateInput(input) {
      const errors = [];
      if (checkShape(input, {
        required: ['ligandSmiles', 'boxSize', 'exhaustiveness', 'nPoses', 'seed'],
        optional: ['receptorSmiles', 'receptorPdbqt', 'center'],
      }, 'input', errors)) {
        checkSmiles(input.ligandSmiles, 'input.ligandSmiles', errors);
        if (input.receptorSmiles === undefined && input.receptorPdbqt === undefined) pushError(errors, 'input: receptorSmiles or receptorPdbqt is required');
        if (input.receptorSmiles !== undefined) checkSmiles(input.receptorSmiles, 'input.receptorSmiles', errors);
        if (input.receptorPdbqt !== undefined) checkText(input.receptorPdbqt, 20, MAX_RECEPTOR_PDBQT_CHARS, 'input.receptorPdbqt', errors);
        if (input.center !== undefined) checkVec3(input.center, -1e4, 1e4, 'input.center', errors);
        checkVec3(input.boxSize, 1, 126, 'input.boxSize', errors);
        checkInt(input.exhaustiveness, 1, 32, 'input.exhaustiveness', errors);
        checkInt(input.nPoses, 1, 20, 'input.nPoses', errors);
        checkInt(input.seed, 0, 2_147_483_647, 'input.seed', errors);
      }
      return done(errors, input);
    },
    execute(value) {
      const r = docking.dock({ ...value });
      if (!r.ok) return engineFailure(r);
      const d = r.data;
      return {
        ok: true,
        engineVersion: String(d.vinaVersion ?? ''),
        result: {
          vinaVersion: d.vinaVersion, meekoVersion: d.meekoVersion, receptorKind: d.receptorKind,
          exhaustiveness: d.exhaustiveness, seed: d.seed, nPoses: d.nPoses,
          bestAffinityKcalMol: d.bestAffinityKcalMol, poses: d.poses, inputHash: d.inputHash,
          // Paths on the worker's disk are never returned — only what each artifact was.
          artifacts: (d.artifacts ?? []).map((a) => ({ kind: a.kind, sha256: a.sha256 })),
        },
      };
    },
    validateResult(result, input) {
      const errors = [];
      if (checkShape(result, {
        required: ['vinaVersion', 'meekoVersion', 'receptorKind', 'exhaustiveness', 'seed', 'nPoses', 'bestAffinityKcalMol', 'poses', 'inputHash', 'artifacts'],
      }, 'result', errors)) {
        checkShortString(result.vinaVersion, 40, 'result.vinaVersion', errors);
        checkShortString(result.meekoVersion, 40, 'result.meekoVersion', errors);
        checkShortString(result.receptorKind, 60, 'result.receptorKind', errors, /^[a-z_]+$/);
        if (result.exhaustiveness !== input.exhaustiveness) pushError(errors, 'result.exhaustiveness: does not match the request');
        if (result.seed !== input.seed) pushError(errors, 'result.seed: does not match the request');
        checkInt(result.nPoses, 0, input.nPoses, 'result.nPoses', errors);
        if (!Array.isArray(result.poses) || result.poses.length !== result.nPoses) {
          pushError(errors, 'result.poses: must be an array of nPoses poses');
        } else {
          result.poses.forEach((pose, i) => {
            if (checkShape(pose, { required: ['rank', 'affinityKcalMol'] }, `result.poses[${i}]`, errors)) {
              checkInt(pose.rank, 1, 20, `result.poses[${i}].rank`, errors);
              checkFinite(pose.affinityKcalMol, -1e4, 1e4, `result.poses[${i}].affinityKcalMol`, errors);
            }
          });
        }
        if (result.poses?.length) checkFinite(result.bestAffinityKcalMol, -1e4, 1e4, 'result.bestAffinityKcalMol', errors);
        else if (result.bestAffinityKcalMol !== null) pushError(errors, 'result.bestAffinityKcalMol: must be null when there are no poses');
        if (typeof result.inputHash !== 'string' || !/^[a-f0-9]{64}$/.test(result.inputHash)) pushError(errors, 'result.inputHash: must be a sha256 hex digest');
        if (!Array.isArray(result.artifacts) || result.artifacts.length > 16) {
          pushError(errors, 'result.artifacts: must be an array of at most 16 artifacts');
        } else {
          result.artifacts.forEach((a, i) => {
            if (checkShape(a, { required: ['kind', 'sha256'] }, `result.artifacts[${i}]`, errors)) {
              checkShortString(a.kind, 40, `result.artifacts[${i}].kind`, errors, /^[a-z_]+$/);
              if (typeof a.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256)) pushError(errors, `result.artifacts[${i}].sha256: must be a sha256 hex digest`);
            }
          });
        }
      }
      return done(errors, result);
    },
    buildRun({ input, result, engineVersion }) {
      const dockSpec = {
        ligandSmiles: input.ligandSmiles, receptorSmiles: input.receptorSmiles, receptorPdbqt: input.receptorPdbqt,
        center: input.center, boxSize: input.boxSize, exhaustiveness: input.exhaustiveness, nPoses: input.nPoses, seed: input.seed,
      };
      return {
        run: {
          engine: 'AutoDock Vina', engineVersion, capability: 'molecular-docking',
          method: `vina exhaustiveness=${result.exhaustiveness}`, status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
          inputs: { ...dockSpec, receptorKind: result.receptorKind },
          outputs: { bestAffinityKcalMol: result.bestAffinityKcalMol, nPoses: result.nPoses, poses: result.poses },
          units: { bestAffinityKcalMol: 'kcal/mol' },
          warnings: [
            ...(result.receptorKind === 'small_molecule_standin' ? ['receptor is a small-molecule rigid stand-in (software-validation), not a protein target'] : []),
            'docking artifacts stayed on the remote worker\'s ephemeral storage; only their SHA-256 digests are persisted here',
          ],
          provenance: {
            engine: `AutoDock Vina ${result.vinaVersion} + Meeko ${result.meekoVersion}`,
            receptorKind: result.receptorKind,
            artifactDurability: 'REMOTE_WORKER_EPHEMERAL',
          },
          inputHash: result.inputHash, outputHash: sha16(result.poses),
          artifacts: result.artifacts.map((a) => ({ ...a, location: 'REMOTE_WORKER_EPHEMERAL' })),
        },
        extraLimitations: [],
      };
    },
  },

  'admet-estimation': admetContract('admet-estimation', 'admet', 'admet'),
  'toxicity-risk-estimation': admetContract('toxicity-risk-estimation', 'toxicity', 'toxicity'),
});

/* ------------------------------ shared ScienceRun builders ------------------------------ */

/** Used by BOTH the local Virtual Lab path and the remote path, so the two cannot drift apart. */
export function buildMolecularDynamicsRun({ steps, engineResult }) {
  return {
    run: {
      engine: 'OpenMM', engineVersion: engineResult.version ?? null, capability: 'molecular-dynamics',
      method: engineResult.case ?? `OpenMM bounded reference case (${steps} steps)`, status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
      inputs: { steps, referenceSystem: MD_REFERENCE_SYSTEM },
      outputs: engineResult.data,
      units: { ...MD_UNITS },
      provenance: { engine: `OpenMM ${engineResult.version ?? ''}`.trim(), platform: engineResult.platform ?? null, referenceCase: engineResult.case ?? null, expectation: engineResult.expectation ?? null },
      inputHash: sha16({ steps, case: engineResult.case }), outputHash: sha16(engineResult.data),
      artifacts: [],
    },
    extraLimitations: [...MD_LIMITATIONS],
  };
}

/** Used by BOTH the local Virtual Lab path and the remote path. */
export function buildProteinStructureRun({ pdbText, report, version }) {
  return {
    run: {
      engine: 'Biopython', engineVersion: version ?? null, capability: 'protein-structure-ingestion',
      method: 'Biopython PDBParser structural validation', status: 'ok', evidenceClass: 'DETERMINISTIC',
      inputs: { sourcePdbSha256: sha16({ pdb: pdbText }), sourcePdbByteLength: pdbText.length },
      outputs: report, units: {},
      provenance: { engine: `Biopython ${version ?? ''}`.trim() },
      inputHash: sha16({ pdb: pdbText }), outputHash: sha16(report),
      artifacts: [],
    },
    extraLimitations: report?.needsPreparation
      ? [`This structure needs preparation before further use: ${(report.preparationReasons ?? []).join('; ') || 'see the persisted report\'s preparationReasons'}. Nothing was silently modified or assumed.`]
      : [],
  };
}

/* ------------------------------ public contract API ------------------------------ */

export function workerGroupForTool(toolId) {
  for (const [group, toolIds] of Object.entries(WORKER_GROUPS)) if (toolIds.includes(toolId)) return group;
  return null;
}

/** Capabilities that a worker may execute. RDKit descriptors are deliberately absent: they stay embedded. */
export function listRemoteCapabilities() {
  return Object.keys(CAPABILITY_CONTRACTS);
}

export function getCapabilityContract(capabilityId) {
  const contract = Object.prototype.hasOwnProperty.call(CAPABILITY_CONTRACTS, capabilityId) ? CAPABILITY_CONTRACTS[capabilityId] : null;
  if (!contract) return null;
  return { capabilityId, toolId: contract.toolId, engineName: contract.engineName, workerGroup: workerGroupForTool(contract.toolId) };
}

export function validateCapabilityInput(capabilityId, input) {
  const contract = CAPABILITY_CONTRACTS[capabilityId];
  if (!contract) return { ok: false, errors: ['capabilityId: unknown capability'] };
  return contract.validateInput(input);
}

export function validateCapabilityResult(capabilityId, result, input) {
  const contract = CAPABILITY_CONTRACTS[capabilityId];
  if (!contract) return { ok: false, errors: ['capabilityId: unknown capability'] };
  const forbidden = findForbiddenResultKey(result);
  if (forbidden) return { ok: false, errors: [`result: field "${forbidden}" may only be set by the main service`] };
  return contract.validateResult(result, input);
}

/**
 * Worker side: runs one ALREADY-VALIDATED request through the existing adapter.
 * An engine counts as runnable only after its real reference case passed in
 * this process (capabilityAvailable -> toolchain validation); otherwise the
 * outcome is BLOCKED_ENGINE_UNAVAILABLE, never a guess.
 */
export function executeCapability(capabilityId, value) {
  const contract = CAPABILITY_CONTRACTS[capabilityId];
  if (!contract) return { ok: false, state: DISPATCH_STATE.BLOCKED_INVALID_INPUT, error: 'UNKNOWN_CAPABILITY', reason: null, durationMs: 0 };
  const tool = getTool(contract.toolId);
  if (!capabilityAvailable(capabilityId)) {
    return {
      ok: false, state: DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE, error: 'ENGINE_UNAVAILABLE',
      reason: sanitizeReason(tool?.reason ?? `${contract.engineName} has not passed its reference case in this worker`), durationMs: 0,
    };
  }
  const t0 = Date.now();
  let outcome;
  try {
    outcome = contract.execute(value);
  } catch (err) {
    outcome = { ok: false, state: DISPATCH_STATE.ENGINE_FAILED, error: 'engine_exception', reason: sanitizeReason(err?.message ?? err) };
  }
  const durationMs = Date.now() - t0;
  if (!outcome.ok) return { ...outcome, durationMs };
  return {
    ok: true,
    engine: { toolId: contract.toolId, name: contract.engineName, version: outcome.engineVersion, fingerprint: tool?.fingerprint ?? null },
    result: outcome.result,
    limitations: tool?.assumptions ? [tool.assumptions] : [],
    durationMs,
  };
}

/** Key-sorted full sha256 of what is being asked for — identical on both sides of the wire. */
export function computeInputFingerprint(capabilityId, input) {
  return canonicalHash({ capabilityId, input });
}

/** Key-sorted full sha256 of exactly what a worker returned as `result`. */
export function computeOutputFingerprint(result) {
  return canonicalHash(result);
}

/** Strict request envelope: { contractVersion, executionId, capabilityId, inputFingerprint, input }. */
export function validateExecutionEnvelope(body) {
  const errors = [];
  if (checkShape(body, { required: ['contractVersion', 'executionId', 'capabilityId', 'inputFingerprint', 'input'] }, 'request', errors)) {
    if (body.contractVersion !== WORKER_CONTRACT_VERSION) pushError(errors, `request.contractVersion: must be ${WORKER_CONTRACT_VERSION}`);
    if (typeof body.executionId !== 'string' || !EXECUTION_ID_RE.test(body.executionId)) pushError(errors, 'request.executionId: must match the execution-id format');
    if (typeof body.capabilityId !== 'string' || !getCapabilityContract(body.capabilityId)) pushError(errors, 'request.capabilityId: unknown capability');
    if (typeof body.inputFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.inputFingerprint)) pushError(errors, 'request.inputFingerprint: must be a sha256 hex digest');
  }
  return done(errors, body);
}

/** The engine version a result itself attests to — the worker's engine identity must agree with it. */
export function engineVersionFromResult(capabilityId, result) {
  if (capabilityId === 'quantum-chemistry') return String(result?.meta?.engine ?? '').replace(/^PySCF /, '');
  if (capabilityId === 'molecular-docking') return String(result?.vinaVersion ?? '');
  return null;
}

/** Main side: a verified worker result -> the canonical saveScienceRun() argument (minus tenancy/duration/env). */
export function buildScienceRunRecord(capabilityId, { input, result, engineVersion }) {
  const contract = CAPABILITY_CONTRACTS[capabilityId];
  if (!contract) throw new Error(`buildScienceRunRecord: unknown capability ${capabilityId}`);
  return contract.buildRun({ input, result, engineVersion });
}
