import { describe, expect, it } from 'vitest';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import { replayDiscoveryCase } from '../core/discovery/discoveryReplay';
import type { DiscoveryCase, DiscoveryCaseSpec } from '../core/discovery/discoveryCase';
import { EVIDENCE_STORE_SCHEMA_VERSION, InMemoryEvidenceStore } from '../core/discovery/evidenceStore';
import { computeEvidencePackSha256 } from '../core/discovery/evidenceCrypto';
import { codeCommitHash } from '../core/build/commitHash';

/**
 * RUNTIME PROOF — one real Genesis experiment, saved as evidence, replayed
 * twice: once as-is (MATCH) and once against a tampered stored record
 * (DRIFT). This is the exact pipeline requested for the Evidence & Replay
 * integration:
 *
 *   EXPERIMENT → CONFIG → MODEL VERSION → SEED → PARAMETERS
 *   → INPUT FINGERPRINT → RESULT FINGERPRINT → EVIDENCE PACK (SHA-256)
 *   → REPLAY → MATCH / DRIFT
 *
 * Every fingerprint and hash below is computed by calling the real,
 * untouched Discovery Engine and the new evidenceCrypto module — nothing is
 * hand-written or hardcoded to force a particular verdict.
 */
const conditions = { nAgents: 200, initialInfected: 8, seed: 4242, days: 45, stepsPerDay: 4 };

const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy redukcja kontaktów obniża szczyt zakażeń względem wariantu bazowego?',
  hypothesis: {
    statement: 'CONTACT_REDUCTION obniża szczytową liczbę zakaźnych względem BASELINE.',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Mniej kontaktów ogranicza łańcuch transmisji.' },
    assumptions: ['Redukcja kontaktów jest przestrzegana przez cały przebieg.'],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'CONTACT_REDUCTION',
  initialConditions: conditions,
  ...over,
});

describe('Evidence & Replay integration — one real experiment through the full pipeline', () => {
  it('runs a real BASELINE vs INTERVENTION experiment with full config → fingerprint → evidence chain', () => {
    const record = runDiscoveryCase(spec());

    // CONFIGURATION / MODEL VERSION / SEED / PARAMETERS
    expect(record.model.modelId).toBe('epidemic-city');
    expect(record.model.modelVersion).toBeTruthy();
    expect(record.seed).toBe(4242);
    expect(record.scenarios).toEqual({ baseline: 'BASELINE', variant: 'CONTACT_REDUCTION' });

    // INPUT / RESULT FINGERPRINT — real, non-empty, one per arm.
    expect(record.inputFingerprint).toBeTruthy();
    for (const arm of record.arms) {
      expect(arm.run.inputFingerprint).toBeTruthy();
      expect(arm.run.resultFingerprint).toBeTruthy();
    }

    // EVIDENCE PACK — complete (no missing fields) for a real, executable case.
    expect(record.evidence).not.toBeNull();
    expect(record.evidence!.missingFields).toEqual([]);
  });

  it('MATCH: saving evidence and replaying the unmodified record reproduces it bit-for-bit', async () => {
    const record = runDiscoveryCase(spec());
    const store = new InMemoryEvidenceStore();
    const sha256 = await computeEvidencePackSha256(record.evidence!);
    await store.save({ schemaVersion: EVIDENCE_STORE_SCHEMA_VERSION, record, sha256, codeCommitHash: codeCommitHash(), savedAt: Date.now() });

    const stored = await store.load(record.caseId);
    expect(stored).not.toBeNull();

    const replay = replayDiscoveryCase(stored!.record);
    expect(replay.status).toBe('MATCH');
    expect(replay.arms.every((a) => a.expectedRunFingerprint === a.actualRunFingerprint)).toBe(true);

    // The SHA-256 over the stored evidence pack is itself reproducible from the same content.
    const recomputed = await computeEvidencePackSha256(stored!.record.evidence!);
    expect(recomputed).toBe(sha256);
  });

  it('DRIFT: a controlled change to the stored record is caught by replay, with the exact differing field named', async () => {
    const record = runDiscoveryCase(spec());
    const store = new InMemoryEvidenceStore();
    const sha256 = await computeEvidencePackSha256(record.evidence!);
    await store.save({ schemaVersion: EVIDENCE_STORE_SCHEMA_VERSION, record, sha256, codeCommitHash: codeCommitHash(), savedAt: Date.now() });
    const stored = await store.load(record.caseId);

    // The controlled change: the stored record now claims a different peak
    // than what a fresh re-execution of the SAME inputs actually produces.
    const tampered: DiscoveryCase = {
      ...stored!.record,
      arms: [
        {
          ...stored!.record.arms[0],
          run: {
            ...stored!.record.arms[0].run,
            summary: { ...stored!.record.arms[0].run.summary!, peakInfectious: stored!.record.arms[0].run.summary!.peakInfectious + 500 },
            resultFingerprint: 'tampered-fingerprint',
          },
        },
        stored!.record.arms[1],
      ],
    };

    const replay = replayDiscoveryCase(tampered);
    expect(replay.status).toBe('DRIFT');
    const fields = replay.arms.flatMap((a) => a.differences.map((d) => d.field));
    expect(fields).toContain('summary.peakInfectious');

    // The untampered original, from the same store, still replays as MATCH —
    // proving DRIFT came from the controlled change, not from flaky replay.
    const untamperedReplay = replayDiscoveryCase(stored!.record);
    expect(untamperedReplay.status).toBe('MATCH');
  });

  it('the evidence SHA-256 changes when the underlying evidence pack changes, and stays stable when it does not', async () => {
    const baseline = runDiscoveryCase(spec());
    const sameAgain = runDiscoveryCase(spec()); // same seed/params → same everything, deterministic model
    const differentSeed = runDiscoveryCase(spec({ initialConditions: { ...conditions, seed: 1 } }));

    const hashA = await computeEvidencePackSha256(baseline.evidence!);
    const hashB = await computeEvidencePackSha256(sameAgain.evidence!);
    const hashC = await computeEvidencePackSha256(differentSeed.evidence!);

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it('records the real build commit hash alongside the run, not a fabricated placeholder', async () => {
    const record = runDiscoveryCase(spec());
    const store = new InMemoryEvidenceStore();
    const hash = codeCommitHash();
    await store.save({ schemaVersion: EVIDENCE_STORE_SCHEMA_VERSION, record, sha256: null, codeCommitHash: hash, savedAt: Date.now() });
    const stored = await store.load(record.caseId);
    expect(stored!.codeCommitHash).toBe(hash);
    expect(stored!.codeCommitHash === 'NOT_AVAILABLE' || /^[0-9a-f]{40}$/.test(stored!.codeCommitHash) || stored!.codeCommitHash.startsWith('NOT_AVAILABLE:')).toBe(true);
  });
});
