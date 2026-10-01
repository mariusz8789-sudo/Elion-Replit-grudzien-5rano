/**
 * BYT — the read model of Genesis' scientific self.
 *
 * This module owns no persistence. It projects verified ResearchRun event chains, the existing
 * knowledge registry and ENTITY-1 Self Model into one view. Deleting it loses no scientific state.
 * A broken run contributes an integrity failure, never predictions, calibration or Necropolis rows.
 */
export const BYT_PROJECTION_SCHEMA_VERSION = 1;
const CANONICAL_RESEARCH_RUN_DOMAIN = 'genesis.research-run';

export const BYT_EPISTEMIC_STATES = Object.freeze([
  'KNOWN', 'SUPPORTED', 'INFERRED', 'SIMULATED', 'ASSUMED', 'UNKNOWN', 'CONTRADICTED', 'UNVERIFIED',
]);

const lastByExperiment = (events, type, experimentId) => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === type && event.payload?.experimentId === experimentId) return event.payload;
  }
  return null;
};

function predictionEntries(runs) {
  const out = [];
  for (const item of runs) {
    if (item.run?.domain !== CANONICAL_RESEARCH_RUN_DOMAIN || !item.integrity?.ok) continue;
    const events = item.researchStateEvents ?? [];
    for (const event of events) {
      if (event.type !== 'PREDICTIONS_FROZEN' || !event.payload?.experimentId) continue;
      const frozen = event.payload;
      const execution = lastByExperiment(events, 'EXPERIMENT_HANDOFF', frozen.experimentId);
      const falsification = lastByExperiment(events, 'SELF_FALSIFICATION', frozen.experimentId);
      const evidence = lastByExperiment(events, 'EVIDENCE_UPDATE', frozen.experimentId);
      const next = lastByExperiment(events, 'NEXT_EXPERIMENT', frozen.experimentId);
      const criteria = (falsification?.criteria ?? frozen.criteria ?? []).map((criterion) => ({
        criterionId: criterion.id,
        observable: criterion.observable ?? null,
        operator: criterion.operator ?? null,
        predictedValue: criterion.value ?? criterion.threshold ?? null,
        observedValue: criterion.observed ?? null,
        critical: criterion.critical !== false,
        status: criterion.status ?? 'FROZEN',
        numericThresholdDelta: typeof criterion.observed === 'number' && typeof (criterion.value ?? criterion.threshold) === 'number'
          ? criterion.observed - (criterion.value ?? criterion.threshold)
          : null,
      }));
      out.push({
        researchRunId: frozen.researchRunId ?? item.run.id,
        experimentId: frozen.experimentId,
        hypothesisId: frozen.hypothesisId ?? null,
        claim: frozen.claim ?? null,
        engineId: frozen.engineId ?? execution?.engine?.engineId ?? null,
        frozenAtEvent: event.seq,
        predictionFingerprint: frozen.predictionFingerprint ?? null,
        preregistrationFingerprint: frozen.preregistrationFingerprint ?? null,
        preregistrationRecordRef: frozen.preregistrationRecordId ? `experiment_record:${frozen.preregistrationRecordId}` : null,
        inputHash: execution?.inputHash ?? frozen.inputHash ?? null,
        outputHash: execution?.outputHash ?? null,
        executionStatus: execution?.status ?? 'NOT_EXECUTED',
        verdict: falsification?.verdict ?? 'UNVERIFIED',
        verdictScope: falsification?.scope ?? null,
        criteria,
        evidence: evidence ? {
          status: evidence.status ?? 'PROPOSED',
          proposalId: evidence.evidenceProposalId ?? null,
          contentHash: evidence.evidenceContentHash ?? null,
          publication: evidence.publication ?? null,
          sealRecordRef: evidence.sealRecordId ? `experiment_record:${evidence.sealRecordId}` : null,
        } : null,
        replay: next?.replay ?? null,
        proposedNextExperiment: next?.proposal ?? null,
        decisionTrace: next?.decisionTrace ?? null,
      });
    }
  }
  return out;
}

function calibrationOf(entries) {
  const evaluated = entries.flatMap((entry) => entry.criteria.map((criterion) => ({ engineId: entry.engineId ?? 'unknown', ...criterion })))
    .filter((criterion) => ['MET', 'NOT_MET', 'UNRESOLVED'].includes(criterion.status));
  const count = (status) => evaluated.filter((criterion) => criterion.status === status).length;
  const decided = count('MET') + count('NOT_MET');
  const byEngine = [...new Set(evaluated.map((criterion) => criterion.engineId))].sort().map((engineId) => {
    const rows = evaluated.filter((criterion) => criterion.engineId === engineId);
    const met = rows.filter((criterion) => criterion.status === 'MET').length;
    const notMet = rows.filter((criterion) => criterion.status === 'NOT_MET').length;
    return { engineId, evaluated: rows.length, met, notMet, unresolved: rows.length - met - notMet };
  });
  return {
    status: evaluated.length ? 'PARTIAL' : 'NOT_AVAILABLE',
    protocolCriteria: { evaluated: evaluated.length, met: count('MET'), notMet: count('NOT_MET'), unresolved: count('UNRESOLVED') },
    protocolCriterionAgreementRate: decided ? count('MET') / decided : null,
    probabilisticCalibration: 'NOT_AVAILABLE',
    limitation: 'ResearchRun freezes threshold criteria, not a universal probability or X ± Y interval. Threshold agreement is not probabilistic calibration.',
    byEngine,
  };
}

function necropolisOf(entries) {
  return entries.filter((entry) => entry.verdict === 'FALSIFIED_WITHIN_PROTOCOL').map((entry) => ({
    necropolisId: `necropolis:${entry.researchRunId}:${entry.experimentId}`,
    researchRunId: entry.researchRunId,
    experimentId: entry.experimentId,
    hypothesisId: entry.hypothesisId,
    claim: entry.claim,
    status: 'FALSIFIED_WITHIN_PROTOCOL',
    scope: entry.verdictScope,
    failedCriteria: entry.criteria.filter((criterion) => criterion.status === 'NOT_MET').map((criterion) => criterion.criterionId),
    predictionFingerprint: entry.predictionFingerprint,
    outputHash: entry.outputHash,
    evidence: entry.evidence,
    reopening: 'REQUIRES_NEW_EVIDENCE_AND_HUMAN_APPROVAL',
  }));
}

export function buildBytProjection({ runs = [], registry = null, selfModel = null } = {}) {
  const canonicalRuns = runs.filter((item) => item.run?.domain === CANONICAL_RESEARCH_RUN_DOMAIN);
  const predictionLedger = predictionEntries(canonicalRuns);
  const registryValid = registry?.chain?.ok === true;
  const gaps = registryValid ? registry.gaps ?? [] : null;
  const contradictions = registryValid ? registry.contradictions ?? [] : null;
  const runIntegrity = canonicalRuns.map((item) => ({
    researchRunId: item.run.id,
    ok: item.integrity?.ok === true,
    ...(item.integrity?.ok ? { head: item.integrity.head, events: item.integrity.events } : { reason: item.integrity?.reason ?? 'STATE_INTEGRITY_FAILURE', brokenAt: item.integrity?.brokenAt ?? null }),
  }));
  return {
    schemaVersion: BYT_PROJECTION_SCHEMA_VERSION,
    view: 'DERIVED_FROM_CANONICAL_STATE',
    identity: selfModel?.identity ?? null,
    epistemicVocabulary: BYT_EPISTEMIC_STATES,
    continuity: {
      researchRuns: canonicalRuns.length,
      verifiedRuns: runIntegrity.filter((item) => item.ok).length,
      brokenRuns: runIntegrity.filter((item) => !item.ok).length,
    },
    knowledgeState: registryValid ? {
      openGaps: gaps.filter((gap) => gap.status === 'OPEN').length,
      unresolvedContradictions: contradictions.filter((item) => item.status === 'UNRESOLVED').length,
      proposedClaims: (registry.claims ?? []).filter((claim) => claim.status === 'PROPOSED').length,
    } : { status: 'UNKNOWN', reason: 'STATE_INTEGRITY_FAILURE' },
    capabilities: selfModel ? {
      availableNow: [...(selfModel.availableEngines ?? [])],
      blocked: [...(selfModel.blockedEngines ?? [])],
      missing: [...(selfModel.missingCapabilities ?? [])],
    } : { status: 'UNKNOWN', reason: 'SELF_MODEL_UNAVAILABLE' },
    predictionLedger,
    calibration: calibrationOf(predictionLedger),
    necropolis: necropolisOf(predictionLedger),
    surprise: {
      status: 'PARTIAL',
      detected: [],
      limitation: 'No canonical backend SURPRISE_DETECTED event is persisted yet; falsification alone is not relabelled as surprise.',
    },
    integrity: { researchRuns: runIntegrity, knowledgeRegistry: registry?.chain ?? { ok: false, reason: 'UNAVAILABLE' } },
  };
}
