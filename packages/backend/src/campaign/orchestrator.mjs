/**
 * Genesis Scientific Orchestrator (P2) + Universal Discovery Loop (P3).
 *
 * Steruje kampanią naukową na REALNYCH silnikach: seed → (generuj → waliduj →
 * wykonaj → oceń → porównaj → odrzuć/zachowaj → analizuj → wybierz następny
 * eksperyment → zmień strategię → generuj następną populację → przelicz →
 * rankuj) aż do JAWNEGO warunku stopu. Każdy krok to realny, utrwalony stan.
 * Zero fałszywego postępu. Deterministyczne przy tych samych silnikach i seedzie.
 */
import { createHash } from 'node:crypto';
import { runModel } from '../compute/engine.mjs';
import { saveRun, saveScienceRun } from '../store.mjs';
import { sha256Hex16 as sha16 } from '../provenance.mjs';
import * as store from './persistence.mjs';
import * as adapter from './drugAdapter.mjs';
import { paretoFrontIndices, hypervolume2D, bestScalar } from './pareto.mjs';
import { assertCampaignObjectivesD069 } from './objectiveGuardD069.mjs';
import { endpointCategories } from './multiFidelity.mjs';
import { analyzeAndDecide, isStop } from './nextExperiment.mjs';

const scalar = (vec) => Object.values(vec).reduce((a, b) => a + b, 0);
const hashState = (gen, smiles, strategy) =>
  createHash('sha1').update(JSON.stringify({ gen, smiles: [...smiles].sort(), strategy })).digest('hex').slice(0, 16);

/** Deskryptory jako Scientific Run (prowieniencja + persystencja). */
function describeAsRun(db, projectId, smiles) {
  const run = runModel('chem-rdkit-descriptors', { smiles });
  if (run.status === 'ok') { try { saveRun(db, run, { projectId }); } catch { /* audyt best-effort */ } }
  return run;
}

/**
 * REPLAY GAP CLOSED (docs/DECISIONS.md D-069 follow-up). `describeAsRun`'s
 * own `saveRun` write above goes to the general-purpose `runs` table --
 * real, unmodified, kept exactly as it was. But `campaign/verify.mjs`'s
 * `replayScienceRun`/`getScienceRun` read a DIFFERENT table, `science_runs`
 * (capability/campaignId/candidateId-shaped), written only by
 * `multiFidelity.mjs`'s four heavy-engine stages -- so the campaign's own
 * flagship computation (its RDKit descriptor run, made once per generated
 * candidate) was never independently replayable. This persists the SAME
 * real computation `describeAsRun` already made -- same `run` object, no
 * second RDKit invocation, no second engine -- as a REAL `science_runs` row,
 * called AFTER `store.addCandidate` so it carries the REAL `candidateId`
 * (never `null`: a fabricated or omitted link would be exactly the kind of
 * broken provenance this whole persistence layer exists to refuse).
 *
 * `inputHash`/`outputHash` use `provenance.mjs::sha256Hex16` -- the SAME
 * hash provider `verify.mjs`'s own replayers already use, so a later
 * `replayScienceRun` compares like with like.
 *
 * `engine` is taken from `run.provenance.engine`, NOT `run.engine`
 * (`genesis-compute@1.0.0`, the generic model-runner wrapper string) and
 * NOT `run.modelVersion` (`'1.0.0'`, the static registry entry version).
 * `run.provenance.engine` is the RDKit worker's OWN reported engine string
 * (`registry.mjs`'s `chem-rdkit-descriptors` compute function sets
 * `provenance: { engine: r.engine, ... }` from the real `rdkitAdapter.mjs`
 * call) -- the EXACT SAME field the new `REPLAYERS['molecular-descriptors']`
 * entry in `verify.mjs` reads at replay time via `descriptors(...).engine`.
 * Storing anything else here would compare two different kinds of version
 * strings and report `ENGINE_VERSION_CHANGED` on every single replay.
 *
 * `evidenceClass: 'COMPUTATIONAL'`, not `saveScienceRun`'s documented
 * default of `'MODEL_ESTIMATE'`: RDKit descriptors are exact deterministic
 * chemistry, not a fitted model's estimate -- the same COMPUTATIONAL/
 * MODEL_ESTIMATE distinction this repo's own evidence-class taxonomy
 * already draws between real computed values and multiFidelity.mjs's
 * ADMET/docking predictions.
 */
function persistDescriptorScienceRun(db, { campaignId, candidateId, projectId, run }) {
  if (!run || run.status !== 'ok') return; // no real computation to persist -- a rejected run leaves no science_runs row
  try {
    saveScienceRun(db, {
      projectId, campaignId, candidateId,
      engine: run.provenance?.engine ?? null, capability: 'molecular-descriptors', method: 'RDKit',
      status: run.status, evidenceClass: 'COMPUTATIONAL',
      inputs: run.inputs, outputs: run.outputs, units: run.units, warnings: run.warnings, provenance: run.provenance,
      inputHash: sha16(run.inputs), outputHash: sha16(run.outputs), artifacts: [],
      durationMs: run.durationMs,
    });
  } catch { /* audyt best-effort, same discipline as describeAsRun's own saveRun call */ }
}

function makeCandidateRecord(db, campaignId, projectId, generation, proposal, objectives, constraints) {
  const run = describeAsRun(db, projectId, proposal.canonicalSmiles);
  if (run.status !== 'ok') {
    return { valid: false, status: 'rejected', rejectedReason: `descriptors_failed:${run.error ?? run.message}`, runIds: [run.runId], descriptors: {}, objectiveVector: {}, constraintViolations: [] };
  }
  const desc = run.outputs;
  const violations = adapter.constraintViolations(desc, constraints);
  const objVecArr = adapter.objectiveVector(desc, objectives);
  const objectiveVector = Object.fromEntries(objectives.map((o, i) => [o.id, objVecArr[i]]));
  const rejected = violations.length > 0;
  return {
    valid: true,
    status: rejected ? 'rejected' : 'retained',
    rejectedReason: rejected ? `constraint:${violations.map((v) => v.constraint).join(',')}` : null,
    runIds: [run.runId],
    descriptors: desc,
    objectiveVector,
    constraintViolations: violations,
    // Carried through, never persisted directly by addCandidate (extra keys
    // on the spread object are ignored there) -- the caller uses this to
    // bind persistDescriptorScienceRun to the REAL candidateId once
    // store.addCandidate has returned one.
    scienceRun: run,
  };
}

function selectParents(retained, strategy, k) {
  const sorted = [...retained].sort((a, b) => scalar(a.objectiveVector) - scalar(b.objectiveVector) || a.canonicalSmiles.localeCompare(b.canonicalSmiles));
  if (strategy.parentSelection === 'diverse' && sorted.length > k) {
    // Rozłóż wybór po posortowanej liście (eksploracja), deterministycznie.
    const step = sorted.length / k;
    return Array.from({ length: k }, (_, i) => sorted[Math.floor(i * step)]);
  }
  return sorted.slice(0, k);
}

/**
 * Wykonuje kampanię. Zwraca podsumowanie. Wszystkie kandydaci, decyzje i
 * zdarzenia są utrwalane (append-only). `log` opcjonalny: (state, info)=>void.
 */
export function runCampaign(db, campaignId, { log = () => {}, shouldCancel = () => false, onProgress = () => {} } = {}) {
  let campaign = store.getCampaign(db, campaignId);
  if (!campaign) throw new Error('campaign_not_found');
  const { projectId } = campaign;
  const objectives = campaign.objectiveVector.length ? campaign.objectiveVector : adapter.DEFAULT_OBJECTIVES;
  // D-069 OPTION A, enforced in code (not left to convention): predictions
  // are frozen hard filters, never objectives, and hypervolume2D silently
  // truncates past two dimensions — a mis-set campaign.objectiveVector row
  // in the database could otherwise defeat both without any error.
  const predictionTerms = [...Object.keys(endpointCategories()), 'bestAffinityKcalMol'];
  const objectivesGuard = assertCampaignObjectivesD069(objectives, predictionTerms);
  if (!objectivesGuard.ok) throw new Error(`FAIL_CLOSED[${objectivesGuard.code}]: ${objectivesGuard.reason}`);
  const constraints = campaign.constraints.length ? campaign.constraints : adapter.DEFAULT_CONSTRAINTS;
  const budget = { maxGenerations: 6, maxGeneratedCandidates: 400, ...campaign.budget };
  const stopping = { patience: 2, minImprovement: 1e-3, diversityFloor: 0.15, ...campaign.stopping };
  let strategy = campaign.strategy && campaign.strategy.transformationWeights
    ? campaign.strategy
    : { transformationWeights: Object.fromEntries(adapter.availableProposalSources().map((t) => [t, 1])), parentSelection: 'pareto' };

  // Molekuły startowe żyją w strategii (nextExperiment robi `{...strategy}`, więc przetrwają).
  const startingSmiles = Array.isArray(strategy.startingSmiles) ? strategy.startingSmiles : [];

  store.updateCampaign(db, campaignId, { status: 'running', strategy });
  store.addEvent(db, { campaignId, generation: 0, type: 'OBJECTIVE_RECEIVED', payload: { objective: campaign.objective, domain: campaign.domain } });
  log('ANALYZING_DOMAIN', { domain: campaign.domain });

  const seenCanonical = new Set();
  const retained = []; // {id, canonicalSmiles, objectiveVector, transformation}
  let totalGenerated = 0;
  const history = []; // {hypervolume, bestScalar}

  // ---- Generacja 0: populacja startowa ----
  log('EXECUTING', { generation: 0 });
  for (const s of startingSmiles) {
    const canon = adapter.canonicalize(s);
    if (!canon.ok) {
      store.addEvent(db, { campaignId, generation: 0, type: 'RESULT_REJECTED', payload: { smiles: s, reason: `invalid_start:${canon.error}` } });
      continue;
    }
    if (seenCanonical.has(canon.canonicalSmiles)) continue;
    seenCanonical.add(canon.canonicalSmiles);
    const rec = makeCandidateRecord(db, campaignId, projectId, 0, { canonicalSmiles: canon.canonicalSmiles }, objectives, constraints);
    totalGenerated++;
    const id = store.addCandidate(db, { campaignId, generation: 0, canonicalSmiles: canon.canonicalSmiles, ...rec });
    persistDescriptorScienceRun(db, { campaignId, candidateId: id, projectId, run: rec.scienceRun });
    if (rec.status === 'retained') retained.push({ id, canonicalSmiles: canon.canonicalSmiles, objectiveVector: rec.objectiveVector, transformation: null });
  }
  recomputePareto(db, campaignId, retained);
  history.push(metricsSnapshot(retained));

  let stopReason = null;
  let generation = 0;
  const decisions = [];

  while (true) {
    // Anulowanie „gdzie bezpiecznie" — między generacjami (real, nie pozorne).
    if (shouldCancel()) {
      store.addEvent(db, { campaignId, generation, type: 'STOPPING_CONDITION_REACHED', payload: { stopReason: 'CANCELLED_BY_USER' } });
      store.updateCampaign(db, campaignId, { status: 'cancelled', stopReason: 'CANCELLED_BY_USER', currentGeneration: generation });
      return { campaignId, stopReason: 'CANCELLED_BY_USER', generations: generation, retainedCount: retained.length, totalGenerated, cancelled: true, decisions };
    }
    generation += 1;
    onProgress(budget.maxGenerations ? generation / budget.maxGenerations : 0);
    store.updateCampaign(db, campaignId, { currentGeneration: generation, status: 'running' });
    log('SELECTING_NEXT_EXPERIMENT', { generation });

    const parents = selectParents(retained, strategy, Math.min(4, retained.length || 1));
    const parentSmiles = parents.map((p) => p.canonicalSmiles);
    log('EXECUTING', { generation, parents: parentSmiles.length });

    const { proposals, attempts, successes } = adapter.generateProposals(parentSmiles, strategy.transformationWeights, { maxPerTransform: 2 });
    const transformationStats = {};
    // Suma kluczy strategii i tych, o których adapter faktycznie zaraportował próby:
    // kampania utworzona przed dodaniem nowego źródła propozycji ma je w bazie w
    // starej strategii, a bez tej sumy wkład do Pareto poniżej trafiałby w undefined.
    for (const t of new Set([...Object.keys(strategy.transformationWeights), ...Object.keys(attempts)])) {
      transformationStats[t] = { attempts: attempts[t] ?? 0, successes: successes[t] ?? 0, paretoContrib: 0 };
    }
    const rejections = {};
    const genRetained = [];

    for (const prop of proposals) {
      if (totalGenerated >= budget.maxGeneratedCandidates) { stopReason = 'STOP_RESOURCE_LIMIT'; break; }
      // Dedup kanoniczny (usuwanie duplikatów).
      if (seenCanonical.has(prop.canonicalSmiles)) {
        rejections.duplicate = (rejections.duplicate ?? 0) + 1;
        store.addCandidate(db, { campaignId, generation, parentSmiles: prop.parentSmiles, coParentSmiles: prop.coParentSmiles ?? null, transformation: prop.transformation, canonicalSmiles: prop.canonicalSmiles, valid: true, status: 'rejected', rejectedReason: 'duplicate', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
        continue;
      }
      seenCanonical.add(prop.canonicalSmiles);
      const parent = parents.find((p) => p.canonicalSmiles === prop.parentSmiles) ?? null;
      const rec = makeCandidateRecord(db, campaignId, projectId, generation, prop, objectives, constraints);
      totalGenerated++;
      const id = store.addCandidate(db, {
        campaignId, generation, parentId: parent?.id ?? null, parentSmiles: prop.parentSmiles,
        coParentSmiles: prop.coParentSmiles ?? null,
        transformation: prop.transformation, canonicalSmiles: prop.canonicalSmiles, ...rec,
      });
      persistDescriptorScienceRun(db, { campaignId, candidateId: id, projectId, run: rec.scienceRun });
      if (rec.status === 'retained') {
        genRetained.push({ id, canonicalSmiles: prop.canonicalSmiles, objectiveVector: rec.objectiveVector, transformation: prop.transformation });
        retained.push({ id, canonicalSmiles: prop.canonicalSmiles, objectiveVector: rec.objectiveVector, transformation: prop.transformation });
      } else {
        const key = (rec.rejectedReason ?? 'rejected').split(':')[0];
        rejections[key] = (rejections[key] ?? 0) + 1;
      }
    }

    // Pareto na całej zachowanej populacji + wkład transformacji tej generacji.
    const paretoIds = recomputePareto(db, campaignId, retained);
    const paretoSet = new Set(paretoIds);
    for (const c of genRetained) if (paretoSet.has(c.id) && c.transformation) transformationStats[c.transformation].paretoContrib += 1;

    const snap = metricsSnapshot(retained);
    const diversity = adapter.populationDiversity(retained.map((r) => r.canonicalSmiles));
    const metrics = { ...snap, diversity, transformationStats, rejections, retainedCount: retained.length, generated: proposals.length };
    history.push({ hypervolume: snap.hypervolume, bestScalar: snap.bestScalar });
    store.addEvent(db, { campaignId, generation, type: 'GENERATION_COMPLETED', payload: metrics });
    log('VALIDATING_RESULT', { generation, retained: retained.length, pareto: paretoIds.length, hv: snap.hypervolume.toFixed(4), diversity });

    if (stopReason === 'STOP_RESOURCE_LIMIT') break;

    // ---- Adaptacyjny wybór następnego eksperymentu ----
    const decision = analyzeAndDecide({ generation, strategy, metrics, history, budget, stopping });
    const decId = store.addDecision(db, {
      campaignId, generation, stateHash: hashState(generation, retained.map((r) => r.canonicalSmiles), strategy),
      evidence: { paretoSize: metrics.paretoSize, retainedCount: metrics.retainedCount }, metrics,
      algorithm: 'rule-based-evidence', decision: decision.decision, params: decision.params, purpose: decision.purpose,
    });
    decisions.push({ id: decId, generation, decision: decision.decision, purpose: decision.purpose });
    store.addEvent(db, { campaignId, generation, type: 'STRATEGY_DECISION', payload: { decision: decision.decision, purpose: decision.purpose } });
    log('SEARCH_STRATEGY_UPDATED', { generation, decision: decision.decision });

    strategy = decision.newStrategy; // <-- NASTĘPNA generacja realnie użyje tej strategii
    store.updateCampaign(db, campaignId, { strategy });

    if (isStop(decision.decision)) { stopReason = decision.decision; break; }
  }

  if (!stopReason) stopReason = 'STOP_RESOURCE_LIMIT';
  const finalPareto = retained.filter((r) => store.getCandidate(db, r.id)?.pareto);
  const final = {
    stopReason, generations: generation, retainedCount: retained.length, totalGenerated,
    paretoCount: finalPareto.length,
    paretoFront: finalPareto.map((r) => ({ smiles: r.canonicalSmiles, objectiveVector: r.objectiveVector })),
    hypervolumeStart: history[0]?.hypervolume ?? 0, hypervolumeEnd: history[history.length - 1]?.hypervolume ?? 0,
    startingSmiles,
  };
  store.updateCampaign(db, campaignId, { status: 'completed', stopReason, final, currentGeneration: generation });
  store.addEvent(db, { campaignId, generation, type: 'STOPPING_CONDITION_REACHED', payload: { stopReason } });
  log('STOPPING_CONDITION_REACHED', { stopReason });
  return { campaignId, ...final, decisions };
}

function metricsSnapshot(retained) {
  const vectors = retained.map((r) => Object.values(r.objectiveVector));
  const hv = vectors.length ? hypervolume2D(vectors, adapter.HV_REFERENCE) : 0;
  const bs = vectors.length ? bestScalar(vectors) : null;
  const pf = vectors.length ? paretoFrontIndices(vectors) : [];
  return { hypervolume: hv, bestScalar: bs, paretoSize: pf.length };
}

function recomputePareto(db, campaignId, retained) {
  const vectors = retained.map((r) => Object.values(r.objectiveVector));
  const idx = paretoFrontIndices(vectors);
  const paretoIds = idx.map((i) => retained[i].id);
  store.setParetoFlags(db, campaignId, paretoIds);
  return paretoIds;
}
