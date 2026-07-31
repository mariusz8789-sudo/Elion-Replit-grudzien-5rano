import { useMemo } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { answerCentralQuestion, analyseAllSafeRegeneration } from '@genesis-os/reasoning/safeRegeneration';
import { recommendNextExperiment, generateHypotheses } from '@genesis-os/reasoning/discovery';
import { rankDiscoveryDirections } from '@genesis-os/reasoning/discoveryScore';
import { auditGraph } from '@genesis-os/reasoning/edgeEvidence';
import { GRAPH_NODES, GRAPH_EDGES, nodesOfKind } from '@genesis-os/reasoning/knowledgeGraph';
import { oncogenicLoadRanking } from '@genesis-os/reasoning/cancerSafety';
import { unexplainedTraits } from '@genesis-os/reasoning/species';
import type { EvidenceRecord } from '@genesis-os/reasoning/evidence';

/**
 * Flagship overview — the first screen, and the thirty seconds that decide whether
 * anyone reads the rest.
 *
 * Every number here is COMPUTED LIVE from the engines. Nothing is marketing copy,
 * because a claim a reader can immediately check is worth more than any adjective,
 * and because a hardcoded statistic in a science tool is the fastest way to lose
 * the only audience that matters.
 *
 * The screen is built around one argument: most tools in this space answer "does
 * this therapy work?", a question they cannot honestly answer. Genesis answers
 * "what should be investigated next, and why?", which is computable, auditable and
 * actually useful to someone allocating a laboratory budget.
 */

export function LongevityOverview({ records, onNavigate }: {
  records: EvidenceRecord[];
  onNavigate: (tab: string) => void;
}) {
  const central = useMemo(answerCentralQuestion, []);
  const nextExperiment = useMemo(() => recommendNextExperiment(records), [records]);
  const ranked = useMemo(() => rankDiscoveryDirections(records), [records]);
  const audit = useMemo(() => auditGraph(records), [records]);
  const hypotheses = useMemo(() => generateHypotheses(records), [records]);
  const riskiest = useMemo(() => oncogenicLoadRanking()[0], []);
  const unexplained = useMemo(unexplainedTraits, []);
  const windows = useMemo(() => analyseAllSafeRegeneration(), []);

  const inWindow = windows.filter((w) => w.window === 'in-window');
  const tradeOffs = windows.filter((w) => w.window === 'trades-off');

  return (
    <div className="lg-overview">
      {/* The thesis. One sentence, then the distinction that carries the product. */}
      <section className="lg-hero">
        <h2 className="lg-hero-q">Can biological age be reversed without increasing cancer risk?</h2>
        <p className="lg-hero-sub">
          Ageing and cancer share their machinery. The programmes that stop a damaged cell dividing are the programmes
          that suppress tumours — so a strategy that restores youthful function by relieving them is not incidentally
          risky, it is risky <em>by construction</em>. Genesis is built to compute that trade-off rather than talk around it.
        </p>
        <div className="lg-hero-contrast">
          <div className="lg-hero-no">
            <span className="lg-hero-tag">What Genesis never answers</span>
            <p>&ldquo;Does this therapy work?&rdquo;</p>
            <span className="ds-dim">Not honestly computable from any evidence base. Tools that answer it are guessing.</span>
          </div>
          <div className="lg-hero-yes">
            <span className="lg-hero-tag">What Genesis answers</span>
            <p>&ldquo;What should humanity investigate next, and why?&rdquo;</p>
            <span className="ds-dim">Decision-theoretic, auditable, and directly useful when allocating a laboratory budget.</span>
          </div>
        </div>
      </section>

      {/* Live scale of the reasoning substrate. */}
      <section className="lg-stats">
        {[
          { n: GRAPH_NODES.length, label: 'nodes in the reasoning graph' },
          { n: GRAPH_EDGES.length, label: 'documented relationships' },
          { n: nodesOfKind('cancer-pathway').length, label: 'oncogenic axes checked automatically' },
          { n: hypotheses.length, label: 'testable hypotheses generated' },
          { n: ranked.length, label: 'research directions ranked' },
          { n: `${Math.round((1 - audit.coverage) * 100)}%`, label: 'of edges declared unsupported' },
        ].map((s, i) => (
          <div key={i} className="lg-stat">
            <span className="lg-stat-n">{s.n}</span>
            <span className="lg-stat-l">{s.label}</span>
          </div>
        ))}
      </section>

      {/* The headline output. */}
      <Panel title="The next experiment worth running" icon="target"
        right={<StatusPill kind="ok">computed, not curated</StatusPill>}>
        {nextExperiment ? (
          <>
            <p className="lg-answer">
              <strong>{nextExperiment.interventionLabel}</strong> against <strong>{nextExperiment.hallmarkLabel}</strong>,
              in {nextExperiment.tierLabel.toLowerCase()}, measuring {nextExperiment.outcomeLabel.toLowerCase()}.
            </p>
            <div className="lg-answer-metrics">
              <div><span className="lg-metric">{nextExperiment.uncertaintyReduction}</span><span>points of uncertainty retired</span></div>
              <div><span className="lg-metric">{nextExperiment.effort}</span><span>relative effort</span></div>
              <div><span className="lg-metric">{nextExperiment.valuePerEffort.toFixed(1)}</span><span>value per unit effort</span></div>
            </div>
            <p className="ds-note">
              {nextExperiment.justification}
            </p>
            <p className="ds-dim">
              <Icon name="shield" size={12} /> The simulation assumes nothing about what the study would find. A null
              result retires the same uncertainty as a positive one, which is exactly why the recommendation is honest.
            </p>
            <button className="ds-btn" onClick={() => onNavigate('experiments')}>See the full ranking and efficiency frontier →</button>
          </>
        ) : <p className="ds-dim">No candidate experiment would change the current appraisal.</p>}
      </Panel>

      {/* The central question, answered live. */}
      <Panel title="Where the field currently stands" icon="flask"
        right={<StatusPill kind={inWindow.length ? 'warn' : 'blocked'}>{inWindow.length} strategies in the safety window</StatusPill>}>
        <p className="lg-answer">{central.statement}</p>
        <div className="lg-window-grid">
          <div className="lg-window-col lg-window-ok">
            <h5>Restores function, no documented suppression cost</h5>
            {inWindow.map((w) => <div key={w.interventionId} className="lg-window-item">{w.label}<span className="ds-dim">+{w.regenerationGain} regeneration · cost {w.suppressionCost}</span></div>)}
          </div>
          <div className="lg-window-col lg-window-warn">
            <h5>Restores function but pays a suppression cost</h5>
            {tradeOffs.map((w) => <div key={w.interventionId} className="lg-window-item">{w.label}<span className="ds-dim">+{w.regenerationGain} regeneration · cost {w.suppressionCost}</span></div>)}
          </div>
        </div>
        <p className="ds-dim">
          Derived by composing each strategy&rsquo;s intended direction on a mechanism with that mechanism&rsquo;s documented
          coupling to p53, RB and immune surveillance. Direction only — no magnitudes are encoded, and an absence of
          documented coupling is not a demonstration of safety.
        </p>
        <button className="ds-btn" onClick={() => onNavigate('safety')}>Open the Cancer Safety Engine →</button>
      </Panel>

      {/* Three differentiators, each with a checkable proof rather than an adjective. */}
      <section className="lg-why">
        <h3 className="lg-why-h">Why this is different</h3>
        <div className="lg-why-grid">
          <div className="lg-why-card">
            <Icon name="shield" size={20} />
            <h4>Cancer safety is not optional</h4>
            <p>
              Every strategy is analysed against six oncogenic axes automatically, before anyone asks. The engine
              currently flags <strong>{riskiest?.label}</strong> as carrying the heaviest documented oncogenic load
              ({riskiest?.riskRoutes} routes).
            </p>
            <span className="ds-dim">Most platforms treat this as a later-stage checkbox. Here it is a first-class output.</span>
          </div>
          <div className="lg-why-card">
            <Icon name="graph" size={20} />
            <h4>No black boxes, ever</h4>
            <p>
              Every conclusion ships the ordered chain of graph edges that produced it. A reviewer who disagrees points
              at <em>an edge</em>, not at the software. There is no language model anywhere in the reasoning path.
            </p>
            <span className="ds-dim">Deterministic: the same inputs always give the same answer, so a result can be cited and re-derived.</span>
          </div>
          <div className="lg-why-card">
            <Icon name="alert" size={20} />
            <h4>It reports its own weaknesses</h4>
            <p>
              {audit.unsupported} of {audit.total} edges are declared as resting on curated mechanism with no attached
              evidence, and {unexplained.length} exceptional biological capabilities are marked
              <strong> mechanism unknown</strong>.
            </p>
            <span className="ds-dim">A discovery tool that can never return &ldquo;we don&rsquo;t know&rdquo; is not measuring anything.</span>
          </div>
        </div>
      </section>

      {/* Top-ranked directions, as a taste of the full engine. */}
      <Panel title="Research directions, ranked" icon="chart" right={<StatusPill kind="info">weights published and editable</StatusPill>}>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>#</th><th>Direction</th><th>Score</th><th>Position driven by</th></tr></thead>
            <tbody>
              {ranked.slice(0, 5).map((s, i) => (
                <tr key={s.interventionId}>
                  <td className="ds-mono">{i + 1}</td>
                  <td className="ds-strong">{s.label}</td>
                  <td className="ds-mono ds-strong">{s.score}</td>
                  <td className="ds-dim">{s.dominatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ds-dim">
          Six components, published weights, cancer risk and uncertainty subtracting. This ranks how much a direction is
          worth <em>investigating</em> — it is not a claim that any of them works.
        </p>
        <button className="ds-btn" onClick={() => onNavigate('score')}>See every component and re-rank under your own weights →</button>
      </Panel>
    </div>
  );
}
