import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments } from '../core/scienceMemory';
import { AskGenesisMic } from './guide/AskGenesisMic';

/** Holographic engine core — three.js, lazy: the Start route loads it only after first paint. */
const EngineCoreHolo = lazy(() => import('./holo/EngineCoreHolo').then((m) => ({ default: m.EngineCoreHolo })));

/** START HERO — one conversation and one connected Laboratory. */

type Health = 'checking' | 'online' | 'no-key' | 'offline';

export function StartHero(): React.ReactElement {
  const [ask, setAsk] = useState('');
  const [health, setHealth] = useState<Health>('checking');
  // Static render (tests, SSR) never mounts the WebGL hero; the browser turns it on after mount.
  const [holo, setHolo] = useState(false);
  useEffect(() => { setHolo(true); }, []);
  const records = useMemo(() => { try { return listExperiments().length; } catch { return 0; } }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { ai?: string }) => { if (!cancelled) setHealth(d.ai === 'ready' ? 'online' : 'no-key'); })
      .catch(() => { if (!cancelled) setHealth('offline'); });
    return () => { cancelled = true; };
  }, []);

  const submit = (text: string): void => {
    const t = text.trim();
    if (!t) return;
    setAsk('');
    requestOpenScienceChat(t);
  };

  const healthLabel = health === 'checking' ? 'sprawdzanie…' : health === 'online' ? 'online · AI gotowe' : health === 'no-key' ? 'online · AI bez klucza' : 'offline · tryb lokalny';

  return (
    <section className="start" aria-label="Start" data-testid="start-hero">
      <div className="start-glow" aria-hidden="true" />
      <header className="start-head">
        <img className="start-brand" src="/brand/genesis-lockup.png" alt="Genesis Physics — Scientific OS" width={1200} height={400} decoding="async" />
        <span className="gx-eyebrow">genesis-physics.com</span>
        <h1 className="start-title">Zapytaj. Genesis przygotuje eksperyment.</h1>
        <p className="start-lede">
          Jeden dialog prowadzi do jednego laboratorium. Eksperyment, wynik, dowód i replay pozostają częścią tej samej sesji.
        </p>
      </header>

      <div className="start-holo" aria-hidden="true">
        <span className="start-holo-base" />
        <span className="start-holo-ring start-holo-ring-a" />
        <span className="start-holo-ring start-holo-ring-b" />
        {holo && <Suspense fallback={null}><EngineCoreHolo /></Suspense>}
      </div>

      <form className="start-ask" onSubmit={(e) => { e.preventDefault(); submit(ask); }} role="search" aria-label="Zapytaj Genesis">
        <span className="start-ask-icon" aria-hidden="true">✦</span>
        <input
          className="start-ask-input"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Zapytaj zwykłym językiem…"
          aria-label="Zapytaj Genesis"
        />
        <AskGenesisMic lang="pl" onText={(t) => setAsk(t)} className="chip-btn start-ask-mic" />
        <button type="submit" className="chip-btn primary start-ask-send" disabled={!ask.trim()}>Zapytaj</button>
      </form>
      <div className="start-primary-actions" aria-label="Główne wejścia Genesis">
        <button type="button" className="chip-btn" onClick={() => document.querySelector<HTMLInputElement>('.start-ask-input')?.focus()} data-testid="door-ask">✦ Zapytaj Genesis</button>
        <a className="chip-btn primary" href="#/scientific-worlds" data-testid="door-laboratory">⌬ Wejdź do laboratorium</a>
        <button type="button" className="chip-btn start-guided-demo" onClick={() => submit('Oblicz miareczkowanie kwasowo-zasadowe NaOH.')} data-testid="door-guided-demo">▶ Zobacz gotowy przykład</button>
      </div>

      <ol className="start-journey" aria-label="Jak działa Genesis">
        <li><span>01</span>Pytanie</li><li><span>02</span>Laboratorium</li><li><span>03</span>Wynik</li><li><span>04</span>Evidence</li><li><span>05</span>Replay</li><li><span>06</span>Następny eksperyment</li>
      </ol>

      <ul className="start-status" aria-label="Stan systemu">
        <li><span className="start-status-value">{records}</span><span className="start-status-label">zapisanych przebiegów w Pamięci Naukowej</span></li>
        <li><span className={`start-status-value start-status-${health}`}>{health === 'online' ? '●' : health === 'checking' ? '◌' : '○'}</span><span className="start-status-label">backend {healthLabel}</span></li>
      </ul>
    </section>
  );
}
