/**
 * D-102 — PREREGISTRATION, sealed on direct instruction from the account
 * owner ("Pieczętuję cztery punkty z D-100"). Sealed BEFORE any measurement
 * that depends on it runs — same discipline as D-088/D-091/D-092.
 *
 * The four rules below are the account owner's decision, relayed to this
 * repository as prose in D-100 and now made executable. Executable form is
 * mine; the decision is not.
 */
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

/** Five families named in the seal. Anything matching none of them is OTHER — not invented, not silently dropped. */
export const READOUT_FAMILIES = Object.freeze(['CAMP', 'ARRESTIN', 'CALCIUM', 'INTERNALIZATION', 'BINDING', 'OTHER']);

/** The two assays flagged in D-098/D-099: real, described assays with an unexplained near-uniform value. */
export const SUSPECT_FLAT_VALUE_ASSAYS = Object.freeze(['CHEMBL6113416', 'CHEMBL6113417']);

/** The three A3 chunk-3 assays whose custody was never verified (D-099, D-101). */
export const UNVERIFIED_LABEL_ASSAYS = Object.freeze(['CHEMBL5732843', 'CHEMBL5734588', 'CHEMBL5734589']);

export const PREREG = Object.freeze({
  id: 'D-102-READOUT-FAMILY-PREREG',
  sealedBy: 'account owner, direct instruction: "Pieczętuję cztery punkty z D-100"',
  sealedAt: '2026-09-15',
  rules: Object.freeze([
    Object.freeze({
      id: 'ACTION_TYPE_COVARIATE',
      text: 'action_type is carried as a covariate on every row. It is never used to include or exclude a row.',
    }),
    Object.freeze({
      id: 'READOUT_FAMILY_DEFINITION',
      text:
        'Readout family is derived from the assay\'s "assessed as …" clause in its A3 description (or bao_label when ' +
        'that clause is absent), classified into exactly the five named families plus OTHER for anything matching ' +
        'none. Used ONLY to stratify the noise-floor spread computation — never to drop a row from the training set.',
      families: READOUT_FAMILIES,
    }),
    Object.freeze({
      id: 'HSA_CONDITION_WITHIN_CAMP',
      text:
        'An assay differing from a sibling only by HSA (human serum albumin) condition stays inside the CAMP family ' +
        '— never split into its own top-level family, never merged into a single HSA-agnostic assay. Its condition ' +
        '(e.g. "0% HSA", "4.4% HSA") is recorded as metadata on the group for traceability.',
    }),
    Object.freeze({
      id: 'SUSPECT_FLAT_VALUE_EXCLUSION',
      text:
        'Rows keyed to a suspect-flat-value assay are excluded ONLY from the noise-floor spread computation. They ' +
        'remain in every other count (training-set size, replicate-group membership elsewhere) and are tagged ' +
        'SUSPECT_FLAT_VALUE on output.',
      assays: SUSPECT_FLAT_VALUE_ASSAYS,
    }),
  ]),
});

export const PREREG_FINGERPRINT = canonicalHash(PREREG).slice(0, 16);
