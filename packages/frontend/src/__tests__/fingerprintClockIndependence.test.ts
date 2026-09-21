import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createTrialRegistry, recordTrial, registryFingerprint as trialRegistryFingerprint } from '../core/agent/trialRegistry';
import { createPredictionRegistry, registerPrediction, registryFingerprint as predictionRegistryFingerprint } from '../core/agent/predictionRegistry';
import { recordFalsification, resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { recordKnownFinding, resetNoveltyGateRegistryForTests } from '../core/agent/noveltyGate';
import { runGovDrugDiscoveryCampaign } from '../core/biotechData/govDrugDiscoveryCampaign';
import { runGovDrugDiscoveryE2E } from '../core/biotechData/govDrugDiscoveryE2E';
import { issueCertificate } from '../core/agent/discoveryCertificate';
import { ALL_SELF_FALSIFICATION_PROBES, type DiscoveryRecord, type NoveltyEvidence } from '../core/agent/discoveryContracts';
import type { ModelSpec } from '../core/agent/modelSpace';
import { createHypothesis, updateConfidence } from '../core/experimentFabric/beliefRevision';

/**
 * NO FINGERPRINT MAY DEPEND ON THE WALL CLOCK.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS BEHAVIOURAL RATHER THAN A GREP. A real
 * bug shipped in Phase F: `literatureNoveltyAdapter.ts` set a
 * `new Date().toISOString()` timestamp, that timestamp travelled into
 * `noveltyEvidence.searchedCorpus[]`, and from there into
 * `genuineDiscoveryOrchestrator`'s `outcomeFingerprint`. Two runs of the same
 * campaign then disagreed whenever they straddled a millisecond — which made
 * replay, the thing this whole codebase sells, quietly untrue. The existing
 * determinism test passed for months by luck.
 *
 * A LEXICAL SCANNER WOULD NOT HAVE CAUGHT IT. The clock call and the hash call
 * were in different files, connected by a value passed through two layers. Any
 * "no Date.now() on the same line as fnv1a()" rule reports clean on that code.
 * So this file does the only thing that actually works: it RUNS each
 * fingerprint-producing entry point twice, with the system clock moved a full
 * day between the runs, and demands the same fingerprint both times.
 *
 * WHAT THIS DOES NOT CLAIM. It covers the entry points listed below, not every
 * hash in the repo. A fingerprint path added later is not automatically
 * protected — it has to be added here. The repo-wide audit behind this file
 * (13 modules that both hash and touch the clock, examined one by one) found
 * exactly one real leak, the one above, plus several modules that already
 * carried explicit comments about this very rule: `falsifiedModelRegistry.ts`
 * had the identical bug found and fixed earlier (fingerprints e070289f vs
 * dfbba267), `hypothesisLoop.ts` documents excluding `createdAt`, and
 * `ScienceChat.tsx` documents deriving ids from content "never Date.now()".
 *
 * THE RULE THOSE MODULES ENCODE, stated once: a timestamp is PROVENANCE — it
 * belongs in the record, and may gate ordering (`assertFreezePrecedesDataset`
 * reads `frozenAt` and is right to). It must never be an input to a hash. If a
 * fingerprint genuinely needs a time, it takes the pinned one from a freeze
 * token, never the clock at the moment of computation.
 */

const DAY_ONE = new Date('2026-01-01T00:00:00.000Z');
const DAY_TWO = new Date('2026-06-15T12:34:56.789Z');

/** Runs `produce` twice under two very different system clocks and returns both fingerprints. */
function underTwoClocks<T>(produce: () => T): { readonly first: T; readonly second: T } {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(DAY_ONE);
    const first = produce();
    vi.setSystemTime(DAY_TWO);
    const second = produce();
    return { first, second };
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
  resetNoveltyGateRegistryForTests();
});

describe('registries built this session', () => {
  it('TrialRegistry fingerprint is identical across a six-month clock jump', () => {
    const { first, second } = underTwoClocks(() => {
      const r = createTrialRegistry('clock-test');
      recordTrial(r, { kind: 'CANDIDATE_EVALUATION', subject: 'CHEMBL1', stage: 'TIER_1', outcome: 'SURVIVED', reason: 'passed' });
      return trialRegistryFingerprint(r);
    });
    expect(first).toBe(second);
  });

  it('PredictionRegistry fingerprint is identical across a six-month clock jump', () => {
    const { first, second } = underTwoClocks(() => {
      const r = createPredictionRegistry('clock-test');
      registerPrediction(r, { predictionId: 'p1', claim: 'x', value: 1, interval: { low: 0, high: 2 }, discriminatesAgainst: ['null'], frozenAt: 1000 });
      return predictionRegistryFingerprint(r);
    });
    expect(first).toBe(second);
  });
});

describe('pre-existing registries (audited, expected clean)', () => {
  const SPEC: ModelSpec = { id: 'm', terms: [{ basis: 'LINEAR', variable: 'x' }], lineage: null };

  it('falsifiedModelRegistry record fingerprint is clock-independent', () => {
    const { first, second } = underTwoClocks(() => {
      resetFalsifiedModelRegistryForTests();
      const evidence = updateConfidence(
        createHypothesis('h-clock', { metric: 'rss', relation: 'less-than', rationale: 'test fixture' }, 0.5),
        'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'decisively beaten by a rival model', 1,
      );
      return recordFalsification({
        spec: SPEC, scope: { domain: 'test', assumptions: ['iid noise'], boundary: 'x in [1, 10]' },
        reusableAs: 'VARIANT_ONLY', evidence, campaignId: 'c', round: 1, observationIds: ['o1'],
      }).fingerprint;
    });
    expect(first).toBe(second);
  });

  it('noveltyGate known-finding fingerprint is clock-independent', () => {
    const { first, second } = underTwoClocks(() => {
      resetNoveltyGateRegistryForTests();
      return recordKnownFinding({
        spec: SPEC, source: 'DECLARED_PUBLIC_ANCHOR', campaignId: null,
        summary: 'a declared anchor', scope: { domain: 'test', assumptions: [], boundary: 'test' },
      }).fingerprint;
    });
    expect(first).toBe(second);
  });
});

describe('the government drug-discovery chain', () => {
  it('GOV-DRUG-DISCOVERY-E2E-01 run fingerprint is clock-independent', () => {
    const { first, second } = underTwoClocks(() => runGovDrugDiscoveryE2E().runFingerprint);
    expect(first).toBe(second);
  });

  it('GOV-DRUG-DISCOVERY-CAMPAIGN-01 campaign and trial-registry fingerprints are clock-independent', () => {
    const { first, second } = underTwoClocks(() => {
      const run = runGovDrugDiscoveryCampaign();
      return { campaign: run.campaignFingerprint, trials: run.trialRegistryFingerprint };
    });
    expect(first.campaign).toBe(second.campaign);
    expect(first.trials).toBe(second.trials);
  });
});

describe('the discovery certificate', () => {
  const NOVELTY: NoveltyEvidence = {
    l1InternalMemory: 'NOVEL_WITHIN_CHECKED_CORPUS', l2PreregisteredCorpus: 'NOVEL_WITHIN_CHECKED_CORPUS',
    l3PinnedPublicDatasets: 'NOVEL_WITHIN_CHECKED_CORPUS', l4DeclaredAnchors: 'NOVEL_WITHIN_CHECKED_CORPUS',
    l5ExternalLiteratureSearch: 'NO_KNOWN_PRIOR_FOUND', l6PostDiscoveryRecheck: 'NO_KNOWN_PRIOR_FOUND',
    overall: 'NO_KNOWN_PRIOR_FOUND', searchedCorpus: [], matchedPriorArt: [], unresolvedMatches: [],
    limitations: ['bounded search'], confidence: 0.6,
  };
  const RECORD: DiscoveryRecord = {
    recordId: 'rec-1', campaignId: 'c', directionId: 'd', status: 'DISCOVERY_CANDIDATE', strategy: 'RESIDUAL', anomaly: null,
    chain: [], preregFreeze: { hypothesisFingerprint: 'h', predictionFingerprint: 'p', frozenAt: 1000 },
    noveltyEvidence: NOVELTY, replication: null,
    selfFalsification: { probes: ALL_SELF_FALSIFICATION_PROBES.map((name) => ({ name, method: 'DETERMINISTIC_PROBE' as const, result: 'PASS' as const, evidenceRefs: [], detail: 'ok' })), allPassed: true, reportFingerprint: 'sf' },
    graphRootId: 'g', externalValidation: 'NOT_SOUGHT', outcomeFingerprint: 'o', replayHandle: 'r',
  };

  it('certificate fingerprint and id are clock-independent even though issuedAt differs', () => {
    const { first, second } = underTwoClocks(() => issueCertificate({
      record: RECORD, researchQuestion: 'q?',
      ladderInput: { replay: 'PASS', heldoutPrediction: 'NOT_ATTEMPTED', predictionOrdering: 'NOT_ATTEMPTED', independentImplementation: 'NOT_ATTEMPTED', orthogonalMethod: 'NOT_ATTEMPTED', causalEvidence: 'NOT_ATTEMPTED', externalAudit: 'NOT_ATTEMPTED' },
      causalInput: null, predictions: [], whatWouldChangeVerdict: ['a failed replication'],
      issuedAt: Date.now(), supersedes: null,
    }));
    // issuedAt genuinely differs between the two runs — that is the point.
    expect(first.issuedAt).not.toBe(second.issuedAt);
    // ...and the fingerprint does not.
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.certificateId).toBe(second.certificateId);
  });
});
