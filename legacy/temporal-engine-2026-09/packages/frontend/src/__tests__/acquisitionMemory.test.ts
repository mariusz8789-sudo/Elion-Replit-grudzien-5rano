import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeHttpSourceConnector } from '../core/discovery/sources/httpSourceConnector.node';
import { ingestCsvDataset } from '../core/discovery/sources/datasetEvidenceIngestion';
import { registerAcquiredEvidence } from '../core/discovery/sources/acquiredEvidenceRegistry';
import {
  buildAcquisitionLineage,
  replayAcquisitionLineage,
  saveAcquisitionToMemory,
  type AcquisitionLineage,
} from '../core/discovery/sources/acquisitionMemory';
import type { RetrievalOutcome, SourceDescriptor } from '../core/discovery/sources/scientificSourceAccess';
import type { SourceBackedKnowledgeRecord } from '../core/discovery/molecular/sourceBackedKnowledgeRegistry';

/**
 * Closes the memory/lineage chain for autonomous acquisition, over the SAME
 * real Delaney/ESOL retrieval already proven in
 * `autonomousSourceAcquisition.test.ts`: real retrieval -> real CSV
 * extraction -> registered evidence -> Scientific Memory -> real replay.
 */
const RUN_TIMEOUT_MS = 60_000;

const DELANEY: SourceDescriptor = {
  sourceId: 'delaney-esol', kind: 'PUBLIC_DATASET',
  url: 'https://raw.githubusercontent.com/deepchem/deepchem/master/datasets/delaney-processed.csv',
  citation: 'Delaney JS 2004', accessTerms: 'public', requiresCredential: false,
};

let outcome: RetrievalOutcome;
let registered: readonly SourceBackedKnowledgeRecord[];
let lineage: AcquisitionLineage;

beforeAll(() => {
  const connector = createNodeHttpSourceConnector({ timeoutSeconds: 30 });
  outcome = connector.retrieve(DELANEY);
  const ingestion = ingestCsvDataset(outcome, DELANEY, {
    datasetId: 'delaney-esol-v1', subjectColumn: 'Compound ID', structureColumn: 'smiles',
    columns: [{ header: 'measured log solubility in mols per litre', kind: 'MEASURED', unit: 'log mol/L', meaning: 'measured solubility' }],
  });
  registered = registerAcquiredEvidence(ingestion.records, {
    effectId: 'aqueous-solubility', targetId: null, assayName: 'aqueous solubility', assayModel: 'Delaney/ESOL dataset',
  });
  lineage = buildAcquisitionLineage(outcome, registered);
}, RUN_TIMEOUT_MS);

describe('Acquisition -> memory -> lineage -> replay, real retrieval', () => {
  it('builds a real lineage fingerprint from the actual retrieved content', () => {
    expect(lineage.contentSha256).toBe(outcome.contentSha256);
    expect(lineage.registeredRecordIds.length).toBeGreaterThan(1000);
    expect(lineage.lineageFingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it('refuses to build lineage for a retrieval that carried no content', () => {
    const failed: RetrievalOutcome = { ...outcome, state: 'BLOCKED', contentSha256: null, content: null };
    expect(() => buildAcquisitionLineage(failed, registered)).toThrow(/no content was retrieved/);
  });

  it('saves the acquisition to Scientific Memory with real stats', () => {
    const saved = saveAcquisitionToMemory(lineage);
    expect(saved.epistemicStatus).toContain(`ACQUIRED=${lineage.registrySummary.registered}`);
    expect(saved.honestyNote).toContain('MODEL_PREDICTION and PRIMARY_MEASURED');
  });

  it('replays MATCH when re-retrieving and re-registering the identical content', () => {
    const connector = createNodeHttpSourceConnector({ timeoutSeconds: 30 });
    const freshOutcome = connector.retrieve(DELANEY);
    const freshIngestion = ingestCsvDataset(freshOutcome, DELANEY, {
      datasetId: 'delaney-esol-v1', subjectColumn: 'Compound ID', structureColumn: 'smiles',
      columns: [{ header: 'measured log solubility in mols per litre', kind: 'MEASURED', unit: 'log mol/L', meaning: 'measured solubility' }],
    });
    const freshRegistered = registerAcquiredEvidence(freshIngestion.records, {
      effectId: 'aqueous-solubility', targetId: null, assayName: 'aqueous solubility', assayModel: 'Delaney/ESOL dataset',
    });
    const replay = replayAcquisitionLineage(lineage, freshOutcome, freshRegistered);
    expect(replay.status).toBe('MATCH');
  }, RUN_TIMEOUT_MS);

  it('replays BLOCKED when the fresh retrieval fails, never silently comparing against nothing', () => {
    const failedRetrieval: RetrievalOutcome = { ...outcome, state: 'BLOCKED', contentSha256: null, content: null, reason: 'simulated failure for this test' };
    const replay = replayAcquisitionLineage(lineage, failedRetrieval, []);
    expect(replay.status).toBe('BLOCKED');
  });

  it('replays DRIFT when the registered records differ from the saved lineage', () => {
    const differentRegistration = registered.slice(0, registered.length - 1);
    const replay = replayAcquisitionLineage(lineage, outcome, differentRegistration);
    expect(replay.status).toBe('DRIFT');
  });
});
