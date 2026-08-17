/**
 * Genesis Event Contract — publiczna powierzchnia dla konsumentów (m.in.
 * warstwy wizualnej Manusa). Import read-only; ta warstwa nie renderuje,
 * nie zmienia modelu i nie trzyma World State.
 */
export {
  GENESIS_EVENT_CONTRACT_VERSION, validateEvent,
  type GenesisEvent, type GenesisEventInput, type EntityRef, type GenesisLocation,
  type EventProvenance, type ValidationResult,
} from './genesisEvent';
export { EventRegistry } from './eventRegistry';
export { fnv1a, canonicalJson } from './hash';
export { paramsHash, provenanceFromModel, provenanceFromSavedExperiment } from './provenance';
export {
  adaptTransmission, ingestTransmissions,
  type TransmissionContext, type TransmissionParams,
} from './transmissionAdapter';
export { applyConsequences, type ConsequenceRule } from './consequence';
