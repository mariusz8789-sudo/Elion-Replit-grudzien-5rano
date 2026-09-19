/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import type { EvidenceRecord } from '../knowledge/evidenceTypes.js';

/**
 * COSMOS OBSERVER (D-130) — an authorised astronomical observation enters
 * the SAME EvidenceLedger as everything else: as an `observation` claim with
 * its source, version, timestamp and content hash; a newer version of the
 * same source is a NEW record that names what it supersedes, never an
 * overwrite. The visual cosmos may follow the newest record; the ledger
 * keeps every version. Nothing here fetches: the caller brings the data
 * and its terms. Derived interpretations are separate `model` claims.
 */
export interface CosmosObservationInput { readonly sourceId: string; readonly sourceUri: string; readonly datasetVersion: string; readonly observedAt: string | null; readonly contentHash: string; readonly summary: string; readonly objectIds: readonly string[]; readonly licenceNote: string; readonly retrievedBy: string; }
export interface CosmosUpdateResult { readonly recordId: string; readonly contentHash: string; readonly supersedes: string | null; readonly changed: readonly string[]; readonly unchanged: readonly string[]; readonly deduped: boolean; readonly visualUpdateAllowed: boolean; }

const KEY = (sourceId: string): string => `genesis://cosmos/${sourceId}`;

export function previousCosmosRecords(ledger: EvidenceLedger, sourceId: string): readonly EvidenceRecord[] { return ledger.getActive().filter((r) => r.sourceUrl.startsWith(KEY(sourceId) + '/')); }

export function ingestCosmosObservation(ledger: EvidenceLedger, input: CosmosObservationInput): CosmosUpdateResult {
  if (!input.sourceUri || !input.datasetVersion || !input.contentHash) throw new Error('COSMOS_OBSERVATION_REQUIRES_URI_VERSION_HASH');
  const history = previousCosmosRecords(ledger, input.sourceId);
  const same = history.find((r) => r.sourceUrl === `${KEY(input.sourceId)}/${input.datasetVersion}` && r.claim.includes(`hash=${input.contentHash} `));
  if (same) return { recordId: same.id, contentHash: same.contentHash, supersedes: same.claim.match(/supersedes=(\S+)/)?.[1]?.replace(/^none$/, '') || null, changed: [], unchanged: [...input.objectIds], deduped: true, visualUpdateAllowed: false };
  const previous = history.at(-1) ?? null;
  const prevObjects = previous ? (previous.claim.match(/objects=\[([^\]]*)\]/)?.[1] ?? '').split(',').filter(Boolean) : [];
  const changed = input.objectIds.filter((o) => !prevObjects.includes(o)); const unchanged = input.objectIds.filter((o) => prevObjects.includes(o));
  const res = ledger.addRecord({ sourceUrl: `${KEY(input.sourceId)}/${input.datasetVersion}`, sourceTimestamp: input.observedAt, claim: `Cosmos observation source=${input.sourceId} version=${input.datasetVersion} hash=${input.contentHash} objects=[${input.objectIds.join(',')}] supersedes=${previous?.id ?? 'none'} licence=${input.licenceNote} :: ${input.summary}`, claimType: 'observation', confidence: 0.9, provenance: { sourceKind: 'dataset', retrievedBy: input.retrievedBy, independentSourceIds: [] } });
  return { recordId: res.record.id, contentHash: res.record.contentHash, supersedes: previous?.id ?? null, changed, unchanged, deduped: res.deduped, visualUpdateAllowed: !res.deduped };
}

/** A derived interpretation of an observation is a MODEL claim that cites it — never merged into the observation record. */
export function recordCosmosInterpretation(ledger: EvidenceLedger, observationRecordId: string, interpretation: string, retrievedBy: string): string {
  return ledger.addRecord({ sourceUrl: `genesis://cosmos-interpretation/${observationRecordId}`, sourceTimestamp: null, claim: `Interpretation of ${observationRecordId}: ${interpretation}`, claimType: 'model', confidence: 0.5, provenance: { sourceKind: 'dataset', retrievedBy, independentSourceIds: [observationRecordId] } }).record.id;
}
