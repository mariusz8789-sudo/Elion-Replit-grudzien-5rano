/**
 * Punkt wejścia współdzielonego rdzenia obliczeniowego (Backend Compute Engine).
 *
 * To JEDYNE źródło formuł naukowych dla backendu. esbuild pakuje ten plik do
 * `packages/backend/src/compute/core.bundle.mjs` (skrypt `npm run compute:bundle`),
 * dzięki czemu serwer wykonuje DOKŁADNIE ten sam, przetestowany kod co przeglądarka
 * — bez duplikowania wzorów i bez ryzyka rozjazdu logiki naukowej (drift).
 *
 * Re-eksportujemy wyłącznie CZYSTE, deterministyczne moduły (physics.ts i buildery
 * Grafu Modeli) — zero zależności od DOM/Three.js/React. Gdy dodajesz model do
 * rejestru backendu, wystaw jego funkcję/builder tutaj i przegeneruj bundle.
 */

// Czyste funkcje fizyczne (bez importów przeglądarkowych).
export * from '../physics';

// Wykonywalny Graf Modeli + buildery domenowe (czyste; graph.ts importuje tylko typ).
export { ModelGraph } from '../modelGraph/graph';
export { buildNuclearModelGraph } from '../modelGraph/nuclearGraph';
export { buildBohrModelGraph } from '../modelGraph/bohrModelGraph';
export { buildOrbitalModelGraph } from '../modelGraph/orbitalGraph';
export { buildAtmosphericEscapeGraph } from '../modelGraph/atmosphericEscapeGraph';
export { buildSpecialRelativityGraph } from '../modelGraph/specialRelativityGraph';
export { buildRelativisticEnergyGraph } from '../modelGraph/relativisticEnergyGraph';
export { buildChemistryKineticsGraph } from '../modelGraph/chemistryKineticsGraph';
export { buildGaussianGraph } from '../modelGraph/gaussianGraph';
export { buildLogisticGrowthGraph } from '../modelGraph/logisticGrowthGraph';
export { buildPhotonGraph } from '../modelGraph/photonGraph';

// Czyste, deterministyczne runnery numeryczne (bez Canvasu/DOM).
export { runTunnelingScenario } from '../quantum/tunnelingRunner';
export { runQuantumTeleportScenario } from '../quantum/teleportationRunner';
export { parseSingleQubitCircuit, runBlochCircuitScenario } from '../../labs/experiments/quantum-bloch';
export { solveKitaevBulk } from './kitaevBulk';
export { runChshCorrelationScenario } from '../../labs/experiments/quantum-chsh';
export { runTokamakLawsonScenario } from '../../labs/experiments/nuclear-tokamak';
export { runNuclideChartScenario } from '../../labs/experiments/nuclear-chart';
export { runTitrationScenario, TITRATION_ACID_IDS } from '../../labs/experiments/chemistry-titration';

// Cheminformatyka (deterministyczna) — fundament domeny drug-discovery.
export * from './cheminformatics';
