import { useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { Icon } from '../Icon';
import { getToken } from '../../core/backend/session';
import { askDiscoveryEngine, type DiscoveryArtifact } from '../../core/backend/client';

/**
 * Ask — the Discovery Engine's surface, and the flagship screen.
 *
 * THE ORDER OF THIS PAGE IS AN ARGUMENT. Refusals come first, above the
 * hypotheses. Every comparable tool leads with its answer and buries the
 * caveats; here what the engine declined to conclude is the first thing a
 * scientist reads, because it is what tells them how much weight the rest can
 * carry. If that makes the product look less impressive in a demo, the demo is
 * measuring the wrong thing.
 *
 * Nothing on this page is written by hand. Every hypothesis, refusal,
 * uncertainty figure and experiment comes from the artifact the server stored,
 * so what is displayed is exactly what was recorded and can be replayed later.
 */

function TwoAxisBar({ label, value, note }: { label: string; value: number; note: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="ask-axis">
      <div className="ask-axis-head">
        <span>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="ask-axis-track" role="img" aria-label={`${label}: ${pct}%`}>
        <div className="ask-axis-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="ds-dim ask-axis-note">{note}</p>
    </div>
  );
}

function Answer({ artifact }: { artifact: DiscoveryArtifact }) {
  const hypotheses = artifact.body?.hypotheses ?? [];
  const experiments = artifact.body?.nextExperiments ?? [];
  const suppressed = artifact.body?.suppressedByMemory ?? [];

  return (
    <>
      {/* Deliberately first. See the module comment. */}
      <Panel
        title="What Genesis would not conclude"
        icon="shield"
        right={<StatusPill kind="warn">{artifact.refusals.length} refusal(s)</StatusPill>}
      >
        <p className="ds-note">
          This is printed before the answer, not after it. A conclusion is only worth as much as the
          things its author declined to say.
        </p>
        <ul className="ask-refusals">
          {artifact.refusals.map((r) => (
            <li key={r}><Icon name="alert" size={14} /> <span>{r}</span></li>
          ))}
        </ul>
      </Panel>

      <Panel title="Uncertainty, on two axes" icon="chart">
        <p className="ds-note">
          These are never combined into one number. A well-read doubt and an unread certainty would
          otherwise look identical.
        </p>
        <div className="ask-axes">
          <TwoAxisBar
            label="Coverage — how much has actually been read"
            value={artifact.uncertainty.coverage}
            note="Derived from the evidence records in this workspace. Zero means nothing has been entered."
          />
          <TwoAxisBar
            label="Belief — how much an expert has confirmed"
            value={artifact.uncertainty.belief}
            note="Fraction of the traversed mechanism edges carrying a current expert verdict."
          />
        </div>
        <p className="ds-dim">{artifact.uncertainty.basis}</p>
      </Panel>

      <Panel
        title="Candidate hypotheses"
        icon="brain"
        right={<StatusPill kind="info">{hypotheses.length} proposed</StatusPill>}
      >
        {hypotheses.length === 0 ? (
          <p className="ds-dim">No hypothesis survived the graveyard and the critic for this question.</p>
        ) : (
          <ol className="ask-hypotheses">
            {hypotheses.map((h) => (
              <li key={h.statement}>
                <p className="ask-statement">{h.statement}</p>
                <div className="ask-meta">
                  <StatusPill kind="info">plausibility {h.plausibility}</StatusPill>
                  <StatusPill kind="info">novelty {h.novelty}</StatusPill>
                </div>
                {h.reasoning?.length ? (
                  <ol className="ask-reasoning">
                    {h.reasoning.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                ) : null}
                {h.challenges?.length ? (
                  <div className="ask-challenges">
                    <h6>Why this might be wrong</h6>
                    <ul>
                      {h.challenges.map((c) => (
                        <li key={c.id}>
                          <StatusPill kind={c.severity === 'major' ? 'warn' : 'info'}>{c.severity}</StatusPill>{' '}
                          {c.statement}
                          {c.discriminatingTest ? (
                            <span className="ds-dim"> Discriminating test: {c.discriminatingTest}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {h.missingEvidence?.length ? (
                  <div className="ask-missing">
                    <h6>What would have to be measured</h6>
                    <ul>{h.missingEvidence.map((m) => <li key={m}>{m}</li>)}</ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {suppressed.length > 0 ? (
        <Panel title="Held back by this laboratory's own memory" icon="memory">
          <p className="ds-note">
            These were generated and then withheld because this workspace already buried them. They are
            shown so the decision can be disagreed with rather than taken on trust.
          </p>
          <ul className="ask-suppressed">
            {suppressed.map((s) => (
              <li key={s.statement}><strong>{s.statement}</strong><span className="ds-dim"> — {s.why}</span></li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Experiments worth doing next" icon="target">
        <p className="ds-note">
          Ranked by uncertainty retired per unit of effort — not by how promising the result would be.
          A null result retires the same uncertainty as a positive one.
        </p>
        <div className="ask-table-wrap">
          <table className="ask-table">
            <thead>
              <tr><th>Intervention</th><th>System</th><th>Outcome</th><th>Retires</th><th>Effort</th></tr>
            </thead>
            <tbody>
              {experiments.map((e, i) => (
                <tr key={`${e.interventionId}-${e.tierLabel}-${e.outcomeLabel}-${i}`}>
                  <td>{e.interventionLabel}</td>
                  <td>{e.tierLabel}</td>
                  <td>{e.outcomeLabel}</td>
                  <td className="ask-num">{e.uncertaintyReduction}</td>
                  <td className="ask-num">{e.effort}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Provenance" icon="lock">
        <p className="ds-note">
          Recorded so this answer can be replayed against a future graph and the difference explained.
        </p>
        <dl className="ask-provenance">
          <dt>Engine</dt><dd>{artifact.provenance.engine}</dd>
          <dt>Graph snapshot</dt><dd><code>{artifact.provenance.snapshotId?.slice(0, 16)}…</code></dd>
          <dt>Replay key</dt><dd><code>{artifact.inputs_hash?.slice(0, 16)}…</code></dd>
          <dt>Mechanism edges</dt><dd>{artifact.provenance.edgeCount}</dd>
          <dt>Evidence records used</dt><dd>{artifact.provenance.evidenceIds?.length ?? 0}</dd>
          <dt>Expert review</dt>
          <dd>
            {artifact.provenance.review
              ? `${artifact.provenance.review.confirmed} confirmed, ${artifact.provenance.review.disputed} disputed of ${artifact.provenance.review.totalEdges}`
              : 'not recorded'}
          </dd>
          <dt>Literature</dt><dd>{artifact.provenance.literature}</dd>
          <dt>Review status</dt><dd>{artifact.review_status}</dd>
        </dl>
      </Panel>
    </>
  );
}

export function AskScreen() {
  const [question, setQuestion] = useState('Can biological age be reversed without increasing cancer risk?');
  const [artifact, setArtifact] = useState<DiscoveryArtifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const token = getToken();
    if (!token) {
      setError('Asking stores an auditable artifact, so it needs an account. Reading the graph and reviewing an edge do not.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await askDiscoveryEngine(token, question.trim());
    setBusy(false);
    if (result.ok) { setArtifact(result.data); setError(null); return; }
    setArtifact(null);
    setError(result.message);
  };

  return (
    <DiscoveryShell
      active="#/ask"
      title="Ask"
      subtitle="A question in, an auditable answer out — with everything Genesis declined to conclude"
      actions={<StatusPill kind="warn">never a medical claim</StatusPill>}
    >
      <Panel title="Your question" icon="brain">
        <p className="ds-note">
          Genesis does not answer “does this therapy work?” — that is not computable from a curated graph
          and a handful of studies. It answers <strong>what should be investigated next, and why</strong>.
        </p>
        <div className="ask-form">
          <textarea
            className="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            aria-label="Scientific question"
          />
          <button className="ds-btn" onClick={submit} disabled={busy || !question.trim()}>
            {busy ? 'Reasoning…' : 'Ask'}
          </button>
        </div>
        {error ? <p className="ds-note ds-warn">{error}</p> : null}
      </Panel>

      {artifact ? <Answer artifact={artifact} /> : (
        <Panel title="What comes back" icon="book">
          <ul className="ask-preview">
            <li>Every hypothesis the engine can defend, with the reasoning path behind it</li>
            <li>What it refused to conclude, printed <strong>before</strong> the answer</li>
            <li>Uncertainty on two axes that are never merged</li>
            <li>Experiments ranked by uncertainty retired per unit effort</li>
            <li>Anything held back because this laboratory already buried it</li>
            <li>A replay key, so the same question can be re-asked next year and the difference explained</li>
          </ul>
        </Panel>
      )}
    </DiscoveryShell>
  );
}
