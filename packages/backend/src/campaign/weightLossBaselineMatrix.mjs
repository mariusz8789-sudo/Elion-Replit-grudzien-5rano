/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * THE BASELINE MATRIX — what the human record in this repository actually says about
 * the comparators a weight-reduction candidate would have to beat (D-164).
 *
 * WHY IT EXISTS. A candidate gate whose EXPECTED_EFFICACY and SAFETY axes have no
 * benchmark is a gate that cannot reject anything. This module builds that benchmark
 * from the ONE pinned human dataset this repository holds — A2's hash-verified
 * ClinicalTrials.gov v2 + ChEMBL pull (`a2-ozempic-substitute/`, retrieved 2026-09-13,
 * every file carrying its own recorded sha256) — and from nothing else.
 *
 * EVERY NUMBER IS READ FROM THOSE BYTES. Nothing is recalled, averaged across trials,
 * pooled across populations, or filled in from training data. A quantity the pinned
 * records do not carry comes back `UNKNOWN` with a reason, or `BLOCKED_EXTERNAL` when
 * the source that would carry it is unreachable from this runtime. There is no code
 * path in this file that produces a plausible-looking number.
 *
 * EPISTEMIC CLASS. Every row is `EXTERNAL_PUBLISHED`: a trial registry record, not a
 * Genesis result. `isGenesisResult` is false on every row and a test enforces it, for
 * exactly the reason D-155 gives — filed as a Genesis artefact these numbers would read
 * as in-silico output, which is the one confusion they must never create.
 *
 * WHAT IT IS NOT.
 *   - Not a meta-analysis. Arms are reported AS DEPOSITED, per trial, per arm, with N.
 *     A comparison across two trials is labelled `NAIVE_INDIRECT` and carries its own
 *     limitation string; a comparison inside one randomised trial is `DIRECT_RANDOMISED`.
 *     The two are never mixed into one number.
 *   - Not a safety ranking. An adverse-event count from a registry record is not a
 *     tolerability verdict, and a low count in a small arm is not evidence of safety.
 *   - Not a regulatory status source. `maxPhase` is the ChEMBL development-phase field.
 *     It is reported as what it is and mapped to APPROVED / INVESTIGATIONAL / UNKNOWN
 *     only with the mapping and its limitation stated in the row.
 *   - Not a statement that any molecule is safer than any other. Where the pinned data
 *     cannot support that comparison honestly, the answer is UNKNOWN — never 0%.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../determinism.mjs';
import { canonicalHash } from '../provenance.mjs';
import { PINNED_DIR } from './tirzepatideBaseline.mjs';

export const BASELINE_MATRIX_KIND = 'GENESIS_WEIGHT_REDUCTION_BASELINE_MATRIX';
export const BASELINE_MATRIX_VERSION = 1;

/**
 * The comparators the owner named. Each is either resolvable from the pinned record or
 * explicitly BLOCKED_EXTERNAL — the list is written down so a missing comparator is a
 * visible gap rather than a silent omission.
 */
export const REQUESTED_COMPARATORS = Object.freeze([
  { name: 'TIRZEPATIDE', chemblId: 'CHEMBL4297839' },
  { name: 'SEMAGLUTIDE', chemblId: null, note: 'present in the pinned record only as the ACTIVE_COMPARATOR arm of the reference trial, not as a candidate row of its own' },
  { name: 'LIRAGLUTIDE', chemblId: 'CHEMBL4084119' },
  { name: 'RETATRUTIDE', chemblId: null },
  { name: 'CAGRILINTIDE_SEMAGLUTIDE', chemblId: null },
]);

/** Body-weight endpoint titles are matched on the deposited title, never guessed. */
const WEIGHT_TITLE = /body\s*weight/i;

/** ChEMBL max_phase -> a status label, with the mapping's own limitation carried along. */
function regulatoryStatus(maxPhase) {
  const n = Number(maxPhase);
  if (!Number.isFinite(n)) {
    return { status: 'UNKNOWN', basis: 'maxPhase absent or unparseable in the pinned ChEMBL record', limitation: null };
  }
  const limitation = 'ChEMBL max_phase is a development-phase field, not a regulatory determination, and it is not indication-specific: a molecule approved for one indication reports phase 4 whatever its status in weight reduction. It is reported here as the pinned field it is. APPROVED / INVESTIGATIONAL / DISCONTINUED for a WEIGHT-REDUCTION indication is not derivable from this field and is UNKNOWN.';
  if (n >= 4) return { status: 'PHASE_4_IN_CHEMBL', maxPhase: n, basis: 'ChEMBL max_phase >= 4', limitation, weightReductionIndicationStatus: 'UNKNOWN' };
  if (n >= 1) return { status: 'INVESTIGATIONAL_IN_CHEMBL', maxPhase: n, basis: `ChEMBL max_phase ${n}`, limitation, weightReductionIndicationStatus: 'UNKNOWN' };
  return { status: 'PRECLINICAL_OR_UNPHASED_IN_CHEMBL', maxPhase: n, basis: `ChEMBL max_phase ${n}`, limitation, weightReductionIndicationStatus: 'UNKNOWN' };
}

/** Reads one pinned file and checks it against the hash meta.json itself recorded. */
function readVerified(meta, filename) {
  const file = path.join(PINNED_DIR, filename);
  if (!existsSync(file)) return { ok: false, code: 'PINNED_FILE_MISSING', reason: filename };
  const bytes = readFileSync(file);
  const recorded = meta?.files?.[filename]?.narrowSha256;
  if (typeof recorded !== 'string' || recorded === '') {
    return { ok: false, code: 'PINNED_FILE_UNVERIFIED', reason: `meta.json records no narrowSha256 for ${filename}` };
  }
  const actual = sha256Hex(bytes);
  if (actual !== recorded) {
    return { ok: false, code: 'PINNED_FILE_DRIFTED', reason: `${filename}: recorded ${recorded.slice(0, 12)}…, actual ${actual.slice(0, 12)}…` };
  }
  try {
    return { ok: true, data: JSON.parse(bytes.toString('utf8')), sha256: actual };
  } catch (err) {
    return { ok: false, code: 'PINNED_FILE_UNREADABLE', reason: `${filename}: ${String(err?.message ?? err).slice(0, 160)}` };
  }
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Per-arm participant counts of one deposited outcome measure, by group id. */
function denomsByGroup(outcome) {
  const map = new Map();
  for (const d of outcome.denoms ?? []) {
    for (const c of d.counts ?? []) {
      const n = num(c.value);
      if (n !== null && !map.has(c.groupId)) map.set(c.groupId, n);
    }
  }
  return map;
}

/**
 * The body-weight arms of one trial, exactly as deposited: group title, LS-mean or mean
 * change, its deposited spread with the deposited dispersion TYPE, the unit as written,
 * and N. No value is converted, standardised or re-expressed.
 */
function weightArms(trial) {
  const outcomes = (trial.weightOutcomes ?? []).filter((o) => WEIGHT_TITLE.test(o.title ?? ''));
  const rows = [];
  for (const o of outcomes) {
    const denoms = denomsByGroup(o);
    const titleById = new Map((o.groups ?? []).map((g) => [g.id, g.title]));
    for (const cls of o.classes ?? []) {
      for (const cat of cls.categories ?? []) {
        for (const m of cat.measurements ?? []) {
          rows.push({
            nctId: trial.nctId ?? null,
            outcomeTitle: o.title ?? null,
            outcomeType: o.type ?? null,
            paramType: o.paramType ?? null,
            dispersionType: o.dispersionType ?? null,
            unitOfMeasure: o.unitOfMeasure ?? null,
            armTitle: titleById.get(m.groupId) ?? m.groupId ?? null,
            value: num(m.value),
            spread: num(m.spread),
            lowerLimit: num(m.lowerLimit),
            upperLimit: num(m.upperLimit),
            n: denoms.get(m.groupId) ?? null,
            evidenceClass: 'EXTERNAL_PUBLISHED',
          });
        }
      }
    }
  }
  return rows;
}

/**
 * The adverse-event arms of one trial, exactly as deposited. Three STRUCTURAL endpoints
 * come from the registry's own event groups (deaths, serious, other), and the named
 * tolerability terms come from the deposited per-term tables. Rates are a quotient of two
 * deposited integers and are reported with both integers beside them, so a reader can see
 * that a 0/7 is not a safety finding.
 */
const TOLERABILITY_TERMS = Object.freeze([
  { endpoint: 'NAUSEA', pattern: /^nausea/i },
  { endpoint: 'VOMITING', pattern: /^vomiting/i },
  { endpoint: 'DIARRHOEA', pattern: /^(diarrhoea|diarrhea)/i },
  { endpoint: 'CONSTIPATION', pattern: /^constipation/i },
  { endpoint: 'PANCREATITIS', pattern: /pancreatitis/i },
  { endpoint: 'CHOLELITHIASIS_OR_GALLBLADDER', pattern: /(cholelith|cholecyst|gallbladder|gall bladder)/i },
  { endpoint: 'HYPOGLYCAEMIA', pattern: /hypoglyca?emia/i },
]);

function adverseEventArms(trial) {
  const ae = trial.adverseEvents ?? null;
  if (ae === null) return [];
  const rows = [];
  for (const g of ae.eventGroups ?? []) {
    const structural = [
      { endpoint: 'DEATHS', numAffected: g.deathsNumAffected, numAtRisk: g.seriousNumAtRisk },
      { endpoint: 'SERIOUS_ADVERSE_EVENTS', numAffected: g.seriousNumAffected, numAtRisk: g.seriousNumAtRisk },
      { endpoint: 'OTHER_ADVERSE_EVENTS', numAffected: g.otherNumAffected, numAtRisk: g.otherNumAtRisk },
    ];
    for (const s of structural) {
      const affected = num(s.numAffected);
      const atRisk = num(s.numAtRisk);
      rows.push({
        nctId: trial.nctId ?? null,
        armTitle: g.title ?? g.id ?? null,
        endpoint: s.endpoint,
        endpointDefinition: 'Registry event-group total as deposited by the sponsor; the frequency threshold the sponsor applied is reported alongside.',
        frequencyThreshold: ae.frequencyThreshold ?? null,
        numAffected: affected,
        numAtRisk: atRisk,
        rate: affected !== null && atRisk !== null && atRisk > 0 ? affected / atRisk : null,
        rateIsNotAVerdict: true,
        evidenceClass: 'EXTERNAL_PUBLISHED',
      });
    }
    const allTerms = [...(ae.seriousEvents ?? []), ...(ae.otherEvents ?? [])];
    for (const spec of TOLERABILITY_TERMS) {
      let affected = null;
      let atRisk = null;
      let matched = 0;
      for (const ev of allTerms) {
        if (!spec.pattern.test(ev.term ?? '')) continue;
        for (const st of ev.stats ?? []) {
          if (st.groupId !== g.id) continue;
          const a = num(st.numAffected);
          const r = num(st.numAtRisk);
          if (a === null || r === null) continue;
          matched += 1;
          // Several deposited terms can map to one endpoint. The worst single deposited
          // term is taken, never a sum: summing would double-count participants who had
          // two of them, which the registry does not let us detect.
          if (affected === null || a > affected) { affected = a; atRisk = r; }
        }
      }
      if (matched === 0) continue;
      rows.push({
        nctId: trial.nctId ?? null,
        armTitle: g.title ?? g.id ?? null,
        endpoint: spec.endpoint,
        endpointDefinition: `Worst single deposited adverse-event term matching ${spec.endpoint} for this arm (${matched} deposited term(s) matched). Terms are never summed, because the registry does not say whether one participant had two of them.`,
        frequencyThreshold: ae.frequencyThreshold ?? null,
        numAffected: affected,
        numAtRisk: atRisk,
        rate: affected !== null && atRisk !== null && atRisk > 0 ? affected / atRisk : null,
        rateIsNotAVerdict: true,
        evidenceClass: 'EXTERNAL_PUBLISHED',
      });
    }
  }
  return rows;
}

/**
 * A DIRECT randomised comparison exists only when two arms of the SAME trial carry the
 * same deposited outcome. That is the only comparison this module computes; anything
 * across two trials is reported as a pair of rows with an explicit NAIVE_INDIRECT label
 * and no delta, because the populations, doses and durations differ and the pinned record
 * does not say by how much.
 */
function directWeightComparisons(trial) {
  const rows = weightArms(trial);
  const byOutcome = new Map();
  for (const r of rows) {
    const key = `${r.nctId}|${r.outcomeTitle}|${r.unitOfMeasure}`;
    byOutcome.set(key, [...(byOutcome.get(key) ?? []), r]);
  }
  const out = [];
  for (const [, arms] of byOutcome) {
    if (arms.length < 2) continue;
    for (const a of arms) {
      for (const b of arms) {
        if (a.armTitle === b.armTitle || a.value === null || b.value === null) continue;
        if (String(a.armTitle) >= String(b.armTitle)) continue;
        out.push({
          nctId: a.nctId,
          outcomeTitle: a.outcomeTitle,
          unitOfMeasure: a.unitOfMeasure,
          armA: { title: a.armTitle, value: a.value, n: a.n, spread: a.spread },
          armB: { title: b.armTitle, value: b.value, n: b.n, spread: b.spread },
          deltaAMinusB: a.value - b.value,
          comparisonClass: 'DIRECT_RANDOMISED',
          evidenceClass: 'EXTERNAL_PUBLISHED',
          limitation: `Both arms come from ${a.nctId}, so the randomisation is real. The delta is the difference of two deposited ${a.paramType ?? 'summary'} values on "${a.outcomeTitle}"; its confidence interval is NOT deposited for the difference and is therefore UNKNOWN. The result applies only to this trial's population, doses and duration.`,
          differenceConfidenceInterval: 'UNKNOWN',
          differenceConfidenceIntervalReason: 'the registry record deposits per-arm summaries, not a between-arm interval, and this module does not synthesise one',
        });
      }
    }
  }
  return out;
}

/**
 * Builds the matrix. Pure: reads only the pinned files, writes nothing, and returns the
 * same object for the same bytes.
 */
export function buildWeightLossBaselineMatrix() {
  const metaFile = path.join(PINNED_DIR, 'meta.json');
  if (!existsSync(metaFile)) return { ok: false, code: 'PINNED_DATA_MISSING', reason: `meta.json not found at ${PINNED_DIR}` };
  let meta;
  try {
    meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  } catch (err) {
    return { ok: false, code: 'PINNED_DATA_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }

  const candidates = readVerified(meta, 'candidates.json');
  if (!candidates.ok) return candidates;
  const reference = readVerified(meta, 'reference-semaglutide-NCT03987919.json');
  if (!reference.ok) return reference;

  const byChemblId = new Map((candidates.data ?? []).map((c) => [c.moleculeChemblId, c]));

  const molecules = [];
  const blocked = [];
  for (const want of REQUESTED_COMPARATORS) {
    if (want.chemblId === null) {
      // A comparator with no candidate row of its own is either present as a randomised
      // ARM of the reference trial — in which case its numbers are real and live under
      // referenceHeadToHead — or genuinely absent from the pinned pull.
      blocked.push(want.note
        ? {
          name: want.name,
          status: 'PARTIAL_PRESENT_ONLY_AS_COMPARATOR_ARM',
          reason: want.note,
          whereItsNumbersAre: 'referenceHeadToHead — the arms of the one pinned trial that randomises it against another named comparator on body weight',
          whatIsStillMissing: 'its own bioactivity row, its own trial set, and every endpoint outside that single trial',
          neverSubstituted: 'No remembered trial result stands in for the missing part. It is PARTIAL, not estimated.',
        }
        : {
          name: want.name,
          status: 'BLOCKED_EXTERNAL',
          reason: 'absent from the pinned 2026-09-13 ChEMBL/ClinicalTrials.gov pull, and no source that carries it is reachable from this runtime',
          whatIsNeeded: 'a new hash-recorded fetch of the registry and bioactivity records for this molecule, which needs network egress this container does not have',
          neverSubstituted: 'No remembered trial result stands in for this row. It is BLOCKED, not estimated.',
        });
      continue;
    }
    const summary = byChemblId.get(want.chemblId) ?? null;
    if (summary === null) {
      blocked.push({ name: want.name, status: 'BLOCKED_DATA', reason: `${want.chemblId} is not a row of the pinned candidates table` });
      continue;
    }
    const trials = readVerified(meta, `trials-${want.chemblId}.json`);
    if (!trials.ok) return trials;
    const trialList = Array.isArray(trials.data) ? trials.data : [];
    const weightRows = trialList.flatMap(weightArms);
    const aeRows = trialList.flatMap(adverseEventArms);
    const direct = trialList.flatMap(directWeightComparisons);
    molecules.push({
      name: want.name,
      prefName: summary.prefName ?? null,
      moleculeChemblId: want.chemblId,
      moleculeType: summary.moleculeType ?? null,
      regulatory: regulatoryStatus(summary.maxPhase),
      measuredPotencyNMByTarget: summary.medianPotencyNMByTarget ?? null,
      qualifyingAssayCounts: summary.qualifyingAssayCounts ?? null,
      source: { dataset: 'a2-ozempic-substitute', file: `trials-${want.chemblId}.json`, sha256: trials.sha256, retrievedAt: meta.retrievedAt ?? null, provider: 'ClinicalTrials.gov API v2 + ChEMBL Web Services', licence: 'ClinicalTrials.gov records are US Government public-domain data; ChEMBL is CC BY-SA 3.0' },
      trials: trialList.map((t) => ({ nctId: t.nctId ?? null, briefTitle: t.briefTitle ?? null, arms: t.arms ?? [] })),
      bodyWeightEndpoints: weightRows,
      adverseEventEndpoints: aeRows,
      directRandomisedWeightComparisons: direct,
      isGenesisResult: false,
      epistemicStatus: 'EXTERNAL_PUBLISHED',
    });
  }

  // The reference trial is the only record in this repository that randomises two of the
  // named comparators against each other on body weight, so it is surfaced on its own.
  const refTrial = reference.data;
  const referenceHeadToHead = {
    nctId: refTrial.nctId ?? null,
    briefTitle: refTrial.briefTitle ?? null,
    arms: refTrial.arms ?? [],
    source: { file: 'reference-semaglutide-NCT03987919.json', sha256: reference.sha256, retrievedAt: meta.retrievedAt ?? null },
    bodyWeightEndpoints: weightArms(refTrial),
    adverseEventEndpoints: adverseEventArms(refTrial),
    directRandomisedWeightComparisons: directWeightComparisons(refTrial),
    isGenesisResult: false,
    epistemicStatus: 'EXTERNAL_PUBLISHED',
  };

  const body = {
    kind: BASELINE_MATRIX_KIND,
    contractVersion: BASELINE_MATRIX_VERSION,
    pinnedDataset: { dir: 'packages/frontend/src/core/biotechData/a2-ozempic-substitute', retrievedAt: meta.retrievedAt ?? null, everyFileHashVerified: true },
    molecules,
    referenceHeadToHead,
    blockedComparators: blocked,
    endpointsThisMatrixCannotReport: [
      { endpoint: 'TREATMENT_DISCONTINUATION_DUE_TO_ADVERSE_EVENTS', status: 'UNKNOWN', reason: 'the pinned registry records deposit event-group totals and per-term tables, not a withdrawal-by-reason table' },
      { endpoint: 'CARDIOVASCULAR_OUTCOMES', status: 'UNKNOWN', reason: 'no pinned trial in this dataset deposits an adjudicated cardiovascular outcome' },
      { endpoint: 'RENAL_OUTCOMES', status: 'UNKNOWN', reason: 'not deposited as an outcome measure in any pinned trial here' },
      { endpoint: 'HEPATIC_SIGNALS', status: 'UNKNOWN', reason: 'not deposited as an outcome measure in any pinned trial here' },
      { endpoint: 'LEAN_MASS_AND_BODY_COMPOSITION', status: 'UNKNOWN', reason: 'no pinned trial here deposits a body-composition outcome' },
      { endpoint: 'ADHERENCE', status: 'UNKNOWN', reason: 'not deposited as an outcome measure in any pinned trial here' },
    ],
    standingCorrectionsThatThisMatrixMustNotContradict: [
      'Greater weight loss on tirzepatide than on semaglutide in the one direct randomised comparison present here does not make tirzepatide safer or better tolerated: gastrointestinal events are common in both arms of that trial, and this matrix reports them per arm rather than summarising them.',
      'A molecule is not assumed safer because it is older, newer, approved, natural, or a peptide.',
      'Strong results from an investigational molecule are not evidence that it is free of adverse effects.',
    ],
    honesty: 'Every value is read from a hash-verified pinned registry or bioactivity record. No value is pooled across trials, adjusted, standardised or recalled. Where a quantity is not in those bytes the entry is UNKNOWN or BLOCKED, never a number.',
    isGenesisResult: false,
    epistemicStatus: 'EXTERNAL_PUBLISHED',
  };
  return { ok: true, matrix: { ...body, matrixFingerprint: canonicalHash(body).slice(0, 16) } };
}
