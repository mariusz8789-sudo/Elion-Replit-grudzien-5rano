import { useState } from 'react';
import type React from 'react';
import { FingerprintChip } from '../../../components/genesis-ui/FingerprintChip';
import { d063DoseBaselineComparisons, worstHarmPerDose, type DoseBaselineComparisonSet } from '../../discoveryChallenge/d063DoseBaselineComparisons';
import { D063_CLAIM_TEXT, D063_TRIGGER_RULE, runD063ClaimAudit, runD063ParametricTrigger } from '../govServiceRuns';
import type { ClaimAuditBlocked, ClaimAuditResult } from '../govClaimAudit';
import type { TriggerBlocked, TriggerResult } from '../govParametricTrigger';

/**
 * D-063 GOVERNMENT SERVICES PANEL — read-only projection.
 *
 * This component computes NOTHING. Every number below is exactly what
 * `d063DoseBaselineComparisons`, `runD063ClaimAudit` and
 * `runD063ParametricTrigger` returned from the real pinned SURPASS-2 bytes,
 * through the same D-057 custody store every other PRODUCTION run in this
 * console uses.
 *
 * WHY ALL THREE SIT TOGETHER. They are the three shapes of "prove it" a
 * government buyer actually asks for: is this candidate better than the
 * incumbent (baseline comparison), is this claim substantiated (audit
 * certificate), did the pre-agreed condition occur (trigger certificate).
 * None of them is a discovery run: the audit and the trigger return
 * `AuditCertificate`/`TriggerCertificate` and never touch a Recipe Engine.
 */

export function GovServicesPanel(): React.ReactElement {
  const [comparisons, setComparisons] = useState<DoseBaselineComparisonSet | null>(null);
  const [audit, setAudit] = useState<ClaimAuditResult | ClaimAuditBlocked | null>(null);
  const [trigger, setTrigger] = useState<TriggerResult | TriggerBlocked | null>(null);
  const [busy, setBusy] = useState(false);

  const runAll = async (): Promise<void> => {
    setBusy(true);
    try {
      setComparisons(d063DoseBaselineComparisons());
      setAudit(await runD063ClaimAudit());
      setTrigger(await runD063ParametricTrigger());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h3 className="section-label">D-063 — Government Services (baseline comparison · claim audit · parametric trigger)</h3>
      <p className="gu-hint">
        All three read the SAME pinned SURPASS-2 (NCT03987919) bytes this repository has held since 2026-09-13, through the same
        custody chain. Nothing below is a discovery verdict: a claim audit and a trigger answer &ldquo;is this true&rdquo; and
        &ldquo;did this happen&rdquo;, never &ldquo;did Genesis discover something&rdquo;.
      </p>
      <button type="button" className="chip-btn primary" disabled={busy} onClick={() => void runAll()}>
        {busy ? 'Running…' : 'Run all three (PRODUCTION)'}
      </button>

      {comparisons === null && audit === null && trigger === null && <p className="empty-state">Nothing is computed until you click.</p>}

      {comparisons !== null && (
        <>
          <h4 className="section-label">Candidate vs frozen baseline — real counted outcomes</h4>
          <p className="gu-hint">
            Baseline arm: {comparisons.baselineArmTitle} ({comparisons.baselineId}). Every adverse-event term the trial itself
            reports at its ≥5% threshold, in registry order — no term selected, dropped or reordered.
            {comparisons.skipped.length > 0 && ` ${comparisons.skipped.length} term/arm pair(s) carry zero events on one side and support no risk ratio at all.`}
          </p>
          <ul className="gu-conjunct-list">
            {worstHarmPerDose(comparisons).map((w) => (
              <li key={w.doseId} className="gu-conjunct-item">
                <span className="gu-conjunct-name">{w.doseId} — worst harm risk ratio {w.riskRatio.toFixed(3)} ({w.term})</span>
                <div className="gu-conjunct-detail">
                  {w.riskRatio < 1 ? 'below the baseline on its worst term' : 'AT OR ABOVE the baseline — the frozen rule requires harm strictly below 1'}
                </div>
              </li>
            ))}
          </ul>
          <p className="gu-hint">
            {comparisons.comparisons.length} real comparisons computed · efficacy is reported as null on this channel because
            SURPASS-2&apos;s efficacy endpoint is a continuous HbA1c mean, which supports no risk ratio.
          </p>
        </>
      )}

      {audit !== null && (
        <>
          <h4 className="section-label">Claim substantiation audit</h4>
          <p className="gu-hint">CLAIM UNDER AUDIT: &ldquo;{D063_CLAIM_TEXT}&rdquo;</p>
          {audit.kind === 'EXECUTION_BLOCKED' ? (
            <p className="gu-hint">EXECUTION_BLOCKED [{audit.code}]: {audit.error}</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                <FingerprintChip label="verdict" value={audit.verdict} />
                <FingerprintChip label="evidence" value={String(audit.evidence.length)} />
                <FingerprintChip label="certificate" value={audit.certificate?.certificateId.slice(0, 18) ?? 'NONE'} />
                <FingerprintChip label="audit" value={audit.auditFingerprint.slice(0, 10)} />
              </div>
              <ul className="gu-conjunct-list">
                {audit.evidence.map((e) => (
                  <li key={e.ref} className="gu-conjunct-item">
                    <span className="gu-conjunct-name">{e.supports === 'for' ? 'FOR' : 'AGAINST'} — {e.evidenceClass}</span>
                    <div className="gu-conjunct-detail">{e.ref}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {trigger !== null && (
        <>
          <h4 className="section-label">Sovereign parametric trigger</h4>
          <p className="gu-hint">
            RULE (frozen before any data was read): trigger iff max serious-adverse-event rate across the trial&apos;s{' '}
            {D063_TRIGGER_RULE.window} randomised arms {D063_TRIGGER_RULE.relation} {D063_TRIGGER_RULE.threshold}. THE THRESHOLD IS
            A STATED DEMONSTRATION CONTRACT PARAMETER, not a regulatory or derived number — a real counterparty supplies its own.
          </p>
          {trigger.kind === 'EXECUTION_BLOCKED' ? (
            <p className="gu-hint">EXECUTION_BLOCKED [{trigger.code}]: {trigger.error}</p>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              <FingerprintChip label="verdict" value={trigger.verdict} />
              <FingerprintChip label="observed" value={trigger.observed === null ? 'n/a' : trigger.observed.toFixed(5)} />
              <FingerprintChip label="threshold" value={String(D063_TRIGGER_RULE.threshold)} />
              <FingerprintChip label="rule fp" value={trigger.certificate?.ruleFingerprint.slice(0, 10) ?? 'n/a'} />
              <FingerprintChip label="audit" value={trigger.auditFingerprint.slice(0, 10)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
