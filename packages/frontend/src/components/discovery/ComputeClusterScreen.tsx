/**
 * ComputeClusterScreen (V5) — real HPC/GPU status from /api/science/compute-resources
 * (detectComputeResources: CPU, RAM, GPU, Docker, K8s, Slurm, queue, distributed).
 * Honest: no GPU/cluster in this sandbox is shown as such, never faked.
 */
import { useEffect, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import { fetchComputeResources, type ComputeResources } from '../../core/backend/client';

export function ComputeClusterScreen() {
  const [res, setRes] = useState<ComputeResources | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchComputeResources().then((r) => r.ok ? setRes(r.data) : setErr(r.message)); }, []);

  if (err) return <DiscoveryShell active="#/compute" title="Compute Cluster"><div className="ds-empty"><h4>Backend niedostępny</h4><p>{err}</p></div></DiscoveryShell>;
  if (!res) return <DiscoveryShell active="#/compute" title="Compute Cluster"><div className="ds-grid ds-grid-4">{[0,1,2,3].map(i=><div key={i} className="skeleton" style={{height:96}}/>)}</div></DiscoveryShell>;

  const capabilities = [
    { key: 'GPU (CUDA)', v: res.gpu.available, note: res.gpu.available ? (res.gpu.devices?.join(', ') ?? 'GPU present') : res.gpu.reason },
    { key: 'Docker', v: res.docker.available, note: res.docker.note },
    { key: 'Kubernetes', v: res.kubernetes.available, note: res.kubernetes.note },
    { key: 'Slurm HPC', v: res.hpcScheduler.slurm, note: res.hpcScheduler.note },
    { key: 'Kolejka zadań', v: res.jobQueue.available, note: res.jobQueue.engine ?? res.jobQueue.note },
    { key: 'Distributed processing', v: res.distributedProcessing.available, note: res.distributedProcessing.note },
  ];
  const readyCount = capabilities.filter((c) => c.v).length;

  return (
    <DiscoveryShell active="#/compute" title="Compute Cluster" subtitle="Realna sonda środowiska — GPU/HPC oznaczone uczciwie"
      actions={<StatusPill kind={res.gpu.available ? 'ok' : 'warn'}>{res.gpu.available ? 'GPU ready' : 'CPU-only'}</StatusPill>}>
      <div className="ds-grid ds-grid-4">
        <StatCard label="Rdzenie CPU" value={res.cpu.cores} sub="host CPU" accent="var(--cyan)" />
        <StatCard label="Pamięć RAM" value={`${res.cpu.totalMemGB.toFixed(0)} GB`} sub="całkowita" accent="var(--green)" />
        <StatCard label="GPU" value={res.gpu.available ? 'ON' : 'OFF'} sub={res.gpu.available ? 'CUDA' : 'brak akceleracji'} accent={res.gpu.available ? 'var(--green)' : 'var(--text-dim)'} />
        <StatCard label="Zdolności gotowe" value={`${readyCount}/${capabilities.length}`} sub="Docker · queue · …" accent="var(--violet)" />
      </div>

      <Panel title="Zdolności klastra" icon="cpu" className="ds-mt">
        <ul className="ds-list">
          {capabilities.map((c) => (
            <li key={c.key} className="ds-list-row">
              <span className="ds-list-name">{c.key}</span>
              <span className="ds-list-note">{c.note ?? ''}</span>
              {c.v ? <StatusPill kind="ok"><Icon name="check" size={12} /> dostępne</StatusPill> : <StatusPill kind="blocked"><Icon name="block" size={12} /> niedostępne</StatusPill>}
            </li>
          ))}
        </ul>
        <p className="ds-note ds-mt">Manifest Kubernetes: <code>deploy/genesis-k8s.yaml</code> — gotowy do wdrożenia na klastrze z GPU/HPC.</p>
      </Panel>
    </DiscoveryShell>
  );
}
