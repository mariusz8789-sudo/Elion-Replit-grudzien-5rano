import { useEffect, useState } from 'react';
import { realityEngine } from '../core/reality/RealityEngine';
import { buildOrbitalModelGraph } from '../core/modelGraph/orbitalGraph';
import { OrbitalRealityScene } from '../core/reality/scenes/orbitalScene';
import { RealityBranchStore, type RealityBranch } from '../core/reality/branches';
import { HonestyBadge } from './HonestyBadge';
import type { NodeDerivation, PropagationStep } from '../core/modelGraph/graph';

/**
 * Reality Navigator — prototyp „żywej, obliczeniowej rzeczywistości" na
 * bazie Consequence Chain Engine (core/modelGraph) i persystentnego silnika
 * 3D (core/reality). Nie zastępuje żadnego z 13 zweryfikowanych laboratoriów.
 *
 * Pętla dowodząca architektury: użytkownik zmienia parametr (masa gwiazdy
 * LUB promień orbity) → Scientific Model Graph przelicza konsekwencje w
 * PRAWDZIWEJ kolejności zależności, zapisując dla każdej „co ją spowodowało"
 * (causedBy) → kamera (jawnie 'cinematic') odwiedza dokładnie tę kolejność →
 * panel pokazuje te same kroki jako tekst z etykietą wyprowadzenia
 * (direct/approximate/interpretive). Nic nie dzieje się „za kulisami".
 */

const MASS_MIN = 0.3;
const MASS_MAX = 8;
const RADIUS_MIN = 0.3;
const RADIUS_MAX = 5;

/**
 * Graf, scena i gałęzie żyją NA POZIOMIE MODUŁU (nie w stanie komponentu),
 * bo <RealityNavigator> odmontowuje się przy wyjściu z trasy #/reality, a
 * persystentny silnik i jego stan mają przetrwać (patrz RealityEngine.ts).
 */
const orbitalGraph = buildOrbitalModelGraph();
const orbitalScene = new OrbitalRealityScene(orbitalGraph);
const branchStore = new RealityBranchStore('Znajomy świat', orbitalGraph.getParameterSnapshot());

const DERIVATION_LABEL: Record<NodeDerivation, string> = {
  direct: 'wyprowadzenie dokładne',
  approximate: 'model przybliżony',
  interpretive: 'interpretacja / most',
};

function useRealityPoll(intervalMs = 120) {
  const [, setTick] = useState(0);
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
}

export function RealityNavigator() {
  const [mass, setMass] = useState(orbitalGraph.getValue('centralMassSolar'));
  const [radius, setRadius] = useState(orbitalGraph.getValue('orbitalRadiusAu'));
  const [lastSteps, setLastSteps] = useState<PropagationStep[]>([]);
  const [branches, setBranches] = useState<RealityBranch[]>(branchStore.listBranches());
  const [activeBranchId, setActiveBranchId] = useState(branchStore.getActive().id);
  const [compareBranchId, setCompareBranchId] = useState<string | null>(null);
  useRealityPoll();

  // Ładowanie silnika 3D jest asynchroniczne (RealityCanvas.tsx). Bez ref-owego
  // „raz na zawsze": StrictMode wywołuje efekt podwójnie i strażnik ref
  // blokowałby przetrwałe wywołanie. isSceneActive() zapobiega ponownemu
  // setScene() przy powrocie na trasę (scena już żyje w silniku).
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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return branchStore.subscribe(() => {
      setBranches(branchStore.listBranches());
      setActiveBranchId(branchStore.getActive().id);
    });
  }, []);

  // Reality Transit: gdy przejście stanu (transit.ts) dobiega 'complete',
  // silnik oddaje kontekst — DOPIERO WTEDY faktycznie stosujemy snapshot
  // gałęzi docelowej. Efekt: „najpierw stan przejścia, potem zamiana".
  useEffect(() => {
    realityEngine.setOnTransitComplete((ctx) => {
      const target = branchStore.getBranch(ctx.toBranchId);
      branchStore.setActive(ctx.toBranchId);
      applySnapshot(target.parameters);
    });
    return () => realityEngine.setOnTransitComplete(null);
  }, []);

  function applySnapshot(snapshot: Record<string, number>) {
    const steps = orbitalGraph.applyParameterSnapshot(snapshot);
    if (steps.length > 0) setLastSteps(steps);
    setMass(orbitalGraph.getValue('centralMassSolar'));
    setRadius(orbitalGraph.getValue('orbitalRadiusAu'));
    const flight = orbitalScene.buildConsequenceFlight(steps);
    if (flight) realityEngine.playFlight(flight);
    orbitalScene.emitShockwave(steps);
  }

  function applyParam(id: 'centralMassSolar' | 'orbitalRadiusAu', value: number) {
    if (id === 'centralMassSolar') setMass(value); else setRadius(value);
    const steps = orbitalGraph.setParameter(id, value);
    setLastSteps(steps);
    const flight = orbitalScene.buildConsequenceFlight(steps);
    if (flight) realityEngine.playFlight(flight);
    orbitalScene.emitShockwave(steps);
  }

  function handleCreateBranch() {
    const snap = orbitalGraph.getParameterSnapshot();
    const branch = branchStore.createBranch(activeBranchId, `M=${snap.centralMassSolar.toFixed(1)} · a=${snap.orbitalRadiusAu.toFixed(1)}`, snap);
    branchStore.setActive(branch.id);
  }

  function handleSwitchBranch(id: string) {
    if (id === activeBranchId || realityEngine.isTransiting) return;
    // Reality Transit: uruchamiamy PRZEJŚCIE STANU; faktyczna zamiana gałęzi
    // nastąpi w onTransitComplete, nie tu — patrz wyżej.
    realityEngine.beginTransit({
      fromBranchId: activeBranchId,
      toBranchId: id,
      fromSceneId: orbitalScene.id,
      toSceneId: orbitalScene.id,
    });
  }

  function handleToggleCompare(id: string) {
    if (compareBranchId === id) {
      setCompareBranchId(null);
      orbitalScene.clearGhost();
      return;
    }
    setCompareBranchId(id);
    orbitalScene.showGhost(branchStore.getBranch(id).parameters);
  }

  const stats = realityEngine.getSceneStats();
  const flightState = realityEngine.flightState;
  const transit = realityEngine.transitState;
  const compareBranch = compareBranchId ? branchStore.getBranch(compareBranchId) : null;
  const diffEntries = compareBranchId ? branchStore.diff(activeBranchId, compareBranchId) : [];

  return (
    <div className="reality-shell">
      <div className="reality-stage-spacer" aria-hidden="true" />
      <div className="reality-hud">
        {transit.phase !== 'idle' && (
          <div className="reality-flight-caption transit">
            <span className="mdot on" aria-hidden="true" /> Reality Transit — {transit.phase} ({Math.round(transit.progress * 100)}%)
          </div>
        )}
        {transit.phase === 'idle' && flightState.active && flightState.label && (
          <div className="reality-flight-caption">
            <span className="mdot on" aria-hidden="true" /> {flightState.label}
          </div>
        )}
      </div>

      <div className="reality-panel">
        <HonestyBadge
          level="exact"
          note="Wszystkie wielkości pochodzą z prawdziwego Scientific Model Graph (core/modelGraph) — te same, wcześniej zweryfikowane wzory co Universe Lab (III prawo Keplera, vis-viva, M/r³). Zmieniasz jeden parametr; reszta jest PRZELICZANA w kolejności zależności, nie animowana ręcznie."
        />
        <HonestyBadge
          level="cinematic"
          note="Trasa lotu kamery, fala przyczynowa i tunel Reality Transit to warstwa reżyserska — pokazują KOLEJNOŚĆ i drogę obliczeń, nigdy nie zmieniają wartości fizycznych."
        />

        <div className="control">
          <label>Masa gwiazdy centralnej — {mass.toFixed(2)} M☉</label>
          <input type="range" min={MASS_MIN} max={MASS_MAX} step={0.05} value={mass}
            disabled={realityEngine.isTransiting}
            onChange={(e) => applyParam('centralMassSolar', Number(e.target.value))} />
        </div>
        <div className="control">
          <label>Promień orbity — {radius.toFixed(2)} AU</label>
          <input type="range" min={RADIUS_MIN} max={RADIUS_MAX} step={0.05} value={radius}
            disabled={realityEngine.isTransiting}
            onChange={(e) => applyParam('orbitalRadiusAu', Number(e.target.value))} />
        </div>

        <div className="reality-stats">
          <div className="stat"><span className="k">Okres orbitalny</span><span className="v">{stats.orbitalPeriodYears?.toFixed(2) ?? '—'} lat</span></div>
          <div className="stat"><span className="k">Prędkość orbitalna</span><span className="v">{stats.orbitalSpeedAuPerYear?.toFixed(2) ?? '—'} AU/rok</span></div>
          <div className="stat"><span className="k">Względna siła pływowa</span><span className="v">{stats.relativeTidalStrength?.toFixed(2) ?? '—'}×</span></div>
        </div>

        {lastSteps.length > 0 && (
          <div className="reality-log" aria-label="Łańcuch konsekwencji w Scientific Model Graph">
            <div className="section-label">Łańcuch konsekwencji — co się zmieniło i dlaczego</div>
            {lastSteps.map((s) => {
              const node = orbitalGraph.getNode(s.nodeId);
              const causes = s.causedBy.map((c) => orbitalGraph.getNode(c)?.label ?? c);
              return (
                <div key={s.nodeId} className={`reality-log-row deriv-${node?.derivation ?? 'direct'}`}>
                  <div className="reality-log-main">
                    <span className="reality-log-node">{node?.label ?? s.nodeId}</span>
                    <span className="reality-log-val">{s.previousValue.toFixed(2)} → {s.value.toFixed(2)} {node?.unit}</span>
                  </div>
                  <div className="reality-log-meta">
                    <span className={`reality-deriv ${node?.derivation ?? 'direct'}`}>{DERIVATION_LABEL[node?.derivation ?? 'direct']}</span>
                    {causes.length > 0 && <span className="reality-cause">← bo zmieniło się: {causes.join(', ')}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="reality-branches">
          <div className="section-label">Gałęzie rzeczywistości</div>
          <div className="reality-branch-list">
            {branches.map((b) => (
              <div key={b.id} className="reality-branch-item">
                <button className="chip-btn" aria-pressed={b.id === activeBranchId}
                  disabled={realityEngine.isTransiting}
                  onClick={() => handleSwitchBranch(b.id)}>
                  {b.id === activeBranchId ? '● ' : ''}{b.label}
                </button>
                {b.id !== activeBranchId && (
                  <button className="chip-btn ghost-btn" aria-pressed={b.id === compareBranchId}
                    title="Pokaż tę gałąź obok bieżącej (porównanie przestrzenne)"
                    onClick={() => handleToggleCompare(b.id)}>
                    {b.id === compareBranchId ? '✕ porównanie' : '⇄ porównaj'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="chip-btn" disabled={realityEngine.isTransiting} onClick={handleCreateBranch}>
            ↻ Utwórz gałąź z bieżącego stanu
          </button>
          {compareBranch && (
            <div className="reality-compare">
              <div className="section-label">Porównanie: {branchStore.getActive().label} vs {compareBranch.label}</div>
              {diffEntries.length === 0 && <div className="reality-compare-row">Gałęzie mają identyczne parametry.</div>}
              {diffEntries.map((d) => (
                <div key={d.key} className="reality-compare-row">
                  <span className="reality-log-node">{orbitalGraph.getNode(d.key)?.label ?? d.key}</span>
                  <span className="reality-log-val">{d.a.toFixed(2)} vs {d.b.toFixed(2)}</span>
                </div>
              ))}
              <div className="reality-compare-hint">Druga rzeczywistość jest widoczna w scenie jako półprzezroczysty „duch".</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
