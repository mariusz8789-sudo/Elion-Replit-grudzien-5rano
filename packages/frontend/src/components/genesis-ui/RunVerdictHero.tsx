import type React from 'react';
import type { DiscoveryRun } from '../../core/orchestrator/contracts';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../../core/orchestrator/winnerRecord';
import { VerdictWhyStrip } from './VerdictWhyStrip';
import type { AuditSeal } from '../../core/audit/cryptoAudit';

/**
 * RunVerdictHero — the ONE place a finished run answers first (D-118): the
 * verdict, the winner (or the blocker), the favourite's governance gate, the
 * three conjunct ticks, and four KPI tiles read straight off the run. It sits
 * above the timeline so the answer is never 3 700 px below the fold. Every
 * value is the run's own; a NO_WINNER gets the same visual weight as a WINNER.
 */
export interface AuditLedgerView { readonly length: number; readonly ok: boolean; readonly reason: string | null; }

export function RunVerdictHero({ run, detail, record, seal, ledger }: {
  readonly run: DiscoveryRun;
  readonly detail: LowerHarmRunDetail | undefined;
  readonly record: LowerHarmWinnerRecord | NoWinnerBlocker | undefined;
  /** D-121: the run's SHA-256 seal and the client ledger it was appended to. */
  readonly seal?: AuditSeal;
  readonly ledger?: AuditLedgerView;
}): React.ReactElement {
  const winner = record?.kind === 'WINNER_RECORD' ? record : null;
  const blocker = record?.kind === 'NO_WINNER_BLOCKER' ? record : null;
  const cleared = detail?.candidates.filter((c) => c.qualifies).length ?? 0;
  const total = detail?.candidates.length ?? 0;
  const disc = detail?.falsification?.outcome === 'EXPERIMENT_SELECTED' ? detail.falsification.discriminability : null;
  const tone = run.verdict === 'WINNER' ? 'winner' : run.verdict === 'NO_WINNER' ? 'no-winner' : 'other';
  return (
    <section className={`gu-hero gu-hero-${tone}`} aria-label="Werdykt przebiegu" data-testid="run-verdict-hero">
      <div className="gu-hero-main">
        <span className="gx-eyebrow">Werdykt · {run.mode}</span>
        <h2 className="gu-hero-title">
          {winner !== null ? <>WINNER — {winner.candidateName} <code>{winner.winnerId}</code></> : blocker !== null ? <>{blocker.verdict} — zatrzymano na {blocker.blockedAt}</> : run.verdict}
        </h2>
        <p className="gu-hero-text">
          {winner !== null
            ? `Pod zamrożoną regułą LOWER-HARM wszystkie trzy warunki zaszły. Bramka nadzoru: ${winner.gate.outcome.replace(/_/g, ' ')} — nic nie jest aktywowane przez ten system.`
            : blocker !== null
              ? blocker.reason
              : (detail?.verdictReason ?? 'Przebieg zakończony bez rekordu zwycięzcy.')}
        </p>
        {detail !== undefined && <VerdictWhyStrip detail={detail} record={record} />}
      </div>
      <ul className="gu-hero-kpis" aria-label="Kluczowe liczby przebiegu">
        <li><b>{detail?.evidence.length ?? 0}</b><span>realnych obserwacji</span></li>
        <li><b>{cleared}<small>/{total}</small></b><span>kandydatów przez próg i weto</span></li>
        <li><b>{disc === null || disc === undefined ? 'n/a' : `${disc.toFixed(2)}σ`}</b><span>rozdzielczość G2</span></li>
        <li><b><code>{run.auditFingerprint.slice(0, 8)}</code></b><span>odcisk audytu · {run.stages.length} etapów</span></li>
      </ul>
      {seal !== undefined && (
        <p className="gu-hero-seal" data-testid="audit-seal">
          <span className="gu-hero-seal-label">Pieczęć SHA-256</span>
          <code title={seal.sha256}>{seal.sha256.slice(0, 16)}…</code>
          {ledger !== undefined && (
            <span className={ledger.ok ? 'gu-hero-seal-ok' : 'gu-hero-seal-bad'} data-testid="audit-ledger">
              łańcuch audytu: {ledger.length} {ledger.length === 1 ? 'pieczęć' : 'pieczęci'} · {ledger.ok ? 'integralność OK' : `NARUSZONY — ${ledger.reason ?? ''}`}
            </span>
          )}
        </p>
      )}
      <div className="gu-hero-actions">
        {winner !== null && <a className="chip-btn primary" href="#winner-record">Research Recipe →</a>}
        {winner !== null && <a className="chip-btn" href="#/discovery-hall">Discovery Hall (3D)</a>}
        <a className="chip-btn" href="#candidate-space">Kandydaci</a>
        <a className="chip-btn" href="#winner-gate">Winner Gate</a>
      </div>
    </section>
  );
}
