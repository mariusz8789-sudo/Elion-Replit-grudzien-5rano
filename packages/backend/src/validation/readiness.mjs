/**
 * Scientific Readiness scoring (Phase 5). Every score is derived ONLY from measured validation
 * signals (never asserted): descriptor correctness, reproducibility, Truth/MCRE consistency,
 * research-quality checks, and which real engines executed. Each dimension reports its 0–1 score,
 * a band, the supporting evidence, and the honest remaining gaps (many external → Genesis V3).
 */
export const READINESS_VERSION = 'genesis-readiness/1';

const band = (s) => (s >= 0.8 ? 'HIGH' : s >= 0.55 ? 'MEDIUM' : s >= 0.3 ? 'LOW' : 'INSUFFICIENT');
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const b01 = (v) => (v ? 1 : 0);

/**
 * External ceilings: the MAXIMUM readiness fraction achievable by COMPUTATIONAL validation alone.
 * The remainder is gated by external dependencies (wet-lab, clinical/GxP, live data, traction) and
 * CANNOT be earned in software — so a perfect computational result scores exactly the ceiling, never
 * a misleading 1.0. This keeps the scores honest.
 */
const CEILING = Object.freeze({
  research: 0.95,  // methodology/reproducibility largely in-software; live external evidence closes the gap
  biotech: 0.70,   // decision-support; wet-lab validation is the dominant remaining gate
  pharma: 0.55,    // GxP audit depth + clinical validation dominate
  grant: 0.90,     // strong reproducible story; a live-data reference campaign strengthens it
  investor: 0.78,  // credibility strong; live-data traction + design partners remain
});

/**
 * `ev` is the measured evidence bundle from the validation suite:
 *   { descriptorAccuracy, reproducibility[], rankingRecovery, truth, mcre, researchQuality,
 *     campaignReproducible, enginesExecuted:[], blockedEngines:[] }
 */
export function scoreReadiness(ev) {
  const descOk = b01(ev.descriptorAccuracy?.pass);
  const repro = ev.reproducibility?.length ? ev.reproducibility.filter((r) => r.reproducible).length / ev.reproducibility.length : 0;
  const rq = clamp01(ev.researchQuality?.score ?? 0);
  const truthAcc = clamp01(ev.truth?.accuracy ?? 0);
  const truthCons = clamp01(ev.truth?.consistency ?? 0);
  const mcreCons = clamp01(ev.mcre?.consistency ?? 0);
  const recovery = ev.rankingRecovery?.status === 'COMPLETED' ? clamp01(ev.rankingRecovery.rocAuc ?? 0) : 0;
  const engines = new Set(ev.enginesExecuted ?? []);
  const engineDepth = clamp01(([...engines].filter((e) => /RDKit|ADMET|Vina/i.test(e)).length) / 3);
  const provenance = b01(ev.researchQuality?.checks?.find((c) => c.dimension === 'provenance.integrity')?.pass);

  const dims = {};
  const mk = (name, raw, evidence, gaps) => {
    const computationalScore = +clamp01(raw).toFixed(4);
    const ceiling = CEILING[name];
    const score = +(computationalScore * ceiling).toFixed(4);
    return { score, band: band(score), computationalScore, externalCeiling: ceiling, evidence, gaps };
  };

  // Research readiness — reproducible, correct, honest, quality-checked.
  dims.research = mk('research',
    0.30 * descOk + 0.20 * repro + 0.20 * rq + 0.15 * truthCons + 0.15 * mcreCons,
    [
      `descriptor correctness pass=${!!ev.descriptorAccuracy?.pass} (MAE ${ev.descriptorAccuracy?.mae} g/mol)`,
      `reproducibility ${(repro * 100).toFixed(0)}% of checks bit-identical`,
      `research-quality ${ev.researchQuality?.passedChecks}/${ev.researchQuality?.totalChecks} checks`,
      `Truth consistency ${(truthCons * 100).toFixed(0)}%, MCRE consistency ${(mcreCons * 100).toFixed(0)}%`,
    ],
    ['Live external evidence + biological validation are external (V3).'],
  );

  // Biotech readiness — real engines executed + honest triage; MD/FEP/off-target/experimental are V3.
  dims.biotech = mk('biotech',
    0.35 * engineDepth + 0.20 * descOk + 0.15 * repro + 0.15 * rq + 0.15 * recovery,
    [
      `real engines executed: ${[...engines].join(', ') || 'none'}`,
      `blocked engines honestly reported: ${(ev.blockedEngines ?? []).join(', ') || 'none'}`,
      `recovery ROC-AUC ${ev.rankingRecovery?.rocAuc ?? 'n/a'} (${ev.rankingRecovery?.labelProvenance ?? 'n/a'})`,
    ],
    ['MD-in-loop, MM-GBSA/FEP, off-target panel, wet-lab validation are external / Genesis V3.'],
  );

  // Pharma readiness — provenance integrity + reproducibility + validation package; GxP/clinical external.
  dims.pharma = mk('pharma',
    0.30 * provenance + 0.25 * repro + 0.20 * rq + 0.15 * descOk + 0.10 * truthCons,
    [
      `provenance integrity ${provenance ? 'verified (hash recomputes)' : 'NOT verified'}`,
      `reproducibility ${(repro * 100).toFixed(0)}%`,
      `Truth-Engine accuracy ${(truthAcc * 100).toFixed(0)}%`,
    ],
    ['GxP audit trail depth, lead-opt/FEP, clinical validation, regulatory review are external / V3.'],
  );

  // Grant readiness — reproducible + provenance + honest + validation package produced.
  dims.grant = mk('grant',
    0.30 * repro + 0.25 * rq + 0.20 * provenance + 0.15 * descOk + 0.10 * b01((ev.enginesExecuted ?? []).length > 0),
    [
      'reproducible, provenance-hashed validation with auto-generated methodology + figures + tables',
      `${ev.researchQuality?.passedChecks}/${ev.researchQuality?.totalChecks} research-quality checks passed`,
      `descriptor correctness vs first-principles chemistry (Pearson r=${ev.descriptorAccuracy?.pearsonR})`,
    ],
    ['Live-data reference campaign requires network egress (external).'],
  );

  // Investor readiness — quantified metrics + credibility; needs live-data traction.
  dims.investor = mk('investor',
    0.30 * descOk + 0.20 * repro + 0.20 * engineDepth + 0.15 * rq + 0.15 * recovery,
    [
      'quantified, reproducible benchmark metrics (not claims): descriptor MAE, reproducibility, recovery, Truth/MCRE accuracy',
      `real engines: ${[...engines].join(', ') || 'none'}`,
      'honesty contract enforced — no fabricated metrics or evidence',
    ],
    ['A live-data reference campaign + design-partner traction remain (external).'],
  );

  const overall = +clamp01((dims.research.score + dims.biotech.score + dims.pharma.score + dims.grant.score + dims.investor.score) / 5).toFixed(4);
  return { version: READINESS_VERSION, overall, overallBand: band(overall), dimensions: dims, note: 'Scores reflect COMPUTATIONAL validation only; biological/clinical validation and live external data are external dependencies (Genesis V3).' };
}
