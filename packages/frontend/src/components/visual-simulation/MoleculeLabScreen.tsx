import { useMemo, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { MoleculeScene3D } from '../../core/three/moleculeScene3D';
import { MOLECULE_STATE_CODE } from '../../core/worldModel/domains/molecularStructure';
import type { SimParams } from '../../core/types';

/**
 * GRAPHICS V4 — the first real screen for `moleculeScene3D.ts` (GRAPHICS V3 item 1).
 *
 * `moleculeScene3D.ts` was real, tested, and correct (real `WorldGraph`/`TemporalEngine`
 * orchestration, real RDKit atoms + Phase 8.1 bond/edge rendering) but had NO consumer anywhere in
 * `components/` or `App.tsx` — exactly the "built, not connected" gap this screen closes, the same
 * shape of gap the bond channel itself was in before GRAPHICS V3.
 *
 * Deliberately NOT registered through `core/registry.ts`'s `registerLab()` — that registry (see
 * `labs/index.ts`) is the Canvas-2D plugin system that predates Three.js/WorldGraph entirely; every
 * entry there renders through `LabShell`'s 2D canvas contract, which this scene (a real WebGL
 * `Sim3D`) does not implement and should not be forced into. This instead follows the SAME pattern
 * `GenesisWorldScreen.tsx`/`GenesisScientificCityScreen.tsx` already established for other
 * WorldGraph-backed `Sim3D` scenes: a dedicated screen component, wired into `App.tsx`'s own hash
 * router as a new top-level route kind (`#/molecule`), mounted via the existing `useThreeLoop`
 * harness — no second renderer, no second camera system.
 *
 * HONESTY NOTE, STATED FOR THE VIEWER (not just in a comment): materialisation is a REAL network
 * call to the RDKit backend (`createBackendGeometrySource`, `/api/compute/run`). If that capability
 * is unavailable (e.g. no RDKit installed on the serving backend), the scene honestly reports
 * `MATERIALISATION_BLOCKED` — this screen surfaces that exact state rather than papering over it
 * with a fabricated placeholder molecule.
 */

const MOLECULE_STATE_LABEL: Readonly<Record<number, string>> = {
  [MOLECULE_STATE_CODE.NOT_MATERIALISED]: 'Nie zmaterializowano',
  [MOLECULE_STATE_CODE.MATERIALISED]: 'Zmaterializowano (real RDKit)',
  [MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED]: 'Zablokowano',
};

export function MoleculeLabScreen() {
  const sim = useMemo(() => new MoleculeScene3D(), []);
  const params = useMemo<SimParams>(() => ({}), []);
  const [stats, setStats] = useState<Record<string, number>>({});
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, setStats);

  const stateCode = stats.moleculeStateCode ?? MOLECULE_STATE_CODE.NOT_MATERIALISED;
  const stateLabel = MOLECULE_STATE_LABEL[stateCode] ?? 'Nieznany stan';

  return (
    <div className="app">
      <div className="gsc-stage">
        <canvas ref={canvasRef} className="gsc-canvas" aria-label="Genesis Molecule Lab — real RDKit atoms and Phase 8.1 bonds (Three.js)" />
        {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}

        {!loading && !failed && (
          <>
            <div className="honesty-row">
              <span className="honesty educational">Genesis Molecule Lab (GRAPHICS V4)</span>
              <span className="honesty-note">
                Realna struktura molekularna (kofeina): atomy z RDKit (MODEL_ESTIMATE, konformer 3D
                zoptymalizowany polem siłowym) i realne wiązania z kanału Phase 8.1 (rząd wiązania +
                aromatyczność) renderowane przez ten sam generyczny WorldFrameRenderer, którego używa
                Genesis World Observation. Kolory atomów (CPK) i grubości wiązań to konwencja
                wizualizacji, nie zmierzone dane.
              </span>
            </div>

            {/* GRAPHICS V3's own real WebGLRenderer.info counters — same observability contract
                every other Sim3D scene already exposes (PERFORMANCE_BUDGET.md). */}
            <div className="gsc-panel observability-panel">
              <div><span>draw calls</span><b>{Math.round(stats.webgl_draw_calls ?? 0)}</b></div>
              <div><span>triangles</span><b>{Math.round(stats.webgl_triangles ?? 0)}</b></div>
              <div><span>render</span><b>{Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</b></div>
            </div>

            <div className="gsc-panel">
              <div className="gsc-panel-row">
                <span>Stan materializacji: <b>{stateLabel}</b></span>
              </div>
              {stateCode === MOLECULE_STATE_CODE.MATERIALISED && (
                <p className="gsc-caption">
                  Atomy: <b>{Math.round(stats.atomsMaterialised ?? 0)}</b> · Wiązania: <b>{Math.round(stats.bondsMaterialised ?? 0)}</b>
                </p>
              )}
              {stateCode === MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED && (
                <p className="gsc-caption">
                  Backend RDKit jest niedostępny w tym środowisku — scena pokazuje ten realny stan zamiast wymyślonej geometrii.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
