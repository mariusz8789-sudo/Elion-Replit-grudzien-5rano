import { canonicalJson, fnv1a } from '../events/hash';
import type { ScenarioSummary } from '../simulation/scenarioEngine';
import {
  DISCOVERY_ENGINE_VERSION,
  type DiscoveryCase,
  type DiscoveryComparison,
  type DiscoveryConclusion,
  type DiscoveryEvidencePack,
  type DiscoveryReplay,
} from './discoveryCase';

/**
 * DISCOVERY EVIDENCE PACK — automatyczny, przenośny zapis dowodu jednej sprawy.
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
 * jakości nie przepuści sprawy do EVIDENCE_VERIFIED. Brak dowodu jest widoczny,
 * a nie zamaskowany.
 */

export const DISCOVERY_EVIDENCE_PACK_VERSION = '1.0.0';

const DISCLAIMER =
  'Pakiet dowodowy rejestruje faktyczne przebiegi modelu, ich parametry, ziarno i odciski. Wniosek obowiązuje wyłącznie w granicach prerejestrowanego kryterium i użytego modelu; nie jest odkryciem ani twierdzeniem o świecie rzeczywistym.';

function collectMissing(
  record: DiscoveryCase,
  comparison: DiscoveryComparison,
  replay: DiscoveryReplay,
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
  if (replay.status !== 'MATCH' && replay.status !== 'WITHIN_TOLERANCE') missing.push(`replay verification (${replay.status})`);
  if (record.limitations.length === 0) missing.push('limitations');
  if (conclusion === null) missing.push('conclusion');
  return missing;
}

/**
 * Buduje pakiet dowodowy ze sprawy. Nic tu nie jest przeliczane od nowa —
 * pakiet jest projekcją tego, co sprawa już zawiera.
 */
export function createDiscoveryEvidencePack(
  record: DiscoveryCase,
  comparison: DiscoveryComparison,
  replay: DiscoveryReplay,
  conclusion: DiscoveryConclusion,
): DiscoveryEvidencePack {
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
    contractVersion: DISCOVERY_EVIDENCE_PACK_VERSION,
    caseId: record.caseId,
    model: record.model,
    inputFingerprints,
    runFingerprints,
    comparison: comparison.status,
    replay: replay.status,
    verdict: conclusion.verdict,
  };

  return {
    contractVersion: DISCOVERY_EVIDENCE_PACK_VERSION,
    evidencePackId: `dpack_${fnv1a(canonicalJson(packSeed))}`,
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
    replay,
    limitations: record.limitations,
    conclusion,
    missingFields,
    disclaimer: DISCLAIMER,
  };
}

/** Serializacja do przenoszenia dowodu poza aplikację. */
export function serializeDiscoveryEvidencePack(pack: DiscoveryEvidencePack): string {
  return canonicalJson({ ...pack, engineVersion: DISCOVERY_ENGINE_VERSION });
}
