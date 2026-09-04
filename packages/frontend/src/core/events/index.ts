/**
 * Genesis Event Contract — publiczna powierzchnia dla konsumentów (m.in.
 * warstwy wizualnej Manusa). Import read-only; ta warstwa nie renderuje,
 * nie zmienia modelu i nie trzyma World State.
 */
export {
  GENESIS_EVENT_CONTRACT_VERSION, validateEvent, PROVENANCE_ORIGINS, EVENT_TYPE_PATTERN,
  type GenesisEvent, type GenesisEventInput, type EntityRef, type GenesisLocation,
  type EventProvenance, type ValidationResult,
} from './genesisEvent';
export { EventRegistry } from './eventRegistry';
export { EventStream } from './eventStream';
export { fnv1a, canonicalJson } from './hash';
export { paramsHash, provenanceFromModel, provenanceFromSavedExperiment } from './provenance';
export {
  adaptTransmission, ingestTransmissions,
  type TransmissionContext, type TransmissionParams,
} from './transmissionAdapter';
export {
  runRules, runRulesOverRegistry, applyConsequences,
  type GenesisRule, type ConsequenceRule, type RuleContext,
} from './consequence';
export {
  registerEventType, getEventType, listEventTypes, isKnownType, assertKnownType,
  registerBuiltinEventTypes, type EventTypeDecl,
} from './eventTypeRegistry';
export { provenanceChain, reconstructionKey, type ReconstructionKey } from './replay';

// Domeny (typy + reguły; NIE modele).
export {
  EVENT_INFECTION_TRANSMISSION, EVENT_INFECTION_EXPOSURE,
  transmissionCausesExposure, type ExposureParams,
} from './domains/epidemic';
export {
  EVENT_POWER_FAILURE, EVENT_WATER_PUMP_FAILURE, EVENT_WATER_SHORTAGE,
  EVENT_HOSPITAL_CAPACITY_REDUCTION, EVENT_EMERGENCY_RESPONSE, URBAN_CASCADE_TYPE_DECLS,
  type PowerFailureParams, type WaterPumpFailureParams, type WaterShortageParams,
  type HospitalCapacityReductionParams, type EmergencyResponseParams,
} from './domains/urbanCascade';
