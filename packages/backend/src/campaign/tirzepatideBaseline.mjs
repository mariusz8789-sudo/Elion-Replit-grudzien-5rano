/**
 * D-074 — FROZEN TIRZEPATIDE BASELINE (GENESIS-MOL-01).
 *
 * The reference material this mission searches against, loaded from the REAL
 * pinned ChEMBL record already in this repo
 * (`packages/frontend/src/core/biotechData/a2-ozempic-substitute/`, A2's own
 * CI-fetched, hash-pinned dataset). Nothing here is typed in by hand: the
 * potencies, phase and assay counts below are read from those bytes at call
 * time, and the bytes are verified against `meta.json`'s own recorded
 * `narrowSha256` before any value is returned. A drifted or missing file
 * fails closed — this module never falls back to a remembered number.
 *
 * ================== THE TWO HONEST LIMITS OF THIS BASELINE ==================
 *
 * 1. NO STRUCTURE. The pinned record carries `moleculeChemblId`, `prefName`,
 *    `moleculeType`, `maxPhase`, `medianPotencyNMByTarget` and
 *    `qualifyingAssayCounts` — and NO SMILES. Tirzepatide is a 39-residue
 *    peptide; its structure is not in this repo and cannot be fetched here
 *    (ChEMBL is unreachable from this runtime — verified, HTTP 403 at the
 *    egress proxy, not assumed). Therefore NO structural comparison between a
 *    generated candidate and this baseline is possible, and this module
 *    reports `structureAvailable: false` rather than substituting a similar
 *    molecule or a remembered SMILES string.
 *
 * 2. NO EFFICACY PREDICTOR. The baseline's efficacy is REAL, MEASURED
 *    bioactivity (median GLP-1R / GIPR potency in nM, from real ChEMBL
 *    assays). A generated candidate has NO such measurement and this repo has
 *    no GLP-1R/GIPR activity model to estimate one — and, because the pinned
 *    actives carry no structures either, not even a ligand-similarity proxy
 *    can be built. The efficacy axis is therefore UNAVAILABLE, not merely
 *    weak. `efficacyAxis()` below states that as data, so the decision
 *    function can fail closed on it instead of a caller quietly skipping it.
 *
 * Both limits are the reason GENESIS-MOL-01's honest terminal state is
 * NO_WINNER on the efficacy axis. They are recorded here, next to the
 * baseline itself, so no downstream reader can use this baseline without
 * also receiving its limits.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The single source of truth — A2's pinned dataset. Never duplicated into this package. */
export const PINNED_DIR = path.resolve(HERE, '../../../frontend/src/core/biotechData/a2-ozempic-substitute');

export const BASELINE_CHEMBL_ID = 'CHEMBL4297839';
export const BASELINE_NAME = 'TIRZEPATIDE';

/** Comparator small molecules already present in the same pinned record — real oral GLP-1R agonist programmes. */
export const COMPARATOR_CHEMBL_IDS = Object.freeze(['CHEMBL4518483', 'CHEMBL4446782', 'CHEMBL5314631', 'CHEMBL2381848']);

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Reads + integrity-checks the pinned candidate table. Fails closed on a
 * missing file, unreadable JSON, or a sha256 that does not match the hash
 * `meta.json` itself recorded when the data was fetched.
 */
export function loadPinnedCandidates() {
  const candidatesPath = path.join(PINNED_DIR, 'candidates.json');
  const metaPath = path.join(PINNED_DIR, 'meta.json');
  if (!existsSync(candidatesPath) || !existsSync(metaPath)) {
    return { ok: false, code: 'PINNED_DATA_MISSING', reason: `pinned dataset not found at ${PINNED_DIR}` };
  }
  let raw;
  let meta;
  try {
    raw = readFileSync(candidatesPath);
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (err) {
    return { ok: false, code: 'PINNED_DATA_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }
  const recorded = meta?.files?.['candidates.json']?.narrowSha256;
  const actual = sha256Hex(raw);
  if (typeof recorded !== 'string' || recorded.length === 0) {
    return { ok: false, code: 'PINNED_DATA_UNVERIFIED', reason: 'meta.json records no narrowSha256 for candidates.json' };
  }
  if (recorded !== actual) {
    return { ok: false, code: 'PINNED_DATA_DRIFTED', reason: `candidates.json sha256 ${actual} != pinned ${recorded} — refusing to read a drifted dataset` };
  }
  let candidates;
  try {
    candidates = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    return { ok: false, code: 'PINNED_DATA_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }
  return { ok: true, candidates, contentSha256: actual, retrievedAt: meta.retrievedAt ?? null };
}

/**
 * The frozen baseline record. Every field is read from the verified pinned
 * bytes; `structureAvailable` and `efficacyPredictorAvailable` are stated
 * explicitly and are both false in this runtime.
 */
export function tirzepatideBaseline() {
  const loaded = loadPinnedCandidates();
  if (!loaded.ok) return loaded;
  const row = loaded.candidates.find((c) => c.moleculeChemblId === BASELINE_CHEMBL_ID);
  if (!row) {
    return { ok: false, code: 'BASELINE_NOT_IN_PINNED_DATA', reason: `${BASELINE_CHEMBL_ID} (${BASELINE_NAME}) absent from the pinned candidate table` };
  }
  const comparators = COMPARATOR_CHEMBL_IDS
    .map((id) => loaded.candidates.find((c) => c.moleculeChemblId === id))
    .filter(Boolean)
    .map((c) => ({
      chemblId: c.moleculeChemblId,
      name: c.prefName,
      moleculeType: c.moleculeType,
      maxPhase: c.maxPhase,
      glp1rMedianNM: c.medianPotencyNMByTarget?.glp1r ?? null,
    }));

  return {
    ok: true,
    baseline: Object.freeze({
      chemblId: row.moleculeChemblId,
      name: row.prefName,
      moleculeType: row.moleculeType,
      maxPhase: row.maxPhase,
      measuredPotencyNM: Object.freeze({ ...row.medianPotencyNMByTarget }),
      qualifyingAssayCounts: Object.freeze({ ...row.qualifyingAssayCounts }),
      // --- the two limits, carried WITH the baseline, never separable from it ---
      structureAvailable: false,
      structureAbsentReason:
        'the pinned ChEMBL record carries no SMILES for this molecule (a 39-residue peptide), and ChEMBL is unreachable from this runtime (egress proxy returns HTTP 403) — no structural comparison to a generated candidate is possible',
      evidenceClass: 'MEASURED_BIOACTIVITY',
      provenance: {
        source: 'ChEMBL (A2 pinned dataset, CI-fetched)',
        dir: 'packages/frontend/src/core/biotechData/a2-ozempic-substitute',
        contentSha256: loaded.contentSha256,
        retrievedAt: loaded.retrievedAt,
      },
      comparators,
    }),
  };
}

/**
 * The efficacy axis, stated as data rather than left implicit. A decision
 * function reads this and fails closed; it never has to infer from an absence.
 *
 * D-076/077 — ADDITIVE OPTIONAL ARGUMENT. Called with no argument (its three
 * pre-existing call sites, and every D-074 test) it behaves EXACTLY as before:
 * UNAVAILABLE, with the reasons that would close it. Passed a
 * `GLP1REfficacyPrediction` whose status is AVAILABLE — which
 * `glp1rEfficacyAdapter.mjs` only ever produces from a model that cleared the
 * frozen D-077 validation gate on a hash-verified human GLP-1R pin — it
 * reports the axis as available on a MODEL_ESTIMATE basis.
 *
 * WHAT THAT DOES AND DOES NOT MEAN. It closes the TECHNICAL absence of a
 * prediction axis, so `decide()` stops listing EFFICACY_AXIS_UNAVAILABLE as a
 * blocker. It does NOT make the candidate's activity a measurement, and it
 * does NOT entitle anything to a WinnerRecord: D-057 adjudicates promotion on
 * evidence class, and MODEL_ESTIMATE is not a member of
 * `core/agent/evidenceProvenance.ts`'s `EvidenceClass` union at all — it
 * degrades to UNVERIFIED (rank 1), far below the INDIRECT_RANDOMISED (rank 9)
 * the Winner Gate requires. A validated QSAR earns a COMPUTATIONAL result,
 * never a clinical one.
 */
export function efficacyAxis(qsarPrediction = null) {
  if (qsarPrediction && qsarPrediction.status === 'AVAILABLE') {
    return Object.freeze({
      axis: 'TARGET_RELEVANT_ACTIVITY',
      targets: Object.freeze(['GLP1R']),
      available: true,
      code: 'MODEL_ESTIMATE_AVAILABLE',
      evidenceClass: 'MODEL_ESTIMATE',
      isMeasurement: false,
      prediction: qsarPrediction,
      reasons: Object.freeze([
        `GLP-1R activity is available as a MODEL_ESTIMATE from QSAR model ${qsarPrediction.modelVersion} (fingerprint ${qsarPrediction.modelFingerprint}, training data ${qsarPrediction.trainingDataHash}), which cleared the frozen D-077 validation gate`,
        'this is a predicted value with a conformal interval, NOT a measured potency — the baseline side of this axis is real measured bioactivity and the candidate side is a model output, and that asymmetry travels with the comparison',
        'GIPR activity remains unavailable: this model covers GLP-1R only',
      ]),
      whatWouldCloseIt: Object.freeze([
        'a measured GLP-1R potency for the candidate (a real assay) would replace this MODEL_ESTIMATE with an observation and is the only thing that can raise the evidence class',
      ]),
    });
  }
  return Object.freeze({
    axis: 'TARGET_RELEVANT_ACTIVITY',
    targets: Object.freeze(['GLP1R', 'GIPR']),
    available: false,
    code: 'EFFICACY_AXIS_UNAVAILABLE',
    reasons: Object.freeze([
      'no GLP-1R/GIPR activity predictor exists in this repository (verified by audit, not assumed)',
      'the pinned ChEMBL actives carry measured potencies but NO structures, so not even a ligand-similarity proxy can be fitted',
      'ChEMBL/PubChem are unreachable from this runtime (egress proxy HTTP 403), so structures cannot be obtained',
    ]),
    whatWouldCloseIt: Object.freeze([
      'structures (SMILES) for the pinned GLP-1R actives — enables a ligand-similarity or QSAR baseline',
      'a validated GLP-1R/GIPR activity model, or a receptor structure plus a working docking engine (AutoDock Vina is absent here)',
    ]),
  });
}
