/**
 * Autonomous Discovery Campaign controller + Discovery Dossier (Final WOW Mandate,
 * Phases 13 & 15). Drives the multi-generation loop over the discoveryForge primitives,
 * persisting every transition to the append-only discovery event log (provenance + replay),
 * and assembling a machine-readable Discovery Dossier from the persisted artifacts.
 *
 * The loop is genuinely adaptive: observed cohort results are recorded in the tenant
 * Necropolis and drive a plan mutation, so the next generation materially differs. It stops
 * on explicit budget / no-survivor+no-productive-move (no information gain) / convergence.
 * Nothing is faked; engines without real inputs are capability-blocked, not invented.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';
import * as necro from './necropolis.mjs';
import * as forge from './discoveryForge.mjs';

const S = forge.CAMPAIGN_STATUS;

/** Composite computational rank (NOT affinity). Lower is better on liabilities. */
function rankSurvivors(survivors) {
  return survivors
    .map((r) => {
      const s = r.signals;
      const score =
        (s.nAlerts ?? 0) * 3 +
        (s.saScore ?? 5) * 0.5 +
        Math.max(0, (s.molWt ?? 0) - 400) * 0.005 +
        (s.maxTanimoto ?? 0) * 1.0 + // closer to a known ref is penalised (novelty preference)
        (r.demoted ? 5 : 0);
      return { ...r, computationalRankScore: +score.toFixed(3) };
    })
    .sort((a, b) => a.computationalRankScore - b.computationalRankScore);
}

/**
 * Run an autonomous discovery campaign. opts:
 *  { projectId, challenge, seeds, engines?, maxGenerations=3, maxCandidatesPerGen=12,
 *    referenceSet=[], hasReceptor=false, liveSources=false }
 * Returns { campaignId, status, generations, finalists }.
 */
export function runCampaign(db, { projectId, challenge = {}, seeds, engines = forge.defaultEngines(), maxGenerations = 3, maxCandidatesPerGen = 12, referenceSet = [], hasReceptor = false, liveSources = false }) {
  if (!projectId) throw new Error('runCampaign requires projectId (tenant ownership)');
  if (!Array.isArray(seeds) || seeds.length === 0) throw new Error('runCampaign requires at least one seed scaffold');

  const campaign = store.createDiscoveryCampaign(db, { projectId, challenge, status: S.CANDIDATE_GENERATION });
  let plan = forge.initialPlan(challenge);
  const emit = (type, generation, payload) => store.appendDiscoveryEvent(db, { campaignId: campaign.id, generation, type, payload, contentHash: canonicalHash(payload) });

  emit('CAMPAIGN_INIT', 0, { challenge, plan, planHash: forge.planHash(plan), limitation: forge.DISCOVERY_LIMITATION });
  store.updateDiscoveryCampaign(db, campaign.id, { status: S.CANDIDATE_GENERATION, planHash: forge.planHash(plan), state: { plan } });

  const allSurvivors = [];
  const generations = [];
  let stopReason = null;
  let noSurvivorStreak = 0;

  for (let gen = 0; gen < maxGenerations; gen++) {
    // Engine applicability plan for this generation (recorded honestly, incl. capability blocks).
    const engineRoutes = forge.engineApplicability(null, { hasReceptor, engines });
    const enginesExecutable = engineRoutes.filter((e) => e.decision === 'EXECUTE').map((e) => e.engine);
    emit('ENGINE_PLAN', gen, { routes: engineRoutes, executable: enginesExecutable });

    const cohort = forge.generateCohort(db, campaign, { generation: gen, plan, seeds, engines, maxCandidates: maxCandidatesPerGen });
    emit('COHORT', gen, { planHash: forge.planHash(plan), transformsUsed: cohort.transformsUsed, candidates: cohort.candidates.map((c) => ({ id: c.candidateId, canonical: c.canonicalStructure, scaffold: c.scaffold, via: c.provenance.transformation })), skipped: cohort.skipped });

    // Funnel every candidate through the REAL engines.
    const funnelResults = cohort.candidates.map((c) => ({ candidate: c, ...forge.funnelCandidate(c, { plan, engines, referenceSet }) }));
    emit('FUNNEL', gen, { results: funnelResults.map((r) => ({ id: r.candidate.candidateId, status: r.status, signals: r.signals, rejectReason: r.rejectReason ?? null, stages: r.stages.map((s) => ({ stage: s.stage, status: s.status })) })) });

    // Record real failure regions in the tenant Necropolis (drives later avoidance).
    const necroEvents = [];
    for (const r of funnelResults) {
      if (r.status === forge.CANDIDATE_STATUS.REJECTED && r.signals && r.signals.molWt != null) {
        const rec = necro.recordFailure(db, { projectId, domain: 'small-molecule', failureClass: 'FAILED_CANDIDATE_REGION', context: `discovery:${campaign.id}`, parameterVector: { molWt: r.signals.molWt, logP: r.signals.logP ?? 0 }, scales: { molWt: 500, logP: 5 }, failureMode: r.rejectReason, provenance: { candidateId: r.candidate.candidateId, transformation: r.candidate.provenance.transformation } });
        if (!rec.duplicate) necroEvents.push({ candidateId: r.candidate.candidateId, region: { molWt: r.signals.molWt, logP: r.signals.logP }, reason: r.rejectReason });
      }
    }
    if (necroEvents.length) emit('NECROPOLIS', gen, { recorded: necroEvents });

    // Adversarial critic on survivors (can demote).
    let survivors = funnelResults.filter((r) => r.status === forge.CANDIDATE_STATUS.SURVIVED_STAGE);
    const critiqued = survivors.map((r) => {
      const c = forge.critiqueCandidate(r.candidate, r.signals, { enginesRun: enginesExecutable });
      return { ...r, critiques: c.critiques, demoted: c.demote, status: c.demote ? forge.CANDIDATE_STATUS.NEEDS_REVIEW : r.status };
    });
    emit('CRITIC', gen, { critiques: critiqued.map((r) => ({ id: r.candidate.candidateId, demoted: r.demoted, critiques: r.critiques })) });

    // Falsification priority for the leading survivor.
    if (critiqued.length) {
      const lead = rankSurvivors(critiqued)[0];
      const fals = forge.cheapestFalsification(lead.candidate, lead.signals, { hasReceptor });
      emit('FALSIFICATION', gen, { leadCandidate: lead.candidate.candidateId, task: fals });
    }

    allSurvivors.push(...critiqued.filter((r) => !r.demoted));
    generations.push({ generation: gen, planHash: forge.planHash(plan), cohortSize: cohort.candidates.length, survivors: critiqued.filter((r) => !r.demoted).length, rejected: funnelResults.filter((r) => r.status === 'REJECTED').length });

    const survivorCount = critiqued.filter((r) => !r.demoted).length;
    noSurvivorStreak = survivorCount === 0 ? noSurvivorStreak + 1 : 0;

    if (gen === maxGenerations - 1) { stopReason = 'GENERATION_BUDGET_EXHAUSTED'; break; }

    // Observe → mutate the plan from REAL results.
    const observations = forge.observeCohort(funnelResults.map((r) => ({ ...r, candidate: r.candidate })));
    const mutation = forge.mutatePlan(plan, observations, { movesRemaining: true });
    emit('PLAN_MUTATION', gen, { trigger: mutation.trigger, mutationType: mutation.mutationType, previousPlanHash: mutation.previousPlanHash, newPlanHash: mutation.newPlanHash, rationale: mutation.rationale, observations });

    // No-information-gain stop: nothing survived AND the plan cannot be productively changed.
    if (!mutation.mutated && survivorCount === 0) { stopReason = 'NO_INFORMATION_GAIN'; break; }
    if (noSurvivorStreak >= 2 && !mutation.mutated) { stopReason = 'NO_INFORMATION_GAIN'; break; }

    plan = mutation.newPlan;
    store.updateDiscoveryCampaign(db, campaign.id, { status: S.NEXT_GENERATION, planHash: forge.planHash(plan), state: { plan } });
  }

  // Dedup survivors canonically across generations (the same structure is ONE candidate,
  // not fake diversity), then novelty-gate + rank.
  const uniqueSurvivors = [];
  const seenHash = new Set();
  for (const r of allSurvivors) { const h = r.candidate.canonicalStructureHash; if (seenHash.has(h)) continue; seenHash.add(h); uniqueSurvivors.push(r); }
  const finalRanked = rankSurvivors(uniqueSurvivors).map((r) => ({ ...r, novelty: forge.noveltyGate(r.candidate, r.signals, { referenceSet, liveSources }) }));
  const finalists = finalRanked.slice(0, 5).map((r) => ({ ...r, candidate: { ...r.candidate, status: forge.CANDIDATE_STATUS.FINALIST } }));
  emit('NOVELTY_GATE', generations.length, { assessments: finalRanked.map((r) => ({ id: r.candidate.candidateId, novelty: r.novelty })) });

  const finalStatus = finalists.length > 0 ? S.COMPLETED_WITH_COMPUTATIONAL_CANDIDATES : S.COMPLETED_NO_SURVIVORS;
  emit('CAMPAIGN_COMPLETE', generations.length, { status: finalStatus, stopReason, finalists: finalists.map((r) => ({ id: r.candidate.candidateId, canonical: r.candidate.canonicalStructure, rank: r.computationalRankScore, novelty: r.novelty.status })), limitation: forge.DISCOVERY_LIMITATION });
  store.updateDiscoveryCampaign(db, campaign.id, { status: finalStatus, planHash: forge.planHash(plan), state: { plan, stopReason } });

  return { campaignId: campaign.id, status: finalStatus, stopReason, generations, finalists };
}

/* ---------------- Discovery Dossier (Phase 15) ---------------- */
/** Assemble a machine-readable dossier ENTIRELY from persisted campaign events. */
export function buildDossier(db, campaignId) {
  const campaign = store.getDiscoveryCampaign(db, campaignId);
  if (!campaign) return null;
  const events = store.listDiscoveryEvents(db, campaignId);
  const byType = (t) => events.filter((e) => e.type === t);
  const init = byType('CAMPAIGN_INIT')[0]?.payload ?? {};
  const complete = byType('CAMPAIGN_COMPLETE')[0]?.payload ?? {};
  const mutations = byType('PLAN_MUTATION').map((e) => ({ generation: e.generation, ...e.payload }));
  const cohorts = byType('COHORT').map((e) => ({ generation: e.generation, planHash: e.payload.planHash, transformsUsed: e.payload.transformsUsed, candidates: e.payload.candidates, skipped: e.payload.skipped }));
  const funnels = byType('FUNNEL').map((e) => ({ generation: e.generation, results: e.payload.results }));
  const necroEvents = byType('NECROPOLIS').flatMap((e) => e.payload.recorded.map((r) => ({ generation: e.generation, ...r })));
  const critics = byType('CRITIC').flatMap((e) => e.payload.critiques.map((c) => ({ generation: e.generation, ...c })));
  const falsifications = byType('FALSIFICATION').map((e) => ({ generation: e.generation, ...e.payload }));
  const enginePlans = byType('ENGINE_PLAN').map((e) => ({ generation: e.generation, routes: e.payload.routes }));
  const novelty = byType('NOVELTY_GATE')[0]?.payload?.assessments ?? [];

  // Engines skipped/blocked with reasons (from the first engine plan, stable across gens).
  const enginesSkipped = (enginePlans[0]?.routes ?? []).filter((r) => r.decision !== 'EXECUTE').map((r) => ({ engine: r.engine, decision: r.decision, reason: r.reason }));
  const enginesExecuted = [...new Set((enginePlans[0]?.routes ?? []).filter((r) => r.decision === 'EXECUTE').map((r) => r.engine))];

  const dossier = {
    schema: 'zefir-discovery-dossier/1',
    campaignId, projectId: campaign.projectId,
    grandChallenge: init.challenge?.grandChallenge ?? null,
    campaignScope: init.challenge?.scope ?? null,
    finalStatus: campaign.status, stopReason: complete.stopReason ?? null,
    initialPlanHash: init.planHash ?? null,
    generationHistory: cohorts.map((c) => ({ generation: c.generation, planHash: c.planHash, cohortSize: c.candidates.length, transformsUsed: c.transformsUsed })),
    planMutations: mutations,
    cohorts, funnelResults: funnels,
    necropolisEntries: necroEvents,
    failureRegionsAvoided: cohorts.flatMap((c) => (c.skipped ?? []).filter((s) => /necropolis_dead_end/.test(s.reason ?? '')).map((s) => ({ generation: c.generation, ...s }))),
    adversarialCriticisms: critics,
    falsificationTasks: falsifications,
    enginesExecuted, enginesSkipped,
    noveltyAssessments: novelty,
    rankedComputationalCandidates: complete.finalists ?? [],
    provenance: { events: events.length, replayable: true, hashAlgo: 'sha256' },
    limitationStatement: forge.DISCOVERY_LIMITATION,
    classification: 'COMPUTATIONAL_CANDIDATE (not experimentally validated, not an approved drug)',
  };
  dossier.dossierHash = canonicalHash({ ...dossier, provenance: undefined, dossierHash: undefined });
  return dossier;
}
