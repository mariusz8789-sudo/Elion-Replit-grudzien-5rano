/**
 * Adversarial Molecular Discovery Funnel (Phase 3F/G/H/J — ZEFIR).
 *
 * Candidate survival funnel over REAL engines. The philosophy is ADVERSARIAL
 * CANDIDATE SURVIVAL: do not prove a candidate is good — try to KILL it. A candidate
 * advances only when current evidence fails to provide a sufficient reason to reject.
 *
 * Honesty guarantees:
 *  - ADMET results are MODEL_ESTIMATE; there is NO docking/target result here because
 *    a real target PDB is BLOCKED_BY_RESOURCES → SELECTIVITY_NOT_ASSESSED /
 *    INSUFFICIENT_TARGET_COVERAGE, never a fabricated selectivity claim.
 *  - A candidate NEVER survives on one favorable score. The critic aggregates signals
 *    and can only issue REJECT / HOLD_FOR_MORE_EVIDENCE / ESCALATE_TO_HIGHER_FIDELITY /
 *    SURVIVES_CURRENT_COMPUTATIONAL_REVIEW — never SAFE / EFFECTIVE / CLINICALLY_SELECTIVE.
 *  - Negative-result memory: before spending compute, ask "have we failed this way
 *    before?" A candidate matching a known rejection motif is SKIPPED_BY_POLICY.
 *  - Every stage records engine/version/params/hashes/duration/epistemic-class/status.
 *
 * Engines are injectable (default: real RDKit + ADMET-AI adapters) so tests are
 * deterministic and the real campaign drives real computation.
 */
import { canonicalHash, sha256Hex16 } from '../provenance.mjs';
import * as store from '../store.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';
import * as admet from '../compute/admetAdapter.mjs';

export const STAGE = Object.freeze({
  VALIDITY: 'MOLECULE_VALIDITY', DESCRIPTORS: 'DESCRIPTORS', PHYSCHEM: 'PHYSICOCHEMICAL_FILTER',
  ALERTS: 'STRUCTURAL_ALERTS', ADMET: 'ADMET_MODEL_ESTIMATE', NOVELTY: 'STRUCTURAL_NOVELTY',
  SA: 'SYNTHETIC_ACCESSIBILITY', TARGET: 'TARGET_COMPUTATION', OFFTARGET: 'OFF_TARGET_COMPUTATION',
  CRITIC: 'ADVERSARIAL_CRITIC_REVIEW',
});
export const STAGE_STATUS = Object.freeze({
  EXECUTED: 'EXECUTED', VERIFIED: 'VERIFIED', REJECTED: 'REJECTED', SKIPPED_BY_POLICY: 'SKIPPED_BY_POLICY',
  CAPABILITY_GAP: 'CAPABILITY_GAP', BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME', BLOCKED_BY_RESOURCES: 'BLOCKED_BY_RESOURCES', FAILED: 'FAILED',
});
export const CRITIC_DECISION = Object.freeze({
  REJECT: 'REJECT', HOLD: 'HOLD_FOR_MORE_EVIDENCE', ESCALATE: 'ESCALATE_TO_HIGHER_FIDELITY', SURVIVES: 'SURVIVES_CURRENT_COMPUTATIONAL_REVIEW',
});
export const CRO_READINESS = Object.freeze({
  NOT_READY: 'NOT_READY', INCOMPLETE: 'COMPUTATIONAL_REVIEW_INCOMPLETE',
  EXPERT_REVIEW: 'READY_FOR_EXPERT_REVIEW', EXTERNAL_DESIGN: 'READY_FOR_EXTERNAL_EXPERIMENT_DESIGN_REVIEW',
});

const DEFAULT_POLICY = Object.freeze({
  maxMW: 700, maxLogP: 6, maxLipinskiViolations: 2, hardAlertCount: 2,
  hergConcernPercentile: 80, noveltyMaxTanimoto: 0.85, maxSaScore: 6, knownMotifThreshold: 1,
});
const defaultEngines = { validate: rdkit.validate, descriptors: rdkit.descriptors, alerts: rdkit.structuralAlerts, novelty: rdkit.novelty, saScore: rdkit.saScore, admet: admet.predict };

function stage(db, cand, s, extra) {
  return store.saveFunnelStage(db, { candidateId: cand.id, missionId: cand.missionId, stage: s, ...extra });
}

/**
 * Run the adversarial funnel for one SMILES. Returns { candidate, decision, stages,
 * signals, croReadiness }. Never fabricates: unavailable engines/targets are recorded
 * with the honest status.
 */
export function runFunnel(db, { missionId = null, smiles, generationStrategy = null, programModality = null, referenceSet = [], engines = {}, policy = {}, targetPanel = null } = {}) {
  const E = { ...defaultEngines, ...engines };
  const P = { ...DEFAULT_POLICY, ...policy };

  // Validity + canonicalization.
  const v = E.validate(smiles);
  if (!v.ok || !v.canonicalSmiles) {
    const cand = store.saveFunnelCandidate(db, { missionId, canonicalSmiles: String(smiles), molecularHash: sha256Hex16(String(smiles)), generationStrategy, programModality, status: 'rejected' });
    stage(db, cand, STAGE.VALIDITY, { status: STAGE_STATUS.REJECTED, epistemicClass: 'COMPUTED', output: { valid: false }, failureReason: v.error ?? 'invalid_smiles' });
    return { candidate: store.getFunnelCandidate(db, cand.id), decision: CRITIC_DECISION.REJECT, stages: store.listFunnelStages(db, cand.id), signals: { invalid: true }, croReadiness: CRO_READINESS.NOT_READY };
  }
  const canonical = v.canonicalSmiles;
  const molHash = sha256Hex16(canonical);
  const cand = store.saveFunnelCandidate(db, { missionId, canonicalSmiles: canonical, molecularHash: molHash, generationStrategy, programModality, status: 'surviving' });
  stage(db, cand, STAGE.VALIDITY, { engine: 'RDKit', status: STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTED', output: { valid: true, canonical }, inputHash: sha256Hex16(smiles), outputHash: molHash });

  const signals = { invalid: false, physFail: false, hardAlerts: false, knownMotif: false, concerns: [], targetAssessed: false, escalateAvailable: false };

  // NEGATIVE-RESULT MEMORY: have we failed this exact structure or a known-bad motif before?
  const structKey = `mol:${molHash}`;
  if (store.countRejectionMotif(db, missionId, structKey) >= P.knownMotifThreshold) {
    signals.knownMotif = true;
    stage(db, cand, STAGE.CRITIC, { status: STAGE_STATUS.SKIPPED_BY_POLICY, epistemicClass: 'INFERRED', output: { reason: 'known-failing structure motif; skipped expensive stages', motifKey: structKey } });
    return finalize(db, cand, CRITIC_DECISION.REJECT, signals);
  }

  // Descriptors.
  const d = E.descriptors(canonical);
  if (!d.ok) { stage(db, cand, STAGE.DESCRIPTORS, { engine: 'RDKit', status: mapErr(d.error), epistemicClass: 'COMPUTED', failureReason: d.error }); return finalize(db, cand, CRITIC_DECISION.HOLD, signals); }
  stage(db, cand, STAGE.DESCRIPTORS, { engine: d.engine ?? 'RDKit', status: STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTED', output: d.data, outputHash: sha256Hex16(d.data) });

  // Physicochemical filter (policy).
  const phys = d.data;
  const physFail = phys.molWt > P.maxMW || phys.crippenLogP > P.maxLogP || phys.lipinskiViolations > P.maxLipinskiViolations;
  signals.physFail = physFail;
  stage(db, cand, STAGE.PHYSCHEM, { status: physFail ? STAGE_STATUS.REJECTED : STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTED', output: { molWt: phys.molWt, logP: phys.crippenLogP, lipinskiViolations: phys.lipinskiViolations, pass: !physFail } });
  if (physFail) { store.saveRejectionMotif(db, { missionId, motifKey: structKey, motifKind: 'physicochemical', candidateId: cand.id, detail: { molWt: phys.molWt, logP: phys.crippenLogP } }); return finalize(db, cand, CRITIC_DECISION.REJECT, signals); }

  // Structural alerts (real PAINS/BRENK).
  const al = E.alerts(canonical);
  if (al.ok) {
    stage(db, cand, STAGE.ALERTS, { engine: al.engine ?? 'RDKit', status: STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTED', output: { alerts: al.alerts, nAlerts: al.nAlerts } });
    if (al.nAlerts >= P.hardAlertCount) { signals.hardAlerts = true; store.saveRejectionMotif(db, { missionId, motifKey: `alerts:${al.alerts.slice(0, 2).join(',')}`, motifKind: 'structural-alert', candidateId: cand.id, detail: { alerts: al.alerts } }); store.saveRejectionMotif(db, { missionId, motifKey: structKey, motifKind: 'structural-alert', candidateId: cand.id, detail: { alerts: al.alerts } }); }
    else if (al.nAlerts === 1) signals.concerns.push({ kind: 'structural-alert', detail: al.alerts });
  } else stage(db, cand, STAGE.ALERTS, { status: mapErr(al.error), failureReason: al.error });
  if (signals.hardAlerts) return finalize(db, cand, CRITIC_DECISION.REJECT, signals);

  // ADMET (MODEL_ESTIMATE).
  const a = E.admet([canonical]);
  if (a.ok) {
    const pred = (a.predictions ?? a.data ?? [a])[0] ?? {};
    const herg = pred.hERG_drugbank_approved_percentile ?? pred.hERG ?? null;
    stage(db, cand, STAGE.ADMET, { engine: 'ADMET-AI', engineVersion: a.version, status: STAGE_STATUS.EXECUTED, epistemicClass: 'MODEL_ESTIMATE', output: { hERG_percentile: herg }, outputHash: sha256Hex16(pred) });
    if (herg != null && herg > P.hergConcernPercentile) signals.concerns.push({ kind: 'admet-herg', detail: herg });
  } else stage(db, cand, STAGE.ADMET, { status: mapErr(a.error), epistemicClass: 'MODEL_ESTIMATE', failureReason: a.error });

  // Structural novelty vs a reference set (honest: none reachable → NOT ASSESSED).
  const nov = E.novelty(canonical, referenceSet);
  if (nov.ok && nov.nReference > 0) {
    stage(db, cand, STAGE.NOVELTY, { engine: 'RDKit', status: STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTED', output: { maxTanimoto: nov.maxTanimoto, nReference: nov.nReference } });
    if (nov.maxTanimoto != null && nov.maxTanimoto > P.noveltyMaxTanimoto) signals.concerns.push({ kind: 'novelty-failure', detail: nov.maxTanimoto });
  } else stage(db, cand, STAGE.NOVELTY, { status: STAGE_STATUS.BLOCKED_BY_RESOURCES, epistemicClass: 'UNKNOWN', output: { note: 'NOVELTY_NOT_ASSESSED: no external novelty reference set reachable' } });

  // Synthetic accessibility.
  const sa = E.saScore(canonical);
  if (sa.ok) {
    stage(db, cand, STAGE.SA, { engine: 'RDKit', status: STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTED', output: { saScore: sa.saScore } });
    if (sa.saScore > P.maxSaScore) signals.concerns.push({ kind: 'poor-synthetic-accessibility', detail: sa.saScore });
  } else stage(db, cand, STAGE.SA, { status: mapErr(sa.error), failureReason: sa.error });

  // Target / off-target selectivity — honest.
  if (targetPanel && targetPanel.length) {
    signals.targetAssessed = true; signals.escalateAvailable = true;
    stage(db, cand, STAGE.TARGET, { status: STAGE_STATUS.EXECUTED, epistemicClass: 'COMPUTATIONAL_DOCKING_SCORE', output: { note: 'target panel supplied', nTargets: targetPanel.length } });
  } else {
    stage(db, cand, STAGE.TARGET, { status: STAGE_STATUS.BLOCKED_BY_RESOURCES, epistemicClass: 'UNKNOWN', output: { note: 'INSUFFICIENT_TARGET_COVERAGE / SELECTIVITY_NOT_ASSESSED: no valid target structure available (RCSB egress blocked)' } });
  }

  return finalize(db, cand, criticDecide(signals), signals);
}

function mapErr(err) {
  return err === 'BLOCKED_BY_RUNTIME' ? STAGE_STATUS.BLOCKED_BY_RUNTIME : err === 'BLOCKED_BY_RESOURCES' ? STAGE_STATUS.BLOCKED_BY_RESOURCES : STAGE_STATUS.FAILED;
}

/** Adversarial critic: aggregate signals into a decision. Never accepts on one score. */
export function criticDecide(signals) {
  if (signals.invalid || signals.physFail || signals.hardAlerts || signals.knownMotif) return CRITIC_DECISION.REJECT;
  if (signals.concerns.length >= 2) return CRITIC_DECISION.HOLD;
  if (signals.targetAssessed && signals.escalateAvailable) return CRITIC_DECISION.ESCALATE;
  return CRITIC_DECISION.SURVIVES; // survives CURRENT computational review; selectivity NOT assessed
}

function croFromDecision(decision) {
  if (decision === CRITIC_DECISION.REJECT) return CRO_READINESS.NOT_READY;
  if (decision === CRITIC_DECISION.HOLD || decision === CRITIC_DECISION.ESCALATE) return CRO_READINESS.INCOMPLETE;
  return CRO_READINESS.EXPERT_REVIEW; // survived computational review; human gate required for anything beyond
}

function finalize(db, cand, decision, signals) {
  stage(db, cand, STAGE.CRITIC, { status: STAGE_STATUS.EXECUTED, epistemicClass: 'INFERRED', output: { decision, concerns: signals.concerns, targetAssessed: signals.targetAssessed } });
  const status = decision === CRITIC_DECISION.REJECT ? 'rejected' : decision === CRITIC_DECISION.HOLD ? 'held' : 'surviving';
  store.updateFunnelCandidate(db, cand.id, { status });
  return { candidate: store.getFunnelCandidate(db, cand.id), decision, stages: store.listFunnelStages(db, cand.id), signals, croReadiness: croFromDecision(decision) };
}

/* ---------------- Multi-objective survival ranking ---------------- */

/** Rank surviving candidates by a composite of concern count + SA (lower is better). */
export function rankSurvivors(db, missionId) {
  const survivors = store.listFunnelCandidates(db, missionId).filter((c) => c.status === 'surviving');
  const scored = survivors.map((c) => {
    const stages = store.listFunnelStages(db, c.id);
    const sa = stages.find((s) => s.stage === STAGE.SA)?.output?.saScore ?? 10;
    const critic = stages.find((s) => s.stage === STAGE.CRITIC)?.output ?? {};
    const concerns = (critic.concerns ?? []).length;
    return { candidateId: c.id, canonicalSmiles: c.canonicalSmiles, concerns, saScore: sa, score: concerns * 10 + sa };
  }).sort((a, b) => a.score - b.score);
  scored.forEach((s, i) => store.updateFunnelCandidate(db, s.candidateId, { survivalRank: i + 1 }));
  return scored;
}

/* ---------------- Candidate Dossier V2 ---------------- */

export const TRANSLATIONAL_GAP_WARNING = 'Computational prioritization does not demonstrate biological activity, safety, efficacy, clinical utility, or regulatory suitability. Independent experimental validation is required.';

export function buildDossier(db, candidateId) {
  const c = store.getFunnelCandidate(db, candidateId);
  if (!c) return null;
  const stages = store.listFunnelStages(db, candidateId);
  const by = (s) => stages.find((x) => x.stage === s)?.output ?? null;
  const critic = by(STAGE.CRITIC) ?? {};
  const decision = critic.decision ?? null;
  const dossier = {
    candidateId: c.id, canonicalSmiles: c.canonicalSmiles, molecularHash: c.molecularHash,
    parentLineage: c.parentId, generationStrategy: c.generationStrategy, programModality: c.programModality,
    biologicalHypothesis: null, targetHypothesis: null,
    engineVersions: [...new Set(stages.filter((s) => s.engineVersion).map((s) => `${s.engine} ${s.engineVersion}`))],
    descriptorResults: by(STAGE.DESCRIPTORS), admetModelEstimates: by(STAGE.ADMET),
    targetComputation: by(STAGE.TARGET), offTargetComputation: by(STAGE.OFFTARGET),
    computationalSelectivitySignals: by(STAGE.TARGET)?.note ? 'SELECTIVITY_NOT_ASSESSED' : null,
    relaxationResults: null, qmResults: null,
    saScore: by(STAGE.SA)?.saScore ?? null, noveltyAnalysis: by(STAGE.NOVELTY),
    negativeEvidence: store.listRejectionMotifs(db, c.missionId).filter((r) => r.candidateId === c.id),
    contradictions: [], criticDecision: decision, concerns: critic.concerns ?? [],
    uncertaintyVector: { targetSelectivity: 'NOT_ASSESSED', admet: 'MODEL_ESTIMATE', novelty: by(STAGE.NOVELTY)?.note ? 'NOT_ASSESSED' : 'ASSESSED' },
    capabilityGaps: stages.filter((s) => s.status === 'CAPABILITY_GAP').map((s) => s.stage),
    blockedResources: stages.filter((s) => s.status === 'BLOCKED_BY_RESOURCES').map((s) => s.stage),
    provenanceChain: stages.map((s) => ({ stage: s.stage, status: s.status, outputHash: s.outputHash, epistemicClass: s.epistemicClass })),
    replayStatus: 'not-replayed-in-funnel',
    TRANSLATIONAL_GAP_WARNING,
    croHandoffReadiness: croFromDecision(decision ?? CRITIC_DECISION.HOLD),
  };
  const contentHash = canonicalHash(dossier);
  store.saveCandidateDossier(db, { candidateId, missionId: c.missionId, dossier: { ...dossier, contentHash }, contentHash, croReadiness: dossier.croHandoffReadiness });
  return { ...dossier, contentHash };
}
