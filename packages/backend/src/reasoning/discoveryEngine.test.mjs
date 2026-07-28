import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReviewSchema, submitReview, upsertReviewerProfile } from '../edgeReview.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { ensureReasoningSchema, seedGraphSnapshot, recordEvidence, edgeKeyOf, getArtifact } from './store.mjs';
import { buryHypothesis } from './graveyard.mjs';
import { runDiscovery, runAndRecord, ENGINE_VERSION } from './discoveryEngine.mjs';

/**
 * Phase 5 — the Discovery Engine.
 *
 * The engine adds no science. Every stage delegates to a function already tested
 * elsewhere, so these tests are about the things only composition can get wrong:
 * the ORDER of the stages, what the engine refuses to say, and whether its
 * self-description is measured or asserted.
 *
 * The most important test in this file is the one asserting that the engine
 * never claims a therapy works.
 */

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

/**
 * Bury a hypothesis exactly the way the engine will look it up.
 *
 * A hypothesis about a single node has a subject and no object, and the
 * graveyard refuses a half-triple on purpose — so the burial falls back to the
 * statement, which is precisely what assessHypothesis does for that shape.
 */
function burialFor(h) {
  const [subject, object] = h.nodes;
  return subject && object
    ? { statement: h.statement, subject, object }
    : { statement: h.statement };
}

const ask = (over = {}) => runDiscovery(db, {
  projectId: P, question: 'Can cellular senescence be reversed without increasing cancer risk?', ...over,
});

describe('the engine will not run on nothing', () => {
  test('refuses without a seeded graph rather than answering from air', () => {
    const bare = openDatabase(':memory:');
    ensureReasoningSchema(bare);
    assert.throws(() => runDiscovery(bare, { projectId: 'user:x', question: 'anything' }), /Seed the curated graph/);
  });
});

describe('stage 1 — resolve', () => {
  test('finds the node the question names', () => {
    const r = ask();
    assert.deepEqual(r.body.focus.map((f) => f.id), ['cellular-senescence']);
  });

  test('an unmatched question is answered, and the ambiguity is declared', () => {
    // Silently answering about a node the asker did not name is worse than
    // admitting the question was not understood.
    const r = ask({ question: 'What about protein misfolding in yeast?' });
    assert.equal(r.body.focus.length, 0);
    assert.ok(r.refusals.some((x) => /No node in the curated graph matched/.test(x)));
  });

  test('an invented focus node is ignored and reported, never fabricated', () => {
    const r = ask({ focus: 'not-a-real-node' });
    assert.ok(r.refusals.some((x) => /is not a node in the curated graph/.test(x)));
  });
});

describe('stage 2 — recall runs before generation', () => {
  test('a buried hypothesis is not proposed, and the suppression is visible', () => {
    const first = ask();
    assert.ok(first.body.hypotheses.length > 0);
    const target = first.body.hypotheses[0];

    buryHypothesis(db, { projectId: P, ...burialFor(target), cause: 'refuted',
      evidenceRef: 'doi:10.1000/refutation',
      lesson: 'The effect vanished under blinded scoring.', actorId: actor, now: 10 });

    const second = ask();
    assert.ok(!second.body.hypotheses.some((h) => h.statement === target.statement), 'the buried hypothesis must not be proposed');
    assert.equal(second.body.suppressedByMemory.length, 1);
    assert.match(second.body.suppressedByMemory[0].why, /blinded scoring/);
    assert.ok(second.refusals.some((x) => /already buried them/.test(x)));
  });

  test('the suppression is auditable — a reader can disagree with it', () => {
    // Removing a hypothesis without saying which one, or why, would be the
    // engine quietly narrowing the science on the user's behalf.
    const target = ask().body.hypotheses[0];
    buryHypothesis(db, { projectId: P, ...burialFor(target), cause: 'refuted',
      evidenceRef: 'doi:10.1000/x', actorId: actor, now: 10 });
    const entry = ask().body.suppressedByMemory[0];
    assert.equal(entry.statement, target.statement);
    assert.ok(entry.why.length > 0);
  });

  test("another workspace's graveyard does not suppress anything here", () => {
    const target = ask().body.hypotheses[0];
    buryHypothesis(db, { projectId: 'user:someone-else', ...burialFor(target), cause: 'refuted',
      evidenceRef: 'doi:10.1000/x', actorId: actor, now: 10 });
    assert.equal(ask().body.suppressedByMemory.length, 0);
  });
});

describe('stage 3 — literature', () => {
  test('reports that it did not run instead of inventing citations', () => {
    const r = ask();
    assert.equal(r.body.literature.status, 'UNAVAILABLE');
    assert.deepEqual(r.body.literature.candidates, []);
    assert.ok(r.refusals.some((x) => /no corpus has been ingested/.test(x)));
    assert.ok(r.refusals.some((x) => /no citation in this artifact comes from an unread source/.test(x)));
  });
});

describe('stages 5–7 — ranking, safety, planning', () => {
  test('proposes experiments and a Pareto frontier', () => {
    const r = ask();
    assert.ok(r.body.nextExperiments.length > 0);
    assert.ok(Array.isArray(r.body.experimentFrontier));
  });

  test('declares a degenerate ranking rather than presenting it as a priority list', () => {
    // With no evidence every candidate ties. Presenting that order as a
    // recommendation would be the engine inventing a preference it does not have.
    const r = ask();
    if (r.body.degeneracy.isDegenerate) {
      assert.ok(r.refusals.some((x) => /ranking is degenerate/.test(x)));
      assert.ok(r.refusals.some((x) => /must not be read as a priority list/.test(x)));
    }
  });

  test('runs cancer safety over the interventions the answer touches', () => {
    const r = ask();
    assert.ok(r.body.cancerSafety.length > 0);
    assert.ok(r.body.cancerSafety.every((p) => p.verdict && Array.isArray(p.findings)));
  });
});

describe('the refusal that matters most', () => {
  test('the engine never says a therapy works', () => {
    // Matched on word boundaries. A naive substring check first flagged "is
    // safe" inside "apheresis safety monitoring" — a false positive that would
    // have pushed me to weaken real safety prose to satisfy a bad test.
    const text = JSON.stringify(ask());
    const forbidden = [
      /\btherapy works\b/i, /\bis safe\b/i, /\bproven to\b/i,
      /\bclinically proven\b/i, /\bwill extend (your|human) (life|lifespan)\b/i,
      /\bcures\b/i, /\bwe recommend taking\b/i, /\bshown to work\b/i,
    ];
    for (const pattern of forbidden) {
      const m = text.match(pattern);
      assert.equal(m, null, `output must not contain ${pattern}: ...${m ? text.slice(Math.max(0, m.index - 80), m.index + 60) : ''}...`);
    }
  });

  test('the guard would catch a real efficacy claim', () => {
    // A refusal test that never fires is decoration. This proves the pattern
    // set above is capable of failing.
    assert.match('This intervention is safe and clinically proven.', /\bis safe\b/i);
    assert.match('The therapy works in humans.', /\btherapy works\b/i);
  });

  test('every run produces refusals, and they are not decoration', () => {
    const r = ask();
    assert.ok(r.refusals.length >= 2);
    assert.ok(r.refusals.every((x) => typeof x === 'string' && x.length > 40),
      'a refusal must say what was declined and why');
  });

  test('uncertainty is reported on two axes with the basis for each', () => {
    const r = ask();
    assert.equal(typeof r.uncertainty.coverage, 'number');
    assert.equal(typeof r.uncertainty.belief, 'number');
    assert.notEqual(r.uncertainty.coverage, undefined);
    assert.match(r.uncertainty.basis, /Coverage from .* evidence record/);
    assert.match(r.uncertainty.basis, /belief from .* edge/);
  });
});

describe('review status is measured, not assumed', () => {
  test('with no reviews it says so, counting the edges it traversed', () => {
    const r = ask();
    assert.equal(r.provenance.review.confirmed, 0);
    assert.ok(r.provenance.review.totalEdges > 0);
    assert.ok(r.refusals.some((x) => /No edge in this answer carries a current expert confirmation/.test(x)));
    assert.equal(r.uncertainty.belief, 0);
  });

  test('a real confirmation raises belief and removes the refusal', () => {
    // The earlier draft hardcoded this to zero. That is true today and becomes a
    // lie the moment an expert files a verdict — in the direction that
    // understates the platform, which is the direction nobody checks.
    upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });
    const key = edgeKeyOf(GRAPH_EDGES[0]);
    assert.equal(submitReview(db, { edgeKey: key, reviewerId: actor, verdict: 'confirm', now: 20 }).ok, true);

    const r = ask();
    assert.equal(r.provenance.review.confirmed, 1);
    assert.ok(r.uncertainty.belief > 0);
    assert.ok(!r.refusals.some((x) => /No edge in this answer carries a current expert confirmation/.test(x)));
  });

  test('a disputed edge produces a refusal telling the reader not to act on it', () => {
    upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });
    submitReview(db, {
      edgeKey: edgeKeyOf(GRAPH_EDGES[0]), reviewerId: actor, verdict: 'dispute',
      comment: 'The cited mechanism does not hold in primary human cells.', now: 20,
    });
    const r = ask();
    assert.equal(r.provenance.review.disputed, 1);
    assert.ok(r.refusals.some((x) => /are DISPUTED by a domain expert/.test(x)));
    assert.ok(r.refusals.some((x) => /should not\s+be acted on/.test(x)));
  });
});

describe('provenance and storage', () => {
  test('provenance names the snapshot, the evidence and the engine version', () => {
    recordEvidence(db, {
      projectId: P, citation: 'doi:10.1000/x', tier: 'rodent', outcome: 'lifespan', direction: 'increase',
      strength: 0.6, humanRelevance: 0.2, createdBy: actor, now: 5,
    });
    const r = ask();
    assert.equal(r.provenance.engine, ENGINE_VERSION);
    assert.match(r.provenance.snapshotId, /^[0-9a-f]{64}$/);
    assert.equal(r.provenance.evidenceIds.length, 1);
  });

  test('the stored artifact goes through the same gate as everything else', () => {
    // The engine gets no exemption from the rules it exists to enforce.
    const artifact = runAndRecord(db, { projectId: P, question: 'Can cellular senescence be reversed?', createdBy: actor, now: 100 });
    assert.equal(artifact.kind, 'discovery');
    assert.equal(artifact.review_status, 'unreviewed');
    assert.ok(artifact.refusals.length > 0);
    assert.ok(Number.isFinite(artifact.uncertainty.coverage));
    assert.ok(Number.isFinite(artifact.uncertainty.belief));
    assert.deepEqual(getArtifact(db, artifact.id, P).body.engine, ENGINE_VERSION);
  });

  test('the same question over the same inputs is replayable', () => {
    const a = runAndRecord(db, { projectId: P, question: 'Q', createdBy: actor, now: 100 });
    const b = runAndRecord(db, { projectId: P, question: 'Q', createdBy: actor, now: 200 });
    assert.equal(a.inputs_hash, b.inputs_hash, 'same question, same graph, same evidence — same replay key');
  });

  test('adding evidence changes the replay key', () => {
    const before = runAndRecord(db, { projectId: P, question: 'Q', createdBy: actor, now: 100 });
    recordEvidence(db, {
      projectId: P, citation: 'doi:10.1000/new', tier: 'rodent', outcome: 'lifespan', direction: 'increase',
      strength: 0.6, humanRelevance: 0.2, createdBy: actor, now: 150,
    });
    const after = runAndRecord(db, { projectId: P, question: 'Q', createdBy: actor, now: 200 });
    assert.notEqual(before.inputs_hash, after.inputs_hash, 'the answer now rests on different inputs and must say so');
  });
});
