/**
 * DecisionTraceView (Stage 7) — renders WHY a molecule ranked where it did. It consumes
 * decisionTrace(candidate), which is a pure PROJECTION of the Stage 6 ranking data (the
 * same WHY +/− lines, score parts and verdict). No second explanation engine.
 */
import { StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { VERDICT_META, type DecisionTrace } from '../../core/moleculeComparison';
import { useI18n } from '../../core/i18n';

export function DecisionTraceView({ trace }: { trace: DecisionTrace }) {
  const { t } = useI18n();
  const v = VERDICT_META[trace.verdict];
  return (
    <div className="trace">
      <div className="trace-head">
        <span>{t('trace.pos', { rank: trace.rank, score: trace.score })}</span>
        <StatusPill kind={v.kind}><Icon name={v.icon} size={11} /> {t(`verdict.${trace.verdict}`)}</StatusPill>
      </div>
      <div className="trace-grid">
        <div>
          <h6 className="trace-h ok"><Icon name="check" size={12} /> {t('trace.positive')}</h6>
          {trace.positives.length ? <ul>{trace.positives.map((p, i) => <li key={i}>{p.replace(/^\+\s*/, '')}</li>)}</ul> : <p className="ds-dim">—</p>}
        </div>
        <div>
          <h6 className="trace-h warn"><Icon name="alert" size={12} /> {t('trace.negative')}</h6>
          {trace.negatives.length ? <ul>{trace.negatives.map((p, i) => <li key={i}>{p.replace(/^−\s*/, '')}</li>)}</ul> : <p className="ds-dim">{t('trace.none')}</p>}
        </div>
        <div>
          <h6 className="trace-h"><Icon name="block" size={12} /> {t('trace.rejected')}</h6>
          {trace.rejectedRules.length ? <ul>{trace.rejectedRules.map((r, i) => <li key={i}>{r.label}: {r.reason}</li>)}</ul> : <p className="ds-dim">{t('trace.none')}</p>}
        </div>
      </div>
      <div className="trace-meta">
        <div><span className="ds-dim">{t('trace.descriptorsUsed')}</span> <span className="ds-mono">{trace.descriptorsUsed.join(', ')}</span></div>
        <div><span className="ds-dim">{t('trace.rulesTriggered')}</span> {trace.rulesTriggered.map((r) => `${r.label} (+${r.points})`).join(' · ') || '—'}</div>
        <div><span className="ds-dim">{t('trace.verdictReason')}</span> {trace.verdictReasons.join(' ')}</div>
        <div className="trace-grounding"><StatusPill kind="ok"><Icon name="shield" size={11} /> {t('trace.grounding')}</StatusPill> <span>{trace.groundingStatus}</span></div>
      </div>
    </div>
  );
}
