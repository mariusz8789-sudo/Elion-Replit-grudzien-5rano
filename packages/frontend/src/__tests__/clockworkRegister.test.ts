import { describe, expect, it } from 'vitest';
import {
  REGISTER_STORAGE_KEY, approveDraft, assessViaKernel, decodeRegister, encodeRegister, initialReview, ledgerEntryFor, loadRegister,
  renderFinalBody, saveRegister, validateNewCase,
} from '../core/clockwork/clockworkRegister';
import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { GENESIS_CYBER_KERNEL_ID } from '../core/agent/cyberReasoningKernel';

/**
 * The clerk's register and the dual-control over drafts, as pure functions.
 * The dashboard is a thin view over these, and over the single kernel's
 * CLOCKWORK provider — it never builds an engine of its own.
 */
describe('CLOCKWORK register — codec is strict, storage is optional', () => {
  it('drops malformed entries instead of repairing them', () => {
    const raw = JSON.stringify([
      { caseId: 'A', kind: 'FOI', receivedAt: '2026-03-02', subject: 'x' },
      { caseId: '', kind: 'FOI', receivedAt: '2026-03-02', subject: 'no id' },
      { caseId: 'B', kind: 'NOPE', receivedAt: '2026-03-02', subject: 'bad kind' },
      { caseId: 'C', kind: 'KPA_STANDARD', receivedAt: '2026-02-30', subject: 'bad date' },
      { caseId: 'D', kind: 'KPA_STANDARD', receivedAt: '2026-02-10', subject: 'ok', closedAt: '2026-02-20' },
      'garbage', null,
    ]);
    const cases = decodeRegister(raw);
    expect(cases.map((c) => c.caseId)).toEqual(['A', 'D']);
    expect(cases[1].closedAt).toBe('2026-02-20');
    expect(decodeRegister('{not json')).toEqual([]);
    expect(decodeRegister(null)).toEqual([]);
    expect(decodeRegister(encodeRegister(cases))).toEqual(cases);
  });
  it('load/save go through the given storage and survive a throwing one', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    saveRegister(storage, [{ caseId: 'A', kind: 'FOI', receivedAt: '2026-03-02', subject: 'x' }]);
    expect(mem.has(REGISTER_STORAGE_KEY)).toBe(true);
    expect(loadRegister(storage)[0].caseId).toBe('A');
    const broken = { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('private mode'); } };
    expect(loadRegister(broken)).toEqual([]);
    expect(() => saveRegister(broken, [])).not.toThrow();
    expect(loadRegister(null)).toEqual([]);
  });
  it('validates a new case with a reason the clerk can read', () => {
    const existing = [{ caseId: 'A', kind: 'FOI' as const, receivedAt: '2026-03-02', subject: 'x' }];
    expect(validateNewCase({ caseId: ' ', kind: 'FOI', receivedAt: '2026-03-02', subject: 's' }, existing)).toEqual({ ok: false, error: 'Podaj sygnaturę sprawy.' });
    expect(validateNewCase({ caseId: 'A', kind: 'FOI', receivedAt: '2026-03-02', subject: 's' }, existing)).toMatchObject({ ok: false, error: 'Sprawa A już jest w rejestrze.' });
    expect(validateNewCase({ caseId: 'B', kind: 'X', receivedAt: '2026-03-02', subject: 's' }, existing)).toMatchObject({ ok: false });
    expect(validateNewCase({ caseId: 'B', kind: 'FOI', receivedAt: '2.3.2026', subject: 's' }, existing)).toMatchObject({ ok: false, error: 'Data wpływu musi mieć postać RRRR-MM-DD.' });
    expect(validateNewCase({ caseId: 'B', kind: 'FOI', receivedAt: '2026-03-02', subject: '  ' }, existing)).toMatchObject({ ok: false });
    expect(validateNewCase({ caseId: ' B ', kind: 'KPA_APPEAL', receivedAt: '2026-03-02', subject: ' odwołanie ' }, existing)).toEqual({ ok: true, record: { caseId: 'B', kind: 'KPA_APPEAL', receivedAt: '2026-03-02', subject: 'odwołanie' } });
  });
});

describe('CLOCKWORK register — one kernel, real provider, real ledger', () => {
  it('the cyber kernel is the bound kernel and CLOCKWORK resolves through it', () => {
    expect(kernelRegistry.boundKernel).toBe(GENESIS_CYBER_KERNEL_ID);
    expect(kernelRegistry.resolve('deadline-monitoring')?.providerId).toBe('clockwork');
    expect(() => kernelRegistry.bindKernel('clockwork-dashboard')).toThrow('KERNEL_ALREADY_BOUND');
  });
  it('assessViaKernel returns the engine report and its ledger entries are real', () => {
    const r = assessViaKernel([
      { caseId: 'KPA-1', kind: 'KPA_STANDARD', receivedAt: '2026-02-10', subject: 'drzewo' },
      { caseId: 'FOI-1', kind: 'FOI', receivedAt: '2026-02-24', subject: 'umowy' },
    ], '2026-03-04', 'REF-1');
    expect(r.label).toBe('DETERMINISTIC_CALENDAR_MODEL');
    expect(r.cases.map((c) => [c.caseId, c.status])).toEqual([['FOI-1', 'DUE_SOON'], ['KPA-1', 'DUE_SOON']]);
    for (const c of r.cases) {
      const e = ledgerEntryFor(c.ledgerRecordId);
      expect(e?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(ledgerEntryFor('EV-does-not-exist')).toBeNull();
  });
});

describe('CLOCKWORK register — dual-control over a draft', () => {
  const draft = assessViaKernel([{ caseId: 'KPA-9', kind: 'KPA_STANDARD', receivedAt: '2026-02-10', subject: 'x' }], '2026-03-04', 'REF-1').cases[0].drafts[0];
  it('refuses to approve with the reason still empty, refuses the same person twice, seals on the second person', () => {
    let r = initialReview(draft);
    r = approveDraft(r, draft, 'J.Kowalska');
    expect(r.error).toContain('Najpierw uzupełnij przyczynę');
    expect(r.approvals).toEqual([]);
    r = { ...r, reason: 'oczekiwanie na opinię RDOŚ' };
    r = approveDraft(r, draft, '  ');
    expect(r.error).toBe('Podaj identyfikator osoby zatwierdzającej.');
    r = approveDraft(r, draft, 'J.Kowalska');
    expect(r).toMatchObject({ approvals: ['J.Kowalska'], status: 'DRAFT_FOR_HUMAN_APPROVAL', finalHash: null, error: null });
    r = approveDraft(r, draft, 'J.Kowalska');
    expect(r.error).toContain('BLOCKED');
    expect(r.approvals).toEqual(['J.Kowalska']);
    r = approveDraft(r, draft, 'M.Nowak');
    expect(r.status).toBe('AUTHORIZED_FOR_HUMAN_EXECUTION');
    expect(r.approvals).toEqual(['J.Kowalska', 'M.Nowak']);
    expect(r.finalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(approveDraft(r, draft, 'Z.Trzeci').error).toContain('już zatwierdzone');
  });
  it('the final body is the draft with the reason filled in and nothing else changed', () => {
    const body = renderFinalBody(draft, 'brak opinii biegłego');
    expect(body).toContain('Przyczyna zwłoki: brak opinii biegłego');
    expect(body).not.toContain('[DO UZUPEŁNIENIA PRZEZ REFERENTA]');
    expect(body.split('\n').length).toBe(draft.body.split('\n').length);
    expect(renderFinalBody(draft, '   ')).toBe(draft.body);
  });
  it('the sealed hash depends on the reason: a different reason is a different document', () => {
    const a = approveDraft(approveDraft({ ...initialReview(draft), reason: 'A' }, draft, 'X'), draft, 'Y').finalHash;
    const b = approveDraft(approveDraft({ ...initialReview(draft), reason: 'B' }, draft, 'X'), draft, 'Y').finalHash;
    expect(a).not.toBe(b);
  });
});
