import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_ITEMS, assertNonOperational, buildChemistryHandoffPackage,
} from './chemistryHandoffPackage.mjs';
import { detect as rdkitDetect } from '../compute/rdkitAdapter.mjs';

/**
 * D-164 — the chemistry handoff package, proved negative-first.
 *
 * The properties that matter are all refusals: that the package never carries an
 * operational synthesis procedure, that a genuinely absent item reads UNKNOWN or BLOCKED
 * rather than as a plausible number, that an incomplete package SAYS it is incomplete,
 * and that the public pack carries no structure.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The mechanism-demonstration molecule: the lowest-molecular-weight distinct compound of
 * the pinned GLP-1R activity table (`glp1rActivity.json`), chosen by a mechanical rule so
 * nobody picks a flattering molecule. It is NOT a candidate and nothing here says it does
 * anything.
 */
const DEMO_SMILES = 'CS(=O)(=O)c1nc2cc(Cl)c(Cl)cc2nc1N';

test('the demonstration molecule really is in the pinned activity table', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1rActivity.json'), 'utf8'));
  assert.ok(rows.some((r) => r.canonicalSmiles === DEMO_SMILES), 'the demonstration molecule must come from real pinned data, not be typed in');
});

const skipNoRdkit = { skip: rdkitDetect().available ? false : 'RDKit runtime unavailable' };

describe('the owner\'s absolute constraint: never an operational procedure', () => {
  test('the guard catches a quantity, a temperature, a duration, a concentration and a bench operation', () => {
    const cases = [
      ['QUANTITY', { note: 'treat with 1.2 equiv of the reagent' }],
      ['QUANTITY', { note: 'dissolve in 50 mL of solvent' }],
      ['TEMPERATURE', { note: 'the reaction runs at 80 °C' }],
      ['TEMPERATURE', { note: 'hold at 250 K' }],
      ['TIME', { note: 'allow 16 h' }],
      ['QUANTITY', { note: 'a 0.1 M solution' }],
      ['OPERATION', { note: 'added dropwise to the mixture' }],
      ['OPERATION', { note: 'concentrate in vacuo' }],
      ['STEP_BY_STEP', { note: 'Step 1: add the amine' }],
      ['GLASSWARE_WITH_SIZE', { note: 'in a 250 mL round-bottom flask' }],
    ];
    for (const [id, pack] of cases) {
      assert.throws(() => assertNonOperational(pack), new RegExp(id), `the guard must catch ${id} in ${JSON.stringify(pack)}`);
    }
  });

  test('it lets through the conceptual language the package is actually allowed to carry', () => {
    assertNonOperational({
      disconnections: ['amide bond retro-disconnection to a carboxylic acid and an amine'],
      buildingBlockClasses: ['commercially available ortho-dichloro anilines'],
      roughStepCount: 'three to five steps',
      riskiest: 'the sulfone installation, on chemoselectivity grounds',
      analytics: ['HIGH_RESOLUTION_MASS_SPECTROMETRY', 'NUCLEAR_MAGNETIC_RESONANCE'],
    });
  });

  test('a real package passes the guard, and the generator says so in data', { ...skipNoRdkit }, () => {
    const r = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    assert.equal(r.ok, true);
    assertNonOperational(r.full);
    assertNonOperational(r.public);
    assert.equal(r.full.operationalSynthesisProcedure, 'NEVER_INCLUDED');
  });

  test('the generator refuses to emit rather than returning a forbidden package', { ...skipNoRdkit }, () => {
    assert.throws(
      () => buildChemistryHandoffPackage({
        candidateId: 'DEMO-002',
        smiles: DEMO_SMILES,
        evidence: { whyItWon: 'stir at 60 °C for 4 h, then concentrate in vacuo' },
      }),
      /operational synthesis content/,
    );
  });
});

describe('every value is real or explicitly absent', () => {
  test('the identity block is computed by RDKit on the real molecule', { ...skipNoRdkit }, () => {
    const { full } = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    const i = full.items;
    assert.equal(i.canonicalSmiles, DEMO_SMILES);
    assert.equal(i.molecularFormula, 'C9H7Cl2N3O2S');
    assert.ok(Math.abs(i.molecularWeight.averageMolWt - 292.133) < 0.5, `unexpected molecular weight ${i.molecularWeight.averageMolWt}`);
    assert.match(i.inchi, /^InChI=1S\//);
    assert.match(i.inchiKey, /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/);
    assert.equal(i.chargeAndProtonationState.formalCharge, 0);
    assert.equal(i.stereochemistry.status, 'COMPUTED');
    assert.equal(i.tautomersAndProtomers.status, 'COMPUTED');
    assert.equal(i.structure3D.status, 'COMPUTED');
    assert.ok(i.structure3D.nAtoms > 0);
    assert.match(i.structure3D.coordinatesSha256, /^[0-9a-f]{64}$/);
    assert.match(full.engine.rdkit, /^RDKit /);
  });

  test('an item this runtime cannot produce is UNKNOWN or BLOCKED with a reason — never a number', { ...skipNoRdkit }, () => {
    const { full } = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    const i = full.items;
    for (const key of [
      'referenceCompoundSuppliers', 'publishedRoutesOrAnalogousClasses', 'syntheticAccessibility',
      'predictedSolubilityProblems', 'predictedStabilityProblems', 'predictedAggregationProblems',
      'predictedMetabolismProblems', 'literatureWithIdentifiers',
      'conceptualRetrosyntheticDisconnections', 'commerciallyAvailableBuildingBlockClasses',
      'roughStepCount', 'riskiestTransformations', 'expectedSelectivityProblems',
    ]) {
      const item = i[key];
      assert.ok(['UNKNOWN', 'BLOCKED'].includes(item.status), `${key} must be UNKNOWN or BLOCKED, got ${JSON.stringify(item).slice(0, 120)}`);
      assert.equal(item.value, null, `${key} must carry no value`);
      assert.ok(typeof item.reason === 'string' && item.reason.length > 0, `${key} must say why`);
      assert.ok(typeof item.whatWouldCloseIt === 'string' && item.whatWouldCloseIt.length > 0, `${key} must say what would close it`);
    }
  });

  test('no absent item is filled with a number anywhere in the pack', { ...skipNoRdkit }, () => {
    const { full } = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    const walk = (v) => {
      if (v === null || typeof v !== 'object') return;
      if (!Array.isArray(v) && (v.status === 'UNKNOWN' || v.status === 'BLOCKED')) {
        for (const [k, inner] of Object.entries(v)) {
          if (k === 'status' || k === 'value' || k === 'reason' || k === 'whatWouldCloseIt') continue;
          assert.ok(!Number.isFinite(inner), `an UNKNOWN/BLOCKED item must carry no number, found ${k}=${inner}`);
        }
      }
      for (const inner of Array.isArray(v) ? v : Object.values(v)) walk(inner);
    };
    walk(full.items);
  });
});

describe('an incomplete package says so', () => {
  test('the demonstration package is INCOMPLETE and names every missing item', { ...skipNoRdkit }, () => {
    const r = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    assert.equal(r.status, 'INCOMPLETE');
    assert.equal(r.full.status, 'INCOMPLETE');
    assert.ok(r.missingItems.length > 0);
    for (const m of r.missingItems) assert.ok(REQUIRED_ITEMS.includes(m), `${m} is not a required item`);
    // the items that ARE real must not be listed as missing
    for (const filled of ['candidateId', 'canonicalSmiles', 'inchi', 'inchiKey', 'molecularFormula', 'molecularWeight', 'stereochemistry', 'structure2D', 'structure3D']) {
      assert.ok(!r.missingItems.includes(filled), `${filled} is computed and must not be reported missing`);
    }
  });

  test('the purpose label says, in data, that the demonstration molecule is not a candidate', { ...skipNoRdkit }, () => {
    const { full } = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    assert.equal(full.purpose, 'MECHANISM_DEMONSTRATION');
    assert.match(full.purposeNote, /not a candidate/);
  });

  test('a missing structure or id is refused outright', () => {
    assert.equal(buildChemistryHandoffPackage({ candidateId: '', smiles: DEMO_SMILES }).code, 'NO_CANDIDATE_ID');
    assert.equal(buildChemistryHandoffPackage({ candidateId: 'X', smiles: '' }).code, 'NO_STRUCTURE');
  });
});

describe('the public pack carries no secrets and no overclaiming', () => {
  test('it carries no SMILES, InChI, InChIKey, formula or structure', { ...skipNoRdkit }, () => {
    const r = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION', noveltyStatus: 'NEW_COMPUTATIONAL_PROPOSAL' });
    const text = JSON.stringify(r.public);
    assert.ok(!text.includes(DEMO_SMILES), 'the public pack must not carry the structure');
    assert.ok(!text.includes('InChI='), 'the public pack must not carry an InChI');
    assert.ok(!text.includes('C9H7Cl2N3O2S'), 'the public pack must not carry the molecular formula');
    assert.equal(r.public.structureWithheld, true);
    assert.match(r.public.structureWithheldReason, /IP_REVIEW_REQUIRED/);
    assert.equal(r.public.chemistryHandoffIncluded, false);
    assert.match(r.public.structureHash, /^[0-9a-f]{64}$/);
  });

  test('neither pack uses a forbidden phrase', { ...skipNoRdkit }, () => {
    const r = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    for (const pack of [r.full, r.public]) {
      const text = JSON.stringify(pack).toLowerCase();
      for (const phrase of ['ai cured', 'drug discovered', 'clinically proven', 'zero side effects', 'no side effects', 'signed evidence']) {
        assert.ok(!text.includes(phrase), `a pack must never say "${phrase}"`);
      }
      assert.equal(pack.unsigned, true);
    }
  });

  test('a known compound does not trigger IP review; an unverified or novel structure does', { ...skipNoRdkit }, () => {
    assert.equal(buildChemistryHandoffPackage({ candidateId: 'D', smiles: DEMO_SMILES, noveltyStatus: 'KNOWN_COMPOUND' }).full.ipReview, 'PASS');
    assert.equal(buildChemistryHandoffPackage({ candidateId: 'D', smiles: DEMO_SMILES }).full.ipReview, 'IP_REVIEW_REQUIRED');
  });
});

describe('determinism', () => {
  test('the same molecule yields the same pack fingerprint', { ...skipNoRdkit }, () => {
    const a = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    const b = buildChemistryHandoffPackage({ candidateId: 'DEMO-001', smiles: DEMO_SMILES, purpose: 'MECHANISM_DEMONSTRATION' });
    assert.equal(a.full.packFingerprint, b.full.packFingerprint);
    assert.equal(a.public.packFingerprint, b.public.packFingerprint);
  });
});
