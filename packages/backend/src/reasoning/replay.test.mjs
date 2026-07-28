import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReviewSchema, submitReview, upsertReviewerProfile } from '../edgeReview.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { ensureReasoningSchema, seedGraphSnapshot, recordEvidence, edgeKeyOf } from './store.mjs';
import { runAndRecord } from './discoveryEngine.mjs';
import { diffArtifacts, replayArtifact, answerHistory } from './replay.mjs';

/**
 * Phase 6 — replay and diff.
 *
 * The distinction these tests exist to protect:
 *
 *   same inputs, different answer  → GENESIS changed
 *   different inputs               → THE WORLD changed
 *
 * Conflating them would let a silent engine regression read as scientific
 * progress, which is the most damaging failure this feature could have.
 */

const QUESTION = 'Can cellular senescence be reversed without increasing cancer risk?';

let db;
let actor;
let P;

beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  ensureReviewSchema(db);
  actor = createUser(db, { email: 'a@lab.org', displayName: 'A', passwordHash: 'x' }).id;
  P = `user:${actor}`;
  seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: GRAPH_EDGES, now: 1 });
});

const answer = (now, question = QUESTION) => runAndRecord(db, { projectId: P, question, createdBy: actor, now });

const addEvidence = (citation, now) => recordEvidence(db, {
  projectId: P, citation, tier: 'rodent', outcome: 'lifespan', direction: 'increase',
  intervention: 'senolytics', hallmark: 'cellular-senescence',
  strength: 0.6, humanRelevance: 0.2, createdBy: actor, now,
});

describe('classifying what changed', () => {
  test('nothing changed is stated as reproducibility, not as a null result', () => {
    const a = answer(100);
    const b = answer(200);
    const d = diffArtifacts(db, P, a.id, b.id);
    assert.equal(d.kind, 'unchanged');
    assert.match(d.interpretation, /what reproducibility looks like/);
  });

  test('new evidence is classified as the world changing', () => {
    const a = answer(100);
    addEvidence('doi:10.1000/new-study', 150);
    const b = answer(200);
    const d = diffArtifacts(db, P, a.id, b.id);
    assert.equal(d.kind, 'inputs-changed');
    assert.equal(d.evidence.added, 1);
    assert.match(d.interpretation, /allowed to differ/);
  });

  test('a re-curated graph is flagged explicitly', () => {
    const a = answer(100);
    seedGraphSnapshot(db, {
      nodes: GRAPH_NODES,
      edges: [{ ...GRAPH_EDGES[0], mechanism: `${GRAPH_EDGES[0].mechanism} (revised)` }, ...GRAPH_EDGES.slice(1)],
      now: 150,
    });
    const b = answer(200);
    const d = diffArtifacts(db, P, a.id, b.id);
    assert.equal(d.graphRecurated, true);
    assert.equal(d.kind, 'inputs-changed');
  });

  test('same inputs with a different answer means GENESIS changed, and says so', () => {
    // Simulated by storing a body that differs while the inputs hash matches —
    // exactly the signature of an engine change. This is the case that must
    // never read as scientific progress.
    const a = answer(100);
    const forged = db.prepare('SELECT * FROM reasoning_artifacts WHERE id = ?').get(a.id);
    db.prepare('INSERT INTO reasoning_artifacts (id, project_id, kind, question, snapshot_id, inputs_hash, body, provenance, uncertainty, refusals, review_status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run('forged-1', P, 'discovery', QUESTION, forged.snapshot_id, forged.inputs_hash,
        JSON.stringify({ ...a.body, hypotheses: [] }), forged.provenance, forged.uncertainty, forged.refusals,
        'unreviewed', 300, actor);

    const d = diffArtifacts(db, P, a.id, 'forged-1');
    assert.equal(d.kind, 'reasoning-changed');
    assert.match(d.interpretation, /change in Genesis itself/);
    assert.match(d.interpretation, /must be explained before the newer answer is trusted/);
  });
});

describe('what the diff reports', () => {
  test('hypotheses added and removed are listed, not counted', () => {
    const a = answer(100);
    addEvidence('doi:10.1000/x', 150);
    const b = answer(200);
    const d = diffArtifacts(db, P, a.id, b.id);
    assert.ok(Array.isArray(d.hypotheses.added));
    assert.ok(Array.isArray(d.hypotheses.removed));
    assert.equal(typeof d.hypotheses.unchanged, 'number');
  });

  test('a refusal that disappeared is surfaced with a warning', () => {
    // The most interesting line in any diff: Genesis previously declined to say
    // something and now will. It must not slide past unremarked.
    upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });
    const a = answer(100);
    assert.ok(a.refusals.some((x) => /No edge in this answer carries a current expert confirmation/.test(x)));

    submitReview(db, { edgeKey: edgeKeyOf(GRAPH_EDGES[0]), reviewerId: actor, verdict: 'confirm', now: 150 });
    const b = answer(200);
    const d = diffArtifacts(db, P, a.id, b.id);

    assert.ok(d.refusals.resolved.some((x) => /expert confirmation/.test(x)));
    assert.match(d.refusals.note, /Check WHY before treating the new answer as stronger/);
  });

  test('coverage and belief are reported separately and never summed', () => {
    upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });
    const a = answer(100);
    addEvidence('doi:10.1000/y', 140);
    submitReview(db, { edgeKey: edgeKeyOf(GRAPH_EDGES[0]), reviewerId: actor, verdict: 'confirm', now: 150 });
    const b = answer(200);
    const d = diffArtifacts(db, P, a.id, b.id);

    assert.ok(d.uncertainty.coverage.delta > 0, 'a new paper was read');
    assert.ok(d.uncertainty.belief.delta > 0, 'an expert confirmed an edge');
    assert.match(d.uncertainty.note, /never summed/);
    assert.equal(d.uncertainty.total, undefined, 'there must be no combined uncertainty number');
  });

  test('review movement is carried through', () => {
    upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });
    const a = answer(100);
    submitReview(db, { edgeKey: edgeKeyOf(GRAPH_EDGES[0]), reviewerId: actor, verdict: 'confirm', now: 150 });
    const d = diffArtifacts(db, P, a.id, answer(200).id);
    assert.equal(d.review.before.confirmed, 0);
    assert.equal(d.review.after.confirmed, 1);
  });
});

describe('what the diff refuses to compare', () => {
  test('two different questions', () => {
    // A confident list of differences between unrelated answers means nothing.
    const a = answer(100);
    const b = answer(200, 'A completely different question about autophagy.');
    const d = diffArtifacts(db, P, a.id, b.id);
    assert.equal(d.ok, false);
    assert.match(d.message, /answer different questions/);
  });

  test('artifacts given in the wrong order', () => {
    const a = answer(100);
    const b = answer(200);
    assert.match(diffArtifacts(db, P, b.id, a.id).message, /newer than/);
  });

  test('an artifact from another workspace', () => {
    const a = answer(100);
    assert.equal(diffArtifacts(db, 'user:someone-else', a.id, a.id).ok, false);
  });
});

describe('replaying a stored question', () => {
  test('produces a new artifact and never touches the original', () => {
    // Rewriting the old answer would destroy the only evidence that Genesis
    // once thought something else — which is the entire point of replay.
    const original = answer(100);
    const r = replayArtifact(db, { artifactId: original.id, projectId: P, createdBy: actor, now: 500 });
    assert.equal(r.ok, true);
    assert.notEqual(r.replayed.id, original.id);
    assert.equal(r.original.created_at, 100);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reasoning_artifacts').get().n, 2);
  });

  test('replaying after new evidence shows what the evidence changed', () => {
    const original = answer(100);
    addEvidence('doi:10.1000/later', 400);
    const r = replayArtifact(db, { artifactId: original.id, projectId: P, createdBy: actor, now: 500 });
    assert.equal(r.diff.kind, 'inputs-changed');
    assert.equal(r.diff.evidence.added, 1);
  });

  test('refuses to replay an artifact from another workspace', () => {
    const original = answer(100);
    assert.equal(replayArtifact(db, { artifactId: original.id, projectId: 'user:x', createdBy: actor }).ok, false);
  });

  test('refuses to replay a non-discovery artifact', () => {
    const r = replayArtifact(db, { artifactId: 'nope', projectId: P, createdBy: actor });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'not_found');
  });
});

describe('the history of one answer', () => {
  test('reads as how the answer moved, not as a list of artifacts', () => {
    answer(100);
    addEvidence('doi:10.1000/a', 150);
    answer(200);
    addEvidence('doi:10.1000/b', 250);
    answer(300);

    const h = answerHistory(db, P, QUESTION);
    assert.equal(h.answers.length, 3);
    assert.equal(h.transitions.length, 2, 'one transition between each consecutive pair');
    assert.ok(h.answers.every((a) => Number.isFinite(a.coverage) && Number.isFinite(a.belief)));
    assert.ok(h.transitions.every((t) => t.kind));
  });

  test('a single answer has no transitions and does not pretend otherwise', () => {
    answer(100);
    const h = answerHistory(db, P, QUESTION);
    assert.equal(h.answers.length, 1);
    assert.deepEqual(h.transitions, []);
  });

  test('another workspace sees none of it', () => {
    answer(100);
    assert.equal(answerHistory(db, 'user:other', QUESTION).answers.length, 0);
  });
});
