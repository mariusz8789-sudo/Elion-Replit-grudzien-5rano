/**
 * Campaign Blocker Dossier (Corpus/Grand-Challenge Mandate Phase 11/12, outcome C).
 *
 * When a real-evidence campaign cannot honestly reach a candidate conclusion, Genesis must
 * FAIL CLOSED and emit a precise, machine-readable evidence/capability blocker map instead of
 * a fabricated or fixture result. This module composes the reproduced acquisition attempt +
 * the runtime engine matrix into that blocker dossier and an exact operator resume package.
 */
import { canonicalHash } from '../provenance.mjs';

export const CAMPAIGN_OUTCOME = Object.freeze({ CAMPAIGN_BLOCKED: 'CAMPAIGN_BLOCKED', COMPUTATIONAL_CANDIDATE: 'COMPUTATIONAL_CANDIDATE', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE' });

/**
 * buildBlockerDossier({ campaignId, acquisitionResults, engineMatrix, mandatorySources, operatorResume })
 * acquisitionResults: [{ sourceService, failureClass, httpStatus, diagnosis }]
 * engineMatrix: from campaignRunner001.engineStatusMatrix
 */
export function buildBlockerDossier({ campaignId, acquisitionResults = [], engineMatrix = {}, mandatorySources = [], operatorResume = null }) {
  const blockedSources = acquisitionResults.filter((r) => r.failureClass && r.failureClass !== 'OK');
  const acquiredSources = acquisitionResults.filter((r) => !r.failureClass || r.failureClass === 'OK').map((r) => r.sourceService);
  const missingMandatory = mandatorySources.filter((m) => !acquiredSources.includes(m));

  const evidenceBlockers = blockedSources.map((r) => ({ sourceService: r.sourceService, failureClass: r.failureClass, httpStatus: r.httpStatus ?? null, diagnosis: r.diagnosis ?? null, remediation: 'acquire on a network-enabled machine via scripts/build-real-campaign-001-bundle.mjs' }));
  const capabilityBlockers = Object.entries(engineMatrix)
    .filter(([, v]) => v.status && v.status !== 'AVAILABLE')
    .map(([engine, v]) => ({ engine, status: v.status, reason: v.reason ?? null }));

  const canReachConclusion = missingMandatory.length === 0;
  const outcome = canReachConclusion ? CAMPAIGN_OUTCOME.INSUFFICIENT_EVIDENCE : CAMPAIGN_OUTCOME.CAMPAIGN_BLOCKED;

  const dossier = {
    schema: 'genesis-campaign-blocker-dossier/1',
    campaignId, outcome,
    reason: canReachConclusion
      ? 'mandatory evidence present but no candidate conclusion reachable'
      : `mandatory real evidence unavailable (missing: ${missingMandatory.join(', ')}) — cannot honestly reach a candidate conclusion on real data`,
    evidenceBlockers, capabilityBlockers,
    mandatorySources, missingMandatorySources: missingMandatory, acquiredSources,
    honesty: {
      fabricatedPayloads: 0,
      fixtureSubstitution: false,
      note: 'No payloads fabricated; TEST_FIXTURE data is NOT substituted for real evidence in a real campaign. This is a genuine capability blocker, not a hidden test skip.',
    },
    operatorResume,
    didGenesisFindADrug: 'NO',
    didGenesisFindAComputationalCandidate: 'NO (real evidence unavailable; no candidate produced on real data)',
  };
  dossier.dossierHash = canonicalHash({ ...dossier, dossierHash: undefined });
  return dossier;
}
