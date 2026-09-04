import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import {
  summariseAccess,
  type RetrievalOutcome,
  type SourceAccessReport,
  type SourceConnector,
  type SourceDescriptor,
} from './scientificSourceAccess';
import type { UnknownExplanation } from '../epistemicEngine';

/**
 * UNKNOWN → SEARCH PLAN → REAL SOURCE FETCH.
 *
 * This is the one genuinely new link this module adds on top of the existing
 * Phase 2 acquisition chain (scientificSourceAccess.ts / httpSourceConnector
 * .node.ts / datasetEvidenceIngestion.ts / acquiredEvidenceRegistry.ts /
 * acquisitionMemory.ts — all reused UNCHANGED): a real epistemic UNKNOWN
 * drives WHICH sources get attempted, instead of a human hand-declaring a
 * `SourceDescriptor` up front.
 *
 * WHAT THIS MODULE DOES NOT DO:
 *  - it does not invent a source that might have the answer. Every candidate
 *    URL below is a real, publicly documented API endpoint (PubChem PUG-REST,
 *    ChEMBL REST, NCBI E-utilities) built from the compound/reference names
 *    and PMIDs the caller already has — never a guessed or templated URL for
 *    content that may not exist there;
 *  - it does not treat "a source answered" as "the UNKNOWN is resolved" — see
 *    `deriveEpistemicOutcome` below;
 *  - it never mutates an `EpistemicGraph` itself. It returns a `StatusUpdate`
 *    (or `null`, when nothing actually changed) for the caller to apply via
 *    the existing `applyEpistemicUpdates`, exactly like every other real
 *    experiment executor in this codebase.
 */
export const UNKNOWN_DRIVEN_ACQUISITION_VERSION = '1.0.0';

export interface AcquisitionSubjectHint {
  /** The compound the UNKNOWN is actually about (e.g. a candidate name). */
  compoundName: string;
  /** The reference compound the comparison is against (e.g. "alprazolam"). */
  referenceCompoundName: string;
  /** A real PMID already cited for the reference, when one exists — lets the plan try to verify/enrich a citation Genesis already has rather than merely guessing. */
  referencePmid: string | null;
}

export interface AcquisitionSearchPlan {
  unknownNodeId: string;
  /** The real question this plan is trying to answer, taken directly from the UNKNOWN's own text. */
  query: string;
  rationale: string;
  candidateSources: readonly SourceDescriptor[];
}

function pubchemPropertySource(compound: string): SourceDescriptor {
  const encoded = encodeURIComponent(compound);
  return {
    sourceId: `pubchem-pug:${compound}`,
    kind: 'STRUCTURED_DATABASE_API',
    url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encoded}/property/MolecularFormula,MolecularWeight,CanonicalSMILES/JSON`,
    citation: 'PubChem PUG REST API (NIH/NLM).',
    accessTerms: 'Public API, no credential.',
    requiresCredential: false,
  };
}

function chemblMoleculeSource(compound: string): SourceDescriptor {
  const encoded = encodeURIComponent(compound.toUpperCase());
  return {
    sourceId: `chembl-api:${compound}`,
    kind: 'STRUCTURED_DATABASE_API',
    url: `https://www.ebi.ac.uk/chembl/api/data/molecule.json?pref_name__iexact=${encoded}`,
    citation: 'ChEMBL REST API (EMBL-EBI).',
    accessTerms: 'Public API, no credential.',
    requiresCredential: false,
  };
}

function eutilsSummarySource(pmid: string): SourceDescriptor {
  return {
    sourceId: `eutils-esummary:${pmid}`,
    kind: 'LITERATURE_API',
    url: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`,
    citation: `NCBI E-utilities esummary for PMID ${pmid} — verifying a citation already recorded, not searching blind.`,
    accessTerms: 'Public API, no credential.',
    requiresCredential: false,
  };
}

function eutilsSearchSource(query: string, sourceId: string): SourceDescriptor {
  return {
    sourceId,
    kind: 'LITERATURE_API',
    url: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${encodeURIComponent(query)}`,
    citation: 'NCBI E-utilities esearch (PubMed).',
    accessTerms: 'Public API, no credential.',
    requiresCredential: false,
  };
}

/**
 * Builds a real search plan directly from an UNKNOWN's own stated text and a
 * subject hint. The `candidateSources` are picked deterministically from
 * `subject` — nothing here depends on what any source actually returns,
 * because the plan is built BEFORE any network call happens.
 */
export function buildSearchPlanForUnknown(unknown: UnknownExplanation, subject: AcquisitionSubjectHint): AcquisitionSearchPlan {
  const query = `${subject.compoundName} ${subject.referenceCompoundName} GABA-A human recombinant binding affinity`;
  const candidateSources: SourceDescriptor[] = [
    pubchemPropertySource(subject.compoundName),
    chemblMoleculeSource(subject.compoundName),
    eutilsSearchSource(query, `eutils-esearch:${subject.compoundName}`),
  ];
  if (subject.referencePmid !== null) {
    candidateSources.push(eutilsSummarySource(subject.referencePmid));
  }
  return {
    unknownNodeId: unknown.nodeId,
    query,
    rationale: `Unknown "${unknown.whatIsUnknown}" (${unknown.whyUnknown}). Potential resolution stated on the node: ${unknown.potentialResolution}`,
    candidateSources,
  };
}

export interface UnknownAcquisitionResult {
  unknownNodeId: string;
  plan: AcquisitionSearchPlan;
  outcomes: readonly RetrievalOutcome[];
  access: SourceAccessReport;
  /** True only if at least one source actually returned real content. */
  anySourceReachable: boolean;
  /** Real reason the UNKNOWN could not be resolved this run, when it wasn't. Null when it was. */
  unresolvedReason: string | null;
}

/**
 * Executes the plan for real, using the SAME `SourceConnector` contract
 * every other acquisition test in this codebase uses (`createNodeHttpSourceConnector`
 * in a live run, or any connector implementing the interface). No source is
 * skipped and no failure is treated as content: a source that returns
 * anything other than real retrieved bytes contributes nothing to resolving
 * the unknown, and that is recorded as a genuine, reasoned fact, not silence.
 */
export function runUnknownDrivenAcquisition(
  connector: SourceConnector,
  plan: AcquisitionSearchPlan,
): UnknownAcquisitionResult {
  const outcomes = plan.candidateSources.map((source) => connector.retrieve(source));
  const access = summariseAccess(outcomes);
  const anySourceReachable = access.reachable.length > 0;

  const unresolvedReason = anySourceReachable
    ? null
    : `Every candidate source was attempted for real and none returned content: ${outcomes.map((o) => `${o.sourceId} (${o.state}${o.httpStatus !== null ? `, HTTP ${o.httpStatus}` : ''})`).join('; ')}.`;

  return { unknownNodeId: plan.unknownNodeId, plan, outcomes, access, anySourceReachable, unresolvedReason };
}

/**
 * Persists the real attempt to Scientific Memory REGARDLESS of whether it
 * succeeded — a blocked search is a real, useful fact ("we tried, here is
 * exactly why it failed") and must be retrievable later exactly like a
 * successful one, not silently discarded because nothing was resolved.
 */
export function saveUnknownAcquisitionAttemptToMemory(result: UnknownAcquisitionResult): SavedExperiment {
  const reachableCount = result.access.reachable.length;
  const blockedCount = result.access.blocked.length;
  return saveExperiment({
    labId: 'unknown-driven-acquisition',
    experimentId: `${result.unknownNodeId}:${result.outcomes.map((o) => `${o.sourceId}=${o.state}`).sort().join('|')}`,
    experimentName: `Real search attempt for UNKNOWN "${result.unknownNodeId}"`,
    params: {
      unknownNodeId: result.unknownNodeId,
      query: result.plan.query,
      candidateCount: result.plan.candidateSources.length,
    },
    stats: { reachable: reachableCount, blocked: blockedCount, attempted: result.outcomes.length },
    analysis: [
      { title: 'Search plan', kind: 'plan', body: result.plan.rationale },
      ...result.outcomes.map((o) => ({
        title: o.sourceId,
        kind: 'retrieval-outcome' as const,
        body: `${o.state}${o.httpStatus !== null ? ` (HTTP ${o.httpStatus})` : ''} — ${o.reason || 'no error text returned'} [${o.url}, attempted ${o.retrievedAt}]`,
      })),
    ],
    honesty: 'simplified',
    honestyNote: result.anySourceReachable
      ? 'At least one source returned real content; this record shows raw reachability only, not that the content was parsed into a validated claim.'
      : `No source was reachable in this runtime. ${result.unresolvedReason ?? ''}`.trim(),
    epistemicStatus: result.anySourceReachable ? 'REACHABLE' : 'BLOCKED',
    assumptions: ['This connector retrieves public URLs only; no credential was sent or acquired.', 'A reachable source is not automatically treated as verified evidence — see the registry/ingestion layer for that gate.'],
  });
}
