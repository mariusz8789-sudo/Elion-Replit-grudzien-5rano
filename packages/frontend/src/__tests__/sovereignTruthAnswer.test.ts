import { beforeEach, describe, expect, it } from 'vitest';
import type { TautologyComponent } from '../core/agent/tautologyGate';
import {
  attemptGovernmentActionMutation,
  getAnswerRecord,
  listAnswerRecords,
  replayAnswerRecord,
  resetSovereignTruthAnswerStoreForTests,
  submitAnswer,
  TemplateViolationError,
  type EvidenceItem,
  type QuestionSubmissionInput,
  type SubQuestion,
} from '../core/agent/sovereignTruthAnswer';

/**
 * SOVEREIGN TRUTH-ANSWER PROTOCOL v1 — GOVERNMENT RESEARCH PLANE.
 * TDD: this file is written BEFORE the implementation exists.
 */

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    sourceId: 'src-1',
    sourceType: 'PUBLIC_DATASET',
    level: 'B',
    claimKind: 'FACT',
    provenance: 'REFERENCE',
    summary: 'A real, citable public source.',
    ...overrides,
  };
}

function component(overrides: Partial<TautologyComponent> = {}): TautologyComponent {
  return {
    componentId: 'c1',
    prediction: { source: 'independent-measurement', modelId: 'gov-research-analyst', rationale: 'Analyst-declared expectation, no shared code path with the observation channel.' },
    observation: { source: 'independent-measurement', modelId: 'public-dataset-x', rationale: 'A real published dataset, independent of the analyst.' },
    ...overrides,
  };
}

function subquestion(overrides: Partial<SubQuestion> = {}): SubQuestion {
  return {
    id: 'sq-1',
    text: 'A decomposed, more specific question.',
    status: 'UNKNOWN',
    strength: 'NONE',
    rationale: 'No evidence gathered for this fragment yet.',
    supportingEvidence: [],
    counterEvidence: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<QuestionSubmissionInput> = {}): QuestionSubmissionInput {
  return {
    question: 'A test question.',
    status: 'UNKNOWN',
    strength: 'NONE',
    supportingEvidence: [],
    counterEvidence: [],
    whatWouldChangeVerdict: ['A new, independently verifiable primary source addressing this directly.'],
    uncertainty: 'Total — no evidence exists either way.',
    components: [component()],
    ...overrides,
  };
}

beforeEach(() => {
  resetSovereignTruthAnswerStoreForTests();
});

describe('SovereignTruthAnswer — ASSERTIONS (machine-enforced, build-fail on violation)', () => {
  it('no supportingEvidence forces status UNKNOWN', () => {
    expect(() => submitAnswer(baseInput({ status: 'FACT', strength: 'STRONG', supportingEvidence: [], counterEvidence: [evidence()] })))
      .toThrow(TemplateViolationError);
    const ok = submitAnswer(baseInput({ status: 'UNKNOWN', supportingEvidence: [] }));
    expect(ok.status).toBe('UNKNOWN');
  });

  it('FACT requires STRONG strength and at least one Level A/B supporting item', () => {
    expect(() => submitAnswer(baseInput({
      status: 'FACT', strength: 'MODERATE',
      supportingEvidence: [evidence({ level: 'A' })], counterEvidence: [evidence({ level: 'C' })],
    }))).toThrow(TemplateViolationError);

    expect(() => submitAnswer(baseInput({
      status: 'FACT', strength: 'STRONG',
      supportingEvidence: [evidence({ level: 'C' }), evidence({ level: 'D' })], counterEvidence: [evidence()],
    }))).toThrow(TemplateViolationError);

    const record = submitAnswer(baseInput({
      status: 'FACT', strength: 'STRONG',
      supportingEvidence: [evidence({ level: 'A' })], counterEvidence: [evidence()],
    }));
    expect(record.status).toBe('FACT');
  });

  it('counterevidence is required for every status except UNKNOWN and NO_ACCESS_DECLARED', () => {
    expect(() => submitAnswer(baseInput({
      status: 'SUPPORTED', strength: 'MODERATE',
      supportingEvidence: [evidence()], counterEvidence: [],
    }))).toThrow(TemplateViolationError);

    const withCounter = submitAnswer(baseInput({
      status: 'SUPPORTED', strength: 'MODERATE',
      supportingEvidence: [evidence()], counterEvidence: [evidence({ level: 'D' })],
    }));
    expect(withCounter.counterEvidence.length).toBeGreaterThan(0);

    const unknownNeedsNone = submitAnswer(baseInput({ status: 'UNKNOWN', supportingEvidence: [], counterEvidence: [] }));
    expect(unknownNeedsNone.counterEvidenceWaived).toBe(true);
  });

  it('whatWouldChangeVerdict is required (non-empty)', () => {
    expect(() => submitAnswer(baseInput({ whatWouldChangeVerdict: [] }))).toThrow(TemplateViolationError);
  });

  it('a derived UNFALSIFIABLE_FOUNDATIONAL class requires at least one subquestion (the decomposition attempt)', () => {
    // Empty components -> Tautology Gate returns UNTESTABLE -> class UNFALSIFIABLE_FOUNDATIONAL.
    expect(() => submitAnswer(baseInput({ components: [], subquestions: [] }))).toThrow(TemplateViolationError);
    const ok = submitAnswer(baseInput({ components: [], subquestions: [subquestion()] }));
    expect(ok.questionClass).toBe('UNFALSIFIABLE_FOUNDATIONAL');
  });

  it('NO_ACCESS_DECLARED requires a non-empty noAccessReason, and a supplied noAccessReason forces that status', () => {
    expect(() => submitAnswer(baseInput({ status: 'NO_ACCESS_DECLARED', noAccessReason: '' })))
      .toThrow(TemplateViolationError);
    expect(() => submitAnswer(baseInput({ status: 'UNKNOWN', noAccessReason: 'Classified, no FOIA response received.' })))
      .toThrow(TemplateViolationError);
    const ok = submitAnswer(baseInput({ status: 'NO_ACCESS_DECLARED', noAccessReason: 'Classified, no FOIA response received.' }));
    expect(ok.status).toBe('NO_ACCESS_DECLARED');
    expect(ok.noAccessReason).toContain('FOIA');
  });

  it('refuses prescriptions, dosages, and decrees anywhere in the record text', () => {
    expect(() => submitAnswer(baseInput({
      question: 'Should citizens take 500mg of X daily?',
    }))).toThrow(/prescriptive|dosage|decree/i);

    expect(() => submitAnswer(baseInput({
      whatWouldChangeVerdict: ['It is hereby decreed that this practice shall be banned.'],
    }))).toThrow(/prescriptive|dosage|decree/i);
  });

  it('Government Action has no path to mutate an existing AnswerRecord ("Truth")', () => {
    const record = submitAnswer(baseInput({ status: 'UNKNOWN' }));
    expect(() => attemptGovernmentActionMutation(record, { status: 'FACT' })).toThrow();
    // The record itself is frozen — a direct property write also fails.
    expect(() => { (record as unknown as { status: string }).status = 'FACT'; }).toThrow();
    // And the store's own copy is unaffected either way.
    expect(getAnswerRecord(record.recordId)?.status).toBe('UNKNOWN');
  });
});

describe('SovereignTruthAnswer — CLASS 1: UNFALSIFIABLE_FOUNDATIONAL', () => {
  it('"Who created the simulation?" decomposes into testable fragments, none of which is testable, and states what would change the verdict', () => {
    const record = submitAnswer({
      question: 'Who created the simulation we live in?',
      status: 'UNKNOWN',
      strength: 'NONE',
      supportingEvidence: [],
      counterEvidence: [],
      whatWouldChangeVerdict: [
        'A reproducible, independently verifiable technical artifact demonstrating access to or communication with a simulating substrate.',
        'A physical anomaly inconsistent with every known physical law, replicated by independent labs, with no simulation-external explanation.',
      ],
      uncertainty: 'Total — the premise itself may not be falsifiable within physics as currently understood.',
      components: [],
      subquestions: [
        subquestion({ id: 'sim-1', text: 'Is there a testable physical signature distinguishing a simulated universe from a non-simulated one?', status: 'UNKNOWN', rationale: 'No proposed test in the physics literature is agreed to be decisive; candidate signatures (e.g. lattice artifacts in cosmic ray spectra) remain contested and non-conclusive.' }),
        subquestion({
          id: 'sim-2',
          text: 'If the universe is simulated, is the identity of a simulator empirically accessible from inside the simulation?',
          status: 'UNTESTABLE',
          rationale: 'No proposed observation from inside a simulation could, even in principle, distinguish among candidate simulators or confirm one exists, absent the simulator choosing to reveal itself.',
          counterEvidence: [evidence({ level: 'D', claimKind: 'THEORY', sourceId: 'bostrom-simulation-argument', summary: 'Some philosophers argue statistical/anthropic reasoning about simulator prevalence is itself a form of indirect testability — a minority, contested position.' })],
        }),
      ],
    });

    expect(record.questionClass).toBe('UNFALSIFIABLE_FOUNDATIONAL');
    expect(record.status).toBe('UNKNOWN');
    expect(record.subquestions.length).toBeGreaterThanOrEqual(2);
    expect(record.whatWouldChangeVerdict.length).toBeGreaterThan(0);
    expect(record.tautologyAssessment.classification).toBe('UNTESTABLE');
  });
});

describe('SovereignTruthAnswer — CLASS 2: PARTIALLY_TESTABLE', () => {
  it('"Do we have technology derived from UFOs?" splits into layers, each with its own status and evidence', () => {
    const record = submitAnswer({
      question: 'Does any government possess technology derived from recovered unidentified craft?',
      status: 'CONTESTED',
      strength: 'WEAK',
      supportingEvidence: [evidence({ sourceId: 'doj-oig-report', sourceType: 'GOVERNMENT_REPORT', level: 'B', claimKind: 'FACT', summary: 'Official government reports (e.g. AARO historical record review) confirm decades of UAP-related programs and investigations exist.' })],
      counterEvidence: [evidence({ sourceId: 'aaro-2024-findings', sourceType: 'GOVERNMENT_REPORT', level: 'B', claimKind: 'FACT', summary: 'The 2024 AARO historical record review found no verifiable evidence that any recovered off-world technology or reverse-engineering program exists.' })],
      whatWouldChangeVerdict: [
        'Declassified, independently authenticated hardware or documentation demonstrating reverse-engineering of non-human-origin technology.',
        'A credible whistleblower claim independently corroborated by physical or documentary evidence, not testimony alone.',
      ],
      uncertainty: 'High — public claims and official denials both exist; neither side has produced independently verifiable physical evidence.',
      components: [
        component({ componentId: 'programs-exist', prediction: { source: 'independent-measurement', modelId: 'foia-record', rationale: 'A declassified program record is a real external document.' }, observation: { source: 'independent-measurement', modelId: 'foia-record', rationale: 'The same declassified record, read directly.' } }),
        component({
          componentId: 'nonhuman-origin-tech',
          prediction: { source: 'model-invariant', modelId: 'definitional-frame', rationale: 'As commonly framed, "non-human origin" is defined partly by the absence of known terrestrial manufacturing capability — a definitional boundary, not a physical measurement.' },
          observation: { source: 'model-invariant', modelId: 'definitional-frame', rationale: 'The same definitional frame, read back — confirming it confirms only the definition, not a fact about the artifact.' },
        }),
      ],
      subquestions: [
        subquestion({
          id: 'layer-1',
          text: 'Do government UAP investigation programs exist?',
          status: 'FACT',
          strength: 'STRONG',
          rationale: 'Multiple declassified, independently corroborated government documents confirm program existence.',
          supportingEvidence: [evidence({ level: 'A', sourceId: 'foia-record-1' })],
          counterEvidence: [evidence({ level: 'D', claimKind: 'HYPOTHESIS', sourceId: 'scope-dispute', summary: 'Some analysts dispute whether every named program constitutes a distinct, continuously funded investigation versus overlapping paperwork.' })],
        }),
        subquestion({ id: 'layer-2', text: 'Does any such program possess non-human-origin technology?', status: 'UNKNOWN', rationale: 'No independently verifiable physical evidence has been produced by either claimants or investigators.', supportingEvidence: [] }),
      ],
    });

    expect(record.questionClass).toBe('PARTIALLY_TESTABLE');
    expect(record.subquestions).toHaveLength(2);
    expect(record.subquestions[0]!.status).toBe('FACT');
    expect(record.subquestions[1]!.status).toBe('UNKNOWN');
    expect(record.status).toBe('CONTESTED');
  });
});

describe('SovereignTruthAnswer — CLASS 3: TESTABLE_PUBLIC_DATA', () => {
  it('"Who rules the world?" (operationalized via a measurable proxy) shows a result, counterevidence, and uncertainty', () => {
    const record = submitAnswer({
      question: 'Which entities hold the greatest concentration of formal global economic/political decision power, by measurable proxy?',
      status: 'SUPPORTED',
      strength: 'MODERATE',
      supportingEvidence: [evidence({ sourceId: 'imf-gdp-2024', sourceType: 'PUBLIC_DATASET', level: 'A', claimKind: 'FACT', summary: 'IMF World Economic Outlook: national GDP share is heavily concentrated in a small number of states (US, China, EU bloc).' })],
      counterEvidence: [evidence({ sourceId: 'multipolar-critique', sourceType: 'ACADEMIC_LITERATURE', level: 'B', claimKind: 'THEORY', summary: 'Political-economy literature disputes that GDP share alone captures "rule" given diffuse corporate, military, and institutional power centers.' })],
      whatWouldChangeVerdict: [
        'A different, equally defensible proxy (e.g. military expenditure share, UN Security Council veto power) producing a materially different ranking.',
        'New data showing the proxy measure has shifted concentration substantially.',
      ],
      uncertainty: 'Moderate — the answer is entirely a function of which measurable proxy for "rule" is chosen; no single proxy is authoritative.',
      components: [component()],
    });

    expect(record.questionClass).toBe('TESTABLE_PUBLIC_DATA');
    expect(record.tautologyAssessment.classification).toBe('EMPIRICAL_TEST');
    expect(record.status).toBe('SUPPORTED');
    expect(record.counterEvidence.length).toBeGreaterThan(0);
    expect(record.uncertainty.length).toBeGreaterThan(0);
  });
});

describe('SovereignTruthAnswer — access, no-evidence, and worst-case pipeline parity', () => {
  it('a question this system cannot access the necessary data for is declared NO_ACCESS_DECLARED, not guessed', () => {
    const record = submitAnswer(baseInput({
      question: 'What is contained in a specific still-classified document with no public index entry?',
      status: 'NO_ACCESS_DECLARED',
      noAccessReason: 'The document is classified; no FOIA release, leak, or public citation of its contents exists to consult.',
    }));
    expect(record.status).toBe('NO_ACCESS_DECLARED');
    expect(record.noAccessReason).not.toBe('');
  });

  it('an attempt to change Truth via a Government Action call is rejected outright, never mutating the stored record', () => {
    const record = submitAnswer(baseInput({ status: 'UNKNOWN' }));
    expect(() => attemptGovernmentActionMutation(record, { status: 'FACT', strength: 'STRONG' })).toThrow();
    expect(listAnswerRecords().find((r) => r.recordId === record.recordId)?.status).toBe('UNKNOWN');
  });

  it('no evidence at all resolves to UNKNOWN, never to a confident status', () => {
    const record = submitAnswer(baseInput({ status: 'UNKNOWN', supportingEvidence: [], counterEvidence: [] }));
    expect(record.status).toBe('UNKNOWN');
    expect(record.strength).not.toBe('STRONG');
  });

  it('an inconvenient / worst-case result runs through the exact same pipeline as a comfortable one — same assertions, same fields, no special-casing', () => {
    const worstCase = submitAnswer({
      question: 'Does the strongest available public evidence support a conclusion the submitting government would prefer were false?',
      status: 'FACT',
      strength: 'STRONG',
      supportingEvidence: [evidence({ level: 'A', sourceId: 'independent-audit-1' }), evidence({ level: 'B', sourceId: 'independent-audit-2' })],
      counterEvidence: [evidence({ level: 'C', sourceId: 'rebuttal-1', summary: 'A methodological critique that does not overturn the primary finding.' })],
      whatWouldChangeVerdict: ['A replication failure by an independent third party using the same public dataset.'],
      uncertainty: 'Low — two independent, methodologically sound sources converge.',
      components: [component()],
    });
    expect(worstCase.status).toBe('FACT');
    expect(worstCase.flags).toBeDefined();
    // The record is not blocked, censored, or downgraded merely for being inconvenient — it
    // is subject to the SAME structural assertions as every other record (already exercised
    // above), and it is stored and retrievable like any other.
    expect(getAnswerRecord(worstCase.recordId)).not.toBeNull();
  });
});

describe('SovereignTruthAnswer — replay (reuses ReplayVerdict, no second replay engine)', () => {
  it('recomputing the identical submission from the same record MATCHes', () => {
    const input = baseInput({ status: 'UNKNOWN' });
    const record = submitAnswer(input);
    expect(replayAnswerRecord(record, input)).toBe('MATCH');
  });

  it('recomputing from a materially different submission DRIFTs', () => {
    const input = baseInput({ status: 'UNKNOWN' });
    const record = submitAnswer(input);
    const changed = baseInput({ status: 'UNKNOWN', uncertainty: 'A different uncertainty statement.' });
    expect(replayAnswerRecord(record, changed)).toBe('DRIFT');
  });
});
