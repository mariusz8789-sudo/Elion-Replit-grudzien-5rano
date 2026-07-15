/**
 * Candidate Generation Engine v2.
 *
 * Autonomously generates a LARGE library of computational candidates (>= 100 by default) from a
 * small set of seed scaffolds, using REAL RDKit SMARTS transformations (deterministic reactions,
 * never text mutation), then scores every candidate through REAL RDKit descriptors / structural
 * alerts / synthetic-accessibility and REAL ADMET-AI inference, ranks them deterministically, and
 * emits an auditable Discovery Dossier.
 *
 * Honesty contract (unchanged): candidates are COMPUTATIONAL CANDIDATES, never drugs. ADMET is
 * MODEL_INFERRED, never measured. A ranking is not evidence of binding/activity/safety/efficacy.
 * If RDKit is unavailable the engine is CAPABILITY_BLOCKED and generates nothing (never fabricates).
 *
 * Engines are injected (see defaultEngines) so the logic is unit-testable without spawning Python.
 */
import { canonicalHash } from '../provenance.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';
import * as admet from '../compute/admetAdapter.mjs';

export const CANDIDATE_GEN_V2_VERSION = 'genesis-candidate-gen/2';
export const RANKING_POLICY_V2 = 'genesis-candidate-ranking/2';

export const GEN_STATUS = Object.freeze({
  COMPLETED_RANKED: 'COMPLETED_RANKED',
  CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED',
  INSUFFICIENT_CANDIDATES: 'INSUFFICIENT_CANDIDATES',
});

/** Benign, well-known chemical scaffolds used purely as SMILES starting points for enumeration. */
export const DEFAULT_SEEDS = Object.freeze([
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'benzamide', smiles: 'NC(=O)c1ccccc1' },
  { name: 'anisole', smiles: 'COc1ccccc1' },
  { name: 'aniline', smiles: 'Nc1ccccc1' },
]);

export function defaultEngines() {
  return {
    rdkitDetect: () => rdkit.detect(),
    validate: (s) => rdkit.validate(s),
    transform: (s, t) => rdkit.transform(s, t),
    listTransformations: () => rdkit.listTransformations(),
    descriptors: (s) => rdkit.descriptors(s),
    alerts: (s) => rdkit.structuralAlerts(s),
    saScore: (s) => rdkit.saScore(s),
    admetDetect: () => admet.detect(),
    admetPredict: (list) => admet.predict(list),
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const cid = (smi) => 'candv2_' + canonicalHash({ smi }).slice(0, 12);

/**
 * Deterministic BFS analogue expansion. Starts from validated canonical seeds and repeatedly
 * applies EVERY available RDKit transformation to the growing frontier until at least
 * `minCandidates` unique canonical structures exist (or `maxRounds`/`maxCandidates` bound it).
 * Order is fully determined (sorted seeds → sorted transforms → sorted products), so a fixed seed
 * set reproduces the identical library.
 */
export function generateCandidateLibrary({ seeds = DEFAULT_SEEDS, engines = defaultEngines(), minCandidates = 100, maxCandidates = 300, maxRounds = 5 } = {}) {
  const tl = engines.listTransformations();
  if (!tl.ok) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: tl.reason ?? 'RDKit unavailable', candidates: [] };
  const transformations = [...(tl.transformations ?? [])].sort();

  // Validate + canonicalize seeds; keep only RDKit-accepted structures.
  const pool = new Map(); // canonicalSmiles -> meta
  const seedCanon = [];
  for (const seed of [...seeds].sort((a, b) => String(a.smiles).localeCompare(String(b.smiles)))) {
    const v = engines.validate(seed.smiles);
    if (!v.ok || !v.canonicalSmiles) continue;
    const smi = v.canonicalSmiles;
    if (!pool.has(smi)) {
      pool.set(smi, { candidateId: cid(smi), canonicalSmiles: smi, generation: 0, parentSmiles: null, transformation: null, seedName: seed.name });
      seedCanon.push(smi);
    }
  }
  if (seedCanon.length === 0) return { ok: false, error: 'NO_VALID_SEEDS', candidates: [] };

  let frontier = [...seedCanon].sort();
  let round = 0;
  while (pool.size < minCandidates && round < maxRounds && frontier.length > 0) {
    round++;
    const next = [];
    for (const parent of frontier) {
      const parentMeta = pool.get(parent);
      for (const t of transformations) {
        const r = engines.transform(parent, t);
        if (!r.ok || !Array.isArray(r.products)) continue;
        for (const smi of [...r.products].sort()) {
          if (pool.has(smi)) continue;
          pool.set(smi, { candidateId: cid(smi), canonicalSmiles: smi, generation: round, parentSmiles: parent, transformation: t, seedName: parentMeta.seedName });
          next.push(smi);
          if (pool.size >= maxCandidates) break;
        }
        if (pool.size >= maxCandidates) break;
      }
      if (pool.size >= maxCandidates) break;
    }
    frontier = next.sort();
  }

  // Deterministic library order: by candidateId (hash of canonical smiles). BFS can overshoot the
  // cap slightly across a round, so truncate to the hard cap deterministically.
  const candidates = [...pool.values()]
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    .slice(0, maxCandidates);
  return { ok: true, candidates, generationsUsed: round, seedCount: seedCanon.length, transformationCount: transformations.length };
}

/**
 * Evaluate every candidate with REAL engines: RDKit descriptors + structural alerts + SA score
 * (per candidate), and ADMET-AI (ONE batched inference over all SMILES). Never fabricates a blocked
 * engine's output; a per-candidate engine failure is recorded, not hidden.
 */
export function evaluateCandidates(candidates, engines = defaultEngines()) {
  const rdOn = engines.rdkitDetect().available;
  const adDet = engines.admetDetect();
  const adOn = adDet.available;

  // Batch ADMET in chunks (the adapter caps a call at 200 SMILES; a moderate chunk also bounds the
  // per-call model-load + inference time). One inference per chunk, merged — never per-candidate.
  const ADMET_CHUNK = 50;
  let admetBySmiles = {};
  if (adOn && candidates.length) {
    const smiles = candidates.map((c) => c.canonicalSmiles);
    for (let i = 0; i < smiles.length; i += ADMET_CHUNK) {
      const p = engines.admetPredict(smiles.slice(i, i + ADMET_CHUNK));
      if (p.ok && p.predictions) admetBySmiles = { ...admetBySmiles, ...p.predictions };
    }
  }

  return candidates.map((c) => {
    const out = { rdkit: null, admet: null };
    const failures = [];
    if (rdOn) {
      const d = engines.descriptors(c.canonicalSmiles);
      const a = engines.alerts(c.canonicalSmiles);
      const sa = engines.saScore(c.canonicalSmiles);
      out.rdkit = {
        engine: 'RDKit', ok: d.ok && a.ok, epistemicStatus: 'COMPUTED',
        descriptors: d.ok ? d.data : null,
        structuralAlerts: a.ok ? a.alerts : null, nAlerts: a.ok ? a.nAlerts : null,
        saScore: sa.ok ? sa.saScore : null,
      };
      if (!d.ok || !a.ok) failures.push('rdkit');
    } else out.rdkit = { engine: 'RDKit', status: 'BLOCKED_BY_RUNTIME' };

    if (adOn) {
      const pred = admetBySmiles[c.canonicalSmiles] ?? null;
      out.admet = { engine: 'ADMET-AI', ok: Boolean(pred), epistemicStatus: 'MODEL_INFERRED', predictions: pred };
      if (!pred) failures.push('admet');
    } else out.admet = { engine: 'ADMET-AI', status: 'BLOCKED_BY_RUNTIME' };

    return { ...c, engineOutputs: out, failureState: failures.length ? failures : null, epistemicStatus: 'COMPUTATIONAL_CANDIDATE' };
  });
}

/**
 * Deterministic computational drug-likeness ranking (NOT efficacy). Components come only from real
 * engine outputs: Lipinski compliance + TPSA sanity (RDKit), synthetic accessibility (RDKit SA),
 * QED (ADMET-AI, MODEL_INFERRED, modest weight), minus a structural-alert penalty.
 */
export function rankCandidateLibrary(evaluated) {
  const scored = evaluated.map((c) => {
    const rd = c.engineOutputs?.rdkit;
    const desc = rd?.descriptors ?? null;
    const lipinskiViolations = desc?.lipinskiViolations ?? 4;
    const tpsa = desc?.tpsa ?? null;
    const nAlerts = rd?.nAlerts ?? 0;
    const sa = rd?.saScore ?? null;
    const qed = c.engineOutputs?.admet?.predictions?.QED;

    const druglikeness = clamp01(1 - 0.25 * Math.min(4, lipinskiViolations));
    // Oral-range TPSA (<=140 Å²) is a mild positive; unknown → neutral 0.5.
    const permeability = tpsa == null ? 0.5 : clamp01(tpsa <= 140 ? 1 - tpsa / 280 : 0.2);
    const saAccessibility = sa == null ? 0 : clamp01((10 - sa) / 9);
    const admetQed = typeof qed === 'number' ? clamp01(qed) : 0;
    const alertPenalty = Math.min(0.3, 0.1 * nAlerts);
    const failurePenalty = c.failureState ? 0.2 : 0;

    const finalScore = +clamp01(
      0.35 * druglikeness + 0.20 * saAccessibility + 0.15 * permeability + 0.30 * admetQed - alertPenalty - failurePenalty,
    ).toFixed(6);

    return {
      candidateId: c.candidateId, canonicalSmiles: c.canonicalSmiles, generation: c.generation,
      druglikeness: +druglikeness.toFixed(6), saAccessibility: +saAccessibility.toFixed(6),
      permeability: +permeability.toFixed(6), admetQed: +admetQed.toFixed(6),
      alertPenalty: +alertPenalty.toFixed(6), failurePenalty, finalScore,
      rankingPolicyVersion: RANKING_POLICY_V2,
    };
  });
  // Deterministic: score desc, then candidateId asc.
  scored.sort((a, b) => b.finalScore - a.finalScore || a.candidateId.localeCompare(b.candidateId));
  return scored.map((s, i) => ({ rank: i + 1, ...s }));
}

/** Auditable Discovery Dossier for a v2 generation run. Content-hashed; honest by construction. */
export function buildDiscoveryDossierV2(result, { scientificQuestion = null } = {}) {
  const top = result.ranking.slice(0, 10);
  const dossier = {
    schema: 'genesis-discovery-dossier/2',
    engine: { name: 'Candidate Generation Engine', version: CANDIDATE_GEN_V2_VERSION, status: result.status },
    scientificQuestion,
    seeds: result.seeds,
    engineMatrix: result.engineMatrix,
    generation: {
      requested: result.minCandidates, generated: result.candidates.length,
      generationsUsed: result.generationsUsed, transformationCount: result.transformationCount,
      byGeneration: result.candidates.reduce((acc, c) => { acc[c.generation] = (acc[c.generation] ?? 0) + 1; return acc; }, {}),
    },
    evaluation: {
      rdkitEvaluated: result.candidates.filter((c) => c.engineOutputs?.rdkit?.ok).length,
      admetEvaluated: result.candidates.filter((c) => c.engineOutputs?.admet?.ok).length,
      withStructuralAlerts: result.candidates.filter((c) => (c.engineOutputs?.rdkit?.nAlerts ?? 0) > 0).length,
      failed: result.candidates.filter((c) => c.failureState).length,
    },
    rankingPolicyVersion: RANKING_POLICY_V2,
    topCandidates: top,
    fullRankingCount: result.ranking.length,
    reproducibility: {
      candidateGenVersion: CANDIDATE_GEN_V2_VERSION, rankingPolicyVersion: RANKING_POLICY_V2,
      note: 'Same seeds + same RDKit transformation set + same policy versions reproduce the identical library and ranking (deterministic).',
    },
    scientificLimitations: [
      'Candidates are RDKit-enumerated analogues of benign seed scaffolds — COMPUTATIONAL CANDIDATES, not drugs.',
      'ADMET values are MODEL_INFERRED (ADMET-AI), not measured. Docking/MD/QM were not executed.',
      'The ranking is a computational drug-likeness ordering, NOT evidence of binding, activity, safety, or efficacy.',
    ],
    didGenesisDiscoverADrug: 'NO',
    didGenesisDiscoverADrugExplanation: 'The engine generated and ranked computational analogues using real RDKit + ADMET-AI. No target evidence, no docking, no experimental or clinical validation. That is not drug discovery.',
  };
  dossier.dossierHash = canonicalHash({ ...dossier, dossierHash: undefined });
  return dossier;
}

/**
 * Orchestrate the full v2 run: generate >= minCandidates → evaluate (RDKit + ADMET) → rank → dossier.
 * Returns the complete result incl. the dossier. FAIL-CLOSED (CAPABILITY_BLOCKED) if RDKit is absent.
 */
export function runCandidateGenerationV2({ seeds = DEFAULT_SEEDS, engines = defaultEngines(), minCandidates = 100, maxCandidates = 300, maxRounds = 5, scientificQuestion = null } = {}) {
  const rdOn = engines.rdkitDetect().available;
  const adDet = engines.admetDetect();
  const engineMatrix = {
    RDKit: { status: rdOn ? 'AVAILABLE' : 'BLOCKED_BY_RUNTIME' },
    'ADMET-AI': { status: adDet.available ? 'AVAILABLE' : 'BLOCKED_BY_RUNTIME', reason: adDet.available ? undefined : adDet.reason },
  };

  if (!rdOn) {
    return { version: CANDIDATE_GEN_V2_VERSION, status: GEN_STATUS.CAPABILITY_BLOCKED, engineMatrix, seeds, minCandidates, generationsUsed: 0, transformationCount: 0, candidates: [], ranking: [], dossier: null, reason: 'RDKit unavailable — cannot generate candidates without real chemistry (never fabricated).' };
  }

  const lib = generateCandidateLibrary({ seeds, engines, minCandidates, maxCandidates, maxRounds });
  if (!lib.ok) {
    return { version: CANDIDATE_GEN_V2_VERSION, status: GEN_STATUS.CAPABILITY_BLOCKED, engineMatrix, seeds, minCandidates, generationsUsed: 0, transformationCount: 0, candidates: [], ranking: [], dossier: null, reason: lib.reason ?? lib.error };
  }

  const evaluated = evaluateCandidates(lib.candidates, engines);
  const ranking = rankCandidateLibrary(evaluated);
  const status = evaluated.length >= minCandidates ? GEN_STATUS.COMPLETED_RANKED : GEN_STATUS.INSUFFICIENT_CANDIDATES;

  const result = {
    version: CANDIDATE_GEN_V2_VERSION, status, engineMatrix, seeds,
    minCandidates, generationsUsed: lib.generationsUsed, transformationCount: lib.transformationCount,
    candidates: evaluated, ranking,
  };
  result.dossier = buildDiscoveryDossierV2(result, { scientificQuestion });
  return result;
}
