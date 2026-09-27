import { canonicalJson, fnv1a } from '../../events/hash';
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import { summariseAcquiredRegistration, type AcquisitionRegistrySummary } from './acquiredEvidenceRegistry';
import type { RetrievalOutcome } from './scientificSourceAccess';
import type { SourceBackedKnowledgeRecord } from '../molecular/sourceBackedKnowledgeRegistry';

/**
 * ACQUISITION → EVIDENCE → REGISTRY → MEMORY → LINEAGE → REPLAY.
 *
 * The last closure in the autonomous-acquisition chain: a real retrieval and
 * the registry records it produced become ONE Scientific Memory entry, with a
 * fingerprint that lets a later run prove it reproduces the SAME registration
 * from the SAME retrieval — not merely that the retrieval succeeded again.
 *
 * REPLAY HONESTY, same discipline as every other replay in this engine: the
 * fingerprint is built from the retrieval's own content hash (not re-fetched
 * bytes, which could legitimately change upstream) and the registered
 * records' identities. A different retrieval (even of the same URL, on a
 * different day) that yields different content is DRIFT, not silently
 * accepted as the same acquisition.
 */
export const ACQUISITION_MEMORY_VERSION = '1.0.0';

export interface AcquisitionLineage {
  sourceId: string;
  url: string;
  contentSha256: string;
  retrievedAt: string;
  registeredRecordIds: readonly string[];
  registrySummary: AcquisitionRegistrySummary;
  lineageFingerprint: string;
}

/**
 * Builds the lineage record from a real retrieval outcome and its registered
 * records. Throws if the outcome carries no content — an acquisition that
 * never actually retrieved anything has nothing to build lineage from.
 */
export function buildAcquisitionLineage(
  outcome: RetrievalOutcome,
  registered: readonly SourceBackedKnowledgeRecord[],
): AcquisitionLineage {
  if (outcome.contentSha256 === null) {
    throw new Error(`Cannot build acquisition lineage for "${outcome.sourceId}": retrieval ended in ${outcome.state}, no content was retrieved.`);
  }

  const registeredRecordIds = registered.map((r) => r.recordId).sort();
  const lineageFingerprint = fnv1a(canonicalJson({
    v: ACQUISITION_MEMORY_VERSION,
    sourceId: outcome.sourceId,
    url: outcome.url,
    contentSha256: outcome.contentSha256,
    registeredRecordIds,
  }));

  return {
    sourceId: outcome.sourceId,
    url: outcome.url,
    contentSha256: outcome.contentSha256,
    retrievedAt: outcome.retrievedAt,
    registeredRecordIds,
    registrySummary: summariseAcquiredRegistration(registered),
    lineageFingerprint,
  };
}

export interface AcquisitionReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
}

/**
 * Replays an acquisition: recomputes the lineage from a FRESH retrieval and
 * FRESH registration, and compares fingerprints. BLOCKED when the fresh
 * retrieval itself failed (nothing to compare); DRIFT when it succeeded but
 * produced different content or different registered records; MATCH only
 * when both are identical.
 */
export function replayAcquisitionLineage(
  saved: AcquisitionLineage,
  freshOutcome: RetrievalOutcome,
  freshRegistered: readonly SourceBackedKnowledgeRecord[],
): AcquisitionReplay {
  if (freshOutcome.contentSha256 === null) {
    return { status: 'BLOCKED', reason: `Replay retrieval of "${freshOutcome.sourceId}" did not succeed (state ${freshOutcome.state}: ${freshOutcome.reason}); there is nothing to compare against the saved lineage.` };
  }

  const recomputed = buildAcquisitionLineage(freshOutcome, freshRegistered);
  if (recomputed.lineageFingerprint !== saved.lineageFingerprint) {
    const contentChanged = recomputed.contentSha256 !== saved.contentSha256;
    return {
      status: 'DRIFT',
      reason: contentChanged
        ? `The source's content changed since the saved acquisition (sha256 ${saved.contentSha256.slice(0, 16)}... -> ${recomputed.contentSha256.slice(0, 16)}...). This is a real change upstream, not a bug.`
        : 'The same content produced a different set of registered records — the registration logic or its inputs changed since the run was saved.',
    };
  }

  return { status: 'MATCH', reason: '' };
}

export function saveAcquisitionToMemory(lineage: AcquisitionLineage): SavedExperiment {
  return saveExperiment({
    labId: 'autonomous-source-acquisition',
    experimentId: `${lineage.sourceId}:${lineage.lineageFingerprint}`,
    experimentName: `Autonomous acquisition — ${lineage.sourceId}`,
    params: {
      sourceId: lineage.sourceId,
      url: lineage.url,
      contentSha256: lineage.contentSha256,
      recordCount: lineage.registeredRecordIds.length,
    },
    stats: {
      registered: lineage.registrySummary.registered,
      primaryMeasured: lineage.registrySummary.primaryMeasured,
      modelPrediction: lineage.registrySummary.modelPrediction,
      inference: lineage.registrySummary.inference,
      distinctCompounds: lineage.registrySummary.distinctCompounds,
    },
    analysis: [
      { title: 'Source', kind: 'source', body: `${lineage.url} (retrieved ${lineage.retrievedAt}, sha256 ${lineage.contentSha256}).` },
      { title: 'Registration', kind: 'registry', body: lineage.registrySummary.summary },
    ],
    honesty: 'simplified',
    honestyNote: 'Every registered record traces to a real retrieved byte range (source URL, content hash, row index). MODEL_PREDICTION and PRIMARY_MEASURED records are never merged into one figure.',
    epistemicStatus: `ACQUIRED=${lineage.registrySummary.registered};MEASURED=${lineage.registrySummary.primaryMeasured};PREDICTED=${lineage.registrySummary.modelPrediction}`,
    assumptions: ['The retrieved source is trusted at the transport level (no credential, no access-control bypass) but not independently verified against its own publication.'],
  });
}
