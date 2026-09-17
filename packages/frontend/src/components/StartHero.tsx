import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments } from '../core/scienceMemory';
import { getLabs } from '../core/registry';
import { WORLDS } from './WorldsHubScreen';
import { AskGenesisMic } from './guide/AskGenesisMic';

/**
 * START HERO — the first thing a visitor sees (D-118). One question box,
 * three doors (ask / see a discovery / enter a 3D world), one status strip.
 * Every number on the strip is a real read (Science Memory, backend health,
 * registered labs, resolvable worlds); nothing is a placeholder.
 */

type Health = 'checking' | 'online' | 'no-key' | 'offline';

const SUGGESTIONS: readonly string[] = [
  'Znajdź bezpieczniejszą alternatywę dla semaglutydu',
  'Zasymuluj epidemię z R0=5 przez 10 dni',
  'Co by było, gdyby zamknąć szkoły w dniu 12?',
];

export function StartHero(): React.ReactElement {
  const [ask, setAsk] = useState('');
  const [health, setHealth] = useState<Health>('checking');
  const records = useMemo(() => { try { return listExperiments().length; } catch { return 0; } }, []);
  const labs = useMemo(() => getLabs().length, []);

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
        <span className="gx-eyebrow">Genesis Physics · Scientific OS · genesis-physics.com</span>
        <h1 className="start-title">Zadaj pytanie. Genesis przeprowadzi badanie.</h1>
        <p className="start-lede">
          Kandydaci, dowody, próba obalenia własnej hipotezy, bramka zwycięzcy — w jednym przebiegu, z odciskiem każdego etapu.
          Wynik możesz odtworzyć jutro, na innej maszynie.
        </p>
      </header>

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
      <div className="start-guide-row">
        <a className="chip-btn primary" href="#/research-console?guide=1" data-testid="start-guided">✦ Zobacz, jak to działa</a>
        <a className="chip-btn" href="#/tour" data-testid="start-tour">▶ Genesis Tour — 3 minuty z przewodnikiem</a>
      </div>
      <div className="start-suggest" aria-label="Przykładowe pytania">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip-btn tiny" onClick={() => submit(s)}>{s}</button>
        ))}
      </div>

      <div className="start-doors">
        <button type="button" className="start-door" onClick={() => document.querySelector<HTMLInputElement>('.start-ask-input')?.focus()} data-testid="door-ask">
          <span className="start-door-glyph" aria-hidden="true">✦</span>
          <span className="start-door-title">Zadaj pytanie</span>
          <span className="start-door-text">Zwykłym językiem. Genesis dobierze model, uruchomi go i pokaże, co jest realne, a co jest oszacowaniem.</span>
          <span className="start-door-cta">Napisz wyżej →</span>
        </button>
        <a className="start-door start-door-accent" href="#/research-console" data-testid="door-discover">
          <span className="start-door-glyph" aria-hidden="true">◎</span>
          <span className="start-door-title">Zobacz odkrycie</span>
          <span className="start-door-text">Pełny 20-etapowy proces na prawdziwych danych ChEMBL i ClinicalTrials.gov: kandydaci → dowody → falsyfikacja → Winner Gate → Research Recipe.</span>
          <span className="start-door-cta">Uruchom proces →</span>
        </a>
        <a className="start-door" href="#/worlds" data-testid="door-worlds">
          <span className="start-door-glyph" aria-hidden="true">◈</span>
          <span className="start-door-title">Wejdź do laboratorium 3D</span>
          <span className="start-door-text">Miasto epidemiologiczne, wirtualne laboratorium, Molecule World, Discovery Hall — sceny, które pokazują stan realnych modeli.</span>
          <span className="start-door-cta">Wybierz świat →</span>
        </a>
      </div>

      <ul className="start-status" aria-label="Stan systemu">
        <li><span className="start-status-value">{records}</span><span className="start-status-label">zapisanych przebiegów w Pamięci Naukowej</span></li>
        <li><span className="start-status-value">{WORLDS.length}</span><span className="start-status-label">światów 3D gotowych do wejścia</span></li>
        <li><span className="start-status-value">{labs}</span><span className="start-status-label">laboratoriów z realną fizyką</span></li>
        <li><span className={`start-status-value start-status-${health}`}>{health === 'online' ? '●' : health === 'checking' ? '◌' : '○'}</span><span className="start-status-label">backend {healthLabel}</span></li>
      </ul>
    </section>
  );
}
