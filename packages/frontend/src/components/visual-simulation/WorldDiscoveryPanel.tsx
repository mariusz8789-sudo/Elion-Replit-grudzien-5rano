import { useEffect, useState } from 'react';
import type { CrossActionComparison } from '../../core/agent/crossActionComparison';
import { admitWorldQuestion } from '../../core/agent/discoveryAdmission';
import type { Admission } from '../../core/agent/discoveryStrategy';
import type { DiscoveryLoopResult, DiscoveryTraceStep } from '../../core/agent/discoveryLoop';
import { renderDiscoveryReport } from '../../core/agent/discoveryReport';
import {
  runWorldDiscoveryAndRemember,
  summariseDiscovery,
  type WorldDiscoveryEvidenceSummary,
  type WorldDiscoveryMemoryUse,
  type WorldDiscoveryRememberedState,
} from '../../core/agent/worldDiscoverySession';
import { runMechanismResearchChain, type MechanismResearchChainResult } from '../../core/agent/researchChain';
import { LabEnvironmentPicker } from './LabEnvironmentPicker';
import {
  GENESIS_FLOOD_CATALOG,
  parseWorldDiscoveryGoal,
  resolveWorldLeverCatalog,
  WORLD_LEVER_CATALOGS,
  type WorldGoalIntent,
  type WorldLeverCatalog,
} from '../../core/agent/worldGoalIntent';
import {
  getExperiment,
  listExperiments,
  replaySavedWorldDiscoveryRun,
  type SavedExperiment,
  type SavedWorldDiscoveryReplay,
} from '../../core/scienceMemory';

/** Local UI states the session module has no reason to know about. Exported so an embedding screen
 * (Demo Mode, a flagship narrative strip) can type an `onResult` callback against the real shape
 * this panel actually produces, instead of re-deriving its own verdict from the same run. */
export type PanelState =
  | { kind: 'IDLE' }
  | { kind: 'RUNNING'; goal: string }
  | { kind: 'NOT_ADMITTED'; goal: string; admission: Admission }
  | WorldDiscoveryRememberedState;

/** A friendly, honest label for a catalog: the engine's own declared strings, nothing invented. */
function catalogLabel(catalog: WorldLeverCatalog): string {
  return `${catalog.domainId} — ${catalog.worldId}`;
}

/** Every world-discovery run ever saved, newest first — `listExperiments()` covers every kind of
 * saved experiment in Science Memory, so this filters to the ones this panel's own engine produced. */
function listWorldDiscoveryHistory(): readonly SavedExperiment[] {
  return listExperiments().filter((e) => e.worldDiscovery !== undefined);
}

/** The one-line outcome of a saved run, read from what it actually recorded — never re-derived. */
function historySummary(exp: SavedExperiment): string {
  const record = exp.worldDiscovery;
  if (!record) return '(no discovery record)';
  if (record.resultKind === 'HYPOTHESIS_LOOP' && record.loopResult) {
    return summariseDiscovery(record.loopResult);
  }
  if (record.resultKind === 'ACTION_COMPARISON' && record.comparisonResult) {
    const c = record.comparisonResult;
    if (c.status !== 'RANKED' && c.status !== 'TIED') return `Comparison: ${c.status}.`;
    const winner = c.ranking.find((a) => c.bestActionIds.includes(a.actionId));
    return `Compared ${c.ranking.length} actions; best: ${winner?.label ?? '(tied, no single best)'}.`;
  }
  return '(no result)';
}

/**
 * DISCOVERY, IN THE WORLD IT SEARCHES.
 *
 * This panel sits on the flood city's own screen because that is the world the
 * search actually runs in; a separate page would have shown results detached
 * from the thing they are about.
 *
 * It contains NO discovery logic. It calls `runWorldDiscoveryAndRemember` (the
 * one seam — see that function's own doc) and renders what comes back, or reads
 * an already-saved record straight from Science Memory for the history views
 * below. In particular it never decides which mechanism won, never picks a
 * fallback when nothing survived, and never rewrites a refusal into a friendlier
 * message — the planner's own words are shown, because a goal Genesis could not
 * read is a fact the user needs, not an error to smooth over.
 *
 * Both audiences are served from the same object: the plain-language sections
 * are the structured result rendered field by field, and the machine-readable
 * report and JSON sit underneath in a disclosure, so nothing shown to a person
 * is a paraphrase of something different from what a tool would read.
 */
export function WorldDiscoveryPanel({
  defaultCatalogId,
  initialGoal,
  onResult,
}: {
  defaultCatalogId?: string;
  /** DEMO MODE — if given, this exact goal runs ONCE on mount, through the same `run()` a typed
   * submission would call: not a second, demo-only execution path, only an automatic first keystroke. */
  initialGoal?: string;
  /** Fires with every state this panel reaches that carries a real outcome (NOT_ADMITTED, REFUSED,
   * COMPLETE, COMPARISON) — never for IDLE/RUNNING. Lets an embedding screen (e.g. the Virtual Cell
   * Lab's own CONCLUSION/NEXT EXPERIMENT narrative) read the SAME real result this panel already
   * computed, instead of re-deriving a second verdict from the same run. */
  onResult?: (state: PanelState) => void;
} = {}) {
  const [goal, setGoal] = useState('');
  const [state, setState] = useState<PanelState>({ kind: 'IDLE' });
  // Every real lever catalog Genesis declares, read from the ONE registry
  // (`WORLD_LEVER_CATALOGS`) rather than a second hand-written list here — a
  // list that could drift is exactly what that registry exists to prevent.
  // `defaultCatalogId` lets an embedding screen (e.g. the Virtual Cell Lab) open this SAME generic
  // panel already pointed at its own world, instead of a second bespoke discovery UI — falls back to
  // the flood catalog (this panel's original, still-only caller's default) when omitted.
  const [catalogId, setCatalogId] = useState<string>(defaultCatalogId ?? GENESIS_FLOOD_CATALOG.catalogId);
  const catalog = resolveWorldLeverCatalog(catalogId) ?? GENESIS_FLOOD_CATALOG;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<readonly string[]>([]);
  const [replayChecks, setReplayChecks] = useState<Readonly<Record<string, SavedWorldDiscoveryReplay>>>({});
  // A CHAIN run is a separate mode from the single-shot `state` above, not a
  // third value folded into it: `runMechanismResearchChain` already calls
  // `runMechanismDiscoveryAndRemember` (the same real save/evidence/replay
  // seam `run()` uses) once per step internally, so this holds only the
  // chain's OWN result — no second discovery engine, no second persistence.
  const [chainResult, setChainResult] = useState<MechanismResearchChainResult | null>(null);
  const [chainRunning, setChainRunning] = useState(false);

  /** Sets state AND, when this run reached a real outcome (not IDLE/RUNNING), reports it upward —
   * the one place both effects happen, so no caller of `run()` below has to remember both. */
  const finish = (next: PanelState) => {
    setState(next);
    onResult?.(next);
  };

  const run = (text: string, forCatalogId: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setViewingId(null);
    setCompareIds([]);
    // ADMISSION — asked before anything is searched. A question whose hazard/
    // process Genesis has no solver for must come back as a NAMED GAP (what the
    // capability registry actually says is missing), not as a search over
    // whichever levers this catalog happens to declare. REAL/APPROXIMATION both
    // proceed — the flood catalog itself is only PARTIALLY_MODELLED and still
    // a real, admitted search; only NOT_MODELLED/BLOCKED are refused here.
    const admission = admitWorldQuestion(trimmed);
    if (admission.status === 'NOT_MODELLED' || admission.status === 'BLOCKED') {
      finish({ kind: 'NOT_ADMITTED', goal: trimmed, admission });
      return;
    }
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
    setTimeout(() => finish(runWorldDiscoveryAndRemember(trimmed, forCatalogId)), 0);
  };

  /**
   * Runs the SAME goal as a continuing chain instead of a single search: Genesis
   * keeps asking its own next question — chosen from what the previous step left
   * open, never a hardcoded second goal — until it settles, gets blocked, runs out
   * of a runnable next question, or spends the step budget. No admission pre-check
   * here: `runMechanismResearchChain` already runs one internally, per step, and
   * reports a refusal as `terminalStatus: 'BLOCKED'` with the exact reason, the
   * same honest-refusal discipline `AdmissionRefusal`/`DiscoveryRefusal` already
   * render for the single-shot path above.
   */
  const runChain = (text: string, forCatalog: WorldLeverCatalog) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setChainRunning(true);
    setChainResult(null);
    setTimeout(() => {
      const result = runMechanismResearchChain({ shape: 'MECHANISM', goal: trimmed, catalog: forCatalog }, 4);
      setChainResult(result);
      setChainRunning(false);
    }, 0);
  };

  // DEMO MODE — runs exactly once per mount, through the same `run()` above, never a second
  // execution path. Deliberately an empty dependency array: `initialGoal` is a one-shot instruction
  // ("run this on arrival"), not a value this effect should re-fire for on every parent re-render.
  useEffect(() => {
    if (initialGoal && initialGoal.trim().length > 0) {
      setGoal(initialGoal);
      run(initialGoal, defaultCatalogId ?? catalogId);
    }
    // Runs once per mount only — see the doc above. Not exhaustive on `catalogId`/`run` on purpose.
  }, []);

  /** Re-runs a saved goal against the SAME catalog it originally ran in — the one seam again, not a
   * second copy of it — and switches the picker to match, so the result the user sees matches what ran. */
  const rerunSaved = (exp: SavedExperiment) => {
    const record = exp.worldDiscovery;
    if (!record) return;
    setCatalogId(record.catalogId);
    setGoal(record.goal);
    run(record.goal, record.catalogId);
  };

  /** On-demand only — never automatic — re-executes a saved run from its stored inputs and compares
   * fingerprints, exactly what `replaySavedWorldDiscoveryRun` was built to do standalone. */
  const verifyReplay = (exp: SavedExperiment) => {
    setReplayChecks((prev) => ({ ...prev, [exp.id]: replaySavedWorldDiscoveryRun(exp) }));
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  };

  const history = historyOpen ? listWorldDiscoveryHistory() : [];
  const viewing = viewingId ? getExperiment(viewingId) : undefined;
  const comparing = compareIds.length === 2 ? compareIds.map((id) => getExperiment(id)).filter((e): e is SavedExperiment => !!e) : [];

  return (
    <div className="gsc-panel wd-panel">
      <div className="gsc-panel-row">
        <span className="gx-status real">REAL</span>
        <span className="wd-title">AUTONOMOUS DISCOVERY</span>
      </div>
      <p className="gsc-caption">
        Give a scientific goal for this world. Genesis tests the mechanisms this world really has, one experiment
        at a time, and reports what survived and what it ruled out.
      </p>

      {/* FEEDBACK #1 — every real catalog Genesis declares, not just the flood city. Listed straight
          from WORLD_LEVER_CATALOGS so a new domain (like the chemistry kinetics one) is reachable the
          moment it is registered, with no second place to remember to update. */}
      <label className="wd-label" htmlFor="wd-catalog">World</label>
      <select
        id="wd-catalog"
        className="lg-obs-input"
        value={catalogId}
        onChange={(event) => setCatalogId(event.target.value)}
        disabled={state.kind === 'RUNNING'}
      >
        {Object.values(WORLD_LEVER_CATALOGS).map((c) => (
          <option key={c.catalogId} value={c.catalogId}>
            {catalogLabel(c)}
          </option>
        ))}
      </select>

      {/* What this world honestly is BEFORE anything runs — declaredAssumptions/notModelledFactors
          are not clutter to trim: without them the screen would claim more than the model can support. */}
      <section className="wd-section wd-world-about">
        <h4>About this world</h4>
        <p className="gsc-caption">
          Domain <code>{catalog.domainId}</code> on world <code>{catalog.worldId}</code>.
        </p>
        {catalog.declaredAssumptions.length > 0 && (
          <>
            <p className="gsc-caption wd-world-about-label">Declared assumptions:</p>
            <ul>
              {catalog.declaredAssumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        {catalog.notModelledFactors.length > 0 && (
          <>
            <p className="gsc-caption wd-world-about-label">Not modelled:</p>
            <ul>
              {catalog.notModelledFactors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* The Particle & Atomic Physics Laboratory's environments, shown only when the
          panel is already sitting on one of its worlds. Entering an environment just
          re-points the <select> above — there is no second loop behind this. */}
      <LabEnvironmentPicker
        catalogId={catalogId}
        onSelectCatalog={setCatalogId}
        disabled={state.kind === 'RUNNING'}
      />

      <form
        className="lg-obs-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(goal, catalogId);
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
        <button
          type="button"
          className="chip-btn"
          disabled={goal.trim().length === 0 || state.kind === 'RUNNING' || chainRunning}
          onClick={() => runChain(goal, catalog)}
          data-testid="wd-run-chain"
        >
          {chainRunning ? 'Genesis is continuing…' : 'Run as chain (Genesis picks what’s next)'}
        </button>
      </form>
      <p className="gsc-caption">
        A chain runs this goal, then lets Genesis choose its own next question from what that step left
        open — up to 4 steps — instead of stopping after one search.
      </p>

      {chainRunning && (
        <p className="wd-running" role="status">
          Running a continuing chain — each step is a real experiment, saved to Science Memory as it runs.
        </p>
      )}
      {chainResult && (
        <ResearchChainResultView result={chainResult} onView={(id) => setViewingId(id)} />
      )}

      {state.kind === 'RUNNING' && (
        <p className="wd-running" role="status">
          Running real experiments on this world — forking it, advancing each arm, and recording the result to
          Science Memory.
        </p>
      )}

      {state.kind === 'NOT_ADMITTED' && <AdmissionRefusal admission={state.admission} />}
      {state.kind === 'REFUSED' && <DiscoveryRefusal state={state} />}
      {state.kind === 'COMPLETE' && (
        <DiscoveryResultView
          goal={state.goal}
          catalog={catalog}
          result={state.result}
          memory={state.memory}
          evidence={state.evidence}
          replay={state.replay}
          intent={state.intent}
          report={state.report}
        />
      )}
      {state.kind === 'COMPARISON' && (
        <ActionComparisonResultView
          catalog={catalog}
          comparison={state.comparison}
          memory={state.memory}
          evidence={state.evidence}
          replay={state.replay}
        />
      )}

      {/* FEEDBACK #3 — every run is already saved to Science Memory with a full Evidence Bundle and a
          replay verdict; this is what makes both reachable from the panel instead of only from storage. */}
      <section className="wd-section wd-history">
        <button
          type="button"
          className="wd-history-toggle"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? 'Hide history' : 'Show history'}
        </button>
        {historyOpen && (
          <>
            {history.length === 0 ? (
              <p className="wd-none">No saved runs yet.</p>
            ) : (
              <ul className="wd-history-list">
                {history.map((exp) => {
                  const record = exp.worldDiscovery!;
                  const historyCatalog = resolveWorldLeverCatalog(record.catalogId);
                  const check = replayChecks[exp.id];
                  return (
                    <li key={exp.id} className="wd-history-row">
                      <div className="wd-history-meta">
                        <span className="gsc-caption">{new Date(exp.createdAt).toLocaleString()}</span>
                        <span className="gsc-caption">{historyCatalog ? catalogLabel(historyCatalog) : record.catalogId}</span>
                      </div>
                      <p className="wd-history-goal">“{record.goal}”</p>
                      <p className="gsc-caption">{historySummary(exp)}</p>
                      <div className="wd-history-actions">
                        <button type="button" className="chip-btn tiny" onClick={() => setViewingId(exp.id)}>
                          View
                        </button>
                        <button type="button" className="chip-btn tiny" onClick={() => rerunSaved(exp)} disabled={state.kind === 'RUNNING'}>
                          Re-run
                        </button>
                        <button type="button" className="chip-btn tiny" onClick={() => verifyReplay(exp)}>
                          Verify replay
                        </button>
                        <label className="wd-compare-check">
                          <input
                            type="checkbox"
                            checked={compareIds.includes(exp.id)}
                            onChange={() => toggleCompare(exp.id)}
                          />
                          Compare
                        </label>
                      </div>
                      {check && (
                        <p className="gsc-caption">
                          Re-executed just now: <b className={`wd-replay-${check.status}`}>{check.status}</b> — {check.reason}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {viewing && (
        <section className="wd-section wd-history-view">
          <div className="gsc-panel-row">
            <h4>Viewing saved run — {new Date(viewing.createdAt).toLocaleString()}</h4>
            <button type="button" className="chip-btn tiny" onClick={() => setViewingId(null)}>
              Close
            </button>
          </div>
          <SavedRunView experiment={viewing} />
        </section>
      )}

      {comparing.length === 2 && (
        <section className="wd-section wd-compare-view">
          <div className="gsc-panel-row">
            <h4>Comparing 2 saved runs</h4>
            <button type="button" className="chip-btn tiny" onClick={() => setCompareIds([])}>
              Close
            </button>
          </div>
          <div className="wd-compare-columns">
            {comparing.map((exp) => (
              <div key={exp.id} className="wd-compare-column">
                <p className="gsc-caption">{new Date(exp.createdAt).toLocaleString()}</p>
                <SavedRunView experiment={exp} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Renders a saved record by reading its own persisted `loopResult`/`comparisonResult` — never by
 * re-running anything. Regenerates `intent`/`report` for a hypothesis-loop record purely for the
 * machine-readable disclosure: both are pure, deterministic functions of the stored goal + catalog
 * (no physics, no world graph), the same class of derivation `summariseDiscovery` already does. */
function SavedRunView({ experiment }: { experiment: SavedExperiment }) {
  const record = experiment.worldDiscovery;
  if (!record) return <p className="wd-none">This saved experiment has no discovery record.</p>;
  const catalog = resolveWorldLeverCatalog(record.catalogId);

  if (record.resultKind === 'HYPOTHESIS_LOOP' && record.loopResult) {
    const intent = catalog ? parseWorldDiscoveryGoal(record.goal, catalog) : undefined;
    return (
      <DiscoveryResultView
        goal={record.goal}
        catalog={catalog}
        result={record.loopResult}
        memory={record.resumedFromMemory}
        evidence={record.evidence}
        replay={null}
        intent={intent}
        report={renderDiscoveryReport(record.loopResult)}
      />
    );
  }
  if (record.resultKind === 'ACTION_COMPARISON' && record.comparisonResult) {
    return (
      <ActionComparisonResultView
        catalog={catalog}
        comparison={record.comparisonResult}
        memory={null}
        evidence={record.evidence}
        replay={null}
      />
    );
  }
  return <p className="wd-none">Saved record is incomplete.</p>;
}

/**
 * ADMISSION refusal — Genesis declined BEFORE searching, because the question
 * classifies to a hazard/process with no solver behind it at all (NOT_MODELLED)
 * or names a model this runtime cannot execute (BLOCKED). Distinct from
 * `DiscoveryRefusal` below: that one already ran the catalog's own goal parser
 * and reports a mismatch against the SELECTED catalog's declared levers; this
 * one never reached the catalog at all — `admission.missing` is the capability
 * registry's own words for what Genesis would need, not a re-derived guess.
 */
function AdmissionRefusal({ admission }: { admission: Admission }) {
  return (
    <div className="wd-refusal" role="status">
      <p className="wd-refusal-head">Genesis did not search for this — the question was never admitted.</p>
      <p className="wd-refusal-why">{admission.why}</p>
      {admission.missing.length > 0 && (
        <p className="gsc-caption">Would need: {admission.missing.join('; ')}.</p>
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

/** Groups a flat trace into its rounds, in the order the loop actually produced them — no re-sorting,
 * no re-deriving which step belongs where; `DiscoveryTraceStep.round`/`stepIndex` already say so. */
function groupTraceByRound(trace: readonly DiscoveryTraceStep[]): ReadonlyMap<number, readonly DiscoveryTraceStep[]> {
  const grouped = new Map<number, DiscoveryTraceStep[]>();
  for (const step of trace) {
    const bucket = grouped.get(step.round);
    if (bucket) bucket.push(step);
    else grouped.set(step.round, [step]);
  }
  return grouped;
}

/** A `Record<string, unknown>` shown compactly — the same key=value join `GenesisWorldScreen.tsx`
 * already uses for domain state, so an observation/verdict reads the same way everywhere in Genesis. */
function formatRecord(record: Record<string, unknown> | null): string {
  if (!record) return '(none)';
  const entries = Object.entries(record);
  if (entries.length === 0) return '(empty)';
  return entries.map(([key, value]) => `${key}=${typeof value === 'number' ? value.toFixed(4) : JSON.stringify(value)}`).join(' · ');
}

/**
 * FEEDBACK #2 — the loop's own per-step record (`DiscoveryLoopResult.trace`), rendered round by
 * round: why this step ran, what it did, which tool, what it observed, and the falsification
 * verdict it reached — the exact vocabulary the engine already produces, previously reachable only
 * inside the raw JSON dump. This computes nothing: every field is read straight off the trace.
 */
function DiscoveryTraceView({ trace }: { trace: readonly DiscoveryTraceStep[] }) {
  if (trace.length === 0) return null;
  const rounds = groupTraceByRound(trace);
  return (
    <section className="wd-section wd-trace">
      <h4>Step by step</h4>
      {[...rounds.entries()].map(([round, steps]) => (
        <div key={round} className="wd-trace-round">
          <p className="wd-trace-round-label">Round {round}</p>
          {steps.map((step) => (
            <div key={step.stepIndex} className="wd-trace-step">
              <p className="wd-trace-why">{step.why}</p>
              <p className="wd-trace-what">
                {step.what} — <code>{step.tool}</code>
              </p>
              <p className="gsc-caption">observation: {formatRecord(step.observation)}</p>
              <p className="gsc-caption">verdict: {formatRecord(step.falsificationVerdict)}</p>
              {step.branchId && (
                <p className="gsc-caption">
                  branch: <code>{step.branchId}</code>
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

interface DiscoveryResultViewProps {
  goal: string;
  catalog: WorldLeverCatalog | undefined;
  result: DiscoveryLoopResult;
  memory: WorldDiscoveryMemoryUse | null;
  evidence: WorldDiscoveryEvidenceSummary | null;
  replay: SavedWorldDiscoveryReplay | null;
  intent?: WorldGoalIntent;
  report?: string;
}

function DiscoveryResultView({ catalog, result, memory, evidence, replay, intent, report }: DiscoveryResultViewProps) {
  return (
    <div className="wd-result">
      {/* FEEDBACK #1 — which world this actually ran in, stated plainly next to the answer, not just
          selectable before running. */}
      {catalog && (
        <p className="gsc-caption">
          Ran in world <code>{catalog.worldId}</code> ({catalog.domainId}).
        </p>
      )}
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

      <DiscoveryTraceView trace={result.trace} />

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

      <MemoryAndEvidenceFooter memory={memory} evidence={evidence} replay={replay} />

      <details className="wd-machine">
        <summary>Machine-readable record</summary>
        {report !== undefined && <pre className="wd-pre">{report}</pre>}
        <pre className="wd-pre">{JSON.stringify({ intent, result }, null, 2)}</pre>
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
 * `replay` is null when viewing a saved record without an on-demand replay
 * check yet (see the history list's own "Verify replay" button) — that is
 * shown as its own honest state, never silently hidden.
 */
function MemoryAndEvidenceFooter({
  memory,
  evidence,
  replay,
}: {
  memory: WorldDiscoveryMemoryUse | null;
  evidence: WorldDiscoveryEvidenceSummary | null;
  replay: SavedWorldDiscoveryReplay | null;
}) {
  return (
    <section className="wd-section wd-memory">
      <h4>Memory &amp; replay</h4>
      <p className="gsc-caption">
        {memory ? memory.reason : 'No earlier run for this objective — starting fresh.'}
      </p>
      {evidence ? (
        <p className="gsc-caption">
          Evidence Bundle <code>{evidence.bundleId}</code>: own replay <b>{evidence.replayVerdict}</b>.
        </p>
      ) : (
        <p className="gsc-caption">No Evidence Bundle recorded for this run.</p>
      )}
      {replay ? (
        <p className="gsc-caption">
          Saved run re-executed and verified: <b className={`wd-replay-${replay.status}`}>{replay.status}</b> — {replay.reason}
        </p>
      ) : (
        <p className="gsc-caption">Not re-verified since it was saved — use “Verify replay” in History to check now.</p>
      )}
    </section>
  );
}

/**
 * Renders a completed `MechanismResearchChainResult` step by step: which
 * question ran, whether it was the caller's own (step 1) or Genesis's own
 * choice, why, and how it ended. Computes nothing — `terminalStatus`/
 * `stoppedBecause`/`why` are read verbatim from the chain, the same
 * discipline `DiscoveryResultView` already holds for a single search.
 * "View" opens a step's own saved record through the SAME history-viewer
 * (`viewingId`/`SavedRunView`) the panel's history list already uses below
 * — not a second record viewer for chain steps specifically.
 */
function ResearchChainResultView({
  result,
  onView,
}: {
  result: MechanismResearchChainResult;
  onView: (savedExperimentId: string) => void;
}) {
  return (
    <div className="wd-result wd-chain-result" data-testid="wd-chain-result">
      <p className="wd-summary">
        {result.selfChosenSteps} of {result.steps.length} step(s) chosen by Genesis itself — stopped as{' '}
        <b className={`wd-verdict wd-${result.terminalStatus}`}>{result.terminalStatus}</b>.
      </p>
      <ol className="wd-rounds">
        {result.steps.map((step) => {
          const savedId = step.remembered.savedExperimentId;
          return (
            <li key={step.step}>
              <b>Step {step.step}</b> ({step.kind}) — “{step.question}”
              <span className="gsc-caption wd-reason"> {step.why}</span>
              <span className="wd-effect">
                {step.outcome.status === 'RAN' ? ' ran.' : ` refused: ${step.outcome.admission.why}`}
              </span>
              {savedId && (
                <button type="button" className="chip-btn tiny" onClick={() => onView(savedId)}>
                  View this step
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="gsc-caption">Stopped because: {result.stoppedBecause}</p>
      <details className="wd-machine">
        <summary>Machine-readable record</summary>
        <pre className="wd-pre">{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
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
function ActionComparisonResultView({
  catalog,
  comparison,
  memory,
  evidence,
  replay,
}: {
  catalog: WorldLeverCatalog | undefined;
  comparison: CrossActionComparison;
  memory: WorldDiscoveryMemoryUse | null;
  evidence: WorldDiscoveryEvidenceSummary | null;
  replay: SavedWorldDiscoveryReplay | null;
}) {
  const ranked = comparison.status === 'RANKED' || comparison.status === 'TIED';
  return (
    <div className="wd-result">
      {catalog && (
        <p className="gsc-caption">
          Ran in world <code>{catalog.worldId}</code> ({catalog.domainId}).
        </p>
      )}
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
