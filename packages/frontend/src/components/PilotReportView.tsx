/**
 * Pilot-ready, printable analysis report (Verification Mandate Mission 4).
 * Rendered ENTIRELY from the backend PilotReport (real stored analysis output). Print via
 * the browser (window.print) — no PDF dependency. Professional enough to send to an R&D
 * director; it states its scientific limitation explicitly and claims no validation.
 */
import type { PilotReport, KillSwitchDecision } from '../core/backend/client';
import { useI18n } from '../core/i18n';

const DECISION_CLASS: Record<KillSwitchDecision, string> = {
  GO: 'pill-ok', WARN: 'pill-warn', BLOCK: 'pill-danger', INSUFFICIENT_DATA: 'pill-neutral',
};

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

export function PilotReportView({ report }: { report: PilotReport }) {
  const { t } = useI18n();
  const r = report;
  return (
    <article className="pilot-report">
      <header className="pilot-report-header">
        <h1>{t('pr.title')}</h1>
        <div className="pilot-report-meta">
          <div><span>{t('df.label.project')}</span><code>{r.projectId ?? '—'}</code></div>
          <div><span>{t('pr.meta.analysisId')}</span><code>{r.analysisId ?? '—'}</code></div>
          <div><span>{t('pr.meta.date')}</span><code>{fmtDate(r.analysisDate)}</code></div>
          <div><span>{t('te.res.decisionHash')}</span><code>{r.decisionHash ?? '—'}</code></div>
          <div><span>{t('te.res.proposalHash')}</span><code>{r.proposalHash ?? '—'}</code></div>
          <div><span>{t('te.cert.h')}</span><code>{r.certificate.schema} · truthEngine {r.certificate.engineVersions.truthEngine ?? '?'}</code></div>
        </div>
      </header>

      <div className="pilot-report-decision">
        <span className={`pill ${DECISION_CLASS[r.finalDecision]}`}>{r.finalDecision}</span>
        <span className="report-strength">{t('pr.strength')}{r.decisionStrength ?? '—'}</span>
      </div>

      <Block title={t('pr.block.critical')} items={r.criticalFailures} />
      <Block title={t('pr.block.constraintFindings')} items={r.constraintFindings.map((c) => `${c.id}: ${c.detail}`)} />
      <Block title={t('te.list.dimensional')} items={r.dimensionalFindings} />
      <Block title={t('te.list.physViolations')} items={r.physicalConstraintViolations} />
      <Block title={t('te.list.missingInfo')} items={r.missingInformation} />
      <Block title={t('te.list.unresolvedAssumptions')} items={r.unresolvedAssumptions} />
      <Block title={t('pr.block.capGaps')} items={r.capabilityGaps} />
      <Block title={t('te.list.unsupportedDomains')} items={r.unsupportedDomains.map((u) => `${u.domain}: ${u.reason}`)} />

      <div className="report-block">
        <h3>{t('pr.necro.h')}</h3>
        <p>{r.necropolisInfluence.influenced
          ? t('pr.necro.yes', { findings: r.necropolisInfluence.findings.join(', ') })
          : t('pr.necro.no')}</p>
      </div>

      {r.cheapestFalsification && (
        <div className="report-block">
          <h3>{t('pr.fals.h')}</h3>
          <p>{t('te.fals.target')}<strong>{r.cheapestFalsification.targetAssumption}</strong></p>
          <p>{t('te.fals.test')}{r.cheapestFalsification.recommendedTestType} ({r.cheapestFalsification.relativeCostClass})</p>
          <p>{t('pr.fals.input')}{r.cheapestFalsification.requiredInput}</p>
          <p className="report-muted">{r.cheapestFalsification.priorityReason}</p>
        </div>
      )}

      <Block title={t('pr.block.notKill')} items={r.reasonsNotToKill} />

      <div className="report-block">
        <h3>{t('pr.engines.h')}</h3>
        <p><strong>{t('df.executed')}</strong> {r.enginesExecuted.join(', ') || '—'}</p>
        <p><strong>{t('pr.engines.skipped')}</strong> {r.enginesSkipped.map((s) => `${s.stage} (${s.reason})`).join('; ') || '—'}</p>
      </div>

      <footer className="pilot-report-footer">
        <h3>{t('pr.limitation.h')}</h3>
        <p>{r.limitationStatement}</p>
      </footer>
    </article>
  );
}
