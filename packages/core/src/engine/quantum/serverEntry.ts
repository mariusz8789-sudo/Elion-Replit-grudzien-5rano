/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * Entry point bundled by `npm run compute:bundle:quantum` into
 * packages/backend/src/compute/quantum-core.mjs — everything the backend's quantum API needs,
 * nothing else. The backend supplies the real transport, sleeper, clock, environment and the
 * worker-thread compute sink.
 */
export {
  DeterministicQuantumSimulator, CloudQpuRestAdapter, Qasm3Generator, parseQasm3, circuitFromQasm,
  bellState, ghz, superposition, presetCircuit, isPresetId, PRESET_IDS,
  QuantumError, isQuantumError, MAX_QUBITS, DEFAULT_MAX_SHOTS,
} from './QuantumProviderAdapter.js';
export { QpuOrchestrator, quantumSimulateKernel, QUANTUM_SIMULATE_KIND } from './QpuOrchestrator.js';
export { envKeyProvider } from '../../knowledge/ingestion/EnvKeyProvider.js';
export { realSleeper, HttpError } from '../../knowledge/ingestion/netUtils.js';
// The backend runs local simulations under the Native System Orchestrator's worker-thread pool.
export { GenesisNativeOrchestrator, SystemResourceBridge } from '../native/index.js';
