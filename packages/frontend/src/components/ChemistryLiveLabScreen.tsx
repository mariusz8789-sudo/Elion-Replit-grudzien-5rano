import { useEffect, useMemo, useState } from 'react';
import type { ExperimentDef, SimParams } from '../core/types';
import type { ScientificExecutionEvent } from '../core/backend/client';
import { useSimLoop } from '../core/useSimLoop';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { defaultParams } from './Controls';
import { chemistryLab } from '../labs/chemistry';
import { chemistryTitration } from '../labs/experiments/chemistry-titration';
import { chemistryVsepr } from '../labs/experiments/chemistry-vsepr';
import type { ReplayVerdict } from '../core/scientificWorlds/experimentSession';
import {
  CHEMISTRY_EDUCATION_EXPERIMENTS,
  CHEMISTRY_PERIODIC_TABLE,
  CHEMISTRY_PRESENTATION_LEVELS,
  EDUCATIONAL_PROCEDURE_LABEL,
  STAGE_DWELL_MS,
  chemistryEducationExperimentById,
  planChemistryExperiment,
  presentChemistryRun,
  replayComputationalRun,
  replayEducationalRun,
  routeChemistryPrompt,
  runComputationalExperiment,
  runEducationalExperiment,
  type ChemistryElementView,
  type ChemistryExperimentId,
  type ChemistryParams,
  type ChemistryPresentationLevel,
  type ChemistryRun,
  type ChemistryStage,
  type ChemistryVisualBinding,
} from '../core/chemistryEducation';
import './chemistryLiveLab.css';

/**
 * CHEMISTRY LIVE LAB — the learner-facing screen of the chemistry education
 * layer (core/chemistryEducation). It owns presentation only: plans come from
 * the governed planner, numbers from canonical models, scenes from the
 * existing Chemistry Lab experiments (labs/*: createSim / createSim3D), live
 * progress of computational runs from real backend execution events.
 */

const LEVEL_LABEL: Readonly<Record<ChemistryPresentationLevel, string>> = { SCHOOL: 'Szkoła', UNIVERSITY: 'Studia', RESEARCH: 'Badania' };
const STATUS_LABEL: Readonly<Record<string, string>> = {
  READY: 'Gotowe do uruchomienia',
  REQUIRES_TEACHER_REVIEW: 'Wymaga potwierdzenia nauczyciela',
  BLOCKED_HAZARDOUS: 'Zablokowane — substancja/reakcja niebezpieczna',
  UNSUPPORTED_REACTION_MODEL: 'Brak zweryfikowanego modelu reakcji',
  UNKNOWN_EXPERIMENT: 'Nieznany eksperyment',
  BLOCKED_MISSING_DATA: 'Brak danych źródłowych',
  BLOCKED_INVALID_PARAMETERS: 'Nieprawidłowe parametry',
  BLOCKED_PHYSICAL_ACTUATION: 'Zablokowane — krok fizyczny',
};
const ORIGIN_LABEL: Readonly<Record<string, string>> = {
  MODEL_COMPUTED: 'obliczone przez model',
  CANONICAL_DATASET: 'dane tablicowe',
  BACKEND_ENGINE_OUTPUT: 'wynik silnika backendu',
};

function visualDef(binding: ChemistryVisualBinding): ExperimentDef | null {
  if (binding.experimentId === 'titration') return chemistryTitration;
  if (binding.experimentId === 'chemistry-vsepr') return chemistryVsepr;
  return chemistryLab.experiments?.find((e) => e.id === binding.experimentId) ?? null;
}

function Stage2D({ def, params }: { def: ExperimentDef; params: SimParams }) {
  const sim = useMemo(() => def.createSim!(), [def]);
  const canvasRef = useSimLoop(sim, params, true);
  return <canvas ref={canvasRef} className="cll-canvas" role="img" aria-label={`Scena modelu: ${def.name}`} data-testid="chem-visual-canvas" />;
}

function Stage3D({ def, params }: { def: ExperimentDef; params: SimParams }) {
  const sim = useMemo(() => def.createSim3D!(), [def]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);
  return (
    <>
      <canvas ref={canvasRef} className="cll-canvas" role="img" aria-label={`Scena 3D modelu: ${def.name}`} data-testid="chem-visual-canvas" />
      {loading && !failed && <div className="cll-stage-note">Ładowanie sceny 3D…</div>}
      {failed && <div className="cll-stage-note">WebGL niedostępny — wyniki modelu obok pozostają kompletne.</div>}
    </>
  );
}

/**
 * The existing Chemistry Lab scene, driven by the current stage's model parameters. Inside the main
 * Laboratory the 3D scene IS the laboratory, so the panel draws the 2D model view and never opens a
 * second WebGL context.
 */
function LabVisual({ binding, stageParams, flat }: { binding: ChemistryVisualBinding; stageParams: SimParams | undefined; flat: boolean }) {
  const def = visualDef(binding);
  const params = useMemo(() => (def ? { ...defaultParams(def.params), ...(stageParams ?? {}) } : {}), [def, stageParams]);
  if (!def || (flat && !def.createSim)) return null;
  return (
    <div className="cll-stage" data-testid="chem-visual">
      {def.createSim3D && !flat ? <Stage3D def={def} params={params} /> : <Stage2D def={def} params={params} />}
      <div className="cll-stage-badge">Scena z Chemistry Lab · parametry z bieżącego etapu</div>
    </div>
  );
}

function PeriodicTable({ selected, onSelect }: { selected: string | null; onSelect: (e: ChemistryElementView) => void }) {
  return (
    <div className="cll-ptable-scroll">
      <div className="cll-ptable" data-testid="chem-periodic-table" role="grid" aria-label="Układ okresowy — 118 pierwiastków">
        {CHEMISTRY_PERIODIC_TABLE.map((e) => (
          <button
            key={e.symbol}
            type="button"
            className={`cll-el cll-el-${e.block.toLowerCase()}${selected === e.symbol ? ' is-selected' : ''}`}
            style={{ gridColumn: e.gridColumn, gridRow: e.gridRow >= 8 ? e.gridRow + 1 : e.gridRow }}
            onClick={() => onSelect(e)}
            data-testid={`chem-element-${e.symbol}`}
            aria-pressed={selected === e.symbol}
            title={`${e.atomicNumber} ${e.name}`}
          >
            <span className="cll-el-z">{e.atomicNumber}</span>
            <span className="cll-el-sym">{e.symbol}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ElementCard({ element, onStructure, onBond }: { element: ChemistryElementView; onStructure: () => void; onBond: (slot: 'elementA' | 'elementB') => void }) {
  return (
    <div className="cll-card" data-testid="chem-element-card">
      <div className="cll-element-head">
        <span className="cll-element-sym">{element.symbol}</span>
        <div>
          <strong>{element.name}</strong>
          <div className="cll-dim">Z = {element.atomicNumber} · masa atomowa {element.atomicMass.toLocaleString('pl-PL')} u</div>
        </div>
      </div>
      <dl className="cll-facts">
        <div><dt>Położenie</dt><dd>okres {element.period}{element.group !== null ? `, grupa ${element.group}` : `, blok f (${element.block === 'LANTHANIDE' ? 'lantanowce' : 'aktynowce'})`}</dd></div>
        <div><dt>Powłoki (Aufbau)</dt><dd>{element.shells.join(', ')}</dd></div>
        <div><dt>χ Paulinga</dt><dd>{element.paulingElectronegativity ?? 'brak ustalonej wartości'}</dd></div>
        <div><dt>I energia jonizacji</dt><dd>{element.firstIonizationKJ !== null ? `${element.firstIonizationKJ} kJ/mol` : 'brak w danych Genesis (Z ≤ 36)'}</dd></div>
      </dl>
      <div className="cll-actions">
        <button type="button" className="chip-btn primary" onClick={onStructure} data-testid="chem-element-structure">Eksperyment: budowa atomu</button>
        {element.paulingElectronegativity !== null && (
          <>
            <button type="button" className="chip-btn" onClick={() => onBond('elementA')}>Polarność: atom A</button>
            <button type="button" className="chip-btn" onClick={() => onBond('elementB')}>Polarność: atom B</button>
          </>
        )}
      </div>
    </div>
  );
}

function Quiz({ run, level }: { run: ChemistryRun; level: ChemistryPresentationLevel }) {
  const view = presentChemistryRun(run, level);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  if (view.quiz.length === 0) return null;
  return (
    <div className="cll-quiz" data-testid="chem-quiz">
      <h4>Sprawdź się</h4>
      {view.quiz.map((q) => {
        const picked = answers[q.id];
        return (
          <fieldset key={q.id} className="cll-quiz-q">
            <legend>{q.question}</legend>
            {q.options.map((option, i) => (
              <label key={option} className={picked === i ? (i === q.correctIndex ? 'is-right' : 'is-wrong') : ''}>
                <input type="radio" name={q.id} checked={picked === i} onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))} data-testid={`chem-quiz-${q.id}-${i}`} />
                {option}
              </label>
            ))}
            {picked !== undefined && (
              <p className="cll-quiz-feedback" data-testid={`chem-quiz-feedback-${q.id}`}>
                {picked === q.correctIndex ? 'Dobrze! ' : 'Nie tym razem. '}{q.explanation}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function ExecutionFeed({ events }: { events: readonly ScientificExecutionEvent[] }) {
  return (
    <ol className="cll-exec" data-testid="chem-exec-events" aria-live="polite">
      {events.map((e) => (
        <li key={e.id} className={`cll-exec-${e.status.toLowerCase()}`} data-event-type={e.type}>
          <code>{e.type}</code> <span>{e.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export interface ChemistryLiveLabProps {
  /** Rendered as the chemistry panel of the main Laboratory instead of a page of its own. */
  readonly embedded?: boolean;
  /**
   * Inside the Laboratory a titration also runs at the titration station (same shared runner), so the
   * agent, the 3D station and the sealed lab session show the same experiment the panel explains.
   */
  readonly onTitrationStart?: (acid: string) => void;
  readonly onClose?: () => void;
}

export function ChemistryLiveLabScreen({ embedded = false, onTitrationStart, onClose }: ChemistryLiveLabProps = {}) {
  const [level, setLevel] = useState<ChemistryPresentationLevel>('SCHOOL');
  const [prompt, setPrompt] = useState('');
  const [promptNote, setPromptNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [element, setElement] = useState<ChemistryElementView | null>(null);
  const [experimentId, setExperimentId] = useState<ChemistryExperimentId>('acid-base-titration');
  const [params, setParams] = useState<ChemistryParams>({});
  const [teacherApproved, setTeacherApproved] = useState(false);
  const [run, setRun] = useState<ChemistryRun | null>(null);
  const [liveEvents, setLiveEvents] = useState<ScientificExecutionEvent[]>([]);
  const [executing, setExecuting] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState<ReplayVerdict | null>(null);

  const plan = useMemo(() => planChemistryExperiment(experimentId, params, { teacherApproved }), [experimentId, params, teacherApproved]);
  const template = chemistryEducationExperimentById(experimentId)!;
  const stages: readonly ChemistryStage[] = run?.artifact?.stages ?? [];
  const lastIndex = stages.length - 1;
  const complete = stages.length > 0 && revealed >= lastIndex;

  // Deterministic educational playback. Computational runs are revealed only after real completion.
  useEffect(() => {
    if (!playing || revealed >= lastIndex || stages.length === 0) return;
    const timer = window.setTimeout(() => setRevealed((r) => Math.min(r + 1, lastIndex)), STAGE_DWELL_MS[stages[revealed].kind]);
    return () => window.clearTimeout(timer);
  }, [playing, revealed, lastIndex, stages]);
  useEffect(() => { if (complete) setPlaying(false); }, [complete]);

  const selectExperiment = (id: ChemistryExperimentId, next: ChemistryParams = {}) => {
    setExperimentId(id);
    setParams(next);
    setTeacherApproved(false);
    setRun(null);
    setLiveEvents([]);
    setReplay(null);
    setRevealed(0);
    setPlaying(false);
  };

  const submitPrompt = () => {
    const route = routeChemistryPrompt(prompt);
    if (route.status === 'ROUTED' && route.experimentId) {
      selectExperiment(route.experimentId, route.params ?? {});
      setPromptNote({ ok: true, text: route.reason });
    } else {
      setPromptNote({ ok: false, text: `${route.status}: ${route.reason}` });
    }
  };

  const start = async () => {
    if (plan.status !== 'READY' || !plan.template) return;
    if (experimentId === 'acid-base-titration') onTitrationStart?.(String(params.acid ?? plan.template.parameters.find((p) => p.key === 'acid')?.default ?? 'acetic'));
    setReplay(null);
    setRevealed(0);
    if (plan.template.liveKind === 'EDUCATIONAL_PROCEDURE_MODEL') {
      setRun(runEducationalExperiment(plan));
      setPlaying(true);
      return;
    }
    setRun(null);
    setLiveEvents([]);
    setExecuting(true);
    try {
      const result = await runComputationalExperiment(plan, { onEvent: (event) => setLiveEvents((events) => [...events, event]) });
      setRun(result);
      setRevealed(result.artifact ? result.artifact.stages.length - 1 : 0);
    } finally {
      setExecuting(false);
    }
  };

  const doReplay = () => {
    if (!run) return;
    setReplay(run.liveKind === 'EDUCATIONAL_PROCEDURE_MODEL' ? replayEducationalRun(run) : replayComputationalRun(run));
  };

  const shown = stages.slice(0, revealed + 1);
  const currentVisual = [...shown].reverse().find((s) => s.visualParams)?.visualParams;
  const latestObservation = [...shown].reverse().find((s) => s.observation);
  const presentation = run && complete ? presentChemistryRun(run, level) : null;
  const Root = embedded ? 'section' : 'main';

  return (
    <Root className={`cll${embedded ? ' cll-embedded' : ''}`} data-testid="chem-live-lab" data-embedded={embedded ? 'true' : 'false'} aria-label="Chemia — laboratorium na żywo">
      <header className="cll-header">
        <div>
          <p className="cll-eyebrow">Chemistry Live Lab{embedded ? ' · stanowisko chemii w Laboratorium' : ''}</p>
          {embedded ? <h2>Chemia na żywo</h2> : <h1>Laboratorium chemii na żywo</h1>}
          <p className="cll-dim">Wybierz pierwiastek lub eksperyment, zobacz plan, kontrolę bezpieczeństwa i kolejne etapy. Każda liczba pochodzi z istniejącego modelu Genesis.</p>
        </div>
        {embedded && onClose && <button type="button" className="chip-btn cll-close" onClick={onClose} aria-label="Zamknij panel chemii" data-testid="chem-close">×</button>}
        <div className="cll-levels" role="group" aria-label="Poziom wyjaśnienia">
          {CHEMISTRY_PRESENTATION_LEVELS.map((l) => (
            <button key={l} type="button" className={`chip-btn${level === l ? ' primary' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)} data-testid={`chem-level-${l}`}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
      </header>

      <section className="cll-card cll-prompt" aria-label="Zapytaj">
        <form onSubmit={(e) => { e.preventDefault(); submitPrompt(); }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="np. Pokaż miareczkowanie kwasu octowego NaOH" aria-label="Polecenie" data-testid="chem-prompt-input" />
          <button type="submit" className="chip-btn primary" data-testid="chem-prompt-submit">Zaplanuj</button>
        </form>
        {promptNote && <p className={promptNote.ok ? 'cll-ok' : 'cll-refuse'} data-testid="chem-prompt-result">{promptNote.text}</p>}
      </section>

      <div className="cll-grid">
        <section className="cll-col" aria-label="Pierwiastki i eksperymenty">
          <div className="cll-card">
            <h2>Układ okresowy <span className="cll-dim">({CHEMISTRY_PERIODIC_TABLE.length} pierwiastków)</span></h2>
            <PeriodicTable selected={element?.symbol ?? null} onSelect={setElement} />
          </div>
          {element && (
            <ElementCard
              element={element}
              onStructure={() => selectExperiment('element-structure', { symbol: element.symbol })}
              onBond={(slot) => selectExperiment('bond-polarity', { ...(experimentId === 'bond-polarity' ? params : {}), [slot]: element.symbol })}
            />
          )}
          <div className="cll-card">
            <h2>Eksperymenty</h2>
            <ul className="cll-catalog">
              {CHEMISTRY_EDUCATION_EXPERIMENTS.map((t) => (
                <li key={t.experimentId}>
                  <button type="button" className={`cll-exp${experimentId === t.experimentId ? ' is-active' : ''}`} onClick={() => selectExperiment(t.experimentId)} data-testid={`chem-experiment-${t.experimentId}`}>
                    <strong>{t.title}</strong>
                    <span className={`cll-kind cll-kind-${t.liveKind === 'COMPUTATIONAL_LIVE' ? 'comp' : 'edu'}`}>{t.liveKind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="cll-col" aria-label="Eksperyment">
          <div className="cll-card" data-testid="chem-plan">
            <h2>{template.title}</h2>
            <p className="cll-question">{template.question}</p>
            <div className="cll-params">
              {template.parameters.map((spec) => {
                const value = params[spec.key] ?? spec.default;
                return (
                  <label key={spec.key}>
                    <span>{spec.label}{spec.unit ? ` (${spec.unit})` : ''}</span>
                    {spec.options ? (
                      <select value={String(value)} onChange={(e) => { setParams({ ...params, [spec.key]: e.target.value }); setRun(null); }} data-testid={`chem-param-${spec.key}`}>
                        {spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input type="number" min={spec.min} max={spec.max} step={spec.step} value={Number(value)} onChange={(e) => { setParams({ ...params, [spec.key]: Number(e.target.value) }); setRun(null); }} data-testid={`chem-param-${spec.key}`} />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="cll-plan-row">
              <span className={`cll-status cll-status-${plan.status === 'READY' ? 'ok' : 'blocked'}`} data-testid="chem-plan-status" data-status={plan.status}>{STATUS_LABEL[plan.status] ?? plan.status}</span>
              {plan.safetyClass && <span className="cll-badge" data-testid="chem-safety-class">{plan.safetyClass}</span>}
              <span className="cll-badge">{template.liveKind}</span>
            </div>
            {plan.reason && <p className="cll-refuse" data-testid="chem-plan-reason">{plan.reason}</p>}
            {plan.status === 'BLOCKED_HAZARDOUS' && plan.conceptOnly && (
              <div className="cll-concept" data-testid="chem-concept-only">
                <strong>Tylko pojęcie (bez procedury):</strong> <code>{plan.conceptOnly.equation}</code>
                <p>{plan.conceptOnly.explanation}</p>
              </div>
            )}
            {plan.safetyClass === 'TEACHER_REVIEW' && (
              <label className="cll-teacher">
                <input type="checkbox" checked={teacherApproved} onChange={(e) => setTeacherApproved(e.target.checked)} data-testid="chem-teacher-approve" />
                Jestem nauczycielem i zatwierdzam tę lekcję modelową.
              </label>
            )}
            <button type="button" className="chip-btn primary cll-start" disabled={plan.status !== 'READY' || executing} onClick={() => void start()} data-testid="chem-start">
              {executing ? 'Silnik backendu liczy…' : 'Start eksperymentu'}
            </button>
          </div>

          {(run || executing || liveEvents.length > 0) && (
            <div className="cll-card cll-live" data-testid="chem-live">
              {run?.liveKind === 'EDUCATIONAL_PROCEDURE_MODEL' ? (
                <p className="cll-epistemic cll-epistemic-edu" data-testid="chem-epistemic-label">{EDUCATIONAL_PROCEDURE_LABEL}</p>
              ) : (
                <p className="cll-epistemic cll-epistemic-comp" data-testid="chem-epistemic-label">COMPUTATIONAL_LIVE — postęp to prawdziwe zdarzenia wykonania silnika backendu</p>
              )}

              {template.liveKind === 'COMPUTATIONAL_LIVE' && <ExecutionFeed events={run?.liveKind === 'COMPUTATIONAL_LIVE' ? run.events : liveEvents} />}
              {run?.liveKind === 'COMPUTATIONAL_LIVE' && run.status !== 'COMPLETED' && (
                <p className="cll-refuse" data-testid="chem-exec-failure">Wykonanie {run.status}: {run.failureReason}. Brak wyniku — nic nie zostało dopowiedziane lokalnie.</p>
              )}

              {template.visual && stages.length > 0 && <LabVisual binding={template.visual} stageParams={currentVisual} flat={embedded} />}

              {stages.length > 0 && (
                <>
                  <div className="cll-controls">
                    {run?.liveKind === 'EDUCATIONAL_PROCEDURE_MODEL' && (
                      <>
                        <button type="button" className="chip-btn" onClick={() => setPlaying((p) => !p)} disabled={complete} data-testid="chem-play">{playing ? 'Pauza' : 'Odtwarzaj'}</button>
                        <button type="button" className="chip-btn" onClick={() => setRevealed((r) => Math.min(r + 1, lastIndex))} disabled={complete} data-testid="chem-next">Następny etap</button>
                        <button type="button" className="chip-btn" onClick={() => { setPlaying(false); setRevealed(lastIndex); }} disabled={complete} data-testid="chem-finish">Do końca</button>
                      </>
                    )}
                    <span className="cll-dim" data-testid="chem-progress">Etap {Math.min(revealed + 1, stages.length)} / {stages.length}</span>
                  </div>
                  <ol className="cll-stages">
                    {stages.map((s, i) => (
                      <li key={s.stageId} data-testid={`chem-stage-${s.stageId}`} data-kind={s.kind} data-state={i < revealed ? 'done' : i === revealed ? 'current' : 'pending'} className={`cll-stage-item is-${i < revealed ? 'done' : i === revealed ? 'current' : 'pending'}`}>
                        <span className="cll-stage-kind">{s.kind}</span>
                        <span className="cll-stage-label">{s.label}</span>
                        {i <= revealed && <span className="cll-stage-detail">{s.detail}</span>}
                      </li>
                    ))}
                  </ol>
                  {latestObservation?.observation && (
                    <div className="cll-observation" data-testid="chem-observation">
                      <span className="cll-dim">{latestObservation.observation.label}</span>
                      <strong>{String(latestObservation.observation.value)}{latestObservation.observation.unit ? ` ${latestObservation.observation.unit}` : ''}</strong>
                      <span className="cll-origin">{ORIGIN_LABEL[latestObservation.observation.origin]}</span>
                    </div>
                  )}
                </>
              )}

              {(run?.artifact?.equation ?? template.equation) && (
                <p className="cll-equation" data-testid="chem-equation"><span className="cll-dim">Równanie / model:</span> <code>{run?.artifact?.equation ?? template.equation}</code></p>
              )}

              {presentation && run && (
                <div className="cll-result" data-testid="chem-result">
                  <h3>Wynik</h3>
                  <p className="cll-summary" data-testid="chem-result-summary">{presentation.resultSummary}</p>
                  <p className="cll-dim" data-testid="chem-result-level">Poziom: {LEVEL_LABEL[level]} · {presentation.epistemicLabel}</p>
                  <div className="cll-sections" data-testid="chem-presentation" data-level={level} data-content-hash={presentation.sessionContentHash}>
                    {presentation.sections.map((s) => (
                      <div key={s.id} className="cll-section" data-testid={`chem-section-${s.id}`}>
                        <h4>{s.title}</h4>
                        <p>{s.body}</p>
                      </div>
                    ))}
                  </div>
                  <Quiz key={`${run.session?.contentHash}-${level}`} run={run} level={level} />
                  <div className="cll-proof">
                    <p data-testid="chem-evidence"><strong>Evidence:</strong> {run.evidence.code} — {run.evidence.reason}</p>
                    <button type="button" className="chip-btn" onClick={doReplay} data-testid="chem-replay">Replay (ponowne wykonanie modelu)</button>
                    {replay && <p className={replay.status === 'MATCH' ? 'cll-ok' : 'cll-refuse'} data-testid="chem-replay-status" data-status={replay.status}>REPLAY_{replay.status}: {replay.message}</p>}
                  </div>
                  <details className="cll-limits">
                    <summary>Ograniczenia modelu</summary>
                    <ul data-testid="chem-limitations">{template.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
                  </details>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Root>
  );
}

export default ChemistryLiveLabScreen;
