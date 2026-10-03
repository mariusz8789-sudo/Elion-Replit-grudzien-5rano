import { useEffect, useMemo, useState } from 'react';
import type { SimParams } from '../../core/types';
import {
  SCENARIOS,
  type ScenarioId,
} from '../../core/simulation/scenarioEngine';
import {
  buildSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  temporalDecisionLineage,
  type TemporalMultiverse,
  type TemporalMultiverseBranchReplay,
} from '../../core/simulation/temporalMultiverse';
import {
  COMMAND_CENTER_BASELINE_SCENARIO_ID,
  openTemporalMultiverseBranchInWorld,
  runTemporalMultiverseCommandCenter,
} from '../../core/simulation/scenarioCommandCenter';
import { temporalStateAt } from '../../core/simulation/temporalState';
import { GOVERNED_PREPAREDNESS_QUESTIONS, resolvePreparednessQuestion } from '../../core/simulation/preparednessQuestions';
import { buildMultiverseBranchEvidencePack, proposeNextMultiverseExperiment, type NextMultiverseExperiment } from '../../core/experimentFabric/multiverseEvidence';
import type { CounterfactualEvidenceResult } from '../../core/experimentFabric/counterfactualEvidence';
import { serializeEvidencePackRoCrate, verifyEvidencePackRoCrateRoundTrip, type RoCrateRoundTripResult } from '../../core/experimentFabric/evidencePackRoCrate';
import { useLocale } from '../../core/i18n';
import { mvCode, mvText } from './multiverseEvidenceText';

/** Questions whose reference world is the one this panel uses as WORLD A. */
const PANEL_QUESTIONS = GOVERNED_PREPAREDNESS_QUESTIONS.filter((question) => question.baselineScenarioId === COMMAND_CENTER_BASELINE_SCENARIO_ID);

interface BranchEvidenceView {
  branchId: string;
  evidence: CounterfactualEvidenceResult;
  roundTrip: RoCrateRoundTripResult | null;
  next: NextMultiverseExperiment;
}

function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const DEFAULT_BRANCHES: ScenarioId[] = ['ISOLATION', 'CONTACT_REDUCTION', 'HEALTHCARE_EXPANSION'];
const WORLD_IDS = ['A', 'B', 'C', 'D'] as const;
type WorldId = (typeof WORLD_IDS)[number];

function worldStateAt(multiverse: TemporalMultiverse, worldId: WorldId, day: number) {
  const timeline = worldId === 'A'
    ? multiverse.baselineTimeline
    : multiverse.branches.find((branch) => branch.branchId === worldId)?.timeline ?? null;
  if (!timeline) return null;
  return temporalStateAt(timeline, day);
}

function worldReadout(multiverse: TemporalMultiverse, worldId: WorldId, day: number): string {
  const state = worldStateAt(multiverse, worldId, day);
  if (!state) return 'NOT_MODELED';
  if (!state.sample && state.logicalDay === 0) return 'INITIAL INPUT · DAY 0';
  if (!state.sample) return `${state.observationStatus} · DAY ${state.logicalDay}`;
  return `I ${state.sample.infectious} · hosp. ${state.sample.hospitalized} · D ${state.sample.deceased}`;
}

function replayLabel(replay: TemporalMultiverseBranchReplay | undefined): string {
  return replay ? `${replay.branchId} · ${replay.status}` : 'NOT_AVAILABLE';
}

export function TemporalMultiversePanel({ params, temporalDay = null }: { params: SimParams; temporalDay?: number | null }) {
  const [branchScenarioIds, setBranchScenarioIds] = useState<ScenarioId[]>(DEFAULT_BRANCHES);
  const [multiverse, setMultiverse] = useState<TemporalMultiverse | null>(null);
  const [timelineDay, setTimelineDay] = useState(0);
  const [selectedWorld, setSelectedWorld] = useState<WorldId>('B');
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState<ReturnType<typeof replaySavedTemporalMultiverse> | null>(null);
  const [questionId, setQuestionId] = useState('');
  const [branchEvidence, setBranchEvidence] = useState<BranchEvidenceView | null>(null);
  const locale = useLocale();

  const availableScenarios = useMemo(() => Object.values(SCENARIOS).filter((scenario) => scenario.id !== 'BASELINE'), []);
  const maxDay = multiverse ? Math.max(0, multiverse.baselineTimeline.days) : 0;

  useEffect(() => {
    if (!playing || !multiverse || maxDay <= 0) return undefined;
    const timer = window.setInterval(() => {
      setTimelineDay((current) => {
        if (current >= maxDay) {
          setPlaying(false);
          return 0;
        }
        return current + 1;
      });
    }, 180);
    return () => window.clearInterval(timer);
  }, [playing, multiverse, maxDay]);

  const execute = () => {
    // Pre-registration: the chosen question is fixed BEFORE anything runs.
    const question = PANEL_QUESTIONS.find((entry) => entry.questionId === questionId);
    const resolution = question ? resolvePreparednessQuestion(question.question, question.questionId) : null;
    const next = runTemporalMultiverseCommandCenter(branchScenarioIds, params, {
      branchInterventionStartDay: temporalDay ?? 0,
      ...(resolution?.status === 'GOVERNED' && resolution.question
        ? { preparedness: { questionId: resolution.question.questionId, askedText: resolution.askedText, resolutionFingerprint: resolution.resolutionFingerprint } }
        : {}),
    });
    setBranchEvidence(null);
    setMultiverse(next);
    setTimelineDay(0);
    setSelectedWorld('B');
    setReplay(null);
    setPlaying(false);
  };

  const verify = () => {
    if (!multiverse) return;
    setReplay(replaySavedTemporalMultiverse(buildSavedTemporalMultiverse(multiverse)));
  };

  const buildBranchEvidence = () => {
    if (!multiverse || selectedWorld === 'A') return;
    const evidence = buildMultiverseBranchEvidencePack(multiverse, selectedWorld);
    const roundTrip = evidence.pack ? verifyEvidencePackRoCrateRoundTrip(evidence.pack) : null;
    setBranchEvidence({ branchId: selectedWorld, evidence, roundTrip, next: proposeNextMultiverseExperiment(multiverse, selectedWorld) });
  };

  const selectedLineage = multiverse && selectedWorld !== 'A'
    ? temporalDecisionLineage(multiverse).find((entry) => entry.branchId === selectedWorld) ?? null
    : null;
  const shownEvidence = branchEvidence && branchEvidence.branchId === selectedWorld ? branchEvidence : null;

  const selectedDivergence = selectedWorld === 'A'
    ? null
    : multiverse?.branches.find((candidate) => candidate.branchId === selectedWorld)?.firstDivergentDayFromBaseline ?? null;

  const jumpToDivergence = () => {
    if (selectedDivergence === null) return;
    setTimelineDay(selectedDivergence);
    setPlaying(false);
  };

  const playFromDivergence = () => {
    if (selectedDivergence === null) return;
    setTimelineDay(selectedDivergence);
    setPlaying(true);
  };

  const openSelectedWorld = () => {
    if (!multiverse || selectedWorld === 'A') return;
    const handoffRunId = openTemporalMultiverseBranchInWorld(multiverse, selectedWorld);
    if (handoffRunId) window.location.hash = '#/city3d';
  };

  return <div className="world-panel scenario-command-panel temporal-multiverse-panel" aria-label="Temporal Multiverse World A B C D">
    <div className="world-panel-heading"><span>WHAT IF? · MULTIVERSE</span><small>existing temporal core</small></div>
    <p className="scenario-rationale">Wspólny T0, prawdziwe przebiegi A/B/C/D. Każda różnica pochodzi z istniejącego Scenario Engine.</p>
    <div className="scenario-selector temporal-multiverse-selectors">
      {branchScenarioIds.map((scenarioId, index) => (
        <label key={WORLD_IDS[index + 1]}>WORLD {WORLD_IDS[index + 1]}
          <select value={scenarioId} onChange={(event) => {
            const value = event.target.value as ScenarioId;
            setBranchScenarioIds((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
            setMultiverse(null);
            setReplay(null);
          }} aria-label={`Scenariusz WORLD ${WORLD_IDS[index + 1]}`}>
            {availableScenarios.map((scenario) => <option key={scenario.id} value={scenario.id} disabled={branchScenarioIds.some((entry, entryIndex) => entry === scenario.id && entryIndex !== index)}>{scenario.label}{scenario.notModeledReason ? ' — NOT_MODELED' : ''}</option>)}
          </select>
        </label>
      ))}
    </div>
    <label className="temporal-question-select">{mvText('questionLabel', locale)}
      <select value={questionId} onChange={(event) => { setQuestionId(event.target.value); setMultiverse(null); setReplay(null); setBranchEvidence(null); }}>
        <option value="">{mvText('questionNone', locale)}</option>
        {PANEL_QUESTIONS.map((question) => <option key={question.questionId} value={question.questionId}>{question.question}</option>)}
      </select>
      <small>{mvText('questionHint', locale)}</small>
    </label>
    <button className="world-action accent scenario-run-button" onClick={execute}>▶ {temporalDay === null ? 'Utwórz WORLD A / B / C / D' : `WHAT IF? · od dnia ${temporalDay}`}</button>

    {!multiverse && <p className="scenario-empty">NOT_AVAILABLE — wybierz interwencje i uruchom multiverse.</p>}
    {multiverse && <>
      <div className="scenario-result-heading"><span>WORLD A / B / C / D</span><small>SIMULATION · {multiverse.multiverseFingerprint.slice(0, 14)}… · wspólny T0</small></div>
      <div className="scenario-timeline temporal-multiverse-timeline">
        <div><span>PLAY ALL · OŚ WSPÓLNA</span><b>DAY 0 → DAY {maxDay}</b></div>
        <input type="range" min="0" max={maxDay} step="1" value={Math.min(timelineDay, maxDay)} onChange={(event) => { setTimelineDay(Number(event.target.value)); setPlaying(false); }} aria-label="Wspólny dzień multiverse" />
        <div className="temporal-multiverse-actions">
          <button className="world-action" onClick={() => setPlaying((value) => !value)}>{playing ? '⏸ Pauza' : '▶ PLAY ALL'}</button>
          <span>DAY {timelineDay}</span>
        </div>
      </div>
      <div className="temporal-multiverse-grid">
        {WORLD_IDS.map((worldId) => {
          const branch = worldId === 'A' ? null : multiverse.branches.find((candidate) => candidate.branchId === worldId) ?? null;
          const divergence = branch?.firstDivergentDayFromBaseline ?? null;
          const label = worldId === 'A' ? 'BASELINE' : branch ? SCENARIOS[branch.run.scenarioId].label : 'NOT_AVAILABLE';
          const status = worldId === 'A' ? multiverse.baseline.status : branch?.run.status ?? 'NOT_AVAILABLE';
          return <button type="button" key={worldId} className={`temporal-world-card ${selectedWorld === worldId ? 'selected' : ''}`} onClick={() => setSelectedWorld(worldId)} aria-pressed={selectedWorld === worldId}>
            <span className="scenario-branch-label">WORLD {worldId} · {label}</span>
            <strong>{status}</strong>
            <small>{worldReadout(multiverse, worldId, timelineDay)}</small>
            <em>{worldId === 'A' ? 'T0 reference' : divergence === null ? 'NO MEASURED DIVERGENCE' : `FIRST DIVERGENCE · DAY ${divergence}`}</em>
          </button>;
        })}
      </div>
      <div className="section-label">COMPARE WORLDS · DAY {timelineDay}</div>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead><tr><th>Metric</th>{WORLD_IDS.map((worldId) => <th key={worldId}>WORLD {worldId}</th>)}</tr></thead>
          <tbody>
            {([
              ['Infectious', (sample: NonNullable<ReturnType<typeof worldStateAt>>['sample']) => sample?.infectious],
              ['Hospitalized', (sample: NonNullable<ReturnType<typeof worldStateAt>>['sample']) => sample?.hospitalized],
              ['Deceased', (sample: NonNullable<ReturnType<typeof worldStateAt>>['sample']) => sample?.deceased],
            ] as const).map(([label, readMetric]) => (
              <tr key={label}><td>{label}</td>{WORLD_IDS.map((worldId) => {
                const state = worldStateAt(multiverse, worldId, timelineDay);
                const value = state?.sample ? readMetric(state.sample) : undefined;
                return <td key={worldId}>{typeof value === 'number' ? value : 'NOT_AVAILABLE'}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="scenario-rationale">Porównanie pokazuje wyłącznie policzone metryki stanu modelu dla wspólnego dnia. To nie jest pomiar rzeczywistości, probability ani confidence.</p>
      <div className="temporal-multiverse-footer">
        <span>SELECTED · WORLD {selectedWorld}</span>
        {selectedWorld !== 'A' && <button className="world-action scenario-replay-button" onClick={jumpToDivergence} disabled={selectedDivergence === null}>↗ JUMP TO DIVERGENCE</button>}
        {selectedWorld !== 'A' && <button className="world-action scenario-replay-button" onClick={playFromDivergence} disabled={selectedDivergence === null}>▶ PLAY FROM HERE</button>}
        <button className="world-action scenario-replay-button" onClick={openSelectedWorld} disabled={selectedWorld === 'A'}>↗ OPEN IN WORLD/3D</button>
        <button className="world-action scenario-replay-button" onClick={verify}>✓ VERIFY · REPLAY</button>
      </div>
      {replay && <div className={`scenario-provenance ${replay.status === 'MATCH' ? 'scenario-replay-match' : 'scenario-replay-other'}`}>
        <b>VERIFY · {replay.status}</b>
        <p>{replay.reason}</p>
        <p>BASELINE {replay.baselineStatus ?? 'NOT_AVAILABLE'} · {replay.branches.map(replayLabel).join(' · ')}</p>
      </div>}
      <div className="temporal-branch-evidence" data-testid="multiverse-branch-evidence">
        <div className="section-label">{mvText('title', locale)} · WORLD {selectedWorld}</div>
        <span className="honesty theoretical">{mvText('demo', locale)}</span>
        {selectedWorld === 'A' || !selectedLineage ? <p className="scenario-rationale">{mvText('selectWorld', locale)}</p> : <>
          <p className="scenario-rationale">
            {mvText('decision', locale)} {selectedLineage.declaredInterventionStartDay} · {selectedLineage.firstDivergentDayFromBaseline === null ? mvText('noDivergence', locale) : `${mvText('diverged', locale)} ${selectedLineage.firstDivergentDayFromBaseline}`}
          </p>
          <button className="world-action scenario-replay-button" onClick={buildBranchEvidence}>{mvText('build', locale)}</button>
          {shownEvidence && <div className={`scenario-provenance ${shownEvidence.evidence.status === 'CREATED' ? 'scenario-replay-match' : 'scenario-replay-other'}`}>
            <b>{mvCode(shownEvidence.evidence.status, locale)}</b>
            {shownEvidence.roundTrip && <p>{mvText('roundTrip', locale)}: {mvCode(shownEvidence.roundTrip.status, locale)}</p>}
            <p>{mvText('next', locale)}: {shownEvidence.next.status === 'READY_TO_RUN' && shownEvidence.next.proposal ? shownEvidence.next.proposal.action : mvText('nextNone', locale)}</p>
            {shownEvidence.evidence.pack && <button className="world-action scenario-replay-button" onClick={() => downloadJson(`${shownEvidence.evidence.pack!.evidencePackId}.ro-crate.json`, serializeEvidencePackRoCrate(shownEvidence.evidence.pack!))}>⬇ {mvText('download', locale)}</button>}
            <details>
              <summary>{mvText('details', locale)}</summary>
              <p>{shownEvidence.evidence.status} · {shownEvidence.evidence.reason}</p>
              {shownEvidence.roundTrip && <p>RO-Crate {shownEvidence.roundTrip.status} · {shownEvidence.roundTrip.reason}</p>}
              <p>{shownEvidence.next.status} · {shownEvidence.next.reason}</p>
            </details>
          </div>}
        </>}
      </div>
    </>}
  </div>;
}

export default TemporalMultiversePanel;
