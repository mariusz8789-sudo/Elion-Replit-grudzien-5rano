#!/usr/bin/env node
/**
 * Genesis — RETROSYNTHESIS OFFLINE RUN.
 *
 * For the case where the engine's model data (~1.3 GB) exists on an operator's machine but cannot be
 * moved to the machine running Genesis. The models stay where they are; what travels back is a small
 * verifiable artefact — readiness with model checksums, the aspirin reference benchmark, and the route
 * the engine actually returned for one molecule.
 *
 * It is NOT a way around the engine. Every field comes from the adapter: if the models are absent the
 * script refuses and says which files are missing, and it never writes a route it did not receive.
 *
 * The route's outputHash is computed with the SAME function the server uses, so the artefact can be
 * checked against a later in-cluster run instead of being taken on trust.
 *
 * Usage:
 *   GENESIS_RETRO_MODEL_DIR=/path/to/models \
 *   GENESIS_RETRO_PYTHON=/path/to/python \
 *   node scripts/genesis-retro-offline-run.mjs --smiles "<canonical SMILES>" --out retro-offline.json
 *
 *   # or, driven by a handoff exported from GET .../campaigns/:cid/retrosynthesis-handoff:
 *   node scripts/genesis-retro-offline-run.mjs --handoff handoff.json --out retro-offline.json
 *
 * Options:
 *   --smiles <s>          molecule to plan (ignored when --handoff supplies one)
 *   --handoff <file>      canonical handoff JSON; its finalist is used and its identity recorded
 *   --iterations <n>      search iteration limit (default 100; a bounded search replays, a timed one does not)
 *   --max-routes <n>      routes to return (default 5)
 *   --skip-reference      skip the aspirin benchmark (not recommended: it is the proof the planner works)
 *   --out <file>          write the artefact here (default: stdout)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import * as retro from '../packages/backend/src/compute/retroAdapter.mjs';
import { retrosynthesisOutputHash } from '../packages/backend/src/campaign/retrosynthesis.mjs';
import { snapshotEnvironment } from '../packages/backend/src/provenance.mjs';
import { canonicalJson, sha256Hex } from '../packages/backend/src/determinism.mjs';

function parseArgs(argv) {
  const a = { smiles: null, handoff: null, iterations: 100, maxRoutes: 5, skipReference: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--smiles') a.smiles = argv[++i];
    else if (argv[i] === '--handoff') a.handoff = argv[++i];
    else if (argv[i] === '--iterations') a.iterations = Number(argv[++i]);
    else if (argv[i] === '--max-routes') a.maxRoutes = Number(argv[++i]);
    else if (argv[i] === '--skip-reference') a.skipReference = true;
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

function fail(artefact, out) {
  emit(artefact, out);
  process.exit(1);
}

function emit(artefact, out) {
  const text = JSON.stringify(artefact, null, 2);
  if (out) { writeFileSync(out, `${text}\n`); process.stderr.write(`written: ${out}\n`); }
  else process.stdout.write(`${text}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // The handoff, when given, is the authority on WHICH molecule: re-choosing one here would defeat
  // the whole point of having frozen it.
  let handoffIdentity = null;
  let smiles = args.smiles;
  if (args.handoff) {
    const h = JSON.parse(readFileSync(args.handoff, 'utf8'));
    const handoff = h.handoff ?? h;
    if (handoff.kind !== 'GENESIS_RETROSYNTHESIS_HANDOFF') {
      process.stderr.write('not a Genesis retrosynthesis handoff\n');
      process.exit(2);
    }
    smiles = handoff.finalist.canonicalSmiles;
    handoffIdentity = {
      campaignId: handoff.campaignId, projectId: handoff.projectId,
      candidateId: handoff.finalist.candidateId,
      contentHash: handoff.finalist.contentHash,
      handoffFingerprint: handoff.handoffFingerprint,
      preregistrationFingerprint: handoff.preregistration?.fingerprint ?? null,
      protocolFingerprint: handoff.evidence?.protocolFingerprint ?? null,
    };
  }
  if (!smiles) {
    process.stderr.write('--smiles or --handoff is required\n');
    process.exit(2);
  }

  const startedAt = new Date().toISOString();

  // 1. READINESS — what engine, what model data, which checksums. Nothing proceeds without it.
  const detection = retro.detect();
  const base = {
    kind: 'GENESIS_RETROSYNTHESIS_OFFLINE_RUN',
    contractVersion: 1,
    startedAt,
    handoff: handoffIdentity,
    readiness: {
      available: detection.available,
      installed: detection.installed,
      engine: detection.engine ?? 'AiZynthFinder',
      engineVersion: detection.engineVersion ?? null,
      versions: detection.versions ?? null,
      models: detection.models ?? null,
      reason: detection.reason ?? null,
    },
    license: retro.RETRO_LICENSE,
    citation: retro.RETRO_CITATION,
    evidenceClass: retro.RETRO_EVIDENCE_CLASS,
    environmentHash: snapshotEnvironment().hash,
  };

  if (!detection.available) {
    return fail({
      ...base, status: 'BLOCKED_BY_RUNTIME',
      blocker: detection.installed ? 'MODEL_FILES_MISSING' : 'ENGINE_NOT_INSTALLED',
      missingModelFiles: detection.models?.missing ?? null,
      route: null,
      statement: 'The engine could not run on this machine, so no route was produced. Nothing here is inferred from the structure.',
    }, args.out);
  }

  // 2. THE REFERENCE CASE — a planner that cannot solve aspirin is not a working planner. Run it
  //    BEFORE the real target, so a bad install is caught against a known answer, not a novel one.
  let reference = null;
  if (!args.skipReference) {
    reference = retro.referenceCase();
    if (!reference.ok || !reference.pass) {
      return fail({
        ...base, status: 'REFERENCE_CASE_FAILED', reference, route: null,
        statement: 'The engine did not solve acetylsalicylic acid, so its answer for any other molecule is not trustworthy. No route is reported.',
      }, args.out);
    }
  }

  // 3. THE TARGET — one search, reported exactly as the engine returned it.
  const planned = retro.planRoute(smiles, { iterationLimit: args.iterations, maxRoutes: args.maxRoutes });
  if (!planned.ok) {
    return fail({
      ...base, status: planned.status, reference, route: null,
      reason: planned.reason ?? null, missingModelFiles: planned.missingModelFiles ?? null,
      statement: 'The route search did not complete. No route is reported.',
    }, args.out);
  }

  const artefact = {
    ...base,
    status: 'OK',
    reference,
    target: { smiles },
    engine: planned.engine,
    engineVersion: planned.engineVersion,
    method: planned.method,
    inputs: planned.inputs,
    outputs: planned.outputs,
    provenance: planned.provenance,
    durationMs: planned.durationMs,
    // The same identities the server would persist, so this artefact can be verified in-cluster.
    inputHash: sha256Hex(canonicalJson(planned.inputs)),
    outputHash: retrosynthesisOutputHash(planned.outputs),
    solved: planned.outputs.solved,
    statement: planned.outputs.solved
      ? 'A route was proposed by the retrosynthesis engine and is reproduced here with the identity of the model data that produced it.'
      : 'The engine ran and found no route to purchasable starting materials within the search budget. No route is proposed.',
    boundary: 'PROPOSED ROUTE (MODEL_ESTIMATE). Disconnections come from a policy trained on reaction literature; no conditions, stoichiometry, yields, work-up or safety assessment are computed or implied. A qualified synthetic chemist decides whether any step is performed.',
  };
  artefact.artefactFingerprint = sha256Hex(canonicalJson(artefact));
  emit(artefact, args.out);
}

main();
