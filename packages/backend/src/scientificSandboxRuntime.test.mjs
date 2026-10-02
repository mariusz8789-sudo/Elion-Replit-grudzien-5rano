import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { handleApi } from './api.mjs';
import { createDockerScientificSandboxBackend } from './compute/dockerScientificSandboxBackend.mjs';
import { createScientificSandboxPort, SCIENTIFIC_SANDBOX_POLICY } from './compute/scientificSandboxContract.mjs';
import { openDatabase } from './store.mjs';

const IMAGE = process.env.GENESIS_SCIENTIFIC_SANDBOX_IMAGE?.trim() || null;
const REPORT_DIR = process.env.GENESIS_SANDBOX_RUNTIME_REPORT_DIR?.trim() || null;
const runtimeSkip = !IMAGE && 'GENESIS_SCIENTIFIC_SANDBOX_IMAGE is not configured';

function writeReport(name, value) {
  if (!REPORT_DIR) return;
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(value, null, 2) + '\n');
}

const request = (suffix, source) => ({
  sandboxRunId: `sandbox-runtime-${suffix}`,
  researchRunId: `research-runtime-${suffix}`,
  experimentId: `experiment-runtime-${suffix}`,
  language: 'python',
  source,
  datasetRefs: [],
});

function provider(source) {
  return {
    providerId: 'CI_FROZEN_FIXTURE',
    model: 'ci-frozen-code-proposal',
    configured: true,
    calls: 0,
    describe: () => ({ providerId: 'CI_FROZEN_FIXTURE', model: 'ci-frozen-code-proposal', configured: true }),
    async complete() {
      this.calls += 1;
      return {
        model: this.model,
        text: JSON.stringify({
          source,
          methodSummary: 'Compute a bounded arithmetic mean and sample count.',
          expectedOutputKeys: ['mean', 'n'],
        }),
      };
    },
  };
}

const computeAdmission = { acquire: () => ({ ok: true, release() {} }) };

describe('real Docker scientific sandbox runtime', () => {
  test('enforces network, filesystem, secret, privilege and cgroup isolation', { skip: runtimeSkip }, async () => {
    const hostDir = mkdtempSync(path.join(tmpdir(), 'genesis-host-sentinel-'));
    const hostSentinel = path.join(hostDir, 'must-not-be-visible.txt');
    writeFileSync(hostSentinel, 'host-only-secret');
    process.env.GENESIS_SANDBOX_HOST_SECRET = 'must-not-cross-container-boundary';
    const source = `
import json, os, pathlib, socket

def read_first(paths):
    for candidate in paths:
        try:
            return pathlib.Path(candidate).read_text().strip()
        except OSError:
            pass
    return None

try:
    socket.create_connection(("1.1.1.1", 53), timeout=0.5)
    network = "UNEXPECTED_ACCESS"
except OSError:
    network = "BLOCKED"

try:
    pathlib.Path("/genesis-root-write-probe").write_text("forbidden")
    root_write = "UNEXPECTED_WRITE"
except OSError:
    root_write = "BLOCKED"

tmp_probe = pathlib.Path("/tmp/genesis-write-probe")
tmp_probe.write_text("allowed")
tmp_write = tmp_probe.read_text()
tmp_probe.unlink()

status = pathlib.Path("/proc/self/status").read_text()
no_new_privs = next((line.split(":", 1)[1].strip() for line in status.splitlines() if line.startswith("NoNewPrivs:")), None)
cap_eff = next((line.split(":", 1)[1].strip() for line in status.splitlines() if line.startswith("CapEff:")), None)
forbidden_names = [name for name in os.environ if name.startswith(("GENESIS_", "GITHUB_", "AWS_", "AZURE_")) or name in {"ANTHROPIC_API_KEY", "OPENAI_API_KEY"}]
forbidden_values = [value for value in os.environ.values() if value == "must-not-cross-container-boundary"]

print(json.dumps({
    "uid": os.getuid(),
    "network": network,
    "rootWrite": root_write,
    "tmpWrite": tmp_write,
    "hostSentinelVisible": pathlib.Path(${JSON.stringify(hostSentinel.replaceAll('\\', '/'))}).exists(),
    "dockerSocketVisible": pathlib.Path("/var/run/docker.sock").exists(),
    "forbiddenEnvNames": forbidden_names,
    "forbiddenEnvValues": forbidden_values,
    "noNewPrivs": no_new_privs,
    "capEff": cap_eff,
    "memoryMax": read_first(["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]),
    "pidsMax": read_first(["/sys/fs/cgroup/pids.max", "/sys/fs/cgroup/pids/pids.max"]),
    "cpuMax": read_first(["/sys/fs/cgroup/cpu.max"]),
    "cpuQuota": read_first(["/sys/fs/cgroup/cpu/cpu.cfs_quota_us"]),
    "cpuPeriod": read_first(["/sys/fs/cgroup/cpu/cpu.cfs_period_us"]),
}, sort_keys=True))
`;
    try {
      const port = createScientificSandboxPort({ backend: createDockerScientificSandboxBackend() });
      const result = await port.execute(request('security', source), { image: IMAGE });
      assert.equal(result.ok, true, JSON.stringify(result));
      const proof = JSON.parse(result.stdout);
      assert.equal(proof.uid, 65534);
      assert.equal(proof.network, 'BLOCKED');
      assert.equal(proof.rootWrite, 'BLOCKED');
      assert.equal(proof.tmpWrite, 'allowed');
      assert.equal(proof.hostSentinelVisible, false);
      assert.equal(proof.dockerSocketVisible, false);
      assert.deepEqual(proof.forbiddenEnvNames, []);
      assert.deepEqual(proof.forbiddenEnvValues, []);
      assert.equal(proof.noNewPrivs, '1');
      assert.match(proof.capEff, /^0+$/);
      assert.equal(Number(proof.memoryMax) <= SCIENTIFIC_SANDBOX_POLICY.memoryMb * 1024 * 1024, true);
      assert.equal(Number(proof.pidsMax) <= SCIENTIFIC_SANDBOX_POLICY.processLimit, true);
      if (proof.cpuMax) {
        const [quota, period] = proof.cpuMax.split(' ').map(Number);
        assert.equal(quota / period <= SCIENTIFIC_SANDBOX_POLICY.cpuLimit, true);
      } else {
        assert.equal(Number(proof.cpuQuota) / Number(proof.cpuPeriod) <= SCIENTIFIC_SANDBOX_POLICY.cpuLimit, true);
      }
      writeReport('security-proof.json', {
        schemaVersion: 1,
        commit: process.env.GITHUB_SHA ?? null,
        image: IMAGE,
        sourceHash: result.sourceHash,
        environmentFingerprint: result.environmentFingerprint,
        stdoutHash: result.stdoutHash,
        stderrHash: result.stderrHash,
        proof,
        status: 'CI_RUNTIME_VERIFIED',
        productEligibility: 'BLOCKED_EXTERNAL_LICENSE_REVIEW',
      });
    } finally {
      delete process.env.GENESIS_SANDBOX_HOST_SECRET;
      rmSync(hostDir, { recursive: true, force: true });
    }
  });

  test('enforces real wall-clock and output bounds and removes interrupted containers', { skip: runtimeSkip }, async () => {
    const port = createScientificSandboxPort({ backend: createDockerScientificSandboxBackend() });
    const shortPolicy = { ...SCIENTIFIC_SANDBOX_POLICY, wallClockMs: 500 };
    const timedOut = await port.execute(request('timeout', 'while True:\n    pass'), { image: IMAGE, policy: shortPolicy });
    assert.equal(timedOut.status, 'TIMEOUT');
    assert.equal(timedOut.failureCode, 'SANDBOX_WALL_CLOCK_EXCEEDED');

    const boundedOutput = await port.execute(request('output', 'print("x" * 100000)'), {
      image: IMAGE,
      policy: { ...SCIENTIFIC_SANDBOX_POLICY, stdoutBytes: 1024, stderrBytes: 1024 },
    });
    assert.equal(boundedOutput.status, 'FAILED');
    assert.equal(boundedOutput.failureCode, 'SANDBOX_OUTPUT_LIMIT_EXCEEDED');
    writeReport('resource-proof.json', {
      schemaVersion: 1,
      commit: process.env.GITHUB_SHA ?? null,
      image: IMAGE,
      timeout: { status: timedOut.status, failureCode: timedOut.failureCode },
      output: { status: boundedOutput.status, failureCode: boundedOutput.failureCode },
      status: 'CI_RUNTIME_VERIFIED',
    });
  });

  test('runs NL proposal -> frozen Python -> canonical ResearchRun -> provenance -> Replay in the real sandbox', { skip: runtimeSkip }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-real-sandbox-e2e-'));
    const file = path.join(dir, 'genesis.db');
    const source = 'import json\nvalues = [1, 2, 3, 4]\nprint(json.dumps({"mean": sum(values) / len(values), "n": len(values)}, sort_keys=True))';
    const reasoningProvider = provider(source);
    const scientificSandboxPort = createScientificSandboxPort({ backend: createDockerScientificSandboxBackend() });
    try {
      let db = openDatabase(file);
      const invoke = (method, pathname, body, token) => handleApi(db, {
        method,
        pathname,
        body,
        token,
        query: {},
        computeAdmission,
        reasoningProvider,
        scientificSandboxPort,
        scientificSandboxImage: IMAGE,
      });
      const owner = (await invoke('POST', '/api/auth/register', { email: 'real-sandbox-ci@genesis.invalid', password: 'password123' })).body;
      const project = (await invoke('POST', '/api/projects', { name: 'Real sandbox CI' }, owner.token)).body.project;
      const base = `/api/projects/${project.id}`;
      const started = await invoke('POST', `${base}/research-runs`, { question: 'What is the bounded sample mean?' }, owner.token);
      const runId = started.body.researchRun.researchRunId;
      const route = `${base}/research-runs/${runId}/generated-analyses`;
      const generated = await invoke('POST', route, { objective: 'Compute mean and count for [1,2,3,4].' }, owner.token);
      assert.equal(generated.status, 201, JSON.stringify(generated.body));
      assert.equal(generated.body.execution.status, 'SUCCESS');
      assert.deepEqual(generated.body.execution.output, { mean: 2.5, n: 4 });
      assert.equal(generated.body.execution.epistemicStatus, 'NOT_EVIDENCE');
      assert.equal(generated.body.execution.evidenceEligibility, 'REQUIRES_SEPARATE_REVIEW');
      assert.equal(reasoningProvider.calls, 1);
      const analysisId = generated.body.execution.analysisId;
      const original = {
        sourceHash: generated.body.execution.sourceHash,
        environmentFingerprint: generated.body.execution.environmentFingerprint,
        outputHash: generated.body.execution.outputHash,
        stdoutHash: generated.body.execution.stdoutHash,
        stderrHash: generated.body.execution.stderrHash,
      };
      db.close();

      db = openDatabase(file);
      const replay = await invoke('POST', `${route}/${analysisId}/replay`, {}, owner.token);
      assert.equal(replay.status, 201, JSON.stringify(replay.body));
      assert.equal(replay.body.verdict, 'MATCH');
      assert.equal(reasoningProvider.calls, 1, 'Replay must execute frozen source without another model call.');
      assert.equal(replay.body.researchRun.researchState.chain.ok, true);
      assert.deepEqual(replay.body.researchRun.researchState.events.map((event) => event.type), [
        'PROBLEM_FORMALIZED', 'GENERATED_ANALYSIS_PROPOSED', 'GENERATED_ANALYSIS_EXECUTED', 'GENERATED_ANALYSIS_REPLAYED',
      ]);
      writeReport('generated-analysis-e2e.json', {
        schemaVersion: 1,
        commit: process.env.GITHUB_SHA ?? null,
        image: IMAGE,
        researchRunId: runId,
        analysisId,
        eventTypes: replay.body.researchRun.researchState.events.map((event) => event.type),
        chainVerified: true,
        modelCalls: reasoningProvider.calls,
        original,
        replay: {
          verdict: replay.body.verdict,
          sourceHash: replay.body.replay.sourceHash,
          environmentFingerprint: replay.body.replay.environmentFingerprint,
          outputHash: replay.body.replay.outputHash,
          stdoutHash: replay.body.replay.stdoutHash,
          stderrHash: replay.body.replay.stderrHash,
        },
        epistemicStatus: generated.body.execution.epistemicStatus,
        evidenceEligibility: generated.body.execution.evidenceEligibility,
        status: 'CI_RUNTIME_VERIFIED',
        productEligibility: 'BLOCKED_EXTERNAL_LICENSE_REVIEW',
      });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
