import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { LabScene3D } from '../../core/three/labScene3D';
import { runGovLowerHarmDiscovery, type GovLowerHarmDiscoveryResult } from '../../core/orchestrator/govLowerHarmDiscovery';
import { WorldChrome } from '../genesis-ui/WorldChrome';
import { buildDiscoveryHallSequence, type HallShot } from '../../core/three/discoveryHallSequence';
import { useVoiceEngine } from '../../core/guide/guideRuntime';

/**
 * DISCOVERY HALL — the real LOWER-HARM run narrated inside the EXISTING 3D lab
 * (D-117). Composition only: `LabScene3D` (unchanged), its four fixed camera
 * shots driven through the existing `focusScientific` eased flights, and a
 * HUD whose every line comes from `buildDiscoveryHallSequence` over the real
 * `runGovLowerHarmDiscovery({ mode: 'PRODUCTION' })` result executed on mount.
 * The scene is a visualisation and says so; the numbers are the run's.
 */

const CAMERA_LABEL: Readonly<Record<HallShot['kind'], string>> = {
  WIDE: 'HALA — kadr otwierający',
  SCIENTIFIC: 'NAUKOWA — widok instrumentu',
  ANOMALY: 'NAUKOWA — anomalia',
  REPLAY: 'ODTWORZENIE',
};

export function DiscoveryHallScreen() {
  const sim = useMemo(() => new LabScene3D(), []);
  const params = useMemo(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  const [result, setResult] = useState<GovLowerHarmDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    runGovLowerHarmDiscovery({ mode: 'PRODUCTION' })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  const shots = useMemo(() => (result !== null && result.kind === 'RUN' ? buildDiscoveryHallSequence(result) : []), [result]);
  const shot = shots[index] ?? null;

  // D-119: `#/discovery-hall?tour=1` — the guide's voice narrates each shot (title + its first
  // line, both already built from the real run); without the flag the hall stays silent.
  const tour = typeof window !== 'undefined' && /[?&]tour=1/.test(window.location.hash);
  const voice = useVoiceEngine();
  useEffect(() => {
    if (!tour || shot === null) return;
    voice.speak({ key: `hall:${shot.id}`, text: `${shot.title}. ${shot.lines[0] ?? ''}`, lang: voice.settings.lang });
  }, [tour, shot, voice]);
  useEffect(() => () => { voice.stop(); }, [voice]);

  // Drive the existing camera flights; advance on the shot's own hold time while playing.
  useEffect(() => {
    if (shot === null) return;
    sim.focusScientific(shot.kind);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (!playing) return;
    timer.current = window.setTimeout(() => {
      setIndex((i) => (i + 1 < shots.length ? i + 1 : i));
      if (index + 1 >= shots.length) setPlaying(false);
    }, shot.holdSeconds * 1000);
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); };
  }, [shot, playing, index, shots.length, sim]);

  const restart = useCallback(() => { setIndex(0); setPlaying(true); }, []);

  return (
    <main id="main-content" tabIndex={-1} className="hall-shell" data-testid="discovery-hall">
      <WorldChrome
        glyph="◈"
        domain="Winner Gate"
        title="Discovery Hall"
        purpose="Jedno realne odkrycie opowiedziane w laboratorium: kustodia → G2 → bramka zwycięzcy → Winner Record."
        badges={[{ label: 'DANE · REALNY PRZEBIEG LOWER-HARM', tone: 'real' }, { label: 'SCENA 3D · WIZUALIZACJA', tone: 'visual' }]}
        kpis={shots.length > 0 ? [{ label: 'ujęcie', value: `${index + 1}/${shots.length}` }] : []}
      />
      <div className="hall-stage">
        <canvas ref={canvasRef} className="hall-canvas" aria-label="Discovery Hall — the existing 3D lab scene (visualisation, not an experiment)" />
        {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}
        <div className="hall-hud" data-testid="hall-hud">
          <div className="hall-hud-top">
            {shot !== null && <span className="hall-camera">{CAMERA_LABEL[shot.kind]}</span>}
          </div>
          {error !== null && <p className="hall-error">Run failed: {error}</p>}
          {result !== null && result.kind === 'EXECUTION_BLOCKED' && (
            <p className="hall-error" data-testid="hall-blocked">EXECUTION_BLOCKED [{result.code}] — {result.error}</p>
          )}
          {result === null && error === null && <p className="hall-wait">Uruchamiam prawdziwy 20-etapowy przebieg…</p>}
          {shot !== null && (
            <div className="hall-card" data-testid={`hall-shot-${shot.id}`}>
              <div className="hall-step">{index + 1} / {shots.length}</div>
              <h2 className="hall-title">{shot.title}</h2>
              <ul className="hall-lines">
                {shot.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          )}
          {shots.length > 0 && (
            <div className="hall-controls" role="toolbar" aria-label="Sterowanie sekwencją">
              <button type="button" className="chip-btn" onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }} disabled={index === 0}>◀ Poprzednie</button>
              <button type="button" className="chip-btn primary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pauza' : 'Odtwarzaj'}</button>
              <button type="button" className="chip-btn" onClick={() => { setPlaying(false); setIndex((i) => Math.min(shots.length - 1, i + 1)); }} disabled={index >= shots.length - 1}>Następne ▶</button>
              <button type="button" className="chip-btn gid-quiet" onClick={restart}>Od początku</button>
              <a className="chip-btn gid-quiet" href="#/research-console">Konsola badawcza</a>
              {tour && index >= shots.length - 1 && !playing && <span className="hall-tour-end" data-testid="hall-tour-end">Koniec Genesis Tour — każdy wynik, który widziałeś, można odtworzyć i sprawdzić.</span>}
            </div>
          )}
        </div>
      </div>
      <p className="hall-footer">
        Kamera i scena pochodzą z istniejącego laboratorium 3D (LabScene3D, cztery stałe kadry). Żadna liczba na ekranie nie jest policzona przez tę scenę — wszystkie pochodzą z realnego przebiegu <code>runGovLowerHarmDiscovery</code>, tego samego, który uruchamia Konsola badawcza.
      </p>
    </main>
  );
}
