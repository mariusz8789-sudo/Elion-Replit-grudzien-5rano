import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { createDockerScientificSandboxBackend, sandboxContainerNameOf } from './compute/dockerScientificSandboxBackend.mjs';
import { buildSandboxExecutionPlan, createScientificSandboxPort, SCIENTIFIC_SANDBOX_POLICY } from './compute/scientificSandboxContract.mjs';

const LINUX_DAEMON = JSON.stringify({ OSType: 'linux', MemoryLimit: true, SwapLimit: true, PidsLimit: true, CpuCfsQuota: true });

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
      if (args[0] === 'info') return { exitCode: 0, stdout: LINUX_DAEMON, stderr: '' };
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
    const processRunner = async (_executable, args) => {
      if (args[0] === 'version') return { exitCode: 0, stdout: '27.0.0', stderr: '' };
      if (args[0] === 'info') return { exitCode: 0, stdout: LINUX_DAEMON, stderr: '' };
      return { exitCode: 0, stdout: '[]', stderr: '' };
    };
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
      { exitCode: 0, stdout: LINUX_DAEMON, stderr: '' },
      { exitCode: 0, stdout: JSON.stringify([IMAGE]), stderr: '' },
      { exitCode: null, stdout: '', stderr: '', timedOut: true, outputLimitExceeded: false },
      { exitCode: 0, stdout: '', stderr: '' },
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
    assert.equal(result.cleanup.confirmedAbsent, true);
    assert.deepEqual(calls.at(-2).slice(0, 2), ['rm', '-f']);
    assert.deepEqual(calls.at(-1).slice(0, 3), ['container', 'ls', '--all']);
  });

  test('fails closed when Docker cannot confirm an interrupted container is absent', async () => {
    const responses = [
      { exitCode: 0, stdout: '27.0.0', stderr: '' },
      { exitCode: 0, stdout: LINUX_DAEMON, stderr: '' },
      { exitCode: 0, stdout: JSON.stringify([IMAGE]), stderr: '' },
      { exitCode: null, stdout: '', stderr: '', timedOut: true, outputLimitExceeded: false },
      { exitCode: 1, stdout: '', stderr: 'removal failed' },
      { exitCode: 0, stdout: sandboxContainerNameOf(request().sandboxRunId) + '\n', stderr: '' },
    ];
    const port = createScientificSandboxPort({
      backend: createDockerScientificSandboxBackend({ processRunner: async () => responses.shift() }),
    });
    const result = await port.execute(request(), { image: IMAGE });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.failureCode, 'SANDBOX_CLEANUP_NOT_CONFIRMED');
    assert.equal(result.interruptedBy, 'WALL_CLOCK');
    assert.equal(result.cleanup.confirmedAbsent, false);
  });

  test('attestation is withheld when the daemon cannot enforce cgroup limits or is not Linux', async () => {
    const attestWith = async (daemon) => createDockerScientificSandboxBackend({
      processRunner: async (_executable, args) => (args[0] === 'version'
        ? { exitCode: 0, stdout: '27.0.0', stderr: '' }
        : { exitCode: 0, stdout: JSON.stringify(daemon), stderr: '' }),
    }).attest();
    const full = await attestWith({ OSType: 'linux', MemoryLimit: true, SwapLimit: true, PidsLimit: true, CpuCfsQuota: true });
    assert.equal(full.containerIsolation, true);
    assert.equal(full.attestationBasis, 'RUN_ARGUMENTS_PLUS_DAEMON_REPORTED_CGROUP_SUPPORT');
    const noPids = await attestWith({ OSType: 'linux', MemoryLimit: true, SwapLimit: true, PidsLimit: false, CpuCfsQuota: true });
    assert.equal(noPids.processLimit, false);
    const windows = await attestWith({ OSType: 'windows', MemoryLimit: true, SwapLimit: true, PidsLimit: true, CpuCfsQuota: true });
    assert.equal(windows.containerIsolation, false);
    assert.equal(windows.networkDenyByDefault, false);

    const port = createScientificSandboxPort({ backend: createDockerScientificSandboxBackend({
      processRunner: async (_executable, args) => (args[0] === 'version'
        ? { exitCode: 0, stdout: '27.0.0', stderr: '' }
        : { exitCode: 0, stdout: JSON.stringify({ OSType: 'linux', MemoryLimit: false, SwapLimit: false, PidsLimit: false, CpuCfsQuota: true }), stderr: '' }),
    }) });
    const blocked = await port.execute(request(), { image: IMAGE });
    assert.equal(blocked.failureCode, 'SANDBOX_ISOLATION_INCOMPLETE');
    assert.deepEqual(blocked.missing, ['memoryLimit', 'processLimit']);

    const unreachableInfo = await createDockerScientificSandboxBackend({
      processRunner: async (_executable, args) => (args[0] === 'version'
        ? { exitCode: 0, stdout: '27.0.0', stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'permission denied' }),
    }).attest();
    assert.equal(unreachableInfo.available, false);
    assert.equal(unreachableInfo.reason, 'DOCKER_DAEMON_CAPABILITIES_UNAVAILABLE');
  });
});

/**
 * Real process path (default runner, real spawn, real SIGKILL) against a fake `docker` executable
 * that keeps a "container" alive after its client is killed, exactly like a real daemon would.
 */
describe('Docker sandbox wall-clock timeout against a fake docker binary', { skip: process.platform === 'win32' && 'POSIX shell required' }, () => {
  const setup = ({ removalWorks }) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-fake-docker-'));
    const state = path.join(dir, 'containers');
    const log = path.join(dir, 'calls.log');
    const docker = path.join(dir, 'docker');
    writeFileSync(docker, `#!/bin/sh
STATE='${state}'
mkdir -p "$STATE"
echo "$*" >> '${log}'
case "$1" in
  version) echo 27.0.0 ;;
  info) echo '${LINUX_DAEMON}' ;;
  image) echo '["${IMAGE}"]' ;;
  run)
    name=""
    while [ $# -gt 0 ]; do [ "$1" = "--name" ] && name="$2"; shift; done
    touch "$STATE/$name"
    exec sleep 30 ;;
  rm) ${removalWorks ? 'rm -f "$STATE/$3"' : 'exit 1'} ;;
  container)
    for arg in "$@"; do case "$arg" in name=*) n="\${arg#name=^/}"; n="\${n%\\$}" ;; esac; done
    [ -e "$STATE/$n" ] && echo "$n"
    exit 0 ;;
esac
`);
    chmodSync(docker, 0o755);
    const plan = buildSandboxExecutionPlan(request(), { image: IMAGE, policy: { ...SCIENTIFIC_SANDBOX_POLICY, wallClockMs: 3000 } }).plan;
    // 3 s leaves the fake `docker run` time to log and create its container under a loaded machine; the 30 s sleep still far outlives it.
    const containerName = sandboxContainerNameOf(plan.sandboxRunId);
    return { dir, docker, plan, alive: () => existsSync(path.join(state, containerName)), calls: () => readFileSync(log, 'utf8').trim().split('\n'), containerName };
  };

  test('a wall-clock timeout removes the named container, not only the docker client', async () => {
    const env = setup({ removalWorks: true });
    try {
      const backend = createDockerScientificSandboxBackend({ docker: env.docker });
      const started = Date.now();
      const result = await backend.execute(env.plan);
      assert.ok(Date.now() - started < 10_000, 'the killed client must not wait for the 30 s sleep');
      assert.equal(result.status, 'TIMEOUT');
      assert.equal(result.failureCode, 'SANDBOX_WALL_CLOCK_EXCEEDED');
      assert.equal(result.cleanup.confirmedAbsent, true);
      assert.equal(env.alive(), false, 'the fake container outlived the timeout');
      const calls = env.calls();
      assert.ok(calls.some((line) => line.startsWith('run ') && line.includes(`--name ${env.containerName}`)));
      assert.ok(calls.includes(`rm -f ${env.containerName}`));
    } finally {
      rmSync(env.dir, { recursive: true, force: true });
    }
  });

  test('a timeout whose container survives removal is reported as cleanup not confirmed', async () => {
    const env = setup({ removalWorks: false });
    try {
      const result = await createDockerScientificSandboxBackend({ docker: env.docker }).execute(env.plan);
      assert.equal(result.status, 'FAILED');
      assert.equal(result.failureCode, 'SANDBOX_CLEANUP_NOT_CONFIRMED');
      assert.equal(result.interruptedBy, 'WALL_CLOCK');
      assert.equal(env.alive(), true);
    } finally {
      rmSync(env.dir, { recursive: true, force: true });
    }
  });
});
