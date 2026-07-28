import { useMemo, useState } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { simulate, PRESET_PERTURBATIONS, type Perturbation, type Direction } from '@genesis-os/reasoning/simulator';
import { CELL_STATES, STATE_TRANSITIONS, transitionsFrom, transitionsInto, type CellState } from '@genesis-os/reasoning/cellStates';
import { SPECIES, conservedMechanisms, unexplainedTraits } from '@genesis-os/reasoning/species';
import { REPROGRAMMING_PHASES, analyseWindow, phaseRisks, windowRequirements } from '@genesis-os/reasoning/reprogramming';
import { rankDiscoveryDirections, rankWithWeights, SCORE_WEIGHTS } from '@genesis-os/reasoning/discoveryScore';
import { auditGraph, reviewWorklist } from '@genesis-os/reasoning/edgeEvidence';
import { getNode, nodesOfKind, type GraphNodeId } from '@genesis-os/reasoning/knowledgeGraph';
import type { EvidenceRecord } from '@genesis-os/reasoning/evidence';

/**
 * The remaining Longevity workbenches: simulator, cell states, comparative
 * biology, reprogramming trajectory, discovery ranking and the graph audit.
 *
 * Kept in one file because they share the same presentational vocabulary and none
 * is large enough to justify its own module. Each renders its engine's reasoning
 * verbatim — no view summarises an engine's output into a claim the engine did
 * not make.
 */

function Chain({ steps }: { steps: string[] }) {
  return <ol className="lg-chain-ol">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>;
}

/* ------------------------------- simulator ------------------------------- */

export function SimulatorTab() {
  const perturbable = useMemo(
    () => [...nodesOfKind('hallmark'), ...nodesOfKind('cancer-pathway')],
    [],
  );
  const [custom, setCustom] = useState<Perturbation[]>([{ node: 'telomerase', direction: 'up' }]);
  const result = useMemo(() => simulate(custom), [custom]);

  const setNode = (i: number, node: GraphNodeId) =>
    setCustom(custom.map((p, j) => (j === i ? { ...p, node } : p)));
  const setDir = (i: number, direction: Direction) =>
    setCustom(custom.map((p, j) => (j === i ? { ...p, direction } : p)));

  return (
    <>
      <Panel title="Digital Cell Simulator" icon="cpu" right={<StatusPill kind="warn">direction only — no magnitudes</StatusPill>}>
        <p className="ds-note">
          State a perturbation and the simulator propagates it through the signed mechanism graph, reporting the
          predicted <strong>direction</strong> of change at every reachable node together with the exact chain that
          carried it. It is not a kinetic model: the graph holds signs, not rate constants, so any number beyond a
          confidence weight would be invented.
        </p>

        <div className="lg-presets">
          {PRESET_PERTURBATIONS.map((p) => (
            <button key={p.id} className="chip-btn" onClick={() => setCustom(p.perturbations)}>{p.label}</button>
          ))}
        </div>

        <h6 className="lg-h6">Perturbation</h6>
        {custom.map((p, i) => (
          <div key={i} className="lg-perturb-row">
            <select className="compare-select" value={p.direction} onChange={(e) => setDir(i, e.target.value as Direction)}>
              <option value="up">Increase ↑</option>
              <option value="down">Decrease ↓</option>
            </select>
            <select className="compare-select" value={p.node} onChange={(e) => setNode(i, e.target.value as GraphNodeId)}>
              {perturbable.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
            {custom.length > 1 ? (
              <button className="chip-btn" onClick={() => setCustom(custom.filter((_, j) => j !== i))} aria-label="Remove">
                <Icon name="block" size={12} />
              </button>
            ) : null}
          </div>
        ))}
        <button className="chip-btn" onClick={() => setCustom([...custom, { node: 'autophagy', direction: 'up' }])}>
          + Add perturbation
        </button>
      </Panel>

      <Panel title="Result" icon="chart" right={<StatusPill kind="info">{result.effects.length} downstream node(s)</StatusPill>}>
        <p className="ds-note lg-summary">{result.summary}</p>

        {result.oncogenicEffects.length ? (
          <>
            <h5 className="lg-h5">Effects on the oncogenic axes</h5>
            <p className="ds-note">Surfaced separately so a perturbation chosen for regeneration cannot quietly weaken tumour suppression.</p>
            {result.oncogenicEffects.map((e) => (
              <div key={String(e.node)} className={`lg-finding ${e.direction === 'conflicted' ? 'lg-finding-conflict' : 'lg-finding-risk'}`}>
                <div className="lg-finding-head">
                  <StatusPill kind={e.direction === 'conflicted' ? 'warn' : 'info'}>
                    {e.direction === 'conflicted' ? '⚠ conflicted' : e.direction === 'up' ? '↑ up' : '↓ down'}
                  </StatusPill>
                  <strong>{e.label}</strong>
                  <span className="ds-dim">distance {e.distance} · confidence {e.confidence}</span>
                </div>
                {e.routes.map((r, i) => (
                  <div key={i} className="lg-route">
                    <span className="ds-dim">route {i + 1} → {r.direction} (confidence {r.confidence.toFixed(3)})</span>
                    <Chain steps={r.steps} />
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : null}

        <h5 className="lg-h5">All downstream effects</h5>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Node</th><th>Direction</th><th>Distance</th><th>Confidence</th><th>Carrying route</th></tr></thead>
            <tbody>
              {result.effects.map((e) => (
                <tr key={String(e.node)}>
                  <td className="ds-strong">{e.label}</td>
                  <td>
                    <StatusPill kind={e.direction === 'conflicted' ? 'warn' : 'info'}>
                      {e.direction === 'conflicted' ? 'conflicted' : e.direction}
                    </StatusPill>
                  </td>
                  <td className="ds-mono">{e.distance}</td>
                  <td className="ds-mono">{e.confidence}</td>
                  <td className="ds-dim lg-route-cell">{e.routes[0].steps[e.routes[0].steps.length - 1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h5 className="lg-h5">Cell-state pressure</h5>
        <p className="ds-note">
          A driver moving up favours a transition; a <strong>blocker</strong> moving up opposes it. That sign flip is how
          &ldquo;remove senescence&rdquo; shows up as pressure toward cancer. Counts of documented influences only — no rates, no timescales.
        </p>
        {result.statePressures.slice(0, 8).map((p) => (
          <div key={p.transition.id} className={`lg-finding ${p.pressure > 0 && !CELL_STATES[p.transition.to].desirable ? 'lg-finding-risk' : 'lg-finding-ok'}`}>
            <div className="lg-finding-head">
              <StatusPill kind={p.pressure > 0 ? (CELL_STATES[p.transition.to].desirable ? 'ok' : 'warn') : 'info'}>
                {p.pressure > 0 ? `+${p.pressure} favours` : `${p.pressure} opposes`}
              </StatusPill>
              <strong>{CELL_STATES[p.transition.from].label} → {CELL_STATES[p.transition.to].label}</strong>
              <span className="ds-dim">{p.transition.label}</span>
            </div>
            <Chain steps={p.reasoning} />
          </div>
        ))}

        <div className="lg-derivation">
          <h5>What this cannot tell you</h5>
          <ul className="lg-limits">{result.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------ cell states ------------------------------ */

export function CellStateTab() {
  const [state, setState] = useState<CellState>('aging');
  // Use the engine's own accessors rather than re-filtering here — the same
  // predicate written twice is the classic way a view drifts from its model.
  const outgoing = transitionsFrom(state);
  const incoming = transitionsInto(state);

  return (
    <>
      <Panel title="Cell State Transition Engine" icon="dna" right={<StatusPill kind="info">{STATE_TRANSITIONS.length} transitions</StatusPill>}>
        <p className="ds-note">
          Cells occupy states, and an intervention matters only insofar as it changes which transition a cell takes.
          Each transition lists the mechanisms that <strong>drive</strong> it and the mechanisms that <strong>block</strong> it —
          and in this biology the same molecules appear on both sides.
        </p>
        <div className="lg-state-row">
          {(Object.keys(CELL_STATES) as CellState[]).map((s) => (
            <button key={s} className={`lg-state-chip${s === state ? ' active' : ''}${CELL_STATES[s].desirable ? ' desirable' : ''}`}
              onClick={() => setState(s)} aria-pressed={s === state}>
              {CELL_STATES[s].label}
            </button>
          ))}
        </div>
        <p className="ds-note lg-summary">{CELL_STATES[state].description}</p>
      </Panel>

      <Panel title={`Leaving ${CELL_STATES[state].label}`} icon="target">
        {outgoing.length === 0 ? <p className="ds-dim">No documented transition leaves this state. In this model it is terminal.</p> : null}
        {outgoing.map((t) => (
          <div key={t.id} className={`lg-finding ${CELL_STATES[t.to].desirable ? 'lg-finding-ok' : 'lg-finding-risk'}`}>
            <div className="lg-finding-head">
              <StatusPill kind={CELL_STATES[t.to].desirable ? 'ok' : 'warn'}>→ {CELL_STATES[t.to].label}</StatusPill>
              <strong>{t.label}</strong>
              <StatusPill kind={t.reversibility === 'irreversible' ? 'blocked' : t.reversibility === 'experimental' ? 'warn' : 'info'}>
                {t.reversibility}
              </StatusPill>
            </div>
            <p className="ds-note">{t.mechanism}</p>
            <p className="lg-drivers">
              <strong>Driven by:</strong> {t.drivenBy.map((d) => getNode(d)?.label ?? d).join(', ') || '—'}
            </p>
            <p className="lg-drivers">
              <strong>Blocked by:</strong> {t.blockedBy.map((d) => getNode(d)?.label ?? d).join(', ') || '—'}
            </p>
            <p className="ds-dim"><Icon name="alert" size={12} /> {t.caveat}</p>
          </div>
        ))}
      </Panel>

      <Panel title={`Entering ${CELL_STATES[state].label}`} icon="back">
        {incoming.length === 0 ? <p className="ds-dim">No documented transition enters this state.</p> : null}
        {incoming.map((t) => (
          <div key={t.id} className="lg-finding">
            <div className="lg-finding-head">
              <StatusPill kind="info">{CELL_STATES[t.from].label} →</StatusPill>
              <strong>{t.label}</strong>
            </div>
            <p className="ds-note">{t.mechanism}</p>
          </div>
        ))}
      </Panel>
    </>
  );
}

/* -------------------------------- species -------------------------------- */

export function SpeciesTab() {
  const conserved = useMemo(conservedMechanisms, []);
  const unexplained = useMemo(unexplainedTraits, []);

  return (
    <>
      <Panel title="Multi-species Longevity Engine" icon="dna" right={<StatusPill kind="info">{SPECIES.length} organisms</StatusPill>}>
        <p className="ds-note">
          Evolution has already run the experiment. Every trait below separates the <strong>observation</strong> from the
          <strong> mechanism</strong>, and &ldquo;unknown&rdquo; appears where it belongs — several of these organisms have
          spectacularly well-documented capabilities and no mechanistic account at all.
        </p>
        {SPECIES.map((s) => (
          <div key={s.id} className="lg-species">
            <div className="lg-finding-head">
              <strong>{s.common}</strong>
              <em className="ds-dim">{s.latin}</em>
              <StatusPill kind="info">
                {s.maxLifespanYears === 'indeterminate' ? 'no measured maximum' : `~${s.maxLifespanYears} yr`}
              </StatusPill>
              <span className="ds-dim">{s.lineage}</span>
            </div>
            {s.traits.map((t, i) => (
              <div key={i} className="lg-trait">
                <StatusPill kind={t.mechanismStatus === 'established' ? 'ok' : t.mechanismStatus === 'partial' ? 'warn' : 'blocked'}>
                  mechanism {t.mechanismStatus}
                </StatusPill>
                <p className="lg-trait-text"><strong>Trait:</strong> {t.trait}</p>
                <p className="ds-dim"><strong>How the trait was established:</strong> {t.evidenceBasis}</p>
                <p className="ds-note"><strong>Proposed mechanism:</strong> {t.proposedMechanism}</p>
              </div>
            ))}
            <details className="lg-details">
              <summary>Open questions this organism poses</summary>
              <ul className="lg-limits">{s.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </details>
          </div>
        ))}
      </Panel>

      <Panel title="Conserved mechanisms" icon="graph">
        <p className="ds-note">
          Convergence across <strong>distant</strong> lineages is the signal: two independent solutions suggest a mechanism
          is genuinely tractable, whereas one spectacular organism may simply be idiosyncratic.
        </p>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Mechanism</th><th>Lineages</th><th>Species</th><th>Mechanistic clarity</th></tr></thead>
            <tbody>
              {conserved.map((c) => (
                <tr key={c.hallmark}>
                  <td className="ds-strong">{c.label}</td>
                  <td>{c.lineages.join(', ')}</td>
                  <td className="ds-dim">{c.species.map((s) => s.common).join(', ')}</td>
                  <td>
                    <StatusPill kind={c.mechanisticClarity >= 0.7 ? 'ok' : c.mechanisticClarity >= 0.4 ? 'warn' : 'blocked'}>
                      {Math.round(c.mechanisticClarity * 100)}%
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {conserved.map((c) => (
          <p key={c.hallmark} className="ds-note"><strong>{c.label}:</strong> {c.interpretation}</p>
        ))}
      </Panel>

      <Panel title="Documented capability, unexplained mechanism" icon="search" right={<StatusPill kind="warn">highest-information targets</StatusPill>}>
        {unexplained.map((g, i) => (
          <div key={i} className="lg-finding lg-finding-risk">
            <div className="lg-finding-head"><StatusPill kind="blocked">unexplained</StatusPill><strong>{g.common}</strong></div>
            <p className="lg-trait-text">{g.trait}</p>
            <p className="ds-dim">{g.why}</p>
          </div>
        ))}
      </Panel>
    </>
  );
}

/* ----------------------------- reprogramming ----------------------------- */

export function ReprogrammingTab() {
  const window = useMemo(analyseWindow, []);
  const risks = useMemo(phaseRisks, []);
  const requirements = useMemo(windowRequirements, []);

  return (
    <>
      <Panel title="Partial Reprogramming Engine" icon="atom" right={<StatusPill kind={window.windowIsObservable ? 'ok' : 'blocked'}>
        {window.windowIsObservable ? 'window observable' : 'window NOT observable in vivo'}
      </StatusPill>}>
        <p className="ds-note">
          Full reprogramming is established and useless as therapy — the cell loses the identity that made it worth
          keeping. The entire proposition is <strong>stopping part of the way</strong>, which makes the field a question
          about a window. Every boundary below is a modelling coordinate inferred from published behaviour,
          <strong> not a measured threshold</strong>.
        </p>

        <div className="lg-trajectory" role="img" aria-label="Reprogramming trajectory with phase boundaries">
          {REPROGRAMMING_PHASES.map((p) => (
            <div key={p.phase} className={`lg-phase lg-phase-${p.reversible}`} style={{ left: `${p.position * 100}%` }}>
              <span className="lg-phase-dot" />
              <span className="lg-phase-label">{p.label}</span>
            </div>
          ))}
          <div className="lg-window-band" style={{ left: '0%', width: `${window.irreversibilityBoundary * 100}%` }} />
        </div>

        <div className={`lg-finding ${window.windowIsObservable ? 'lg-finding-ok' : 'lg-finding-risk'}`}>
          <div className="lg-finding-head"><StatusPill kind="blocked">critical gap</StatusPill></div>
          <p className="lg-trait-text">{window.criticalGap}</p>
          <Chain steps={window.reasoning} />
        </div>
      </Panel>

      <Panel title="Phases" icon="clock">
        {REPROGRAMMING_PHASES.map((p) => {
          const risk = risks.find((r) => r.phase === p.phase)!;
          return (
            <div key={p.phase} className={`lg-finding ${p.reversible === 'no' ? 'lg-finding-risk' : p.reversible === 'uncertain' ? 'lg-finding-conflict' : 'lg-finding-ok'}`}>
              <div className="lg-finding-head">
                <StatusPill kind={p.reversible === 'no' ? 'blocked' : p.reversible === 'uncertain' ? 'warn' : 'ok'}>
                  reversible: {p.reversible}
                </StatusPill>
                <strong>{p.label}</strong>
                <span className="ds-dim">risk {risk.riskScore}/100 · readout {p.hasReadout ? 'yes' : 'NONE'}</span>
              </div>
              <p className="ds-note">{p.description}</p>
              {p.resets.length ? <p className="lg-drivers"><strong>Resets:</strong> {p.resets.join(' ')}</p> : null}
              {p.risks.length ? <p className="lg-drivers"><strong>Risks:</strong> {p.risks.join(' ')}</p> : null}
              {risk.circularEndpointRisk ? (
                <StatusPill kind="blocked">circular endpoint — the readout shares its substrate with the intervention</StatusPill>
              ) : null}
              <p className="ds-dim"><Icon name="alert" size={12} /> {p.caveat}</p>
            </div>
          );
        })}
      </Panel>

      <Panel title="What would make the window steerable" icon="target">
        <p className="ds-note">In dependency order. Each blocks everything below it.</p>
        <ol className="lg-requirements">
          {requirements.map((r, i) => (
            <li key={i}>
              <strong>{r.requirement}</strong>
              <p className="ds-note">{r.why}</p>
              <p className="ds-dim">Blocks: {r.blocks}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

/* ---------------------------- discovery score ---------------------------- */

export function ScoreTab({ records }: { records: EvidenceRecord[] }) {
  // A ranking that inverts when cancer risk is weighted more heavily is worth
  // knowing about BEFORE funding it, so the reviewer can re-run under their own
  // priorities rather than accepting the platform's defaults.
  const [safetyFirst, setSafetyFirst] = useState(false);
  const ranked = useMemo(
    () => (safetyFirst ? rankWithWeights(records, { cancerRisk: -0.4, potentialImpact: 0.15 }) : rankDiscoveryDirections(records)),
    [records, safetyFirst],
  );
  const [open, setOpen] = useState<string | null>(ranked[0]?.interventionId ?? null);

  return (
    <Panel title="Scientific Discovery Score" icon="chart" right={<StatusPill kind="info">weights are published and editable</StatusPill>}>
      <p className="ds-note">
        One ranking from six components. Separately they are honest and unusable; combined naively they become a black
        box. The compromise: a weighted sum with <strong>published weights</strong>, every component returned with its own
        value and rationale. <strong>Cancer risk and uncertainty subtract</strong> — a direction cannot outrank another
        merely by having no bad news yet.
      </p>
      <p className="ds-mono lg-weights">
        {Object.entries(safetyFirst ? { ...SCORE_WEIGHTS, cancerRisk: -0.4, potentialImpact: 0.15 } : SCORE_WEIGHTS)
          .map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`).join('  ·  ')}
      </p>
      <label className="lg-check">
        <input type="checkbox" checked={safetyFirst} onChange={(e) => setSafetyFirst(e.target.checked)} />
        <span>Re-rank with cancer risk weighted heavily — does the order survive a safety-first reviewer?</span>
      </label>

      <div className="ds-table-wrap">
        <table className="ds-table">
          <thead><tr><th>#</th><th>Research direction</th><th>Score</th><th>Dominated by</th><th /></tr></thead>
          <tbody>
            {ranked.map((s, i) => (
              <tr key={s.interventionId}>
                <td className="ds-mono">{i + 1}</td>
                <td className="ds-strong">{s.label}</td>
                <td className="ds-mono ds-strong">{s.score}</td>
                <td className="ds-dim">{s.dominatedBy}</td>
                <td>
                  <button className="chip-btn" onClick={() => setOpen(open === s.interventionId ? null : s.interventionId)}>
                    {open === s.interventionId ? 'Hide' : 'Breakdown'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ranked.filter((s) => s.interventionId === open).map((s) => (
        <div key={s.interventionId} className="lg-plan">
          <h5 className="lg-h5">{s.label} — {s.score}/100</h5>
          <p className="ds-note lg-summary">{s.interpretation}</p>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead><tr><th>Component</th><th>Value</th><th>Weight</th><th>Contribution</th><th>Rationale</th></tr></thead>
              <tbody>
                {s.components.map((c) => (
                  <tr key={c.factor}>
                    <td className="ds-strong">{c.factor}</td>
                    <td className="ds-mono">{c.value}</td>
                    <td className="ds-mono">{c.weight > 0 ? '+' : ''}{c.weight}</td>
                    <td className="ds-mono ds-strong">{c.contribution > 0 ? '+' : ''}{c.contribution}</td>
                    <td className="ds-dim">{c.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg-recommendation">
            <StatusPill kind="ok">Would improve most by</StatusPill>
            <p>{s.wouldImproveMostBy}</p>
          </div>
        </div>
      ))}
    </Panel>
  );
}

/* ------------------------------ graph audit ------------------------------ */

export function AuditTab({ records }: { records: EvidenceRecord[] }) {
  const audit = useMemo(() => auditGraph(records), [records]);
  const worklist = useMemo(() => reviewWorklist(records, 30), [records]);

  return (
    <>
      <Panel title="Graph audit" icon="shield" right={<StatusPill kind={audit.coverage > 0.5 ? 'ok' : 'warn'}>
        {Math.round(audit.coverage * 100)}% evidence coverage
      </StatusPill>}>
        <p className="ds-note lg-summary">{audit.statement}</p>
        <div className="lg-metrics">
          <div><span className="lg-metric">{audit.total}</span><span>edges</span></div>
          <div><span className="lg-metric">{audit.supported}</span><span>with attached evidence</span></div>
          <div><span className="lg-metric">{audit.contested}</span><span>contested</span></div>
          <div><span className="lg-metric">{audit.declaredUncertain}</span><span>declared hypotheses</span></div>
          <div><span className="lg-metric">{audit.unsupported}</span><span>curated mechanism only</span></div>
        </div>
      </Panel>

      <Panel title="Reviewer worklist" icon="book" right={<StatusPill kind="info">weakest first</StatusPill>}>
        <p className="ds-note">
          Ordered so a domain expert starts with the edges most likely to be wrong: declared hypotheses, then contested,
          then unsupported. Every edge states its mechanism so it can be disputed individually.
        </p>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>From</th><th>To</th><th>Effect</th><th>Confidence</th><th>Status</th><th>Mechanism</th></tr></thead>
            <tbody>
              {worklist.map((a) => (
                <tr key={a.key}>
                  <td className="ds-strong">{a.fromLabel}</td>
                  <td className="ds-strong">{a.toLabel}</td>
                  <td><span className={`lg-effect lg-effect-${a.edge.effect}`}>{a.edge.effect}</span></td>
                  <td><StatusPill kind={a.declaredConfidence === 'exact' ? 'ok' : a.declaredConfidence === 'theoretical' ? 'blocked' : 'warn'}>{a.declaredConfidence}</StatusPill></td>
                  <td><StatusPill kind={a.status === 'supported' ? 'ok' : a.status === 'declared-uncertain' ? 'blocked' : 'warn'}>{a.status}</StatusPill></td>
                  <td className="ds-dim lg-route-cell">{a.edge.mechanism}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
