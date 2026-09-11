import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { GenesisDashboard } from './GenesisDashboard';
import { TimeTransport } from './TimeTransport';
import {
  getWorkspaceStage, setWorkspaceStage, subscribeWorkspaceStage,
  STAGE_LABEL, STAGE_NOTE, type WorkspaceStageKind,
} from '../core/workspaceStage';

/**
 * WORKSPACE STAGE — the Home workspace's left surface, beside the chat.
 *
 * This is the "chat + live visualisation in ONE workspace" requirement. The
 * renderers mounted here are the EXISTING ones, imported unchanged:
 *   CITY3D          -> City3DWebGLScreen (core/three/epidemicCity3D.ts, the
 *                      real WebGL renderer with PBR materials, shadows and
 *                      agents driven by the epidemic simulation)
 *   SCIENTIFIC_CITY -> GenesisScientificCityScreen
 *   WORLD           -> GenesisWorldScreen (WorldGraph + Discovery Loop)
 *
 * No new renderer, no second world state, no copy of any scene code. This
 * component decides WHICH existing screen is mounted; each screen still owns
 * everything it draws. Opening a world therefore no longer unmounts the
 * conversation and dumps the user on another page — which was the actual
 * reason Genesis felt like several separate applications.
 *
 * The stage switcher shows what each surface really is (`STAGE_NOTE`) rather
 * than a bare label, so "Miasto 3D" cannot be mistaken for a generic city
 * builder: it is the epidemic simulation's own renderer.
 */

const City3DWebGLScreen = lazy(() => import('./visual-simulation/City3DWebGLScreen').then((m) => ({ default: m.City3DWebGLScreen })));
const GenesisScientificCityScreen = lazy(() => import('./visual-simulation/GenesisScientificCityScreen').then((m) => ({ default: m.GenesisScientificCityScreen })));
const GenesisWorldScreen = lazy(() => import('./visual-simulation/GenesisWorldScreen').then((m) => ({ default: m.GenesisWorldScreen })));

const STAGES: readonly WorkspaceStageKind[] = ['DASHBOARD', 'CITY3D', 'SCIENTIFIC_CITY', 'WORLD'];

function StageSurface({ stage }: { stage: WorkspaceStageKind }): ReactNode {
  switch (stage) {
    case 'CITY3D': return <City3DWebGLScreen />;
    case 'SCIENTIFIC_CITY': return <GenesisScientificCityScreen />;
    case 'WORLD': return <GenesisWorldScreen />;
    case 'DASHBOARD':
    default: return <GenesisDashboard />;
  }
}

export function WorkspaceStage(): JSX.Element {
  const [stage, setStage] = useState<WorkspaceStageKind>(() => getWorkspaceStage());

  useEffect(() => subscribeWorkspaceStage(setStage), []);

  return (
    <div className="ws-stage">
      <div className="ws-stage-bar" role="tablist" aria-label="Powierzchnia workspace">
        {STAGES.map((candidate) => (
          <button
            key={candidate}
            role="tab"
            aria-selected={stage === candidate}
            className={`ws-stage-tab${stage === candidate ? ' active' : ''}`}
            onClick={() => setWorkspaceStage(candidate)}
          >
            {STAGE_LABEL[candidate]}
          </button>
        ))}
        <span className="ws-stage-note">{STAGE_NOTE[stage]}</span>
      </div>
      <div className={`ws-stage-surface${stage === 'DASHBOARD' ? '' : ' ws-stage-surface-live'}`}>
        <ErrorBoundary>
          <Suspense fallback={<div className="route-loading" role="status">Ładowanie powierzchni…</div>}>
            <StageSurface stage={stage} />
          </Suspense>
        </ErrorBoundary>
      </div>
      {/* Time is a layer under whatever is on stage, not a screen of its own —
          it is only mounted for surfaces that actually have a simulated
          timeline. Showing a transport bar under a static dashboard would
          imply a time dimension that surface does not have. */}
      {(stage === 'CITY3D' || stage === 'SCIENTIFIC_CITY' || stage === 'WORLD') && (
        <ErrorBoundary><TimeTransport /></ErrorBoundary>
      )}
    </div>
  );
}

export default WorkspaceStage;
