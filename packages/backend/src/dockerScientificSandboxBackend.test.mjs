import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createDockerScientificSandboxBackend } from './compute/dockerScientificSandboxBackend.mjs';
import { buildSandboxExecutionPlan, createScientificSandboxPort } from './compute/scientificSandboxContract.mjs';

const IMAGE = 'registry.example/genesis-python@sha256:' + 'b'.repeat(64);
const request = (datasetRefs = []) => ({
  sandboxRunId: 'sandbox-run-001',
  researchRunId: 'research-run-001',
  experimentId: 'experiment-001',
  language: 'python',
  source: 'print(2 + 2)',
  datasetRefs,
});

describe('Docker scientific sandbox backend', () => {
  test('executes Python with the complete isolation envelope and hashes captured output', async () => {
    const calls = [];
    const processRunner = async (executable, args, options) => {
      calls.push({ executable, args, options });
      if (args[0] === 'version') return { exitCode: 0, stdout: '27.0.0\n', stderr: '' };
      if (args[0] === 'image') return { exitCode: 0, stdout: JSON.stringify([IMAGE]), stderr: '' };
      return { exitCode: 0, stdout: '4\n', stderr: '', timedOut: false, outputLimitExceeded: false };
    };
    const port = createScientificSandboxPort({ backend: createDockerScientificSandboxBackend({ processRunner }) });
    const result = await port.execute(request(), { image: IMAGE });
    assert.equal(result.ok, true);
    assert.equal(result.stdout, '4\n');
    assert.match(result.stdoutHash, /^[a-f0-9]{64}$/);
    const run = calls.find((call) => call.args[0] === 'run');
    for (const required of [
      '--name', '--init', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--memory-swap', '--pids-limit', '--user', '65534:65534',
    ]) {
      assert.ok(run.args.includes(required), `missing Docker isolation argument: ${required}`);
    }
    assert.ok(run.args.includes('/tmp:rw,noexec,nosuid,nodev,size=16m'));
    assert.equal(run.args.at(-3), 'python');
    assert.deepEqual(run.args.slice(-2), ['-I', '-']);
    assert.equal(run.options.stdin, 'print(2 + 2)');
  });

  test('fails closed when the immutable image digest cannot be verified', async () => {
    const processRunner = async (_executable, args) => (args[0] === 'version'
      ? { exitCode: 0, stdout: '27.0.0', stderr: '' }
      : { exitCode: 0, stdout: '[]', stderr: '' });
    const port = createScientificSandboxPort({ backend: createDockerScientificSandboxBackend({ processRunner }) });
    const result = await port.execute(request(), { image: IMAGE });
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'SANDBOX_IMAGE_DIGEST_NOT_VERIFIED');
  });

  test('blocks dataset analysis until verified ArtifactRefs have a safe materializer', async () => {
    const plan = buildSandboxExecutionPlan(request([{
      artifactId: 'artifact:' + 'a'.repeat(64), sha256: 'a'.repeat(64), allowlisted: true,
    }]), { image: IMAGE }).plan;
    const backend = createDockerScientificSandboxBackend({ processRunner: async () => ({ exitCode: 0, stdout: '27.0.0', stderr: '' }) });
    const result = await backend.execute(plan);
    assert.equal(result.status, 'BLOCKED_BY_DATA');
    assert.equal(result.failureCode, 'SANDBOX_DATASET_MATERIALIZER_NOT_CONFIGURED');
  });

  test('maps wall-clock and output enforcement to explicit failure codes', async () => {
    const calls = [];
    const responses = [
      { exitCode: 0, stdout: '27.0.0', stderr: '' },
      { exitCode: 0, stdout: JSON.stringify([IMAGE]), stderr: '' },
      { exitCode: null, stdout: '', stderr: '', timedOut: true, outputLimitExceeded: false },
      { exitCode: 0, stdout: '', stderr: '' },
    ];
    const backend = createDockerScientificSandboxBackend({
      processRunner: async (_executable, args) => {
        calls.push(args);
        return responses.shift();
      },
    });
    const port = createScientificSandboxPort({ backend });
    const result = await port.execute(request(), { image: IMAGE });
    assert.equal(result.status, 'TIMEOUT');
    assert.equal(result.failureCode, 'SANDBOX_WALL_CLOCK_EXCEEDED');
    assert.deepEqual(calls.at(-1).slice(0, 2), ['rm', '-f']);
  });
});
