import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDockingTargets, DEFAULT_DOCKING_TARGET } from '../compute/dockingTargets.mjs';

/**
 * D-154 — guard on the sealed GLP-1R structure selection.
 *
 * The run needs the raw RCSB artefacts and is not re-executed here. What is guarded is what
 * could rot silently: that the outcome is one the preregistration allowed, that every hard
 * filter is accounted for, that a NO_STRUCTURE_SELECTED verdict has not quietly been followed
 * by registering a target anyway, and that a selected structure without a small-molecule ligand
 * carries its mandatory limitation.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEALED = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d154-structure-selection.sealed.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d154-structure-selection-prereg.json'), 'utf8'));

const HARD_FILTERS = ['E1_isHumanGlp1r', 'E2_resolution', 'E3_activeState', 'E4_pocketIntegrity', 'E5_noPocketMutation'];

describe('D-154 sealed GLP-1R structure selection', () => {
  test('the outcome is one of the three the preregistration allowed', () => {
    assert.ok(Object.keys(PREREG.allowedOutcomes).includes(SEALED.outcome), `unexpected outcome ${SEALED.outcome}`);
  });

  test('both preregistered candidates were assessed, and every hard filter was applied to each', () => {
    assert.deepEqual(SEALED.candidates.map((c) => c.pdbId).sort(), ['7C2E', '7S15']);
    for (const c of SEALED.candidates) {
      assert.deepEqual(c.eligibility.checks.map((x) => x.id), HARD_FILTERS, `${c.pdbId} did not run every hard filter`);
      for (const chk of c.eligibility.checks) {
        assert.equal(typeof chk.ok, 'boolean');
        assert.ok(typeof chk.observed === 'string' && chk.observed.length > 0, `${c.pdbId}/${chk.id} recorded no observed value`);
      }
      assert.equal(c.eligibility.eligible, c.eligibility.checks.every((x) => x.ok));
    }
  });

  test('the frozen thresholds in the seal are the ones in the preregistration', () => {
    assert.equal(SEALED.frozenRule.maxResolutionAngstrom, 4.0);
    assert.equal(SEALED.frozenRule.humanGlp1rUniprot, 'P43220');
    assert.deepEqual(SEALED.frozenRule.ligandHeavyAtomWindow, [10, 60]);
    assert.match(PREREG.eligibility.E2_resolution, /4\.0 Angstrom/);
  });

  test('every source file the run read was hash-verified', () => {
    assert.equal(SEALED.sourceData.allHashesMatched, true);
    assert.ok(SEALED.sourceData.filesVerified >= 10);
    for (const f of SEALED.sourceData.files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.match(f.sourceUrl, /^https:\/\/(files|data)\.rcsb\.org\//);
      assert.equal(f.httpStatus, 200);
    }
  });

  test('no structure is selected unless it passed every hard filter', () => {
    if (SEALED.outcome === 'NO_STRUCTURE_SELECTED') {
      assert.equal(SEALED.selected, null);
      assert.ok(SEALED.candidates.every((c) => !c.eligibility.eligible));
      return;
    }
    const chosen = SEALED.candidates.find((c) => c.pdbId === SEALED.selected.pdbId);
    assert.ok(chosen, 'the selected id is not among the assessed candidates');
    assert.equal(chosen.eligibility.eligible, true);
  });

  test('a selected structure with no small-molecule ligand carries the mandatory limitation', () => {
    if (SEALED.outcome !== 'STRUCTURE_SELECTED') return;
    const chosen = SEALED.candidates.find((c) => c.pdbId === SEALED.selected.pdbId);
    if (chosen.smallMoleculeLigandInWindow == null) {
      assert.equal(SEALED.selected.pocketDefinedFromPeptideContext, true);
      assert.match(SEALED.selected.mandatoryLimitation, /POCKET_DEFINED_FROM_PEPTIDE_CONTEXT/);
    }
  });

  test('a NO_STRUCTURE_SELECTED verdict is not followed by a GLP-1R target in the registry anyway', () => {
    if (SEALED.outcome === 'NO_STRUCTURE_SELECTED') {
      const glp1rTargets = listDockingTargets().map((t) => t.targetId ?? t.id ?? String(t)).filter((k) => /GLP1R|GLP-1R/i.test(k));
      assert.deepEqual(glp1rTargets, [], `D-154 selected no structure, yet the registry carries ${glp1rTargets.join(', ')}`);
    }
  });

  test('the default docking target was not touched', () => {
    assert.equal(DEFAULT_DOCKING_TARGET, 'ABL1_1IEP');
    assert.match(SEALED.defaultDockingTarget, /ABL1_1IEP/);
  });

  test('the seal states what a selection would not license', () => {
    const text = SEALED.whatThisDoesNotLicense.join(' ');
    assert.match(text, /Docking is not agonism/);
    assert.match(text, /Binding is not functional agonism/);
  });
});
