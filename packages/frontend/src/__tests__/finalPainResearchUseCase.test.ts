import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import {
  PAIN_RESEARCH_GOVERNANCE_ENVELOPE,
  assertNoClinicalOrActuationParameters,
  runPainResearchQuestion,
  type PainResearchQuestion,
} from '../core/painDiscovery/painResearchUseCase';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };

function ledgerAndSink() {
  const ledger = new EvidenceLedger(clock);
  return { ledger, sink: createLedgerSink(ledger, 'pain-research-test') };
}

function question(overrides: Partial<PainResearchQuestion> = {}): PainResearchQuestion {
  return {
    questionId: 'pain-q-1',
    statement: 'How does modeled intervention timing affect the simulated outcome trajectory?',
    target: { anatomyNodeId: 'nervous-system', organSystem: 'NERVOUS', label: 'Peripheral nervous system (research target)' },
    backingProblemId: 'problem:intervention-timing',
    ...overrides,
  };
}

describe('PAIN_RESEARCH_GOVERNANCE_ENVELOPE', () => {
  it('carries the three mandatory disclaimers, frozen', () => {
    expect(PAIN_RESEARCH_GOVERNANCE_ENVELOPE.scope).toBe('SIMULATION_ONLY');
    expect(PAIN_RESEARCH_GOVERNANCE_ENVELOPE.researchPriorityDisclaimer).toBe('RESEARCH_PRIORITY_NOT_CLINICAL_EFFICACY');
    expect(PAIN_RESEARCH_GOVERNANCE_ENVELOPE.deviceClaim).toBe('NOT_A_MEDICAL_DEVICE');
    expect(Object.isFrozen(PAIN_RESEARCH_GOVERNANCE_ENVELOPE)).toBe(true);
  });
});

describe('assertNoClinicalOrActuationParameters', () => {
  it('accepts a genuine research-framed question', () => {
    expect(() => assertNoClinicalOrActuationParameters(question())).not.toThrow();
  });

  it.each([
    'What dose reduces symptoms fastest?',
    'Recommend a dosing schedule of 5 mg/kg.',
    'How should the device actuate to relieve pressure?',
    'What is the correct prescription for this condition?',
  ])('rejects a clinical/dosing/actuation-framed statement: %s', (statement) => {
    expect(() => assertNoClinicalOrActuationParameters(question({ statement }))).toThrow(/PAIN_RESEARCH_REJECTED/);
  });
});

describe('runPainResearchQuestion — thin binding over the real scientific-integration campaign', () => {
  it('runs the real, existing closed loop and returns a governed report referencing the target', async () => {
    const { sink } = ledgerAndSink();
    const report = await runPainResearchQuestion(question(), sink, { maxCycles: 2 });
    expect(report.governance.scope).toBe('SIMULATION_ONLY');
    expect(report.question.target.organSystem).toBe('NERVOUS');
    expect(report.campaign.cycles.length).toBeGreaterThan(0);
    expect(report.campaign.problemId).toBe('problem:intervention-timing');
  });

  it('refuses to run a clinically-framed question at all — never silently strips the forbidden wording', async () => {
    const { sink } = ledgerAndSink();
    await expect(runPainResearchQuestion(question({ statement: 'What dosing schedule works best?' }), sink)).rejects.toThrow(/PAIN_RESEARCH_REJECTED/);
  });
});
