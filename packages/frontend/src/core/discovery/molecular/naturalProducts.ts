import { canonicalJson, fnv1a } from '../../events/hash';
import type { CompoundLookupTransport, CompoundResolution } from './compoundResolver';
import { resolveCompound } from './compoundResolver';
import type { NaturalProductContext } from './dossier';

/**
 * ETAP 8 — NATURAL PRODUCTS AS A FIRST-CLASS DISCOVERY PATH.
 *
 * natural source -> source evidence -> molecule -> structure -> evaluation
 *
 * Natural products are a legitimate and historically productive starting point
 * for discovery: a large share of real medicines are natural products or
 * derived from them. That is why this path exists.
 *
 * IT IS A PROVENANCE PATH, NOT A SAFETY PATH. Natural origin says nothing
 * about toxicity or efficacy — amatoxins, aconitine and ricin are natural
 * products; so are penicillin, artemisinin and paclitaxel. This module
 * therefore records WHERE a molecule was reported to come from, and is
 * structurally incapable of turning that into a safety or efficacy claim:
 * `naturalProductClaimGuard` rejects any such statement, and the context it
 * produces carries no property values at all.
 *
 * Genesis has no natural-product database. Every source assertion here is
 * USER_SUPPLIED and must cite something real; nothing is inferred from a name.
 */
export const NATURAL_PRODUCT_VERSION = '1.0.0';

export type SourceEvidenceKind =
  | 'PEER_REVIEWED_LITERATURE'
  | 'PUBLIC_DATABASE_RECORD'
  | 'USER_ASSERTION'
  | 'NOT_PROVIDED';

export interface SourceEvidence {
  kind: SourceEvidenceKind;
  /** Citation, accession or identifier. Required for anything but an assertion. */
  reference: string;
  /** What this evidence actually establishes — usually only occurrence. */
  establishes: string;
}

export interface NaturalSourceClaim {
  /** Organism, tissue or material the compound is reported to occur in. */
  sourceOrganism: string;
  /** The compound as named by the source. */
  compoundName: string;
  evidence: readonly SourceEvidence[];
}

export type SourceEvidenceStrength = 'CITED' | 'ASSERTED_WITHOUT_CITATION' | 'NONE';

export interface NaturalProductLead {
  claim: NaturalSourceClaim;
  /** How well the occurrence claim is supported — occurrence ONLY. */
  evidenceStrength: SourceEvidenceStrength;
  /** Structure resolution for the named compound, through the real resolver. */
  resolution: CompoundResolution;
  /** SMILES usable as campaign seeds; empty when nothing resolved. */
  seeds: readonly string[];
  /** Context for the dossier — provenance only, never a property value. */
  context: NaturalProductContext;
  /** What this lead does and does not establish. */
  limitations: readonly string[];
  leadFingerprint: string;
}

function strengthOf(evidence: readonly SourceEvidence[]): SourceEvidenceStrength {
  if (evidence.length === 0) return 'NONE';
  const cited = evidence.some(
    (e) => (e.kind === 'PEER_REVIEWED_LITERATURE' || e.kind === 'PUBLIC_DATABASE_RECORD') && e.reference.trim().length > 0,
  );
  return cited ? 'CITED' : 'ASSERTED_WITHOUT_CITATION';
}

/**
 * Builds a natural-product lead: a named source, its evidence, and the
 * structure that name resolves to.
 *
 * The compound is resolved through the SAME resolver every other input uses,
 * so a natural-product name gets no privileged path to a structure.
 */
export function buildNaturalProductLead(
  claim: NaturalSourceClaim,
  transport?: CompoundLookupTransport,
): NaturalProductLead {
  const resolution = resolveCompound({ kind: 'name', value: claim.compoundName }, transport);
  const evidenceStrength = strengthOf(claim.evidence);

  const references = claim.evidence
    .filter((e) => e.reference.trim().length > 0)
    .map((e) => `${e.kind}: ${e.reference}`);

  const limitations = [
    'Natural origin is provenance, not a property. It says nothing about this compound\'s toxicity, efficacy or safety — those require their own evidence, exactly as for a synthetic compound.',
    evidenceStrength === 'CITED'
      ? 'The cited evidence supports OCCURRENCE in the named source. It does not establish activity, concentration, extractability or purity.'
      : evidenceStrength === 'ASSERTED_WITHOUT_CITATION'
        ? 'The source claim is asserted without a citation. Occurrence itself is unverified here.'
        : 'No source evidence was supplied. The occurrence claim is unsupported.',
  ];

  if (resolution.status !== 'RESOLVED_SINGLE') {
    limitations.push(`No single structure was resolved for "${claim.compoundName}" (${resolution.status}); downstream evaluation cannot proceed on a name alone.`);
  }

  return {
    claim,
    evidenceStrength,
    resolution,
    seeds: resolution.structures.map((s) => s.canonicalSmiles),
    context: {
      // Occurrence is what a source can establish; it is recorded as reported,
      // and stays null when nothing real backs it.
      knownNaturalProduct: evidenceStrength === 'CITED' ? true : null,
      sourceOrganism: claim.sourceOrganism.trim().length > 0 ? claim.sourceOrganism : null,
      references,
    },
    limitations,
    leadFingerprint: fnv1a(canonicalJson({
      v: NATURAL_PRODUCT_VERSION,
      organism: claim.sourceOrganism,
      compound: claim.compoundName,
      evidence: claim.evidence.map((e) => [e.kind, e.reference]).sort(),
      structures: resolution.structures.map((s) => s.canonicalSmiles).sort(),
    })),
  };
}

/**
 * GUARD: rejects any attempt to derive a safety, efficacy or toxicity
 * statement from natural origin.
 *
 * This exists as executable code rather than documentation because "it's
 * natural, so it's gentler" is the single most likely wrong inference for this
 * feature to invite, and a comment cannot stop it.
 */
export function naturalProductClaimGuard(statement: string): { allowed: boolean; reason: string } {
  const normalised = statement.toLowerCase();
  const impliesOrigin = /\bnatural\b|\bplant[- ]derived\b|\bherbal\b|\bbotanical\b|\bfrom nature\b/.test(normalised);
  const impliesQuality = /\bsafe\b|\bsafer\b|\bnon[- ]toxic\b|\bgentle\b|\bharmless\b|\bwithout side effects\b|\bside[- ]effect free\b|\beffective\b|\bcures?\b|\bheals?\b/.test(normalised);

  if (impliesOrigin && impliesQuality) {
    return {
      allowed: false,
      reason: 'Rejected: this statement infers a safety or efficacy property from natural origin. Natural origin is not evidence of either — many natural products are potent toxins, and many medicines are natural products. The property needs its own measurement.',
    };
  }
  return { allowed: true, reason: '' };
}

/** The honest framing for a natural-product lead. */
export function naturalProductStatement(lead: NaturalProductLead): string {
  const organism = lead.context.sourceOrganism ?? 'an unnamed source';
  return lead.evidenceStrength === 'CITED'
    ? `${lead.claim.compoundName} is reported to occur in ${organism}, with a cited reference. Occurrence is all this establishes; no property of the compound has been demonstrated here.`
    : `${lead.claim.compoundName} is claimed to occur in ${organism}, without a citation. Neither the occurrence nor any property of the compound is established here.`;
}
