import { useEffect, useState } from 'react';
import { realityEngine } from '../core/reality/RealityEngine';
import { buildPumpPipeModel } from '../core/engineeringGraph/pumpPipe';
import { PumpPipeRealityScene } from '../core/reality/scenes/pumpPipeScene';
import { RealityBranchStore, type RealityBranch } from '../core/reality/branches';
import { PROVENANCE_LABEL, type Provenance } from '../core/engineeringGraph/provenance';
import { HonestyBadge } from './HonestyBadge';
import type { NodeDerivation, PropagationStep } from '../core/modelGraph/graph';

/**
 * Machine Pre-Build Navigator (Faza 1) — uczciwy symulator KONCEPCYJNY układu
 * pompa–rurociąg. Odpowiada na pytanie: „jeśli zbuduję tę maszynę z tymi
 * parametrami, jakich konsekwencji oczekiwać, które założenia dominują wynik i
 * co trzeba fizycznie zmierzyć przed budową?".
 *
 * To NIE jest CFD/FEA i NIE zastępuje badań fizycznych — każdy wynik nosi
 * prowieniencję (skąd pochodzi liczba), a wielkości oparte na modelach
 * empirycznych lub oszacowaniach są WYRAŹNIE oddzielone od tych policzonych z
 * dokładnych wejść. Ranking wrażliwości i rekomendacje pomiarowe wynikają ze
 * stanu grafu, nie z generowanego tekstu.
 */

interface ParamMeta { id: string; label: string; unit: string; min: number; max: number; step: number; decimals: number; }
const PARAMS: ParamMeta[] = [
  { id: 'volumetricFlow', label: 'Przepływ Q', unit: 'm³/s', min: 0.005, max: 0.2, step: 0.005, decimals: 3 },
  { id: 'pipeDiameter', label: 'Średnica D', unit: 'm', min: 0.05, max: 0.3, step: 0.005, decimals: 3 },
  { id: 'pipeLength', label: 'Długość L', unit: 'm', min: 10, max: 500, step: 5, decimals: 0 },
  { id: 'pipeRoughness', label: 'Chropowatość ε', unit: 'mm', min: 0.001, max: 1, step: 0.001, decimals: 3 },
  { id: 'staticLift', label: 'Podnoszenie H_stat', unit: 'm', min: 0, max: 60, step: 1, decimals: 0 },
  { id: 'fluidDensity', label: 'Gęstość ρ', unit: 'kg/m³', min: 700, max: 1200, step: 1, decimals: 0 },
  { id: 'fluidViscosity', label: 'Lepkość μ', unit: 'Pa·s', min: 0.0003, max: 0.002, step: 0.0001, decimals: 4 },
  { id: 'pumpEfficiency', label: 'Sprawność η', unit: '-', min: 0.3, max: 0.9, step: 0.01, decimals: 2 },
];

interface OutputMeta { id: string; label: string; unit: string; decimals: number; scale?: number; }
const OUTPUTS: OutputMeta[] = [
  { id: 'flowVelocity', label: 'Prędkość v', unit: 'm/s', decimals: 2 },
  { id: 'reynolds', label: 'Reynolds Re', unit: '', decimals: 0 },
  { id: 'frictionFactor', label: 'Wsp. tarcia f', unit: '', decimals: 4 },
  { id: 'headLoss', label: 'Strata h_f', unit: 'm', decimals: 2 },
  { id: 'totalHead', label: 'Całk. wysokość H', unit: 'm', decimals: 2 },
  { id: 'hydraulicPower', label: 'Moc hydrauliczna', unit: 'kW', decimals: 2, scale: 1 / 1000 },
  { id: 'shaftPower', label: 'Moc na wale', unit: 'kW', decimals: 2, scale: 1 / 1000 },
];

const DERIVATION_LABEL: Record<NodeDerivation, string> = {
  direct: 'wyprowadzenie dokładne',
  approximate: 'model przybliżony',
  interpretive: 'interpretacja / most',
};

function provClass(p: Provenance): string {
  if (p === 'measured' || p === 'manufacturer' || p === 'user-provided') return 'prov-strong';
  if (p === 'calculated') return 'prov-calc';
  if (p === 'empirical-model') return 'prov-empirical';
  return 'prov-weak'; // engineering-estimate / requires-validation
}

/**
 * Model, scena i gałęzie żyją NA POZIOMIE MODUŁU (jak w RealityNavigator), bo
 * komponent odmontowuje się przy wyjściu z trasy #/prebuild, a persystentny
 * silnik 3D i jego stan mają przetrwać (patrz RealityEngine.ts).
 */
const pumpModel = buildPumpPipeModel();
const pumpScene = new PumpPipeRealityScene(pumpModel);
const branchStore = new RealityBranchStore('Projekt A', pumpModel.getParameterSnapshot());

function fmt(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e5) return v.toExponential(2);
  return v.toFixed(decimals);
}

function useRealityPoll(intervalMs = 120) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last > intervalMs) { last = now; setTick((t) => t + 1); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [intervalMs]);
}

export function EngineeringNavigator() {
  const [, setVersion] = useState(0);
  const [lastSteps, setLastSteps] = useState<PropagationStep[]>([]);
  const [sensOutput, setSensOutput] = useState('shaftPower');
  const [agedPipe, setAgedPipe] = useState(false);
  const [branches, setBranches] = useState<RealityBranch[]>(branchStore.listBranches());
  const [activeBranchId, setActiveBranchId] = useState(branchStore.getActive().id);
  const [compareBranchId, setCompareBranchId] = useState<string | null>(null);
  useRealityPoll();

  useEffect(() => {
    let cancelled = false;
    const trySet = () => {
      if (cancelled) return;
      if (realityEngine.isReady) {
        if (!realityEngine.isSceneActive(pumpScene)) realityEngine.setScene(pumpScene, 1.8);
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

  useEffect(() => {
    realityEngine.setOnTransitComplete((ctx) => {
      const target = branchStore.getBranch(ctx.toBranchId);
      branchStore.setActive(ctx.toBranchId);
      applySnapshot(target.parameters);
    });
    return () => realityEngine.setOnTransitComplete(null);
  }, []);

  function playConsequence(steps: PropagationStep[]) {
    const flight = pumpScene.buildConsequenceFlight(steps);
    if (flight) realityEngine.playFlight(flight);
    pumpScene.emitComponentWave(steps);
  }

  function applySnapshot(snapshot: Record<string, number>) {
    const steps = pumpModel.applyParameterSnapshot(snapshot);
    if (steps.length > 0) { setLastSteps(steps); playConsequence(steps); }
    setVersion((v) => v + 1);
  }

  function applyParam(id: string, value: number) {
    const steps = pumpModel.setParameter(id, value);
    setLastSteps(steps);
    playConsequence(steps);
    setVersion((v) => v + 1);
  }

  function toggleAgedPipe() {
    const next = !agedPipe;
    setAgedPipe(next);
    // Degradacja prowieniencji: nowa stal (dane producenta) -> stara/skorodowana
    // (wymaga walidacji fizycznej). Propaguje się na h_f, H, moce (validationLimited).
    pumpModel.setParameterProvenance('pipeRoughness', next ? 'requires-validation' : 'manufacturer');
    setVersion((v) => v + 1);
  }

  function handleCreateBranch() {
    const snap = pumpModel.getParameterSnapshot();
    const label = `D=${snap.pipeDiameter.toFixed(2)} · η=${snap.pumpEfficiency.toFixed(2)}`;
    const branch = branchStore.createBranch(activeBranchId, label, snap);
    branchStore.setActive(branch.id);
  }

  function handleSwitchBranch(id: string) {
    if (id === activeBranchId || realityEngine.isTransiting) return;
    realityEngine.beginTransit({
      fromBranchId: activeBranchId, toBranchId: id,
      fromSceneId: pumpScene.id, toSceneId: pumpScene.id,
    });
  }

  function handleToggleCompare(id: string) {
    if (compareBranchId === id) {
      setCompareBranchId(null);
      pumpScene.clearGhost();
      return;
    }
    setCompareBranchId(id);
    pumpScene.showGhost(branchStore.getBranch(id).parameters);
  }

  const transit = realityEngine.transitState;
  const flightState = realityEngine.flightState;
  const ranking = pumpModel.sensitivityRanking(sensOutput);
  const maxMag = ranking.length > 0 ? Math.max(...ranking.map((r) => r.magnitude), 1e-9) : 1;
  const recs = pumpModel.measurementRecommendations(sensOutput);
  const compareBranch = compareBranchId ? branchStore.getBranch(compareBranchId) : null;
  const diffEntries = compareBranchId ? branchStore.diff(activeBranchId, compareBranchId) : [];
  const labelOf = (id: string) => pumpModel.graph.getNode(id)?.label ?? id;

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

      <div className="reality-panel prebuild-panel">
        <div className="prebuild-warning" role="note">
          <strong>Symulacja koncepcyjna — NIE walidacja fizyczna.</strong> To pre-build:
          wzory podręcznikowe (Darcy–Weisbach, Swamee–Jain, Reynolds), nie CFD/FEA. Nie
          zastępuje pomiarów ani prototypu. Każdy wynik ma prowieniencję; poniżej widać,
          co trzeba zmierzyć, zanim oprzesz na tym decyzję.
        </div>

        <HonestyBadge
          level="exact"
          note="Wielkości pochodzą z wykonywalnego grafu inżynierskiego (core/engineeringGraph) — dokładne definicje (v=Q/A, Re=ρvD/μ, Darcy–Weisbach, P=ρgQH) plus JEDEN model empiryczny (Swamee–Jain dla f), jawnie oznaczony. Zmieniasz parametr; reszta jest PRZELICZANA w kolejności zależności."
        />
        <HonestyBadge
          level="cinematic"
          note="Trasa lotu kamery, fala rozświetlająca komponenty i tunel Reality Transit to warstwa reżyserska — pokazują KOLEJNOŚĆ obliczeń przez maszynę, nigdy nie zmieniają wartości. Scena 3D to SCHEMAT, nie symulacja przepływu."
        />

        <label className="prebuild-toggle">
          <input type="checkbox" checked={agedPipe} onChange={toggleAgedPipe} disabled={realityEngine.isTransiting} />
          Rura stara / skorodowana (chropowatość → <em>wymaga walidacji fizycznej</em>)
        </label>

        <div className="section-label">Parametry projektu</div>
        <div className="prebuild-params">
          {PARAMS.map((p) => {
            const prov = pumpModel.parameterProvenance(p.id);
            const val = pumpModel.getValue(p.id);
            return (
              <div key={p.id} className="param-row">
                <div className="param-head">
                  <label htmlFor={`pp-${p.id}`}>{p.label} — {fmt(val, p.decimals)} {p.unit}</label>
                  <span className={`prov-chip ${provClass(prov)}`} title="Prowieniencja parametru">{PROVENANCE_LABEL[prov]}</span>
                </div>
                <input id={`pp-${p.id}`} type="range" min={p.min} max={p.max} step={p.step} value={val}
                  disabled={realityEngine.isTransiting}
                  onChange={(e) => applyParam(p.id, Number(e.target.value))} />
              </div>
            );
          })}
        </div>

        <div className="section-label">Konsekwencje — obliczone, empiryczne i oszacowane osobno</div>
        <div className="prebuild-outputs">
          {OUTPUTS.map((o) => {
            const eff = pumpModel.effectiveProvenance(o.id);
            const raw = pumpModel.getValue(o.id) * (o.scale ?? 1);
            return (
              <div key={o.id} className={`output-row ${provClass(eff.provenance)}`}>
                <span className="output-label">{o.label}</span>
                <span className="output-val">{fmt(raw, o.decimals)} {o.unit}</span>
                <span className={`prov-chip ${provClass(eff.provenance)}`}>
                  {PROVENANCE_LABEL[eff.provenance]}{eff.validationLimited ? ' ⚠' : ''}
                </span>
              </div>
            );
          })}
          <div className="prebuild-hint">
            ⚠ = w łańcuchu tej wielkości leży wejście „wymaga walidacji fizycznej" — nie prezentuj jako fakt.
          </div>
        </div>

        {lastSteps.length > 0 && (
          <div className="reality-log" aria-label="Łańcuch konsekwencji w grafie inżynierskim">
            <div className="section-label">Łańcuch przyczynowy — co się zmieniło i dlaczego</div>
            {lastSteps.map((s) => {
              const node = pumpModel.graph.getNode(s.nodeId);
              const causes = s.causedBy.map((c) => labelOf(c));
              return (
                <div key={s.nodeId} className={`reality-log-row deriv-${node?.derivation ?? 'direct'}`}>
                  <div className="reality-log-main">
                    <span className="reality-log-node">{node?.label ?? s.nodeId}</span>
                    <span className="reality-log-val">{fmt(s.previousValue, 2)} → {fmt(s.value, 2)} {node?.unit}</span>
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

        <div className="prebuild-sensitivity">
          <div className="section-label">Wrażliwość — co najmocniej steruje wynikiem</div>
          <div className="sens-output-tabs">
            {['headLoss', 'shaftPower', 'totalHead'].map((id) => (
              <button key={id} className="chip-btn" aria-pressed={sensOutput === id}
                onClick={() => setSensOutput(id)}>{labelOf(id)}</button>
            ))}
          </div>
          {ranking.slice(0, 5).map((r) => {
            const prov = pumpModel.parameterProvenance(r.parameterId);
            return (
              <div key={r.parameterId} className="sens-row">
                <span className="sens-label">{labelOf(r.parameterId)}</span>
                <span className="sens-bar-wrap">
                  <span className="sens-bar" style={{ width: `${(r.magnitude / maxMag) * 100}%` }} />
                </span>
                <span className="sens-elast">E={r.elasticity.toFixed(2)}</span>
                <span className={`prov-chip ${provClass(prov)}`}>{PROVENANCE_LABEL[prov]}</span>
              </div>
            );
          })}
          <div className="prebuild-hint">
            Elastyczność E = (ΔWynik/Wynik)/(ΔParametr/Parametr), liczona różnicą skończoną na grafie.
          </div>
        </div>

        <div className="prebuild-measure">
          <div className="section-label">Co zmierzyć przed budową</div>
          {recs.length === 0 && (
            <div className="measure-empty">
              Dla „{labelOf(sensOutput)}" żaden słabo wsparty parametr nie przekracza progu istotności —
              tool nie fabrykuje ostrzeżeń.
            </div>
          )}
          {recs.map((r) => (
            <div key={r.parameterId} className="measure-item">
              <span className="measure-icon" aria-hidden="true">📏</span>
              <span>{r.message}</span>
            </div>
          ))}
        </div>

        <div className="reality-branches">
          <div className="section-label">Warianty projektu (A vs B)</div>
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
                    title="Pokaż ten wariant obok bieżącego (porównanie przestrzenne)"
                    onClick={() => handleToggleCompare(b.id)}>
                    {b.id === compareBranchId ? '✕ porównanie' : '⇄ porównaj'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="chip-btn" disabled={realityEngine.isTransiting} onClick={handleCreateBranch}>
            ↻ Zapisz bieżący stan jako wariant
          </button>
          {compareBranch && (
            <div className="reality-compare">
              <div className="section-label">Porównanie: {branchStore.getActive().label} vs {compareBranch.label}</div>
              {diffEntries.length === 0 && <div className="reality-compare-row">Warianty mają identyczne parametry.</div>}
              {diffEntries.map((d) => (
                <div key={d.key} className="reality-compare-row">
                  <span className="reality-log-node">{labelOf(d.key)}</span>
                  <span className="reality-log-val">{fmt(d.a, 3)} vs {fmt(d.b, 3)}</span>
                </div>
              ))}
              <div className="reality-compare-hint">Drugi wariant jest widoczny w scenie jako półprzezroczysty „duch".</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
