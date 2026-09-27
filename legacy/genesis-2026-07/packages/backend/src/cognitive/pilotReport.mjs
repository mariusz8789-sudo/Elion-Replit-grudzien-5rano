/**
 * Pilot report + analysis comparison (Verification Mandate Mission 4).
 *
 * Pure functions that build a professional, pilot-ready report and a two-analysis
 * comparison ENTIRELY from REAL stored Truth Engine output (the persisted certificate).
 * Nothing is recomputed or fabricated — the report is a faithful projection of what the
 * engine already decided and stored, so what a customer prints is exactly what was hashed.
 *
 * HONESTY: the report states explicitly that GO means only "no encoded deterministic
 * contradiction was established under the supplied structured inputs and encoded checks" —
 * never experimental validation, regulatory approval, or a guarantee the proposal will work.
 */

export const REPORT_SCHEMA = 'zefir-pilot-report/1';

export const LIMITATION_STATEMENT =
  'This is a deterministic pre-flight decision, NOT experimental validation and NOT regulatory ' +
  'approval. GO means only that no encoded deterministic contradiction was established under the ' +
  'supplied structured inputs and the currently encoded checks — it is a NECESSARY, not sufficient, ' +
  'pre-condition and asserts no physical/biological correctness. BLOCK means continuation is not ' +
  'justified under the supplied assumptions and encoded checks, not universal impossibility. ' +
  'Domains reported as capability gaps are explicitly NOT assessed.';

/** Extract the influence of the tenant Necropolis on this decision from stored output. */
function necropolisInfluence(explanation) {
  const findings = Array.isArray(explanation.knownDeadEndSimilarities) ? explanation.knownDeadEndSimilarities : [];
  const influenced = findings.some((f) => f === 'KNOWN_DEAD_END' || f === 'HIGH_FAILURE_SIMILARITY');
  return { influenced, findings };
}

/**
 * Build a pilot-ready report from a STORED analysis (as returned by store.getTruthAnalysis:
 * { id, projectId, proposalHash, decision, decisionHash, certificate, createdAt }).
 */
export function buildReport(stored) {
  if (!stored || !stored.certificate) throw new Error('buildReport requires a stored analysis with a certificate');
  const cert = stored.certificate;
  const e = cert.explanation ?? {};
  return {
    schema: REPORT_SCHEMA,
    projectId: stored.projectId ?? null,
    analysisId: stored.id ?? null,
    analysisDate: stored.createdAt ?? null,
    proposalHash: stored.proposalHash ?? cert.proposalHash ?? null,
    finalDecision: stored.decision ?? e.decision ?? null,
    decisionStrength: e.decisionStrength ?? null,
    decisionHash: stored.decisionHash ?? cert.decisionHash ?? null,
    criticalFailures: e.criticalFailures ?? [],
    missingInformation: e.missingInformation ?? [],
    unresolvedAssumptions: e.unresolvedAssumptions ?? [],
    constraintFindings: e.constraintViolations ?? [],
    dimensionalFindings: e.dimensionalInconsistencies ?? [],
    physicalConstraintViolations: e.physicalConstraintViolations ?? [],
    capabilityGaps: e.capabilityGaps ?? [],
    unsupportedDomains: e.unsupportedDomains ?? [],
    necropolisInfluence: necropolisInfluence(e),
    cheapestFalsification: e.cheapestFalsificationTest ?? null,
    highestValueNextAction: e.highestValueNextExperiment ?? null,
    reasonsToKill: e.reasonsToKill ?? [],
    reasonsNotToKill: e.reasonsNotToKill ?? [],
    enginesExecuted: cert.enginesExecuted ?? [],
    enginesSkipped: cert.enginesSkipped ?? [],
    certificate: { schema: cert.schema ?? null, engineVersions: cert.engineVersions ?? {} },
    limitationStatement: LIMITATION_STATEMENT,
  };
}

/** Set difference on primitive/stringified arrays (order-independent). */
function diffSets(a = [], b = []) {
  const sa = new Set(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
  const sb = new Set(b.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
  return {
    added: [...sb].filter((x) => !sa.has(x)),
    removed: [...sa].filter((x) => !sb.has(x)),
  };
}

/**
 * Compare an EARLIER stored analysis (a) with a LATER one (b). Every field comes from
 * stored output — the comparison invents nothing. Shows whether the decision changed,
 * which findings changed, and whether the tenant Necropolis newly influenced the later run.
 */
export function compareReports(a, b) {
  const ra = buildReport(a); const rb = buildReport(b);
  const stringify = (arr) => (arr ?? []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
  return {
    earlier: { analysisId: ra.analysisId, decision: ra.finalDecision, decisionHash: ra.decisionHash, date: ra.analysisDate },
    later: { analysisId: rb.analysisId, decision: rb.finalDecision, decisionHash: rb.decisionHash, date: rb.analysisDate },
    decisionChanged: ra.finalDecision !== rb.finalDecision,
    decisionHashChanged: ra.decisionHash !== rb.decisionHash,
    from: ra.finalDecision,
    to: rb.finalDecision,
    findingsChanged: {
      criticalFailures: diffSets(stringify(ra.criticalFailures), stringify(rb.criticalFailures)),
      constraintFindings: diffSets(stringify(ra.constraintFindings), stringify(rb.constraintFindings)),
      missingInformation: diffSets(ra.missingInformation, rb.missingInformation),
      capabilityGaps: diffSets(ra.capabilityGaps, rb.capabilityGaps),
      dimensionalFindings: diffSets(ra.dimensionalFindings, rb.dimensionalFindings),
    },
    necropolis: {
      earlierInfluenced: ra.necropolisInfluence.influenced,
      laterInfluenced: rb.necropolisInfluence.influenced,
      newlyInfluenced: !ra.necropolisInfluence.influenced && rb.necropolisInfluence.influenced,
    },
  };
}
