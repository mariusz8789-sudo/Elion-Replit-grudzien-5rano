import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import {
  ToyVulnerableApp,
  runAdaptiveInvestigation,
  type CyberEvidenceEventType,
} from '../core/agent/cyberReasoningKernel';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';

const EVENT_ORDER: readonly CyberEvidenceEventType[] = [
  'CYBER_ANALYZER_EXECUTION',
  'CYBER_ANALYZER_RESULT',
  'CYBER_FINDING',
  'CYBER_REMEDIATION_PROPOSED',
  'CYBER_HUMAN_APPROVAL',
  'CYBER_REMEDIATION_APPLIED',
  'CYBER_RETEST_RESULT',
  'CYBER_FINAL_PROOF_REPORT',
];

describe('Cyber Scientist canonical Evidence chain', () => {
  it('records FIND → VALIDATE → FIX → RETEST → PROVE through the real runtime', () => {
    let tick = 1_000;
    const ledger = new EvidenceLedger({ now: () => tick++ });
    const evidenceSink = createLedgerSink(ledger, 'cyber-approved-campaign');
    const result = runAdaptiveInvestigation(new ToyVulnerableApp(), 20, {
      evidenceSink,
      approvalForRemediation: (remediation) => ({
        remediationId: remediation.remediationId,
        decidedBy: 'human-reviewer',
        decidedAt: '2026-09-22T08:00:00.000Z',
        decision: 'APPROVED',
      }),
    });

    const emitted = result.evidenceReceipts.map((receipt) => receipt.eventType);
    for (const eventType of EVENT_ORDER) expect(emitted).toContain(eventType);
    for (let index = 1; index < EVENT_ORDER.length; index++) {
      expect(emitted.indexOf(EVENT_ORDER[index]!)).toBeGreaterThan(emitted.indexOf(EVENT_ORDER[index - 1]!));
    }
    const records = ledger.getActive();
    for (const receipt of result.evidenceReceipts) {
      const record = records.find((candidate) => candidate.id === receipt.recordId);
      expect(record?.contentHash).toBe(receipt.contentHash);
    }
    expect(result.steps.some((step) => step.outcomeVerification?.verified === true)).toBe(true);
    expect(ledger.verifyLedger()).toEqual({ ok: true, errors: [] });
  });

  it('records the missing decision and final report while keeping remediation blocked', () => {
    let tick = 2_000;
    const ledger = new EvidenceLedger({ now: () => tick++ });
    const result = runAdaptiveInvestigation(new ToyVulnerableApp(), 20, {
      evidenceSink: createLedgerSink(ledger, 'cyber-blocked-campaign'),
    });

    expect(result.stopReason).toContain('HUMAN_APPROVAL_REQUIRED');
    expect(result.evidenceReceipts.some((entry) => entry.eventType === 'CYBER_HUMAN_APPROVAL')).toBe(true);
    expect(result.evidenceReceipts.some((entry) => entry.eventType === 'CYBER_REMEDIATION_APPLIED')).toBe(false);
    expect(result.evidenceReceipts.at(-1)?.eventType).toBe('CYBER_FINAL_PROOF_REPORT');
    expect(ledger.getActive().some((record) => record.claim.includes('CYBER_HUMAN_APPROVAL') && record.claim.includes('MISSING'))).toBe(true);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});
