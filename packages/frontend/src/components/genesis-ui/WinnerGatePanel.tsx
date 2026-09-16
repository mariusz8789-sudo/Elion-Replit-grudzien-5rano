import type React from 'react';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../../core/orchestrator/winnerRecord';
import { FingerprintChip } from './FingerprintChip';

/**
 * WinnerGatePanel — projects the REAL Winner Gate outcome of one run: the
 * three conjuncts `decideFunnelVerdict` evaluated, every candidate's
 * safety/governance gate decision (incl. REQUIRES_HUMAN_APPROVAL, which no
 * screen rendered before D-116), the G2 falsification numbers, and — for a
 * NO_WINNER — the exact stage that blocked. Renders exactly what it is
 * given; it does not know what a "good" outcome is and never softens a
 * refusal. WINNER and NO_WINNER get the same visual budget on purpose.
 */

const GATE_LABEL: Readonly<Record<string, string>> = {
  ACTIVATE: 'ACTIVATE',
  REQUIRES_HUMAN_APPROVAL: 'REQUIRES HUMAN APPROVAL — closed until a person signs off',
  REFUSE: 'REFUSE',
};

export function WinnerGatePanel({ detail, record }: { readonly detail: LowerHarmRunDetail; readonly record: LowerHarmWinnerRecord | NoWinnerBlocker | undefined }): React.ReactElement {
  const f = detail.falsification;
  return (
    <div className="gu-gate">
      <h3 className="section-label">Winner Gate — three conjuncts, all must hold</h3>
      <ol className="gu-gate-conjuncts">
        {detail.conjuncts.map((c, i) => (
          <li key={c.criterion} className={`gu-gate-conjunct ${c.held ? 'gu-gate-held' : 'gu-gate-failed'}`} data-testid={`conjunct-${c.criterion}`}>
            <span className="gu-gate-index">{i + 1}</span>
            <span className="gu-gate-state">{c.held ? 'HELD' : 'FAILED'}</span>
            <span className="gu-gate-name">{c.criterion}</span>
            <span className="gu-gate-detail">{c.detail}</span>
          </li>
        ))}
        {detail.conjuncts.length === 0 && <li className="gu-gate-conjunct"><span className="gu-gate-detail">No pair reached the falsification stage — no conjunct was evaluated.</span></li>}
      </ol>

      {f !== null && (
        <div className="gu-gate-g2">
          <h4 className="section-label">G2 falsification experiment</h4>
          {f.outcome === 'EXPERIMENT_SELECTED' ? (
            <>
              <p className="gu-hint">
                Observable <code>{f.observableId}</code> · falsification power {Math.round((f.falsificationPower ?? 0) * 100)}% · discriminability {f.discriminability?.toFixed(2) ?? 'n/a'}σ · unresolved pairs {f.unresolvedPairs} · decision rule frozen <code>{f.decisionRuleFingerprint}</code> before any observation was read
              </p>
              <ul className="gu-gate-expected">
                {f.expectedByCandidate.map((e) => (
                  <li key={e.candidateId}><code>{e.candidateId}</code> expected {e.expectedOutcome.toFixed(2)} pp (±{e.toleranceSigma}σ)</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="gu-hint">NO_DISCRIMINATING_EXPERIMENT_AVAILABLE — {f.reason}</p>
          )}
        </div>
      )}

      <h4 className="section-label">Safety / governance gate per TOP2 candidate</h4>
      <ul className="gu-gate-decisions">
        {detail.gateDecisions.map((g) => (
          <li key={g.candidateId} className={`gu-gate-decision gu-gate-decision-${g.outcome.toLowerCase()}`} data-testid={`gate-${g.candidateId}`}>
            <div className="gu-gate-decision-head">
              <span className="gu-gate-decision-candidate">{g.candidateName} <code>{g.candidateId}</code></span>
              <span className="gu-gate-decision-outcome">{GATE_LABEL[g.outcome] ?? g.outcome}</span>
            </div>
            <p className="gu-gate-decision-reason">{g.reason}</p>
            {g.failures.length > 0 && (
              <ul className="gu-gate-failures">
                {g.failures.map((x) => <li key={x.criterion}><strong>{x.criterion}</strong> — {x.detail}</li>)}
              </ul>
            )}
            {g.requiresCapability !== null && <p className="gu-hint">Approval capability required: <code>{g.requiresCapability}</code> (core/governance, separation of duties — this system does not authorise it)</p>}
            <FingerprintChip label="gate fp" value={g.fingerprint} />
          </li>
        ))}
      </ul>

      {record?.kind === 'NO_WINNER_BLOCKER' && (
        <div className="gu-gate-blocker" role="status" data-testid="no-winner-blocker">
          <div className="gu-gate-blocker-title">BLOCKED AT: {record.blockedAt}</div>
          <p>{record.reason}</p>
          {record.stageNote !== null && <p className="gu-hint">stage 18: {record.stageNote}</p>}
        </div>
      )}
    </div>
  );
}
