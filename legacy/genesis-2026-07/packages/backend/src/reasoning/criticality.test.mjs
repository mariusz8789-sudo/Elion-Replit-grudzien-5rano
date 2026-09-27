import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReviewSchema, submitReview, upsertReviewerProfile } from '../edgeReview.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { signedPaths, netInfluence } from '@genesis-os/reasoning/inference';
import { ensureReasoningSchema, seedGraphSnapshot, edgeKeyOf } from './store.mjs';
import { edgeCriticality, criticalReviewWorklist, classifyChange, IMPACTS } from './criticality.mjs';

/**
 * Edge criticality — which claim, if wrong, changes the answer?
 *
 * The counterfactual is exact rather than estimated, so it can be checked
 * against the engine it describes. Several tests below do exactly that: they
 * take an edge the analysis calls load-bearing, and verify independently — via
 * `signedPaths` — that every path supporting the affected conclusion really
 * does traverse it.
 *
 * The other half of the tests are about honesty. This module's output is
 * persuasive-looking, and the thing it must never be mistaken for is a claim
 * about which biology matters.
 */

let db;
let actor;

beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  ensureReviewSchema(db);
  actor = createUser(db, { email: 'a@lab.org', displayName: 'Dr A', passwordHash: 'x' }).id;
  seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: GRAPH_EDGES, now: 1 });
});

describe('classifying a change of verdict', () => {
  test('an unchanged verdict is not a change', () => {
    assert.equal(classifyChange('promotes', 'promotes'), null);
    assert.equal(classifyChange('conflicting', 'conflicting'), null);
  });

  test('losing every path is a severance', () => {
    assert.equal(classifyChange('promotes', 'no-known-path'), 'severance');
    assert.equal(classifyChange('conflicting', 'no-known-path'), 'severance');
  });

  test('a flipped sign is a reversal — the worst case', () => {
    assert.equal(classifyChange('promotes', 'counteracts'), 'reversal');
    assert.equal(classifyChange('counteracts', 'promotes'), 'reversal');
  });

  test('a conflict appearing or disappearing is classified apart from a reversal', () => {
    assert.equal(classifyChange('conflicting', 'promotes'), 'conflict-resolved');
    assert.equal(classifyChange('promotes', 'conflicting'), 'conflict-created');
    assert.ok(IMPACTS.includes('conflict-created'));
  });

  test('an impossible transition throws rather than returning a plausible label', () => {
    // Removing an edge cannot create a path. A wrong label here would hide a
    // bug behind a real-looking finding, which is the worst way to fail.
    assert.throws(() => classifyChange('no-known-path', 'promotes'), /cannot create a path/);
  });
});

describe('the analysis over the real curated graph', () => {
  test('every curated edge is accounted for, load-bearing or not', () => {
    const a = edgeCriticality(db, { limit: 10000 });
    assert.equal(a.edgesAnalysed, GRAPH_EDGES.length);
    assert.equal(a.loadBearing + a.inert, a.edgesAnalysed);
    assert.ok(a.pairsAnalysed > 0);
  });

  test('some edges carry conclusions and some carry none', () => {
    // Both halves matter. If everything were load-bearing the measure would be
    // useless; if nothing were, the graph would be disconnected.
    const a = edgeCriticality(db);
    assert.ok(a.loadBearing > 0, 'a connected graph must have load-bearing edges');
    assert.ok(a.inert > 0);
  });

  test('the ranking is by structural consequence, highest first', () => {
    const a = edgeCriticality(db, { limit: 10000 });
    for (let i = 1; i < a.edges.length; i += 1) {
      assert.ok(a.edges[i - 1].score >= a.edges[i].score, 'scores must be non-increasing');
    }
    assert.ok(a.edges[0].dependentCount > 0);
  });

  test('the counterfactual is verifiable against the engine it describes', () => {
    // Independent check. For every severance the analysis reports, confirm via
    // signedPaths that EVERY supporting path really does traverse that edge —
    // if one did not, the conclusion would survive its removal.
    const a = edgeCriticality(db, { limit: 10000 });
    const withSeverance = a.edges.find((e) => e.dependents.some((d) => d.impact === 'severance'));
    assert.ok(withSeverance, 'the curated graph should contain at least one severing edge');

    const dependent = withSeverance.dependents.find((d) => d.impact === 'severance');
    const paths = signedPaths(dependent.from, dependent.to, 4);
    assert.ok(paths.length > 0, 'the conclusion exists before removal');
    assert.ok(
      paths.every((p) => p.edges.some((e) => edgeKeyOf(e) === withSeverance.edgeKey)),
      'a severing edge must appear on every path supporting the conclusion',
    );
    assert.notEqual(netInfluence(dependent.from, dependent.to).verdict, 'no-known-path');
  });

  test('an inert edge appears on no path that decides anything', () => {
    const a = edgeCriticality(db, { limit: 10000 });
    const inert = a.edges.filter((e) => e.score === 0);
    assert.ok(inert.length > 0);
    assert.ok(inert.every((e) => e.dependentCount === 0));
  });

  test('every dependent names the conclusion it would change, in readable terms', () => {
    const a = edgeCriticality(db);
    const dependent = a.edges[0].dependents[0];
    assert.ok(dependent.fromLabel && dependent.toLabel);
    assert.notEqual(dependent.fromLabel, dependent.from, 'labels, not ids, for a human reader');
    assert.ok(IMPACTS.includes(dependent.impact));
  });

  test('refuses to run without a seeded graph', () => {
    const bare = openDatabase(':memory:');
    ensureReasoningSchema(bare);
    assert.throws(() => edgeCriticality(bare), /Seed the curated graph/);
  });
});

describe('what the report refuses to claim', () => {
  test('it says it measures structure, not scientific importance', () => {
    // The output looks authoritative. The one reading it must never take it as
    // a statement about which biology matters.
    const s = edgeCriticality(db).statement;
    assert.match(s, /STRUCTURAL DEPENDENCE, not scientific importance/);
    assert.match(s, /not a claim that it is doubtful/);
  });

  test('it warns that an inert edge is not a safe edge', () => {
    const s = edgeCriticality(db).statement;
    assert.match(s, /may simply connect nothing yet/);
    assert.match(s, /a fact about the graph, not about the biology/);
  });

  test('the worklist warns that an empty result may mean a sparse graph', () => {
    // "Nothing needs reviewing" and "nothing is connected" look identical from
    // the outside, and only one of them is good news.
    const empty = openDatabase(':memory:');
    ensureReasoningSchema(empty);
    ensureReviewSchema(empty);
    seedGraphSnapshot(empty, { nodes: GRAPH_NODES, edges: [GRAPH_EDGES[0]], now: 1 });
    const w = criticalReviewWorklist(empty);
    if (w.total === 0) {
      assert.match(w.statement, /too sparse/);
      assert.match(w.statement, /before reading this as good news/);
    }
  });
});

describe('the worklist an expert would actually accept', () => {
  const profile = () => upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });

  test('it is shorter than the graph, and says how much it covers', () => {
    // The whole point: "review 66 edges" is refused, "review 10" is not.
    const w = criticalReviewWorklist(db, { limit: 10 });
    assert.ok(w.worklist.length <= 10);
    assert.ok(w.total < GRAPH_EDGES.length, 'fewer edges need review than exist');
    assert.match(w.statement, /% of the total structural dependence/);
  });

  test('every entry says what breaks if the claim is wrong', () => {
    const w = criticalReviewWorklist(db, { limit: 5 });
    for (const e of w.worklist) {
      assert.match(e.why, /^If this claim is wrong:/);
      assert.ok(e.why.length > 60);
    }
  });

  test('a confirmed edge leaves the list', () => {
    // An expert's scarce time should not go to re-confirming what another
    // expert already confirmed at this exact version.
    profile();
    const target = criticalReviewWorklist(db, { limit: 1 }).worklist[0];
    assert.equal(submitReview(db, { edgeKey: target.edgeKey, reviewerId: actor, verdict: 'confirm', now: 10 }).ok, true);

    const after = criticalReviewWorklist(db, { limit: 50 });
    assert.ok(!after.worklist.some((e) => e.edgeKey === target.edgeKey));
    assert.equal(after.total, criticalReviewWorklist(db, { limit: 50 }).total);
  });

  test('a disputed load-bearing edge is promoted, not dropped', () => {
    // The most urgent thing in the graph: Genesis is publishing conclusions
    // that a named expert has already objected to.
    profile();
    const list = criticalReviewWorklist(db, { limit: 50 }).worklist;
    const lower = list[list.length - 1];
    submitReview(db, {
      edgeKey: lower.edgeKey, reviewerId: actor, verdict: 'dispute',
      comment: 'This mechanism does not hold in primary human cells.', now: 10,
    });

    const after = criticalReviewWorklist(db, { limit: 50 }).worklist;
    const moved = after.find((e) => e.edgeKey === lower.edgeKey);
    assert.ok(moved, 'a disputed edge stays on the list');
    assert.equal(moved.reviewStatus, 'disputed');
    assert.equal(moved.urgency, moved.score * 2);
    assert.match(moved.why, /already disputed it, and Genesis is still reasoning through it/);
    assert.ok(after.indexOf(moved) < list.indexOf(lower), 'and it moves up');
  });

  test('criticality does not change when a review is filed', () => {
    // An edge's structural importance is a property of the graph; who has
    // looked at it is a property of the ledger. Mixing them would make a
    // reviewed edge look less important than it is.
    profile();
    const before = edgeCriticality(db, { limit: 10000 });
    submitReview(db, { edgeKey: before.edges[0].edgeKey, reviewerId: actor, verdict: 'confirm', now: 10 });
    const after = edgeCriticality(db, { limit: 10000 });
    assert.equal(after.edges[0].score, before.edges[0].score);
    assert.equal(after.loadBearing, before.loadBearing);
    assert.equal(after.edges[0].reviewStatus, 'confirmed', 'the status is reported, just not scored');
  });
});

describe('cost', () => {
  test('the whole graph is analysed in one pass, fast enough to serve on request', () => {
    // Paths are computed once per node pair and re-judged per edge, rather than
    // re-walked per (pair, edge). If this ever becomes slow it is the signal
    // that the graph has outgrown the approach — not a guess made in advance.
    const started = process.hrtime.bigint();
    edgeCriticality(db, { limit: 10000 });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 2000, `analysis took ${ms.toFixed(0)}ms`);
  });
});
