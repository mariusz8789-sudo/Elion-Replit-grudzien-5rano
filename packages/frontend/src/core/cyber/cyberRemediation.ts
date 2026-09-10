/**
 * Genesis Cyber Reasoning Engine — Remediation & Independent Re-test
 *
 * Does NOT trust the remediation action itself.
 * Runs an INDEPENDENT second test after remediation.
 * Compares BEFORE vs AFTER through real execution.
 */

import type {
  RemediationAction,
  RemediationResult,
  SecurityTestSpec,
  SecurityVerdict,
} from './cyberDomainTypes';
import type { ToyVulnerableApp } from './cyberSyntheticTarget';
import { executeSecurityTest } from './cyberTestEngine';
import { comparePredictionToObservation } from './cyberEvidenceAdapter';
import type { CyberPrediction } from './cyberDomainTypes';

let remediationCounter = 0;

export function createRemediationAction(
  hypothesisId: string,
  action: string,
  targetComponent: string
): RemediationAction {
  return Object.freeze({
    remediationId: `rem-${++remediationCounter}`,
    vulnerabilityHypothesisId: hypothesisId,
    action,
    targetComponent,
    appliedAt: new Date().toISOString(),
    appliedBy: 'genesis-cyber-engine',
  });
}

/**
 * Apply remediation and independently re-test.
 *
 * The re-test is a NEW test execution, not a copy of the original.
 * The verdict comes from comparing the re-test's observed result
 * to the ORIGINAL vulnerability hypothesis's own prediction — i.e. "does
 * the claim that this is exploitable still hold?" SUPPORTED there means
 * the vulnerability is still exploitable (bad); FALSIFIED means it no
 * longer is (the fix worked).
 *
 * FIXED (C3 review), two bugs:
 * 1. The original draft built a separate, inverted "post-remediation"
 *    prediction (expecting 403 = fixed, treating 200 as its falsifier) and
 *    passed that to this same before/after switch below. That switch's
 *    cases assume the opposite convention throughout (SUPPORTED = still
 *    vulnerable, FALSIFIED = fixed) — so a successful fix that flips the
 *    observed status from 200 to 403 came out SUPPORTED under the inverted
 *    prediction and was reported as `FAILED`, the exact opposite of what
 *    happened. Reusing the hypothesis's own original prediction for the
 *    re-test keeps one consistent convention end to end.
 * 2. This function applied `remediation.remediationId` (an opaque counter
 *    id like `rem-1`) to the target. `ToyVulnerableApp` keys its fix checks
 *    off the semantic action name instead (e.g. `'admin-auth-fix'`, stored
 *    in `remediation.action`) — so the "fix" never actually took effect and
 *    the re-test observed the still-vulnerable response. Caught by actually
 *    running the E2E test, not by reading the code: the verdict-inversion
 *    fix alone still failed the same assertion for a different reason.
 */
export function applyRemediationAndRetest(
  remediation: RemediationAction,
  target: ToyVulnerableApp,
  retestSpec: SecurityTestSpec,
  originalHypothesisPrediction: CyberPrediction,
  beforeVerdict: SecurityVerdict
): RemediationResult {
  // Step 1: Apply the remediation to the target. The target keys its fix
  // checks off the semantic action name (`remediation.action`), not the
  // opaque tracking id (`remediation.remediationId`).
  target.applyRemediation(remediation.action);

  // Step 2: Execute an INDEPENDENT re-test
  // This is a real execution, not a metadata read.
  const retestResult = executeSecurityTest(retestSpec, target);

  // Step 3: Compare re-test observation to the ORIGINAL vulnerability
  // prediction (same convention as `beforeVerdict`, not an inverted one).
  const retestComparison = comparePredictionToObservation(
    originalHypothesisPrediction,
    retestResult
  );

  const afterVerdict = retestComparison.verdict;

  // Step 4: Determine outcome verdict
  let outcomeVerdict: RemediationResult['outcomeVerdict'];
  let analysis: string;

  if (beforeVerdict === 'SUPPORTED' && afterVerdict === 'FALSIFIED') {
    // Vulnerability was exploitable before, not exploitable after → remediation worked
    outcomeVerdict = 'VERIFIED';
    analysis = 'Vulnerability was exploitable before remediation. ' +
      'Independent re-test confirms vulnerability is no longer exploitable. ' +
      'Remediation is VERIFIED.';
  } else if (beforeVerdict === 'SUPPORTED' && afterVerdict === 'SUPPORTED') {
    // Vulnerability still exploitable after remediation → remediation failed
    outcomeVerdict = 'FAILED';
    analysis = 'Vulnerability was exploitable before remediation. ' +
      'Independent re-test shows vulnerability is STILL exploitable. ' +
      'Remediation FAILED. Do NOT mark as successful.';
  } else if (beforeVerdict === 'SUPPORTED' && afterVerdict === 'INCONCLUSIVE') {
    outcomeVerdict = 'DRIFT';
    analysis = 'Vulnerability was exploitable before. ' +
      'Re-test result is inconclusive. Review required.';
  } else if (beforeVerdict !== 'SUPPORTED') {
    outcomeVerdict = 'BLOCKED';
    analysis = 'Vulnerability was not confirmed exploitable before remediation. ' +
      'Cannot verify remediation effectiveness.';
  } else {
    outcomeVerdict = 'BLOCKED';
    analysis = 'Insufficient data to determine remediation outcome.';
  }

  return Object.freeze({
    remediationId: remediation.remediationId,
    retestResult,
    beforeVerdict,
    afterVerdict,
    outcomeVerdict,
    analysis,
    timestamp: new Date().toISOString(),
  });
}
