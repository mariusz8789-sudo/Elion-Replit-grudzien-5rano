import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadKnowledgeSources } from '../knowledgeSources.mjs';

/**
 * D-155 — GLP-1R pathway and expression as external published evidence.
 *
 * Guards the three things that make this file honest: it never calls itself a Genesis result,
 * every claim carries its label (SOURCE_FACT / INFERENCE_BY_GENESIS / NOT_IN_FETCHED_SOURCES),
 * and a step the fetched sources do not contain is reported missing rather than filled in.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'glp1r-d155-pathway-expression.external-evidence.json';
const EV = JSON.parse(fs.readFileSync(path.join(HERE, NAME), 'utf8'));
const LABELS = new Set(['SOURCE_FACT', 'SOURCE_FACT_THAT_CUTS_THE_OTHER_WAY', 'INFERENCE_BY_GENESIS', 'NOT_IN_FETCHED_SOURCES']);

describe('D-155 external published evidence', () => {
  test('it says, in data, that it is not a Genesis result', () => {
    assert.equal(EV.kind, 'EXTERNAL_PUBLISHED_EVIDENCE');
    assert.equal(EV.epistemicStatus, 'EXTERNAL_PUBLISHED');
    assert.equal(EV.isGenesisResult, false);
    assert.match(EV.statement, /Genesis did not measure, model or compute any of it/);
  });

  test('every claim carries one of the allowed provenance labels', () => {
    const items = [
      ...EV.pathway.sourceFacts, ...EV.pathway.inferences, ...EV.pathway.notInFetchedSources,
      ...EV.expression.sourceFacts, ...EV.expression.inferences, ...EV.expression.notInFetchedSources,
    ];
    assert.ok(items.length >= 6);
    for (const it of items) assert.ok(LABELS.has(it.label), `unlabelled or unknown label: ${it.label}`);
  });

  test('every inference says it is not evidence', () => {
    for (const inf of [...EV.pathway.inferences, ...EV.expression.inferences]) {
      assert.equal(inf.label, 'INFERENCE_BY_GENESIS');
      assert.match(inf.isNotEvidence, /not/i);
    }
  });

  test('the receptor-to-Gs step is a source fact with its Reactome id, version and citation', () => {
    const fact = EV.pathway.sourceFacts[0];
    assert.equal(fact.label, 'SOURCE_FACT');
    assert.match(fact.source, /R-HSA-381706/);
    assert.ok(fact.verbatim && fact.verbatim.length > 40);
    assert.ok(fact.citations.some((c) => c.pubMedId));
  });

  test('the cAMP step is claimed only because fetched records state it', () => {
    const camp = EV.pathway.sourceFacts.find((f) => f.label === 'SOURCE_FACT' && /cyclic AMP/.test(f.claim));
    if (!camp) {
      // The earlier state of this decision: the downstream reactions had not been fetched, so the
      // step was declared missing. Either state is honest; what is forbidden is claiming the step
      // without a record behind it.
      const gap = EV.pathway.notInFetchedSources.find((x) => /cAMP/.test(x.missingStep ?? ''));
      assert.ok(gap, 'with no source for the cAMP step it must be named as missing');
      assert.equal(gap.label, 'NOT_IN_FETCHED_SOURCES');
      return;
    }
    const ids = new Set(EV.pathway.records.map((r) => r.stId));
    for (const stId of ['R-HSA-422320', 'R-HSA-381704', 'R-HSA-381607']) {
      assert.ok(ids.has(stId), `${stId} must be among the records this file read`);
    }
    assert.ok(EV.pathway.chain.complete, 'the chain must be marked complete');
    assert.equal(EV.pathway.chain.links.length, EV.pathway.chain.ids.length - 1);
    for (const link of EV.pathway.chain.links) {
      assert.match(link.establishedBy, /precedingEvent field of R-HSA-/);
    }
    assert.ok(camp.verbatim.some((v) => /cyclic AMP \(cAMP\)/.test(v.text ?? '')), 'the claim must carry the source wording');
    assert.ok(!EV.pathway.notInFetchedSources.some((x) => /cAMP/.test(x.missingStep ?? '')), 'the gap must not also be reported as open');
  });

  test('the completed chain never travels without Reactome\'s own caveats', () => {
    if (!EV.pathway.sourceFacts.some((f) => /cyclic AMP/.test(f.claim ?? ''))) return;
    const cuts = EV.pathway.sourceFacts.find((f) => f.label === 'SOURCE_FACT_THAT_CUTS_THE_OTHER_WAY');
    assert.ok(cuts, 'the counterweight must be present once the chain is claimed complete');
    assert.match(cuts.claim, /not observed to significantly dissociate/);
    assert.match(cuts.claim, /rat beta cells/);
  });

  test('the RNA numbers never travel without HPA\'s own antibody result', () => {
    const cuts = EV.expression.sourceFacts.find((f) => f.label === 'SOURCE_FACT_THAT_CUTS_THE_OTHER_WAY');
    assert.ok(cuts, 'the protein-level counterweight must be present');
    assert.match(cuts.claim, /antibody staining/);
    assert.ok(EV.expression.sourceFacts.filter((f) => f.label === 'SOURCE_FACT').every((f) => /RNA/.test(f.level)));
  });

  test('every source file was hash-verified', () => {
    assert.equal(EV.sourceData.allHashesMatched, true);
    for (const f of EV.sourceData.files) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  });

  test('the knowledge loop files it as EXTERNAL_PUBLISHED, not as a Genesis simulation', () => {
    const docs = loadKnowledgeSources();
    const doc = docs.find((d) => d.docId === `external:${NAME}`);
    assert.ok(doc, 'the external evidence must be recallable');
    assert.equal(doc.epistemicStatus, 'EXTERNAL_PUBLISHED');
    assert.ok(!docs.some((d) => d.docId === `sealed:${NAME}`), 'it must never also appear as a sealed SIMULATED artefact');
  });
});
