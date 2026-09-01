import { useMemo, useState } from 'react';
import { getLabs } from '../core/registry';
import { listRouterModels } from '../core/experimentFabric';
import { listGenesisScenes } from '../core/three/sceneRegistry';

type CapabilityStatus = 'AVAILABLE' | 'PARTIAL' | 'BACKEND-GATED' | 'NOT_AVAILABLE';
interface Capability { id: string; label: string; description: string; status: CapabilityStatus; action?: string; hash?: string; note?: string }

const statusCopy: Record<CapabilityStatus, string> = {
  AVAILABLE: 'AVAILABLE',
  PARTIAL: 'PARTIAL',
  'BACKEND-GATED': 'BACKEND-GATED',
  NOT_AVAILABLE: 'NOT AVAILABLE',
};

export function GenesisCapabilityShowcase() {
  const [demoIndex, setDemoIndex] = useState(0);
  const labs = useMemo(() => getLabs(), []);
  const models = useMemo(() => listRouterModels(), []);
  const scenes = useMemo(() => listGenesisScenes(), []);
  const availableScenes = scenes.filter((scene) => scene.status === 'AVAILABLE');
  const capabilities: Capability[] = [
    { id: 'time', label: 'Time Machine', description: 'Snapshots, bookmarks, counterfactuals and replay through the existing temporal surfaces.', status: 'AVAILABLE', action: 'Explore time', hash: '#/timeline' },
    { id: 'world', label: 'City / World / 3D', description: 'A shared scene registry and renderer for available worlds; planned worlds remain visible as planned.', status: availableScenes.length > 0 ? 'PARTIAL' : 'NOT_AVAILABLE', action: 'Open living world', hash: '#/city3d', note: `${availableScenes.length}/${scenes.length} registered scenes available` },
    { id: 'epidemic', label: 'Epidemic', description: 'Agent-based epidemic city workflow with scenario and comparison surfaces.', status: 'AVAILABLE', action: 'Open epidemic', hash: '#/city3d' },
    { id: 'hazard', label: 'Earthquake / Hazard', description: 'Hazard and exposure workflows where the existing model and data contract are present.', status: 'PARTIAL', action: 'Inspect hazard', hash: '#/city', note: 'Model/data availability is scenario-dependent' },
    { id: 'discovery', label: 'Scientific Discovery', description: 'Hypothesis, experiment, result, falsification and next-experiment workflows.', status: 'AVAILABLE', action: 'Run an experiment', hash: '#/pilot' },
    { id: 'chemistry', label: 'Chemistry', description: 'Source-backed identity, activity, descriptors, ADMET and quantum chemistry seams.', status: 'AVAILABLE', action: 'Open discovery', hash: '#/drug', note: 'Predictions remain model estimates' },
    { id: 'biology', label: 'Biology', description: 'Target, evidence, comparison and validation-request surfaces using active executors.', status: 'BACKEND-GATED', action: 'Review biology', hash: '#/drug', note: 'Independent biological observation is not supplied by software' },
    { id: 'physics', label: 'Physics', description: 'Existing physics labs and experiment-fabric routes, shown with their actual runtime status.', status: models.length > 0 ? 'AVAILABLE' : 'PARTIAL', action: 'Open physics', hash: '#/lab/einstein', note: `${labs.length} registered labs · ${models.length} router models` },
    { id: 'quantum', label: 'Quantum / Qubits', description: 'Circuit and state demonstrations; simulated execution is labelled as simulation.', status: 'PARTIAL', action: 'Open quantum', hash: '#/lab/quantum', note: 'No claim of access to a physical QPU' },
    { id: 'evidence', label: 'Evidence / Replay', description: 'Evidence Pack, provenance, fingerprints and MATCH / DRIFT / BLOCKED verification.', status: 'AVAILABLE', action: 'Open Memory', hash: '#/memory' },
  ];
  const demo = capabilities[demoIndex];
  const go = () => { if (demo.hash) window.location.hash = demo.hash; };
  return <section className="capability-showcase" aria-labelledby="capability-showcase-title">
    <div className="capability-heading"><div><span className="section-label">SHOW ME WHAT GENESIS CAN DO</span><h2 id="capability-showcase-title">One product surface. Ten truthful entry points.</h2><p>Explore the system by capability. Each module exposes one useful action and its real status—without turning a designed surface into a false claim.</p></div><div className="demo-mode"><span className="status-pill">DEMO MODE</span><strong>{demo.label}</strong><button className="chip-btn" onClick={go}>{demo.action ?? 'Open module'} →</button><button className="chip-btn ghost" onClick={() => setDemoIndex((demoIndex + 1) % capabilities.length)}>Next demo</button></div></div>
    <div className="capability-grid">{capabilities.map((capability, index) => <button type="button" className={`capability-item ${index === demoIndex ? 'selected' : ''}`} key={capability.id} onClick={() => setDemoIndex(index)}><span className="capability-top"><span className="capability-index">{String(index + 1).padStart(2, '0')}</span><span className={`capability-status status-${capability.status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{statusCopy[capability.status]}</span></span><strong>{capability.label}</strong><span>{capability.description}</span>{capability.note && <small>{capability.note}</small>}</button>)}</div>
  </section>;
}
