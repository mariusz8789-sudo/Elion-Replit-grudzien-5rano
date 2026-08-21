import { useEffect, useMemo, useState } from 'react';
import { registerActiveSimControls } from '../../core/activeSimControls';
import { type AnalysisMode } from '../../core/simulation/analysis';
import { HighFidelityStreetSlice3D, type HighFidelityCameraMode } from '../../core/three/highFidelitySlice3D';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import type { SimParams } from '../../core/types';
import { consumePendingExperimentWorld } from '../../core/experimentFabric/worldHandoff';

const LEGEND = [
  ['S', 'podatny', '#54d98c'],
  ['E', 'narażony', '#e8b34a'],
  ['I', 'zakażony', '#f05555'],
  ['R', 'ozdrowiały', '#5aa2ff'],
  ['D', 'nieaktywny', '#6b7280'],
] as const;

const CAMERA_MODES: Array<{ id: HighFidelityCameraMode; label: string }> = [
  { id: 'city', label: 'CITY' },
  { id: 'street', label: 'STREET' },
  { id: 'agent', label: 'AGENT CLOSE-UP' },
];

/**
 * Jedna trasa proof-of-concept. Nie jest dashboardem oraz nie tworzy nowej symulacji:
 * renderuje wyłącznie odczyt EpidemicCitySimulation i GenesisEvent z HighFidelityStreetSlice3D.
 */
export function HighFidelitySliceScreen() {
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const requestedView = query.get('view');
  const philadelphiaScenario = query.get('scenario') === 'philadelphia';
  const philadelphiaLegendMode = query.get('legendView') === 'physics' ? 'physics' as const : 'legend' as const;
  const initialCameraMode: HighFidelityCameraMode = requestedView === 'city' || requestedView === 'agent' || requestedView === 'event' ? requestedView : 'street';
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Jednorazowo przejmuje tę samą instancję World Engine z Experiment Fabric.
  // Brak handoffu zachowuje dotychczasowy samodzielny proof na tej trasie.
  const [experimentWorld] = useState(() => consumePendingExperimentWorld());
  const sim = useMemo(
    () => new HighFidelityStreetSlice3D({}, { onAgentSelected: setSelectedId }, experimentWorld?.simulation, philadelphiaScenario ? philadelphiaLegendMode : null),
    [experimentWorld, philadelphiaScenario, philadelphiaLegendMode],
  );
  const [running, setRunning] = useState(true);
  const [cameraMode, setCameraMode] = useState<HighFidelityCameraMode>(initialCameraMode);
  const [heatmap, setHeatmap] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>(() => sim.getStats());
  const params = useMemo<SimParams>(() => ({ clockSpeed: running ? 4 : 0 }), [running]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, setStats);

  useEffect(() => { sim.setShowHeatmap(heatmap); sim.setAnalysisMode('risk' as AnalysisMode); }, [heatmap, sim]);
  useEffect(() => { sim.setCameraMode(initialCameraMode); }, [initialCameraMode, sim]);
  useEffect(() => registerActiveSimControls({ toggleRunning: () => setRunning((value) => !value), reset: () => { sim.reset(); setRunning(false); setCameraMode('street'); setStats(sim.getStats()); } }), [sim]);

  const setCamera = (mode: HighFidelityCameraMode) => {
    sim.setCameraMode(mode);
    setCameraMode(mode);
    setStats(sim.getStats());
  };
  const showEvent = () => {
    const result = sim.focusLatestEvent();
    if (result !== null) setCameraMode('event');
    setStats(sim.getStats());
  };
  const reset = () => { sim.reset(); setRunning(false); setCameraMode('street'); setStats(sim.getStats()); };
  const event = sim.getLatestEvent();
  const agent = selectedId === null ? null : sim.getSim().debugInfo(selectedId);

  return (
    <main id="main-content" tabIndex={-1} className="hf-slice-screen">
      <section className="hf-stage" aria-label="Genesis high-fidelity street slice">
        <canvas ref={canvasRef} className="hf-canvas" aria-label={philadelphiaScenario ? 'Hipotetyczna wizualizacja legendy Eksperymentu Filadelfia; nie jest symulacją fizyczną' : 'High-fidelity fragment ulicy Genesis oparty na żywym modelu epidemii'} />
        {loading && <div className="hf-loading" role="status">Ładowanie świata high-fidelity…</div>}
        {failed && <div className="hf-loading hf-error">WebGL nie uruchomił sceny na tym urządzeniu.</div>}

        <header className="hf-topbar">
          <div>
            <span className="hf-kicker">GENESIS OS · {philadelphiaScenario ? 'HISTORICAL LEGEND SCENARIO' : 'WORLD ENGINE PROOF'}</span>
            <h1>{philadelphiaScenario ? 'PHILADELPHIA EXPERIMENT — HYPOTHETICAL VISUALIZATION' : 'HIGH-FIDELITY STREET SLICE'}</h1>
            <p>{philadelphiaScenario ? 'FACT / HISTORICAL_RECORD / LEGEND / HYPOTHESIS rozdzielone · brak REAL_ENGINE' : 'Żywy model agentowy · PBR · CC0 asset pipeline · WebGL baseline'}</p>
          </div>
          <div className="hf-model-status">
            <span>{philadelphiaScenario ? 'HISTORICAL_LEGEND' : 'MODEL LIVE'}</span>
            <strong>{philadelphiaScenario ? 'HYPOTHETICAL_VISUALIZATION' : `dzień ${stats.dzien ?? 0}`}</strong>
            <small>{philadelphiaScenario ? 'Brak danych pomiarowych · brak solvera Maxwella · brak real-engine' : `${stats.agenci ?? 0} realnych agentów · ${stats.hf_event_count ?? 0} GenesisEvent`}</small>
          </div>
        </header>

        <aside className="hf-controls" aria-label="Sterowanie proof-of-concept">
          {philadelphiaScenario ? <>
            <div className="hf-control-label">STATUS SCENARIUSZA</div>
            <p><b>{philadelphiaLegendMode === 'physics' ? 'PHYSICS BOUNDARY VIEW' : 'LEGEND VIEW'}</b></p>
            <p>Ta scena ilustruje założenia narracji. Animowane pole nie jest wynikiem równania Maxwella, pomiarem ani dowodem teleportacji.</p>
          </> : <>
            <div className="hf-control-label">KAMERA</div>
            <div className="hf-button-row">
              {CAMERA_MODES.map((item) => <button key={item.id} className={cameraMode === item.id ? 'active' : ''} onClick={() => setCamera(item.id)}>{item.label}</button>)}
            </div>
            <div className="hf-button-row">
              <button onClick={() => setRunning((value) => !value)}>{running ? 'PAUZA' : 'START'}</button>
              <button onClick={reset}>RESET</button>
              <button className={heatmap ? 'active' : ''} onClick={() => setHeatmap((value) => !value)}>HEATMAPA</button>
            </div>
          </>}
        </aside>

        <aside className="hf-legend" aria-label={philadelphiaScenario ? 'Klasyfikacja wiedzy scenariusza' : 'Legenda epidemiologiczna'}>
          {philadelphiaScenario ? <>
            <span className="hf-control-label">KLASYFIKACJA WIEDZY</span>
            <div className="hf-legend-row"><i style={{ backgroundColor: '#9fd6ff' }} /><strong>FACT</strong><span>USS Eldridge był realnym okrętem.</span></div>
            <div className="hf-legend-row"><i style={{ backgroundColor: '#f5cf74' }} /><strong>HISTORICAL_RECORD</strong><span>Nie ma wiarygodnego zapisu opisywanego eksperymentu.</span></div>
            <div className="hf-legend-row"><i style={{ backgroundColor: '#c68cff' }} /><strong>LEGEND / HYPOTHESIS</strong><span>Zniknięcie i teleportacja należą do narracji.</span></div>
            <div className="hf-legend-row"><i style={{ backgroundColor: '#79e1d3' }} /><strong>HYPOTHETICAL_VISUALIZATION</strong><span>Statek i pole są ilustracją założeń.</span></div>
            <div className="hf-legend-row"><i style={{ backgroundColor: '#ff847b' }} /><strong>REAL_ENGINE</strong><span>Brak — potrzebny solver Maxwella i dane.</span></div>
          </> : <>
            <span className="hf-control-label">JĘZYK EPIDEMII</span>
            {LEGEND.map(([key, label, color]) => <div className="hf-legend-row" key={key}><i style={{ backgroundColor: color }} /><strong>{key}</strong><span>{label}</span></div>)}
            <p><b>Puls</b> = ciężkość · <b>obwódka</b> = izolacja · <b>krzyż</b> = hospitalizacja</p>
          </>}
        </aside>

        <aside className="hf-event-card" aria-live="polite">
          {philadelphiaScenario ? <>
            <span className="hf-control-label">GRANICA FIZYKI</span>
            <strong>Brak wyniku eksperymentalnego</strong>
            <p>Znana fizyka elektromagnetyzmu nie zapewnia tu mechanizmu teleportacji. Do analizy pola potrzebne są geometria, materiały, warunki brzegowe i zwalidowany solver Maxwella.</p>
          </> : <>
            <span className="hf-control-label">PRAWDZIWY EVENT</span>
            {event ? <>
              <strong>Transmisja A → B</strong>
              <p>dzień {event.day.toFixed(2)} · #{event.from} → #{event.to}</p>
              <button onClick={showEvent}>POKAŻ W ŚWIECIE</button>
            </> : <p>Czekam na transmisję odczytaną z modelu. Nie tworzę zdarzenia zastępczego.</p>}
          </>}
        </aside>

        <footer className="hf-proof-strip">
          {philadelphiaScenario ? <>
            <span><b>ROUTE</b> Experiment Fabric → confirmed HYPOTHETICAL_VISUALIZATION</span>
            <span><b>PROVENANCE</b> source-bound history / legend classification</span>
            <span><b>NO DATA</b> brak pomiarów i liczb eksperymentalnych</span>
            <span><b>render</b> {(stats.webgl_render_ms ?? 0).toFixed(1)} ms</span>
          </> : <>
            <span><b>LOD0</b> {stats.hf_lod0_ready ? 'CC0 GLB gotowy' : 'CC0 GLB na żądanie'}</span>
            <span><b>LOD1</b> {stats.hf_lod1_agents ?? 0} bliskich agentów</span>
            <span><b>LOD2</b> {stats.hf_lod2_agents ?? 0} crowd</span>
            <span><b>PBR</b> asfalt · beton · cegła</span>
            <span><b>render</b> {(stats.webgl_render_ms ?? 0).toFixed(1)} ms</span>
          </>}
        </footer>
      </section>

      <section className="hf-proof-notes">
        <article>
          <span className="hf-kicker">RZECZYWISTY ŚWIAT</span>
          <h2>Ulica, ludzie i analityka w jednym modelu.</h2>
          <p>Fragment czyta pozycje, ruch, stany SEIRD, izolację oraz hospitalizację bezpośrednio z aktywnej symulacji. PBR i cinematic camera są wyłącznie warstwą prezentacji.</p>
        </article>
        <article>
          <span className="hf-kicker">WYBRANY AGENT</span>
          {agent ? <><h2>Osoba #{selectedId}</h2><p>{String(agent.rola)} · {String(agent.wiek)} lat · stan {String(agent.stan)} · {String(agent.zachowanie)}</p></> : <><h2>Wybierz postać na scenie.</h2><p>Kliknij LOD0/LOD1 albo użyj AGENT CLOSE-UP. Nie powstaje osobna postać demonstracyjna.</p></>}
        </article>
        <article>
          <span className="hf-kicker">GRANICA PROOFU</span>
          <h2>Jeden fragment przed skalą miasta.</h2>
          <p>Canvas 2D pozostaje pod <code>#/city</code>; pełne miasto WebGL pod <code>#/city3d</code>. Ta trasa sprawdza jakość asset pipeline’u i LOD przed ich skalowaniem.</p>
        </article>
      </section>
    </main>
  );
}
