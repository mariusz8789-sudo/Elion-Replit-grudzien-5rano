import { useState } from 'react';
import type { CrossActionComparison } from '../../core/agent/crossActionComparison';
import {
  runWorldDiscoveryAndRemember,
  summariseDiscovery,
  type WorldDiscoveryEvidenceSummary,
  type WorldDiscoveryMemoryUse,
  type WorldDiscoveryRememberedState,
} from '../../core/agent/worldDiscoverySession';
import type { SavedWorldDiscoveryReplay } from '../../core/scienceMemory';

/** Local UI states the session module has no reason to know about. */
type PanelState = { kind: 'IDLE' } | { kind: 'RUNNING'; goal: string } | WorldDiscoveryRememberedState;

/**
 * DISCOVERY, IN THE WORLD IT SEARCHES.
 *
 * This panel sits on the flood city's own screen because that is the world the
 * search actually runs in; a separate page would have shown results detached
 * from the thing they are about.
 *
 * It contains NO discovery logic. It calls `runWorldDiscovery` and renders what
 * comes back. In particular it never decides which mechanism won, never picks a
 * fallback when nothing survived, and never rewrites a refusal into a friendlier
 * message — the planner's own words are shown, because a goal Genesis could not
 * read is a fact the user needs, not an error to smooth over.
 *
 * Both audiences are served from the same object: the plain-language sections
 * are the structured result rendered field by field, and the machine-readable
 * report and JSON sit underneath in a disclosure, so nothing shown to a person
 * is a paraphrase of something different from what a tool would read.
 */
export function WorldDiscoveryPanel() {
  const [goal, setGoal] = useState('');
  const [state, setState] = useState<PanelState>({ kind: 'IDLE' });

  const run = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setState({ kind: 'RUNNING', goal: trimmed });
    // The search forks and advances a real world, persists it to Science Memory,
    // builds its Evidence Bundle and replays it — several real experiments'
    // worth of work, which takes long enough to drop a frame. Yielding first
    // lets the RUNNING state paint, so the panel reports that it is working
    // rather than appearing to hang. Persistence lives INSIDE
    // `runWorldDiscoveryAndRemember` (not here at the UI boundary): the same
    // call already has to read prior memory before it can decide what to run,
    // so saving afterwards is the other half of the same seam, not a separate
    // side effect the panel would otherwise have to remember to trigger.
    setTimeout(() => setState(runWorldDiscoveryAndRemember(trimmed)), 0);
  };

  return (
    <div className="gsc-panel wd-panel">
      <div className="gsc-panel-row">
        <span className="gx-status real">REAL</span>
        <span className="wd-title">AUTONOMOUS DISCOVERY</span>
      </div>
      <p className="gsc-caption">
        Give a scientific goal for this city. Genesis tests the mechanisms this world really has, one experiment
        at a time, and reports what survived and what it ruled out.
      </p>

      <form
        className="lg-obs-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(goal);
        }}
      >
        <label className="wd-label" htmlFor="wd-goal">Scientific goal</label>
        <input
          id="wd-goal"
          className="lg-obs-input"
          type="text"
          value={goal}
          placeholder="e.g. „Minimise peak flood depth, at most 3 experiments.”"
          onChange={(event) => setGoal(event.target.value)}
        />
        <button
          type="submit"
          className="lg-obs-send"
          disabled={goal.trim().length === 0 || state.kind === 'RUNNING'}
        >
          {state.kind === 'RUNNING' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {state.kind === 'RUNNING' && (
        <p className="wd-running" role="status">
          Running real experiments on this world — forking the city, advancing each arm, and recording the result
          to Science Memory.
        </p>
      )}

      {state.kind === 'REFUSED' && <DiscoveryRefusal state={state} />}
      {state.kind === 'COMPLETE' && <DiscoveryResult state={state} />}
      {state.kind === 'COMPARISON' && (
        <ActionComparisonResult comparison={state.comparison} memory={state.memory} evidence={state.evidence} replay={state.replay} />
      )}
    </div>
  );
}

/**
 * A refusal is shown as an outcome, not as a failure banner. Genesis declining
 * to search something it cannot mean is the honest answer, and the reason names
 * what it would need instead.
 */
function DiscoveryRefusal({ state }: { state: Extract<PanelState, { kind: 'REFUSED' }> }) {
  return (
    <div className="wd-refusal" role="status">
      <p className="wd-refusal-head">Genesis did not run this search.</p>
      <p className="wd-refusal-why">{state.error}</p>
      {state.intent.unresolved.length > 0 && (
        <p className="gsc-caption">
          Unresolved in the goal: {state.intent.unresolved.join(', ')}.
        </p>
      )}
      {state.intent.unknownLeverPhrases.length > 0 && (
        <p className="gsc-caption">
          Named but not modelled in this world: {state.intent.unknownLeverPhrases.map((p) => `“${p}”`).join(', ')}.
        </p>
      )}
    </div>
  );
}

function DiscoveryResult({ state }: { state: Extract<PanelState, { kind: 'COMPLETE' }> }) {
  const { result } = state;
  return (
    <div className="wd-result">
      <p className="wd-summary">{summariseDiscovery(result)}</p>

      <section className="wd-section">
        <h4>What I tried</h4>
        <ol className="wd-rounds">
          {result.rounds.map((round) => (
            <li key={`${round.round}-${round.hypothesisId}-${round.strength}`}>
              <b>{round.hypothesisId}</b> at strength {round.strength} →{' '}
              <span className={`wd-verdict wd-${round.assessment.assessment}`}>{round.assessment.assessment}</span>
              <span className="wd-effect">
                {round.effect === null ? ' (no reading)' : ` (effect ${round.effect.toFixed(5)})`}
              </span>
              <span className="gsc-caption wd-reason">{round.selectionReason}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="wd-section">
        <h4>What held up</h4>
        {result.bestSupported.length === 0 ? (
          // The exact semantic the loop reports. No fallback mechanism is promoted here.
          <p className="wd-none">Nothing. No declared mechanism met its preregistered criterion.</p>
        ) : (
          <ul>
            {result.bestSupported.map((belief) => (
              <li key={belief.hypothesisId}>
                <b>{belief.hypothesisId}</b> — {belief.confidence}. {belief.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="wd-section">
        <h4>What I ruled out</h4>
        {result.failedHypotheses.length === 0 ? (
          <p className="wd-none">Nothing was refuted.</p>
        ) : (
          <ul>
            {result.failedHypotheses.map((belief) => (
              <li key={belief.hypothesisId}>
                <b>{belief.hypothesisId}</b> — {belief.confidence}. {belief.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="wd-section">
        <h4>What I still don&apos;t know</h4>
        {result.unresolvedQuestions.length === 0 ? (
          <p className="wd-none">Nothing outstanding.</p>
        ) : (
          <ul>
            {result.unresolvedQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="wd-section wd-limits">
        <h4>This search did not model</h4>
        <ul>
          {result.notModelledFactors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
        <p className="gsc-caption">
          Every verdict is a statement about this model, not about the world. Stopped because: {result.stopReason}.
        </p>
      </section>

      <MemoryAndEvidenceFooter memory={state.memory} evidence={state.evidence} replay={state.replay} />

      <details className="wd-machine">
        <summary>Machine-readable record</summary>
        <pre className="wd-pre">{state.report}</pre>
        <pre className="wd-pre">{JSON.stringify({ intent: state.intent, result }, null, 2)}</pre>
      </details>
    </div>
  );
}

/**
 * What memory contributed to THIS run, and the real Evidence Bundle + Replay
 * this run produced. Shown on both result kinds because both now go through
 * the same persist-and-replay pipeline (`runWorldDiscoveryAndRemember`).
 *
 * `memory` is null on a comparison (every declared action always competes)
 * and on a run with nothing to resume from (the honest, common first-run
 * case) — rendered as "starting fresh" rather than omitted, so a viewer can
 * tell "memory had nothing to say" from "this panel forgot to check".
 */
function MemoryAndEvidenceFooter({
  memory,
  evidence,
  replay,
}: {
  memory: WorldDiscoveryMemoryUse | null;
  evidence: WorldDiscoveryEvidenceSummary;
  replay: SavedWorldDiscoveryReplay;
}) {
  return (
    <section className="wd-section wd-memory">
      <h4>Memory &amp; replay</h4>
      <p className="gsc-caption">
        {memory ? memory.reason : 'No earlier run for this objective — starting fresh.'}
      </p>
      <p className="gsc-caption">
        Evidence Bundle <code>{evidence.bundleId}</code>: own replay <b>{evidence.replayVerdict}</b>.
      </p>
      <p className="gsc-caption">
        Saved run re-executed and verified: <b className={`wd-replay-${replay.status}`}>{replay.status}</b> — {replay.reason}
      </p>
    </section>
  );
}

/**
 * A ranked comparison of every declared action against one control.
 *
 * The ordering, the deltas and the explanations all come from the engine. This
 * renders them; it computes nothing. In particular it shows a best action ONLY
 * when the engine actually ranked one — a NOT_RANKABLE, REFUSED or NOT_MODELLED
 * comparison has no winner to show, and manufacturing one from the numbers on
 * screen is exactly the failure the engine's state set exists to prevent.
 */
function ActionComparisonResult({
  comparison,
  memory,
  evidence,
  replay,
}: {
  comparison: CrossActionComparison;
  memory: WorldDiscoveryMemoryUse | null;
  evidence: WorldDiscoveryEvidenceSummary;
  replay: SavedWorldDiscoveryReplay;
}) {
  const ranked = comparison.status === 'RANKED' || comparison.status === 'TIED';
  return (
    <div className="wd-result">
      <p className="wd-summary">
        {ranked
          ? `Compared ${comparison.ranking.length} actions against the same control.`
          : 'Genesis did not rank these actions.'}
      </p>

      {!ranked && (
        <div className="wd-refusal" role="status">
          <p className="wd-refusal-head">{comparison.status}</p>
          <p className="wd-refusal-why">{comparison.refusalReason}</p>
        </div>
      )}

      {ranked && (
        <section className="wd-section">
          <h4>Action comparison</h4>
          <ol className="wd-rounds wd-actions">
            {comparison.ranking.map((action) => (
              <li key={action.actionId} value={action.rank ?? undefined}>
                <b>{action.label}</b>{' '}
                <span className={`wd-verdict wd-dir-${action.directionVerdict}`}>{action.directionVerdict}</span>
                <span className="wd-effect">
                  {action.absoluteDelta === null
                    ? ' (no reading)'
                    : ` ${action.absoluteDelta.toFixed(4)} ${
                        action.relativeDeltaPercent === null ? '' : `(${action.relativeDeltaPercent.toFixed(1)}%)`
                      }`}
                </span>
                <span className="gsc-caption wd-reason">{action.explanation}</span>
              </li>
            ))}
          </ol>
          <p className="gsc-caption">
            Objective: {comparison.objective!.direction} “{comparison.objective!.metric}”. Control value:{' '}
            {comparison.baselineMetric}.
          </p>
        </section>
      )}

      {comparison.candidates.some((c) => c.availability !== 'AVAILABLE') && (
        <section className="wd-section">
          <h4>Not tested</h4>
          <ul>
            {comparison.candidates
              .filter((c) => c.availability !== 'AVAILABLE')
              .map((c) => (
                <li key={c.actionId}>
                  <b>{c.label}</b> — {c.availability}. {c.reason}
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="wd-section wd-limits">
        <h4>This comparison did not model</h4>
        <ul>
          {comparison.notModelledFactors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
        <p className="gsc-caption">{comparison.disclaimer}</p>
      </section>

      <MemoryAndEvidenceFooter memory={memory} evidence={evidence} replay={replay} />

      <details className="wd-machine">
        <summary>Machine-readable record</summary>
        <pre className="wd-pre">{JSON.stringify(comparison, null, 2)}</pre>
      </details>
    </div>
  );
}
