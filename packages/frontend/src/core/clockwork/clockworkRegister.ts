import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import type { CaseKind, CaseRecord, ClockworkReport, DraftDocument } from '@genesis/core/mythos/clockwork/ClockworkEngine.js';
import { parseIso } from '@genesis/core/mythos/clockwork/ClockworkEngine.js';
import { sha256HexSync } from '@genesis/core/knowledge/sha256.js';
import { GENESIS_CYBER_KERNEL_ID, clockworkLedger } from '../agent/cyberReasoningKernel';

/**
 * CLOCKWORK register — the clerk's case list and the dual-control state of
 * the drafts, kept as pure functions so the dashboard component stays thin.
 *
 * Single-kernel discipline: the dashboard never instantiates ClockworkEngine.
 * It resolves the `deadline-monitoring` capability through the kernel
 * registry (the cyber kernel bound itself and registered the provider at
 * load), so the UI is a client of the one kernel, not a second one.
 *
 * Honest data: the register starts EMPTY. Cases come from the clerk (or the
 * office's registry import, later) and live in this browser's localStorage;
 * nothing is invented for the screen to look busy.
 */

export const REGISTER_STORAGE_KEY = 'genesis.clockwork.register.v1';
export const CASE_KINDS: readonly { readonly kind: CaseKind; readonly label: string; readonly basis: string }[] = [
  { kind: 'KPA_STANDARD', label: 'KPA — sprawa zwykła', basis: 'art. 35 §3 KPA · 1 miesiąc' },
  { kind: 'KPA_COMPLEX', label: 'KPA — szczególnie skomplikowana', basis: 'art. 35 §3 KPA · 2 miesiące' },
  { kind: 'KPA_APPEAL', label: 'KPA — odwołanie', basis: 'art. 35 §3 KPA · 1 miesiąc' },
  { kind: 'FOI', label: 'UDIP — informacja publiczna', basis: 'art. 13 ust. 1 UDIP · 14 dni' },
];

const isKind = (k: unknown): k is CaseKind => CASE_KINDS.some((c) => c.kind === k);

/** Strict decoder: anything malformed is dropped, never "fixed". */
export function decodeRegister(raw: string | null): CaseRecord[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: CaseRecord[] = [];
  for (const c of parsed) {
    if (typeof c !== 'object' || c === null) continue;
    const o = c as Record<string, unknown>;
    if (typeof o.caseId !== 'string' || !o.caseId.trim() || !isKind(o.kind) || typeof o.receivedAt !== 'string' || typeof o.subject !== 'string') continue;
    try { parseIso(o.receivedAt); } catch { continue; }
    const rec: CaseRecord = { caseId: o.caseId.trim(), kind: o.kind, receivedAt: o.receivedAt, subject: o.subject };
    if (typeof o.closedAt === 'string') { try { parseIso(o.closedAt); out.push({ ...rec, closedAt: o.closedAt }); continue; } catch { /* drop the bad closedAt, keep the case */ } }
    out.push(rec);
  }
  return out;
}
export const encodeRegister = (cases: readonly CaseRecord[]): string => JSON.stringify(cases);

export function loadRegister(storage: Pick<Storage, 'getItem'> | null): CaseRecord[] {
  try { return decodeRegister(storage?.getItem(REGISTER_STORAGE_KEY) ?? null); } catch { return []; }
}
export function saveRegister(storage: Pick<Storage, 'setItem'> | null, cases: readonly CaseRecord[]): void {
  try { storage?.setItem(REGISTER_STORAGE_KEY, encodeRegister(cases)); } catch { /* private mode: the session still works, it just does not persist */ }
}

export interface NewCaseInput { readonly caseId: string; readonly kind: string; readonly receivedAt: string; readonly subject: string; }
/** Validates a form submission; returns the record or the reason it was refused (Polish, for the clerk). */
export function validateNewCase(input: NewCaseInput, existing: readonly CaseRecord[]): { ok: true; record: CaseRecord } | { ok: false; error: string } {
  const caseId = input.caseId.trim();
  if (!caseId) return { ok: false, error: 'Podaj sygnaturę sprawy.' };
  if (existing.some((c) => c.caseId === caseId)) return { ok: false, error: `Sprawa ${caseId} już jest w rejestrze.` };
  if (!isKind(input.kind)) return { ok: false, error: 'Wybierz rodzaj sprawy.' };
  try { parseIso(input.receivedAt); } catch { return { ok: false, error: 'Data wpływu musi mieć postać RRRR-MM-DD.' }; }
  if (!input.subject.trim()) return { ok: false, error: 'Podaj przedmiot sprawy.' };
  return { ok: true, record: { caseId, kind: input.kind, receivedAt: input.receivedAt, subject: input.subject.trim() } };
}

/** Runs CLOCKWORK through the single kernel. Throws if the provider is not registered — that is a wiring bug, not a state to hide. */
export function assessViaKernel(cases: readonly CaseRecord[], today: string, operatorId: string): ClockworkReport {
  const provider = kernelRegistry.resolve('deadline-monitoring');
  if (!provider) throw new Error('CLOCKWORK_PROVIDER_NOT_REGISTERED');
  return provider.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/clockwork', operatorId }, { cases, today }) as ClockworkReport;
}

/** The ledger entry (index, contentHash, chain hash) behind a record id, straight from the kernel's CLOCKWORK ledger. */
export function ledgerEntryFor(recordId: string): { index: number; contentHash: string; hash: string } | null {
  const e = clockworkLedger.getEntries().find((x) => x.recordId === recordId);
  return e ? { index: e.index, contentHash: e.contentHash, hash: e.hash } : null;
}

// ---------- dual-control over a draft (pure) ----------

export interface DraftReview {
  readonly draftId: string;
  readonly reason: string;
  readonly approvals: readonly string[];
  readonly status: 'DRAFT_FOR_HUMAN_APPROVAL' | 'AUTHORIZED_FOR_HUMAN_EXECUTION';
  readonly finalHash: string | null;
  readonly error: string | null;
}
export const initialReview = (d: DraftDocument): DraftReview => ({ draftId: d.draftId, reason: '', approvals: [], status: 'DRAFT_FOR_HUMAN_APPROVAL', finalHash: null, error: null });

/** The draft body with the clerk's reason filled in; nothing else is rewritten. */
export function renderFinalBody(d: DraftDocument, reason: string): string {
  return d.body.replace('[DO UZUPEŁNIENIA PRZEZ REFERENTA]', reason.trim() || '[DO UZUPEŁNIENIA PRZEZ REFERENTA]');
}

/**
 * Dual-control: two DIFFERENT approver ids, the reason filled in first, and
 * the second approval seals the final body with a hash. Same person twice is
 * BLOCKED (the MythosSubstrate rule). Nothing here sends anything.
 */
export function approveDraft(review: DraftReview, draft: DraftDocument, approverId: string): DraftReview {
  const id = approverId.trim();
  if (review.status === 'AUTHORIZED_FOR_HUMAN_EXECUTION') return { ...review, error: 'Pismo jest już zatwierdzone (2/2).' };
  if (!id) return { ...review, error: 'Podaj identyfikator osoby zatwierdzającej.' };
  if (!review.reason.trim() && draft.body.includes('[DO UZUPEŁNIENIA PRZEZ REFERENTA]')) return { ...review, error: 'Najpierw uzupełnij przyczynę — pismo z pustym polem nie może zostać zatwierdzone.' };
  if (review.approvals.includes(id)) return { ...review, error: `BLOCKED: ${id} już zatwierdził(a) to pismo. Dual-control wymaga drugiej osoby.` };
  const approvals = [...review.approvals, id];
  if (approvals.length >= 2) {
    const finalHash = sha256HexSync(JSON.stringify({ draftId: draft.draftId, provenanceHash: draft.provenanceHash, body: renderFinalBody(draft, review.reason), approvals }));
    return { ...review, approvals, status: 'AUTHORIZED_FOR_HUMAN_EXECUTION', finalHash, error: null };
  }
  return { ...review, approvals, error: null };
}
