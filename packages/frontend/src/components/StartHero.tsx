import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments } from '../core/scienceMemory';
import { CSRN_KEY } from '../core/home/homeFacts';
import { AskGenesisMic } from './guide/AskGenesisMic';
import { HomeProofStrip } from './home/HomeProofStrip';
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
  { id: 'A', title: 'Change the result', act: 'Edit the best Vina score in the committed evidence file.', result: 'Verification fails' },
  { id: 'B', title: 'Call a model a real measurement', act: 'Relabel MODEL_ESTIMATE as REAL_MEASUREMENT on the certificate.', result: 'Rejected' },
  { id: 'C', title: 'Sign it with another key', act: 'Rebuild every hash and sign with a valid key that is not Genesis’s.', result: 'SIGNED_UNTRUSTED' },
];

const BROADER: readonly { label: string; hash: string | null; note: string }[] = [
  { label: 'Human Digital Twin', hash: '#/human-biology-lab', note: 'Organ-to-cell atlas; drug effects not yet calculated' },
  { label: 'CERN / CMS Open Data', hash: '#/physics/cms-z', note: 'Z boson peak from public collision data' },
  { label: 'Quantum', hash: '#/lab/quantum', note: 'Quantum mechanics laboratory' },
  { label: 'Physics', hash: '#/scientific-worlds', note: 'Live physics and chemistry models' },
  { label: 'World / Digital Twin', hash: '#/world-director', note: 'Scenario worlds, labelled SCENARIO' },
  { label: 'Real Lab architecture', hash: null, note: 'Read-only instrument seam; no hardware connected yet' },
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
          <p className="hp-chain" aria-label="Molecule, computation, falsification, evidence, replay">
            <span>Molecule</span><i aria-hidden="true">→</i><span>computation</span><i aria-hidden="true">→</i><span>falsification</span><i aria-hidden="true">→</i><span>evidence</span><i aria-hidden="true">→</i><span>replay</span>
          </p>
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

      <HomeProofStrip />

      <section className="hp-section" aria-labelledby="hp-verify-title" data-testid="home-verify">
        <p className="hp-kicker">Try it yourself</p>
        <h2 id="hp-verify-title" className="hp-h2">Don’t trust the claim. Verify it.</h2>
        <p className="hp-lede">Three attacks on a real, certified docking record. The checks run in your browser, in the Reviewer Room.</p>
        <div className="hp-challenges">
          {CHALLENGES.map((c) => (
            <a key={c.id} className="hp-challenge" href="#/reviewer?focus=rv-c7" data-testid={`home-challenge-${c.id}`}>
              <span className="hp-challenge-id">{c.id}</span>
              <span className="hp-challenge-title">{c.title}</span>
              <span className="hp-challenge-act">{c.act}</span>
              <span className="hp-challenge-result">→ {c.result}</span>
            </a>
          ))}
        </div>
        <p className="hp-replay">Replay re-runs a recorded computation and returns <code>MATCH</code>, <code>DRIFT</code>, <code>ENGINE_VERSION_CHANGED</code> or <code>BLOCKED_BY_RUNTIME</code>. <a href="#/evidence">See Evidence &amp; Replay</a></p>
        <a className="hp-btn hp-btn-primary" href="#/reviewer">Open Reviewer Room</a>
      </section>

      <HomeEngines />

      <HomePipeline />

      <section className="hp-section" aria-labelledby="hp-status-title" data-testid="home-status">
        <p className="hp-kicker">Stated plainly</p>
        <h2 id="hp-status-title" className="hp-h2">What is signed, and what is still pending</h2>
        <div className="hp-status-grid">
          <article className="hp-status-card" data-testid="home-csrn">
            <p className="hp-stat-label">CSRN evidence signature</p>
            {CSRN_KEY.generated
              ? <p className="hp-status-line hp-status-ok">Signed by the published Genesis key<br /><span className="hp-mono">keyId: {CSRN_KEY.keyId}</span></p>
              : <p className="hp-status-line hp-status-pending">Genesis production signing key not generated yet.</p>}
            <p className="hp-stat-note">Signature proves integrity/authorship. It does not turn a model estimate into laboratory truth.</p>
          </article>
          <article className="hp-status-card" data-testid="home-real-lab">
            <p className="hp-stat-label">Ready for physical validation</p>
            <p className="hp-status-line hp-status-pending">Architecture ready for real measurements. First hardware-verified instrument connection pending.</p>
            <p className="hp-stat-note">Built: real-experiment contract, read-only instrument adapter with calibration and provenance, bridge into the Experiment Fabric, model-versus-measurement labels. No hardware-verified device adapter exists yet.</p>
          </article>
        </div>
      </section>

      <section className="hp-section hp-broader" aria-labelledby="hp-broader-title" data-testid="home-broader">
        <p className="hp-kicker">Proof of extensibility</p>
        <h2 id="hp-broader-title" className="hp-h2">Built on a broader Scientific OS</h2>
        <p className="hp-lede">The same evidence and replay layer runs other sciences. Drug discovery is the focus; these show the platform generalises.</p>
        <ul className="hp-broader-list">
          {BROADER.map((b) => (
            <li key={b.label}>
              {b.hash ? <a href={b.hash}>{b.label}</a> : <span>{b.label}</span>}
              <small>{b.note}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="hp-section hp-ask" aria-labelledby="hp-ask-title">
        <p className="hp-kicker">Science Chat</p>
        <h2 id="hp-ask-title" className="hp-h2">Ask in plain language</h2>
        <p className="hp-lede">The chat below picks a real engine or model, runs it, and saves the result with its evidence.</p>
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
  );
}
