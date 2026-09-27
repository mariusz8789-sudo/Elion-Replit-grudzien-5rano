/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * RETROSYNTHESIS AS A CANONICAL EXPERIMENT — the route search joins the same Experiment Fabric as
 * docking, ADMET and QM: one Science Run with inputs, outputs, hashes, environment fingerprint and
 * provenance; one append-only campaign event; the same replay path.
 *
 * What is recorded is what the engine returned. When the engine cannot run (models absent), a
 * STAGE_BLOCKED event is written naming the missing files — a candidate then has NO route, and every
 * artefact downstream says so rather than describing a synthesis nobody computed.
 *
 * The result is a MODEL_ESTIMATE: a proposed disconnection sequence from a policy trained on reaction
 * literature. It is not a validated procedure and carries no conditions, quantities or safety review.
 */
import { canonicalJson, sha256Hex } from '../determinism.mjs';
import { saveScienceRun } from '../store.mjs';
import { addEvent, getCandidate } from './persistence.mjs';
import { snapshotEnvironment } from '../provenance.mjs';
import * as retro from '../compute/retroAdapter.mjs';

export const RETRO_STAGE = 'retrosynthesis';

/**
 * The identity of a route-search result: the routes themselves, not how long the search took. Two
 * searches that found the same disconnections from the same starting materials are the same result.
 */
export function retrosynthesisOutputHash(outputs) {
  return sha256Hex(canonicalJson({
    solved: outputs.solved,
    routes: (outputs.routes ?? []).map((r) => ({
      steps: r.steps,
      reactions: r.reactions.map((x) => x.reactionSmiles),
      startingMaterials: r.startingMaterials.map((m) => m.smiles).slice().sort(),
      allInStock: r.allStartingMaterialsInStock,
    })),
  }));
}

/**
 * Plans a route for one candidate and persists it. `candidateId` is optional — a bare SMILES can be
 * planned too — but when given, the run is attached to that candidate like every other stage result.
 */
export function planCandidateRoute(db, { projectId, campaignId, candidateId = null, smiles = null, options = {} }) {
  const candidate = candidateId ? getCandidate(db, candidateId) : null;
  if (candidateId && !candidate) return { ok: false, error: 'candidate_not_found' };
  const target = smiles ?? candidate?.canonicalSmiles ?? null;
  if (!target) return { ok: false, error: 'smiles_or_candidate_required' };

  const result = retro.planRoute(target, options);
  if (!result.ok) {
    addEvent(db, {
      campaignId, generation: candidate?.generation ?? 0, type: 'STAGE_BLOCKED',
      payload: { stage: RETRO_STAGE, candidateId, blocker: result.status, reason: result.reason ?? null, missingModelFiles: result.missingModelFiles ?? null },
    });
    return { ok: false, error: result.status, reason: result.reason, missingModelFiles: result.missingModelFiles ?? null };
  }

  const outputHash = retrosynthesisOutputHash(result.outputs);
  const run = saveScienceRun(db, {
    projectId, campaignId, candidateId,
    engine: result.engine, engineVersion: result.engineVersion,
    capability: retro.RETRO_CAPABILITY, method: result.method, status: 'ok',
    evidenceClass: retro.RETRO_EVIDENCE_CLASS,
    inputs: result.inputs, outputs: result.outputs, units: {},
    warnings: result.outputs.stoppedBy === 'TIME_LIMIT'
      ? ['The search was stopped by its wall-clock limit, so a replay is not expected to reproduce it exactly.']
      : [],
    provenance: result.provenance,
    inputHash: sha256Hex(canonicalJson(result.inputs)), outputHash,
    durationMs: result.durationMs,
    environmentHash: snapshotEnvironment().hash,
  });
  addEvent(db, {
    campaignId, generation: candidate?.generation ?? 0, type: 'STAGE_RESULT',
    payload: {
      stage: RETRO_STAGE, candidateId, runId: run.id,
      reason: result.outputs.solved ? 'ROUTE_FOUND' : 'NO_ROUTE_FOUND',
      routeCount: result.outputs.routeCount,
      steps: result.outputs.routes[0]?.steps ?? null,
      allStartingMaterialsInStock: result.outputs.routes[0]?.allStartingMaterialsInStock ?? null,
      evidenceClass: retro.RETRO_EVIDENCE_CLASS,
    },
  });
  return { ok: true, run, solved: result.outputs.solved, routes: result.outputs.routes };
}

/**
 * The route as an artefact for the final protocol: the top route's steps in forward reading order,
 * its starting materials, the model that proposed it, and the boundary that makes it a proposal.
 * Returns null when no route search was ever run for this candidate.
 */
export function routeArtefactFromRun(run) {
  if (!run || run.capability !== retro.RETRO_CAPABILITY) return null;
  const routes = run.outputs?.routes ?? [];
  const best = routes.find((r) => r.allStartingMaterialsInStock) ?? routes[0] ?? null;
  return {
    runId: run.id,
    engine: run.engine,
    engineVersion: run.engineVersion,
    method: run.method,
    evidenceClass: retro.RETRO_EVIDENCE_CLASS,
    solved: Boolean(run.outputs?.solved),
    routeCount: run.outputs?.routeCount ?? routes.length,
    modelChecksums: run.provenance?.modelChecksums ?? null,
    license: run.provenance?.license ?? retro.RETRO_LICENSE,
    citation: run.provenance?.citation ?? retro.RETRO_CITATION,
    determinism: run.provenance?.determinism ?? null,
    outputHash: run.outputHash ?? null,
    topRoute: best ? {
      steps: best.steps,
      // Read forward: the engine returns disconnections, a chemist reads the synthesis the other way.
      reactionsForward: [...best.reactions].reverse().map((r, i) => ({
        step: i + 1, reactionSmiles: r.reactionSmiles,
        templateHash: r.templateHash ?? null, policyProbability: r.policyProbability ?? null,
        policy: r.policyName ?? null, classification: r.classification ?? null,
      })),
      startingMaterials: best.startingMaterials,
      allStartingMaterialsInStock: best.allStartingMaterialsInStock,
      score: best.score ?? null,
    } : null,
    boundary: 'PROPOSED ROUTE (MODEL_ESTIMATE). Disconnections come from a policy trained on reaction literature; no conditions, stoichiometry, yields, work-up or safety assessment are computed or implied. A qualified synthetic chemist decides whether any step is performed.',
  };
}
