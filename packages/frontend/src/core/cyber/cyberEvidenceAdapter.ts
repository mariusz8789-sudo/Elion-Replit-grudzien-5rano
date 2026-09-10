/**
 * Genesis Cyber Reasoning Engine — Evidence Adapter
 *
 * Maps cyber test results to Genesis Evidence semantics.
 *
 * MODEL_GENERATED never becomes REAL_EXPERIMENTAL or REFERENCE by mutation
 * — this adapter only ever reads `dataProvenance` off the test result it is
 * given (itself always 'SIMULATED' for this synthetic target); it never
 * writes or upgrades it.
 *
 * INTEGRATION_REQUIRED (see docs/unreviewed-external/qwen-cyber-foundation/README.md):
 * to become a real Genesis Evidence record instead of this domain-local
 * shape, this needs to go through the real Evidence Bundle contract in
 * `experimentFabric/evidencePack.ts`.
 */

import type {
  SecurityTestResult,
  SecurityEvidence,
  ComparisonResult,
  MetricComparison,
  SecurityVerdict,
  CyberPrediction,
} from './cyberDomainTypes';

let evidenceCounter = 0;

/**
 * Compare prediction vs observed result.
 * Produces a verdict through explicit comparison, NOT fixture metadata.
 */
export function comparePredictionToObservation(
  prediction: CyberPrediction,
  testResult: SecurityTestResult
): ComparisonResult {
  if (testResult.error) {
    return {
      predictionMatchesObservation: false,
      falsifierTriggered: false,
      verdict: 'BLOCKED',
      reasoning: `Test execution failed: ${testResult.error}`,
      metricComparisons: [],
    };
  }

  const observed = testResult.observedResult;
  const expected = prediction.expectedObservable;
  const falsifying = prediction.falsifyingObservable;

  const metricComparisons: MetricComparison[] = [];
  let allExpectedMatch = true;
  let anyFalsifierTriggered = false;

  // Compare each expected field
  for (const [key, expectedValue] of Object.entries(expected)) {
    const observedValue = observed[key];
    const matches = deepEqual(expectedValue, observedValue);
    metricComparisons.push({
      fieldName: key,
      predictedValue: expectedValue,
      observedValue,
      matches,
    });
    if (!matches) allExpectedMatch = false;
  }

  // Check falsifier conditions
  for (const [key, falsifyingValue] of Object.entries(falsifying)) {
    const observedValue = observed[key];
    const triggered = deepEqual(falsifyingValue, observedValue);
    if (triggered) anyFalsifierTriggered = true;
  }

  let verdict: SecurityVerdict;
  let reasoning: string;

  if (anyFalsifierTriggered) {
    verdict = 'FALSIFIED';
    reasoning = 'Falsifying condition observed: prediction is contradicted by evidence.';
  } else if (allExpectedMatch && metricComparisons.length > 0) {
    verdict = 'SUPPORTED';
    reasoning = 'All predicted observables matched. Hypothesis survives this test.';
  } else if (metricComparisons.length === 0) {
    verdict = 'INCONCLUSIVE';
    reasoning = 'No observable fields to compare.';
  } else {
    verdict = 'INCONCLUSIVE';
    reasoning = 'Partial match: some predictions matched, some did not. Insufficient to conclude.';
  }

  return {
    predictionMatchesObservation: allExpectedMatch,
    falsifierTriggered: anyFalsifierTriggered,
    verdict,
    reasoning,
    metricComparisons,
  };
}

/**
 * Create SecurityEvidence from test result and comparison.
 * Evidence provenance reflects the actual data source.
 * MODEL_GENERATED claims do NOT become REFERENCE or REAL_EXPERIMENTAL.
 */
export function createSecurityEvidence(
  testResult: SecurityTestResult,
  prediction: CyberPrediction,
  comparison: ComparisonResult
): SecurityEvidence {
  return Object.freeze({
    evidenceId: `cyber-ev-${++evidenceCounter}`,
    testId: testResult.testId,
    hypothesisId: testResult.hypothesisId,
    observation: Object.freeze({ ...testResult.observedResult }),
    prediction: Object.freeze({ ...prediction.expectedObservable }),
    comparison,
    // Provenance comes from the test execution, not from mutation.
    // Synthetic execution = SIMULATED. This is correct and honest.
    dataProvenance: testResult.dataProvenance,
    source: `cyberTestEngine:${testResult.testId}`,
    timestamp: new Date().toISOString(),
  });
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }
  return false;
}
