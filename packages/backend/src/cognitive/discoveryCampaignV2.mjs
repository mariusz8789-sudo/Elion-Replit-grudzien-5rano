/**
 * Full Discovery Campaign v2 — the scientific execution layer, one command, no manual intervention:
 *
 *   Evidence → Target Intelligence → Candidate Generator v2 → RDKit → ADMET → Docking →
 *   Truth Engine → MCRE → Necropolis → Workflow Mutation → Discovery Dossier
 *
 * Reuses the completed engines (candidateGenV2 for generation + RDKit + ADMET + ranking, the corpus
 * ingest / evidence intelligence / target intelligence, the real docking pipeline, the Truth-Engine
 * gate, MCRE conflict detection). It ADDS the funnel (survivors vs rejected), docking of the top
 * survivors on a real/verified structure, a Necropolis failure-memory delta, a workflow-mutation
 * record when the plan adapts, and a per-candidate Discovery Dossier + benchmark.
 *
 * Honesty: candidates are COMPUTATIONAL CANDIDATES; ADMET is MODEL_INFERRED; docking scores are
 * MODEL_ESTIMATE (Vina), never binding affinity. Docking without a structure / without Vina is
 * BLOCKED_BY_RESOURCES / BLOCKED_BY_RUNTIME — NEVER simulated. No drug is claimed.
 */
import { canonicalHash } from '../provenance.mjs';
import * as candGen from './candidateGenV2.mjs';
import * as ei from './evidenceIntelligence.mjs';
import * as ti from './targetIntelligence.mjs';
import { ingestBundle } from '../corpus/corpusIngest.mjs';
import { truthFinalGate, detectConflicts } from '../campaign/campaignRunner001.mjs';
import * as docking from '../compute/dockingAdapter.mjs';

export const CAMPAIGN_V2_VERSION = 'genesis-discovery-campaign/2';

export const CAMPAIGN_V2_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  FAIL_CLOSED_NO_CANDIDATES: 'FAIL_CLOSED_NO_CANDIDATES',
  FAIL_CLOSED_TARGET_GATE: 'FAIL_CLOSED_TARGET_GATE',
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function defaultDeps() {
  return {
    ingestBundle,
    buildClaimRegistry: ei.buildClaimRegistry,
    targetFunnel: ti.targetFunnel,
    runCandidateGenerationV2: candGen.runCandidateGenerationV2,
    truthFinalGate,
    detectConflicts,
    dockDetect: () => docking.detect(),
    dockPipeline: (spec) => docking.dockPipeline(spec),
    dockPrepared: (spec) => docking.dock(spec),
    prepareReceptor: (spec) => docking.prepareReceptor(spec),
  };
}

/** Funnel filter: which computational candidates survive drug-likeness triage, and why others fail. */
function triage(cand, { maxLipinskiViolations = 1, maxAlerts = 2 } = {}) {
  const rd = cand.engineOutputs?.rdkit;
  const reasons = [];
  if (cand.failureState?.includes('rdkit') || !rd?.ok) reasons.push('RDKIT_EVALUATION_FAILED');
  const lv = rd?.descriptors?.lipinskiViolations;
  if (typeof lv === 'number' && lv > maxLipinskiViolations) reasons.push(`LIPINSKI_VIOLATIONS_${lv}`);
  const na = rd?.nAlerts;
  if (typeof na === 'number' && na > maxAlerts) reasons.push(`STRUCTURAL_ALERTS_${na}`);
  return { survives: reasons.length === 0, rejectionReasons: reasons };
}

function nextExperiment(cand, dockingRan) {
  const alerts = cand.engineOutputs?.rdkit?.structuralAlerts;
  const prefix = alerts && alerts.length ? `Triage structural alert(s) ${alerts.join(', ')}. ` : '';
  return dockingRan
    ? `${prefix}Wet-lab binding assay (SPR/ITC or target biochemical assay) to test the predicted pose and measure Kd/IC50 — the docking score is a MODEL_ESTIMATE, not measured affinity.`
    : `${prefix}Acquire/prepare an experimental receptor structure, run docking, then a wet-lab binding assay — no target structure was available, so binding is unassessed (never simulated).`;
}

function computationalConfidence(cand, { evidenceSupport, dockingRan }) {
  const rd = cand.engineOutputs?.rdkit;
  const druglikeness = clamp01(1 - 0.25 * Math.min(4, rd?.descriptors?.lipinskiViolations ?? 4));
  return +clamp01(
    0.25 * evidenceSupport + 0.25 * (rd?.ok ? 1 : 0) + 0.20 * (cand.engineOutputs?.admet?.ok ? 1 : 0) +
    0.20 * (dockingRan ? 1 : 0) + 0.10 * druglikeness,
  ).toFixed(4);
}

/**
 * Execute the full campaign. `structure` (+ `structureFormat`) is a real/verified receptor structure
 * for docking; without it (or without Vina) docking is honestly blocked. `bundleRoot` supplies
 * VERIFIED_BUNDLE evidence. `deps` are injectable for testing.
 */
export function runDiscoveryCampaignV2(opts = {}) {
  const {
    campaignId = 'discovery-campaign-v2', bundleRoot = null,
    structure = null, structureFormat = 'pdb',
    targetHypotheses = [], supplementalClaims = [],
    seeds, minCandidates = 100, maxCandidates, dockTopN = 5,
    triageConfig = {}, deps = defaultDeps(),
  } = opts;

  const stages = [];
  const mark = (stage, status, detail) => stages.push({ stage, status, ...(detail ? { detail } : {}) });

  // ── 1) EVIDENCE ────────────────────────────────────────────────────────────────────────────
  let evidence = { evidenceRecords: [], entities: [], summary: { entities: 0, evidenceRecords: 0 }, ingestionMode: null };
  if (bundleRoot) { evidence = deps.ingestBundle(bundleRoot, { campaignId }); mark('EVIDENCE', 'INGESTED', `${evidence.evidenceRecords.length} records (${evidence.ingestionMode})`); }
  else mark('EVIDENCE', 'NONE', 'no bundle supplied — target intelligence runs without external evidence');
  const bioactivity = evidence.entities.filter((e) => e.entity?.entityType === 'BioactivityRecord').map((e) => e.entity);

  // ── 2) TARGET INTELLIGENCE ───────────────────────────────────────────────────────────────────
  const { registry: claimRegistry } = deps.buildClaimRegistry(supplementalClaims, evidence.evidenceRecords);
  const funnel = deps.targetFunnel(targetHypotheses, claimRegistry);
  mark('TARGET_INTELLIGENCE', funnel.primaryGate.gate);
  if (funnel.primaryGate.gate === 'BLOCK') {
    return { version: CAMPAIGN_V2_VERSION, campaignId, status: CAMPAIGN_V2_STATUS.FAIL_CLOSED_TARGET_GATE, stages, targetFunnel: funnel, benchmark: null, dossier: null };
  }
  const evidenceSupport = funnel.primaryGate.gate === 'PROCEED' ? 1 : 0.5;

  // ── 3) CANDIDATE GENERATOR v2 → 4) RDKit → 5) ADMET → rank ────────────────────────────────────
  const gen = deps.runCandidateGenerationV2({ seeds, minCandidates, ...(maxCandidates ? { maxCandidates } : {}) });
  mark('CANDIDATE_GEN_V2', gen.status, `${gen.candidates.length} generated`);
  mark('RDKIT', gen.engineMatrix.RDKit.status);
  mark('ADMET', gen.engineMatrix['ADMET-AI'].status);
  if (gen.status !== 'COMPLETED_RANKED' || gen.candidates.length === 0) {
    return { version: CAMPAIGN_V2_VERSION, campaignId, status: CAMPAIGN_V2_STATUS.FAIL_CLOSED_NO_CANDIDATES, stages, engineMatrix: gen.engineMatrix, benchmark: null, dossier: null };
  }
  const rankByCand = new Map(gen.ranking.map((r) => [r.candidateId, r]));
  const candidates = gen.candidates.map((c) => ({ ...c, ranking: rankByCand.get(c.candidateId) ?? null }));

  // funnel: survivors vs rejected
  for (const c of candidates) { const t = triage(c, triageConfig); c.survives = t.survives; c.rejectionReasons = t.rejectionReasons; }
  const survivors = candidates.filter((c) => c.survives).sort((a, b) => (b.ranking?.finalScore ?? 0) - (a.ranking?.finalScore ?? 0) || a.candidateId.localeCompare(b.candidateId));
  const rejected = candidates.filter((c) => !c.survives);

  // ── 6) DOCKING (top-N survivors, real Vina on a real/verified structure) ────────────────────────
  const dockDet = deps.dockDetect();
  const toDock = survivors.slice(0, Math.max(0, dockTopN));
  let dockingStatus;
  if (!dockDet.available) dockingStatus = 'BLOCKED_BY_RUNTIME';
  else if (!structure) dockingStatus = 'BLOCKED_BY_RESOURCES';
  else dockingStatus = 'EXECUTED';
  const dockedById = new Map();
  if (dockingStatus === 'EXECUTED') {
    for (const c of toDock) {
      const r = deps.dockPipeline({ structure, format: structureFormat, ligandSmiles: c.canonicalSmiles, padding: 5, seed: 42 });
      dockedById.set(c.candidateId, r.ok
        ? { status: 'DOCKED', bestAffinityKcalMol: r.docking.bestAffinityKcalMol, nPoses: r.docking.nPoses, grid: r.grid, referenceLigand: r.referenceLigand, engine: `AutoDock Vina ${dockDet.vinaVersion}`, epistemicStatus: 'MODEL_ESTIMATE', receptorProvenanceSha256: r.preparedReceptor?.inputStructureSha256 }
        : { status: 'DOCK_FAILED', error: r.error, stage: r.stage });
    }
  }
  mark('DOCKING', dockingStatus, dockingStatus === 'EXECUTED' ? `${dockedById.size} of top ${toDock.length} survivors docked` : (dockingStatus === 'BLOCKED_BY_RESOURCES' ? 'no target structure supplied' : dockDet.reason));

  const dockingFor = (c) => {
    if (dockedById.has(c.candidateId)) return dockedById.get(c.candidateId);
    if (dockingStatus === 'EXECUTED') return { status: 'NOT_RUN', note: `outside top-${dockTopN} docking funnel` };
    return { status: dockingStatus, note: dockingStatus === 'BLOCKED_BY_RESOURCES' ? 'no receptor structure' : 'Vina unavailable — never simulated' };
  };

  // ── 7) TRUTH ENGINE (final gate) ───────────────────────────────────────────────────────────────
  const truthGate = deps.truthFinalGate({ claimRegistry, rankingProduced: gen.ranking.length > 0, forbiddenClaimTexts: supplementalClaims.map((c) => c.text) });
  mark('TRUTH_ENGINE', truthGate.decision, `${truthGate.rejections.length} rejection(s)`);

  // ── 8) MCRE (conflict detection over docked survivors) ─────────────────────────────────────────
  const conflicts = [];
  for (const c of toDock) {
    const cf = deps.detectConflicts({ candidateId: c.candidateId, canonicalSmiles: c.canonicalSmiles },
      { bioactivity, engineOutputs: c.engineOutputs });
    conflicts.push(...cf);
  }
  mark('MCRE', 'DONE', `${conflicts.length} conflict(s)`);

  // ── 9) NECROPOLIS (failure-memory delta from rejected candidates) ──────────────────────────────
  const failureCounts = {};
  for (const c of rejected) for (const r of c.rejectionReasons) failureCounts[r] = (failureCounts[r] ?? 0) + 1;
  const necropolisDelta = { campaignId, rejectedCount: rejected.length, failureRegions: Object.entries(failureCounts).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)) };
  mark('NECROPOLIS', 'RECORDED', `${rejected.length} rejected across ${necropolisDelta.failureRegions.length} region(s)`);

  // ── 10) WORKFLOW MUTATION (adapt the plan when survival is poor) ────────────────────────────────
  const survivalRate = candidates.length ? survivors.length / candidates.length : 0;
  const workflowMutation = survivalRate < 0.5
    ? { mutated: true, reason: `low survival rate ${(survivalRate * 100).toFixed(0)}% — dominant failure ${necropolisDelta.failureRegions[0]?.reason ?? 'n/a'}`, proposedChange: 'bias next generation away from the dominant failure region (e.g. constrain transformations that add structural alerts / raise Lipinski violations)', expectedBenefit: 'higher survivor fraction next generation' }
    : { mutated: false, reason: `survival rate ${(survivalRate * 100).toFixed(0)}% acceptable — plan unchanged` };
  mark('WORKFLOW_MUTATION', workflowMutation.mutated ? 'MUTATED' : 'UNCHANGED', workflowMutation.reason);

  // ── 11) DISCOVERY DOSSIER (per-candidate) + benchmark ──────────────────────────────────────────
  const primaryTargetName = funnel.primaryTarget?.targetName ?? null;
  const evProvenance = evidence.entities.map((e) => ({ sourceService: e.provenance?.sourceService, sourceId: e.provenance?.sourceId, contentHash: e.provenance?.contentHash, license: e.provenance?.license, ingestionMode: e.provenance?.ingestionMode }));

  const perCandidate = candidates
    .sort((a, b) => (b.ranking?.finalScore ?? 0) - (a.ranking?.finalScore ?? 0) || a.candidateId.localeCompare(b.candidateId))
    .map((c) => {
      const dockRes = dockingFor(c);
      const dockingRan = dockRes.status === 'DOCKED';
      const siblings = candidates.filter((o) => o.candidateId !== c.candidateId && o.parentSmiles && o.parentSmiles === c.parentSmiles)
        .sort((a, b) => (b.ranking?.finalScore ?? 0) - (a.ranking?.finalScore ?? 0))
        .slice(0, 3)
        .map((o) => ({ candidateId: o.candidateId, smiles: o.canonicalSmiles, finalScore: o.ranking?.finalScore ?? null, rejected: !o.survives, reasons: o.rejectionReasons }));
      return {
        candidateId: c.candidateId,
        structure: c.canonicalSmiles,                       // (1) structure
        rationale: `Generation ${c.generation} analogue of seed '${c.seedName}'${c.transformation ? ` via ${c.transformation}` : ' (seed)'}; ${c.survives ? 'survived' : 'rejected in'} drug-likeness triage.`, // (2) rationale
        descriptors: c.engineOutputs?.rdkit?.descriptors ?? null,   // (3) descriptors (RDKit)
        structuralAlerts: c.engineOutputs?.rdkit?.structuralAlerts ?? null,
        admet: c.engineOutputs?.admet?.ok ? { epistemicStatus: 'MODEL_INFERRED', predictions: c.engineOutputs.admet.predictions } : { status: c.engineOutputs?.admet?.status ?? 'UNAVAILABLE' }, // (4) ADMET
        docking: dockRes,                                    // (5) docking
        truthEngineDecision: truthGate.decision,             // (6) Truth Engine decision
        provenance: { candidateOrigin: 'RDKit SMARTS analogue enumeration (COMPUTED)', parentSmiles: c.parentSmiles, transformation: c.transformation, seed: c.seedName, evidenceProvenance: evProvenance, rankingPolicyVersion: c.ranking?.rankingPolicyVersion }, // (7) provenance
        computationalConfidence: computationalConfidence(c, { evidenceSupport, dockingRan }), // (8) confidence
        rejectedAlternatives: siblings,                      // (9) rejected alternatives
        nextExperiment: nextExperiment(c, dockingRan),       // (10) next experiment
        finalScore: c.ranking?.finalScore ?? null,
        survives: c.survives,
        rejectionReasons: c.rejectionReasons,
      };
    });

  const benchmark = {
    candidatesGenerated: candidates.length,
    candidatesRejected: rejected.length,
    candidatesSurviving: survivors.length,
    dockedCount: dockedById.size,
    realEnginesExecuted: [
      gen.engineMatrix.RDKit.status === 'AVAILABLE' ? 'RDKit' : null,
      gen.engineMatrix['ADMET-AI'].status === 'AVAILABLE' ? 'ADMET-AI' : null,
      dockingStatus === 'EXECUTED' ? `AutoDock Vina ${dockDet.vinaVersion}` : null,
    ].filter(Boolean),
    blockedEngines: [
      gen.engineMatrix.RDKit.status !== 'AVAILABLE' ? `RDKit:${gen.engineMatrix.RDKit.status}` : null,
      gen.engineMatrix['ADMET-AI'].status !== 'AVAILABLE' ? `ADMET-AI:${gen.engineMatrix['ADMET-AI'].status}` : null,
      dockingStatus !== 'EXECUTED' ? `Docking:${dockingStatus}` : null,
    ].filter(Boolean),
    rankingTop10: gen.ranking.slice(0, 10).map((r) => ({ rank: r.rank, candidateId: r.candidateId, smiles: r.canonicalSmiles, finalScore: r.finalScore })),
  };

  const dossier = {
    schema: 'genesis-discovery-campaign-dossier/2',
    campaign: { id: campaignId, version: CAMPAIGN_V2_VERSION, status: CAMPAIGN_V2_STATUS.COMPLETED },
    primaryTarget: primaryTargetName,
    targetGate: funnel.primaryGate,
    evidence: { ingestionMode: evidence.ingestionMode, records: evidence.evidenceRecords.length, provenance: evProvenance },
    stages,
    engineMatrix: { ...gen.engineMatrix, Docking: { status: dockingStatus, version: dockDet.available ? `Vina ${dockDet.vinaVersion} + Meeko ${dockDet.meekoVersion}` : undefined } },
    truthEngineGate: truthGate,
    conflictRegistry: conflicts,
    necropolisDelta,
    workflowMutation,
    benchmark,
    candidates: perCandidate,
    scientificLimitations: [
      'Candidates are RDKit-enumerated analogues — COMPUTATIONAL CANDIDATES, not drugs.',
      'ADMET is MODEL_INFERRED; docking scores are Vina MODEL_ESTIMATE, NOT measured binding affinity.',
      'No biological activity is claimed. No experimental or clinical validation was performed.',
    ],
    didGenesisDiscoverADrug: 'NO',
    didGenesisDiscoverADrugExplanation: 'The campaign generated, evaluated (RDKit + ADMET), docked (real Vina, MODEL_ESTIMATE) and ranked computational candidates with provenance and a Truth-Engine gate. That is computational triage, not drug discovery.',
  };
  dossier.dossierHash = canonicalHash({ ...dossier, dossierHash: undefined });

  return { version: CAMPAIGN_V2_VERSION, campaignId, status: CAMPAIGN_V2_STATUS.COMPLETED, stages, engineMatrix: dossier.engineMatrix, targetFunnel: funnel, truthGate, conflicts, necropolisDelta, workflowMutation, benchmark, dossier };
}
