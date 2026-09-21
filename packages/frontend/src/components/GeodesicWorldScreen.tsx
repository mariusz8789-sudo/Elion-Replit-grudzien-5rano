import { useState } from 'react';
import {
  CRITICAL_IMPACT_PARAMETER_RS, GEODESIC_OUTCOME_CODE,
  RELATIVITY_GEODESIC_SOLVER_ID, buildSchwarzschildGeodesicWorld,
  geodesicOutcomeLabel, makeRelativityGeodesicSolver,
  type GeodesicOutcomeState,
} from '../core/worldModel/domains/relativityGeodesic';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import type { WorldGraph } from '../core/worldModel/ecs/worldGraph';

/**
 * FOTONY WOKÓŁ CZARNEJ DZIURY — the sixth scientific world, finally visible.
 *
 * `core/worldModel/domains/relativityGeodesic.ts` registers the exact null
 * geodesic equation d²u/dφ² = −u + (3/2)·r_s·u² as a real `DomainSolver` over
 * the world model, bit-identical with the Labs runner (its own test proves
 * that rather than asserting it). It was complete, tested, and had no screen,
 * so nobody could watch Genesis integrate general relativity.
 *
 * THIS SCREEN INTEGRATES NOTHING. It builds the world, registers the solver,
 * advances the `TemporalEngine` one tick at a time, and reads each photon's
 * published `spatial.position` — converting to Schwarzschild radii by dividing
 * through the solver's OWN declared `worldUnitsPerSchwarzschildRadius` scalar,
 * which the module exposes precisely so that conversion is auditable instead
 * of folded silently into the coordinates. No trajectory is computed here.
 *
 * WHY THIS IS WORTH LOOKING AT: the capture boundary is a closed-form constant,
 * b_crit = 3√3/2 ≈ 2.598 r_s. Photons launched below it MUST be captured and
 * above it MUST escape. So the plot is checkable against a textbook rather
 * than trusted — the same standard as the dome-world falsification.
 */

/** One photon's published path, in Schwarzschild radii, plus how its orbit ended. */
interface PhotonTrack {
  impactParameterRatio: number;
  impactParameterRs: number;
  points: readonly { x: number; y: number }[];
  outcome: GeodesicOutcomeState;
  minRadiusRs: number;
  turns: number;
  ticks: number;
}

/** Ratios of b/b_crit: two below the capture boundary, two above, one just over. */
const RATIOS: readonly number[] = [0.7, 0.9, 1.01, 1.3, 1.8];
const MAX_TICKS = 4000;

const OUTCOME_COLOR: Readonly<Record<GeodesicOutcomeState, string>> = {
  GEODESIC_CAPTURED: '#ff6b6b',
  GEODESIC_ESCAPED: '#51e2c2',
  GEODESIC_IN_FLIGHT: '#ffd166',
};

const OUTCOME_LABEL: Readonly<Record<GeodesicOutcomeState, string>> = {
  GEODESIC_CAPTURED: 'POCHŁONIĘTY',
  GEODESIC_ESCAPED: 'UCIEKŁ',
  GEODESIC_IN_FLIGHT: 'W LOCIE (limit ticków)',
};

function runPhotons(): readonly PhotonTrack[] {
  const world = buildSchwarzschildGeodesicWorld(RATIOS);
  const router = new SolverRouter();
  router.register(RELATIVITY_GEODESIC_SOLVER_ID, makeRelativityGeodesicSolver());
  const engine = new TemporalEngine(world.graph);
  const updater = (graph: WorldGraph, dt: number, tick: number): void => { router.routeTick(graph, dt, tick); };

  const tracks: { points: { x: number; y: number }[]; ticks: number }[] = RATIOS.map(() => ({ points: [], ticks: 0 }));

  const sample = (): void => {
    world.photonIds.forEach((photonId, index) => {
      const entity = engine.graph.getEntity(photonId);
      const scale = entity.domainState!.worldUnitsPerSchwarzschildRadius as number;
      const position = entity.spatial!.position;
      // The solver's own declared conversion, applied in reverse. Not physics.
      tracks[index]!.points.push({ x: position.x / scale, y: position.z / scale });
    });
  };

  sample();
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const anyInFlight = world.photonIds.some(
      (id) => engine.graph.getEntity(id).domainState!.outcomeCode === GEODESIC_OUTCOME_CODE.IN_FLIGHT,
    );
    if (!anyInFlight) break;
    engine.advance(1, updater);
    sample();
    world.photonIds.forEach((id, index) => {
      if (engine.graph.getEntity(id).domainState!.outcomeCode === GEODESIC_OUTCOME_CODE.IN_FLIGHT) {
        tracks[index]!.ticks = tick + 1;
      }
    });
  }

  return world.photonIds.map((photonId, index) => {
    const state = engine.graph.getEntity(photonId).domainState!;
    return {
      impactParameterRatio: RATIOS[index]!,
      impactParameterRs: state.impactParameterRs as number,
      points: tracks[index]!.points,
      outcome: geodesicOutcomeLabel(state.outcomeCode as number),
      minRadiusRs: state.minRadiusRs as number,
      turns: state.turns as number,
      ticks: tracks[index]!.ticks,
    };
  });
}

/**
 * Plot extent in Schwarzschild radii. FIXED, never auto-fitted: rescaling per
 * run would make every capture look the same distance from the horizon.
 *
 * Photons launch at 40 r_s, so their straight incoming segments run off-frame
 * to the left at this zoom — deliberate, and said so in the caption. Framing
 * the full 40 r_s instead shrinks the horizon to a few pixels and hides the
 * one thing worth seeing: how sharply a near-critical ray bends around it.
 */
const VIEW_RS = 12;
const SIZE = 560;
const toPx = (valueRs: number): number => SIZE / 2 + (valueRs / VIEW_RS) * (SIZE / 2);

export function GeodesicWorldScreen() {
  const [tracks, setTracks] = useState<readonly PhotonTrack[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (): void => {
    setBusy(true);
    try { setTracks(runPhotons()); } finally { setBusy(false); }
  };

  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <section className="pilot-step">
        <p className="settings-hint">
          Każdy foton jest całkowany REALNYM równaniem geodezyjnej zerowej{' '}
          <span className="mono">d²u/dφ² = −u + (3/2)·r_s·u²</span> (RK4), krok po kroku, jako domena świata Genesis —
          ten sam integrator, którego używa laboratorium Einsteina. Ten ekran nic nie liczy: odczytuje pozycje
          publikowane przez solver i dzieli je przez jego własny, jawny współczynnik{' '}
          <span className="mono">worldUnitsPerSchwarzschildRadius</span>.
        </p>
        <p className="settings-hint">
          <strong>Sprawdzalne przewidywanie, nie deklaracja:</strong> granica pochłaniania to stała zamknięta{' '}
          <span className="mono">b_crit = 3√3/2 ≈ {CRITICAL_IMPACT_PARAMETER_RS.toFixed(4)} r_s</span>. Fotony wystrzelone
          poniżej niej MUSZĄ zostać pochłonięte, powyżej — MUSZĄ uciec. Poniższy wykres można sprawdzić z podręcznikiem.
        </p>
        <div className="pilot-actions">
          <button className="chip-btn pilot-primary" data-testid="run-geodesics" onClick={run} disabled={busy}>
            {busy ? 'Całkuję…' : 'Wystrzel fotony'}
          </button>
        </div>
      </section>

      {tracks !== null && (
        <>
          <section className="pilot-step">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ maxWidth: `${SIZE}px`, display: 'block', margin: '0 auto' }}
              role="img" aria-label="Tory fotonów wokół czarnej dziury Schwarzschilda" data-testid="geodesic-plot">
              {/* Horizon (r = 1 r_s) and photon sphere (r = 1.5 r_s) — exact consequences of the metric, not drawn to taste. */}
              <circle cx={SIZE / 2} cy={SIZE / 2} r={(1 / VIEW_RS) * (SIZE / 2)} fill="#000" stroke="#ff6b6b" strokeWidth={1.5} />
              <circle cx={SIZE / 2} cy={SIZE / 2} r={(1.5 / VIEW_RS) * (SIZE / 2)} fill="none" stroke="#ffd166" strokeWidth={1} strokeDasharray="4 4" />
              {tracks.map((track) => (
                <polyline
                  key={track.impactParameterRatio}
                  data-testid={`geodesic-path-${track.impactParameterRatio}`}
                  points={track.points.map((p) => `${toPx(p.x)},${toPx(p.y)}`).join(' ')}
                  fill="none" stroke={OUTCOME_COLOR[track.outcome]} strokeWidth={1.6} opacity={0.9}
                />
              ))}
            </svg>
            <p className="settings-hint" style={{ textAlign: 'center' }}>
              Czerwone koło — horyzont zdarzeń (1 r_s). Żółta przerywana — sfera fotonowa (1,5 r_s). Widok obejmuje
              środkowe ±{VIEW_RS} r_s; fotony startują z 40 r_s, więc ich proste odcinki wlotowe biegną poza kadrem.
            </p>
          </section>

          <section className="pilot-step">
            <div className="compare-table-wrap">
              <table className="compare-table" data-testid="geodesic-table">
                <thead>
                  <tr><th>b / b_crit</th><th>b [r_s]</th><th>wynik</th><th>min. promień [r_s]</th><th>okrążenia</th><th>kroki RK4</th></tr>
                </thead>
                <tbody>
                  {tracks.map((track) => (
                    <tr key={track.impactParameterRatio} data-testid={`geodesic-row-${track.impactParameterRatio}`}>
                      <td className="mono">{track.impactParameterRatio}</td>
                      <td className="mono">{track.impactParameterRs.toFixed(4)}</td>
                      <td className="mono">{OUTCOME_LABEL[track.outcome]}</td>
                      <td className="mono">{track.minRadiusRs.toFixed(4)}</td>
                      <td className="mono">{track.turns.toFixed(3)}</td>
                      <td className="mono">{track.ticks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The check, stated as a check rather than as a conclusion. */}
            <p className="pilot-summary" data-testid="geodesic-verdict">
              {tracks.every((t) => (t.impactParameterRatio < 1
                ? t.outcome === 'GEODESIC_CAPTURED'
                : t.outcome === 'GEODESIC_ESCAPED'))
                ? 'Zgodne z b_crit: każdy foton poniżej granicy został pochłonięty, każdy powyżej — uciekł.'
                : 'NIEZGODNE z b_crit — co najmniej jeden foton zachował się inaczej, niż wymaga stała. To wynik do zbadania, nie do ukrycia.'}
            </p>
            <p className="settings-hint">
              „W LOCIE" oznacza, że foton nie rozstrzygnął się w limicie {MAX_TICKS} kroków — to ograniczenie tego
              przebiegu, nie własność toru.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
