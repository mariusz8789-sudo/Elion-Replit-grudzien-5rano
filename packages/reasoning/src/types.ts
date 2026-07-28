/**
 * Types shared across the reasoning core.
 *
 * `HonestyLevel` used to live in the frontend's `core/types.ts`, which made the
 * scientific reasoning core depend on a UI package. It is declared here now and
 * re-exported there, so the dependency runs in the only direction that makes
 * sense: a surface may depend on the reasoning, never the reverse.
 */

/**
 * How far a model or statement is from the thing it describes.
 *
 * This is not a confidence score and must never be read as one. A `simplified`
 * model can be correct and an `exact` one can rest on a wrong assumption; the
 * label says what KIND of claim is being made, so a reader knows which
 * questions the answer is allowed to settle.
 */
export type HonestyLevel = 'exact' | 'simplified' | 'educational' | 'theoretical' | 'cinematic';
