/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
import { SessionEventLog } from './sessionEventLog.js';
import { appendEvidenceSessionLink, bindEvidenceLedgerToSessionLog, linkLedgerEntryToSession } from './sessionEvidenceBridge.js';

const clock = { t: 0, now() { return (this.t += 1); } };
const input = (claim: string): NewEvidenceInput => ({
  sourceUrl: 'https://example.invalid/source', sourceTimestamp: null, claim, claimType: 'observation', confidence: 0.9,
  provenance: { sourceKind: 'dataset', retrievedBy: 'test', independentSourceIds: [] },
});

describe('Evidence Ledger <-> Session Event Log provenance bridge (D-136) — links ids, creates neither system', () => {
  it('every ledger append while a session is active becomes an EVIDENCE_APPENDED event carrying the real contentHash and ledger index', () => {
    const ledger = new EvidenceLedger(clock);
    const log = new SessionEventLog(clock);
    const sessionId: string | null = 'S1';
    const dispose = bindEvidenceLedgerToSessionLog(ledger, log, () => sessionId, () => ({ commandId: 'cmd-1', actionKind: 'RUN_EXPERIMENT' }));

    const { record } = ledger.addRecord(input('first observation'));
    const events = log.read('S1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('EVIDENCE_APPENDED');
    const payload = events[0].payload as { id: string; contentHash: string; ledgerEntryIndex: number; epistemicStatus: string; commandId: string; actionKind: string };
    expect(payload.id).toBe(record.id);
    expect(payload.contentHash).toBe(record.contentHash);
    expect(payload.ledgerEntryIndex).toBe(0);
    expect(payload.epistemicStatus).toBe(record.status);
    expect(payload.commandId).toBe('cmd-1');
    expect(payload.actionKind).toBe('RUN_EXPERIMENT');

    dispose();
  });

  it('an append with no active session is never attributed to one — no event is invented for it', () => {
    const ledger = new EvidenceLedger(clock);
    const log = new SessionEventLog(clock);
    bindEvidenceLedgerToSessionLog(ledger, log, () => null);
    ledger.addRecord(input('untracked'));
    expect(log.sessions()).toEqual([]);
  });

  it('linkLedgerEntryToSession builds the link and appends it; appendEvidenceSessionLink appends the SAME shape directly, for a caller that already has the link', () => {
    const ledger = new EvidenceLedger(clock);
    const log = new SessionEventLog(clock);
    const { record } = ledger.addRecord(input('direct link'));
    const entry = ledger.toSnapshot().entries[0];
    const link = linkLedgerEntryToSession(log, 'S2', entry, record, 'cmd-2', 'INSPECT');
    expect(link).toEqual({ sessionId: 'S2', commandId: 'cmd-2', actionKind: 'INSPECT', ledgerEntryIndex: entry.index, evidenceId: record.id, contentHash: record.contentHash, sourceUrl: record.sourceUrl, epistemicStatus: record.status });
    expect(log.read('S2')).toHaveLength(1);

    const log2 = new SessionEventLog(clock);
    appendEvidenceSessionLink(log2, link);
    const [event] = log2.read('S2');
    expect(event.type).toBe('EVIDENCE_APPENDED');
    expect(event.payload).toEqual({ id: link.evidenceId, contentHash: link.contentHash, ledgerEntryIndex: link.ledgerEntryIndex, sourceUrl: link.sourceUrl, epistemicStatus: link.epistemicStatus, commandId: link.commandId, actionKind: link.actionKind });
  });

  it('a proposed (not yet published) record is still linkable — the bridge reads both getActive() and getProposals()', () => {
    const ledger = new EvidenceLedger(clock);
    const log = new SessionEventLog(clock);
    bindEvidenceLedgerToSessionLog(ledger, log, () => 'S3');
    ledger.propose(input('pending claim'));
    expect(log.read('S3')).toHaveLength(1);
    expect(log.read('S3')[0].type).toBe('EVIDENCE_APPENDED');
  });
});
