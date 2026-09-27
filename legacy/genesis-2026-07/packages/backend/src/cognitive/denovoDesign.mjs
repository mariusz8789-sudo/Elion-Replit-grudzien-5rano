/**
 * De Novo Molecular Design (Genesis V4, Phase 1). Generates GENUINELY NEW molecules from seed
 * scaffolds using REAL RDKit BRICS fragment decomposition + recombination (fragment growing/linking),
 * Murcko-scaffold hopping, and bioisosteric replacement (SMARTS). Every generated molecule is a valid,
 * RDKit-canonicalised structure — nothing is fabricated. Candidates are then evaluated (descriptors,
 * synthetic accessibility, novelty vs the seed/reference set) and ranked by a transparent
 * multi-criteria score. Without RDKit the engine is BLOCKED_BY_RUNTIME.
 *
 * HONESTY: "novel" means computationally novel (low Tanimoto similarity to the reference set) and a
 * valid new structure — NOT a validated, synthesised, or bioactive compound. No activity is claimed.
 */
import { canonicalHash } from '../provenance.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';

export const DENOVO_VERSION = 'genesis-denovo/1';
export const DESIGN_METHODS = Object.freeze(['brics_build', 'scaffold_hop', 'bioisostere']);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function defaultEngines() {
  return {
    rdkitDetect: () => rdkit.detect(),
    denovo: (spec) => rdkit.denovo(spec),
    transform: (s, t) => rdkit.transform(s, t),
    listTransformations: () => rdkit.listTransformations(),
    descriptors: (s) => rdkit.descriptors(s),
    alerts: (s) => rdkit.structuralAlerts(s),
    saScore: (s) => rdkit.saScore(s),
    novelty: (s, ref) => rdkit.novelty(s, ref),
    validate: (s) => rdkit.validate(s),
  };
}

/** Bioisosteric-style replacements via the deterministic SMARTS transforms (functional-group edits). */
function bioisostericAnalogues(seeds, engines, perSeed = 3) {
  const tl = engines.listTransformations();
  if (!tl.ok) return [];
  const transforms = [...(tl.transformations ?? [])].sort();
  const out = [];
  for (const s of [...seeds].sort()) {
    for (const t of transforms) {
      const r = engines.transform(s, t);
      if (r.ok) for (const p of (r.products ?? []).slice(0, perSeed)) out.push({ smiles: p, scaffold: null, designMethod: 'bioisostere', via: t, parent: s });
    }
  }
  return out;
}

/**
 * Generate + evaluate + rank de novo candidates.
 * opts: { seeds:[smiles], count?, methods?, referenceSet?, engines?, evaluate? }
 */
export function generateDeNovo(opts = {}) {
  const { seeds = [], count = 40, methods = DESIGN_METHODS, referenceSet = [], engines = defaultEngines(), evaluate = true, evalCap: evalCapOpt = null } = opts;
  if (!engines.rdkitDetect().available) {
    return { status: 'BLOCKED_BY_RUNTIME', version: DENOVO_VERSION, reason: 'RDKit unavailable — de novo design needs real cheminformatics (never fabricated)', molecules: [] };
  }
  const validSeeds = seeds.map((s) => engines.validate(s)).filter((v) => v.ok).map((v) => v.canonicalSmiles);
  if (validSeeds.length === 0) return { status: 'NO_VALID_SEEDS', version: DENOVO_VERSION, molecules: [] };
  const exclude = new Set([...validSeeds, ...referenceSet.map((s) => { const v = engines.validate(s); return v.ok ? v.canonicalSmiles : s; })]);

  // ── Generation (real RDKit) ──────────────────────────────────────────────────────────────────
  const generated = new Map(); // smiles -> meta (first design method wins)
  const perMethodCount = Math.max(count, 30);
  for (const method of methods) {
    let produced = [];
    if (method === 'bioisostere') produced = bioisostericAnalogues(validSeeds, engines);
    else { const r = engines.denovo({ mode: method, seeds: validSeeds, count: perMethodCount }); if (r.ok) produced = r.generated ?? []; }
    for (const g of produced) {
      const smi = g.smiles;
      if (!smi || exclude.has(smi) || generated.has(smi)) continue;
      generated.set(smi, { smiles: smi, scaffold: g.scaffold ?? null, designMethod: method, via: g.via ?? null, parent: g.parent ?? null });
    }
  }
  const generatedCount = generated.size;
  // Deterministic order, then cap how many we evaluate (each evaluation = several RDKit subprocess
  // calls) so runtime stays bounded. Generation is exhaustive; evaluation is a bounded funnel.
  const evalCap = evalCapOpt ?? Math.max(count * 3, 30);
  const novelStructures = [...generated.values()].sort((a, b) => a.smiles.localeCompare(b.smiles)).slice(0, evalCap);
  if (!evaluate) return { status: 'COMPLETED', version: DENOVO_VERSION, generatedCount, molecules: novelStructures.map((m) => ({ ...m, evaluated: false })) };

  // ── Evaluation + multi-criteria ranking (real RDKit) ─────────────────────────────────────────
  const ref = [...exclude];
  const scored = novelStructures.map((m) => {
    const d = engines.descriptors(m.smiles);
    const a = engines.alerts(m.smiles);
    const sa = engines.saScore(m.smiles);
    const nov = engines.novelty(m.smiles, ref);
    const desc = d.ok ? d.data : null;
    const nAlerts = a.ok ? a.nAlerts : 0;
    const druglikeness = clamp01(1 - 0.25 * Math.min(4, desc?.lipinskiViolations ?? 4));
    const novelty01 = nov.ok && typeof nov.maxTanimoto === 'number' ? clamp01(1 - nov.maxTanimoto) : 0.5;
    const synthAccessibility = sa.ok && typeof sa.saScore === 'number' ? clamp01((10 - sa.saScore) / 9) : 0.5;
    const alertPenalty = Math.min(0.3, 0.1 * nAlerts);
    const multiCriteriaScore = +clamp01(0.35 * druglikeness + 0.35 * novelty01 + 0.30 * synthAccessibility - alertPenalty).toFixed(6);
    return {
      moleculeId: 'dn_' + canonicalHash({ smi: m.smiles }).slice(0, 12),
      smiles: m.smiles, scaffold: m.scaffold, designMethod: m.designMethod, via: m.via, parent: m.parent,
      descriptors: desc, nAlerts, saScore: sa.ok ? sa.saScore : null,
      noveltyMaxTanimoto: nov.ok ? nov.maxTanimoto : null,
      components: { druglikeness: +druglikeness.toFixed(4), novelty: +novelty01.toFixed(4), synthAccessibility: +synthAccessibility.toFixed(4), alertPenalty: +alertPenalty.toFixed(4) },
      multiCriteriaScore, epistemicStatus: 'COMPUTATIONAL_NOVEL_STRUCTURE',
    };
  }).filter((m) => m.descriptors) // keep only RDKit-parseable structures
    .sort((a, b) => b.multiCriteriaScore - a.multiCriteriaScore || a.moleculeId.localeCompare(b.moleculeId))
    .slice(0, count)
    .map((m, i) => ({ rank: i + 1, ...m }));

  const byMethod = {};
  for (const m of scored) byMethod[m.designMethod] = (byMethod[m.designMethod] ?? 0) + 1;
  return {
    status: 'COMPLETED', version: DENOVO_VERSION, engine: 'RDKit BRICS + Murcko + SMARTS',
    seeds: validSeeds, generatedCount, evaluatedCount: novelStructures.length, rankedCount: scored.length, byDesignMethod: byMethod,
    novelScaffolds: new Set(scored.map((m) => m.scaffold).filter(Boolean)).size,
    rankingPolicyVersion: DENOVO_VERSION, molecules: scored,
    note: 'Molecules are computationally novel valid structures (RDKit BRICS/scaffold-hop/bioisostere); novelty is Tanimoto-based, NOT experimental. No activity is claimed.',
  };
}
