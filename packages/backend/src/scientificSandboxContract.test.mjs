import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCIENTIFIC_SANDBOX_POLICY,
  admitCurrentScientificSandbox,
  buildSandboxExecutionPlan,
  createScientificSandboxPort,
  validateSandboxRequest,
} from './compute/scientificSandboxContract.mjs';

const REF = {
  artifactId: 'artifact:' + 'a'.repeat(64),
  sha256: 'a'.repeat(64),
  allowlisted: true,
};
const REQUEST = {
  sandboxRunId: 'sandbox-run-001',
  researchRunId: 'research-run-001',
  experimentId: 'experiment-001',
  language: 'python',
  source: 'print(2 + 2)',
  datasetRefs: [REF],
};
const IMAGE = 'registry.example/genesis-python@sha256:' + 'b'.repeat(64);

const COMPLETE_ATTESTATION = {
  containerIsolation: true,
  networkDenyByDefault: true,
  noHostFilesystem: true,
  noSecrets: true,
  readOnlyRoot: true,
  packageAllowlist: true,
  cpuLimit: true,
  memoryLimit: true,
  wallClockLimit: true,
  processLimit: true,
  outputLimit: true,
};

describe('scientific sandbox request and plan', () => {
  it('admits Python only and forbids caller-controlled packages, commands, secrets and environment', () => {
    assert.equal(validateSandboxRequest(REQUEST).ok, true);
    assert.equal(validateSandboxRequest({ ...REQUEST, language: 'bash' }).ok, false);
    assert.equal(validateSandboxRequest({ ...REQUEST, packages: ['requests'] }).ok, false);
    assert.equal(validateSandboxRequest({ ...REQUEST, command: 'sh' }).ok, false);
    assert.equal(validateSandboxRequest({ ...REQUEST, secrets: { token: 'x' } }).ok, false);
  });

  it('requires every dataset to be an allowlisted immutable ArtifactRef', () => {
    assert.equal(validateSandboxRequest({ ...REQUEST, datasetRefs: [{ ...REF, allowlisted: false }] }).ok, false);
    assert.equal(validateSandboxRequest({ ...REQUEST, datasetRefs: [{ artifactId: 'dataset-1', allowlisted: true }] }).ok, false);
    assert.equal(validateSandboxRequest({ ...REQUEST, datasetRefs: [{ ...REF, sha256: 'b'.repeat(64) }] }).ok, false);
  });

  it('requires an immutable image digest and creates deterministic environment identity', () => {
    assert.equal(buildSandboxExecutionPlan(REQUEST, { image: 'python:latest' }).ok, false);
    const first = buildSandboxExecutionPlan(REQUEST, { image: IMAGE });
    const second = buildSandboxExecutionPlan(REQUEST, { image: IMAGE });
    assert.equal(first.ok, true);
    assert.equal(first.plan.environmentFingerprint, second.plan.environmentFingerprint);
    assert.match(first.plan.environmentFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(first.plan.invocation.shell, false);
    assert.equal(first.plan.invocation.network, 'none');
    assert.equal(first.plan.invocation.readOnlyRoot, true);
    assert.deepEqual(first.plan.invocation.mounts, []);
    assert.equal(first.plan.policy.packagePolicy, 'PINNED_IN_IMAGE_ONLY');
  });

  it('freezes all required resource and output limits', () => {
    assert.equal(SCIENTIFIC_SANDBOX_POLICY.cpuLimit, 1);
    assert.equal(SCIENTIFIC_SANDBOX_POLICY.memoryMb, 1024);
    assert.equal(SCIENTIFIC_SANDBOX_POLICY.wallClockMs, 120_000);
    assert.equal(SCIENTIFIC_SANDBOX_POLICY.processLimit, 32);
    assert.equal(SCIENTIFIC_SANDBOX_POLICY.network, 'DENY_ALL');
    assert.equal(SCIENTIFIC_SANDBOX_POLICY.secrets, 'NONE');
  });
});

describe('scientific sandbox backend admission', () => {
  it('refuses a backend missing any required isolation attestation', async () => {
    let executed = false;
    const port = createScientificSandboxPort({
      backend: {
        attest: async () => ({ ...COMPLETE_ATTESTATION, networkDenyByDefault: false }),
        execute: async () => { executed = true; return { ok: true }; },
      },
    });
    const out = await port.execute(REQUEST, { image: IMAGE });
    assert.equal(out.ok, false);
    assert.equal(out.failureCode, 'SANDBOX_ISOLATION_INCOMPLETE');
    assert.deepEqual(out.missing, ['networkDenyByDefault']);
    assert.equal(executed, false);
  });

  it('passes only the frozen plan to an attested backend', async () => {
    let received = null;
    const port = createScientificSandboxPort({
      backend: {
        attest: async () => COMPLETE_ATTESTATION,
        execute: async (plan) => { received = plan; return { ok: true, status: 'SUCCESS', environmentFingerprint: plan.environmentFingerprint }; },
      },
    });
    const out = await port.execute(REQUEST, { image: IMAGE });
    assert.equal(out.ok, true);
    assert.equal(received.source, undefined);
    assert.equal(received.sourceStdin, REQUEST.source);
    assert.equal(received.invocation.shell, false);
    assert.equal(out.environmentFingerprint, received.environmentFingerprint);
  });

  it('keeps the current product blocked until a real container backend is configured', () => {
    assert.deepEqual(admitCurrentScientificSandbox(), {
      ok: false,
      status: 'BLOCKED_BY_CONFIGURATION',
      failureCode: 'CONTAINER_SANDBOX_BACKEND_NOT_CONFIGURED',
    });
  });
});
