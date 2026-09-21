/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger } from '../../knowledge/EvidenceLedger.js';
import { KernelProviderRegistry } from '../KernelProviderRegistry.js';
import {
  ClockworkEngine, clockworkProvider, addMonths, easterSunday, polishPublicHolidays, isWorkingDay, shiftToWorkingDay,
  statutoryDeadline, workingDaysBetween, type CaseRecord, type ClockworkReport,
} from './ClockworkEngine.js';

const clock = { t: 1_700_000_000_000, now() { return this.t; } };
const none = new Set<string>();
const mk = () => new ClockworkEngine(new EvidenceLedger(clock), { officeName: 'Urząd Testowy' });

describe('CLOCKWORK — calendar law (KPA art. 57, holidays act)', () => {
  it('KPA art. 57 §3: a month term ends on the matching day, or the last day of the month when there is none', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28');
  });
  it('Easter and the movable holidays are computed, not typed in', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    const h = polishPublicHolidays(2026);
    expect(h).toContain('2026-04-06'); // Easter Monday
    expect(h).toContain('2026-06-04'); // Corpus Christi (+60)
    expect(h).toContain('2026-12-24'); // from 2025
    expect(polishPublicHolidays(2024)).not.toContain('2024-12-24');
  });
  it('KPA art. 57 §4: a term ending on a Saturday or holiday moves to the next working day', () => {
    expect(isWorkingDay('2026-05-01', none)).toBe(false); // Friday, Labour Day
    expect(shiftToWorkingDay('2026-05-01', none)).toBe('2026-05-04'); // Sat, Sun 3 May (holiday) -> Monday
    expect(shiftToWorkingDay('2026-04-04', none)).toBe('2026-04-07'); // Sat, Easter Sun, Easter Mon -> Tuesday
    expect(shiftToWorkingDay('2026-04-08', none)).toBe('2026-04-08');
    expect(shiftToWorkingDay('2026-04-08', new Set(['2026-04-08']))).toBe('2026-04-09'); // office closure
  });
  it('statutory deadlines carry their basis and the shift, per case kind', () => {
    const d1 = statutoryDeadline({ caseId: 'A', kind: 'KPA_STANDARD', receivedAt: '2026-03-04', subject: 's' }, none);
    expect(d1).toEqual({ date: '2026-04-07', basis: 'KPA art. 35 §3 (1 miesiąc) + art. 57 §3 + art. 57 §4 (przesunięcie na dzień roboczy)', shiftedFrom: '2026-04-04' });
    const d2 = statutoryDeadline({ caseId: 'B', kind: 'KPA_COMPLEX', receivedAt: '2026-03-04', subject: 's' }, none);
    expect(d2.date).toBe('2026-05-04');
    const d3 = statutoryDeadline({ caseId: 'C', kind: 'FOI', receivedAt: '2026-03-02', subject: 's' }, none);
    expect(d3).toEqual({ date: '2026-03-16', basis: 'UDIP art. 13 ust. 1 (14 dni) + KPA art. 57 §1', shiftedFrom: null });
  });
  it('working days between two dates skip weekends and holidays, and are signed', () => {
    // strictly after Wed 1 Apr: Thu 2, Fri 3, (Sat 4, Easter Sun 5, Easter Mon 6 skipped), Tue 7, Wed 8
    expect(workingDaysBetween('2026-04-01', '2026-04-08', none)).toBe(4);
    expect(workingDaysBetween('2026-04-08', '2026-04-01', none)).toBe(-4);
  });
});

describe('CLOCKWORK — assessment, drafts, ledger anchoring', () => {
  const cases: readonly CaseRecord[] = [
    { caseId: 'KPA-2026-0001', kind: 'KPA_STANDARD', receivedAt: '2026-02-10', subject: 'zezwolenie na usunięcie drzewa' },     // deadline 2026-03-10
    { caseId: 'KPA-2026-0002', kind: 'KPA_STANDARD', receivedAt: '2026-01-05', subject: 'warunki zabudowy' },                   // deadline 2026-02-05, overdue
    { caseId: 'FOI-2026-0007', kind: 'FOI', receivedAt: '2026-02-24', subject: 'rejestr umów za 2025' },                       // deadline 2026-03-10
    { caseId: 'KPA-2026-0003', kind: 'KPA_COMPLEX', receivedAt: '2026-02-20', subject: 'pozwolenie wodnoprawne' },              // deadline 2026-04-20
    { caseId: 'KPA-2026-0004', kind: 'KPA_STANDARD', receivedAt: '2026-01-20', subject: 'meldunek', closedAt: '2026-02-01' },
  ];
  const today = '2026-03-04';

  it('classifies every case with working days left and an escalation level', () => {
    const r = mk().assess(cases, today);
    const by = Object.fromEntries(r.cases.map((c) => [c.caseId, c]));
    expect(by['KPA-2026-0001'].status).toBe('DUE_SOON');
    expect(by['KPA-2026-0001'].workingDaysLeft).toBe(4);
    expect(by['KPA-2026-0002'].status).toBe('OVERDUE');
    expect(by['KPA-2026-0002'].escalationLevel).toBe(2);
    expect(by['FOI-2026-0007'].status).toBe('DUE_SOON');
    expect(by['KPA-2026-0003'].status).toBe('ON_TRACK');
    expect(by['KPA-2026-0004'].status).toBe('CLOSED');
    expect(r.counts).toEqual({ CLOSED: 1, ON_TRACK: 1, DUE_SOON: 2, OVERDUE: 1 });
    expect(r.label).toBe('DETERMINISTIC_CALENDAR_MODEL');
  });

  it('drafts the right notice for each situation, always as a draft for a human', () => {
    const r = mk().assess(cases, today);
    const by = Object.fromEntries(r.cases.map((c) => [c.caseId, c]));
    expect(by['KPA-2026-0001'].drafts.map((d) => d.kind)).toEqual(['ZAWIADOMIENIE_ART_36']);
    expect(by['KPA-2026-0002'].drafts.map((d) => d.kind)).toEqual(['ESKALACJA_ART_37']);
    expect(by['FOI-2026-0007'].drafts.map((d) => d.kind)).toEqual(['POWIADOMIENIE_ART_13']);
    expect(by['FOI-2026-0007'].drafts[0].proposedNewDeadline).toBe('2026-04-24'); // two months from the request, working day
    expect(by['KPA-2026-0003'].drafts).toEqual([]);
    for (const c of r.cases) for (const d of c.drafts) {
      expect(d.status).toBe('DRAFT_FOR_HUMAN_APPROVAL');
      expect(d.requiresApproval).toBe(true);
      expect(d.body).toContain(c.caseId);
      expect(d.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(by['KPA-2026-0001'].drafts[0].body).toContain('[DO UZUPEŁNIENIA PRZEZ REFERENTA]');
  });

  it('an extension granted by a human replaces the statutory deadline', () => {
    const extended: CaseRecord = { ...cases[1], extensions: [{ newDeadline: '2026-03-31', reason: 'oczekiwanie na opinię RDOŚ', provenanceHash: 'a'.repeat(64) }] };
    const r = mk().assess([extended], today);
    expect(r.cases[0].status).toBe('ON_TRACK');
    expect(r.cases[0].effectiveDeadline).toBe('2026-03-31');
    expect(r.cases[0].deadline.date).toBe('2026-02-05');
  });

  it('anchors every assessment and every draft in the EvidenceLedger, and the chain verifies', () => {
    const ledger = new EvidenceLedger(clock);
    const r = new ClockworkEngine(ledger).assess(cases, today);
    const ids = new Set(ledger.getEntries().map((e) => e.recordId));
    for (const c of r.cases) { expect(ids.has(c.ledgerRecordId)).toBe(true); for (const d of c.drafts) expect(ids.has(d.ledgerRecordId)).toBe(true); }
    expect(ledger.getEntries().length).toBe(cases.length + 3);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('is deterministic: same cases and same today give the same report hash', () => {
    expect(mk().assess(cases, today).reportHash).toBe(mk().assess(cases, today).reportHash);
    expect(mk().assess(cases, '2026-03-05').reportHash).not.toBe(mk().assess(cases, today).reportHash);
  });

  it('rejects a malformed date instead of guessing', () => {
    expect(() => mk().assess(cases, '2026-3-4')).toThrow('BAD_ISO_DATE');
    expect(() => mk().assess([{ caseId: 'X', kind: 'FOI', receivedAt: '2026-02-30', subject: 's' }], today)).toThrow('BAD_ISO_DATE');
  });
});

describe('CLOCKWORK — registered with the single kernel, no execute', () => {
  it('resolves through the registry and returns the engine result', () => {
    const reg = new KernelProviderRegistry();
    reg.bindKernel('genesis-cyber-kernel');
    reg.register(clockworkProvider(mk()));
    const p = reg.resolve('deadline-monitoring');
    expect(p?.providerId).toBe('clockwork');
    const r = p!.analyze({ kernelId: 'genesis-cyber-kernel', route: '#/cyber', operatorId: 'REF-1' }, { cases: [{ caseId: 'K', kind: 'FOI', receivedAt: '2026-03-02', subject: 's' }], today: '2026-03-04' }) as ClockworkReport;
    expect(r.cases[0].effectiveDeadline).toBe('2026-03-16');
    expect(() => reg.bindKernel('clockwork-kernel')).toThrow('KERNEL_ALREADY_BOUND');
  });
  it('has no send/execute/dispatch on the engine', () => {
    const e = mk() as unknown as Record<string, unknown>;
    for (const m of ['execute', 'send', 'dispatch', 'sign']) expect(e[m]).toBeUndefined();
  });
  it('iron rules: no Math.random, no Date.now, no wall clock', () => {
    const s = readFileSync(fileURLToPath(new URL('./ClockworkEngine.ts', import.meta.url)), 'utf8');
    expect(s).not.toContain('Math.random(');
    expect(s).not.toContain('Date.now(');
    expect(s).not.toContain('new Date()');
  });
});
