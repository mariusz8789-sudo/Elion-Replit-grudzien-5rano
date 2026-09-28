import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments } from '../core/scienceMemory';
import { CSRN_KEY } from '../core/home/homeFacts';
import { AskGenesisMic } from './guide/AskGenesisMic';
import { HomeImatinibPanel, HomeProofStrip } from './home/HomeProofStrip';
import { HomeEngines } from './home/HomeEngines';
import { HomePipeline } from './home/HomePipeline';

/** Holographic engine core — three.js, lazy: the Start route loads it only after first paint. */
const EngineCoreHolo = lazy(() => import('./holo/EngineCoreHolo').then((m) => ({ default: m.EngineCoreHolo })));

/**
 * START — the first 30–60 seconds for a grant reviewer, investor or scientist.
 *
 * Order: what Genesis is → the numbers → try to break it (Reviewer Room) →
 * the engines → the pipeline → honest status (CSRN key, real lab) → the wider
 * Scientific OS → the Science Chat, which the shell mounts right below this.
 * Nothing here computes or certifies anything: numbers come from committed
 * evidence (`core/home/homeFacts`), engine status from the backend toolchain,
 * and every check links to the screen that really runs it.
 */

type Health = 'checking' | 'online' | 'no-key' | 'offline';

const CHALLENGES: readonly { id: string; title: string; act: string; result: string }[] = [
  { id: 'A', title: 'Change the result', act: 'edit the Vina score in the file', result: 'Verification fails' },
  { id: 'B', title: 'Call a model a measurement', act: 'MODEL_ESTIMATE as REAL_MEASUREMENT', result: 'Rejected' },
  { id: 'C', title: 'Sign with another key', act: 'valid signature, foreign key', result: 'SIGNED_UNTRUSTED' },
];

const BROADER: readonly { label: string; hash: string | null; note: string }[] = [
  { label: 'Human Digital Twin', hash: '#/human-biology-lab', note: 'drug effects not yet calculated' },
  { label: 'CERN / CMS Open Data', hash: '#/physics/cms-z', note: 'Z boson peak, public data' },
  { label: 'Quantum', hash: '#/lab/quantum', note: 'quantum mechanics lab' },
  { label: 'Physics', hash: '#/scientific-worlds', note: 'live models' },
  { label: 'World / Digital Twin', hash: '#/world-director', note: 'labelled SCENARIO' },
  { label: 'Real Lab architecture', hash: null, note: 'no hardware connected yet' },
];

export function StartHero(): React.ReactElement {
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
    if (t) requestOpenScienceChat(t);
  };
  const focusChat = (): void => {
    const input = document.querySelector<HTMLElement>('.science-chat-inline [aria-label="Wiadomość do Science Chat"]');
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };

  const healthLabel = health === 'checking' ? 'checking…' : health === 'online' ? 'online · AI ready' : health === 'no-key' ? 'online · AI without key' : 'offline · local mode';

  return (
    <div className="hp" data-testid="start-hero" lang="en" dir="ltr">
      <section className="hp-hero" aria-labelledby="hp-title">
        <div className="hp-hero-text">
          <p className="hp-eyebrow">Genesis · Scientific OS</p>
          <h1 id="hp-title" className="hp-title">Verifiable computational drug discovery.</h1>
          <p className="hp-sub">Real scientific engines. Falsifiable results. Cryptographic evidence. Replay.</p>
          <div className="hp-cta" data-testid="start-proof">
            <a className="hp-btn hp-btn-primary" href="#/discovery-track" data-testid="door-proof-discovery-track">Explore a verified discovery</a>
            <a className="hp-btn" href="#/reviewer" data-testid="door-proof-reviewer">Open Reviewer Room</a>
            <button type="button" className="hp-btn hp-btn-quiet" onClick={() => submit('Znajdź kandydatów dla BCR-ABL (cel imatynibu).')} data-testid="door-proof-drug">Run the imatinib experiment</button>
          </div>
          <p className="hp-honest">Every result is computational and labelled so. No Genesis prediction has been tested in a laboratory yet.</p>
        </div>
        <div className="start-holo" aria-hidden="true">
          <span className="start-holo-base" />
          <span className="start-holo-ring start-holo-ring-a" />
          <span className="start-holo-ring start-holo-ring-b" />
          {holo && <Suspense fallback={null}><EngineCoreHolo /></Suspense>}
        </div>
      </section>

      <div className="hp-dash">
        <HomeProofStrip />

        <section className="hp-panel hp-span-7" aria-labelledby="hp-verify-title" data-testid="home-verify">
          <header className="hp-panel-head">
            <h2 id="hp-verify-title">Don’t trust the claim. Verify it.</h2>
            <span className="hp-panel-meta">runs in your browser</span>
          </header>
          <div className="hp-checks">
            {CHALLENGES.map((c) => (
              <a key={c.id} className="hp-check" href="#/reviewer?focus=rv-c7" data-testid={`home-challenge-${c.id}`}>
                <span className="hp-check-id">{c.id}</span>
                <span className="hp-check-text"><strong>{c.title}</strong><small>{c.act}</small></span>
                <span className="hp-pill hp-pill-ok">{c.result}</span>
              </a>
            ))}
          </div>
          <p className="hp-replay">Replay verdicts: <code>MATCH</code> <code>DRIFT</code> <code>ENGINE_VERSION_CHANGED</code> <code>BLOCKED_BY_RUNTIME</code> · <a href="#/evidence">Evidence &amp; Replay</a></p>
          <a className="hp-btn hp-btn-primary hp-btn-block" href="#/reviewer">Open Reviewer Room</a>
        </section>

        <HomeImatinibPanel />

        <HomeEngines />

        <section className="hp-panel hp-span-5" aria-labelledby="hp-status-title" data-testid="home-status">
          <header className="hp-panel-head">
            <h2 id="hp-status-title">Signed and pending</h2>
            <span className="hp-panel-meta">from the records</span>
          </header>
          <div className="hp-status-item" data-testid="home-csrn">
            <p className="hp-status-top"><strong>CSRN signature</strong>{CSRN_KEY.generated ? <span className="hp-pill hp-pill-ok">SIGNED</span> : <span className="hp-pill hp-pill-warn">PENDING</span>}</p>
            {CSRN_KEY.generated
              ? <p className="hp-status-line">Signed by the published Genesis key <span className="hp-mono">keyId: {CSRN_KEY.keyId}</span></p>
              : <p className="hp-status-line">Genesis production signing key not generated yet.</p>}
            <p className="hp-foot">Signature proves integrity/authorship. It does not turn a model estimate into laboratory truth.</p>
          </div>
          <div className="hp-status-item" data-testid="home-real-lab">
            <p className="hp-status-top"><strong>Ready for physical validation</strong><span className="hp-pill hp-pill-warn">PENDING</span></p>
            <p className="hp-status-line">Architecture ready for real measurements. First hardware-verified instrument connection pending.</p>
            <p className="hp-foot">Read-only instrument adapter, calibration and provenance, Experiment Fabric bridge. No hardware-verified device adapter yet.</p>
          </div>
        </section>

        <HomePipeline />

        <section className="hp-panel hp-span-12" aria-labelledby="hp-broader-title" data-testid="home-broader">
          <header className="hp-panel-head">
            <h2 id="hp-broader-title">Built on a broader Scientific OS</h2>
            <span className="hp-panel-meta">same evidence layer, other sciences</span>
          </header>
          <ul className="hp-broader-list">
            {BROADER.map((b) => (
              <li key={b.label}>
                {b.hash ? <a href={b.hash}>{b.label}</a> : <span>{b.label}</span>}
                <small>{b.note}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="hp-panel hp-span-12 hp-ask" aria-labelledby="hp-ask-title">
          <header className="hp-panel-head">
            <h2 id="hp-ask-title">Science Chat · ask in plain language</h2>
            <span className="hp-panel-meta">below</span>
          </header>
          <div className="hp-cta hp-ask-actions">
            <button type="button" className="hp-btn hp-btn-primary" onClick={focusChat} data-testid="door-ask">Ask Genesis</button>
            <a className="hp-btn" href="#/scientific-worlds" data-testid="door-laboratory">Enter the laboratory</a>
            <AskGenesisMic lang="pl" onText={submit} className="hp-btn" />
            <button type="button" className="hp-btn hp-btn-quiet" onClick={() => submit('Oblicz miareczkowanie kwasowo-zasadowe NaOH.')} data-testid="door-guided-demo">See a ready example</button>
          </div>
          <ul className="hp-system" aria-label="System status">
            <li><strong>{records}</strong> runs saved in Scientific Memory</li>
            <li><strong className={`hp-health-${health}`}>{health === 'online' ? '●' : health === 'checking' ? '◌' : '○'}</strong> backend {healthLabel}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
