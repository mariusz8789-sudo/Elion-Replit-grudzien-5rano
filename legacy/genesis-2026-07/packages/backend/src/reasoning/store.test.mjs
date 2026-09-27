import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReviewSchema, submitReview } from '../edgeReview.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import {
  ensureReasoningSchema, seedGraphSnapshot, currentSnapshot, snapshotEdges, snapshotHash,
  edgeKeyOf, resolveEdgeKey, orphanReviews,
  recordEvidence, listEvidence, retireEvidence,
  recordArtifact, getArtifact, listArtifacts, replayHistory,
} from './store.mjs';

/**
 * L2 persistence for the reasoning core.
 *
 * The tests that matter here are the refusals, and one structural property: the
 * graph is content-addressed, so a review can never silently become a review of
 * a different claim.
 *
 * Note what is NOT tested here: whether the reasoning is correct. That is pinned
 * by the 88 tests in @genesis-os/reasoning, which run without a database. This
 * layer is only allowed to decide what to remember.
 */

let db;
let user;
beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  ensureReviewSchema(db);
  user = createUser(db, { email: 'reviewer@example.org', displayName: 'Fixture Reviewer', passwordHash: 'x' }).id;
});

const seed = (opts = {}) => seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: GRAPH_EDGES, now: 1000, ...opts });

describe('graph snapshots are content-addressed', () => {
  test('seeding the real curated graph stores every node and edge', () => {
    const snap = seed();
    assert.equal(snap.created, true);
    assert.equal(snap.node_count, GRAPH_NODES.length);
    assert.equal(snap.edge_count, GRAPH_EDGES.length);
    assert.equal(snapshotEdges(db, snap.id).length, GRAPH_EDGES.length);
  });

  test('re-seeding an unchanged graph writes nothing', () => {
    // Idempotence is not a convenience here. Server restarts re-seed, and a new
    // snapshot on every boot would orphan every review filed before it.
    const first = seed();
    const second = seed({ now: 9999 });
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reasoning_snapshots').get().n, 1);
  });

  test('the id is the content, not the time or the source', () => {
    const a = snapshotHash(GRAPH_NODES, GRAPH_EDGES);
    const b = snapshotHash([...GRAPH_NODES].reverse(), [...GRAPH_EDGES].reverse());
    assert.equal(a, b, 'ordering must not change identity');
    const changed = snapshotHash(GRAPH_NODES, [
      { ...GRAPH_EDGES[0], effect: GRAPH_EDGES[0].effect === 'promotes' ? 'counteracts' : 'promotes' },
      ...GRAPH_EDGES.slice(1),
    ]);
    assert.notEqual(a, changed, 'flipping a sign must produce a different graph');
  });

  test('a changed curation supersedes rather than replaces', () => {
    // The previous snapshot has to survive, or reviews filed against it become
    // judgements about a claim nobody made.
    const first = seed();
    const edited = [{ ...GRAPH_EDGES[0], mechanism: 'revised wording' }, ...GRAPH_EDGES.slice(1)];
    const second = seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: edited, now: 2000 });
    assert.notEqual(second.id, first.id);
    assert.equal(currentSnapshot(db).id, second.id);
    const old = db.prepare('SELECT * FROM reasoning_snapshots WHERE id = ?').get(first.id);
    assert.equal(old.superseded_by, second.id);
    assert.equal(snapshotEdges(db, first.id).length, GRAPH_EDGES.length, 'the old snapshot keeps its edges');
  });

  test('refuses an empty graph', () => {
    assert.throws(() => seedGraphSnapshot(db, { nodes: [], edges: [] }), /non-empty/);
  });
});

describe('edge keys resolve to real claims', () => {
  test('the key format matches the one the ledger already stores', () => {
    // If this drifts, every existing review silently detaches.
    const e = GRAPH_EDGES[0];
    assert.equal(edgeKeyOf(e), `${e.from}→${e.to}→${e.kind}`);
  });

  test('a real edge resolves and an invented one does not', () => {
    seed();
    assert.ok(resolveEdgeKey(db, edgeKeyOf(GRAPH_EDGES[0])));
    assert.equal(resolveEdgeKey(db, 'made-up→nonsense→invented'), null);
  });

  test('reports reviews whose edge no longer exists, without repairing them', () => {
    // Until the graph was persisted, edge_key was free text: a typo and a claim
    // re-curated out from under a reviewer looked identical. Both are worth
    // knowing about and neither should be silently dropped.
    seed();
    const real = submitReview(db, { edgeKey: edgeKeyOf(GRAPH_EDGES[0]), reviewerId: user, verdict: 'confirm', now: 10 });
    const ghost = submitReview(db, {
      edgeKey: 'ghost→edge→oncogenic-coupling', reviewerId: user, verdict: 'dispute',
      comment: 'This edge does not exist in the curated graph.', now: 11,
    });
    assert.equal(real.ok, true);
    assert.equal(ghost.ok, true, 'the ledger accepts any key — which is exactly why orphans must be findable');
    const orphans = orphanReviews(db);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].edge_key, 'ghost→edge→oncogenic-coupling');
    assert.equal(orphans[0].reviews, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM edge_reviews').get().n, 2, 'reporting must not delete');
  });
});

describe('evidence persists with its grading rule attached', () => {
  const record = (over = {}) => recordEvidence(db, {
    projectId: 'p-1', citation: 'doi:10.1000/fixture', tier: 'mouse-lifespan', outcome: 'lifespan',
    direction: 'increase', strength: 0.7, humanRelevance: 0.3, createdBy: user, now: 100, ...over,
  });

  test('stores both axes and the version that produced them', () => {
    const e = record();
    assert.equal(e.strength, 0.7);
    assert.equal(e.human_relevance, 0.3);
    assert.match(e.graded_with, /grading/);
    assert.match(e.provenance, /^[0-9a-f]{64}$/);
  });

  test('refuses evidence with no citation', () => {
    assert.throws(() => record({ citation: '  ' }), /Evidence without a source is an opinion/);
  });

  test('refuses a record that supplies only one axis', () => {
    // A worm study can be strong and barely transferable. One number cannot say
    // that, and accepting one number here is how the distinction gets lost.
    assert.throws(() => record({ humanRelevance: undefined }), /NOT interchangeable/);
  });

  test('is tenant-scoped on read', () => {
    record({ projectId: 'p-1' });
    record({ projectId: 'p-2' });
    assert.equal(listEvidence(db, 'p-1').length, 1);
    assert.equal(listEvidence(db, 'p-2').length, 1);
  });

  test('retraction retires, never deletes', () => {
    // A platform that erases a retracted paper loses the ability to say its own
    // past conclusions rested on it.
    const e = record();
    assert.equal(retireEvidence(db, e.id, 'p-1', { now: 200 }), true);
    assert.equal(listEvidence(db, 'p-1').length, 0);
    assert.equal(listEvidence(db, 'p-1', { includeRetired: true }).length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evidence_records').get().n, 1);
  });

  test('another tenant cannot retire your evidence', () => {
    const e = record({ projectId: 'p-1' });
    assert.equal(retireEvidence(db, e.id, 'p-2'), false);
    assert.equal(listEvidence(db, 'p-1').length, 1);
  });
});

describe('the artifact gate', () => {
  const artifact = (over = {}) => recordArtifact(db, {
    projectId: 'p-1', kind: 'cancer-safety', question: 'Can biological age be reversed without increasing cancer risk?',
    snapshotId: currentSnapshot(db).id, body: { findings: [] },
    provenance: { edgeKeys: ['a→b→c'], reviewIds: [] },
    uncertainty: { coverage: 0.2, belief: 0.5 },
    refusals: ['No human evidence exists for this intervention class.'],
    createdBy: user, now: 100, ...over,
  });

  beforeEach(() => seed());

  test('accepts a complete artifact and round-trips it', () => {
    const a = artifact();
    assert.equal(a.review_status, 'unreviewed');
    assert.deepEqual(a.uncertainty, { coverage: 0.2, belief: 0.5 });
    assert.equal(a.refusals.length, 1);
    assert.deepEqual(getArtifact(db, a.id, 'p-1').body, { findings: [] });
  });

  test('refuses an artifact with no provenance', () => {
    assert.throws(() => artifact({ provenance: {} }), /provenance is required/);
    assert.throws(() => artifact({ provenance: undefined }), /provenance is required/);
  });

  test('refuses uncertainty collapsed into one number', () => {
    // The single most common way an evidence platform starts lying.
    assert.throws(() => artifact({ uncertainty: { confidence: 0.7 } }), /BOTH coverage .* and belief/);
    assert.throws(() => artifact({ uncertainty: { coverage: 0.2 } }), /BOTH coverage/);
  });

  test('refuses a missing refusals list but accepts an empty one', () => {
    // A run that declined nothing is legitimate. A run that does not say is not.
    assert.throws(() => artifact({ refusals: undefined }), /may never be absent/);
    assert.throws(() => artifact({ refusals: 'none' }), /must be an array/);
    assert.ok(artifact({ refusals: [] }));
  });

  test('refuses an artifact that asserts its own review status', () => {
    // Review status is earned through the ledger. Allowing a writer to assert it
    // would let the platform mark its own output expert-confirmed.
    assert.throws(() => artifact({ reviewStatus: 'expert-confirmed' }), /never asserted at creation/);
    assert.throws(() => artifact({ reviewStatus: 'looks-fine' }), /must be one of/);
  });

  test('refuses an artifact that does not name the graph it reasoned over', () => {
    assert.throws(() => artifact({ snapshotId: undefined }), /must name the graph/);
  });

  test('is tenant-scoped on read', () => {
    const a = artifact({ projectId: 'p-1' });
    assert.equal(getArtifact(db, a.id, 'p-2'), null);
    assert.equal(listArtifacts(db, 'p-2').length, 0);
  });
});

describe('replay', () => {
  beforeEach(() => seed());

  test('the same question over the same inputs hashes identically', () => {
    // Excludes the clock and the author on purpose: "Genesis concluded X in
    // March" is only checkable if the key survives the calendar.
    const base = {
      projectId: 'p-1', kind: 'cancer-safety', question: 'Q', snapshotId: currentSnapshot(db).id,
      provenance: { edgeKeys: ['a→b→c'] }, uncertainty: { coverage: 0.1, belief: 0.4 }, refusals: [],
      createdBy: user,
    };
    const a = recordArtifact(db, { ...base, body: { v: 1 }, now: 100 });
    const b = recordArtifact(db, { ...base, body: { v: 2 }, now: 999, createdBy: user });
    assert.equal(a.inputs_hash, b.inputs_hash);

    const history = replayHistory(db, 'p-1', a.inputs_hash);
    assert.equal(history.length, 2);
    assert.notDeepEqual(history[0].body, history[1].body,
      'same inputs, different conclusion — either a bug or an improvement, and always worth knowing');
  });

  test('changed inputs produce a different key', () => {
    const base = {
      projectId: 'p-1', kind: 'cancer-safety', question: 'Q', snapshotId: currentSnapshot(db).id,
      uncertainty: { coverage: 0.1, belief: 0.4 }, refusals: [], body: {}, createdBy: user, now: 1,
    };
    const a = recordArtifact(db, { ...base, provenance: { edgeKeys: ['a→b→c'] } });
    const b = recordArtifact(db, { ...base, provenance: { edgeKeys: ['a→b→c', 'd→e→f'] } });
    assert.notEqual(a.inputs_hash, b.inputs_hash);
  });
});
