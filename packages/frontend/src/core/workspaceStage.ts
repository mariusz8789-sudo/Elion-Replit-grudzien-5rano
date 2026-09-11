/**
 * WORKSPACE STAGE — which live surface the Home workspace is showing next to
 * the chat.
 *
 * This exists so that opening a world does NOT mean leaving the conversation.
 * Before it, "show me the city" meant navigating to `#/city3d`, which
 * unmounted the workspace and left the chat behind as a floating button on
 * another page. Now the same renderer mounts INSIDE the workspace, beside the
 * chat, and the conversation keeps going.
 *
 * It holds no world state, no simulation state and no scene data — only the
 * answer to "which existing screen is on stage". The renderers
 * (`City3DWebGLScreen`, `GenesisScientificCityScreen`, `GenesisWorldScreen`)
 * are unchanged and remain the single source of truth for what they draw;
 * this is a pointer at one of them, not a second rendering path.
 *
 * Same pub/sub shape as `scienceChatBridge.ts`, for the same reason: a hook
 * needs to react to a change made from somewhere else in the tree.
 */

export type WorkspaceStageKind =
  /** Mission context — the default Home surface. */
  | 'DASHBOARD'
  /** The real WebGL epidemic city (core/three/epidemicCity3D.ts). */
  | 'CITY3D'
  /** The real cross-domain scientific city. */
  | 'SCIENTIFIC_CITY'
  /** The World Engine / Discovery Loop surface. */
  | 'WORLD';

export const STAGE_LABEL: Record<WorkspaceStageKind, string> = {
  DASHBOARD: 'Misja',
  CITY3D: 'Miasto 3D',
  SCIENTIFIC_CITY: 'Scientific City',
  WORLD: 'World Engine',
};

/** What each stage really is, shown in the workspace so the label never overclaims. */
export const STAGE_NOTE: Record<WorkspaceStageKind, string> = {
  DASHBOARD: 'Stan pracy: aktywna misja, pętla naukowa, status systemu, następny krok.',
  CITY3D: 'Realny renderer WebGL (core/three/epidemicCity3D.ts) — agenci, stany i ruch pochodzą z symulacji epidemii, nie z animacji.',
  SCIENTIFIC_CITY: 'Realny przebieg międzydziedzinowy (pompa ↔ szpital) na tym samym WorldGraph.',
  WORLD: 'World Engine: WorldGraph, Discovery Loop, scenariusze i solvery domenowe.',
};

type Listener = (stage: WorkspaceStageKind) => void;
const listeners = new Set<Listener>();
let current: WorkspaceStageKind = 'DASHBOARD';

export function getWorkspaceStage(): WorkspaceStageKind {
  return current;
}

/** Called by the workspace to react to stage changes. Returns an unsubscribe function. */
export function subscribeWorkspaceStage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Put a surface on stage. Called by the workspace's own switcher and by any
 * screen that wants to bring a visualisation into the conversation instead of
 * navigating away from it.
 */
export function setWorkspaceStage(stage: WorkspaceStageKind): void {
  if (current === stage) return;
  current = stage;
  for (const listener of listeners) listener(stage);
}
