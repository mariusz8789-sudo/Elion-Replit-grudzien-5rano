import { canonicalJson, fnv1a } from '../events/hash';
import type { ScenarioSummary } from '../simulation/scenarioEngine';
import {
  DISCOVERY_ENGINE_VERSION,
  type DiscoveryCase,
  type DiscoveryComparison,
  type DiscoveryConclusion,
  type LocalSimulationSnapshotPack,
  type DemoReplay,
} from './discoveryCase';

/**
 * LOCAL_SIMULATION_SNAPSHOT PACK — automatyczny, przenośny zapis JEDNEJ sprawy DEMO.
 *
 * RELACJA DO ISTNIEJĄCEGO PAKIETU
 * `experimentFabric/evidencePack.ts` pakuje `ScientificEvidenceChain`, czyli
 * ramiona uruchomione przez Fabric jako `ExperimentRun` (z żądaniem, intencją,
 * planem i routingiem). Sprawa odkrycia biegnie na innym podłożu — na modelu
 * miasta uruchamianym w procesie — i jej jednostką dowodu jest CAŁA SPRAWA, a
 * nie łańcuch ramion Fabric. Wciśnięcie `ScenarioRun` w `ExperimentRun`
 * wymagałoby wymyślenia intencji, planu i zdolności, których tam nie ma — więc
 * byłoby fabrykowaniem metadanych. Dlatego jest to osobny pakiet dla osobnej
 * jednostki, z tym samym hashowaniem (`core/events/hash`) i tą samą zasadą:
 * pakiet rejestruje wyłącznie to, co faktycznie się wydarzyło.
 *
 * KOMPLETNOŚĆ
 * Pakiet sam wylicza `missingFields`. Dopóki lista nie jest pusta, bramka
 * jakości nie przepuści sprawy do SNAPSHOT_PACK_COMPLETE. Brak jest widoczny,
 * a nie zamaskowany.
 *
 * NOT GENESIS EVIDENCE, NOT GENESIS REPLAY. This module belongs to the browser-local
 * epidemic-city DEMO found by the 2026-10-04 architecture audit. Canonical Genesis
 * Evidence is the backend ResearchRun loop's single ledger; canonical Replay is
 * `packages/backend/src/campaign/verify.mjs`. The owner's 2026-10-04 resolution was to
 * rename this cluster rather than delete it, so the stored state is a
 * LOCAL_SIMULATION_SNAPSHOT and the re-run is a DEMO_REPLAY (D-175).
 *
 * DO NOT BUILD THE RESEARCHRUN MIGRATION NOW. The full redirect of this surface into
 * the canonical loop happens ONLY once the epidemic scenario is a real ResearchRun.
 */

export const LOCAL_SIMULATION_SNAPSHOT_PACK_VERSION = '1.0.0';

const DISCLAIMER =
  'LOCAL_SIMULATION_SNAPSHOT: lokalna migawka symulacji DEMO, trzymana w tej przeglądarce. To NIE jest Genesis Evidence ani Genesis Replay i nie można jej opublikować jako paczki dowodowej ani wstawić do raportu. Migawka rejestruje faktyczne przebiegi modelu, ich parametry, ziarno i odciski. Wniosek obowiazuje wylacznie w granicach prerejestrowanego kryterium i uzytego modelu; nie jest odkryciem ani twierdzeniem o swiecie rzeczywistym.';

function collectMissing(
  record: DiscoveryCase,
  comparison: DiscoveryComparison,
  replay: DemoReplay,
  conclusion: DiscoveryConclusion | null,
): string[] {
  const missing: string[] = [];
  if (!record.model.modelVersion) missing.push('model.modelVersion');
  if (!record.model.engine) missing.push('model.engine');
  if (Object.keys(record.parameters).length === 0) missing.push('parameters');
  if (!Number.isFinite(record.seed)) missing.push('seed');
  if (!record.inputFingerprint) missing.push('inputFingerprint');
  if (!record.runFingerprint) missing.push('runFingerprint');
  if (record.arms.length !== 2) missing.push('two experiment arms');
  for (const arm of record.arms) {
    if (arm.run.resultFingerprint === null) missing.push(`arm ${arm.armId}: resultFingerprint`);
    if (arm.summary === null) missing.push(`arm ${arm.armId}: result summary`);
  }
  if (comparison.status !== 'COMPLETED') missing.push(`comparison (${comparison.blockedReason ?? comparison.status})`);
  if (replay.status !== 'MATCH' && replay.status !== 'WITHIN_TOLERANCE') missing.push(`DEMO_REPLAY verification (${replay.status})`);
  if (record.limitations.length === 0) missing.push('limitations');
  if (conclusion === null) missing.push('conclusion');
  return missing;
}

/**
 * Buduje pakiet dowodowy ze sprawy. Nic tu nie jest przeliczane od nowa —
 * pakiet jest projekcją tego, co sprawa już zawiera.
 */
export function createLocalSimulationSnapshotPack(
  record: DiscoveryCase,
  comparison: DiscoveryComparison,
  replay: DemoReplay,
  conclusion: DiscoveryConclusion,
): LocalSimulationSnapshotPack {
  const inputFingerprints: Record<string, string> = { case: record.inputFingerprint };
  const runFingerprints: Record<string, string | null> = {};
  const result: Record<string, ScenarioSummary | null> = {};
  for (const arm of record.arms) {
    inputFingerprints[arm.armId] = arm.run.inputFingerprint;
    runFingerprints[arm.armId] = arm.run.resultFingerprint;
    result[arm.armId] = arm.summary;
  }

  const missingFields = collectMissing(record, comparison, replay, conclusion);
  const packSeed = {
    contractVersion: LOCAL_SIMULATION_SNAPSHOT_PACK_VERSION,
    caseId: record.caseId,
    model: record.model,
    inputFingerprints,
    runFingerprints,
    comparison: comparison.status,
    demoReplay: replay.status,
    verdict: conclusion.verdict,
  };

  return {
    contractVersion: LOCAL_SIMULATION_SNAPSHOT_PACK_VERSION,
    localSnapshotId: `localsnap_${fnv1a(canonicalJson(packSeed))}`,
    caseId: record.caseId,
    model: record.model,
    parameters: record.parameters,
    seed: record.seed,
    initialConditions: record.initialConditions,
    scenarios: record.scenarios,
    inputFingerprints,
    runFingerprints,
    result,
    comparison,
    demoReplay: replay,
    limitations: record.limitations,
    conclusion,
    missingFields,
    disclaimer: DISCLAIMER,
  };
}

/** Serializacja migawki do pobrania przez widza — lokalny plik, nie publikacja dowodu. */
export function serializeLocalSimulationSnapshotPack(pack: LocalSimulationSnapshotPack): string {
  return canonicalJson({ ...pack, engineVersion: DISCOVERY_ENGINE_VERSION });
}
