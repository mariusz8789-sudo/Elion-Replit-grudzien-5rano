import { useMemo, useState } from 'react';
import { getLabs } from '../core/registry';
import { listRouterModels } from '../core/experimentFabric';
import { listGenesisScenes } from '../core/three/sceneRegistry';
import { listGenesisCapabilities, type GenesisCapabilityReadiness } from '../core/capabilities/genesisCapabilityRegistry';

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
  const statusFor = (readiness: GenesisCapabilityReadiness): CapabilityStatus => readiness === 'AVAILABLE' ? 'AVAILABLE' : readiness === 'PARTIAL' || readiness === 'PROTOTYPE' ? 'PARTIAL' : readiness === 'BLOCKED_BY_RUNTIME' || readiness === 'BLOCKED_DATA' ? 'BACKEND-GATED' : 'NOT_AVAILABLE';
  const capabilities: Capability[] = listGenesisCapabilities().filter((capability) => capability.showInShowcase).map((capability) => ({
    id: capability.id, label: capability.label, description: capability.description, status: statusFor(capability.readiness),
    action: capability.visualizationRoute ? 'Open' : undefined, hash: capability.visualizationRoute ?? undefined,
    note: capability.limitations[0],
  }));
  // These counts are evidence that the registry points at the existing product,
  // rather than a second scene/model catalog.
  const registryNote = `${labs.length} labs · ${models.length} models · ${availableScenes.length}/${scenes.length} scenes`;
  const demo = capabilities[demoIndex];
  const go = () => { if (demo.hash) window.location.hash = demo.hash; };
  return <section className="capability-showcase" aria-labelledby="capability-showcase-title">
    <div className="capability-heading"><div><span className="section-label">SHOW ME WHAT GENESIS CAN DO</span><h2 id="capability-showcase-title">One product surface. Truthful capability routes.</h2><p>Explore the system by capability. Each module exposes one useful action and its real status—without turning a designed surface into a false claim.</p></div><div className="demo-mode"><span className="status-pill">DEMO MODE</span><strong>{demo.label}</strong><button className="chip-btn" onClick={go}>{demo.action ?? 'Open module'} →</button><button className="chip-btn ghost" onClick={() => setDemoIndex((demoIndex + 1) % capabilities.length)}>Next demo</button></div></div>
    <div className="capability-grid" data-registry-status={registryNote}>{capabilities.map((capability, index) => <button type="button" className={`capability-item ${index === demoIndex ? 'selected' : ''}`} key={capability.id} onClick={() => setDemoIndex(index)}><span className="capability-top"><span className="capability-index">{String(index + 1).padStart(2, '0')}</span><span className={`capability-status status-${capability.status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{statusCopy[capability.status]}</span></span><strong>{capability.label}</strong><span>{capability.description}</span>{capability.note && <small>{capability.note}</small>}</button>)}</div>
  </section>;
}
