import { describe, expect, it } from 'vitest';
import {
  isWellFormedCyberInvestigation,
  type CyberInvestigationResult,
} from '../core/agent/cyberInvestigation';
import {
  buildSavedCyberInvestigation,
  isSavedCyberInvestigation,
  replaySavedCyberInvestigation,
  saveCyberInvestigationToMemory,
} from '../core/scienceMemory';

/**
 * SCAFFOLDING, NOT THE FULL CYBER E2E: this proves the SEVENTH Science
 * Memory shape (persistence, validation, self-consistency replay) on a
 * hand-built fixture — the same convention `mechanismCompositionMemory.test.ts`
 * uses for its own shape. It does NOT prove hypothesis generation, real test
 * execution against a synthetic target, or attack-path construction — those
 * live in the not-yet-built investigation engine (see `cyberInvestigation.ts`'s
 * module doc for exactly what is scaffolded here vs. what still needs a
 * real engine).
 */

function wellFormedFixture(overrides: Partial<CyberInvestigationResult> = {}): CyberInvestigationResult {
  return {
    investigationId: 'inv-1',
    goal: 'Test the login endpoint for an authentication bypass.',
    observations: [
      { observationId: 'obs-1', endpoint: '/admin', method: 'GET', statusCode: 200, responseSummary: 'Admin panel returned without auth header.' },
    ],
    attackSurface: {
      assets: [{ assetId: 'asset-admin', kind: 'AUTH_BOUNDARY', derivedFromObservationIds: ['obs-1'] }],
      trustBoundaries: ['public->admin'],
    },
    hypotheses: [
      {
        hypothesisId: 'hyp-auth-bypass',
        kind: 'AUTH_BYPASS',
        statement: '/admin is reachable without authentication.',
        derivedFromAssetIds: ['asset-admin'],
        falsifier: { predictedObservable: { statusCode: 200 }, falsifyingObservable: { statusCodeIn: [401, 403] } },
      },
    ],
    testResults: [
      {
        testId: 'test-1', hypothesisId: 'hyp-auth-bypass', executedAt: '2026-09-10T00:00:00.000Z',
        observedResult: { statusCode: 200, body: 'admin panel', responseSummary: 'ADMIN_PANEL_SECRET' },
        provenance: 'SIMULATED',
      },
    ],
    verdicts: [
      { hypothesisId: 'hyp-auth-bypass', assessment: 'SUPPORTED_WITHIN_PROTOCOL', reasoning: 'Observed status 200 matches the predicted observable.' },
    ],
    attackPath: null,
    remediation: null,
    retestResult: null,
    retestVerdict: null,
    ...overrides,
  };
}

describe('isWellFormedCyberInvestigation', () => {
  it('accepts a well-formed fixture', () => {
    expect(isWellFormedCyberInvestigation(wellFormedFixture())).toBe(true);
  });

  it('rejects a hypothesis derived from an asset that was never declared (anti-fabrication)', () => {
    const bad = wellFormedFixture({
      hypotheses: [
        {
          hypothesisId: 'hyp-x',
          kind: 'AUTH_BYPASS',
          statement: 'x',
          derivedFromAssetIds: ['asset-that-does-not-exist'],
          falsifier: { predictedObservable: { statusCode: 200 }, falsifyingObservable: { statusCode: 403 } },
        },
      ],
    });
    expect(isWellFormedCyberInvestigation(bad)).toBe(false);
  });

  it('rejects a hypothesis with no derivedFromAssetIds at all (hardcoded, not observed)', () => {
    const bad = wellFormedFixture({
      hypotheses: [
        {
          hypothesisId: 'hyp-x',
          kind: 'AUTH_BYPASS',
          statement: 'x',
          derivedFromAssetIds: [],
          falsifier: { predictedObservable: { statusCode: 200 }, falsifyingObservable: { statusCode: 403 } },
        },
      ],
    });
    expect(isWellFormedCyberInvestigation(bad)).toBe(false);
  });

  it('rejects an investigation with no observations, hypotheses, tests, or verdicts', () => {
    expect(isWellFormedCyberInvestigation(wellFormedFixture({ observations: [] }))).toBe(false);
    expect(isWellFormedCyberInvestigation(wellFormedFixture({ hypotheses: [] }))).toBe(false);
    expect(isWellFormedCyberInvestigation(wellFormedFixture({ testResults: [] }))).toBe(false);
    expect(isWellFormedCyberInvestigation(wellFormedFixture({ verdicts: [] }))).toBe(false);
  });
});

describe('buildSavedCyberInvestigation', () => {
  it('throws rather than silently accepting a malformed result', () => {
    expect(() => buildSavedCyberInvestigation(wellFormedFixture({ observations: [] }))).toThrow();
  });

  it('builds a deterministic fingerprint for identical content', () => {
    const a = buildSavedCyberInvestigation(wellFormedFixture());
    const b = buildSavedCyberInvestigation(wellFormedFixture());
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('Cyber Investigation — Science Memory persistence and replay', () => {
  function makeFakeStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    };
  }

  it('saves a well-formed investigation and reads it back via isSavedCyberInvestigation', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const saved = buildSavedCyberInvestigation(wellFormedFixture());
    const experiment = saveCyberInvestigationToMemory(saved);
    expect(experiment.cyberInvestigation).toBeDefined();
    expect(isSavedCyberInvestigation(experiment.cyberInvestigation)).toBe(true);
  });

  it('replay reports MATCH (self-consistency only) for an untampered record', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const saved = buildSavedCyberInvestigation(wellFormedFixture());
    const experiment = saveCyberInvestigationToMemory(saved);
    const replay = replaySavedCyberInvestigation(experiment);
    expect(replay.status).toBe('MATCH');
    expect(replay.reason).toContain('wewnętrznej spójności');
  });

  it('replay reports DRIFT when the saved record is tampered after save', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const saved = buildSavedCyberInvestigation(wellFormedFixture());
    const experiment = saveCyberInvestigationToMemory(saved);
    const tampered = {
      ...experiment,
      cyberInvestigation: {
        ...experiment.cyberInvestigation!,
        result: { ...experiment.cyberInvestigation!.result, goal: 'a different goal entirely' },
      },
    };
    const replay = replaySavedCyberInvestigation(tampered);
    expect(replay.status).toBe('DRIFT');
  });

  it('replay reports BLOCKED for a record with no cyberInvestigation', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const saved = buildSavedCyberInvestigation(wellFormedFixture());
    const experiment = saveCyberInvestigationToMemory(saved);
    const { cyberInvestigation: _removed, ...withoutChain } = experiment;
    const replay = replaySavedCyberInvestigation(withoutChain);
    expect(replay.status).toBe('BLOCKED');
  });
});
