/**
 * Autonomous Campaign Loop V2 + Discovery Dossier V2 (Live Discovery Brain, Phases 11 & 15).
 *
 * Extends the chemistry-only Discovery Forge with the reasoning/evidence brain, executing the
 * full product path: problem → source probe → USER_SUPPLIED evidence → claim registry →
 * reasoning (capability-blocked without a live model) → target funnel → Truth-Engine gate →
 * (if not blocked) the real multi-generation chemistry loop → Dossier V2.
 *
 * HONESTY: live literature/structure sources are policy-blocked in this environment, so the
 * source probe records SOURCE_UNAVAILABLE and evidence is USER_SUPPLIED (real identifiers).
 * The reasoning brain is CAPABILITY_BLOCKED (no provider). A target with no SUPPORTED claim is
 * BLOCKED from progressing. Chemistry is real (RDKit). Output is COMPUTATIONAL candidates only.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';
import * as evidence from './evidenceIntelligence.mjs';
import * as brain from './reasoningBrain.mjs';
import * as target from './targetIntelligence.mjs';
import * as ctrl from './discoveryController.mjs';
import { CAMPAIGN_STATUS, DISCOVERY_LIMITATION } from './discoveryForge.mjs';

/**
 * opts: { projectId, problem:{title,scope,maxMolWt?,maxAlerts?}, userEvidence=[], claims=[],
 *   targets=[], seeds=[], maxGenerations=2, maxCandidatesPerGen=12, connectors?, probe=true }
 */
export async function runCampaignV2(db, opts) {
  const { projectId, problem = {}, userEvidence = [], claims = [], targets = [], seeds = [], maxGenerations = 2, maxCandidatesPerGen = 12, connectors, probe = true, engines } = opts;
  if (!projectId) throw new Error('runCampaignV2 requires projectId (tenant ownership)');

  const campaign = store.createDiscoveryCampaign(db, { projectId, challenge: { grandChallenge: problem.title ?? 'discovery mission', scope: problem.scope ?? null }, status: CAMPAIGN_STATUS.EVIDENCE_BUILDING });
  const emit = (type, payload) => store.appendDiscoveryEvent(db, { campaignId: campaign.id, generation: 0, type, payload, contentHash: canonicalHash(payload) });
  emit('PROBLEM', { title: problem.title ?? null, scope: problem.scope ?? null, limitation: DISCOVERY_LIMITATION });

  // 1) Honest live-source probe (records true reachability; never fabricated).
  let sources = { skipped: 'probe disabled' };
  if (probe) { sources = await evidence.probeSources(undefined, connectors ? { connectors } : {}); }
  emit('SOURCE_PROBE', { sources, note: 'LIVE availability; SOURCE_UNAVAILABLE means the egress policy blocked the host — evidence is NOT fabricated.' });

  // 2) Evidence ingestion (USER_SUPPLIED real identifiers) + claim registry.
  const ev = evidence.ingestUserEvidence(userEvidence, { campaignId: campaign.id, projectId });
  emit('EVIDENCE', { records: ev, count: ev.length });
  const { registry: claimRegistry, rejected: rejectedClaims } = evidence.buildClaimRegistry(claims, ev);
  emit('CLAIM_REGISTRY', { registry: claimRegistry, rejected: rejectedClaims, summary: evidence.evidenceSummary(ev, claimRegistry) });

  // 3) Reasoning brain (capability-blocked without a live provider — recorded honestly).
  const evidenceContextIds = ev.map((e) => e.evidenceId);
  for (const capability of ['scientific_evidence_synthesis', 'hypothesis_generation', 'target_reasoning']) {
    brain.requestReasoning({ db, campaignId: campaign.id, capability, evidenceContextIds, emit });
  }

  // 4) Target funnel + Truth-Engine gate.
  const funnel = target.targetFunnel(targets, claimRegistry);
  emit('TARGET_FUNNEL', { funnel });
  const gate = funnel.primaryGate;

  // 5) Progression decision — insufficient/contradictory evidence blocks the chemistry loop.
  let chemistry = null;
  let finalStatus;
  if (gate.gate === target.TARGET_GATE.BLOCK) {
    finalStatus = targets.length === 0 || claimRegistry.length === 0 ? CAMPAIGN_STATUS.INSUFFICIENT_EVIDENCE : CAMPAIGN_STATUS.HUMAN_REVIEW_REQUIRED;
  } else if (seeds.length === 0) {
    finalStatus = CAMPAIGN_STATUS.HUMAN_REVIEW_REQUIRED;
  } else {
    // 6) Real chemistry loop (child campaign; real RDKit). Novelty against the supplied refs.
    const challenge = { grandChallenge: problem.title ?? 'analogue campaign', scope: problem.scope, maxMolWt: problem.maxMolWt ?? 320, maxAlerts: problem.maxAlerts ?? 0 };
    chemistry = ctrl.runCampaign(db, { projectId, challenge, seeds, maxGenerations, maxCandidatesPerGen, referenceSet: seeds.map((s) => s.smiles), ...(engines ? { engines } : {}) });
    emit('CHEMISTRY_LINK', { childCampaignId: chemistry.campaignId, status: chemistry.status, stopReason: chemistry.stopReason, finalists: chemistry.finalists.length });
    finalStatus = chemistry.status;
  }

  emit('CAMPAIGN_COMPLETE', { status: finalStatus, gate, sourcesLive: Object.values(sources).some((s) => s?.status === 'AVAILABLE'), limitation: DISCOVERY_LIMITATION });
  store.updateDiscoveryCampaign(db, campaign.id, { status: finalStatus, state: { gate, childCampaignId: chemistry?.campaignId ?? null } });
  return { campaignId: campaign.id, status: finalStatus, gate, childCampaignId: chemistry?.campaignId ?? null, sources, evidenceCount: ev.length, claimRegistry, targetFunnel: funnel, chemistry };
}

/** Discovery Dossier V2 — assembled ENTIRELY from persisted events (+ the child chemistry dossier). */
export function buildDossierV2(db, campaignId) {
  const campaign = store.getDiscoveryCampaign(db, campaignId);
  if (!campaign) return null;
  const events = store.listDiscoveryEvents(db, campaignId);
  const first = (t) => events.find((e) => e.type === t)?.payload ?? null;
  const allOf = (t) => events.filter((e) => e.type === t);

  const problem = first('PROBLEM') ?? {};
  const sourceProbe = first('SOURCE_PROBE') ?? {};
  const evidenceEv = first('EVIDENCE') ?? { records: [], count: 0 };
  const claimReg = first('CLAIM_REGISTRY') ?? { registry: [], rejected: [], summary: {} };
  const targetFunnel = first('TARGET_FUNNEL')?.funnel ?? null;
  const reasoning = allOf('REASONING_STEP').map((e) => ({ capability: e.payload.capability, status: e.payload.status, label: e.payload.label, routeStatus: e.payload.routeStatus, note: e.payload.note }));
  const chemLink = first('CHEMISTRY_LINK');
  const complete = first('CAMPAIGN_COMPLETE') ?? {};
  const chemistryDossier = chemLink?.childCampaignId ? ctrl.buildDossier(db, chemLink.childCampaignId) : null;

  const dossier = {
    schema: 'zefir-discovery-dossier/2',
    campaignId, projectId: campaign.projectId,
    problem: problem.title ?? null, scope: problem.scope ?? null,
    finalStatus: campaign.status,
    // Evidence intelligence
    liveSourceAvailability: sourceProbe.sources ?? null,
    evidenceOrigin: 'USER_SUPPLIED (live sources policy-blocked in this environment)',
    evidenceRecords: evidenceEv.records ?? [],
    evidenceSummary: claimReg.summary ?? {},
    claimRegistry: claimReg.registry ?? [],
    rejectedClaims: claimReg.rejected ?? [],
    // Target intelligence
    targetFunnel,
    selectedTarget: targetFunnel?.primaryTarget ?? null,
    targetGate: targetFunnel?.primaryGate ?? null,
    // Reasoning
    reasoningLedger: reasoning,
    reasoningStatus: reasoning.every((r) => r.status === 'CAPABILITY_BLOCKED') ? 'ALL_CAPABILITY_BLOCKED (no live model configured)' : 'PARTIAL',
    // Chemistry (embedded child dossier — real engines)
    chemistry: chemistryDossier,
    // Honesty layers
    epistemicLegend: {
      OBSERVED_COMPUTATIONAL_RESULT: 'real engine output (RDKit/ADMET)',
      DETERMINISTIC_INFERENCE: 'deterministic scoring/gating over real data',
      MODEL_GENERATED_HYPOTHESIS: 'none — reasoning brain capability-blocked',
      SPECULATION: 'none emitted',
      EXTERNAL_EVIDENCE: 'USER_SUPPLIED identifiers only (live sources blocked)',
      HUMAN_REVIEW_REQUIRED: 'reasoning-dependent stages',
    },
    capabilityGaps: [
      'LIVE literature/structure/compound sources are policy-blocked (SOURCE_UNAVAILABLE)',
      'no live reasoning model configured → hypothesis/evidence-synthesis capability-blocked',
      ...(chemistryDossier ? chemistryDossier.enginesSkipped.map((e) => `${e.engine}: ${e.reason}`) : []),
    ],
    limitationStatement: DISCOVERY_LIMITATION,
    classification: 'COMPUTATIONAL_ARCHITECTURE_TRIAL — computational candidates/hypotheses only; not experimentally validated, not drugs, not clinical.',
    provenance: { events: events.length, replayable: true, hashAlgo: 'sha256' },
  };
  dossier.dossierHash = canonicalHash({ ...dossier, provenance: undefined, dossierHash: undefined });
  return { ...dossier, sourcesLive: complete.sourcesLive ?? false };
}
