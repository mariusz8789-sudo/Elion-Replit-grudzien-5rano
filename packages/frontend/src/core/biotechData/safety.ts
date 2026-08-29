import type { SafetySignal } from '../biotechDiscoveryContract';
import safetyRecord from './pubchem-ghs-2519.json';

export const PUBCHEM_GHS_2519_SOURCE_URL = safetyRecord.sourceUrl;

export function mapPinnedPubChemCaffeineSafety(): SafetySignal {
  if (
    safetyRecord.source !== 'PubChem PUG View' ||
    safetyRecord.compoundId !== 'pubchem:CID:2519' ||
    safetyRecord.referenceNumber !== 257 ||
    safetyRecord.signalWord !== 'Danger' ||
    safetyRecord.hazardStatements.length !== 3
  ) {
    throw new Error('Pinned PubChem GHS fixture is incomplete or has unexpected identity fields.');
  }
  const source = {
    source: safetyRecord.source,
    sourceId: safetyRecord.sourceId,
    evidenceType: 'GHS hazard classification record',
    status: 'LITERATURE_SUPPORTED' as const,
    uncertainty: 'GHS classification is a hazard communication record; it is not a dose-response estimate, clinical safety conclusion or individualized medical advice.',
    sourceUrl: safetyRecord.sourceUrl,
    sourceVersion: safetyRecord.sourceVersion,
    retrievedAt: safetyRecord.retrievedAt,
  };
  return {
    kind: 'safety-signal',
    id: safetyRecord.sourceId,
    namespace: 'pubchem',
    label: `Caffeine GHS classification (${safetyRecord.signalWord})`,
    status: 'LITERATURE_SUPPORTED',
    signalType: 'toxicity',
    description: safetyRecord.hazardStatements.join('; '),
    evidenceQuality: 'MODERATE',
    uncertainty: source.uncertainty,
    provenance: [source],
  };
}
