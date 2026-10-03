import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { DEFAULT_DOCKING_TARGET } from '../compute/dockingTargets.mjs';

/**
 * D-156 — guard on the wider-set structure selection. It must have run D-154's rule file, byte
 * for byte, on exactly the four frozen candidates; and a winner with no small-molecule ligand
 * must carry the limitation that stops it being used to rank small molecules.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (n) => JSON.parse(fs.readFileSync(path.join(HERE, n), 'utf8'));
const SEALED = read('glp1r-d156-structure-selection-wider-set.sealed.json');
const PREREG = read('glp1r-d156-structure-selection-wider-set-prereg.json');
const D154 = read('glp1r-d154-structure-selection.sealed.json');
const RULE_SHA = createHash('sha256').update(fs.readFileSync(path.join(HERE, 'glp1r-d154-structure-selection-prereg.json'))).digest('hex');

describe('D-156 sealed wider-set structure selection', () => {
  test('it ran D-154\'s rule file unchanged, byte for byte', () => {
    assert.equal(PREREG.theRule.ruleFileSha256, RULE_SHA, 'the D-154 rule file has changed since D-156 froze it');
    assert.equal(SEALED.ruleFrom.sha256, RULE_SHA);
    assert.equal(SEALED.frozenRule.maxResolutionAngstrom, 4.0);
  });

  test('it assessed exactly the four frozen candidates and no other', () => {
    assert.deepEqual(SEALED.candidates.map((c) => c.pdbId).sort(), [...PREREG.candidateSet.frozenList].sort());
    assert.equal(SEALED.candidates.length, 4);
  });

  test('D-154\'s verdict is untouched by this decision', () => {
    assert.equal(D154.outcome, 'NO_STRUCTURE_SELECTED');
    assert.deepEqual(D154.candidates.map((c) => c.pdbId).sort(), ['7C2E', '7S15']);
  });

  test('the outcome follows from the eligibility verdicts', () => {
    const eligible = SEALED.candidates.filter((c) => c.eligibility.eligible);
    for (const c of SEALED.candidates) assert.equal(c.eligibility.eligible, c.eligibility.checks.every((x) => x.ok));
    if (eligible.length === 0) assert.equal(SEALED.outcome, 'NO_STRUCTURE_SELECTED');
    else {
      assert.equal(SEALED.outcome, 'STRUCTURE_SELECTED');
      assert.ok(eligible.some((c) => c.pdbId === SEALED.selected.pdbId));
    }
  });

  test('a winner with no small-molecule ligand carries POCKET_DEFINED_FROM_PEPTIDE_CONTEXT', () => {
    if (SEALED.outcome !== 'STRUCTURE_SELECTED') return;
    const chosen = SEALED.candidates.find((c) => c.pdbId === SEALED.selected.pdbId);
    if (chosen.smallMoleculeLigandInWindow == null) {
      assert.equal(SEALED.selected.pocketDefinedFromPeptideContext, true);
      assert.match(SEALED.selected.mandatoryLimitation, /POCKET_DEFINED_FROM_PEPTIDE_CONTEXT/);
      assert.match(SEALED.selected.mandatoryLimitation, /may not be used to rank small molecules/);
    }
  });

  test('every file the run read was hash-verified against the fetch manifest', () => {
    assert.equal(SEALED.sourceData.allHashesMatched, true);
    for (const f of SEALED.sourceData.files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.match(f.sourceUrl, /^https:\/\/(files|data)\.rcsb\.org\//);
    }
  });

  test('the default docking target was not touched', () => {
    assert.equal(DEFAULT_DOCKING_TARGET, 'ABL1_1IEP');
  });
});
