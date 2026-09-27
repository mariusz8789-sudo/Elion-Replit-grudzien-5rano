/**
 * Top-level barrel. Namespaced (not flattened) because several sub-packages share
 * symbol names by design (e.g. both d141 and precisionBay declare their own
 * `EvidencePort` — they are genuinely different port shapes bound to different
 * canonical destinations, see MIGRATION_NOTES.md). Deep-import from the specific
 * sub-path in real integration code rather than relying on flattened re-exports.
 */
export * as Mirror from "./mirror/mirrorContract.js";
export * as MirrorCamera from "./mirror/cameraSource.js";
export * as DeviceSafety from "./deviceSafety/deviceSafetyContract.js";
export * as DeviceSafetyLegacy from "./deviceSafety/legacyAdapters.js";
export * as HistoricalEpistemic from "./historicalEpistemic/epistemicTaxonomy.js";
export * as HashReplay from "./hashReplay/hashPort.js";
export * as TestHash from "./hashReplay/testHash.js";
export * as D141 from "./d141/index.js";
export * as PrecisionBay from "./precisionBay/index.js";
export * as BioRealLab from "./bioRealLab/index.js";
export * as CoreHardening from "./coreHardening/index.js";
export * as WorldVisual from "./worldVisual/index.js";
export * as ProviderRouter from "./providerRouter/index.js";
export * as AstraWorldAuthor from "./astraWorldAuthor/index.js";
export * as CyberScientist from "./cyberScientist/index.js";
export * as DrugDiscovery from "./drugDiscovery/index.js";
