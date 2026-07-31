import { useMemo, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { useI18n } from '../../core/i18n';
import { LongevityGraph } from './LongevityGraph';
import { SimulatorTab, CellStateTab, SpeciesTab, ReprogrammingTab, ScoreTab, AuditTab } from './LongevityLabs';
import { getNode, neighbourhood, nodesOfKind, type GraphNodeId } from '@genesis-os/reasoning/knowledgeGraph';
import { INTERVENTIONS, type InterventionId } from '@genesis-os/reasoning/interventions';
import { analyseCancerSafety } from '@genesis-os/reasoning/cancerSafety';
import { generateHypotheses } from '@genesis-os/reasoning/discovery';
import { survivingHypotheses } from '@genesis-os/reasoning/critic';
import { designExperiment } from '@genesis-os/reasoning/experimentDesign';
import { appraiseIntervention } from '@genesis-os/reasoning/appraisal';
import { validateEvidence, TIERS, OUTCOMES, type EvidenceRecord, type EvidenceTier, type OutcomeType } from '@genesis-os/reasoning/evidence';
import { useEvidenceStore, type EvidenceStore } from '../../core/longevityEvidence';
import {
  allPathsBetween, highestValueExperiments, strongestInteractions,
  strongestEvidenceWeakestTranslation, researchGaps,
  influencesWithoutCancerRisk, safetyProfile, hypothesesAbout,
  type QueryAnswer,
} from '@genesis-os/reasoning/query';
import { traceSupport } from '@genesis-os/reasoning/edgeEvidence';
import { LongevityOverview } from './LongevityOverview';
import type { HallmarkId } from '@genesis-os/reasoning/hallmarks';

/**
 * Longevity Discovery Workspace.
 *
 * Five views over one reasoning core. The organising principle is that NOTHING is
 * shown without its derivation: every verdict, ranking and hypothesis renders the
 * ordered chain of graph edges that produced it, so a reader can disagree with a
 * specific step rather than with the software.
 *
 * Evidence records live in component state and are never persisted here — the
 * platform's collaboration layer (campaigns, members, comments, version history)
 * already handles persistence and sharing, and duplicating it would create a
 * second source of truth.
 */

type Tab = 'overview' | 'graph' | 'safety' | 'simulator' | 'states' | 'discovery' | 'score' | 'experiments' | 'species' | 'reprogramming' | 'evidence' | 'audit';

/** Shared renderer for a query answer's derivation and limitations. */
function Derivation({ answer }: { answer: QueryAnswer<unknown> }) {
  return (
    <div className="lg-derivation">
      <h5>How this was derived</h5>
      <ol>{answer.derivation.map((d, i) => <li key={i}>{d}</li>)}</ol>
      <h5>What this cannot tell you</h5>
      <ul className="lg-limits">{answer.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

function ReasoningChain({ steps, title }: { steps: string[]; title?: string }) {
  if (!steps.length) return null;
  return (
    <div className="lg-chain">
      {title ? <h6>{title}</h6> : null}
      <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </div>
  );
}

/* ------------------------------- graph tab ------------------------------- */

function GraphTab() {
  const [selected, setSelected] = useState<GraphNodeId | null>('cellular-senescence');
  const [pathTo, setPathTo] = useState<GraphNodeId | ''>('');
  const node = selected ? getNode(selected) : null;
  const nb = selected ? neighbourhood(selected) : null;
  const paths = useMemo(
    () => (selected && pathTo ? allPathsBetween(selected, pathTo) : null),
    [selected, pathTo],
  );

  return (
    <div className="lg-split">
      <Panel title="Knowledge graph" icon="graph" right={<StatusPill kind="info">deterministic layout</StatusPill>}>
        <LongevityGraph selected={selected} onSelect={(id) => { setSelected(id); setPathTo(''); }} />
      </Panel>
      <div className="lg-side">
        <Panel title={node ? node.label : 'Select a node'} icon="atom">
          {node ? (
            <>
              <StatusPill kind={node.honesty === 'exact' ? 'ok' : node.honesty === 'theoretical' ? 'warn' : 'info'}>
                {node.kind} · {node.honesty}
              </StatusPill>
              <p className="ds-note">{node.summary}</p>
              {node.molecules?.length ? (
                <p className="lg-molecules"><strong>Molecules:</strong> <span className="ds-mono">{node.molecules.join(', ')}</span></p>
              ) : null}
              <h6 className="lg-h6">Incoming ({nb?.incoming.length ?? 0})</h6>
              <ul className="lg-edge-list">
                {nb?.incoming.map((e, i) => (
                  <li key={i}>
                    <button className="lg-link" onClick={() => setSelected(e.from)}>{getNode(e.from)?.label}</button>
                    <span className={`lg-effect lg-effect-${e.effect}`}>{e.effect}</span>
                    <span className="ds-dim">{e.mechanism}</span>
                  </li>
                ))}
              </ul>
              <h6 className="lg-h6">Outgoing ({nb?.outgoing.length ?? 0})</h6>
              <ul className="lg-edge-list">
                {nb?.outgoing.map((e, i) => (
                  <li key={i}>
                    <button className="lg-link" onClick={() => setSelected(e.to)}>{getNode(e.to)?.label}</button>
                    <span className={`lg-effect lg-effect-${e.effect}`}>{e.effect}</span>
                    <span className="ds-dim">{e.mechanism}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="ds-dim">Click any node to inspect its mechanism, molecules and documented edges.</p>}
        </Panel>

        {selected ? <QuestionsPanel node={selected} /> : null}

        {selected ? (
          <Panel title="Trace every pathway" icon="search">
            <label className="lg-field">
              <span>From <strong>{node?.label}</strong> to</span>
              <select className="compare-select" value={pathTo} onChange={(e) => setPathTo(e.target.value as GraphNodeId)}>
                <option value="">— choose a target —</option>
                {getSelectableTargets(selected).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            {paths ? (
              paths.empty ? (
                <p className="ds-note">{paths.derivation[paths.derivation.length - 1]}</p>
              ) : (
                <>
                  {paths.results.map((p, i) => (
                    <div key={i} className={`lg-path lg-path-${p.net}`}>
                      <StatusPill kind={p.net === 'counteracts' ? 'ok' : 'warn'}>
                        net {p.net} · {p.hops} hop(s) · confidence {p.confidence.toFixed(2)}
                      </StatusPill>
                      <ReasoningChain steps={p.steps} />
                      <p className="ds-dim lg-weakest">{traceSupport(p.edges, []).verdict}</p>
                    </div>
                  ))}
                  <Derivation answer={paths} />
                </>
              )
            ) : null}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Valid path targets: mechanisms and oncogenic axes. Strategies are excluded
 * because a `targets` edge records intent and carries no sign, so a path ending
 * at one would have no causal meaning.
 */
function getSelectableTargets(exclude: GraphNodeId) {
  return [...nodesOfKind('hallmark'), ...nodesOfKind('cancer-pathway')]
    .filter((n) => n.id !== exclude)
    .map((n) => ({ id: n.id, label: n.label }));
}

/* ------------------------------- safety tab ------------------------------- */

function SafetyTab() {
  const [id, setId] = useState<InterventionId>('telomerase-activation');
  const profile = useMemo(() => analyseCancerSafety(id), [id]);

  return (
    <>
      <Panel title="Cancer Safety Engine" icon="shield" right={<StatusPill kind="warn">runs on every strategy automatically</StatusPill>}>
        <p className="ds-note">
          Ageing and cancer share their machinery: the programmes that stop a damaged cell dividing are the programmes
          that suppress tumours. Any strategy relieving age-associated arrest therefore acts on tumour-suppressive
          machinery <strong>by construction</strong>. Each route below composes the strategy&rsquo;s intended direction
          on a mechanism with that mechanism&rsquo;s documented coupling to an oncogenic axis.
        </p>
        <div className="account-tabs" role="tablist">
          {INTERVENTIONS.map((iv) => (
            <button key={iv.id} role="tab" aria-selected={iv.id === id}
              className={`account-tab${iv.id === id ? ' active' : ''}`} onClick={() => setId(iv.id)}>
              {iv.label}
            </button>
          ))}
        </div>
      </Panel>

      {profile ? (
        <Panel title={profile.interventionLabel} icon="alert" right={
          <StatusPill kind={profile.verdict === 'protective-only' ? 'ok' : profile.verdict === 'not-assessable' ? 'info' : 'warn'}>
            {profile.verdict}
          </StatusPill>
        }>
          <p className="ds-note lg-summary">{profile.summary}</p>

          {profile.risks.length ? <h5 className="lg-h5">Routes that increase cancer risk</h5> : null}
          {profile.risks.map((f, i) => (
            <div key={i} className="lg-finding lg-finding-risk">
              <div className="lg-finding-head">
                <StatusPill kind="warn">{f.axisLabel}</StatusPill>
                <span className="ds-dim">via {f.viaHallmarkLabel} · {f.confidence}</span>
              </div>
              <ReasoningChain steps={f.reasoning} />
            </div>
          ))}

          {profile.protective.length ? <h5 className="lg-h5">Routes that reduce cancer risk</h5> : null}
          {profile.protective.map((f, i) => (
            <div key={i} className="lg-finding lg-finding-ok">
              <div className="lg-finding-head">
                <StatusPill kind="ok">{f.axisLabel}</StatusPill>
                <span className="ds-dim">via {f.viaHallmarkLabel} · {f.confidence}</span>
              </div>
              <ReasoningChain steps={f.reasoning} />
            </div>
          ))}

          {profile.unassessedAxes.length ? (
            <>
              <h5 className="lg-h5">Unassessed axes</h5>
              <p className="ds-note">
                No documented coupling was found for {profile.unassessedAxes.map((a) => a.axisLabel).join(', ')}.
                That is <strong>missing analysis, not a clean result</strong>.
              </p>
            </>
          ) : null}

          <h5 className="lg-h5">Documented tensions</h5>
          {profile.tensions.map((t, i) => (
            <div key={i} className="lg-tension">
              <StatusPill kind={t.severity === 'documented-clinical' ? 'blocked' : t.severity === 'documented-preclinical' ? 'warn' : 'info'}>
                {t.severity}
              </StatusPill>
              <strong>{t.label}</strong>
              <p className="ds-note">{t.mechanism}</p>
              <p className="ds-dim"><Icon name="target" size={12} /> Monitored by: {t.monitoredBy}</p>
            </div>
          ))}

          <h5 className="lg-h5">Required monitoring</h5>
          <ul className="lg-limits">{profile.requiredMonitoring.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </Panel>
      ) : null}
    </>
  );
}

/* ----------------------------- discovery tab ----------------------------- */

function DiscoveryTab({ records }: { records: EvidenceRecord[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const surviving = useMemo(() => survivingHypotheses(generateHypotheses(records), 12), [records]);
  const interactions = useMemo(() => strongestInteractions(8), []);
  const gaps = useMemo(() => researchGaps(), []);

  return (
    <>
      <Panel title="Generated hypotheses" icon="brain" right={<StatusPill kind="info">structural · after critique</StatusPill>}>
        <p className="ds-note">
          Hypotheses are generated by finding <strong>shapes</strong> in the curated mechanism graph — open triads,
          offsetting safety profiles, unaddressed couplings, amplifying loops, sign conflicts and unmeasurable
          mechanisms. Nothing is written by a language model, so no relationship appears that no curator asserted,
          and <strong>no citation is ever manufactured</strong>. Plausibility shown is after the critic has attacked it.
        </p>
        {surviving.map(({ hypothesis: h, critique: c, survivalScore }) => (
          <div key={h.id} className="lg-hypothesis">
            <div className="lg-hyp-head">
              <StatusPill kind="info">{h.kind.replace(/-/g, ' ')}</StatusPill>
              <span className="lg-scores">
                plausibility <strong>{h.plausibility}</strong> → <strong>{c.adjustedPlausibility}</strong> after critique
                · novelty <strong>{h.novelty}</strong> · survival <strong>{survivalScore}</strong>
              </span>
            </div>
            <p className="lg-hyp-statement">{h.statement}</p>
            <button className="ds-btn ds-btn-sm" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
              {expanded === h.id ? 'Hide reasoning' : 'Show reasoning, challenges and plan'}
            </button>
            {expanded === h.id ? (
              <div className="lg-hyp-body">
                <ReasoningChain steps={h.reasoning} title="Biological reasoning" />
                <h6>Challenges</h6>
                <ul className="lg-limits">
                  {c.challenges.map((ch, i) => (
                    <li key={i}>
                      <StatusPill kind={ch.severity === 'fatal-if-true' ? 'blocked' : ch.severity === 'major' ? 'warn' : 'info'}>{ch.severity}</StatusPill>{' '}
                      {ch.statement}
                      <div className="ds-dim">Discriminating test: {ch.discriminatingTest}</div>
                    </li>
                  ))}
                </ul>
                {c.alternativeMechanisms.length ? (
                  <>
                    <h6>Alternative mechanisms that would explain the same result</h6>
                    <ul className="lg-limits">{c.alternativeMechanisms.map((a, i) => <li key={i}>{a.statement}</li>)}</ul>
                  </>
                ) : null}
                <h6>Missing evidence</h6>
                <ul className="lg-limits">{h.missingEvidence.map((m, i) => <li key={i}>{m}</li>)}</ul>
                <ExperimentPlanView hypothesisId={h.id} records={records} />
              </div>
            ) : null}
          </div>
        ))}
      </Panel>

      <Panel title="Strongest mechanism couplings" icon="chart">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Mechanism A</th><th>Mechanism B</th><th>Coupling</th><th>Paths</th><th>Shortest</th><th /></tr></thead>
            <tbody>
              {interactions.results.map((m, i) => (
                <tr key={i}>
                  <td className="ds-strong">{getNode(m.a)?.label}</td>
                  <td className="ds-strong">{getNode(m.b)?.label}</td>
                  <td className="ds-mono">{m.coupling.toFixed(2)}</td>
                  <td>{m.pathCount}</td>
                  <td>{m.shortestHops}</td>
                  <td>{m.bidirectional ? <StatusPill kind="info">bidirectional</StatusPill> : null}{m.conflicting ? <StatusPill kind="warn">conflicting signs</StatusPill> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Derivation answer={interactions} />
      </Panel>

      <Panel title="Research gaps" icon="search">
        {gaps.empty ? <p className="ds-dim">No structural gaps detected.</p> : (
          <ul className="lg-limits">
            {gaps.results.map((g, i) => (
              <li key={i}><StatusPill kind="warn">{g.kind}</StatusPill> <strong>{g.label}</strong> — {g.why}</li>
            ))}
          </ul>
        )}
        <Derivation answer={gaps} />
      </Panel>
    </>
  );
}

function ExperimentPlanView({ hypothesisId, records }: { hypothesisId: string; records: EvidenceRecord[] }) {
  const plan = useMemo(() => {
    const h = generateHypotheses(records).find((x) => x.id === hypothesisId);
    return h ? designExperiment(h) : null;
  }, [hypothesisId, records]);
  if (!plan) return null;

  return (
    <div className="lg-plan">
      <h6>Experimental plan</h6>
      {plan.isUninformative ? (
        <StatusPill kind="blocked">This plan cannot discriminate the hypotheses — do not run it</StatusPill>
      ) : null}
      <h6 className="lg-h6">Discriminating predictions</h6>
      {plan.discriminatingPredictions.map((p, i) => (
        <div key={i} className="lg-prediction">
          <div><strong>If the hypothesis holds:</strong> {p.underHypothesis}</div>
          <div><strong>If it does not:</strong> {p.underNull}</div>
        </div>
      ))}
      <h6 className="lg-h6">Models</h6>
      <ul className="lg-limits">
        {[...plan.cellModels, ...plan.animalModels].map((m, i) => (
          <li key={i}><strong>{m.name}</strong> — {m.rationale} <em className="ds-dim">Limit: {m.limitation}</em></li>
        ))}
      </ul>
      <h6 className="lg-h6">Controls</h6>
      <ul className="lg-limits">
        {plan.controls.map((c, i) => <li key={i}><StatusPill kind="info">{c.kind}</StatusPill> {c.description} <em className="ds-dim">Guards against: {c.guardsAgainst}</em></li>)}
      </ul>
      <h6 className="lg-h6">Endpoints</h6>
      <ul className="lg-limits">
        {plan.endpoints.map((e, i) => (
          <li key={i}>
            <StatusPill kind={e.role === 'safety' ? 'warn' : e.kind === 'direct' ? 'ok' : 'info'}>{e.role}/{e.kind}</StatusPill>{' '}
            <strong>{e.assay}</strong> — {e.measures}{e.caveat ? <em className="ds-dim"> {e.caveat}</em> : null}
          </li>
        ))}
      </ul>
      <h6 className="lg-h6">Failure modes</h6>
      <ul className="lg-limits">
        {plan.failureModes.slice(0, 8).map((f, i) => (
          <li key={i}><StatusPill kind={f.likelihood === 'common' ? 'warn' : 'info'}>{f.likelihood}</StatusPill> {f.description} <em className="ds-dim">Mitigation: {f.mitigation}</em></li>
        ))}
      </ul>
      <h6 className="lg-h6">Design notes</h6>
      <ul className="lg-limits">{plan.designNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </div>
  );
}

/* ---------------------------- experiments tab ---------------------------- */

function ExperimentsTab({ records }: { records: EvidenceRecord[] }) {
  const answer = useMemo(() => highestValueExperiments(records, 12), [records]);
  const gap = useMemo(() => strongestEvidenceWeakestTranslation(records), [records]);

  return (
    <>
      <Panel title="What is the next experiment worth doing?" icon="target" right={<StatusPill kind="ok">value of information</StatusPill>}>
        <p className="ds-note">
          Genesis never claims a therapy works. It answers a question that <em>is</em> computable without predicting
          any biological outcome: how much of what we do not know would a given experiment retire, and at what effort.
          Each candidate below was produced by simulating the addition of one competent study and recomputing the
          appraisal. <strong>The simulation assumes nothing about what the study would find</strong> — a null result
          retires the same coverage uncertainty as a positive one.
        </p>
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Strategy × mechanism</th><th>System</th><th>Endpoint</th><th>Retires</th><th>Effort</th><th>Value</th></tr></thead>
            <tbody>
              {answer.results.map((c, i) => (
                <tr key={i}>
                  <td className="ds-strong">{c.interventionLabel} × {c.hallmarkLabel}</td>
                  <td>{c.tierLabel}</td>
                  <td>{c.outcomeLabel}</td>
                  <td className="ds-mono">{c.uncertaintyReduction} pts ({c.uncertaintyBefore}→{c.uncertaintyAfter})</td>
                  <td className="ds-mono">{c.effort}</td>
                  <td className="ds-mono ds-strong">{c.valuePerEffort.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {answer.results[0] ? (
          <div className="lg-recommendation">
            <StatusPill kind="ok">Highest value</StatusPill>
            <p>{answer.results[0].justification}</p>
            <ul className="lg-limits">
              {answer.results[0].movesComponents.map((m, i) => (
                <li key={i}>{m.factor}: coverage {m.from}% → {m.to}%</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Derivation answer={answer} />
      </Panel>

      <Panel title="Strongest evidence, weakest human translation" icon="alert">
        {gap.empty ? (
          <p className="ds-dim">No evidence records yet — add records in the Evidence tab to compute this.</p>
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead><tr><th>Strategy</th><th>Strength</th><th>Human relevance</th><th>Gap</th></tr></thead>
              <tbody>
                {gap.results.map((g, i) => (
                  <tr key={i}>
                    <td className="ds-strong">{g.label}</td>
                    <td className="ds-mono">{g.strength}</td>
                    <td className="ds-mono">{g.humanRelevance}</td>
                    <td className="ds-mono ds-strong">{g.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Derivation answer={gap} />
      </Panel>
    </>
  );
}

/* ------------------------------ evidence tab ------------------------------ */

const EMPTY_FORM = {
  interventionId: 'senolytics' as InterventionId,
  hallmarkId: 'cellular-senescence' as HallmarkId,
  tier: 'rodent' as EvidenceTier,
  outcome: 'healthspan' as OutcomeType,
  direction: 'beneficial' as EvidenceRecord['direction'],
  citation: '', system: '', sampleSize: 20,
  replicated: false, randomised: true, blinded: false, preregistered: false,
  readoutKind: 'direct' as 'direct' | 'proxy',
};

function EvidenceTab({ records, onAdd, store }: { records: EvidenceRecord[]; onAdd: (r: EvidenceRecord) => void; store: EvidenceStore }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [appraiseId, setAppraiseId] = useState<InterventionId>('senolytics');
  const appraisal = useMemo(() => appraiseIntervention(appraiseId, records), [appraiseId, records]);
  const targets = INTERVENTIONS.find((i) => i.id === form.interventionId)?.targets ?? [];

  const submit = () => {
    const candidate: EvidenceRecord = { ...form, id: `rec-${records.length + 1}-${form.citation.slice(0, 8)}`, addedAt: Date.now() };
    const v = validateEvidence(candidate);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors([]);
    void onAdd(candidate);
    setForm({ ...EMPTY_FORM, interventionId: form.interventionId });
  };

  return (
    <>
      <Panel
        title="Add an evidence record"
        icon="book"
        right={
          <StatusPill kind={store.persisted ? 'ok' : 'warn'}>
            {store.persisted ? 'saved to your account' : 'this tab only'}
          </StatusPill>
        }
      >
        {store.error ? <p className="ds-note ds-warn">{store.error}</p> : null}
        {!store.persisted && !store.error ? (
          <p className="ds-note">
            You are not signed in, so these records live in this browser tab and vanish when it closes. Sign in to keep
            them, have them graded on the server and make them citable by an artifact.
          </p>
        ) : null}
        <p className="ds-note">
          The platform ships <strong>no efficacy data at all</strong>. Every claim about whether a strategy does
          anything enters here, with a citation, and is graded on two independent axes. An uncited record is refused
          rather than stored — a claim nobody can check is an opinion.
        </p>
        <div className="lg-form">
          <label className="lg-field"><span>Strategy</span>
            <select className="compare-select" value={form.interventionId}
              onChange={(e) => setForm({ ...form, interventionId: e.target.value as InterventionId })}>
              {INTERVENTIONS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </label>
          <label className="lg-field"><span>Mechanism</span>
            <select className="compare-select" value={form.hallmarkId}
              onChange={(e) => setForm({ ...form, hallmarkId: e.target.value as HallmarkId })}>
              {targets.map((h) => <option key={h} value={h}>{getNode(h)?.label ?? h}</option>)}
            </select>
          </label>
          <label className="lg-field"><span>Experimental system</span>
            <select className="compare-select" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as EvidenceTier })}>
              {Object.values(TIERS).map((t) => <option key={t.tier} value={t.tier}>{t.label}</option>)}
            </select>
          </label>
          <label className="lg-field"><span>Outcome measured</span>
            <select className="compare-select" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value as OutcomeType })}>
              {Object.values(OUTCOMES).map((o) => <option key={o.outcome} value={o.outcome}>{o.label}</option>)}
            </select>
          </label>
          <label className="lg-field"><span>Direction</span>
            <select className="compare-select" value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value as EvidenceRecord['direction'] })}>
              <option value="beneficial">Beneficial</option><option value="null">Null</option><option value="harmful">Harmful</option>
            </select>
          </label>
          <label className="lg-field"><span>Primary readout</span>
            <select className="compare-select" value={form.readoutKind}
              onChange={(e) => setForm({ ...form, readoutKind: e.target.value as 'direct' | 'proxy' })}>
              <option value="direct">Direct measurement</option><option value="proxy">Proxy</option>
            </select>
          </label>
          <label className="lg-field lg-wide"><span>Citation (DOI, PMID or full reference)</span>
            <input type="text" value={form.citation} onChange={(e) => setForm({ ...form, citation: e.target.value })} placeholder="e.g. PMID:12345678" />
          </label>
          <label className="lg-field"><span>System as reported</span>
            <input type="text" value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} placeholder="e.g. C57BL/6 mouse" />
          </label>
          <label className="lg-field"><span>n per group</span>
            <input type="number" min={0} value={form.sampleSize} onChange={(e) => setForm({ ...form, sampleSize: Number(e.target.value) })} />
          </label>
          <div className="lg-checks">
            {([['replicated', 'Independently replicated'], ['randomised', 'Randomised'], ['blinded', 'Blinded assessment'], ['preregistered', 'Preregistered']] as const).map(([key, lbl]) => (
              <label key={key} className="lg-check">
                <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                <span>{lbl}</span>
              </label>
            ))}
          </div>
        </div>
        {errors.length ? <ul className="lg-errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
        <button className="ds-btn" onClick={submit}>Add record</button>
      </Panel>

      <Panel title="Appraisal" icon="chart" right={<StatusPill kind="info">{records.length} record(s) on file</StatusPill>}>
        <div className="account-tabs" role="tablist">
          {INTERVENTIONS.map((iv) => (
            <button key={iv.id} role="tab" aria-selected={iv.id === appraiseId}
              className={`account-tab${iv.id === appraiseId ? ' active' : ''}`} onClick={() => setAppraiseId(iv.id)}>
              {iv.label}
            </button>
          ))}
        </div>
        {appraisal ? (
          <>
            <p className="ds-note lg-summary">{appraisal.verdict}</p>
            <div className="lg-metrics">
              <div><span className="lg-metric">{appraisal.uncertainty}</span><span>uncertainty</span></div>
              <div><span className="lg-metric">{appraisal.bestStrength}</span><span>best strength</span></div>
              <div><span className="lg-metric">{appraisal.bestHumanRelevance}</span><span>human relevance</span></div>
              <div><span className="lg-metric">{appraisal.translationalDifficulty.score}</span><span>translational difficulty ({appraisal.translationalDifficulty.band})</span></div>
            </div>
            <h5 className="lg-h5">Uncertainty breakdown</h5>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead><tr><th>Dimension</th><th>Coverage</th><th>Weight</th><th>Would be reduced by</th></tr></thead>
                <tbody>
                  {appraisal.uncertaintyComponents.map((c, i) => (
                    <tr key={i}>
                      <td className="ds-strong">{c.factor}</td>
                      <td className="ds-mono">{Math.round(c.coverage * 100)}%</td>
                      <td className="ds-mono">{c.weight}</td>
                      <td className="ds-dim">{c.wouldBeReducedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {appraisal.grades.length ? (
              <>
                <h5 className="lg-h5">Graded records</h5>
                {appraisal.grades.map(({ record, grade }) => (
                  <div key={record.id} className="lg-grade">
                    <div className="lg-finding-head">
                      <StatusPill kind={grade.strengthBand === 'strong' ? 'ok' : grade.strengthBand === 'none' ? 'blocked' : 'warn'}>
                        strength {grade.strength}
                      </StatusPill>
                      <StatusPill kind={grade.humanRelevanceBand === 'strong' ? 'ok' : 'warn'}>
                        human relevance {grade.humanRelevance}
                      </StatusPill>
                      <span className="ds-mono ds-dim">{record.citation}</span>
                    </div>
                    <ul className="lg-limits">
                      {grade.breakdown.map((b, i) => <li key={i}><strong>{b.factor}</strong> ×{b.multiplier} — {b.reason}</li>)}
                    </ul>
                    {grade.caveats.length ? <ul className="lg-errors">{grade.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
                  </div>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </Panel>
    </>
  );
}

/* -------------------------------- screen -------------------------------- */

export function LongevityScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('overview');
  // Evidence now lives on the server when there is an account to attach it to.
  // See core/longevityEvidence.ts for why it still works without one.
  const evidence = useEvidenceStore();
  const records = evidence.records;

  const tabs: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'overview', label: t('lg.tab.overview'), icon: 'rocket' },
    { id: 'graph', label: t('lg.tab.graph'), icon: 'graph' },
    { id: 'safety', label: t('lg.tab.safety'), icon: 'shield' },
    { id: 'simulator', label: t('lg.tab.simulator'), icon: 'cpu' },
    { id: 'states', label: t('lg.tab.states'), icon: 'dna' },
    { id: 'discovery', label: t('lg.tab.discovery'), icon: 'brain' },
    { id: 'score', label: t('lg.tab.score'), icon: 'chart' },
    { id: 'experiments', label: t('lg.tab.experiments'), icon: 'target' },
    { id: 'species', label: t('lg.tab.species'), icon: 'flask' },
    { id: 'reprogramming', label: t('lg.tab.reprogramming'), icon: 'atom' },
    { id: 'evidence', label: t('lg.tab.evidence'), icon: 'book' },
    { id: 'audit', label: t('lg.tab.audit'), icon: 'shield' },
  ];

  return (
    <DiscoveryShell
      active="#/longevity"
      title={t('lg.title')}
      subtitle={t('lg.subtitle')}
      actions={<StatusPill kind="warn">{t('lg.notAdvice')}</StatusPill>}
    >
      <div className="account-tabs lg-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id}
            className={`account-tab${tab === x.id ? ' active' : ''}`} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} size={14} /> {x.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <LongevityOverview records={records} onNavigate={(x) => setTab(x as Tab)} /> : null}
      {tab === 'graph' ? <GraphTab /> : null}
      {tab === 'safety' ? <SafetyTab /> : null}
      {tab === 'discovery' ? <DiscoveryTab records={records} /> : null}
      {tab === 'experiments' ? <ExperimentsTab records={records} /> : null}
      {tab === 'evidence' ? <EvidenceTab records={records} onAdd={evidence.add} store={evidence} /> : null}
      {tab === 'simulator' ? <SimulatorTab /> : null}
      {tab === 'states' ? <CellStateTab /> : null}
      {tab === 'score' ? <ScoreTab records={records} /> : null}
      {tab === 'species' ? <SpeciesTab /> : null}
      {tab === 'reprogramming' ? <ReprogrammingTab /> : null}
      {tab === 'audit' ? <AuditTab records={records} /> : null}
    </DiscoveryShell>
  );
}


/**
 * The questions a researcher actually asks, as typed queries. Free text is
 * deliberately absent: a box that accepts anything cannot tell the user what it
 * is unable to answer, and fails by producing fluent output instead of an error.
 */
function QuestionsPanel({ node }: { node: GraphNodeId }) {
  const [which, setWhich] = useState<'safe-influences' | 'safety' | 'hypotheses'>('safe-influences');
  const nodeLabel = getNode(node)?.label ?? String(node);
  const isHallmark = nodesOfKind('hallmark').some((n) => n.id === node);
  const isIntervention = INTERVENTIONS.some((i) => i.id === node);

  const answer: QueryAnswer<unknown> | null = useMemo(() => {
    if (which === 'safe-influences') return isHallmark ? influencesWithoutCancerRisk(node as HallmarkId) : null;
    if (which === 'safety') return isIntervention ? safetyProfile(node as InterventionId) : safetyProfile();
    return hypothesesAbout(node, []);
  }, [which, node, isHallmark, isIntervention]);

  return (
    <Panel title="Ask the graph" icon="brain" right={<StatusPill kind="info">typed queries, not free text</StatusPill>}>
      <div className="lg-presets">
        <button className={`chip-btn${which === 'safe-influences' ? ' active' : ''}`} onClick={() => setWhich('safe-influences')}>
          What influences {nodeLabel} without raising cancer risk?
        </button>
        <button className={`chip-btn${which === 'safety' ? ' active' : ''}`} onClick={() => setWhich('safety')}>
          Oncogenic profile
        </button>
        <button className={`chip-btn${which === 'hypotheses' ? ' active' : ''}`} onClick={() => setWhich('hypotheses')}>
          Testable hypotheses involving {nodeLabel}
        </button>
      </div>

      {!answer ? (
        <p className="ds-note">
          That question does not apply to a node of this kind. The engine says so rather than answering anyway.
        </p>
      ) : answer.empty ? (
        <p className="ds-note"><strong>No result.</strong> {answer.derivation[answer.derivation.length - 1]}</p>
      ) : (
        <>
          <p className="ds-note lg-summary">{answer.question}</p>
          <p className="ds-dim">{answer.results.length} result(s).</p>
          <Derivation answer={answer} />
        </>
      )}
    </Panel>
  );
}
