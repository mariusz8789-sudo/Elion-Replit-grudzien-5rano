export * from "./evidenceLevels.js";
export * from "./browserManifest.js";
export * from "./unrealProtocol.js";
export * from "./v6v7Gate.js";
// historical.ts is NOT re-declared here (fix area 5) — import
// HistoricalEntityClaim/validateHistoricalClaim from
// ../historicalEpistemic/epistemicTaxonomy.js instead.
export { type EpistemicLabel, type HistoricalEntityClaim, validateHistoricalClaim } from "../historicalEpistemic/epistemicTaxonomy.js";
