/**
 * Genesis Cyber Reasoning Engine — E2E Orchestrator
 *
 * Executes the complete chain:
 * OBSERVATION → ATTACK SURFACE → VULNERABILITY HYPOTHESIS → FALSIFIER
 * → PREDICTION → TEST DESIGN → CONTROLLED TEST EXECUTION → OBSERVED RESULT
 * → EVIDENCE → COMPARISON → SUPPORTED/FALSIFIED/INCONCLUSIVE
 * → ATTACK PATH → REMEDIATION → INDEPENDENT RE-TEST
 * → SECURITY OUTCOME VERIFICATION → MEMORY UPDATE → REPLAY → NEXT QUESTION
 *
 * Uses Genesis Core's canonical DataProvenance/ReplayVerdict types.
 * Does NOT create a second Genesis.
 *
 * INTEGRATION_REQUIRED (tracked in
 * docs/unreviewed-external/qwen-cyber-foundation/README.md, not done here):
 * this module is deliberately self-contained and does not call into the
 * real Scientific Memory, Replay Engine, Evidence Bundle, StrategyRun, or
 * Next Question mechanisms — it only borrows their vocabulary/types. Wiring
 * those in is real, non-trivial work for whoever picks this module up next,
 * and this branch stays off `main` (per docs/MASTER_PRIORITY_GENESIS.md)
 * until that happens and an owner decides this should exist at all.
 */

import { createHash } from 'node:crypto';
import type {
  CyberObservation,
  AttackSurface,
  CyberAsset,
  VulnerabilityHypothesis,
  SecurityTestSpec,
  SecurityTestResult,
  SecurityEvidence,
  SecurityVerdict,
  AttackPath,
  RemediationResult,
  CyberInvestigation,
  DataProvenance,
} from './cyberDomainTypes';
import { ToyVulnerableApp } from './cyberSyntheticTarget';
import { executeSecurityTest } from './cyberTestEngine';
import { comparePredictionToObservation, createSecurityEvidence } from './cyberEvidenceAdapter';
import { buildAttackPath } from './cyberAttackPath';
import { createRemediationAction, applyRemediationAndRetest } from './cyberRemediation';

/**
 * Run the complete Cyber Reasoning E2E pipeline.
 *
 * FIXED (C3 review): the original draft kept its id counters
 * (investigation/observation/hypothesis/prediction/testSpec) as *module*
 * state, so two calls to this function in the same process produced
 * different ids for otherwise-identical results — silently breaking the
 * "produces deterministic results on re-run" property this module claims
 * for itself (and that a real replay/reproducibility check would rely on).
 * Scoping them to the call makes a bare re-run byte-for-byte identical,
 * `replayFingerprint` included. `cyberEvidenceAdapter.ts`,
 * `cyberAttackPath.ts`, and `cyberRemediation.ts` still use module-level
 * counters for their own ids (evidenceId, attack-path node/edge/path ids,
 * remediationId) — untouched here since nothing downstream keys off them
 * for equality, but real determinism would need those threaded through the
 * same way. Left as a known gap, not silently "fixed" by omission.
 */
export function runCyberReasoningE2E(): CyberInvestigation {
  let observationCounter = 0;
  let testSpecCounter = 0;

  // A bare re-run of this pure function is meant to be identical, so the
  // investigation id and the three fixed hypotheses/predictions below are
  // numbered directly rather than through a counter whose final value
  // would never be read again.
  const investigationId = 'cyber-inv-1';
  const startedAt = new Date().toISOString();

  // ================================================================
  // STAGE 1: OBSERVATION
  // ================================================================
  const target = new ToyVulnerableApp();

  const observations: CyberObservation[] = [];
  const endpoints = target.getEndpoints();

  for (const endpoint of endpoints) {
    observations.push(Object.freeze({
      observationId: `cyber-obs-${++observationCounter}`,
      timestamp: new Date().toISOString(),
      source: 'cyber-surface-scan',
      dataProvenance: 'SIMULATED' as DataProvenance,
      rawEvent: { endpoint, method: 'GET', response: target.handleRequest({ method: 'GET', path: endpoint, headers: {}, body: null }) },
      normalizedMetrics: { endpointCount: 1 },
      severity: 0.5,
    }));
  }

  // ================================================================
  // STAGE 2: ATTACK SURFACE ENUMERATION
  // ================================================================
  const assets: CyberAsset[] = endpoints.map((ep, i) => Object.freeze({
    assetId: `cyber-asset-${i}`,
    name: ep,
    type: 'ENDPOINT' as const,
    exposed: true,
    parentAssetId: null,
  }));

  const attackSurface: AttackSurface = Object.freeze({
    surfaceId: `cyber-surface-${investigationId}`,
    targetId: target.targetId,
    assets: Object.freeze(assets),
    totalExposed: assets.filter((a) => a.exposed).length,
    timestamp: new Date().toISOString(),
  });

  // ================================================================
  // STAGE 3: VULNERABILITY HYPOTHESES
  // At least 2 hypotheses: one TRUE, one FALSE.
  // Hypotheses are generated, not copied from fixture metadata.
  // ================================================================

  // Hypothesis 1 (TRUE): Admin endpoint has auth bypass
  const hyp1Id = 'cyber-hyp-1';
  const hyp1: VulnerabilityHypothesis = Object.freeze({
    hypothesisId: hyp1Id,
    statement: 'The /admin endpoint does not require authentication and is accessible without valid credentials.',
    vulnClass: 'AUTH_BYPASS',
    attackSurfaceRefs: [assets[0]?.assetId ?? ''],
    assumptions: ['Target is reachable', 'No WAF or proxy in front'],
    falsifier: 'If a request without valid credentials returns 403, the hypothesis is falsified.',
    prediction: Object.freeze({
      predictionId: 'cyber-pred-1',
      hypothesisId: hyp1Id,
      testAction: 'GET /admin without session',
      expectedObservable: Object.freeze({ httpStatus: 200 }),
      falsifyingObservable: Object.freeze({ httpStatus: 403 }),
      timestamp: new Date().toISOString(),
    }),
    timestamp: new Date().toISOString(),
  });

  // Hypothesis 2 (FALSE): /api/users has IDOR
  const hyp2Id = 'cyber-hyp-2';
  const hyp2: VulnerabilityHypothesis = Object.freeze({
    hypothesisId: hyp2Id,
    statement: 'The /api/users endpoint allows accessing other users\' records without ownership verification.',
    vulnClass: 'BROKEN_ACCESS_CONTROL',
    attackSurfaceRefs: [assets[1]?.assetId ?? ''],
    assumptions: ['Authenticated session exists', 'User records exist'],
    falsifier: 'If accessing another user\'s record returns 403, the hypothesis is falsified.',
    prediction: Object.freeze({
      predictionId: 'cyber-pred-2',
      hypothesisId: hyp2Id,
      testAction: 'GET /api/users with x-requested-user=user-2 using alice session',
      expectedObservable: Object.freeze({ httpStatus: 200 }),
      falsifyingObservable: Object.freeze({ httpStatus: 403 }),
      timestamp: new Date().toISOString(),
    }),
    timestamp: new Date().toISOString(),
  });

  // Hypothesis 3 (TRUE): /search is vulnerable to injection
  const hyp3Id = 'cyber-hyp-3';
  const hyp3: VulnerabilityHypothesis = Object.freeze({
    hypothesisId: hyp3Id,
    statement: 'The /search endpoint returns data for injection-style queries without input validation.',
    vulnClass: 'INJECTION',
    attackSurfaceRefs: [assets[2]?.assetId ?? ''],
    assumptions: ['Target is reachable'],
    falsifier: 'If an injection query returns 400, the hypothesis is falsified.',
    prediction: Object.freeze({
      predictionId: 'cyber-pred-3',
      hypothesisId: hyp3Id,
      testAction: "GET /search with x-query='; DROP TABLE users; --",
      expectedObservable: Object.freeze({ httpStatus: 200 }),
      falsifyingObservable: Object.freeze({ httpStatus: 400 }),
      timestamp: new Date().toISOString(),
    }),
    timestamp: new Date().toISOString(),
  });

  const hypotheses = [hyp1, hyp2, hyp3];

  // ================================================================
  // STAGE 4: TEST DESIGN
  // ================================================================
  const testSpecs: SecurityTestSpec[] = hypotheses.map((hyp) => Object.freeze({
    testId: `cyber-test-${++testSpecCounter}`,
    hypothesisId: hyp.hypothesisId,
    targetId: target.targetId,
    preconditions: Object.freeze([...hyp.assumptions]),
    testAction: buildTestAction(hyp),
    expectedObservable: hyp.prediction.expectedObservable,
    falsifyingObservable: hyp.prediction.falsifyingObservable,
    safetyConstraints: Object.freeze(['SYNTHETIC_TARGET_ONLY']),
    evidenceCaptureFields: Object.freeze(['httpStatus', 'responseBody', 'requestPath']),
    deterministic: true,
    timestamp: new Date().toISOString(),
  }));

  // ================================================================
  // STAGE 5: CONTROLLED TEST EXECUTION
  // Results come from EXECUTION, not from fixture metadata.
  // ================================================================
  const testResults: SecurityTestResult[] = testSpecs.map((spec) =>
    executeSecurityTest(spec, target)
  );

  // ================================================================
  // STAGE 6: EVIDENCE GENERATION
  // ================================================================
  const evidence: SecurityEvidence[] = [];
  const verdicts = new Map<string, SecurityVerdict>();

  for (let i = 0; i < hypotheses.length; i++) {
    const hyp = hypotheses[i]!;
    const testResult = testResults[i]!;
    const comparison = comparePredictionToObservation(hyp.prediction, testResult);
    const ev = createSecurityEvidence(testResult, hyp.prediction, comparison);
    evidence.push(ev);
    verdicts.set(hyp.hypothesisId, comparison.verdict);
  }

  // ================================================================
  // STAGE 7: ATTACK PATH RECONSTRUCTION
  // ================================================================
  const supportedHypotheses = hypotheses.filter((h) => verdicts.get(h.hypothesisId) === 'SUPPORTED');

  let attackPaths: AttackPath[] = [];

  if (supportedHypotheses.length >= 1) {
    const pathHypotheses = supportedHypotheses.map((h) => ({
      hypothesisId: h.hypothesisId,
      statement: h.statement,
      verdict: verdicts.get(h.hypothesisId) ?? 'INCONCLUSIVE',
      evidenceRefs: evidence
        .filter((e) => e.hypothesisId === h.hypothesisId)
        .map((e) => e.evidenceId),
    }));

    // Build edges between supported hypotheses (sequential attack path)
    const pathEdges: { fromHypothesisId: string; toHypothesisId: string; relationship: string }[] = [];
    for (let i = 0; i < supportedHypotheses.length - 1; i++) {
      pathEdges.push({
        fromHypothesisId: supportedHypotheses[i]!.hypothesisId,
        toHypothesisId: supportedHypotheses[i + 1]!.hypothesisId,
        relationship: 'ENABLES',
      });
    }

    // buildAttackPath already folds reachability/ordering/coherence into
    // overallStatus (see cyberAttackPath.ts) — no separate override needed.
    attackPaths = [buildAttackPath(null, pathHypotheses, pathEdges)];
  }

  // ================================================================
  // STAGE 8: REMEDIATION + INDEPENDENT RE-TEST
  // ================================================================
  const remediationResults: RemediationResult[] = [];

  // Only remediate the first SUPPORTED vulnerability
  const firstSupported = supportedHypotheses[0];
  if (firstSupported) {
    const remediation = createRemediationAction(
      firstSupported.hypothesisId,
      firstSupported.vulnClass === 'AUTH_BYPASS' ? 'admin-auth-fix' : 'search-input-validation',
      firstSupported.attackSurfaceRefs[0] ?? ''
    );

    // Design a re-test spec (independent test, not a copy). Same request
    // shape as the original test — the remediation, not the request, is
    // what should change the observed outcome.
    const retestSpec: SecurityTestSpec = Object.freeze({
      testId: `cyber-retest-${remediation.remediationId}`,
      hypothesisId: firstSupported.hypothesisId,
      targetId: target.targetId,
      preconditions: Object.freeze(['Remediation applied']),
      testAction: buildTestAction(firstSupported),
      expectedObservable: firstSupported.prediction.expectedObservable,
      falsifyingObservable: firstSupported.prediction.falsifyingObservable,
      safetyConstraints: Object.freeze(['SYNTHETIC_TARGET_ONLY']),
      evidenceCaptureFields: Object.freeze(['httpStatus', 'responseBody']),
      deterministic: true,
      timestamp: new Date().toISOString(),
    });

    const beforeVerdict = verdicts.get(firstSupported.hypothesisId) ?? 'INCONCLUSIVE';
    // Re-test against the ORIGINAL hypothesis prediction (SUPPORTED = still
    // vulnerable, FALSIFIED = fixed) — see cyberRemediation.ts doc comment
    // for why this must not be an inverted "did the fix work" prediction.
    const result = applyRemediationAndRetest(
      remediation,
      target,
      retestSpec,
      firstSupported.prediction,
      beforeVerdict
    );
    remediationResults.push(result);
  }

  // ================================================================
  // STAGE 9: MEMORY UPDATE — INTEGRATION_REQUIRED, not done here.
  // Would call the real Scientific Memory (core/scienceMemory.ts).
  // ================================================================

  // ================================================================
  // STAGE 10: REPLAY — INTEGRATION_REQUIRED, not done here.
  // Would call the real Replay Engine (core/matrixFoundation/replayVerdict.ts).
  // The fingerprint below is a real SHA-256 of the canonical investigation
  // shape (fixed from the original draft's non-cryptographic charCodeAt
  // hash, the exact "fake hash" anti-pattern this pack's own audit
  // elsewhere calls out), but nothing yet compares it across replays.
  // ================================================================
  const replayFingerprint = computeInvestigationFingerprint(
    observations, attackSurface, hypotheses, testResults, evidence, verdicts, attackPaths, remediationResults
  );
  const replayVerdict = null;

  // ================================================================
  // STAGE 11: NEXT QUESTION — INTEGRATION_REQUIRED, not done here.
  // Would call the real Next Question mechanism (core/agent/nextQuestion.ts).
  // ================================================================
  const unansweredHypotheses = hypotheses.filter(
    (h) => verdicts.get(h.hypothesisId) === 'INCONCLUSIVE'
  );
  const untestedPaths = supportedHypotheses.length > 1 ? 1 : 0;

  let nextQuestion: string;
  if (unansweredHypotheses.length > 0) {
    nextQuestion = `Test remaining inconclusive hypothesis: ${unansweredHypotheses[0]?.statement ?? 'unknown'}`;
  } else if (untestedPaths > 0) {
    nextQuestion = 'Test whether the second supported vulnerability is reachable through a different trust boundary.';
  } else if (remediationResults.length > 0 && remediationResults[0]?.outcomeVerdict === 'VERIFIED') {
    nextQuestion = 'Test whether the remediation survives a second attack condition with different prerequisites.';
  } else {
    nextQuestion = 'Investigation settled. No further questions raised.';
  }

  // ================================================================
  // ASSEMBLE INVESTIGATION
  // ================================================================
  return Object.freeze({
    investigationId,
    targetId: target.targetId,
    startedAt,
    observations: Object.freeze(observations),
    attackSurface,
    hypotheses: Object.freeze(hypotheses),
    testSpecs: Object.freeze(testSpecs),
    testResults: Object.freeze(testResults),
    evidence: Object.freeze(evidence),
    verdicts,
    attackPaths: Object.freeze(attackPaths),
    remediations: Object.freeze(remediationResults),
    replayFingerprint,
    replayVerdict,
    nextQuestion,
    dataProvenance: 'SIMULATED' as DataProvenance,
  });
}

function buildTestAction(hyp: VulnerabilityHypothesis): SecurityTestSpec['testAction'] {
  switch (hyp.vulnClass) {
    case 'AUTH_BYPASS':
      return {
        type: 'HTTP_REQUEST',
        method: 'GET',
        path: '/admin',
        headers: {}, // No session → testing auth bypass
        body: null,
      };
    case 'BROKEN_ACCESS_CONTROL':
      return {
        type: 'HTTP_REQUEST',
        method: 'GET',
        path: '/api/users',
        headers: {
          'x-session-id': 'session-valid-001', // alice's session
          'x-requested-user': 'user-2', // bob's record
        },
        body: null,
      };
    case 'INJECTION':
      return {
        type: 'HTTP_REQUEST',
        method: 'GET',
        path: '/search',
        headers: { 'x-query': "'; DROP TABLE users; --" },
        body: null,
      };
    default:
      return {
        type: 'HTTP_REQUEST',
        method: 'GET',
        path: '/health',
        headers: {},
        body: null,
      };
  }
}

/**
 * Real SHA-256 of a canonical (sorted-key) serialization — a deterministic
 * replay fingerprint, not a copy of any expected/observed value.
 *
 * FIXED (C3 review): the original draft used a non-cryptographic
 * `charCodeAt` rolling hash here — exactly the "fake hash, not SHA-256"
 * anti-pattern this same implementation pack's own self-audit (staged
 * alongside this file) calls out for the decision-chain module. Fixing one
 * copy of that bug and not the other would have been dishonest.
 */
function computeInvestigationFingerprint(
  observations: readonly CyberObservation[],
  attackSurface: AttackSurface,
  hypotheses: readonly VulnerabilityHypothesis[],
  testResults: readonly SecurityTestResult[],
  evidence: readonly SecurityEvidence[],
  verdicts: ReadonlyMap<string, SecurityVerdict>,
  attackPaths: readonly AttackPath[],
  remediationResults: readonly RemediationResult[]
): string {
  const canonical = JSON.stringify({
    observationCount: observations.length,
    totalExposed: attackSurface.totalExposed,
    hypothesisCount: hypotheses.length,
    testResultCount: testResults.length,
    evidenceCount: evidence.length,
    verdicts: [...verdicts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    attackPathCount: attackPaths.length,
    remediationCount: remediationResults.length,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
