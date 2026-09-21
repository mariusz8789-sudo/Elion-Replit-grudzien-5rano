import { useEffect, useMemo, useState } from 'react';
import type { CaseAssessment, CaseRecord, CaseStatus, ClockworkReport, DraftDocument } from '@genesis/core/mythos/clockwork/ClockworkEngine.js';
import {
  CASE_KINDS, approveDraft, assessViaKernel, initialReview, ledgerEntryFor, loadRegister, renderFinalBody, saveRegister, validateNewCase,
  type DraftReview,
} from '../core/clockwork/clockworkRegister';

/**
 * CLOCKWORK — the clerk's dashboard (`#/clockwork`).
 *
 * One screen for one job: which cases are due, which are late, and the
 * notice to send when a date cannot be met. Every number here is the
 * engine's own arithmetic (KPA art. 35/36/37/57, UDIP art. 13) over cases
 * the clerk entered; the ledger hash next to each deadline is the real
 * EvidenceLedger entry. Drafts are drafts: the reason is typed by a person,
 * two different people approve, and sending happens outside this system.
 *
 * The register starts empty and lives in this browser (localStorage). No
 * sample cases are planted — an empty office looks empty.
 */

const STATUS_LABEL: Record<CaseStatus, string> = { ON_TRACK: 'W TERMINIE', DUE_SOON: 'ZBLIŻA SIĘ TERMIN', OVERDUE: 'PO TERMINIE', CLOSED: 'ZAŁATWIONA' };
const KIND_LABEL = Object.fromEntries(CASE_KINDS.map((k) => [k.kind, k.label])) as Record<CaseRecord['kind'], string>;
const localToday = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const storage = (): Storage | null => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export function ClockworkDashboard(): JSX.Element {
  const [cases, setCases] = useState<CaseRecord[]>(() => loadRegister(storage()));
  const [today, setToday] = useState<string>(() => localToday());
  const [operator, setOperator] = useState('');
  const [form, setForm] = useState({ caseId: '', kind: 'KPA_STANDARD', receivedAt: '', subject: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, DraftReview>>({});
  const [approverId, setApproverId] = useState('');

  useEffect(() => { saveRegister(storage(), cases); }, [cases]);

  const report: ClockworkReport | { error: string } = useMemo(() => {
    try { return assessViaKernel(cases, today, operator || 'REFERENT'); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [cases, today, operator]);
  const ok = 'cases' in report ? report : null;
  const kpa = ok ? ok.cases.filter((c) => c.kind !== 'FOI') : [];
  const foi = ok ? ok.cases.filter((c) => c.kind === 'FOI') : [];
  const selectedCase = ok?.cases.find((c) => c.caseId === selected) ?? null;

  const addCase = (): void => {
    const v = validateNewCase(form, cases);
    if (!v.ok) { setFormError(v.error); return; }
    setCases((prev) => [...prev, v.record]);
    setForm({ caseId: '', kind: form.kind, receivedAt: '', subject: '' });
    setFormError(null);
  };
  const closeCase = (id: string): void => setCases((prev) => prev.map((c) => (c.caseId === id ? { ...c, closedAt: today } : c)));
  const removeCase = (id: string): void => { setCases((prev) => prev.filter((c) => c.caseId !== id)); if (selected === id) setSelected(null); };
  const reviewOf = (d: DraftDocument): DraftReview => reviews[d.draftId] ?? initialReview(d);
  const setReason = (d: DraftDocument, reason: string): void => setReviews((r) => ({ ...r, [d.draftId]: { ...reviewOf(d), reason, error: null } }));
  const approve = (d: DraftDocument): void => { setReviews((r) => ({ ...r, [d.draftId]: approveDraft(reviewOf(d), d, approverId) })); };

  const row = (c: CaseAssessment): JSX.Element => {
    const src = cases.find((x) => x.caseId === c.caseId);
    const entry = ledgerEntryFor(c.ledgerRecordId);
    return (
      <tr key={c.caseId} className={`cw-row cw-${c.status.toLowerCase()}${selected === c.caseId ? ' cw-selected' : ''}`} data-status={c.status} data-testid={`cw-case-${c.caseId}`} onClick={() => setSelected(c.caseId)}>
        <td className="cw-id">{c.caseId}</td>
        <td>{src?.subject ?? ''}</td>
        <td className="cw-mono">{src?.receivedAt ?? ''}</td>
        <td className="cw-mono" title={c.deadline.basis}>{c.effectiveDeadline}{c.deadline.shiftedFrom ? ` (z ${c.deadline.shiftedFrom})` : ''}</td>
        <td className="cw-mono">{c.status === 'CLOSED' ? '—' : c.workingDaysLeft}</td>
        <td><span className={`cw-badge cw-badge-${c.status.toLowerCase()}`}>{STATUS_LABEL[c.status]}</span></td>
        <td className="cw-mono cw-hash" title={entry ? `ledger #${entry.index} · contentHash ${entry.contentHash}` : ''}>{entry ? entry.contentHash.slice(0, 12) : '—'}</td>
        <td className="cw-mono">{c.drafts.length > 0 ? c.drafts.length : ''}</td>
      </tr>
    );
  };

  const table = (title: string, basis: string, rows: readonly CaseAssessment[]): JSX.Element => (
    <section className="cw-block" aria-label={title}>
      <h2>{title} <small>{basis}</small></h2>
      {rows.length === 0 ? <p className="cw-empty">Brak spraw w tej grupie.</p> : (
        <table className="cw-table">
          <thead><tr><th>Sygnatura</th><th>Przedmiot</th><th>Wpływ</th><th>Termin</th><th>Dni rob.</th><th>Stan</th><th>Ledger</th><th>Pisma</th></tr></thead>
          <tbody>{rows.map(row)}</tbody>
        </table>
      )}
    </section>
  );

  return (
    <main id="main-content" className="cw" aria-label="CLOCKWORK — terminy KPA i UDIP" data-testid="clockwork-dashboard">
      <header className="cw-head">
        <div>
          <div className="gx-eyebrow">GENESIS · B2G · CLOCKWORK</div>
          <h1>Terminy KPA i UDIP</h1>
          <p className="cw-lede">Arytmetyka terminów z podstawą prawną na każdym wyniku, projekty pism do zatwierdzenia przez dwie osoby, każde wyliczenie zakotwiczone w EvidenceLedger. To narzędzie liczy; interpretację ma prawnik, podpis ma referent.</p>
        </div>
        <div className="cw-controls">
          <label>Dzień oceny <input type="date" value={today} onChange={(e) => setToday(e.target.value)} data-testid="cw-today" /></label>
          <label>Referent <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="np. J.Kowalska" data-testid="cw-operator" /></label>
        </div>
      </header>

      {ok ? (
        <div className="cw-counts" aria-label="Podsumowanie">
          <span className="cw-badge cw-badge-overdue">PO TERMINIE {ok.counts.OVERDUE}</span>
          <span className="cw-badge cw-badge-due_soon">ZBLIŻA SIĘ {ok.counts.DUE_SOON}</span>
          <span className="cw-badge cw-badge-on_track">W TERMINIE {ok.counts.ON_TRACK}</span>
          <span className="cw-badge cw-badge-closed">ZAŁATWIONE {ok.counts.CLOSED}</span>
          <span className="cw-mono cw-faint">raport {ok.reportHash.slice(0, 12)} · {ok.label}</span>
        </div>
      ) : <p className="cw-error" role="alert">Silnik CLOCKWORK niedostępny: {(report as { error: string }).error}</p>}

      <section className="cw-block cw-add" aria-label="Nowa sprawa">
        <h2>Dodaj sprawę do rejestru</h2>
        <form className="cw-form" onSubmit={(e) => { e.preventDefault(); addCase(); }}>
          <input placeholder="Sygnatura (np. WOŚ.6131.12.2026)" value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} data-testid="cw-new-id" />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="cw-new-kind">
            {CASE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label} · {k.basis}</option>)}
          </select>
          <input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} data-testid="cw-new-received" />
          <input placeholder="Przedmiot sprawy" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="cw-new-subject" />
          <button type="submit" className="cw-btn" data-testid="cw-new-submit">Dodaj</button>
        </form>
        {formError && <p className="cw-error" role="alert">{formError}</p>}
      </section>

      {table('Sprawy KPA', 'art. 35 §3 · art. 36 · art. 57 KPA', kpa)}
      {table('Wnioski o informację publiczną', 'art. 13 UDIP', foi)}

      {selectedCase && (
        <section className="cw-block cw-inspect" aria-label={`Sprawa ${selectedCase.caseId}`} data-testid="cw-inspect">
          <h2>{selectedCase.caseId} <small>{KIND_LABEL[selectedCase.kind]}</small></h2>
          <dl className="cw-readout">
            <dt>Termin ustawowy</dt><dd className="cw-mono">{selectedCase.deadline.date}{selectedCase.deadline.shiftedFrom ? ` (przesunięty z ${selectedCase.deadline.shiftedFrom})` : ''}</dd>
            <dt>Podstawa</dt><dd>{selectedCase.deadline.basis}</dd>
            <dt>Stan</dt><dd><span className={`cw-badge cw-badge-${selectedCase.status.toLowerCase()}`}>{STATUS_LABEL[selectedCase.status]}</span> · eskalacja {selectedCase.escalationLevel}</dd>
            <dt>Ledger</dt><dd className="cw-mono cw-wrap" data-testid="cw-ledger-hash">{(() => { const e = ledgerEntryFor(selectedCase.ledgerRecordId); return e ? `#${e.index} · contentHash ${e.contentHash}` : selectedCase.ledgerRecordId; })()}</dd>
            <dt>Ocena</dt><dd className="cw-mono cw-wrap">{selectedCase.assessmentHash}</dd>
          </dl>
          <div className="cw-actions">
            {selectedCase.status !== 'CLOSED' && <button type="button" className="cw-btn" onClick={() => closeCase(selectedCase.caseId)}>Oznacz jako załatwioną ({today})</button>}
            <button type="button" className="cw-btn cw-btn-quiet" onClick={() => removeCase(selectedCase.caseId)}>Usuń z rejestru</button>
          </div>

          {selectedCase.drafts.map((d) => {
            const r = reviewOf(d);
            return (
              <article key={d.draftId} className="cw-draft" data-testid={`cw-draft-${d.kind}`}>
                <h3>{d.title}</h3>
                <p className="cw-faint">{d.basis} · {r.status === 'AUTHORIZED_FOR_HUMAN_EXECUTION' ? 'ZATWIERDZONE 2/2 — do wysyłki poza systemem' : 'PROJEKT DO ZATWIERDZENIA PRZEZ CZŁOWIEKA'} · provenance {d.provenanceHash.slice(0, 12)}</p>
                <pre className="cw-body" data-testid="cw-draft-body">{renderFinalBody(d, r.reason)}</pre>
                {d.body.includes('[DO UZUPEŁNIENIA PRZEZ REFERENTA]') && r.status !== 'AUTHORIZED_FOR_HUMAN_EXECUTION' && (
                  <label className="cw-reason">Przyczyna (wpisuje referent)
                    <textarea value={r.reason} onChange={(e) => setReason(d, e.target.value)} rows={2} data-testid="cw-draft-reason" />
                  </label>
                )}
                <div className="cw-dual">
                  <span className="cw-faint">Dual-control: {r.approvals.length}/2 {r.approvals.length ? `(${r.approvals.join(', ')})` : ''}</span>
                  {r.status !== 'AUTHORIZED_FOR_HUMAN_EXECUTION' && (
                    <>
                      <input value={approverId} onChange={(e) => setApproverId(e.target.value)} placeholder="identyfikator zatwierdzającego" data-testid="cw-approver" />
                      <button type="button" className="cw-btn" onClick={() => approve(d)} data-testid="cw-approve">Zatwierdź i podpisz ({r.approvals.length + 1}/2)</button>
                    </>
                  )}
                </div>
                {r.error && <p className="cw-error" role="alert" data-testid="cw-approve-error">{r.error}</p>}
                {r.finalHash && <p className="cw-mono cw-wrap" data-testid="cw-final-hash">hash zatwierdzonego pisma: {r.finalHash}</p>}
              </article>
            );
          })}
          {selectedCase.drafts.length === 0 && <p className="cw-empty">Brak projektów pism dla tej sprawy: termin nie jest zagrożony.</p>}
        </section>
      )}
    </main>
  );
}

export default ClockworkDashboard;
