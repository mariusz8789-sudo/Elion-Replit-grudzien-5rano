/**
 * CampaignReport (Stage 7) — one report for a whole campaign, and the surface that
 * "Export scientific PDF" prints (root `.print-report`). Sections: Executive Summary ·
 * Top Candidates · Rejected · Decision Trace · Scientific Comparison (reuses the Stage 6
 * ComparisonReport, embedded) · Grounding Summary · Provenance Summary · Statistics ·
 * Scientific Limitations · Experimental Validation Required.
 *
 * Never states biological activity; never predicts experimental success. Reuses the
 * Stage 6 engine + ComparisonReport + Stage 5 decision trace — no parallel logic.
 */
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import { ComparisonReport } from './ComparisonReport';
import { DecisionTraceView } from './DecisionTraceView';
import { decisionTrace, type RankedCandidate } from '../../core/moleculeComparison';
import type { Campaign } from '../../core/campaigns';
import type { CampaignSummary } from '../../core/campaignStats';
import { useI18n } from '../../core/i18n';

const f = (n: number, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

export function CampaignReport({ campaign, ranked, summary, referenceId, rdkitVersion, generatedAt }: {
  campaign: Campaign; ranked: RankedCandidate[]; summary: CampaignSummary; referenceId: string | null; rdkitVersion: string; generatedAt: number;
}) {
  const { t, locale } = useI18n();
  const dateFmt = (ms: number) => new Date(ms).toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US');
  return (
    <div className="print-report">
      <div className="report-print-title" aria-hidden="true">{t('report.printTitle', { name: campaign.name })}</div>

      {/* Executive Summary */}
      <Panel title={t('report.exec')} icon="book" right={<StatusPill kind="info">{t(`status.${campaign.status}`)}</StatusPill>}>
        <dl className="ds-defs">
          <div style={{ gridColumn: '1 / -1' }}><dt>{t('report.campaign')}</dt><dd className="ds-strong">{campaign.name}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>{t('report.goal')}</dt><dd>{campaign.goal || '—'}</dd></div>
          {campaign.description ? <div style={{ gridColumn: '1 / -1' }}><dt>{t('report.desc')}</dt><dd>{campaign.description}</dd></div> : null}
          <div><dt>{t('report.owner')}</dt><dd>{campaign.owner}</dd></div>
          <div><dt>{t('report.created')}</dt><dd>{dateFmt(campaign.createdAt)}</dd></div>
        </dl>
        <div className="ds-grid ds-grid-4 ds-mt">
          <StatCard label={t('report.stat.molecules')} value={summary.total} sub={t('report.stat.total')} accent="var(--cyan)" />
          <StatCard label={t('report.stat.analysed')} value={summary.analysed} sub="RDKit" accent="var(--green)" />
          <StatCard label={t('report.stat.invalid')} value={summary.invalid} sub={t('mol.invalidSmiles')} accent="var(--red)" />
          <StatCard label={t('verdict.CONTINUE')} value={summary.verdictCounts.CONTINUE} sub={t('report.stat.priority')} accent="var(--gold)" />
        </div>
        <p className="ds-note ds-mt">{t('report.execNote')}</p>
      </Panel>

      {/* Top Candidates */}
      <Panel title={t('report.top')} icon="check" className="ds-mt" right={<StatusPill kind="ok">{summary.topCandidates.length}</StatusPill>}>
        {summary.topCandidates.length ? (
          <ol className="report-top-list">
            {summary.topCandidates.map((c) => (
              <li key={c.id}><span className="ds-strong">#{c.rank} {c.name}</span> <span className="ds-dim">{t('cd.col.score')} {c.scored.score}</span> <span className="ds-mono rank-smiles">{c.smiles}</span></li>
            ))}
          </ol>
        ) : <p className="ds-dim">{t('report.topNone')}</p>}
      </Panel>

      {/* Rejected */}
      <Panel title={t('report.rejected')} icon="block" className="ds-mt" right={<StatusPill kind="blocked">{summary.rejected.length}</StatusPill>}>
        {summary.rejected.length ? (
          <ul className="report-top-list">
            {summary.rejected.map((c) => <li key={c.id}><span className="ds-strong">{c.name}</span> <span className="ds-dim">{c.decision.reasons[0]}</span></li>)}
          </ul>
        ) : <p className="ds-dim">{t('report.rejectedNone')}</p>}
      </Panel>

      {/* Decision Trace (reuses the single source of truth) */}
      <Panel title={t('report.trace')} icon="graph" className="ds-mt" right={<StatusPill kind="info">{t('report.oneSource')}</StatusPill>}>
        {ranked.map((c) => (
          <div key={c.id} className="report-trace-block">
            <h6 className="diff-h">{c.name}</h6>
            <DecisionTraceView trace={decisionTrace(c)} />
          </div>
        ))}
      </Panel>

      {/* Scientific Comparison — reuse Stage 6 ComparisonReport (embedded) */}
      <Panel title={t('report.comparison')} icon="chart" className="ds-mt" right={<StatusPill kind="info">{t('cd.rankEngine')}</StatusPill>}>
        <ComparisonReport ranked={ranked} referenceId={referenceId} embedded />
      </Panel>

      {/* Grounding + Provenance Summary */}
      <Panel title={t('report.grounding')} icon="shield" className="ds-mt">
        <dl className="ds-defs">
          <div><dt>{t('report.withAlerts')}</dt><dd>{summary.grounding.withAlerts}</dd></div>
          <div><dt>{t('report.groundingVersion')}</dt><dd className="ds-mono">{summary.grounding.groundingVersion}</dd></div>
          <div><dt>{t('report.engine')}</dt><dd className="ds-mono">RDKit {rdkitVersion}</dd></div>
          <div><dt>{t('report.generated')}</dt><dd className="ds-mono">{new Date(generatedAt).toISOString()}</dd></div>
        </dl>
        <p className="ds-note ds-mt">{summary.grounding.note}</p>
      </Panel>

      {/* Campaign Statistics */}
      {summary.averages ? (
        <Panel title={t('report.stats')} icon="chart" className="ds-mt" right={<StatusPill kind="info">{t('report.avgDescriptors')}</StatusPill>}>
          <div className="ds-grid ds-grid-4">
            <StatCard label={t('report.avgMW')} value={f(summary.averages.molWt)} sub="g/mol" accent="var(--cyan)" />
            <StatCard label={t('report.avgLogP')} value={f(summary.averages.logP, 2)} sub="Crippen" accent="var(--violet)" />
            <StatCard label={t('report.avgTPSA')} value={f(summary.averages.tpsa)} sub="Å²" accent="var(--gold)" />
            <StatCard label={t('report.avgHB')} value={`${f(summary.averages.hbd, 1)}/${f(summary.averages.hba, 1)}`} sub={t('report.hbonds')} accent="var(--cyan)" />
          </div>
          <div className="ds-grid ds-grid-4 ds-mt">
            {(['CONTINUE', 'NEEDS_EXPERIMENTS', 'HIGH_UNCERTAINTY', 'REJECT'] as const).map((v) => (
              <StatCard key={v} label={t(`verdict.${v}`)} value={summary.verdictCounts[v]} sub={t('report.candidates')} accent="var(--cyan)" />
            ))}
          </div>
        </Panel>
      ) : null}

      {/* Limitations + Validation */}
      <Panel title={t('report.limitations')} icon="alert" className="ds-mt">
        <ul className="decision-removed">
          <li>{t('report.lim1')}</li>
          <li>{t('report.lim2')}</li>
          <li>{t('report.lim3')}</li>
        </ul>
        <div className="ds-callout ds-mt"><Icon name="flask" size={15} /> <strong>{t('report.validationRequired')}</strong> {t('report.validationBody')}</div>
      </Panel>
    </div>
  );
}
