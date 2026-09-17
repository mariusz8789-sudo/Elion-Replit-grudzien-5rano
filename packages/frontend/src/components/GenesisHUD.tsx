import { useState } from 'react';

export function GenesisHUD({ routeLabel = 'GENESIS ENGINE', paused, onTogglePaused, onExit }: { routeLabel?: string; paused?: boolean; onTogglePaused?: () => void; onExit?: () => void }): JSX.Element {
  const [timeline, setTimeline] = useState(42);
  const isPaused = paused ?? false;
  return (
    <section className="genesis-hud" aria-label="Genesis simulation controls">
      <div className="genesis-hud-title"><span className="genesis-hud-dot" />{routeLabel}<span className="genesis-hud-status">LIVE · 60 FPS TARGET</span></div>
      <div className="genesis-hud-controls">
        <button type="button" className="genesis-hud-button" onClick={onTogglePaused}>{isPaused ? 'RESUME' : 'PAUSE'}</button>
        <label className="genesis-hud-timeline">T+{String(timeline).padStart(3, '0')}<input type="range" min="0" max="100" value={timeline} onChange={(event) => setTimeline(Number(event.target.value))} aria-label="Timeline" /></label>
        {onExit && <button type="button" className="genesis-hud-button" onClick={onExit}>EXIT</button>}
      </div>
    </section>
  );
}
