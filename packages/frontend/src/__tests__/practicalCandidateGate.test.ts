import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign } from '../core/agent/discoveryCampaign';
import { makeQe4CampaignLab } from '../core/biotechData/campaignLabs';
import {
  evaluatePracticalCandidate,
  surfaceFor,
  MINIMUM_OBSERVATIONS,
  type GatedCandidate,
} from '../core/agent/practicalCandidateGate';

/** A candidate that passes every criterion, used as the baseline each test breaks in exactly one way. */
function sound(overrides: Partial<GatedCandidate> = {}): GatedCandidate {
  return {
    candidate: {
      derivedFromModelFingerprint: 'fp-model',
      statement: 'Across the observed range, entropy growth is logarithmic in time.',
      constraints: ['Holds only over the observed range.'],
      requiredValidation: ['Independent replication by another apparatus.'],
      proposedProtocol: null,
      protocolWithheldReason: 'DESCRIPTIVE finding; no manipulable parameter was varied.',
    },
    candidateClass: 'equation',
    safetyClass: 'DESCRIPTIVE',
    notProven: ['Behaviour outside the observed time range.'],
    handoff: { recipient: 'INSTITUTION', boundary: 'Research result; not an operational instruction.' },
    evidence: {
      observationIds: ['o1', 'o2', 'o3', 'o4'],
      replayFingerprint: 'abc12345',
      provenance: { sourceUrl: 'https://zenodo.org/record/2527010', sourceVersion: '10.5281/zenodo.2527010' },
      unresolvedContradictions: [],
      epistemicStatus: 'PREDICTION',
    },
    ...overrides,
  };
}

describe('practicalCandidateGate — a candidate must earn its way out of the research layer', () => {
  it('activates a descriptive candidate that satisfies every criterion', () => {
    const decision = evaluatePracticalCandidate(sound());
    expect(decision.outcome).toBe('ACTIVATE');
    expect(decision.failures).toEqual([]);
    expect(surfaceFor(decision.outcome, 'DESCRIPTIVE')).toBe('GOVERNMENT_RESEARCH');
  });

  it('reports EVERY failing criterion at once, not just the first', () => {
    const decision = evaluatePracticalCandidate(sound({
      notProven: [],
      evidence: { observationIds: [], replayFingerprint: null, provenance: null, unresolvedContradictions: ['A and B disagree'], epistemicStatus: null },
    }));
    expect(decision.outcome).toBe('REFUSE');
    const criteria = decision.failures.map((f) => f.criterion);
    expect(criteria).toContain('EVIDENCE_SUFFICIENT');
    expect(criteria).toContain('NO_UNRESOLVED_CRITICAL_CONTRADICTION');
    expect(criteria).toContain('PROVENANCE_EXISTS');
    expect(criteria).toContain('REPLAY_EXISTS');
    expect(criteria).toContain('EPISTEMIC_STATUS_EXPLICIT');
    expect(criteria).toContain('NOT_PROVEN_DECLARED');
  });

  it('refuses thin evidence, and says how thin', () => {
    const decision = evaluatePracticalCandidate(sound({
      evidence: { ...sound().evidence, observationIds: ['only-one'] },
    }));
    expect(decision.outcome).toBe('REFUSE');
    expect(decision.failures[0]!.detail).toContain(String(MINIMUM_OBSERVATIONS));
  });

  it('refuses a candidate with no stated limits — an empty notProven is not "nothing is unproven"', () => {
    const decision = evaluatePracticalCandidate(sound({ notProven: [] }));
    expect(decision.outcome).toBe('REFUSE');
    expect(decision.failures.map((f) => f.criterion)).toContain('NOT_PROVEN_DECLARED');
  });

  it('refuses an unresolved contradiction rather than averaging over it', () => {
    const decision = evaluatePracticalCandidate(sound({
      evidence: { ...sound().evidence, unresolvedContradictions: ['Trial X and trial Y report opposite signs'] },
    }));
    expect(decision.outcome).toBe('REFUSE');
    expect(decision.failures.map((f) => f.criterion)).toContain('NO_UNRESOLVED_CRITICAL_CONTRADICTION');
  });
});

describe('practicalCandidateGate — the medical boundary holds at the OUTPUT layer', () => {
  it('refuses anything classified CLINICAL_BLOCKED, and no authorisation changes that', () => {
    const decision = evaluatePracticalCandidate(sound({ safetyClass: 'CLINICAL_BLOCKED' }));
    expect(decision.outcome).toBe('REFUSE');
    expect(decision.failures.map((f) => f.criterion)).toContain('SAFETY_CLASS_PERMITTED');
    expect(surfaceFor(decision.outcome, 'CLINICAL_BLOCKED')).toBe('NONE');
  });

  it('catches clinical-directive language in the candidate\'s OWN TEXT, whatever its declared class', () => {
    const directives = [
      'Take 50 mg twice daily for the patient.',
      'This is an approved replacement therapy.',
      'Prescribe liraglutide when semaglutide is unavailable.',
      'Stop taking the current medication.',
      'Switch the patient to the alternative agent.',
    ];
    for (const statement of directives) {
      const decision = evaluatePracticalCandidate(sound({
        safetyClass: 'POPULATION',
        candidate: { ...sound().candidate, statement },
      }));
      expect(decision.outcome).toBe('REFUSE');
      expect(decision.failures.map((f) => f.criterion)).toContain('NO_CLINICAL_DIRECTIVE_LANGUAGE');
    }
  });

  it('scans every field the candidate would emit, not just the headline statement', () => {
    const decision = evaluatePracticalCandidate(sound({
      safetyClass: 'POPULATION',
      candidate: { ...sound().candidate, proposedProtocol: 'Prescribe the alternative at an equivalent dose.' },
    }));
    expect(decision.outcome).toBe('REFUSE');
    expect(decision.failures.map((f) => f.criterion)).toContain('NO_CLINICAL_DIRECTIVE_LANGUAGE');
  });

  it('does NOT refuse an uncomfortable or negative finding — policy may limit action, never truth', () => {
    const decision = evaluatePracticalCandidate(sound({
      candidate: {
        ...sound().candidate,
        statement: 'The intervention shows no measurable benefit, and the worst-case estimate is a net harm at the population level.',
      },
      notProven: ['Whether the harm persists beyond the observed window.'],
    }));
    expect(decision.outcome).toBe('ACTIVATE');
    expect(decision.failures).toEqual([]);
  });
});

describe('practicalCandidateGate — action needs a human, and this module does not authorise one', () => {
  it('sends an intervention to the existing approval workflow instead of activating it', () => {
    const decision = evaluatePracticalCandidate(sound({ candidateClass: 'intervention' }));
    expect(decision.outcome).toBe('REQUIRES_HUMAN_APPROVAL');
    expect(decision.requiresCapability).toBe('candidate.activate');
    expect(surfaceFor(decision.outcome, 'DESCRIPTIVE')).toBe('GOVERNMENT_ACTION');
  });

  it('treats any POPULATION-level candidate as requiring sign-off, even a mere strategy', () => {
    const decision = evaluatePracticalCandidate(sound({ candidateClass: 'strategy', safetyClass: 'POPULATION' }));
    expect(decision.outcome).toBe('REQUIRES_HUMAN_APPROVAL');
  });

  it('never surfaces anything in a citizen-facing plane: the only outcomes are research, action, or nothing', () => {
    for (const outcome of ['ACTIVATE', 'REQUIRES_HUMAN_APPROVAL', 'REFUSE'] as const) {
      for (const safety of ['DESCRIPTIVE', 'POPULATION', 'CLINICAL_BLOCKED'] as const) {
        expect(['GOVERNMENT_RESEARCH', 'GOVERNMENT_ACTION', 'NONE']).toContain(surfaceFor(outcome, safety));
      }
    }
  });

  it('is deterministic: the same candidate yields the same decision fingerprint', () => {
    expect(evaluatePracticalCandidate(sound()).fingerprint).toBe(evaluatePracticalCandidate(sound()).fingerprint);
    expect(evaluatePracticalCandidate(sound()).fingerprint)
      .not.toBe(evaluatePracticalCandidate(sound({ candidateClass: 'intervention' })).fingerprint);
  });
});

describe('practicalCandidateGate — against a REAL campaign candidate', () => {
  it('accepts the descriptive candidate a real QE4 campaign actually produces', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    const candidate = result.discovery.practicalCandidate!;
    expect(candidate.proposedProtocol).toBeNull();

    const decision = evaluatePracticalCandidate({
      candidate,
      candidateClass: 'equation',
      safetyClass: 'DESCRIPTIVE',
      notProven: [...candidate.requiredValidation],
      handoff: { recipient: 'INSTITUTION', boundary: 'Research result over a pinned public dataset.' },
      evidence: {
        observationIds: result.rounds[result.rounds.length - 1]!.admittedX.map((x) => `qe4:T=${x}`),
        replayFingerprint: result.campaignFingerprint,
        provenance: { sourceUrl: 'https://zenodo.org/record/2527010', sourceVersion: '10.5281/zenodo.2527010' },
        unresolvedContradictions: [],
        epistemicStatus: 'PREDICTION',
      },
    });
    expect(decision.outcome).toBe('ACTIVATE');
    expect(surfaceFor(decision.outcome, 'DESCRIPTIVE')).toBe('GOVERNMENT_RESEARCH');
  }, 30000);
});
