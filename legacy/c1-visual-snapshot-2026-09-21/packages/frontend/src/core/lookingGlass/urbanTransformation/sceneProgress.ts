/**
 * SCENE PROGRESS — a real, stage-based percentage/remaining-count report for
 * every scene the generic pipeline builds. Not a fake timer: every callback
 * fires exactly when the named stage genuinely completes, so `percent` is
 * always "stages actually finished / stages this request has", counting
 * down or up depending on how the caller reads it.
 */
export const SCENE_STAGES = [
  'PARSE', 'RESOLVE_DOMAIN', 'RESOLVE_YEARS', 'RESOLVE_WORLD_STATES',
  'CONSISTENCY_CHECK', 'CAMERA_PATH', 'RENDER', 'ENCODE', 'DONE',
] as const;
export type SceneStage = (typeof SCENE_STAGES)[number];

export interface SceneProgress {
  readonly stage: SceneStage;
  /** How many of `total` stages have completed, INCLUDING this one. */
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
  readonly remaining: number;
}

export type SceneProgressCallback = (progress: SceneProgress) => void;

/** Builds a reporter bound to one fixed stage list, so `percent` is stable even when a run skips later stages (e.g. BLOCKED early). */
export function makeProgressReporter(stages: readonly SceneStage[], onProgress?: SceneProgressCallback): (stage: SceneStage) => void {
  const total = stages.length;
  return (stage: SceneStage) => {
    if (!onProgress) return;
    const completed = stages.indexOf(stage) + 1;
    const percent = Math.round((completed / total) * 100);
    onProgress({ stage, completed, total, percent, remaining: total - completed });
  };
}
