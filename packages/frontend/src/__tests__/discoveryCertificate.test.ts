import { describe, expect, it } from 'vitest';
import { issueCertificate, printCertificate, type IssueCertificateInput } from '../core/agent/discoveryCertificate';
import { ALL_SELF_FALSIFICATION_PROBES, type DiscoveryRecord, type NoveltyEvidence, type SelfFalsificationReport } from '../core/agent/discoveryContracts';
import { createPredictionRegistry, registerPrediction } from '../core/agent/predictionRegistry';

const NO_KNOWN_PRIOR: NoveltyEvidence = {
  l1InternalMemory: 'NOVEL_WITHIN_CHECKED_CORPUS', l2PreregisteredCorpus: 'NOVEL_WITHIN_CHECKED_CORPUS',
  l3PinnedPublicDatasets: 'NOVEL_WITHIN_CHECKED_CORPUS', l4DeclaredAnchors: 'NOVEL_WITHIN_CHECKED_CORPUS',
  l5ExternalLiteratureSearch: 'NO_KNOWN_PRIOR_FOUND', l6PostDiscoveryRecheck: 'NO_KNOWN_PRIOR_FOUND',
  overall: 'NO_KNOWN_PRIOR_FOUND', searchedCorpus: [], matchedPriorArt: [], unresolvedMatches: [],
  limitations: ['L5/L6 coverage is bounded to two corpora; absence of a match is not proof of absence.'], confidence: 0.6,
};

const ALL_PROBES_PASS: SelfFalsificationReport = {
  probes: ALL_SELF_FALSIFICATION_PROBES.map((name) => ({ name, method: 'DETERMINISTIC_PROBE' as const, result: 'PASS' as const, evidenceRefs: [], detail: 'ok' })),
  allPassed: true, reportFingerprint: 'sf-fp',
};

function makeRecord(overrides: Partial<DiscoveryRecord> = {}): DiscoveryRecord {
  return {
    recordId: 'rec-1', campaignId: 'camp-1', directionId: 'dir-1', status: 'DISCOVERY_CANDIDATE', strategy: 'RESIDUAL', anomaly: null,
    chain: [], preregFreeze: { hypothesisFingerprint: 'h', predictionFingerprint: 'p', frozenAt: 1000 },
    noveltyEvidence: NO_KNOWN_PRIOR, replication: null, selfFalsification: ALL_PROBES_PASS,
    graphRootId: 'root-1', externalValidation: 'NOT_SOUGHT', outcomeFingerprint: 'out-1', replayHandle: 'replay-1',
    ...overrides,
  };
}

const LADDER_INPUT: Omit<IssueCertificateInput['ladderInput'], never> = {
  replay: 'PASS', heldoutPrediction: 'NOT_ATTEMPTED', predictionOrdering: 'NOT_ATTEMPTED',
  independentImplementation: 'NOT_ATTEMPTED', orthogonalMethod: 'NOT_ATTEMPTED', causalEvidence: 'NOT_ATTEMPTED', externalAudit: 'NOT_ATTEMPTED',
};

function baseInput(overrides: Partial<IssueCertificateInput> = {}): IssueCertificateInput {
  return {
    record: makeRecord(), researchQuestion: 'Does X predict Y in domain Z?', ladderInput: LADDER_INPUT,
    causalInput: null, predictions: [], whatWouldChangeVerdict: ['A disjoint independent-dataset replication that fails.'],
    issuedAt: 1_000_000, supersedes: null,
    ...overrides,
  };
}

describe('issueCertificate — refuses an unfalsifiable or unlabelled certificate', () => {
  it('rejects an empty research question', () => {
    expect(() => issueCertificate(baseInput({ researchQuestion: '  ' }))).toThrow(/researchQuestion/);
  });

  it('rejects an empty whatWouldChangeVerdict — every certificate must be falsifiable', () => {
    expect(() => issueCertificate(baseInput({ whatWouldChangeVerdict: [] }))).toThrow(/whatWouldChangeVerdict/);
  });
});

describe('issueCertificate — composes, does not recompute', () => {
  it('renderedStatus always carries tier and level, never a bare status', () => {
    const cert = issueCertificate(baseInput());
    expect(cert.renderedStatus).toContain('DISCOVERY_CANDIDATE');
    expect(cert.renderedStatus).toMatch(/Tier/);
    expect(cert.renderedStatus).toMatch(/max P\d/);
  });

  it('causalLevel is NOT_ASSESSED when no causal input is supplied', () => {
    const cert = issueCertificate(baseInput());
    expect(cert.causalLevel).toBe('NOT_ASSESSED');
    expect(cert.causalReasons).toEqual([]);
  });

  it('noveltyLimitations is read directly from the record, never invented', () => {
    const cert = issueCertificate(baseInput());
    expect(cert.noveltyLimitations).toEqual(NO_KNOWN_PRIOR.limitations);
  });

  it('predictions summary reduces registered predictions to id+claim only', () => {
    const registry = createPredictionRegistry('t');
    const p = registerPrediction(registry, { predictionId: 'p1', claim: 'offset positive', value: 1, interval: { low: 0, high: 2 }, discriminatesAgainst: ['null'], frozenAt: 1 });
    const cert = issueCertificate(baseInput({ predictions: [p] }));
    expect(cert.predictions).toEqual([{ predictionId: 'p1', claim: 'offset positive' }]);
  });
});

describe('fingerprint discipline', () => {
  it('excludes issuedAt (wall clock)', () => {
    const a = issueCertificate(baseInput({ issuedAt: 1 }));
    const b = issueCertificate(baseInput({ issuedAt: 999999999 }));
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.certificateId).toBe(b.certificateId);
  });

  it('changes when the ladder result changes', () => {
    const a = issueCertificate(baseInput());
    const b = issueCertificate(baseInput({ ladderInput: { ...LADDER_INPUT, replay: 'FAIL' } }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe('append-only upgrade chain', () => {
  it('a second certificate can reference the first via supersedes, without mutating it', () => {
    const first = issueCertificate(baseInput());
    const second = issueCertificate(baseInput({
      record: makeRecord({ status: 'FAILED_DISCOVERY', replication: null }),
      supersedes: first.certificateId,
    }));
    expect(second.supersedes).toBe(first.certificateId);
    expect(first.supersedes).toBeNull(); // untouched
    expect(first.certificateId).not.toBe(second.certificateId);
  });
});

describe('printCertificate — prose built only from fields', () => {
  it('never emits a status-bearing bare "DISCOVERY" without a following "(Tier" -- the fixed title "GENESIS DISCOVERY CERTIFICATE" is a proper noun, not a status claim, and is the only allowed exception', () => {
    const cert = issueCertificate(baseInput({ record: makeRecord({ status: 'DISCOVERY' }) }));
    const text = printCertificate(cert);
    const regex = /DISCOVERY(?!_)/g;
    let match: RegExpExecArray | null;
    let checked = 0;
    while ((match = regex.exec(text)) !== null) {
      const context = text.slice(Math.max(0, match.index - 8), match.index + 20);
      if (context.startsWith('GENESIS DISCOVERY')) continue; // the fixed title, not a status
      checked += 1;
      expect(context).toMatch(/DISCOVERY \(Tier/);
    }
    expect(checked).toBeGreaterThan(0); // the test actually exercised the status line, not just the title
  });

  it('includes the research question, status, gate results, and what-would-change-verdict verbatim', () => {
    const cert = issueCertificate(baseInput());
    const text = printCertificate(cert);
    expect(text).toContain(cert.researchQuestion);
    expect(text).toContain(cert.renderedStatus);
    expect(text).toContain(cert.whatWouldChangeVerdict[0]);
    for (const level of Object.keys(cert.ladder.gateResults)) expect(text).toContain(level);
  });
});
