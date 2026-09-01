import { useEffect, useMemo, useState } from 'react';
import type { SimParams } from '../../core/types';
import {
  SCENARIOS,
  type ScenarioId,
} from '../../core/simulation/scenarioEngine';
import {
  buildSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  type TemporalMultiverse,
  type TemporalMultiverseBranchReplay,
} from '../../core/simulation/temporalMultiverse';
import {
  openTemporalMultiverseBranchInWorld,
  runTemporalMultiverseCommandCenter,
} from '../../core/simulation/scenarioCommandCenter';
import { temporalStateAt } from '../../core/simulation/temporalState';

const DEFAULT_BRANCHES: ScenarioId[] = ['ISOLATION', 'CONTACT_REDUCTION', 'HEALTHCARE_EXPANSION'];
const WORLD_IDS = ['A', 'B', 'C', 'D'] as const;
type WorldId = (typeof WORLD_IDS)[number];

function worldReadout(multiverse: TemporalMultiverse, worldId: WorldId, day: number): string {
  const timeline = worldId === 'A'
    ? multiverse.baselineTimeline
    : multiverse.branches.find((branch) => branch.branchId === worldId)?.timeline ?? null;
  if (!timeline) return 'NOT_MODELED';
  const state = temporalStateAt(timeline, day);
  if (!state) return 'NOT_AVAILABLE';
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
    const next = runTemporalMultiverseCommandCenter(branchScenarioIds, params, {
      branchInterventionStartDay: temporalDay ?? 0,
    });
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
      <div className="temporal-multiverse-footer">
        <span>SELECTED · WORLD {selectedWorld}</span>
        {selectedWorld !== 'A' && <button className="world-action scenario-replay-button" onClick={() => {
          if (multiverse) {
            const branch = multiverse.branches.find((candidate) => candidate.branchId === selectedWorld);
            if (branch?.firstDivergentDayFromBaseline !== null && branch?.firstDivergentDayFromBaseline !== undefined) setTimelineDay(branch.firstDivergentDayFromBaseline);
          }
        }}>↗ JUMP TO DIVERGENCE</button>}
        <button className="world-action scenario-replay-button" onClick={openSelectedWorld} disabled={selectedWorld === 'A'}>↗ OPEN IN WORLD/3D</button>
        <button className="world-action scenario-replay-button" onClick={verify}>✓ VERIFY · REPLAY</button>
      </div>
      {replay && <div className={`scenario-provenance ${replay.status === 'MATCH' ? 'scenario-replay-match' : 'scenario-replay-other'}`}>
        <b>VERIFY · {replay.status}</b>
        <p>{replay.reason}</p>
        <p>BASELINE {replay.baselineStatus ?? 'NOT_AVAILABLE'} · {replay.branches.map(replayLabel).join(' · ')}</p>
      </div>}
    </>}
  </div>;
}

export default TemporalMultiversePanel;
