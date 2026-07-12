import { useEffect, useState } from 'react';
import { realityEngine } from '../core/reality/RealityEngine';
import { buildOrbitalModelGraph } from '../core/modelGraph/orbitalGraph';
import { OrbitalRealityScene } from '../core/reality/scenes/orbitalScene';
import { RealityBranchStore, type RealityBranch } from '../core/reality/branches';
import { HonestyBadge } from './HonestyBadge';
import type { PropagationStep } from '../core/modelGraph/graph';

/**
 * Reality Navigator — pierwszy prototyp "żywej, kinowej rzeczywistości
 * obliczeniowej" (patrz core/reality/*, core/modelGraph/*). Nie zastępuje
 * żadnego z 13 zweryfikowanych laboratoriów — to nowy, osobny workspace,
 * który REUŻYWA ich fizyki (core/physics.ts) na nowej warstwie renderującej.
 *
 * Pętla dowodząca architektury: użytkownik zmienia masę gwiazdy
 * centralnej → Scientific Model Graph przelicza okres orbitalny, prędkość
 * i siłę pływową w PRAWDZIWEJ kolejności zależności → kamera (jawnie
 * oznaczona jako 'cinematic') odwiedza dokładnie tę kolejność węzłów, nie
 * wyreżyserowaną animację → panel zdarzeń pokazuje te same kroki jako
 * tekst, więc nic nie dzieje się "ukryte za kulisami".
 */

const MASS_MIN = 0.3;
const MASS_MAX = 8;
const BASELINE_MASS_FALLBACK = 1;

/**
 * Graf, scena i gałęzie żyją NA POZIOMIE MODUŁU (nie w stanie komponentu),
 * dokładnie z tego samego powodu co realityEngine (patrz RealityEngine.ts):
 * <RealityNavigator> odmontowuje się przy każdym wyjściu z trasy #/reality
 * (App.tsx renderuje go tylko wewnątrz gałęzi 'reality'), więc gdyby graf/
 * scena żyły w useMemo tego komponentu, powrót na trasę tworzyłby je od
 * zera — masa, okres, kamera wracałyby do wartości domyślnych, mimo że
 * SAM canvas/renderer (RealityEngine) faktycznie przetrwał. To był realny
 * błąd złapany dopiero przez ręczny test "wejdź do laba i wróć" — patrz
 * commit message.
 */
const orbitalGraph = buildOrbitalModelGraph();
const orbitalScene = new OrbitalRealityScene(orbitalGraph);
const branchStore = new RealityBranchStore('Znajomy świat', { centralMassSolar: orbitalGraph.getValue('centralMassSolar') });

function useRealityPoll(intervalMs = 150) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last > intervalMs) {
        last = now;
        setTick((t) => t + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [intervalMs]);
  return tick;
}

export function RealityNavigator() {
  const [mass, setMass] = useState(orbitalGraph.getValue('centralMassSolar'));
  const [lastSteps, setLastSteps] = useState<PropagationStep[]>([]);
  const [branches, setBranches] = useState<RealityBranch[]>(branchStore.listBranches());
  const [activeBranchId, setActiveBranchId] = useState(branchStore.getActive().id);
  useRealityPoll();

  // Ładowanie silnika 3D jest asynchroniczne (RealityCanvas.tsx: dynamiczny
  // import three.js) — czekamy, aż realityEngine będzie gotowy. Świadomie
  // BEZ ref-owego "uruchom raz na zawsze": w React StrictMode (dev) każdy
  // efekt jest wywoływany dwukrotnie (mount → cleanup → mount) właśnie po
  // to, by wykryć brakujące sprzątanie — strażnik oparty na ref blokowałby
  // DRUGIE (przetrwałe) wywołanie efektu, podczas gdy pętla z PIERWSZEGO
  // zostałaby anulowana przez własny cleanup, więc setScene() nigdy by się
  // nie wykonał. Każde wywołanie efektu ma WŁASNE domknięcie `cancelled`.
  //
  // isSceneActive() pilnuje DRUGIEGO, niezależnego problemu: ten komponent
  // odmontowuje się za każdym wyjściem z trasy #/reality (patrz komentarz
  // przy module-level orbitalScene wyżej) i montuje się PONOWNIE przy
  // powrocie — bez tej strażniczki każdy powrót wywoływałby setScene() od
  // nowa, odtwarzając scenę i odpalając intro-lot, mimo że silnik już ma
  // dokładnie tę samą scenę aktywną.
  useEffect(() => {
    let cancelled = false;
    const trySet = () => {
      if (cancelled) return;
      if (realityEngine.isReady) {
        if (!realityEngine.isSceneActive(orbitalScene)) realityEngine.setScene(orbitalScene, 1.8);
      } else {
        setTimeout(trySet, 80);
      }
    };
    trySet();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return branchStore.subscribe(() => {
      setBranches(branchStore.listBranches());
      setActiveBranchId(branchStore.getActive().id);
    });
  }, []);

  function applyMass(nextMass: number) {
    setMass(nextMass);
    const steps = orbitalGraph.setParameter('centralMassSolar', nextMass);
    setLastSteps(steps);
    const flight = orbitalScene.buildConsequenceFlight(steps);
    if (flight) realityEngine.playFlight(flight);
  }

  function handleCreateBranch() {
    const branch = branchStore.createBranch(activeBranchId, `Gałąź M=${mass.toFixed(2)}`, { centralMassSolar: mass });
    branchStore.setActive(branch.id);
  }

  function handleSwitchBranch(id: string) {
    if (id === activeBranchId) return;
    branchStore.setActive(id);
    const target = branchStore.getBranch(id);
    applyMass(target.parameters.centralMassSolar ?? BASELINE_MASS_FALLBACK);
  }

  const stats = realityEngine.getSceneStats();
  const flightState = realityEngine.flightState;

  return (
    <div className="reality-shell">
      <div className="reality-stage-spacer" aria-hidden="true" />
      <div className="reality-hud">
        {flightState.active && flightState.label && (
          <div className="reality-flight-caption">
            <span className="mdot on" aria-hidden="true" /> {flightState.label}
          </div>
        )}
      </div>

      <div className="reality-panel">
        <HonestyBadge
          level="exact"
          note="Okres orbitalny, prędkość i siła pływowa pochodzą z prawdziwego Scientific Model Graph (core/modelGraph) — te same, wcześniej zweryfikowane wzory co Universe Lab (III prawo Keplera, równanie vis-viva). Zmieniasz jedną liczbę (masę); reszta jest przeliczana, nie animowana ręcznie."
        />
        <HonestyBadge
          level="cinematic"
          note="Trasa lotu kamery i tempo przejścia to reżyserska decyzja Reality Navigatora, nie przewidywanie fizyczne — sekwencer nigdy nie zmienia wartości fizycznych, tylko kolejność i sposób, w jaki je oglądasz."
        />

        <div className="control">
          <label>Masa gwiazdy centralnej — {mass.toFixed(2)} M☉</label>
          <input
            type="range"
            min={MASS_MIN}
            max={MASS_MAX}
            step={0.05}
            value={mass}
            onChange={(e) => applyMass(Number(e.target.value))}
          />
        </div>

        <div className="reality-stats">
          <div className="stat"><span className="k">Okres orbitalny</span><span className="v">{stats.orbitalPeriodYears?.toFixed(2) ?? '—'} lat</span></div>
          <div className="stat"><span className="k">Prędkość orbitalna</span><span className="v">{stats.orbitalSpeedAuPerYear?.toFixed(2) ?? '—'} AU/rok</span></div>
          <div className="stat"><span className="k">Względna siła pływowa</span><span className="v">{stats.relativeTidalStrength?.toFixed(2) ?? '—'}×</span></div>
        </div>

        {lastSteps.length > 0 && (
          <div className="reality-log" aria-label="Kolejność propagacji w Scientific Model Graph">
            <div className="section-label">Rzeczywista kolejność obliczeń</div>
            {lastSteps.map((s) => (
              <div key={s.nodeId} className="reality-log-row">
                <span className="reality-log-node">{orbitalGraph.getNode(s.nodeId)?.label ?? s.nodeId}</span>
                <span className="reality-log-val">{s.previousValue.toFixed(2)} → {s.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="reality-branches">
          <div className="section-label">Gałęzie rzeczywistości</div>
          <div className="reality-branch-list">
            {branches.map((b) => (
              <button
                key={b.id}
                className="chip-btn"
                aria-pressed={b.id === activeBranchId}
                onClick={() => handleSwitchBranch(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <button className="chip-btn" onClick={handleCreateBranch}>
            ↻ Utwórz gałąź z bieżącego stanu
          </button>
        </div>
      </div>
    </div>
  );
}
