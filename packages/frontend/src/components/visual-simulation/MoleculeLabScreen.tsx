import { useCallback, useEffect, useMemo, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { MoleculeScene3D, type SelectedAtomInfo } from '../../core/three/moleculeScene3D';
import { MOLECULE_STATE_CODE } from '../../core/worldModel/domains/molecularStructure';
import type { SimParams } from '../../core/types';
import { WorldViewShell, type ScreenPoint, type WorldDefinition, type WorldObject } from '../genesis-ui';
import { gxStatusToEpistemicTone } from '../genesis-ui/epistemicToneAdapter';

const ELEMENT_NAME: Readonly<Record<string, string>> = {
  h: 'wodór', c: 'węgiel', n: 'azot', o: 'tlen', s: 'siarka', p: 'fosfor',
  f: 'fluor', cl: 'chlor', br: 'brom', i: 'jod',
};

/**
 * GRAPHICS V4 — the first real screen for `moleculeScene3D.ts` (GRAPHICS V3 item 1).
 *
 * D-133 SMART UI (Molecule World is the proof-of-pattern world — `InteractionController` already
 * existed here before this change; this pass adds `onHoverChange` next to the existing `onSelect`
 * and swaps the always-a-corner-card presentation for `WorldViewShell`'s WORLD VIEW -> hover ->
 * CONTEXTUAL POPUP -> RESEARCH -> RESEARCH DRAWER -> CLOSE contract). The permanent `WorldChrome`
 * header this screen used to render unconditionally is gone: the shell's own minimal corner
 * identity + status badge replace it, so the 3D stage — not a bar across the top — is what fills
 * the screen by default. Nothing about the scene, the camera, or the RDKit/WorldFrame pipeline
 * changed; this is presentation and interaction only.
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

const WORLD: WorldDefinition = {
  identity: { id: 'molecular', title: 'Molecule World', domain: 'Molecular World', glyph: '⬡' },
};

export function MoleculeLabScreen() {
  const sim = useMemo(() => new MoleculeScene3D(), []);
  const params = useMemo<SimParams>(() => ({}), []);
  const [stats, setStats] = useState<Record<string, number>>({});
  // D-133 E2E SETTLEDNESS — `onStats` already fires on the SAME throttled (~250ms) channel every
  // other Sim3D screen ties its own `data-frames` counter to (see CernComplexView.tsx,
  // ScientificWorldsScreen.tsx); this reuses that exact cadence instead of adding a second render-
  // loop tap, so Playwright can wait for real rendered frames the same way it does for those screens.
  const [frameTick, setFrameTick] = useState(0);
  // `useCallback` with no deps keeps this referentially stable across renders — `useThreeLoop`'s
  // effect depends on `onStats`, so a fresh closure here would tear down and rebuild the whole
  // Three.js scene on every ~250ms stats tick.
  const handleStats = useCallback((next: Record<string, number>) => {
    setStats(next);
    setFrameTick((n) => n + 1);
  }, []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, handleStats);

  // GENESIS WORLD INTERACTION — hover/click an atom to identify it (real element + honest
  // grounding), reusing the exact same InteractionController/WorldFrameRenderer pipeline
  // GenesisWorldScreen.tsx already proved out for a different WorldFrame scene. `following` toggles
  // the scene's own `getOrbitTarget()`/`getOrbitFocusDistance()` seam (the same one
  // `epidemicCity3D.ts`'s observation camera already drives) — no second camera system.
  const [selectedAtom, setSelectedAtom] = useState<SelectedAtomInfo | null>(null);
  const [hoveredAtom, setHoveredAtom] = useState<SelectedAtomInfo | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    sim.onAtomSelected = (info) => {
      setSelectedAtom(info);
      if (!info) setFollowing(false);
    };
    sim.onAtomHovered = (info) => setHoveredAtom(info);
    return () => {
      sim.onAtomSelected = undefined;
      sim.onAtomHovered = undefined;
    };
  }, [sim]);

  useEffect(() => {
    sim.setFollowSelected(following);
  }, [sim, following]);

  const stateCode = stats.moleculeStateCode ?? MOLECULE_STATE_CODE.NOT_MATERIALISED;
  const stateLabel = MOLECULE_STATE_LABEL[stateCode] ?? 'Nieznany stan';
  const materialised = stateCode === MOLECULE_STATE_CODE.MATERIALISED;

  // D-133: the selected atom's live screen anchor rides the same throttled getStats() channel as
  // every other number this screen already reads — no second per-frame React update path.
  const anchor: ScreenPoint | null = selectedAtom && Number.isFinite(stats.selectedAnchorX) && Number.isFinite(stats.selectedAnchorY)
    ? { x: stats.selectedAnchorX, y: stats.selectedAnchorY }
    : null;

  const atomLabel = (info: SelectedAtomInfo): string => `${ELEMENT_NAME[info.element.toLowerCase()] ?? info.element} (${info.element})`;

  const selectedObject: WorldObject | null = selectedAtom ? {
    id: selectedAtom.entityId,
    label: atomLabel(selectedAtom),
    subtitle: 'Atom · RDKit',
    badges: [{ label: selectedAtom.notModeled ? 'NOT_MODELLED' : 'REAL (RDKit)', tone: gxStatusToEpistemicTone(selectedAtom.notModeled ? 'not-modelled' : 'real') }],
    researchTitle: atomLabel(selectedAtom),
    actions: [
      { id: 'follow', label: following ? '◉ Śledzę' : '◎ Śledź ten atom', kind: 'command' },
      { id: 'research', label: 'BADAJ', kind: 'research' },
    ],
  } : null;

  return (
    <div className="app" data-testid="molecule-world" data-frames={frameTick}>
      <WorldViewShell
        world={WORLD}
        selectedObject={selectedObject}
        selectedAnchor={anchor}
        onClearSelection={() => { setSelectedAtom(null); setFollowing(false); }}
        onObjectAction={(_object, actionId) => {
          // 'research' needs no handling here: WorldViewShell's own onContextAction already opens
          // the drawer for any action with kind:'research' before this callback fires.
          if (actionId === 'follow') setFollowing((v) => !v);
        }}
        researchContent={() => selectedAtom && (
          <div>
            <dl className="gx-metric-row">
              <div className="gx-metric"><span className="gx-metric-label">Pierwiastek</span><span className="gx-metric-value">{atomLabel(selectedAtom)}</span></div>
              <div className="gx-metric"><span className="gx-metric-label">Dowód</span><span className="gx-metric-value">{selectedAtom.notModeled ? 'NOT_MODELLED' : 'REAL (RDKit)'}</span></div>
            </dl>
            <p className="honesty-note">
              Realna struktura molekularna (kofeina): atomy z RDKit (MODEL_ESTIMATE, konformer 3D
              zoptymalizowany polem siłowym) i realne wiązania z kanału Phase 8.1 (rząd wiązania +
              aromatyczność) renderowane przez ten sam generyczny WorldFrameRenderer, którego używa
              Genesis World Observation. Kolory atomów (CPK) i grubości wiązań to konwencja
              wizualizacji, nie zmierzone dane.
            </p>
            <button
              type="button"
              className="gx-btn"
              aria-pressed={following}
              onClick={() => setFollowing((value) => !value)}
            >
              {following ? '◉ Śledzę' : '◎ Śledź ten atom'}
            </button>
          </div>
        )}
        renderWorldStatus={(
          <span className={`gx-status ${materialised ? 'approximation' : 'blocked'}`}>
            {materialised ? 'GEOMETRIA · RDKit (MODEL_ESTIMATE)' : `RDKit · ${stateLabel}`}
          </span>
        )}
      >
        <canvas ref={canvasRef} className="gsc-canvas" aria-label="Genesis Molecule Lab — real RDKit atoms and Phase 8.1 bonds (Three.js)" />
        {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}

        {!loading && !failed && (
          <>
            {hoveredAtom && !selectedAtom && (
              <div className="honesty-row" data-testid="gx-hover-hint">
                <span className="honesty educational">Najedziesz: {atomLabel(hoveredAtom)}</span>
              </div>
            )}
            <div className="honesty-row">
              <span className="honesty educational">Genesis Molecule Lab (GRAPHICS V4)</span>
              <span className="honesty-note">
                Najedź lub kliknij atom, aby go zidentyfikować. Kliknij BADAJ, aby otworzyć panel
                badawczy — świat pozostaje widoczny.
              </span>
            </div>

            {/* GRAPHICS V3's own real WebGLRenderer.info counters — same observability contract
                every other Sim3D scene already exposes (PERFORMANCE_BUDGET.md). */}
            <div className="gsc-panels">
              <div className="gsc-panel observability-panel">
                <div><span>draw calls</span><b>{Math.round(stats.webgl_draw_calls ?? 0)}</b></div>
                <div><span>triangles</span><b>{Math.round(stats.webgl_triangles ?? 0)}</b></div>
                <div><span>render</span><b>{Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</b></div>
              </div>

              <div className="gsc-panel">
                <div className="gsc-panel-row">
                  <span>Stan materializacji: <b>{stateLabel}</b></span>
                </div>
                {materialised && (
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
            </div>
          </>
        )}
      </WorldViewShell>
    </div>
  );
}
