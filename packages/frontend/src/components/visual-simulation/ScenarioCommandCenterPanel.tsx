import { useMemo, useState } from 'react';
import type { SimParams } from '../../core/types';
import {
  SCENARIOS,
  type ScenarioDaySample,
  type ScenarioId,
  type ScenarioReplay,
  type ScenarioRun,
} from '../../core/simulation/scenarioEngine';
import {
  replayScenarioCommandCenter,
  runScenarioCommandCenter,
  scenarioUiMetrics,
  temporalTimelinesFor,
  type ScenarioCommandCenterRun,
  type ScenarioUiMetric,
} from '../../core/simulation/scenarioCommandCenter';
import { temporalStateAt } from '../../core/simulation/temporalState';

/**
 * Scenario Command Center visual contract: compact, evidence-first UI over the
 * existing Scenario Engine. Every number is a field from ScenarioRun/ScenarioSummary.
 */
type ChartMetric = 'infectious' | 'hospitalized' | 'deceased';

const CHART_METRICS: readonly { id: ChartMetric; label: string }[] = [
  { id: 'infectious', label: 'zakażeni I' },
  { id: 'hospitalized', label: 'hospitalizacja' },
  { id: 'deceased', label: 'zgony D' },
];

const PARAMETER_LABELS: Record<string, string> = {
  restrictions: 'restrykcje', isolate: 'izolacja objawowych', closeSchools: 'zamknięcie szkół',
  householdTransmissionScale: 'mnożnik transmisji domowej', totalBeds: 'łóżka ogólne',
  icuBeds: 'łóżka ICU', shieldedBands: 'chronione pasma', shieldingEffectiveness: 'siła ochrony',
};

function formatMetric(metric: ScenarioUiMetric, value: number | null): string {
  if (value === null) return 'NOT_AVAILABLE';
  if (metric.kind === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (metric.kind === 'days') return `${value.toFixed(2)} d`;
  return String(value);
}

function numberAt(sample: ScenarioDaySample, metric: ChartMetric): number {
  return sample[metric];
}

function pathFor(run: ScenarioRun, metric: ChartMetric, max: number, width: number, height: number): string {
  if (run.series.length === 0 || max <= 0) return '';
  return run.series.map((sample, index) => {
    const x = 8 + (index / Math.max(1, run.series.length - 1)) * (width - 16);
    const y = height - 8 - (numberAt(sample, metric) / max) * (height - 16);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function ScenarioComparisonChart({ run, metric }: { run: ScenarioCommandCenterRun; metric: ChartMetric }) {
  if (run.baseline.status !== 'COMPLETED' || run.intervention.status !== 'COMPLETED') return <p className="scenario-empty">NOT_AVAILABLE — brak modelowanej pary przebiegów.</p>;
  const max = Math.max(1, ...run.baseline.series.map((sample) => numberAt(sample, metric)), ...run.intervention.series.map((sample) => numberAt(sample, metric)));
  const width = 320; const height = 112;
  return <div className="scenario-chart-wrap" aria-label={`Wykres porównawczy ${CHART_METRICS.find((item) => item.id === metric)?.label ?? metric}`}>
    <div className="scenario-chart-key"><span><i className="scenario-line baseline" />BASELINE</span><span><i className="scenario-line intervention" />INTERVENTION</span><b>max {max}</b></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="scenario-chart" role="img">
      <line x1="8" x2={width - 8} y1={height - 8} y2={height - 8} className="scenario-axis" />
      <line x1="8" x2="8" y1="8" y2={height - 8} className="scenario-axis" />
      <path d={pathFor(run.baseline, metric, max, width, height)} className="scenario-series baseline" />
      <path d={pathFor(run.intervention, metric, max, width, height)} className="scenario-series intervention" />
    </svg>
  </div>;
}

function Traceability({ run, replays }: { run: ScenarioCommandCenterRun; replays: readonly [ScenarioReplay, ScenarioReplay] | null }) {
  const interventionDefinition = SCENARIOS[run.intervention.scenarioId];
  return <div className="scenario-trace">
    <div className="scenario-trace-grid">
      <span>scenario ID<b>{run.intervention.scenarioId}</b></span>
      <span>seed<b>{run.baseline.params.seed}</b></span>
      <span>engine/version<b>{run.baseline.contractVersion}</b></span>
      <span>status<b>{run.comparison.status}</b></span>
      <span>input fingerprint<code>{run.intervention.inputFingerprint}</code></span>
      <span>result fingerprint<code>{run.intervention.resultFingerprint ?? 'NOT_AVAILABLE'}</code></span>
    </div>
    <div className="scenario-provenance">
      <b>provenance</b>
      <p>Wyniki pochodzą z <code>runScenario()</code>; porównanie z <code>compareScenarios()</code>. Interwencja: {interventionDefinition.rationale}</p>
      {replays && <p className={replays.every((replay) => replay.status === 'MATCH') ? 'scenario-replay-match' : 'scenario-replay-other'}>replay: BASELINE {replays[0].status} · INTERVENTION {replays[1].status}</p>}
    </div>
  </div>;
}

export function ScenarioCommandCenterPanel({ params, temporalDay = null }: { params: SimParams; temporalDay?: number | null }) {
  const [intervention, setIntervention] = useState<ScenarioId>('ISOLATION');
  const [run, setRun] = useState<ScenarioCommandCenterRun | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('infectious');
  const [timelineDay, setTimelineDay] = useState(0);
  const [replays, setReplays] = useState<readonly [ScenarioReplay, ScenarioReplay] | null>(null);
  const definition = SCENARIOS[intervention];
  const parameterEntries = useMemo(() => [
    ...Object.entries(definition.epidemicOverrides),
    ...Object.entries(definition.hospitalOverrides),
    ...Object.entries(definition.cohortOverrides ?? {}),
  ], [definition]);
  const metrics = run ? scenarioUiMetrics(run.baseline, run.intervention) : [];
  // Oba ramiona jako oś czasu: przewijalny dowód, nie tylko wykres jednej serii.
  const timelines = useMemo(() => (run ? temporalTimelinesFor(run) : null), [run]);
  const baselineState = timelines ? temporalStateAt(timelines.baseline, timelineDay) : null;
  const variantState = timelines ? temporalStateAt(timelines.variant, timelineDay) : null;
  const lastDay = run?.intervention.days ?? 0;
  const execute = () => {
    const next = runScenarioCommandCenter(intervention, params, temporalDay === null ? {} : { variantInterventionStartDay: temporalDay });
    setRun(next); setTimelineDay(0); setReplays(null);
  };

  return <div className="world-panel scenario-command-panel" aria-label="Scenario Engine Command Center">
    <div className="world-panel-heading"><span>SCENARIUSZ</span><small>Scenario Engine</small></div>
    <div className="scenario-selector">
      <label>BASELINE <output>{SCENARIOS.BASELINE.label}</output></label>
      <label>INTERVENTION
        <select value={intervention} onChange={(event) => { setIntervention(event.target.value as ScenarioId); setRun(null); setReplays(null); }} aria-label="Scenariusz interwencji">
          {Object.values(SCENARIOS).filter((item) => item.id !== 'BASELINE').map((item) => <option key={item.id} value={item.id}>{item.label}{item.notModeledReason ? ' — NOT_MODELED' : ''}</option>)}
        </select>
      </label>
    </div>
    <p className="scenario-rationale">{definition.rationale}</p>
    <div className="scenario-parameters"><span>PARAMETRY INTERWENCJI</span>
      {parameterEntries.length > 0 ? parameterEntries.map(([key, value]) => <div key={key}><b>{PARAMETER_LABELS[key] ?? key}</b><code>{Array.isArray(value) ? value.join(', ') : String(value)}</code></div>) : <p>Brak nadpisań parametrów modelu.</p>}
    </div>
    {definition.notModeledReason && <p className="scenario-not-modeled">NOT_MODELED — {definition.notModeledReason}</p>}
    <button className="world-action accent scenario-run-button" onClick={execute}>▶ {temporalDay === null ? 'Uruchom istniejący scenariusz' : `WHAT IF? · od dnia ${temporalDay}`}</button>

    {!run && <p className="scenario-empty">NOT_AVAILABLE — uruchom BASELINE i INTERVENTION, aby zobaczyć wyniki.</p>}
    {run && <>
      {run.intervention.status === 'NOT_MODELED' ? <p className="scenario-not-modeled">NOT_MODELED — {run.intervention.notModeledReason}</p> : <>
        <div className="scenario-result-heading"><span>PORÓWNANIE</span><small>{run.comparison.message}</small></div>
        <div className="scenario-metrics">
          {metrics.map((metric) => <div className="scenario-metric" key={metric.key}><span>{metric.label}</span><b>{formatMetric(metric, metric.baseline)}</b><i>→</i><strong>{formatMetric(metric, metric.intervention)}</strong></div>)}
        </div>
        <div className="scenario-chart-controls"><span>CHART</span>{CHART_METRICS.map((item) => <button key={item.id} aria-pressed={chartMetric === item.id} onClick={() => setChartMetric(item.id)}>{item.label}</button>)}</div>
        <ScenarioComparisonChart run={run} metric={chartMetric} />
        <div className="scenario-timeline">
          <div><span>TIMELINE</span><b>DAY 0 → DAY {lastDay}</b></div>
          <input type="range" min="0" max={lastDay} step="1" value={timelineDay} onChange={(event) => setTimelineDay(Number(event.target.value))} aria-label="Dzień scenariusza" />
          <div className="scenario-timeline-divergence">
            {run && run.comparison.status === 'COMPLETED'
              ? (run.firstDivergentDay === null
                ? <span>BRAK ROZJAZDU — obie osie identyczne w całym horyzoncie</span>
                : <span className={timelineDay >= run.firstDivergentDay ? 'scenario-divergence-past' : 'scenario-divergence-future'}>ROZJAZD (mierzony): DZIEŃ {run.firstDivergentDay}</span>)
              : <span>NOT_AVAILABLE — rozjazd liczony tylko dla porównywalnej pary</span>}
          </div>
          <div className="scenario-timeline-branch">
            <span className="scenario-branch-label baseline">TIMELINE A — BASELINE</span>
            {baselineState === null ? <p>NOT_AVAILABLE — brak próbki dla wybranego dnia.</p>
              : baselineState.sample === null ? <p>DAY {baselineState.logicalDay} — {baselineState.observationStatus} — warunki wejściowe, bez próbki dziennej.</p>
              : <p>DAY {baselineState.sample.day} — {baselineState.observationStatus}: I {baselineState.sample.infectious} · hosp. {baselineState.sample.hospitalized} · D {baselineState.sample.deceased} · bez opieki {baselineState.sample.hospital.unmetCare}</p>}
          </div>
          <div className="scenario-timeline-branch">
            <span className="scenario-branch-label variant">TIMELINE B — INTERVENTION</span>
            {variantState === null ? <p>NOT_AVAILABLE — brak próbki dla wybranego dnia.</p>
              : variantState.sample === null ? <p>DAY {variantState.logicalDay} — {variantState.observationStatus} — warunki wejściowe, bez próbki dziennej.</p>
              : <p>DAY {variantState.sample.day} — {variantState.observationStatus}: I {variantState.sample.infectious} · hosp. {variantState.sample.hospitalized} · D {variantState.sample.deceased} · bez opieki {variantState.sample.hospital.unmetCare}</p>}
          </div>
        </div>
      </>}
      <Traceability run={run} replays={replays} />
      <button className="world-action scenario-replay-button" onClick={() => setReplays(replayScenarioCommandCenter(run))}>↻ Zweryfikuj replay</button>
    </>}
  </div>;
}
