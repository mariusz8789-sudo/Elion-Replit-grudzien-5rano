import type { CameraIntent } from '../three/graphics/cameraRig';
import { MODE_VIEWPOINT } from './observationDirector';
import type { ObservationIntent } from './observationIntent';
import { PERSPECTIVES } from './perspective';

/**
 * GENESIS C1 — LIVE OBSERVATION EXECUTION (Looking Glass 2.1)
 * ==============================================================
 *
 * The canonical, domain-agnostic boundary between a resolved `ObservationIntent`
 * and a REAL C2 camera move. This module makes exactly two small, pure
 * decisions — which `CameraIntent` (`core/three/graphics/cameraRig.ts`) an
 * observation maps to, and whether the move should read as a cut, a smooth
 * reposition, or a cinematic establishing move (mission items 7-8) — never a
 * position, never a transform, never a THREE object.
 *
 * REUSE, NOT A SECOND CONTRACT: the mode->vantage table is `observationDirector.
 * ts`'s own `MODE_VIEWPOINT` (the same one the chat narration path already
 * uses), and the vantage->camera-intent table is `perspective.ts`'s own
 * `PERSPECTIVES[...].cameraIntent` (already typed `WorldCameraMode`, a
 * documented subset of `CameraIntent` per `cameraRig.ts`'s own module doc —
 * "those five map straight onto this type with no translation"). This file
 * composes two existing tables; it does not add a third.
 *
 * WHY NOT PerspectiveRequest: `perspective.ts`'s `PerspectiveRequest` is the
 * chat-only, abstract-bounds contract (`placeCamera`, a scenario's declared
 * world extent) — there is no THREE scene behind it. A live 3D screen needs
 * something strictly SMALLER: an intent plus a transition kind. It resolves
 * its OWN real target position/radius from its OWN real registry (the city's
 * buildings/hotspots/clusters/agents; the lab's one real vessel) and hands
 * that, together with the `CameraIntent` this file names, to its OWN real
 * camera primitive — `resolveCameraFraming`/the existing OrbitControls
 * distance seam for the city, the existing `focusScientific`/
 * `returnToFirstPerson` flight for the lab. Neither screen's camera code is
 * touched or replaced by this file.
 */

export type CameraTransitionKind = 'CUT' | 'SMOOTH' | 'CINEMATIC';

/** Mission item 11: REQUESTED as soon as text is parsed, RESOLVED once a real
 * target/camera-intent pair is known, EXECUTING while the real camera call is
 * in flight, EXECUTED once the screen confirms the move landed, FAILED when
 * no real target/camera exists for the request. A screen owns the EXECUTING
 * ->EXECUTED transition (it alone knows when its own camera has settled);
 * this module only ever produces REQUESTED/RESOLVED/FAILED. */
export type ObservationExecutionStatus = 'REQUESTED' | 'RESOLVED' | 'EXECUTING' | 'EXECUTED' | 'FAILED';

/**
 * Resolves an `ObservationIntent` onto the `CameraIntent` vocabulary the real
 * C2 rig understands. A named perspective wins over the mode's own default
 * (a sentence naming "as a citizen" should look like a citizen even inside
 * SYSTEM mode); an explicit scale word then narrows further, since "zoom in"/
 * "show the whole thing" is the most specific thing a sentence can say about
 * framing.
 */
export function resolveCameraIntent(intent: ObservationIntent): CameraIntent {
  const viewpoint = intent.perspective ?? MODE_VIEWPOINT[intent.mode ?? 'SCIENTIST'];
  let cameraIntent: CameraIntent = PERSPECTIVES[viewpoint].cameraIntent;
  if (intent.scale === 'WIDE') cameraIntent = 'WIDE';
  if (intent.scale === 'MACRO') cameraIntent = 'MACRO';
  return cameraIntent;
}

const CUT_WORDS = /\b(focus|zoom|skup|przybliż|natychmiast|instant)/i;
const CINEMATIC_WORDS = /\b(whole|cały|from above|z góry|establishing|panoram)/i;

/**
 * Deterministic, text-driven transition choice (mission item 8): "focus on"/
 * "zoom into" reads as a tight cut into the new framing; "show the whole
 * city"/"from above"/an explicit WIDE scale reads as a cinematic establishing
 * move; everything else — "take me to", "go to", a bare target name — is a
 * plain smooth reposition. Same sentence, same answer, every time.
 */
export function resolveTransitionKind(intent: ObservationIntent): CameraTransitionKind {
  if (CINEMATIC_WORDS.test(intent.rawText) || intent.scale === 'WIDE') return 'CINEMATIC';
  if (CUT_WORDS.test(intent.rawText)) return 'CUT';
  return 'SMOOTH';
}
