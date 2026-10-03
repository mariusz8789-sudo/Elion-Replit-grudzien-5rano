/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * Canonical candidate -> external-laboratory handoff.
 *
 * This is a thin adapter over the existing computational candidate protocol,
 * preclinical protocol and laboratory closed loop. It creates no second
 * lifecycle, store, Evidence ledger or execution path. Every scientific value
 * is projected from persisted campaign/Science Run records.
 */
import { canonicalHash } from '../provenance.mjs';
import { buildCandidateProtocol } from './candidateProtocol.mjs';
import { buildPreclinicalProtocol } from './preclinicalProtocol.mjs';
import { createLabValidationRequest } from './labClosedLoop.mjs';

export const CANDIDATE_LAB_HANDOFF_KIND = 'GENESIS_CANDIDATE_LAB_HANDOFF';
export const CANDIDATE_LAB_HANDOFF_VERSION = '1.1.0';

const CLAIM_BOUNDARY =
  'COMPUTATIONAL HANDOFF ONLY. Genesis has not synthesised the candidate, run the requested assay, established clinical efficacy or authorised laboratory execution. An external laboratory and accountable human must review and execute any physical work.';

function numericAxes(candidate) {
  const axes = [];
  const docking = candidate?.stages?.docking;
  if (Number.isFinite(docking?.scoreKcalMol)) {
    axes.push({
      axis: 'DOCKING_SCORE_KCAL_MOL',
      value: docking.scoreKcalMol,
      uncertainty: null,
      evidenceClass: 'COMPUTATIONAL',
      outOfDomain: false,
    });
  }

  const endpoints = candidate?.stages?.admet?.keyEndpoints;
  if (endpoints && typeof endpoints === 'object') {
    for (const [name, value] of Object.entries(endpoints).sort(([a], [b]) => a.localeCompare(b))) {
      if (!Number.isFinite(value)) continue;
      axes.push({
        axis: `ADMET_${name}`,
        value,
        uncertainty: null,
        evidenceClass: 'MODEL_ESTIMATE',
        outOfDomain: false,
      });
    }
  }

  const quantum = candidate?.stages?.quantum;
  for (const [axis, value] of [
    ['QUANTUM_ENERGY_HARTREE', quantum?.energyHartree],
    ['HOMO_LUMO_GAP_EV', quantum?.homoLumoGapEv],
    ['DIPOLE_DEBYE', quantum?.dipoleDebye],
  ]) {
    if (!Number.isFinite(value)) continue;
    axes.push({
      axis,
      value,
      uncertainty: null,
      evidenceClass: 'COMPUTATIONAL',
      outOfDomain: false,
    });
  }
  return axes;
}

function wetLabRequests(protocol) {
  return (protocol?.proposedValidationProtocol?.steps ?? []).map((step) => ({
    id: `criterion:${step.criterionId}`,
    assay: step.assay,
    rankIfPassed: 'OBSERVATIONAL',
    whyItRaisesRank: `${step.testsWhat} Falsification criterion: ${step.wouldFalsify}`,
    critical: step.criticalCriterion === true,
  }));
}

function provenanceRefs(protocol, candidateId) {
  const refs = [];
  if (protocol.hypothesis?.preregistrationId) refs.push(`preregistration:${protocol.hypothesis.preregistrationId}`);
  for (const run of protocol.evidence?.scienceRuns ?? []) {
    if (!run.id || !run.outputHash) continue;
    const candidate = protocol.candidates.find((row) => row.candidateId === candidateId);
    const belongs = candidate && Object.values(candidate.stages ?? {}).some((stage) => stage?.runId === run.id || stage?.runIds?.includes(run.id));
    if (belongs) refs.push(`science-run:${run.id}:output-sha256:${run.outputHash}`);
  }
  return refs.sort();
}

function terminalHandoff({ outcome, reason, protocol, candidateId = null, evidenceReplayGate = null }) {
  const body = {
    kind: CANDIDATE_LAB_HANDOFF_KIND,
    contractVersion: CANDIDATE_LAB_HANDOFF_VERSION,
    outcome,
    reason,
    campaignId: protocol.campaignId,
    candidateId,
    computationalProtocolRef: {
      kind: protocol.kind,
      fingerprint: protocol.protocolFingerprint,
    },
    evidenceReplayGate: evidenceReplayGate ?? {
      status: 'NOT_APPLICABLE',
      reason: outcome === 'NO_WINNER' ? 'NO_COMPUTATIONAL_FINALIST' : reason,
      scienceRuns: [],
    },
    requiresHumanApproval: true,
    executionAuthority: 'EXTERNAL_LAB_ONLY',
    claimBoundary: CLAIM_BOUNDARY,
  };
  return { ok: true, handoff: { ...body, handoffFingerprint: canonicalHash(body) } };
}

function candidateScienceRunIds(candidate) {
  return [
    candidate?.stages?.docking?.runId,
    ...(candidate?.stages?.admet?.runIds ?? []),
    candidate?.stages?.quantum?.runId,
  ].filter(Boolean);
}

/**
 * A physical-lab request may reference a computational axis only after that
 * exact Science Run has both a proposal on the canonical Evidence seam and an
 * append-only MATCH verification from the canonical Replay engine.
 */
function buildEvidenceReplayGate(protocol, candidate) {
  const scienceRunIds = candidateScienceRunIds(candidate);
  const evidenceByRun = new Map((protocol.evidence?.proposalLinks ?? []).map((link) => [link.runId, link]));
  const verificationByRun = new Map();
  for (const verification of protocol.replay?.engineVerifications ?? []) {
    verificationByRun.set(verification.runId, verification);
  }
  const scienceRunById = new Map((protocol.evidence?.scienceRuns ?? []).map((run) => [run.id, run]));
  const rows = scienceRunIds.map((runId) => {
    const run = scienceRunById.get(runId) ?? null;
    const evidence = evidenceByRun.get(runId) ?? null;
    const replay = verificationByRun.get(runId) ?? null;
    let status = 'READY';
    let blocker = null;
    if (!evidence) {
      status = 'BLOCKED';
      blocker = 'EVIDENCE_PROPOSAL_MISSING';
    } else if (!replay) {
      status = 'BLOCKED';
      blocker = 'REPLAY_VERIFICATION_MISSING';
    } else if (replay.verdict !== 'MATCH') {
      status = 'BLOCKED';
      blocker = 'REPLAY_NOT_MATCHED';
    }
    return {
      scienceRunId: runId,
      capability: run?.capability ?? null,
      outputHash: run?.outputHash ?? null,
      evidenceProposalId: evidence?.proposalId ?? null,
      evidenceContentHash: evidence?.evidenceContentHash ?? null,
      replayVerificationId: replay?.verificationId ?? null,
      replayVerdict: replay?.verdict ?? null,
      status,
      blocker,
    };
  });
  const blocked = rows.find((row) => row.status !== 'READY');
  return {
    status: scienceRunIds.length > 0 && !blocked ? 'READY' : 'BLOCKED',
    reason: scienceRunIds.length === 0 ? 'NO_COMPUTATIONAL_SCIENCE_RUN' : blocked?.blocker ?? null,
    scienceRuns: rows,
  };
}

/**
 * Pure projection. It prepares the server-derived preclinical protocol but
 * persists nothing. Re-running it after a process restart yields the same
 * preclinical fingerprint while the underlying scientific records are unchanged.
 */
export function prepareCandidateLabHandoff(db, { campaignId, candidateId = null, requiredWetLabId = null } = {}) {
  const built = buildCandidateProtocol(db, campaignId);
  if (!built.ok) return built;
  const protocol = built.protocol;

  if (protocol.finalists.length === 0) {
    const retainedCandidates = protocol.candidates.filter((row) => row.status !== 'rejected');
    const dockingBlocker = (protocol.evidence?.blocked ?? [])
      .find((entry) => entry.stage === 'docking');
    if (retainedCandidates.length > 0) {
      const requestedCandidate = candidateId
        ? retainedCandidates.find((row) => row.candidateId === candidateId)
        : retainedCandidates[0];
      return terminalHandoff({
        outcome: 'BLOCKED',
        reason: requestedCandidate
          ? dockingBlocker?.blocker ?? dockingBlocker?.error ?? 'DOCKING_RESULT_MISSING'
          : 'CANDIDATE_NOT_A_FINALIST',
        protocol,
        candidateId: candidateId ?? requestedCandidate?.candidateId ?? retainedCandidates[0].candidateId,
      });
    }
    return terminalHandoff({
      outcome: 'NO_WINNER',
      reason: 'NO_FINALIST_WITH_DOCKING_RESULT',
      protocol,
      candidateId,
    });
  }

  const finalist = candidateId
    ? protocol.finalists.find((row) => row.candidateId === candidateId)
    : protocol.finalists[0];
  if (!finalist) {
    return terminalHandoff({
      outcome: 'BLOCKED',
      reason: 'CANDIDATE_NOT_A_FINALIST',
      protocol,
      candidateId,
    });
  }

  const candidate = protocol.candidates.find((row) => row.candidateId === finalist.candidateId);
  if (!candidate) return { ok: false, error: 'candidate_projection_missing' };

  const axes = numericAxes(candidate);
  if (axes.length === 0) {
    return terminalHandoff({
      outcome: 'BLOCKED',
      reason: 'NO_COMPUTATIONAL_AXIS_AVAILABLE',
      protocol,
      candidateId: finalist.candidateId,
    });
  }

  const evidenceReplayGate = buildEvidenceReplayGate(protocol, candidate);
  if (evidenceReplayGate.status !== 'READY') {
    return terminalHandoff({
      outcome: 'BLOCKED',
      reason: evidenceReplayGate.reason,
      protocol,
      candidateId: finalist.candidateId,
      evidenceReplayGate,
    });
  }

  const wetLab = wetLabRequests(protocol);
  if (wetLab.length === 0) {
    return terminalHandoff({
      outcome: 'BLOCKED',
      reason: 'NO_PREREGISTERED_PHYSICAL_VALIDATION_STEP',
      protocol,
      candidateId: finalist.candidateId,
    });
  }

  const selected = requiredWetLabId
    ? wetLab.find((entry) => entry.id === requiredWetLabId)
    : wetLab.find((entry) => entry.critical) ?? wetLab[0];
  if (!selected) {
    return terminalHandoff({
      outcome: 'BLOCKED',
      reason: 'REQUIRED_WETLAB_ASSAY_NOT_FOUND',
      protocol,
      candidateId: finalist.candidateId,
    });
  }

  const preclinical = buildPreclinicalProtocol({
    candidateId: finalist.candidateId,
    canonicalSmiles: finalist.canonicalSmiles,
    scaffold: null,
    axes,
    falsificationSurvived: [],
    falsificationOpen: wetLab.map((entry) => entry.id),
    noveltyStatus: 'PRIOR_ART_UNVERIFIED',
    requiredWetLab: wetLab.map((entry) => ({
      id: entry.id,
      assay: entry.assay,
      rankIfPassed: entry.rankIfPassed,
      whyItRaisesRank: entry.whyItRaisesRank,
    })),
    provenance: provenanceRefs(protocol, finalist.candidateId),
  });
  if (!preclinical.ok) return { ok: false, error: preclinical.code, detail: preclinical.detail };

  return {
    ok: true,
    prepared: {
      protocol,
      finalist,
      candidate,
      preclinicalProtocol: preclinical.protocol,
      selectedWetLab: selected,
      evidenceReplayGate,
    },
  };
}

/**
 * Persists the handoff through the existing LAB_VALIDATION_REQUESTED campaign
 * event. A blocked research gate creates an explicit draft; it never fabricates
 * approval or an observation.
 */
export function createCanonicalCandidateLabHandoff(db, {
  campaignId,
  candidateId = null,
  requiredWetLabId = null,
  externalProvider = null,
  requestedBy = null,
} = {}) {
  const prepared = prepareCandidateLabHandoff(db, { campaignId, candidateId, requiredWetLabId });
  if (!prepared.ok || prepared.handoff) return prepared;

  const {
    protocol,
    finalist,
    preclinicalProtocol,
    selectedWetLab,
    evidenceReplayGate,
  } = prepared.prepared;

  const requested = createLabValidationRequest(db, {
    campaignId,
    candidateId: finalist.candidateId,
    objective: `External validation of ${finalist.candidateId}: ${selectedWetLab.assay}`,
    endpointPlan: [{
      endpointId: selectedWetLab.id,
      rationale: selectedWetLab.whyItRaisesRank,
    }],
    requestedBy,
    externalProvider,
    preregistrationRef: protocol.hypothesis?.preregistrationId ?? null,
    preclinicalProtocol,
    requiredWetLabId: selectedWetLab.id,
    computationalEvidence: evidenceReplayGate,
  });
  if (!requested.ok) return requested;

  const outcome = requested.request.status === 'READY_FOR_EXTERNAL_LAB_REVIEW'
    ? 'LAB_HANDOFF_READY'
    : 'BLOCKED';
  const reason = outcome === 'LAB_HANDOFF_READY'
    ? 'EXTERNAL_LAB_AND_HUMAN_APPROVAL_REQUIRED'
    : requested.request.researchGate?.reason ?? 'RESEARCH_GATE_BLOCKED';
  const fingerprintBody = {
    kind: CANDIDATE_LAB_HANDOFF_KIND,
    contractVersion: CANDIDATE_LAB_HANDOFF_VERSION,
    campaignId,
    candidateId: finalist.candidateId,
    preclinicalProtocolFingerprint: preclinicalProtocol.protocolFingerprint,
    validationRequestFingerprint: requested.request.requestFingerprint,
    outcome,
    reason,
  };

  return {
    ok: true,
    deduped: requested.deduped,
    eventId: requested.eventId,
    handoff: {
      ...fingerprintBody,
      computationalProtocolRef: {
        kind: protocol.kind,
        fingerprint: protocol.protocolFingerprint,
        preregistrationId: protocol.hypothesis?.preregistrationId ?? null,
      },
      preclinicalProtocol,
      validationRequest: requested.request,
      evidenceReplayGate,
      requiresHumanApproval: true,
      executionAuthority: 'EXTERNAL_LAB_ONLY',
      scientificTruth: {
        candidateIdentity: finalist.canonicalSmiles,
        dockingScoreKcalMol: finalist.scoreKcalMol,
        scoreIsMeasurement: false,
        physicalAssayExecuted: false,
        clinicalEfficacy: 'UNKNOWN',
        synthesisRouteStatus: protocol.synthesis?.status ?? null,
      },
      claimBoundary: CLAIM_BOUNDARY,
      handoffFingerprint: canonicalHash(fingerprintBody),
    },
  };
}
