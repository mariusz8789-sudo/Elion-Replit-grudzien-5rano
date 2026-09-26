/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * THE FINAL ARTEFACT OF A LIVE EXPERIMENT — the reproducible computational candidate protocol.
 *
 * This is what a reader takes away when the run is over: what was asked, what was registered before
 * any engine ran, which engines and exact parameters executed, what every candidate did (including the
 * ones that were dropped, and why), which finalists survived, what is uncertain, which records prove
 * it, how to replay it, and what the next step would be.
 *
 * Three rules make it a protocol rather than a summary:
 *
 *  1. EVERY field is read from something already persisted — campaign row, candidates, the append-only
 *     event log, Science Runs (engine, version, method, inputs, outputs, hashes, environment),
 *     replay verifications, and the campaign's scientific memory (preregistration + sealed session).
 *     This module runs no engine and computes no new scientific number.
 *  2. A SYNTHESIS ROUTE IS NEVER INVENTED. Genesis has no retrosynthesis engine; the synthesis section
 *     carries the existing `classifySynthesisReadiness` boundary and says plainly that no route is
 *     proposed. What follows instead is a PROPOSED VALIDATION PROTOCOL, derived from the preregistered
 *     criteria, every step of which is marked as requiring a physical laboratory that is not connected.
 *  3. Nothing here is a measurement. A Vina score is a scoring-function estimate against a rigid
 *     receptor; ADMET endpoints are model estimates. Both are labelled as such in `uncertainty`.
 *
 * `protocolFingerprint` is a sha256 over the canonical protocol minus itself: the same persisted state
 * yields the same protocol, and any change in the record changes the fingerprint.
 */
import { canonicalJson, sha256Hex } from '../determinism.mjs';
import * as store from './persistence.mjs';
import { listScienceRuns, listScienceRunVerifications } from '../store.mjs';
import { researchGateVerdict } from './scientificIntegration.mjs';
import { classifySynthesisReadiness } from './researchIntake.mjs';
import { readExperimentMemory } from '../experimentMemory.mjs';

export const PROTOCOL_KIND = 'GENESIS_COMPUTATIONAL_CANDIDATE_PROTOCOL';
export const PROTOCOL_CONTRACT_VERSION = 1;

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One row per engine that actually executed, with the version and method the run recorded. */
function enginesOf(runs) {
  const seen = new Map();
  for (const r of runs) {
    const key = `${r.capability}|${r.engine}|${r.engineVersion ?? ''}|${r.method ?? ''}`;
    const row = seen.get(key) ?? {
      capability: r.capability, engine: r.engine, engineVersion: r.engineVersion ?? null,
      method: r.method ?? null, evidenceClass: r.evidenceClass, runCount: 0,
      environmentHashes: [], statuses: [],
    };
    row.runCount += 1;
    if (r.environmentHash && !row.environmentHashes.includes(r.environmentHash)) row.environmentHashes.push(r.environmentHash);
    if (!row.statuses.includes(r.status)) row.statuses.push(r.status);
    seen.set(key, row);
  }
  return [...seen.values()].sort((a, b) => (a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0));
}

/** The exact parameters the engines were invoked with, taken from the runs' own stored inputs. */
function parametersOf(runs) {
  const dock = runs.find((r) => r.capability === 'molecular-docking');
  const qm = runs.find((r) => r.capability?.startsWith('quantum'));
  const admet = runs.find((r) => r.engine === 'ADMET-AI');
  return {
    docking: dock ? {
      exhaustiveness: numOrNull(dock.inputs.exhaustiveness),
      nPoses: numOrNull(dock.inputs.nPoses),
      seed: numOrNull(dock.inputs.seed),
      center: Array.isArray(dock.inputs.center) ? dock.inputs.center : null,
      boxSize: Array.isArray(dock.inputs.boxSize) ? dock.inputs.boxSize : null,
      receptorPdbqtSha256: dock.inputs.receptorPdbqtSha256 ?? null,
      inputHash: dock.inputHash ?? null,
    } : null,
    quantum: qm ? {
      method: qm.inputs.method ?? null, basis: qm.inputs.basis ?? null,
      charge: numOrNull(qm.inputs.charge), forceField: qm.inputs.forceField ?? null,
      geometry: qm.provenance?.geometry ?? null,
    } : null,
    admet: admet ? { engineVersion: admet.engineVersion ?? null, method: admet.method ?? null } : null,
  };
}

/** The target as the docking stage itself recorded it (receptor identity, checksums, pocket box). */
function targetOf(events, runs) {
  const prepared = events.filter((e) => e.payload?.step === 'RECEPTOR_PREPARED').at(-1);
  const dock = runs.find((r) => r.capability === 'molecular-docking');
  const fromRun = dock?.provenance?.target ?? null;
  if (!prepared && !fromRun) return null;
  const p = prepared?.payload ?? {};
  return {
    targetId: p.targetId ?? fromRun?.targetId ?? null,
    pdbId: p.pdbId ?? fromRun?.pdbId ?? null,
    chain: p.chain ?? fromRun?.chain ?? null,
    protein: p.protein ?? fromRun?.protein ?? null,
    receptorAtoms: numOrNull(p.receptorAtoms ?? fromRun?.receptorAtoms),
    sourceSha256: p.sourceSha256 ?? fromRun?.sourceSha256 ?? null,
    receptorPdbqtSha256: p.receptorPdbqtSha256 ?? fromRun?.receptorPdbqtSha256 ?? null,
    pocket: {
      center: p.center ?? fromRun?.center ?? null,
      boxSize: p.boxSize ?? fromRun?.boxSize ?? null,
      source: fromRun?.pocketSource ?? p.pocketSource ?? null,
    },
    preparation: {
      tool: fromRun?.engine ?? (p.meekoVersion ? `Meeko ${p.meekoVersion} mk_prepare_receptor` : null),
      meekoVersion: p.meekoVersion ?? fromRun?.meekoVersion ?? null,
      deterministic: true,
      note: 'Receptor prepared from the shipped, checksum-verified structure; missing side-chain atoms repaired, unmodelled loops NOT modelled.',
    },
  };
}

/** Everything the record holds about one candidate, including why it was dropped. */
function candidateRows(db, campaignId, candidates, events, runs) {
  const byCandidate = (id) => events.filter((e) => e.payload?.candidateId === id);
  return candidates.map((c) => {
    const mine = byCandidate(c.id);
    const myRuns = runs.filter((r) => r.candidateId === c.id);
    const dock = myRuns.find((r) => r.capability === 'molecular-docking');
    const qm = myRuns.find((r) => r.capability?.startsWith('quantum'));
    const admetRuns = myRuns.filter((r) => r.engine === 'ADMET-AI');
    const admetEvent = mine.find((e) => e.payload?.reason === 'ADMET_COMPUTED');
    return {
      candidateId: c.id,
      canonicalSmiles: c.canonicalSmiles,
      generation: c.generation,
      parentSmiles: c.parentSmiles,
      coParentSmiles: c.coParentSmiles,
      transformation: c.transformation,
      transformationClass: c.transformation ? 'COMPUTATIONAL TRANSFORMATION (RDKit), not a synthesised compound' : null,
      status: c.status,
      rejectedReason: c.rejectedReason,
      constraintViolations: c.constraintViolations,
      pareto: c.pareto,
      descriptors: c.descriptors,
      stages: {
        admet: admetRuns.length ? {
          runIds: admetRuns.map((r) => r.id),
          keyEndpoints: admetEvent?.payload?.keyEndpoints ?? null,
          evidenceClass: 'MODEL_ESTIMATE',
        } : null,
        docking: dock ? {
          runId: dock.id,
          scoreKcalMol: numOrNull(dock.outputs.bestAffinityKcalMol),
          poseSha256: dock.outputs.poseSha256 ?? null,
          ligandPdbqtSha256: dock.outputs.ligandPdbqtSha256 ?? null,
          nPoses: numOrNull(dock.outputs.nPoses ?? dock.inputs.nPoses),
          pocketResidues: dock.outputs.pocket?.residues ?? null,
          evidenceClass: 'REAL_ENGINE_OUTPUT (scoring-function estimate, not a measured affinity)',
        } : null,
        quantum: qm ? {
          runId: qm.id,
          method: qm.method ?? null,
          energyHartree: numOrNull(qm.outputs.energyHartree),
          homoLumoGapEv: numOrNull(qm.outputs.homoLumoGapEv),
          dipoleDebye: numOrNull(qm.outputs.dipoleDebye),
          converged: qm.outputs.converged ?? null,
          evidenceClass: 'REAL_ENGINE_OUTPUT',
        } : null,
      },
      // The pipeline's own selection decisions, verbatim: which stage took this candidate and why.
      selection: mine
        .filter((e) => e.type === 'STAGE_SELECTION')
        .map((e) => ({ stage: e.payload.stage ?? null, reason: e.payload.reason ?? null, why: e.payload.why ?? null, endpointId: e.payload.endpointId ?? null, value: numOrNull(e.payload.value), rule: e.payload.rule ?? null })),
      failures: mine.filter((e) => e.type === 'STAGE_RESULT' && String(e.payload.reason ?? '').endsWith('_FAILED'))
        .map((e) => ({ stage: e.payload.stage ?? null, reason: e.payload.reason, error: e.payload.error ?? null })),
      modelConflict: events.some((e) => e.type === 'MODEL_CONFLICT' && e.payload?.candidateId === c.id),
      researchGate: (() => { const g = researchGateVerdict(db, campaignId, c.id); return { verdict: g.verdict, reason: g.reason, message: g.message }; })(),
      // The existing synthesis-readiness boundary, not a route. Origin is DERIVED for a generated analogue.
      synthesisReadiness: classifySynthesisReadiness({ origin: 'DERIVED', canonicalSmiles: c.canonicalSmiles }, {}),
    };
  });
}

/**
 * The proposed physical validation, derived FROM the preregistered criteria: each criterion names the
 * measurement that would actually test it. Nothing here has been executed, and no apparatus is
 * connected — every step says so.
 */
function proposedValidationProtocol(criteria, target) {
  const where = target?.pdbId ? `${target.protein ?? target.targetId} (PDB ${target.pdbId}, chain ${target.chain})` : 'the preregistered protein target';
  const byCriterion = {
    docking: {
      criterionId: 'docking',
      assay: 'Biochemical inhibition assay against the purified protein (dose–response, IC50)',
      testsWhat: `Whether the computational binding estimate against ${where} corresponds to real inhibition.`,
      wouldFalsify: 'No dose-dependent inhibition within the assay range would contradict the predicted binding.',
      prerequisites: ['authentic sample of the compound (synthesised or purchased, identity and purity confirmed)', 'purified target protein', 'validated assay with positive and negative controls'],
    },
    herg: {
      criterionId: 'herg',
      assay: 'hERG channel patch-clamp electrophysiology',
      testsWhat: 'Whether the predicted cardiac-channel risk is real.',
      wouldFalsify: 'Potent hERG block would contradict the predicted low risk.',
      prerequisites: ['authentic sample', 'hERG-expressing cell line', 'electrophysiology rig'],
    },
    ames: {
      criterionId: 'ames',
      assay: 'Bacterial reverse-mutation test (Ames, OECD 471)',
      testsWhat: 'Whether the predicted mutagenicity is real.',
      wouldFalsify: 'A positive Ames result would contradict the predicted non-mutagenicity.',
      prerequisites: ['authentic sample', 'certified tester strains', 'metabolic activation (S9) control arm'],
    },
    retained: {
      criterionId: 'retained',
      assay: 'Analytical identity and purity confirmation (LC-MS and NMR)',
      testsWhat: 'That the molecule the computation described can exist as an authentic, characterised sample.',
      wouldFalsify: 'Failure to obtain the compound, or a structure that does not match, would end the line.',
      prerequisites: ['a synthetic route from a qualified chemistry team (Genesis proposes none)', 'analytical instrumentation'],
    },
  };
  const steps = criteria
    .map((c, i) => {
      const base = byCriterion[c.id];
      if (!base) return null;
      return {
        step: i + 1, ...base,
        criterionItTests: c.label ?? null,
        criticalCriterion: Boolean(c.critical),
        status: 'NOT_EXECUTED',
        apparatus: 'NOT_CONNECTED — Genesis has no physical instrument connected and has executed nothing of this step',
      };
    })
    .filter(Boolean);
  return {
    status: 'REQUIRES_PHYSICAL_LABORATORY',
    executedByGenesis: false,
    order: 'Identity and purity first; then the critical binding criterion; then the safety criteria, whose predictions are model estimates.',
    steps,
    note: 'This is a PROPOSAL for work in a physical laboratory under institutional oversight. Genesis has not measured anything here, drives no apparatus, and makes no clinical or safety claim. Only a physical measurement can turn any prediction above into an observation.',
  };
}

/** What a reader must not over-read: every estimate named as an estimate. */
function uncertaintyOf(target, runs, memory) {
  const out = [
    { claim: 'Docking score', label: 'REAL_ENGINE_OUTPUT / MODEL_ESTIMATE', statement: 'An AutoDock Vina score is a scoring-function estimate against a RIGID receptor from a single prepared conformation. It is not a measured binding affinity and does not predict cellular or clinical activity.' },
    { claim: 'ADMET and toxicity endpoints', label: 'MODEL_ESTIMATE', statement: 'Predictions of a trained model (ADMET-AI / Chemprop D-MPNN on TDC benchmarks). A probability is not a measurement, and a molecule outside the training domain may be predicted confidently and wrongly.' },
    { claim: 'Generated analogues', label: 'DERIVED', statement: 'Every candidate beyond the seed is a COMPUTATIONAL TRANSFORMATION produced by RDKit. None has been synthesised, and Genesis proposes no route.' },
  ];
  if (target) out.push({ claim: 'Receptor preparation', label: 'REFERENCE_DATA + DERIVED', statement: 'Coordinates come from the shipped, checksum-verified crystal structure; missing side-chain atoms were repaired and unmodelled loops were deliberately NOT modelled, so regions absent from the crystal are absent here too.' });
  const qm = runs.find((r) => r.capability?.startsWith('quantum'));
  if (qm) out.push({ claim: 'Quantum chemistry', label: 'REAL_ENGINE_OUTPUT', statement: `A ${qm.method ?? 'single-point'} calculation on an RDKit-embedded gas-phase geometry: no solvent, no conformational search, no thermochemistry.` });
  if (memory.preregistration === null) out.push({ claim: 'Preregistration', label: 'MISSING', statement: 'No criteria were registered on the server before this run, so the verdict below cannot be read as a preregistered test.' });
  return out;
}

/**
 * Assembles the protocol for one campaign. Returns `{ ok: false, error }` when the campaign has not
 * produced enough record to describe (no candidates at all).
 */
export function buildCandidateProtocol(db, campaignId) {
  const campaign = store.getCampaign(db, campaignId);
  if (!campaign) return { ok: false, error: 'campaign_not_found' };
  const candidates = store.listCandidates(db, campaignId);
  const events = store.listEvents(db, campaignId);
  const runs = listScienceRuns(db, campaignId);
  const memory = readExperimentMemory(db, campaignId);
  const prereg = memory.preregistration?.body ?? null;
  const sealed = memory.sessions.at(-1)?.body ?? null;
  const criteria = prereg?.criteria ?? [];
  const target = targetOf(events, runs);
  const rows = candidateRows(db, campaignId, candidates, events, runs);
  const finalists = rows
    .filter((r) => r.status !== 'rejected' && r.stages.docking?.scoreKcalMol != null)
    .sort((a, b) => a.stages.docking.scoreKcalMol - b.stages.docking.scoreKcalMol)
    .map((r, i) => ({
      rank: i + 1, candidateId: r.candidateId, canonicalSmiles: r.canonicalSmiles,
      scoreKcalMol: r.stages.docking.scoreKcalMol, poseSha256: r.stages.docking.poseSha256,
      keyEndpoints: r.stages.admet?.keyEndpoints ?? null,
      researchGate: r.researchGate.verdict,
      meetsRegisteredThreshold: (() => {
        const c = criteria.find((x) => x.id === 'docking');
        return c && typeof c.threshold === 'number' ? r.stages.docking.scoreKcalMol <= c.threshold : null;
      })(),
    }));
  const verifications = runs.flatMap((r) => listScienceRunVerifications(db, r.id).map((v) => ({
    runId: r.id, engine: r.engine, verdict: v.verdict,
    originalOutputHash: v.originalOutputHash, replayOutputHash: v.replayOutputHash,
    originalEngineVersion: v.originalEngineVersion, replayEngineVersion: v.replayEngineVersion,
  })));
  const body = {
    kind: PROTOCOL_KIND,
    contractVersion: PROTOCOL_CONTRACT_VERSION,
    campaignId,
    projectId: campaign.projectId,
    question: campaign.objective,
    domain: campaign.domain,
    status: campaign.status,
    stopReason: campaign.stopReason ?? null,
    hypothesis: prereg ? {
      statement: prereg.statement, subject: prereg.subject, target: prereg.target,
      criteria: prereg.criteria, plan: prereg.plan, fingerprint: prereg.fingerprint,
      preregistrationId: memory.preregistration.id,
      registeredBeforeExecution: true,
    } : { statement: null, criteria: [], fingerprint: null, preregistrationId: null, registeredBeforeExecution: false, why: 'no preregistration record exists for this campaign' },
    verdict: sealed ? {
      reported: sealed.reportedVerdict, server: sealed.serverVerdict, check: sealed.verdictCheck,
      rule: sealed.serverRule ?? sealed.reportedRule, criteria: sealed.criteria,
      preregCheck: sealed.preregCheck, sessionRecordId: memory.sessions.at(-1).id,
      stateHash: sealed.stateHash,
    } : null,
    target,
    engines: enginesOf(runs),
    parameters: parametersOf(runs),
    selectionCriteria: {
      preregistered: criteria,
      pipelineRules: [...new Set(events.filter((e) => e.type === 'STAGE_SELECTION' && e.payload?.why).map((e) => `${e.payload.reason}: ${e.payload.why}`))],
    },
    candidates: rows,
    funnel: {
      generated: rows.length,
      retained: rows.filter((r) => r.status !== 'rejected').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      docked: rows.filter((r) => r.stages.docking).length,
      admetAssessed: rows.filter((r) => r.stages.admet).length,
      quantumAssessed: rows.filter((r) => r.stages.quantum).length,
      rejectionReasons: [...new Set(rows.filter((r) => r.rejectedReason).map((r) => r.rejectedReason))],
    },
    finalists,
    uncertainty: uncertaintyOf(target, runs, memory),
    evidence: {
      scienceRuns: runs.map((r) => ({ id: r.id, capability: r.capability, engine: r.engine, engineVersion: r.engineVersion ?? null, status: r.status, inputHash: r.inputHash ?? null, outputHash: r.outputHash ?? null, environmentHash: r.environmentHash ?? null, durationMs: r.durationMs })),
      eventCount: events.length,
      experimentRecords: {
        preregistrationId: memory.preregistration?.id ?? null,
        sessionIds: memory.sessions.map((s) => s.id),
        chainOk: memory.chain.ok,
        chainLength: memory.chain.length,
        headChainHash: memory.chain.headChainHash ?? null,
      },
      blocked: events.filter((e) => e.type === 'STAGE_BLOCKED').map((e) => ({ stage: e.payload.stage ?? null, blocker: e.payload.blocker ?? null, error: e.payload.error ?? null })),
    },
    replay: {
      engineVerifications: verifications,
      howToReproduce: [
        'Re-execute any Science Run from its stored inputs: POST /api/projects/:projectId/campaigns/:campaignId/science-runs/:runId/verify — the verdict compares the re-run output hash with the stored one.',
        'Re-project the run state from the append-only event log: GET …/campaigns/:campaignId/events?after=0 (the projection is pure, so the same events give the same state hash).',
        'The preregistered criteria and the sealed result are immutable records: GET …/campaigns/:campaignId/experiment-memory.',
      ],
    },
    synthesis: {
      routeProvided: false,
      engine: 'NONE — Genesis has no retrosynthesis or synthesis-planning engine',
      statement: 'No synthesis route, no reagents, no quantities and no operational procedure are proposed. Route selection belongs to a qualified synthetic chemistry team under institutional oversight.',
      readinessClassification: rows[0] ? rows[0].synthesisReadiness.classification : null,
    },
    proposedValidationProtocol: proposedValidationProtocol(criteria, target),
    nextStep: sealed?.serverVerdict === 'UNRESOLVED'
      ? 'Close the unevaluable criteria first: run the stage that did not execute, or obtain the missing measurement, before any further optimisation.'
      : finalists.length
        ? 'Take the highest-ranked finalist into step 1 of the proposed validation protocol; in parallel, a molecular-dynamics run would test whether the docked pose is stable, since the Vina score assumes a rigid receptor.'
        : 'No finalist carries a docking score — re-run the docking stage against the preregistered target before drawing any conclusion.',
    boundary: 'COMPUTATIONAL RESULT ONLY. Nothing in this protocol was measured on physical apparatus. No clinical, therapeutic or safety claim is made or implied.',
  };
  return { ok: true, protocol: { ...body, protocolFingerprint: sha256Hex(canonicalJson(body)) } };
}
