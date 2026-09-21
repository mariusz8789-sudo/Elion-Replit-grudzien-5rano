import { fnv1a, canonicalJson } from '../../events/hash';
import type { HistoricalWorldState, TemporalCinematicResult } from './contracts';
import { parseTemporalSceneRequest } from './temporalSceneRequestParser';
import { buildTemporalSequence } from './temporalSequenceBuilder';
import { buildHistoricalWorldState } from './historicalWorldState';
import { checkSequenceConsistency } from './sceneConsistencyEngine';
import { generateCameraPath } from './cinematicDirector';
import { renderTemporalScene, NOT_IMPLEMENTED_FRAME_RENDERER, type FrameRenderer } from './temporalRenderController';
import { encodeTemporalVideo, NOT_IMPLEMENTED_VIDEO_ENCODER, type VideoEncoder } from './videoRenderPipeline';
import { makeProgressReporter, type SceneProgressCallback } from './sceneProgress';

/**
 * URBAN TRANSFORMATION ORCHESTRATOR — the `URBAN_TRANSFORMATION` domain
 * binding `scenarioResolution.ts` names but has never routed to. This is the
 * single entry point: parse -> resolve years -> resolve each year's
 * `HistoricalWorldState` -> check consistency -> build a camera path ->
 * attempt to render -> attempt to encode -> fingerprint. Every stage's real
 * outcome is threaded into the result rather than collapsed into one
 * boolean, per the brief's fail-closed rules (section 27). `onProgress`
 * fires once per stage this run actually reaches — a run that stops early
 * (BLOCKED/FAILED) simply never fires the later callbacks, rather than
 * reporting a fake 100%.
 */
const STAGES = ['PARSE', 'RESOLVE_YEARS', 'RESOLVE_WORLD_STATES', 'CONSISTENCY_CHECK', 'CAMERA_PATH', 'RENDER', 'ENCODE', 'DONE'] as const;

export function generateTemporalCinematicScene(
  rawPrompt: string,
  ports: { readonly renderer?: FrameRenderer; readonly encoder?: VideoEncoder; readonly onProgress?: SceneProgressCallback } = {},
): TemporalCinematicResult {
  const report = makeProgressReporter(STAGES, ports.onProgress);
  const requestId = fnv1a(canonicalJson({ prompt: rawPrompt, salt: 'urban-transformation-request' }));
  const assumptions: string[] = [];
  const unresolved: string[] = [];

  const { request, unresolved: parseUnresolved } = parseTemporalSceneRequest(rawPrompt);
  unresolved.push(...parseUnresolved);
  report('PARSE');

  if (!request.location) {
    return blocked(requestId, ['location could not be resolved from the prompt — NEEDS_INPUT'], unresolved, assumptions);
  }

  const sequence = buildTemporalSequence(request.time);
  if (!sequence.ok) {
    return blocked(requestId, [`${sequence.reason}: ${sequence.detail}`], unresolved, assumptions);
  }
  report('RESOLVE_YEARS');

  const temporalStates: HistoricalWorldState[] = [];
  for (const year of sequence.years) {
    const state = buildHistoricalWorldState(request.location.name, year);
    if (!state) return blocked(requestId, [`location "${request.location.name}" has no known era knowledge base entry`], unresolved, assumptions);
    temporalStates.push(state);
  }
  report('RESOLVE_WORLD_STATES');

  const consistency = checkSequenceConsistency(temporalStates.map((s) => ({ entities: s.entities, year: s.year })));
  if (!consistency.ok) {
    return {
      requestId, status: 'FAILED', temporalStates, frames: [], video: null, cameraPath: null,
      assumptions, unresolved: [...unresolved, ...consistency.violations.map((v) => `${v.kind}: ${v.reason}`)],
      confidence: 0, fingerprint: fnv1a(canonicalJson({ requestId, consistency })),
    };
  }
  report('CONSISTENCY_CHECK');

  assumptions.push('building/vehicle archetypes are ESTIMATED illustrative era archetypes (historicalEraKnowledgeBase.ts), not real per-address historical records');

  const anchor = temporalStates[0].anchor;
  const cameraPath = generateCameraPath(anchor, request.viewpoint, request.scene.durationSeconds, request.scene.fps);
  report('CAMERA_PATH');

  const renderResult = renderTemporalScene(temporalStates, cameraPath, ports.renderer ?? NOT_IMPLEMENTED_FRAME_RENDERER);
  report('RENDER');
  const video = encodeTemporalVideo(renderResult.frames, ports.encoder ?? NOT_IMPLEMENTED_VIDEO_ENCODER);
  report('ENCODE');

  const minEntityConfidence = temporalStates.flatMap((s) => s.entities.map((e) => e.provenance.confidence));
  const confidence = minEntityConfidence.length === 0 ? 0 : Math.min(...minEntityConfidence);

  const status: TemporalCinematicResult['status'] = renderResult.allBlocked ? 'PARTIAL' : (video.status === 'BLOCKED_BY_RUNTIME' ? 'PARTIAL' : 'COMPLETED');
  if (renderResult.allBlocked) unresolved.push('frame rendering BLOCKED_BY_RUNTIME: no historical-era-aware 3D renderer exists yet');
  if (video.status === 'BLOCKED_BY_RUNTIME') unresolved.push(`video encoding: ${video.note}`);

  const fingerprint = fnv1a(canonicalJson({ requestId, years: sequence.years, locationId: request.location.name, cameraPathLength: cameraPath.points.length }));
  report('DONE');

  return { requestId, status, temporalStates, frames: renderResult.frames, video, cameraPath, assumptions, unresolved, confidence, fingerprint };
}

function blocked(requestId: string, reasons: readonly string[], unresolved: readonly string[], assumptions: readonly string[]): TemporalCinematicResult {
  return {
    requestId, status: 'BLOCKED', temporalStates: [], frames: [], video: null, cameraPath: null,
    assumptions, unresolved: [...unresolved, ...reasons], confidence: 0,
    fingerprint: fnv1a(canonicalJson({ requestId, reasons })),
  };
}
