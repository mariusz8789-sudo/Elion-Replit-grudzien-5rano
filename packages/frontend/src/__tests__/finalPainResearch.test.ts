import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import {
  assertNoClinicalOrActuationParameters,
  PAIN_RESEARCH_GOVERNANCE_ENVELOPE,
  runPainResearchQuestion,
  type PainResearchQuestion,
} from '../core/experimentFabric/painResearch';

/**
 * Overnight Science Task 8: proves Pain Discovery is honest by construction — BLOCKED by default
 * (no pain-specific model exists), never silently relabeling an unrelated solver's output as a
 * pain-research finding, and rejecting clinical/dosing/diagnostic/actuation language outright.
 */
const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
function sink(streamId: string) {
  const ledger = new EvidenceLedger(clock);
  return { ledger, sink: createLedgerSink(ledger, streamId) };
}

function question(overrides: Partial<PainResearchQuestion> = {}): PainResearchQuestion {
  return {
    questionId: 'pq-1',
    statement: 'Does intervention timing affect the modeled nociceptive signal amplitude?',
    target: { anatomyNodeId: 'dorsal-root-ganglion', label: 'Dorsal root ganglion' },
    ...overrides,
  };
}

describe('runPainResearchQuestion — honest BLOCKED default', () => {
  it('returns BLOCKED and runs no campaign when no backingProblemId is supplied', async () => {
    const { sink: evidenceSink } = sink('pain-blocked');
    const report = await runPainResearchQuestion(question(), evidenceSink);
    expect(report.status).toBe('BLOCKED');
    expect(report.campaign).toBeUndefined();
    expect(report.reason).toMatch(/no pain-specific/i);
  });

  it('always carries the SIMULATION_ONLY / NOT_A_MEDICAL_DEVICE / research-priority governance envelope', async () => {
    const { sink: evidenceSink } = sink('pain-governance');
    const report = await runPainResearchQuestion(question(), evidenceSink);
    expect(report.governance).toEqual(PAIN_RESEARCH_GOVERNANCE_ENVELOPE);
  });
});

describe('runPainResearchQuestion — explicit opt-in stand-in path', () => {
  it('runs a real campaign against a caller-declared stand-in problem and reports PARTIAL with an unremovable disclaimer', async () => {
    const { sink: evidenceSink } = sink('pain-partial');
    const report = await runPainResearchQuestion(
      question({ backingProblemId: 'problem:intervention-timing' }),
      evidenceSink,
      { maxCycles: 2 },
    );
    expect(report.status).toBe('PARTIAL');
    expect(report.reason).toMatch(/not pain-specific/i);
    expect(report.campaign).toBeDefined();
    expect(report.campaign!.cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('never reports a COMPLETE-equivalent status — the type only allows BLOCKED or PARTIAL', async () => {
    const { sink: evidenceSink } = sink('pain-status-shape');
    const blocked = await runPainResearchQuestion(question(), evidenceSink);
    const partial = await runPainResearchQuestion(
      question({ backingProblemId: 'problem:intervention-timing' }),
      evidenceSink,
    );
    expect(['BLOCKED', 'PARTIAL']).toContain(blocked.status);
    expect(['BLOCKED', 'PARTIAL']).toContain(partial.status);
  }, 20_000);
});

describe('assertNoClinicalOrActuationParameters — clinical/actuation language guard', () => {
  it('rejects a dosing question', () => {
    expect(() => assertNoClinicalOrActuationParameters(question({ statement: 'What dose in mg/kg reduces the signal?' }))).toThrow(
      /PAIN_RESEARCH_REJECTED/,
    );
  });

  it('rejects a diagnostic question', () => {
    expect(() => assertNoClinicalOrActuationParameters(question({ statement: 'Diagnose the patient using this model.' }))).toThrow(
      /PAIN_RESEARCH_REJECTED/,
    );
  });

  it('rejects a treatment-recommendation question', () => {
    expect(() =>
      assertNoClinicalOrActuationParameters(question({ statement: 'Give a treatment recommendation for this case.' })),
    ).toThrow(/PAIN_RESEARCH_REJECTED/);
  });

  it('rejects a real-device-actuation question', () => {
    expect(() => assertNoClinicalOrActuationParameters(question({ statement: 'Actuate the neurostimulator now.' }))).toThrow(
      /PAIN_RESEARCH_REJECTED/,
    );
  });

  it('allows a plain research question through untouched', () => {
    expect(() => assertNoClinicalOrActuationParameters(question())).not.toThrow();
  });

  it('runPainResearchQuestion itself refuses a clinical-language question before touching any campaign', async () => {
    const { sink: evidenceSink } = sink('pain-guard-integration');
    await expect(
      runPainResearchQuestion(question({ statement: 'What dosage should be prescribed?' }), evidenceSink),
    ).rejects.toThrow(/PAIN_RESEARCH_REJECTED/);
  });
});
