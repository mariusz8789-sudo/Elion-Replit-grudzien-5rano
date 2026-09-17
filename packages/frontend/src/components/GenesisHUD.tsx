import { FormEvent, useState } from 'react';
import { useVoiceEngine } from '../core/guide/guideRuntime';

export function GenesisHUD({ routeLabel = 'GENESIS ENGINE', paused, onTogglePaused, onExit }: { routeLabel?: string; paused?: boolean; onTogglePaused?: () => void; onExit?: () => void }): JSX.Element {
  const voice = useVoiceEngine();
  const [timeline, setTimeline] = useState(42);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const isPaused = paused ?? false;
  const submit = (event: FormEvent) => { event.preventDefault(); const text = query.trim(); if (!text) return; setResult(`HIPOTHESIS QUEUED · ${text}`); setQuery(''); voice.speak({ key: 'command-center', lang: 'pl', text: `Uruchamiam analizę: ${text}.` }); };
  return (
    <>
      {result && <button type="button" className="genesis-result-card" onClick={() => setResult(null)} title="Collapse result">{result}<span>×</span></button>}
      <section className="genesis-hud" aria-label="Genesis single chat command center">
        <div className="genesis-hud-title"><span className="genesis-hud-dot" />{routeLabel}<span className="genesis-hud-status">12K NODES · 60 FPS</span><button type="button" className="genesis-narrator-toggle" onClick={() => voice.update({ enabled: !voice.settings.enabled })}>🔊 NARRATOR: {voice.settings.enabled ? 'ON' : 'OFF'}</button></div>
        <form className="genesis-command-bar" onSubmit={submit}><span className="genesis-command-mark">⌁</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask Genesis a hypothesis…" aria-label="Ask Genesis" /><button type="submit" className="genesis-hud-button">RUN</button></form>
        <div className="genesis-hud-controls"><button type="button" className="genesis-hud-button" onClick={onTogglePaused}>{isPaused ? 'RESUME' : 'PAUSE'}</button><label className="genesis-hud-timeline">T+{String(timeline).padStart(3, '0')}<input type="range" min="0" max="100" value={timeline} onChange={(event) => setTimeline(Number(event.target.value))} aria-label="Timeline" /></label>{onExit && <button type="button" className="genesis-hud-button" onClick={onExit}>EXIT</button>}</div>
      </section>
    </>
  );
}
