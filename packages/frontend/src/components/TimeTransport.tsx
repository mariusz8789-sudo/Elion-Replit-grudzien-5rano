import { useEffect, useMemo, useRef, useState } from 'react';
import {
  runScenario, compareScenarios, SCENARIOS,
  type ScenarioId, type ScenarioRun, type ScenarioDaySample,
} from '../core/simulation/scenarioEngine';

/**
 * TIME TRANSPORT — time as a layer over a real simulation, not a widget.
 *
 * Everything here is computed by the EXISTING `core/simulation/scenarioEngine.ts`:
 * `runScenario()` produces a real day-by-day series from the epidemic model,
 * and `compareScenarios()` produces the real deltas between two branches. This
 * component adds no time engine, no second scenario store and no interpolation
 * of its own — moving the slider selects a day that was actually simulated,
 * and every number on screen is read from that day's `ScenarioDaySample`.
 *
 * WHY BRANCHES ARE REAL: a scenario is not a label on the same curve. Each one
 * re-runs the model with its own policy levers, so two branches at the same day
 * genuinely differ, and `compareScenarios` will refuse the comparison outright
 * if the two runs differ by more than policy (different population or seed) —
 * that refusal is surfaced rather than hidden.
 *
 * WHAT IT REFUSES TO SHOW: scenarios the model does not implement come back
 * with `status: 'NOT_MODELED'` and a reason. They are listed with that reason
 * instead of being quietly dropped from the picker or, worse, rendered as a
 * flat line that looks like a result.
 */

/** Playback speeds, in simulated days per second. */
const SPEEDS = [1, 2, 5, 10, 25] as const;

const METRIC_LABEL: Record<string, string> = {
  infectious: 'zakażeni',
  hospitalized: 'hospitalizowani',
  deceased: 'zmarli',
  isolated: 'izolowani',
  recovered: 'ozdrowieńcy',
};

type MetricKey = keyof Pick<ScenarioDaySample, 'infectious' | 'hospitalized' | 'deceased' | 'isolated' | 'recovered'>;
const METRICS: readonly MetricKey[] = ['infectious', 'hospitalized', 'deceased', 'isolated', 'recovered'];

const DAYS = 60;

/** A sparkline drawn from the real series — no smoothing, no invented points. */
function Sparkline({ series, metric, day, color }: { series: readonly ScenarioDaySample[]; metric: MetricKey; day: number; color: string }): JSX.Element {
  const max = Math.max(1, ...series.map((s) => s[metric]));
  const w = 100;
  const h = 28;
  const points = series.map((s, i) => `${(i / Math.max(1, series.length - 1)) * w},${h - (s[metric] / max) * h}`).join(' ');
  const cursorX = (Math.min(day, series.length - 1) / Math.max(1, series.length - 1)) * w;
  return (
    <svg className="tt-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <line x1={cursorX} y1="0" x2={cursorX} y2={h} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" />
    </svg>
  );
}

export function TimeTransport(): JSX.Element {
  const [branchIds, setBranchIds] = useState<ScenarioId[]>(['BASELINE', 'ISOLATION']);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(5);
  const [metric, setMetric] = useState<MetricKey>('infectious');
  const raf = useRef<number>(0);
  const lastTs = useRef<number>(0);

  /** Real runs. Recomputed only when the chosen branches change. */
  const runs = useMemo<ScenarioRun[]>(
    () => branchIds.map((id) => runScenario(id, { days: DAYS, stepsPerDay: 4 })),
    [branchIds],
  );

  const modelled = runs.filter((r) => r.series.length > 0);
  const notModelled = runs.filter((r) => r.series.length === 0);
  const maxDay = Math.max(0, ...modelled.map((r) => r.series.length - 1));

  // Playback advances real simulated days at the chosen rate.
  useEffect(() => {
    if (!playing) return;
    const step = (ts: number): void => {
      raf.current = window.requestAnimationFrame(step);
      if (lastTs.current === 0) { lastTs.current = ts; return; }
      const elapsed = (ts - lastTs.current) / 1000;
      if (elapsed < 1 / speed) return;
      lastTs.current = ts;
      setDay((d) => { if (d >= maxDay) { setPlaying(false); return maxDay; } return d + 1; });
    };
    raf.current = window.requestAnimationFrame(step);
    return () => { window.cancelAnimationFrame(raf.current); lastTs.current = 0; };
  }, [playing, speed, maxDay]);

  const comparison = useMemo(() => {
    if (modelled.length < 2) return null;
    return compareScenarios(modelled[0], modelled[1]);
  }, [modelled]);

  const toggleBranch = (id: ScenarioId): void => {
    setBranchIds((current) =>
      current.includes(id)
        ? (current.length > 1 ? current.filter((x) => x !== id) : current)
        : [...current, id],
    );
    setDay(0);
    setPlaying(false);
  };

  return (
    <section className="tt" aria-label="Nawigacja w czasie symulacji">
      <header className="tt-head">
        <div>
          <span className="dash-eyebrow">Time · Scenario</span>
          <h2 className="tt-title">Dzień {day} <span className="tt-of">z {maxDay}</span></h2>
        </div>
        <div className="tt-transport">
          <button className="tt-btn" onClick={() => { setDay(0); setPlaying(false); }} aria-label="Na początek">⏮</button>
          <button className="tt-btn" onClick={() => { setPlaying(false); setDay((d) => Math.max(0, d - 1)); }} aria-label="Krok wstecz">◀</button>
          <button className="tt-btn tt-btn-primary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pauza' : 'Odtwarzaj'}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="tt-btn" onClick={() => { setPlaying(false); setDay((d) => Math.min(maxDay, d + 1)); }} aria-label="Krok naprzód">▶|</button>
          <button className="tt-btn" onClick={() => { setDay(maxDay); setPlaying(false); }} aria-label="Na koniec">⏭</button>
          <div className="tt-speeds" role="group" aria-label="Prędkość">
            {SPEEDS.map((s) => (
              <button key={s} className={`tt-speed${speed === s ? ' active' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
        </div>
      </header>

      <input
        className="tt-scrub"
        type="range"
        min={0}
        max={maxDay}
        value={day}
        onChange={(e) => { setPlaying(false); setDay(Number(e.target.value)); }}
        aria-label="Dzień symulacji"
      />

      <div className="tt-metrics" role="group" aria-label="Metryka">
        {METRICS.map((m) => (
          <button key={m} className={`tt-metric${metric === m ? ' active' : ''}`} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</button>
        ))}
      </div>

      {/* Parallel branches. Each row is its own real run of the model. */}
      <ul className="tt-branches">
        {modelled.map((run, i) => {
          const sample = run.series[Math.min(day, run.series.length - 1)];
          const color = i === 0 ? 'var(--cyan)' : i === 1 ? 'var(--gold)' : 'var(--violet)';
          return (
            <li key={run.scenarioId} className="tt-branch">
              <div className="tt-branch-head">
                <span className="tt-branch-dot" style={{ background: color }} aria-hidden="true" />
                <strong>{run.label}</strong>
                {run.interventionStartDay > 0 && <span className="tt-branch-meta">interwencja od dnia {run.interventionStartDay}</span>}
              </div>
              <Sparkline series={run.series} metric={metric} day={day} color={color} />
              <div className="tt-branch-value">
                <span className="tt-branch-number">{Math.round(sample[metric]).toLocaleString('pl')}</span>
                <span className="tt-branch-unit">{METRIC_LABEL[metric]} @ dzień {sample.day}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Comparison — the engine's own verdict, including its refusal to compare. */}
      {comparison && (
        <div className="tt-compare">
          <h3 className="tt-compare-title">
            {comparison.baselineScenario} vs {comparison.variantScenario}
            <span className={`tt-compare-status tt-status-${comparison.status.toLowerCase()}`}>{comparison.status}</span>
          </h3>
          <p className="tt-compare-msg">{comparison.message}</p>
          {comparison.changedParameters.length > 0 && (
            <p className="tt-compare-changed">Różnią się politykami: {comparison.changedParameters.join(', ')}</p>
          )}
          {comparison.changedTiming.length > 0 && (
            <p className="tt-compare-changed">Różnią się czasem wejścia: {comparison.changedTiming.join(', ')}</p>
          )}
          {comparison.metrics.length > 0 && (
            <ul className="tt-deltas">
              {comparison.metrics.slice(0, 6).map((d) => (
                <li key={d.key}>
                  <span className="tt-delta-key">{d.key}</span>
                  <span className="tt-delta-val">
                    {Math.round(d.baseline).toLocaleString('pl')} → {Math.round(d.variant).toLocaleString('pl')}
                    {d.relativeDeltaPercent !== null && (
                      <em className={d.absoluteDelta <= 0 ? 'tt-down' : 'tt-up'}> ({d.relativeDeltaPercent > 0 ? '+' : ''}{d.relativeDeltaPercent.toFixed(1)}%)</em>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Branch picker. NOT_MODELED scenarios stay visible with their reason —
          dropping them would hide a real limit of the model. */}
      <details className="tt-picker">
        <summary>Gałęzie scenariuszy ({modelled.length} aktywne{notModelled.length > 0 ? `, ${notModelled.length} niemodelowane` : ''})</summary>
        <div className="tt-picker-grid">
          {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => {
            const active = branchIds.includes(id);
            return (
              <button key={id} className={`tt-pick${active ? ' active' : ''}`} onClick={() => toggleBranch(id)}>
                {SCENARIOS[id].label ?? id}
              </button>
            );
          })}
        </div>
        {notModelled.length > 0 && (
          <ul className="tt-notmodelled">
            {notModelled.map((r) => (
              <li key={r.scenarioId}>
                <strong>{r.label}</strong> — model tego nie liczy: {r.notModeledReason ?? 'brak podanego powodu'}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

export default TimeTransport;
