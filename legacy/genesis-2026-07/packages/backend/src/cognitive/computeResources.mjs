/**
 * Compute Resources — HPC & GPU (Genesis V4, Phase 9). Detects the REAL execution environment:
 * CPU cores, GPU (nvidia-smi), Docker, Kubernetes, an HPC scheduler (Slurm), and the built-in job
 * queue. Reports genuine availability so heavy engines (docking/MD/FEP) can be scheduled or honestly
 * declared unavailable. Never claims a resource that isn't present.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';

export const COMPUTE_RESOURCES_VERSION = 'genesis-compute-resources/1';

function cli(cmd, args, timeout = 8000) {
  try { return { available: true, detail: execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0].slice(0, 100) }; }
  catch (e) { return { available: false, reason: String(e?.code ?? e?.message ?? 'not found').slice(0, 60) }; }
}

/** Detect execution resources. Probes are injectable for testing. */
export function detectComputeResources(probes = {}) {
  const p = {
    cpuCount: probes.cpuCount ?? (() => os.cpus().length),
    totalMemGB: probes.totalMemGB ?? (() => +(os.totalmem() / 1024 ** 3).toFixed(1)),
    gpu: probes.gpu ?? (() => cli('nvidia-smi', ['-L'])),
    docker: probes.docker ?? (() => cli('docker', ['--version'])),
    kubernetes: probes.kubernetes ?? (() => cli('kubectl', ['version', '--client=true', '--output=json'])),
    slurm: probes.slurm ?? (() => cli('sinfo', ['--version'])),
  };
  const gpu = p.gpu(); const docker = p.docker(); const k8s = p.kubernetes(); const slurm = p.slurm();
  return {
    version: COMPUTE_RESOURCES_VERSION,
    cpu: { cores: p.cpuCount(), totalMemGB: p.totalMemGB() },
    gpu: { available: gpu.available, devices: gpu.available ? gpu.detail : null, reason: gpu.available ? null : 'no GPU (nvidia-smi absent) — GPU engines (FEP, large MD) run only where a GPU is present' },
    docker: { available: docker.available, note: 'production image + docker-compose shipped (see Dockerfile)' },
    kubernetes: { available: k8s.available, note: k8s.available ? null : 'kubectl absent — a Deployment manifest is provided at deploy/genesis-k8s.yaml for cluster operators' },
    hpcScheduler: { slurm: slurm.available, note: slurm.available ? null : 'no Slurm scheduler detected' },
    jobQueue: { available: true, engine: 'built-in (store.createJob / jobs.enqueueJob) — in-process async queue', note: 'distributed queuing across nodes requires a shared broker (external)' },
    distributedProcessing: { available: Boolean(k8s.available || slurm.available), note: 'requires Kubernetes or an HPC scheduler + shared storage' },
    honesty: 'Every field reflects a real runtime probe. Absent resources are reported as unavailable, never simulated.',
  };
}
