/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * CANONICAL RETROSYNTHESIS HANDOFF — the identity of the molecule whose route is still owed.
 *
 * The route-search engine's model data (~1 GB, upstream licences, not shipped with Genesis) may be
 * unreachable when a campaign finishes. That is a runtime state, not a scientific one: the campaign
 * already decided which molecule it would hand to a synthesis planner, and that decision must survive
 * until the engine can run — otherwise the finalist gets re-chosen later against different code, and
 * the route would describe a molecule the sealed record never named.
 *
 * This module freezes that decision as an addressable record: which candidate, from which campaign,
 * under which preregistered hypothesis, against which sealed evidence, and what the runtime said when
 * the handoff was written. It runs no engine and proposes no chemistry.
 *
 * The finalist is READ FROM THE PROTOCOL, never re-ranked here, so the molecule named in the handoff
 * is by construction the one section A of the final protocol already names.
 */
import { canonicalJson, sha256Hex } from '../determinism.mjs';
import { buildCandidateProtocol } from './candidateProtocol.mjs';
import * as retro from '../compute/retroAdapter.mjs';

export const HANDOFF_KIND = 'GENESIS_RETROSYNTHESIS_HANDOFF';
export const HANDOFF_CONTRACT_VERSION = 1;

/**
 * The identity of the MOLECULE as this campaign produced it — structure plus the lineage that
 * produced it, bound to its campaign. Two candidates with the same SMILES from different campaigns
 * are different handoff subjects; the same candidate re-read later must hash identically or the
 * handoff has drifted and must not be resumed blindly.
 */
export function finalistContentHash({ campaignId, candidateId, canonicalSmiles, generation = null, parentSmiles = null, transformation = null }) {
  return sha256Hex(canonicalJson({ campaignId, candidateId, canonicalSmiles, generation, parentSmiles, transformation }));
}

/** The engine's runtime state at the moment the handoff was written — recorded, never assumed. */
function runtimeState() {
  const d = retro.detect();
  if (d.available) {
    return { status: 'AVAILABLE', engineVersion: d.engineVersion ?? null, reason: null, missingModelFiles: null };
  }
  return {
    status: 'BLOCKED_BY_RUNTIME',
    engineVersion: d.engineVersion ?? null,
    // MODEL_FILES_MISSING when the package is importable but the data is absent; otherwise the
    // package itself is not usable by the configured interpreter. Both are named, neither is guessed.
    blocker: d.installed ? 'MODEL_FILES_MISSING' : 'ENGINE_NOT_INSTALLED',
    reason: d.reason ?? null,
    missingModelFiles: d.models?.missing ?? null,
    requiredModelFiles: d.models?.files?.filter((f) => f.required).map((f) => ({ role: f.role, filename: f.filename, upstream: f.upstream })) ?? null,
  };
}

/**
 * Builds the handoff for a campaign's top finalist. Assembled from persisted state and one capability
 * probe; it never starts a search and never writes a route.
 *
 * `error: 'no_finalist'` is a real answer: a campaign with nothing docked has nothing to hand off, and
 * saying so is better than nominating an arbitrary candidate.
 */
export function buildRetrosynthesisHandoff(db, campaignId) {
  const built = buildCandidateProtocol(db, campaignId);
  if (!built.ok) return built;
  const p = built.protocol;
  const finalist = (p.finalists ?? [])[0] ?? null;
  if (!finalist) return { ok: false, error: 'no_finalist' };

  // The lineage of the chosen candidate, from the protocol's own candidate rows.
  const row = (p.candidates ?? []).find((c) => c.candidateId === finalist.candidateId) ?? null;
  const subject = {
    candidateId: finalist.candidateId,
    canonicalSmiles: finalist.canonicalSmiles,
    generation: row?.generation ?? null,
    parentSmiles: row?.parentSmiles ?? null,
    coParentSmiles: row?.coParentSmiles ?? null,
    transformation: row?.transformation ?? null,
  };

  const existingRoute = p.synthesis?.routeProvided ? {
    runId: p.synthesis.runId ?? null,
    outputHash: p.synthesis.outputHash ?? null,
    candidateId: p.synthesis.candidateId ?? null,
  } : null;

  const body = {
    kind: HANDOFF_KIND,
    contractVersion: HANDOFF_CONTRACT_VERSION,
    campaignId,
    projectId: p.projectId,
    question: p.question,

    // WHICH MOLECULE — and the content hash that detects any later drift in its identity.
    finalist: {
      ...subject,
      rank: finalist.rank,
      dockingScoreKcalMol: finalist.scoreKcalMol,
      poseSha256: finalist.poseSha256 ?? null,
      meetsRegisteredThreshold: finalist.meetsRegisteredThreshold,
      researchGate: finalist.researchGate ?? null,
      contentHash: finalistContentHash({ campaignId, ...subject }),
    },

    // WHY THIS ONE — the ranking is reproduced so the choice can be audited without re-running it.
    selection: {
      rule: 'Highest-ranked finalist of the final protocol: retained candidates carrying a docking score, ordered by that score ascending (most negative first).',
      rankedOver: (p.finalists ?? []).length,
      ranking: (p.finalists ?? []).map((f) => ({
        rank: f.rank, candidateId: f.candidateId, canonicalSmiles: f.canonicalSmiles, scoreKcalMol: f.scoreKcalMol,
      })),
    },

    // UNDER WHICH HYPOTHESIS — the preregistration this candidate was judged against.
    preregistration: {
      preregistrationId: p.hypothesis?.preregistrationId ?? null,
      fingerprint: p.hypothesis?.fingerprint ?? null,
      registeredBeforeExecution: Boolean(p.hypothesis?.registeredBeforeExecution),
      statement: p.hypothesis?.statement ?? null,
    },

    // AGAINST WHICH EVIDENCE — the sealed record and the hash chain that carries it.
    evidence: {
      sessionRecordId: p.verdict?.sessionRecordId ?? null,
      serverVerdict: p.verdict?.server ?? null,
      verdictCheck: p.verdict?.check ?? null,
      preregCheck: p.verdict?.preregCheck ?? null,
      stateHash: p.verdict?.stateHash ?? null,
      chainOk: p.evidence?.experimentRecords?.chainOk ?? null,
      chainLength: p.evidence?.experimentRecords?.chainLength ?? null,
      headChainHash: p.evidence?.experimentRecords?.headChainHash ?? null,
      protocolFingerprint: p.protocolFingerprint,
    },

    // WHAT WILL BE ASKED OF THE ENGINE — named so nothing about it is decided later by accident.
    request: {
      capability: retro.RETRO_CAPABILITY,
      engine: 'AiZynthFinder',
      license: retro.RETRO_LICENSE,
      citation: retro.RETRO_CITATION,
      evidenceClass: retro.RETRO_EVIDENCE_CLASS,
      smiles: finalist.canonicalSmiles,
      referenceCaseFirst: retro.REFERENCE_CASE,
    },

    runtime: runtimeState(),
    route: existingRoute,

    resume: [
      'Point GENESIS_RETRO_MODEL_DIR at the published AiZynthFinder model data and confirm the adapter reports AVAILABLE.',
      'Run the reference case first (acetylsalicylic acid): a planner that cannot solve aspirin is not a working planner.',
      'Re-read this handoff and check finalist.contentHash still matches; a mismatch means the candidate identity drifted and the route would describe a different molecule.',
      'POST /api/projects/:projectId/campaigns/:campaignId/retrosynthesis with this handoff\'s finalist.candidateId — never a re-chosen candidate.',
      'The resulting Science Run joins the same Evidence chain and replays through the standard verify path; section B of the final protocol then fills itself from the run.',
    ],

    boundary: 'IDENTITY RECORD ONLY. This handoff names a molecule and the evidence it came from. It contains no route, no disconnection, no conditions and no synthesis claim; a route exists only once the engine has produced one.',
  };

  return { ok: true, handoff: { ...body, handoffFingerprint: sha256Hex(canonicalJson(body)) } };
}

/**
 * Resumes a handoff once the engine can run: re-reads the campaign, refuses if the finalist identity
 * drifted since the handoff was written, and otherwise plans the route for exactly that candidate.
 *
 * `expectedContentHash` is the guard that makes the handoff worth writing — without it, resuming
 * would silently re-select whatever the campaign ranks first today.
 */
export function resumeRetrosynthesisHandoff(db, campaignId, { expectedContentHash = null, plan, options = {} } = {}) {
  const built = buildRetrosynthesisHandoff(db, campaignId);
  if (!built.ok) return built;
  const h = built.handoff;
  if (expectedContentHash && expectedContentHash !== h.finalist.contentHash) {
    return {
      ok: false, error: 'finalist_drifted',
      expectedContentHash, actualContentHash: h.finalist.contentHash,
      reason: 'The campaign no longer names the candidate this handoff was written for. Planning a route now would describe a different molecule than the sealed record.',
    };
  }
  if (h.runtime.status !== 'AVAILABLE') {
    return { ok: false, error: 'BLOCKED_BY_RUNTIME', runtime: h.runtime, handoff: h };
  }
  if (typeof plan !== 'function') return { ok: false, error: 'plan_required' };
  const result = plan(db, {
    projectId: h.projectId, campaignId,
    candidateId: h.finalist.candidateId,
    options,
  });
  return { ...result, handoff: h };
}
