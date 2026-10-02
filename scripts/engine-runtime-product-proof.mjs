#!/usr/bin/env node
/**
 * Consolidates executed scientific-worker reports into one honest runtime and
 * product-admission receipt. This is a reporter over the canonical worker
 * probe and existing ADMET/retrosynthesis admission gates; it is not another
 * capability registry.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMET_MODEL_IDENTITY,
  ADMET_USE_PURPOSE,
  admitAdmetUse,
} from '../packages/backend/src/compute/admetResearchRunExecutor.mjs';
import {
  RETROSYNTHESIS_USE_PURPOSE,
  assessRetrosynthesisAdmission,
} from '../packages/backend/src/compute/retrosynthesisAdmission.mjs';

export const ENGINE_PROOF_STATUS = Object.freeze({
  EXECUTABLE_NOW: 'EXECUTABLE_NOW',
  PRODUCT_ELIGIBLE: 'PRODUCT_ELIGIBLE',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL',
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function listJsonFiles(root) {
  if (!root) return [];
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(absolute);
    }
  };
  if (statSync(root).isDirectory()) visit(root);
  else out.push(root);
  return out.sort();
}

export function readWorkerRuntimeReports(root) {
  const reports = new Map();
  const identities = [];
  for (const file of listJsonFiles(root)) {
    const raw = readFileSync(file);
    let report;
    try { report = JSON.parse(raw); } catch { continue; }
    if (typeof report?.workerGroup !== 'string') continue;
    if (reports.has(report.workerGroup)) throw new Error(`duplicate worker report for ${report.workerGroup}`);
    reports.set(report.workerGroup, report);
    identities.push({ workerGroup: report.workerGroup, file: path.basename(file), bytes: raw.byteLength, sha256: sha256(raw) });
  }
  return { reports, identities: identities.sort((a, b) => a.workerGroup.localeCompare(b.workerGroup)) };
}

function executed(report, { toolId, capabilityIds }) {
  const reference = report?.references?.find((item) => item.toolId === toolId);
  const executions = capabilityIds.map((capabilityId) => report?.executions?.find((item) => item.capabilityId === capabilityId));
  const ok = report?.ok === true
    && report?.verificationLevel === 'LOCAL_CONTAINER_VERIFIED'
    && reference?.status === 'AVAILABLE'
    && Boolean(reference?.outputHash)
    && executions.every((item) => item?.ok === true
      && item?.state === 'REMOTE_EXECUTION'
      && /^[a-f0-9]{64}$/i.test(item?.inputFingerprint ?? '')
      && /^[a-f0-9]{64}$/i.test(item?.outputFingerprint ?? '')
      && /^[a-f0-9]{16,64}$/i.test(item?.environmentFingerprint ?? ''));
  return {
    ok,
    verificationLevel: report?.verificationLevel ?? 'MISSING',
    engineVersion: reference?.version ?? report?.references?.find((item) => item.toolId === toolId)?.version ?? null,
    referenceOutputHash: reference?.outputHash ?? null,
    executions: executions.map((item, index) => ({
      capabilityId: capabilityIds[index],
      state: item?.state ?? null,
      inputFingerprint: item?.inputFingerprint ?? null,
      outputFingerprint: item?.outputFingerprint ?? null,
      environmentFingerprint: item?.environmentFingerprint ?? null,
    })),
  };
}

function runtimeProof({ engineId, capabilities, report, toolId, runtimeBlocker }) {
  const proof = executed(report, { toolId, capabilityIds: capabilities });
  return {
    engineId,
    capabilities,
    runtimeStatus: proof.ok ? ENGINE_PROOF_STATUS.EXECUTABLE_NOW : ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL,
    runtimeBlocker: proof.ok ? null : runtimeBlocker,
    runtimeProof: proof,
  };
}

export function buildEngineRuntimeProductProof({ reports, identities = [], commit = null, now = () => new Date() } = {}) {
  const structural = reports?.get('structural');
  const admet = reports?.get('admet');

  const vina = {
    ...runtimeProof({
      engineId: 'vina-meeko', capabilities: ['molecular-docking'], report: structural, toolId: 'vina',
      runtimeBlocker: 'BLOCKED_EXTERNAL_STRUCTURAL_WORKER_RUNTIME',
    }),
    productStatus: ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL,
    productBlocker: 'BLOCKED_EXTERNAL_TRANSITIVE_LICENCE_AND_NOTICE_REVIEW',
    productReason: 'Pinned Vina/Meeko execution is proven, but exact container distributions, transitive notices and intended release bundle still require commercial review.',
    epistemicClass: 'MODEL_ESTIMATE',
  };

  const openmm = {
    ...runtimeProof({
      engineId: 'openmm', capabilities: ['molecular-dynamics'], report: structural, toolId: 'openmm',
      runtimeBlocker: 'BLOCKED_EXTERNAL_STRUCTURAL_WORKER_RUNTIME',
    }),
    productStatus: ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL,
    productBlocker: 'BLOCKED_EXTERNAL_TRANSITIVE_LICENCE_AND_NOTICE_REVIEW',
    productReason: 'The bounded TIP3P software reference is executable, but exact container notices require review and this proof is not candidate-specific stability validation.',
    epistemicClass: 'MODEL_ESTIMATE',
  };

  const admetRuntime = runtimeProof({
    engineId: 'admet-ai', capabilities: ['admet-estimation', 'toxicity-risk-estimation'], report: admet, toolId: 'admet',
    runtimeBlocker: 'BLOCKED_EXTERNAL_ADMET_WORKER_RUNTIME',
  });
  const admetCommercial = admitAdmetUse({ purpose: ADMET_USE_PURPOSE.COMMERCIAL_PRODUCT });
  const admetProof = {
    ...admetRuntime,
    productStatus: admetCommercial.ok ? ENGINE_PROOF_STATUS.PRODUCT_ELIGIBLE : ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL,
    productBlocker: admetCommercial.ok ? null : 'BLOCKED_EXTERNAL_ADMET_WEIGHTS_AND_TRAINING_DATA_RIGHTS',
    productReason: ADMET_MODEL_IDENTITY.commercialUseStatus,
    epistemicClass: ADMET_MODEL_IDENTITY.outputClassification,
    measurementStatus: ADMET_MODEL_IDENTITY.measurementStatus,
  };

  const retroTechnical = assessRetrosynthesisAdmission({ purpose: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION });
  const retroCommercial = assessRetrosynthesisAdmission({ purpose: RETROSYNTHESIS_USE_PURPOSE.COMMERCIAL_PRODUCT });
  const retrosynthesis = {
    engineId: 'aizynthfinder',
    capabilities: ['retrosynthesis-route-search'],
    runtimeStatus: retroTechnical.ok ? ENGINE_PROOF_STATUS.EXECUTABLE_NOW : ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL,
    runtimeBlocker: retroTechnical.ok ? null : `BLOCKED_EXTERNAL_${retroTechnical.failureCode ?? retroTechnical.status}`,
    runtimeProof: {
      ok: retroTechnical.ok,
      status: retroTechnical.status,
      artifactIdentity: retroTechnical.artifactIdentity ?? null,
    },
    productStatus: retroCommercial.ok ? ENGINE_PROOF_STATUS.PRODUCT_ELIGIBLE : ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL,
    productBlocker: retroCommercial.ok ? null : 'BLOCKED_EXTERNAL_RETRO_MODEL_TEMPLATE_AND_STOCK_RIGHTS',
    productReason: retroCommercial.policy?.commercialUseStatus ?? retroCommercial.failureCode,
    epistemicClass: 'MODEL_ESTIMATE',
    outputKind: 'ROUTE_PROPOSAL',
  };

  const engines = [vina, openmm, admetProof, retrosynthesis];
  const requiredRuntimeProofsPass = [vina, openmm, admetProof].every((entry) => entry.runtimeStatus === ENGINE_PROOF_STATUS.EXECUTABLE_NOW);
  const commercialGatesFailClosed = engines.every((entry) => entry.productStatus === ENGINE_PROOF_STATUS.PRODUCT_ELIGIBLE || Boolean(entry.productBlocker));
  return {
    schemaVersion: '1.0.0',
    generatedAt: now().toISOString(),
    commit,
    proofScope: 'LOCAL_CONTAINER_VERIFIED_CI_NOT_PRODUCTION_DEPLOYMENT',
    sourceReports: identities,
    engines,
    summary: {
      requiredRuntimeProofsPass,
      commercialGatesFailClosed,
      executableNow: engines.filter((entry) => entry.runtimeStatus === ENGINE_PROOF_STATUS.EXECUTABLE_NOW).map((entry) => entry.engineId),
      productEligible: engines.filter((entry) => entry.productStatus === ENGINE_PROOF_STATUS.PRODUCT_ELIGIBLE).map((entry) => entry.engineId),
      blockedExternal: engines.filter((entry) => entry.runtimeStatus === ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL || entry.productStatus === ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL).map((entry) => entry.engineId),
    },
    ok: requiredRuntimeProofsPass && commercialGatesFailClosed,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.reports || !args.out) throw new Error('--reports and --out are required');
  const { reports, identities } = readWorkerRuntimeReports(args.reports);
  const proof = buildEngineRuntimeProductProof({ reports, identities, commit: args.commit ?? null });
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = proof.ok ? 0 : 1;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try { main(); } catch (error) {
    console.error(String(error?.message ?? error));
    process.exitCode = 2;
  }
}
