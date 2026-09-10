/**
 * Genesis Cyber Reasoning Engine — Controlled Test Execution
 *
 * Executes security tests against the synthetic fixture.
 * Produces REAL observed results through execution.
 * Does NOT copy expected results. Does NOT read fixture metadata.
 *
 * Safety: operates ONLY against ToyVulnerableApp. No real targets.
 */

import type {
  SecurityTestSpec,
  SecurityTestResult,
} from './cyberDomainTypes';
import { type ToyVulnerableApp, type ToyRequest } from './cyberSyntheticTarget';

export function executeSecurityTest(
  testSpec: SecurityTestSpec,
  target: ToyVulnerableApp
): SecurityTestResult {
  const startTime = Date.now();

  try {
    // Validate safety constraints
    if (!testSpec.safetyConstraints.every((c) => c === 'SYNTHETIC_TARGET_ONLY')) {
      return {
        testId: testSpec.testId,
        hypothesisId: testSpec.hypothesisId,
        executedAt: new Date().toISOString(),
        observedResult: {},
        executionDurationMs: Date.now() - startTime,
        dataProvenance: 'SIMULATED',
        error: 'BLOCKED: safety constraint violation — only synthetic targets allowed',
      };
    }

    // Build the actual request from the test action
    const request: ToyRequest = {
      method: testSpec.testAction.method,
      path: testSpec.testAction.path,
      headers: testSpec.testAction.headers,
      body: testSpec.testAction.body,
    };

    // EXECUTE against the toy app — this produces a REAL observed result
    const response = target.handleRequest(request);

    // Capture the observed result
    const observedResult: Record<string, unknown> = {
      httpStatus: response.status,
      responseBody: response.body,
      responseHeaders: response.headers,
      requestPath: request.path,
      requestMethod: request.method,
    };

    // Capture additional evidence fields if specified
    for (const field of testSpec.evidenceCaptureFields) {
      if (field === 'targetState') {
        observedResult['targetState'] = target.getState();
      }
    }

    return {
      testId: testSpec.testId,
      hypothesisId: testSpec.hypothesisId,
      executedAt: new Date().toISOString(),
      observedResult,
      executionDurationMs: Date.now() - startTime,
      dataProvenance: 'SIMULATED', // Synthetic execution = SIMULATED provenance
      error: null,
    };
  } catch (err) {
    return {
      testId: testSpec.testId,
      hypothesisId: testSpec.hypothesisId,
      executedAt: new Date().toISOString(),
      observedResult: {},
      executionDurationMs: Date.now() - startTime,
      dataProvenance: 'SIMULATED',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
