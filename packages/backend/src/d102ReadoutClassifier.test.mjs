/**
 * D-102 — classifier tests, written against the sealed rule text, before the
 * classifier is run against real data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { readoutFamilyOf, hsaConditionOf } from '../../../scripts/d102-readout-classifier.mjs';

test('D-102: a cell-line property mention is not a readout — the D-096 bug stays fixed', () => {
  const d = 'Agonist activity at human GLP-1R expressed in CHO cells coexpressing beta-arrestin-2 assessed as reduction in cAMP accumulation incubated for 2 hrs';
  assert.equal(readoutFamilyOf(d), 'CAMP');
});

test('D-102: arrestin recruitment reads as ARRESTIN, cAMP as CAMP, calcium as CALCIUM', () => {
  assert.equal(readoutFamilyOf('Agonist activity assessed as increase in beta-arrestin-2 recruitment incubated for 1 hr'), 'ARRESTIN');
  assert.equal(readoutFamilyOf('Agonist activity assessed as cAMP accumulation incubated for 30 mins'), 'CAMP');
  assert.equal(readoutFamilyOf('Agonist activity assessed as change in intracellular calcium level by Fluo-4 AM dye'), 'CALCIUM');
});

test('D-102: internalization and binding displacement are their own families', () => {
  assert.equal(readoutFamilyOf('Agonist activity assessed as receptor internalization'), 'INTERNALIZATION');
  assert.equal(readoutFamilyOf('Displacement of [125I]-GLP1 from GLP-1 receptor expressed in CHO cells membrane'), 'BINDING');
});

test('D-102: ERK phosphorylation matches none of the five sealed families -> OTHER, not force-fit', () => {
  assert.equal(readoutFamilyOf('Agonist activity assessed as increase in ERK1/2 phosphorylation at Thr202/Tyr204 residues'), 'OTHER');
});

test('D-102: HSA condition extraction', () => {
  assert.equal(hsaConditionOf('assessed as stimulation of cAMP accumulation incubated for 20 mins in presence of 0% HSA'), '0% HSA');
  assert.equal(hsaConditionOf('assessed as stimulation of cAMP accumulation incubated for 20 mins in presence of 4.4% HSA'), '4.4% HSA');
  assert.equal(hsaConditionOf('assessed as cAMP accumulation incubated for 30 mins'), null);
});
