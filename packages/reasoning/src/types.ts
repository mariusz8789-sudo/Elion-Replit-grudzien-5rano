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

/**
 * A resolvable pointer to the literature.
 *
 * It lives here rather than beside the graph because BOTH `hallmarks.ts` (which
 * declares the mechanistic edges) and `knowledgeGraph.ts` (which composes them)
 * need it, and the reverse import would be a cycle. One shape, one place — the
 * alternative is two citation types that drift, which is the failure this whole
 * layer exists to prevent.
 *
 * `EvidenceRecord.citation` (evidence.ts) is deliberately free text: a scientist
 * entering a study may only have a full reference to hand, and refusing it would
 * lose the record. An EDGE is different. An edge is a standing claim the platform
 * repeats on every query, forever, and a reader must be able to check it in one
 * click. So this shape is strict and machine-resolvable, and `validateCitation`
 * refuses anything a reader could not follow.
 */
export interface Citation {
  /** PubMed identifier — digits only. Not "PMID:12345678", not a URL. */
  pmid?: string;
  /** DOI, bare — "10.1038/nature15759". Not "doi:…", not "https://doi.org/…". */
  doi?: string;
  /** First author and year, so the graph is readable without resolving anything. */
  label: string;
}
