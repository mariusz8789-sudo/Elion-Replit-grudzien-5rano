export interface CanonicalEvidenceEventRef {
  eventId: string;
  type: string;
  epistemicStatus: string;
  provenanceRefs: string[];
}

export interface MetaInsight {
  status: "KNOWN" | "SUPPORTED" | "INFERRED" | "SIMULATED" | "ASSUMED" | "UNKNOWN" | "CONTRADICTED" | "UNVERIFIED";
  summary: string;
  evidenceRefs: string[];
}

/**
 * FIX (mega-pack V2, red-team finding): V1 treated every positive/negative evidence
 * reference as equally weighted regardless of `epistemicStatus`, so e.g. one
 * REAL_OBSERVATION and one SPECULATIVE reference on opposite sides produced the same
 * CONTRADICTED verdict as two SUPPORTED references. V2 only counts refs whose
 * `epistemicStatus` is in a "load-bearing" set (KNOWN/SUPPORTED — matching D-141's own
 * provenance-required states) toward a contradiction; SIMULATED/INFERRED/ASSUMED/
 * UNVERIFIED refs are tracked but do not by themselves trigger CONTRADICTED against a
 * load-bearing claim on the other side — they instead fall through to SUPPORTED (if one
 * side has load-bearing refs) or UNKNOWN (if neither does), preserving V1's shape
 * (status still comes back CONTRADICTED/SUPPORTED/UNKNOWN) while being honest about
 * evidence weight.
 */
const LOAD_BEARING = new Set(["KNOWN", "SUPPORTED"]);

export function deriveContradiction(
  positive: readonly CanonicalEvidenceEventRef[],
  negative: readonly CanonicalEvidenceEventRef[]
): MetaInsight {
  const positiveStrong = positive.filter((x) => LOAD_BEARING.has(x.epistemicStatus));
  const negativeStrong = negative.filter((x) => LOAD_BEARING.has(x.epistemicStatus));

  if (positiveStrong.length > 0 && negativeStrong.length > 0) {
    return {
      status: "CONTRADICTED",
      summary: "Evidence contains mutually opposing supported observations/claims.",
      evidenceRefs: [...positiveStrong, ...negativeStrong].map((x) => x.eventId),
    };
  }
  if (positive.length === 0 && negative.length === 0) {
    return { status: "UNKNOWN", summary: "No canonical evidence available.", evidenceRefs: [] };
  }
  if (positiveStrong.length > 0 || negativeStrong.length > 0) {
    return {
      status: "SUPPORTED",
      summary: "Available canonical evidence currently supports one direction with load-bearing (KNOWN/SUPPORTED) provenance.",
      evidenceRefs: [...positiveStrong, ...negativeStrong].map((x) => x.eventId),
    };
  }
  return {
    status: "UNKNOWN",
    summary: "Only weakly-evidenced (SIMULATED/INFERRED/ASSUMED/UNVERIFIED) references exist on either side; not strong enough to assert SUPPORTED or CONTRADICTED.",
    evidenceRefs: [...positive, ...negative].map((x) => x.eventId),
  };
}
