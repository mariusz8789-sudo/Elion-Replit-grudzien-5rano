import type { ScenarioTimelineHandoff } from '../../core/experimentFabric/worldHandoff';

interface TemporalWorldHudProps {
  timeline: ScenarioTimelineHandoff | null;
  day: number;
  enteredDay?: number | null;
}

/** Read-only WOW layer over the existing World/3D renderer. It never creates or advances a simulation. */
export function TemporalWorldHud({ timeline, day, enteredDay = null }: TemporalWorldHudProps) {
  if (!timeline) {
    return (
      <div className="temporal-world-hud temporal-world-hud-empty" aria-label="Temporal World status">
        <span className="temporal-world-kicker">GENESIS TEMPORAL WORLD</span>
        <strong>NOW · SIMULATED</strong>
        <small>Brak przekazanego przebiegu czasowego — świat pozostaje w trybie live modelu.</small>
      </div>
    );
  }

  const maximumIndex = Math.max(0, timeline.series.length - 1);
  const selectedIndex = Math.min(Math.max(day, 0), maximumIndex);
  const selectedSample = timeline.series[selectedIndex] ?? null;
  const selectedDay = selectedSample?.day ?? selectedIndex;
  const variant = timeline.counterfactual?.variant.series[selectedIndex] ?? null;
  const baseline = timeline.counterfactual?.baseline.series[selectedIndex] ?? null;
  const divergence = timeline.counterfactual?.firstDivergentDay;
  const phase = selectedIndex === 0 ? 'PAST · T0' : selectedIndex >= maximumIndex ? 'FUTURE · HORIZON' : 'NOW · SELECTED';

  return (
    <div className="temporal-world-hud" aria-label="Temporal World status">
      <div className="temporal-world-hud-topline">
        <span className="temporal-world-kicker">GENESIS TEMPORAL WORLD</span>
        <span className="temporal-world-phase">{phase}</span>
        <span className="temporal-world-status">{enteredDay === selectedDay ? 'ENTERED · ' : ''}{timeline.epistemicStatus}</span>
      </div>
      <div className="temporal-world-hud-main">
        <div>
          <strong>DAY {selectedDay}</strong>
          <small>{timeline.scenarioLabel} · {timeline.origin === 'memory-replay' ? 'MEMORY REPLAY · MATCH' : 'FABRIC RUN'}</small>
        </div>
        <div className="temporal-world-rail" aria-hidden="true">
          <span>PAST</span><i /><b>NOW</b><i /><span>FUTURE</span>
        </div>
        <div className="temporal-world-identity">
          <span>RUN</span><code>{timeline.runFingerprint.slice(0, 12)}…</code>
        </div>
      </div>
      {timeline.counterfactual && (
        <div className="temporal-world-branches">
          <div><span className="temporal-branch baseline">TIMELINE A · BASELINE</span><b>{baseline ? `I ${baseline.infectious} · D ${baseline.deceased}` : 'NOT_AVAILABLE'}</b></div>
          <div><span className="temporal-branch counterfactual">TIMELINE B · COUNTERFACTUAL</span><b>{variant ? `I ${variant.infectious} · D ${variant.deceased}` : 'NOT_AVAILABLE'}</b></div>
          <div className="temporal-world-divergence">{divergence === null ? 'NO MEASURED DIVERGENCE' : `FIRST DIVERGENCE · DAY ${divergence}`}</div>
        </div>
      )}
    </div>
  );
}

export default TemporalWorldHud;

