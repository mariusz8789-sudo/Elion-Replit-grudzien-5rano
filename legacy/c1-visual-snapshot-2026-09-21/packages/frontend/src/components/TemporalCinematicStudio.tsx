import { useEffect, useMemo, useRef, useState } from 'react';
import { generateScene, type GenesisSceneResult } from '../core/lookingGlass/urbanTransformation/genesisSceneOrchestrator';
import { buildHistoricalWorldState } from '../core/lookingGlass/urbanTransformation/historicalWorldState';
import { SUPPORTED_YEAR_RANGE } from '../core/lookingGlass/urbanTransformation/contracts';
import { KNOWN_LOCATIONS } from '../core/lookingGlass/urbanTransformation/historicalEraKnowledgeBase';
import type { SceneProgress } from '../core/lookingGlass/urbanTransformation/sceneProgress';
import {
  TEMPORAL_CAPTURE_CANVAS_TEST_ID, TEMPORAL_CAPTURE_FRAME_HEIGHT, TEMPORAL_CAPTURE_FRAME_WIDTH,
  type TemporalCaptureRequest, type TemporalCaptureResponse,
} from '../core/lookingGlass/urbanTransformation/browserCaptureContract';
import { mountTemporalCinematicScene, type TemporalCinematicSceneMount } from '../core/lookingGlass/urbanTransformation/temporalCinematicSceneMount';

/**
 * TEMPORAL CINEMATIC STUDIO — the real, browser-reachable entry point to
 * `generateScene`, the generic Genesis scene pipeline (not only historical
 * cities — molecules, engineering systems and environmental/epidemic worlds
 * route through the same dispatcher to their own real, existing engines).
 * Runs entirely client-side, matching every other Scientific World in this
 * product (`#/city3d`, `#/scientific-worlds`) — none of them round-trip a
 * simulation through the backend, so this doesn't either. The steps that
 * genuinely need a server-side runtime (a historical-era 3D renderer,
 * ffmpeg) are honestly reported as `BLOCKED_BY_RUNTIME` inside the result
 * rather than faked. The progress bar reports REAL stage completion —
 * `onProgress` fires once per stage the pipeline genuinely reaches, never a
 * fabricated timer.
 */

const EXAMPLE_PROMPTS = [
  'London 1920',
  'Warsaw 1905',
  'ulica w Warszawie w 1900, 1950, 2000 i 2026',
  'Build a caffeine molecule',
  'Build an industrial factory',
  'Build the Solar System',
  'Show me a human cell',
];

function ProgressBar({ progress }: { progress: SceneProgress }) {
  return (
    <div className="gsc-caption" data-testid="tc-progress">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{progress.stage}</span>
        <span data-testid="tc-progress-percent">{progress.percent}% · {progress.remaining} stage(s) remaining</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${progress.percent}%`, height: '100%', background: 'var(--cyan, #5cd6e8)' }} />
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: GenesisSceneResult }) {
  return (
    <section className="settings-section" data-testid="tc-result">
      <h2>
        Domain: <span data-testid="tc-domain">{result.domain ?? 'unresolved'}</span> · Status: <span data-testid="tc-status">{result.status}</span>
      </h2>
      <p className="gsc-caption" data-testid="tc-fingerprint">fingerprint {result.fingerprint}</p>

      {'unresolved' in result && result.unresolved.length > 0 && (
        <ul className="gsc-caption" data-testid="tc-unresolved">
          {result.unresolved.map((u, i) => <li key={i}>{u}</li>)}
        </ul>
      )}

      {result.domain === 'HISTORICAL_URBAN' && (
        <>
          {result.temporalStates.length > 0 && (
            <div data-testid="tc-states">
              <h3>Temporal states ({result.temporalStates.length})</h3>
              <ul className="project-list">
                {result.temporalStates.map((s) => (
                  <li key={s.year} className="project-row">
                    <span className="project-name">{s.year}</span>
                    <span className="gsc-caption">{s.entities.length} entities · anchor ({s.anchor.position.join(', ')})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.cameraPath && (
            <p className="gsc-caption" data-testid="tc-camera">camera path: {result.cameraPath.points.length} points · viewpoint {result.cameraPath.viewpoint}</p>
          )}
          {result.video && <p className="gsc-caption" data-testid="tc-video">video: <b>{result.video.status}</b> — {result.video.note}</p>}
          <p className="gsc-caption">confidence: {result.confidence.toFixed(2)} (illustrative era archetypes, never verified historical fact)</p>
        </>
      )}

      {result.domain === 'MOLECULE' && result.status === 'COMPLETED' && result.descriptors && (
        <ul className="project-list" data-testid="tc-molecule-descriptors">
          <li className="project-row"><span className="project-name">{result.moleculeName}</span><span className="gsc-caption">{result.smiles}</span></li>
          {Object.entries(result.descriptors).map(([key, value]) => (
            <li key={key} className="project-row"><span className="project-name">{key}</span><span className="gsc-caption">{String(value)}</span></li>
          ))}
        </ul>
      )}

      {result.domain === 'ENGINEERING' && result.status === 'COMPLETED' && (
        <ul className="project-list" data-testid="tc-engineering-values">
          <li className="project-row"><span className="project-name">{result.systemLabel}</span></li>
          {Object.entries(result.values).map(([key, value]) => (
            <li key={key} className="project-row"><span className="project-name">{key}</span><span className="gsc-caption">{value.toFixed(4)}</span></li>
          ))}
        </ul>
      )}

      {result.domain === 'ENVIRONMENTAL' && result.status === 'COMPLETED' && (
        <p className="gsc-caption" data-testid="tc-environmental-series">{result.systemLabel} — {result.series.length} real ticks, final I={result.series.at(-1)!.I.toFixed(1)}</p>
      )}

      {result.domain === 'BIOLOGICAL_CELL' && (
        <p className="gsc-caption" data-testid="tc-capability-gap">
          <b>CAPABILITY_GAP</b> — real capability exists: {result.existingCapability}. Missing: {result.missingAdapter}
        </p>
      )}
    </section>
  );
}

export function TemporalCinematicStudio() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<GenesisSceneResult | null>(null);
  const [progress, setProgress] = useState<SceneProgress | null>(null);
  const [scrubLocation, setScrubLocation] = useState(KNOWN_LOCATIONS[0].id);
  const [scrubYear, setScrubYear] = useState<number>(SUPPORTED_YEAR_RANGE.min);

  const scrubbedState = useMemo(() => buildHistoricalWorldState(scrubLocation, scrubYear), [scrubLocation, scrubYear]);

  // REAL CAPTURE BRIDGE: `window.__GENESIS_TEMPORAL_CAPTURE__` is the contract a Node-side
  // `BrowserFrameRenderer` (Playwright) calls via `page.evaluate` to render one real frame of the
  // EXISTING scene mount (`temporalCinematicSceneMount.ts` — not a second renderer) into the canvas
  // below, which Playwright then screenshots directly. The THREE.js scene is created lazily, on the
  // first real capture call, so mounting this screen in a non-WebGL test environment (jsdom) never
  // touches WebGL at all.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountPromiseRef = useRef<Promise<TemporalCinematicSceneMount> | null>(null);

  useEffect(() => {
    async function handleCapture(request: TemporalCaptureRequest): Promise<TemporalCaptureResponse> {
      const canvas = canvasRef.current;
      if (!canvas) return { ok: false, reason: 'CANVAS_UNAVAILABLE', detail: 'capture canvas is not mounted' };
      try {
        if (!mountPromiseRef.current) {
          mountPromiseRef.current = mountTemporalCinematicScene(canvas, TEMPORAL_CAPTURE_FRAME_WIDTH, TEMPORAL_CAPTURE_FRAME_HEIGHT);
        }
        const mount = await mountPromiseRef.current;
        mount.applyState(request.temporalState, request.weather);
        mount.applyCamera(request.camera.position, request.camera.target, request.camera.fov);
        mount.renderOneFrame();
        // One rAF round-trip so the compositor has genuinely flushed the drawing buffer before a
        // screenshot reads it — `preserveDrawingBuffer: true` on the renderer keeps it readable.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        return { ok: true, width: TEMPORAL_CAPTURE_FRAME_WIDTH, height: TEMPORAL_CAPTURE_FRAME_HEIGHT };
      } catch (err) {
        return { ok: false, reason: 'RENDERER_UNAVAILABLE', detail: err instanceof Error ? err.message : String(err) };
      }
    }
    window.__GENESIS_TEMPORAL_CAPTURE__ = handleCapture;
    return () => {
      delete window.__GENESIS_TEMPORAL_CAPTURE__;
      mountPromiseRef.current?.then((mount) => mount.dispose()).catch(() => {});
      mountPromiseRef.current = null;
    };
  }, []);

  function handleGenerate(text: string) {
    setPrompt(text);
    setProgress(null);
    setResult(generateScene(text, { onProgress: setProgress }));
  }

  return (
    <main className="settings-view" id="main-content" tabIndex={-1} data-testid="temporal-cinematic-studio">
      <section className="settings-section">
        <h2>Temporal Cinematic Studio</h2>
        <p className="settings-hint">
          Tell Genesis what you want to see — a place and year, a molecule, an engineering system, or an
          environmental world. Genesis determines the domain and builds it with the existing engines.
        </p>
        <form className="account-form" onSubmit={(e) => { e.preventDefault(); handleGenerate(prompt); }}>
          <label className="account-field">
            <span>Prompt</span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Barcelona in 1925, rainy evening — or: build a caffeine molecule"
              data-testid="tc-prompt-input"
            />
          </label>
          <button type="submit" className="chip-btn primary" data-testid="tc-generate">Generate</button>
        </form>
        <div className="tc-examples" data-testid="tc-examples">
          {EXAMPLE_PROMPTS.map((example) => (
            <button key={example} type="button" className="chip-btn" onClick={() => handleGenerate(example)}>{example}</button>
          ))}
        </div>
      </section>

      {progress && <section className="settings-section"><ProgressBar progress={progress} /></section>}

      {result && <ResultPanel result={result} />}

      <section className="settings-section">
        <h2>Cinematic render capture</h2>
        <p className="settings-hint">
          The real render target for `window.__GENESIS_TEMPORAL_CAPTURE__` — a Node-side Playwright
          capture drives this canvas via that hook and screenshots it into real PNG frames.
        </p>
        <canvas
          ref={canvasRef}
          width={TEMPORAL_CAPTURE_FRAME_WIDTH}
          height={TEMPORAL_CAPTURE_FRAME_HEIGHT}
          data-testid={TEMPORAL_CAPTURE_CANVAS_TEST_ID}
          // Fixed pixel CSS size, not '100%': a real Playwright capture screenshots this element at
          // its LAID-OUT size, which must equal the renderer's actual drawing-buffer resolution
          // (TEMPORAL_CAPTURE_FRAME_WIDTH x HEIGHT) 1:1, or the saved frame would be a scaled
          // re-sample of the real render rather than the real render's own pixels.
          style={{ width: TEMPORAL_CAPTURE_FRAME_WIDTH, height: TEMPORAL_CAPTURE_FRAME_HEIGHT, flexShrink: 0, background: '#000', borderRadius: 4 }}
        />
      </section>

      <section className="settings-section">
        <h2>Temporal scrubber</h2>
        <p className="settings-hint">Resolves the historical/urban world state for a year directly — no video generation required.</p>
        <label className="account-field">
          <span>Location</span>
          <select value={scrubLocation} onChange={(e) => setScrubLocation(e.target.value)} data-testid="tc-scrub-location">
            {KNOWN_LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="account-field">
          <span>Year: {scrubYear}</span>
          <input
            type="range"
            min={SUPPORTED_YEAR_RANGE.min}
            max={SUPPORTED_YEAR_RANGE.max}
            value={scrubYear}
            onChange={(e) => setScrubYear(Number(e.target.value))}
            data-testid="tc-scrub-year"
          />
        </label>
        {scrubbedState && (
          <ul className="project-list" data-testid="tc-scrub-entities">
            {scrubbedState.entities.map((entity) => (
              <li key={entity.id} className="project-row">
                <span className="project-name">{entity.label}</span>
                <span className="gsc-caption">{entity.kind} · {entity.provenance.knowledgeStatus} ({entity.provenance.confidence})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default TemporalCinematicStudio;
