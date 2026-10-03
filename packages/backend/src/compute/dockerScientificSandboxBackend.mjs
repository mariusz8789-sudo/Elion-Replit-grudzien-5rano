import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const sandboxContainerNameOf = (sandboxRunId) => `genesis-sandbox-${sha256(sandboxRunId).slice(0, 24)}`;

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

async function removeAndVerifyContainer(docker, processRunner, containerName) {
  const removal = await processRunner(docker, ['rm', '-f', containerName], { timeoutMs: 10_000, maxOutputBytes: 16_384 });
  const listing = await processRunner(docker, [
    'container', 'ls', '--all', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}',
  ], { timeoutMs: 10_000, maxOutputBytes: 16_384 });
  const listingUsable = listing.exitCode === 0 && !listing.timedOut && !listing.outputLimitExceeded && !listing.spawnError;
  return Object.freeze({
    attempted: true,
    confirmedAbsent: listingUsable && String(listing.stdout ?? '').trim() === '',
    removalExitCode: Number.isInteger(removal.exitCode) ? removal.exitCode : null,
    verificationExitCode: Number.isInteger(listing.exitCode) ? listing.exitCode : null,
  });
}

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
        // Flags describe the hardened `docker run` arguments this backend always passes; no running container is inspected.
        attestationBasis: 'DECLARED_POLICY_ENFORCED_BY_RUN_ARGUMENTS',
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
      const containerName = sandboxContainerNameOf(plan.sandboxRunId);
      const args = [
        'run', '--rm', '--name', containerName, '--init', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--cpus', String(policy.cpuLimit),
        '--memory', `${policy.memoryMb}m`, '--memory-swap', `${policy.memoryMb}m`,
        '--pids-limit', String(policy.processLimit), '--user', '65534:65534',
        '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m',
        '-i', plan.image, 'python', '-I', '-',
      ];
      const result = await processRunner(docker, args, {
        stdin: plan.sourceStdin,
        timeoutMs: policy.wallClockMs,
        maxOutputBytes: Math.max(policy.stdoutBytes, policy.stderrBytes),
      });
      let cleanup = null;
      if (result.timedOut || result.outputLimitExceeded || result.spawnError) {
        // Killing the local `docker run` client does not guarantee that the container stopped.
        // Remove the named container and then ask Docker for the exact name. A terminal timeout or
        // output-limit result is never returned unless Docker itself confirms the container absent.
        cleanup = await removeAndVerifyContainer(docker, processRunner, containerName);
        if (!cleanup.confirmedAbsent) {
          return {
            ok: false,
            status: 'FAILED',
            failureCode: 'SANDBOX_CLEANUP_NOT_CONFIRMED',
            interruptedBy: result.timedOut ? 'WALL_CLOCK' : result.outputLimitExceeded ? 'OUTPUT_LIMIT' : 'RUNTIME_FAILURE',
            cleanup,
          };
        }
      }
      if (result.timedOut) return { ok: false, status: 'TIMEOUT', failureCode: 'SANDBOX_WALL_CLOCK_EXCEEDED', cleanup };
      if (result.outputLimitExceeded) return { ok: false, status: 'FAILED', failureCode: 'SANDBOX_OUTPUT_LIMIT_EXCEEDED', cleanup };
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
