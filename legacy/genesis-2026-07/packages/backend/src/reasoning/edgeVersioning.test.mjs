import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReviewSchema, submitReview, edgeStatus, edgesPassingStandard, reviewWorklist } from '../edgeReview.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { ensureReasoningSchema, seedGraphSnapshot, edgeKeyOf, edgeContentHash } from './store.mjs';

/**
 * Phase 1a — a verdict speaks only for the version it reviewed.
 *
 * Phase 0 persisted the graph as content-addressed snapshots and claimed this
 * property. It did not have it: reviews pointed at a bare edge key, so a
 * re-curated edge inherited every verdict filed against its predecessor.
 *
 * Both directions of that drift are attacks, and both are tested here:
 *
 *   INHERITED CONFIRMATION — flip an effect from promotes to counteracts and
 *   three expert confirmations transfer onto the reversed claim. The ledger
 *   would report an expert-confirmed edge that no expert confirmed.
 *
 *   DODGED DISPUTE — file a dispute, then edit a comma. If the stale dispute
 *   simply vanished, any objection could be outrun by a trivial edit and the
 *   edge would read as pristine.
 *
 * The fixture uses the REAL curated graph, because the failure being prevented
 * is about real edges and a synthetic one would not prove the wiring holds.
 */

const TARGET = GRAPH_EDGES[0];
const KEY = edgeKeyOf(TARGET);

let db;
let alice;
let bob;
let carol;

const seed = (edges = GRAPH_EDGES, now = 1000) =>
  seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges, now });

/** The same graph with one edge's effect reversed — a substantive change. */
const withFlippedEffect = () => [
  { ...TARGET, effect: TARGET.effect === 'promotes' ? 'counteracts' : 'promotes' },
  ...GRAPH_EDGES.slice(1),
];

/** The same graph with one edge's prose lightly edited — a trivial change. */
const withEditedProse = () => [
  { ...TARGET, mechanism: `${TARGET.mechanism} (wording revised)` },
  ...GRAPH_EDGES.slice(1),
];

beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  ensureReviewSchema(db);
  const mk = (email) => createUser(db, { email, displayName: email.split('@')[0], passwordHash: 'x' }).id;
  alice = mk('alice@lab.org'); bob = mk('bob@lab.org'); carol = mk('carol@lab.org');
});

describe('the content hash', () => {
  test('changes when the sign changes', () => {
    const flipped = { ...TARGET, effect: TARGET.effect === 'promotes' ? 'counteracts' : 'promotes' };
    assert.notEqual(edgeContentHash(TARGET), edgeContentHash(flipped));
  });

  test('changes when the mechanism prose changes', () => {
    // Deliberate: the system is not competent to decide that a re-worded
    // mechanism describes the same claim, and guessing permissively is how a
    // confirmation ends up attached to a sentence nobody read.
    assert.notEqual(edgeContentHash(TARGET), edgeContentHash({ ...TARGET, mechanism: `${TARGET.mechanism} ` }));
  });

  test('is stable across object identity and key order', () => {
    const copy = { mechanism: TARGET.mechanism, honesty: TARGET.honesty, effect: TARGET.effect, kind: TARGET.kind, to: TARGET.to, from: TARGET.from };
    assert.equal(edgeContentHash(TARGET), edgeContentHash(copy));
  });

  test('reads a stored row as well as a curated edge', () => {
    // Rows carry from_id/to_id; the same claim must hash the same either way,
    // or every stored review would look stale the moment it round-tripped.
    seed();
    const row = db.prepare('SELECT * FROM reasoning_edges WHERE edge_key = ?').get(KEY);
    assert.equal(row.content_hash, edgeContentHash(TARGET));
    assert.equal(edgeContentHash(row), edgeContentHash(TARGET));
  });
});

describe('inherited confirmation — the failure Phase 0 shipped', () => {
  beforeEach(() => {
    seed();
    for (const reviewer of [alice, bob, carol]) {
      const r = submitReview(db, { edgeKey: KEY, reviewerId: reviewer, verdict: 'confirm', now: 10 });
      assert.equal(r.ok, true);
    }
  });

  test('three confirmations make the edge confirmed', () => {
    const s = edgeStatus(db, KEY);
    assert.equal(s.status, 'confirmed');
    assert.equal(s.confirms, 3);
    assert.equal(s.versionTracked, true);
  });

  test('reversing the effect does NOT carry the confirmations across', () => {
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withFlippedEffect(), now: 2000 });
    const s = edgeStatus(db, KEY);
    assert.equal(s.confirms, 0, 'no expert confirmed the reversed claim');
    assert.equal(s.status, 're-review-needed');
    assert.equal(s.supersededReviews, 3);
    assert.match(s.basis, /changed since it was last reviewed/);
  });

  test('the earlier verdicts are kept, not deleted', () => {
    // An expert's judgement about the previous version is a fact about the
    // record. Deleting it would erase the evidence that the claim changed.
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withFlippedEffect(), now: 2000 });
    const s = edgeStatus(db, KEY);
    assert.equal(s.priorVersionReviewers.length, 3);
    assert.ok(s.priorVersionReviewers.every((r) => r.verdict === 'confirm'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM edge_reviews').get().n, 3);
  });

  test('a re-affirmation after the change counts again', () => {
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withFlippedEffect(), now: 2000 });
    submitReview(db, { edgeKey: KEY, reviewerId: alice, verdict: 'confirm', now: 3000 });
    const s = edgeStatus(db, KEY);
    assert.equal(s.status, 'confirmed');
    assert.equal(s.confirms, 1, 'only the expert who looked at the new version');
  });

  test('even a trivial re-wording resets the count', () => {
    // The conservative choice, taken knowingly: the cost is a cheap
    // re-affirmation, the alternative is judging which prose changes matter.
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withEditedProse(), now: 2000 });
    assert.equal(edgeStatus(db, KEY).confirms, 0);
  });

  test('an unrelated edge changing leaves this one alone', () => {
    const otherEdited = [GRAPH_EDGES[0], { ...GRAPH_EDGES[1], mechanism: 'unrelated revision' }, ...GRAPH_EDGES.slice(2)];
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: otherEdited, now: 2000 });
    const s = edgeStatus(db, KEY);
    assert.equal(s.status, 'confirmed');
    assert.equal(s.confirms, 3);
    assert.equal(s.supersededReviews, 0);
  });
});

describe('dodged dispute — the mirror-image attack', () => {
  beforeEach(() => {
    seed();
    submitReview(db, {
      edgeKey: KEY, reviewerId: alice, verdict: 'dispute',
      comment: 'The cited mechanism does not hold in primary human cells.', now: 10,
    });
  });

  test('the dispute stands while the claim is unchanged', () => {
    assert.equal(edgeStatus(db, KEY).status, 'disputed');
  });

  test('editing the wording does not make the edge look pristine', () => {
    // If a stale dispute simply vanished, any objection could be outrun by
    // editing a comma.
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withEditedProse(), now: 2000 });
    const s = edgeStatus(db, KEY);
    assert.notEqual(s.status, 'unreviewed');
    assert.equal(s.status, 're-review-needed');
    assert.equal(s.supersededDisputes, 1);
    assert.match(s.basis, /disputed an EARLIER version/);
    assert.match(s.basis, /not revisited it since it changed/);
  });

  test('a fresh confirmation still surfaces the unanswered objection', () => {
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withEditedProse(), now: 2000 });
    submitReview(db, { edgeKey: KEY, reviewerId: bob, verdict: 'confirm', now: 3000 });
    const s = edgeStatus(db, KEY);
    assert.equal(s.status, 'confirmed');
    assert.equal(s.supersededDisputes, 1);
    assert.match(s.basis, /disputed an EARLIER version/, 'a reader must see the objection that was never answered');
  });

  test("an edge with a dodged dispute does not pass the 'not-disputed' standard", () => {
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withEditedProse(), now: 2000 });
    assert.deepEqual(edgesPassingStandard(db, [KEY], 'not-disputed'), []);
  });
});

describe('standards and worklists respect versions', () => {
  test("a re-review-needed edge does not count as 'reviewed'", () => {
    seed();
    submitReview(db, { edgeKey: KEY, reviewerId: alice, verdict: 'confirm', now: 10 });
    assert.deepEqual(edgesPassingStandard(db, [KEY], 'reviewed'), [KEY]);
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withFlippedEffect(), now: 2000 });
    assert.deepEqual(edgesPassingStandard(db, [KEY], 'reviewed'), []);
    assert.deepEqual(edgesPassingStandard(db, [KEY], 'expert-confirmed'), []);
  });

  test('a changed edge returns to the top of a reviewer worklist', () => {
    seed();
    submitReview(db, { edgeKey: KEY, reviewerId: alice, verdict: 'confirm', now: 10 });
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: withFlippedEffect(), now: 2000 });
    // The property that matters is priority, not position: a claim that changed
    // under its reviewers is worth an expert's time as much as one nobody has
    // seen, so it must not sink below a confirmed edge.
    const confirmedKey = edgeKeyOf(GRAPH_EDGES[2]);
    submitReview(db, { edgeKey: confirmedKey, reviewerId: carol, verdict: 'confirm', now: 3000 });

    const list = reviewWorklist(db, [confirmedKey, KEY, edgeKeyOf(GRAPH_EDGES[1])], { reviewerId: bob, limit: 10 });
    const rank = (key) => list.findIndex((s) => s.edgeKey === key);
    assert.ok(rank(KEY) >= 0, 'the changed edge must be offered for review again');
    assert.equal(list.find((s) => s.edgeKey === KEY).status, 're-review-needed');
    assert.ok(rank(KEY) < rank(confirmedKey), 'a changed claim outranks a currently-confirmed one');
  });
});

describe('when the graph is not available', () => {
  test('the ledger still works and says versions are not tracked', () => {
    // The review instrument must run standalone — a reviewer needs no graph
    // tables to file a verdict. What it must NOT do is imply the verdict is
    // pinned to a version when nothing recorded one.
    const bare = openDatabase(':memory:');
    ensureReviewSchema(bare);
    const u = createUser(bare, { email: 'z@lab.org', displayName: 'Z', passwordHash: 'x' }).id;
    submitReview(bare, { edgeKey: KEY, reviewerId: u, verdict: 'confirm', now: 1 });
    const s = edgeStatus(bare, KEY);
    assert.equal(s.versionTracked, false);
    assert.equal(s.contentHash, null);
    assert.equal(s.status, 'confirmed');
  });

  test('a review filed before the graph existed is not credited to the current version', () => {
    // Fail closed. The reviewer's NULL hash records the truth: nobody knows
    // which text they read, so it cannot speak for the text there is now.
    ensureReviewSchema(db);
    submitReview(db, { edgeKey: KEY, reviewerId: alice, verdict: 'confirm', now: 1 });
    assert.equal(edgeStatus(db, KEY).versionTracked, false);

    seed();
    const s = edgeStatus(db, KEY);
    assert.equal(s.versionTracked, true);
    assert.equal(s.confirms, 0, 'an unversioned verdict must not be credited to a known version');
    assert.equal(s.status, 're-review-needed');
    assert.equal(s.priorVersionReviewers[0].reviewedVersion, 'unrecorded');
  });
});
