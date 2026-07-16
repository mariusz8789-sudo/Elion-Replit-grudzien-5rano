/**
 * DecisionTraceView (Stage 7) — renders WHY a molecule ranked where it did. It consumes
 * decisionTrace(candidate), which is a pure PROJECTION of the Stage 6 ranking data (the
 * same WHY +/− lines, score parts and verdict). No second explanation engine.
 */
import { StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { VERDICT_META, type DecisionTrace } from '../../core/moleculeComparison';

export function DecisionTraceView({ trace }: { trace: DecisionTrace }) {
  const v = VERDICT_META[trace.verdict];
  return (
    <div className="trace">
      <div className="trace-head">
        <span>Pozycja <strong>#{trace.rank}</strong> · score <strong>{trace.score}</strong></span>
        <StatusPill kind={v.kind}><Icon name={v.icon} size={11} /> {v.label}</StatusPill>
      </div>
      <div className="trace-grid">
        <div>
          <h6 className="trace-h ok"><Icon name="check" size={12} /> Wkłady pozytywne</h6>
          {trace.positives.length ? <ul>{trace.positives.map((p, i) => <li key={i}>{p.replace(/^\+\s*/, '')}</li>)}</ul> : <p className="ds-dim">—</p>}
        </div>
        <div>
          <h6 className="trace-h warn"><Icon name="alert" size={12} /> Wkłady negatywne</h6>
          {trace.negatives.length ? <ul>{trace.negatives.map((p, i) => <li key={i}>{p.replace(/^−\s*/, '')}</li>)}</ul> : <p className="ds-dim">brak</p>}
        </div>
        <div>
          <h6 className="trace-h"><Icon name="block" size={12} /> Reguły odrzucone / słabe</h6>
          {trace.rejectedRules.length ? <ul>{trace.rejectedRules.map((r, i) => <li key={i}>{r.label}: {r.reason}</li>)}</ul> : <p className="ds-dim">brak</p>}
        </div>
      </div>
      <div className="trace-meta">
        <div><span className="ds-dim">Użyte deskryptory:</span> <span className="ds-mono">{trace.descriptorsUsed.join(', ')}</span></div>
        <div><span className="ds-dim">Reguły uruchomione:</span> {trace.rulesTriggered.map((r) => `${r.label} (+${r.points})`).join(' · ') || '—'}</div>
        <div><span className="ds-dim">Uzasadnienie werdyktu:</span> {trace.verdictReasons.join(' ')}</div>
        <div className="trace-grounding"><StatusPill kind="ok"><Icon name="shield" size={11} /> Grounding</StatusPill> <span>{trace.groundingStatus}</span></div>
      </div>
    </div>
  );
}
