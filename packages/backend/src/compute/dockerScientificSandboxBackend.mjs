import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function defaultProcessRunner(executable, args, { stdin = '', timeoutMs = 10_000, maxOutputBytes = 1_000_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputLimitExceeded = false;
    let timedOut = false;
    const collect = (target, field) => (chunk) => {
      const bytes = Buffer.from(chunk);
      if (field === 'stdout') stdoutBytes += bytes.length;
      else stderrBytes += bytes.length;
      if (stdoutBytes > maxOutputBytes || stderrBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill('SIGKILL');
        return;
      }
      target.push(bytes);
    };
    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout: '', stderr: error.message, timedOut, outputLimitExceeded, spawnError: error.code ?? 'SPAWN_ERROR' });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), timedOut, outputLimitExceeded });
    });
    child.stdin.end(stdin);
  });
}

const missingAttestation = (reason) => ({
  containerIsolation: false,
  networkDenyByDefault: false,
  noHostFilesystem: false,
  noSecrets: false,
  readOnlyRoot: false,
  packageAllowlist: false,
  cpuLimit: false,
  memoryLimit: false,
  wallClockLimit: false,
  processLimit: false,
  outputLimit: false,
  available: false,
  reason,
});

/**
 * Docker implementation for the existing ScientificSandboxPort. It never invokes a shell, never
 * mounts the host, never forwards environment variables and accepts only the immutable image from
 * the frozen execution plan. Dataset materialisation remains blocked until an ArtifactRef provider
 * can supply a verified read-only mount without exposing a host path.
 */
export function createDockerScientificSandboxBackend({ docker = 'docker', processRunner = defaultProcessRunner } = {}) {
  let attestedImage = null;

  return Object.freeze({
    async attest() {
      const version = await processRunner(docker, ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 10_000, maxOutputBytes: 16_384 });
      if (version.exitCode !== 0 || version.timedOut || version.outputLimitExceeded) return missingAttestation('DOCKER_RUNTIME_UNAVAILABLE');
      return {
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
        available: true,
        runtimeVersion: version.stdout.trim(),
      };
    },

    async execute(plan) {
      if (plan.datasetIdentity.length > 0) {
        return { ok: false, status: 'BLOCKED_BY_DATA', failureCode: 'SANDBOX_DATASET_MATERIALIZER_NOT_CONFIGURED' };
      }
      if (attestedImage !== plan.image) {
        const inspected = await processRunner(docker, ['image', 'inspect', '--format', '{{json .RepoDigests}}', plan.image], { timeoutMs: 10_000, maxOutputBytes: 64_000 });
        let repoDigests;
        try { repoDigests = JSON.parse(inspected.stdout); } catch { repoDigests = []; }
        if (inspected.exitCode !== 0 || !Array.isArray(repoDigests) || !repoDigests.includes(plan.image)) {
          return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', failureCode: 'SANDBOX_IMAGE_DIGEST_NOT_VERIFIED' };
        }
        attestedImage = plan.image;
      }

      const policy = plan.policy;
      const args = [
        'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--cpus', String(policy.cpuLimit),
        '--memory', `${policy.memoryMb}m`, '--pids-limit', String(policy.processLimit),
        '--user', '65534:65534', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
        '-i', plan.image, 'python', '-I', '-',
      ];
      const result = await processRunner(docker, args, {
        stdin: plan.sourceStdin,
        timeoutMs: policy.wallClockMs,
        maxOutputBytes: Math.max(policy.stdoutBytes, policy.stderrBytes),
      });
      if (result.timedOut) return { ok: false, status: 'TIMEOUT', failureCode: 'SANDBOX_WALL_CLOCK_EXCEEDED' };
      if (result.outputLimitExceeded) return { ok: false, status: 'FAILED', failureCode: 'SANDBOX_OUTPUT_LIMIT_EXCEEDED' };
      if (result.exitCode !== 0) {
        return { ok: false, status: 'FAILED', failureCode: result.spawnError ? 'SANDBOX_RUNTIME_UNAVAILABLE' : 'SANDBOX_PROCESS_FAILED', stderrHash: sha256(result.stderr) };
      }
      return {
        ok: true,
        status: 'SUCCESS',
        environmentFingerprint: plan.environmentFingerprint,
        sourceHash: plan.sourceHash,
        stdout: result.stdout,
        stderr: result.stderr,
        stdoutHash: sha256(result.stdout),
        stderrHash: sha256(result.stderr),
      };
    },
  });
}
