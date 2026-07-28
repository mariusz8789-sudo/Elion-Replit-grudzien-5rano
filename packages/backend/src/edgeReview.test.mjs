import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from './store.mjs';
import { hashPassword } from './auth.mjs';
import {
  ensureReviewSchema, upsertReviewerProfile, submitReview, validateReview,
  reviewsForEdge, reviewHistory, edgeStatus, edgeStatuses, reviewWorklist,
  reviewerCredit, contributors, reviewCoverage, edgesPassingStandard,
} from './edgeReview.mjs';

/**
 * Reviewed edge ledger.
 *
 * The tests that matter here are the ones pinning judgements that a later
 * "optimisation" would be tempted to undo: that a dispute is not outvoted, that
 * status is never cached, and that an expert declining on competence grounds is
 * recorded rather than discarded. Each is a deliberate cost, and each is the
 * reason the ledger is worth anything.
 */

const EDGES = ['cellular-senescence→sasp→mechanistic', 'telomerase→oncogene-activation→oncogenic-coupling', 'autophagy→mitochondrial-dysfunction→mechanistic'];

let db;
let alice;
let bob;
let carol;

function seedUser(email, name) {
  const u = createUser(db, { email, displayName: name, passwordHash: hashPassword('pw12345678') });
  upsertReviewerProfile(db, u.id, { displayName: name, orcid: `0000-0000-0000-${email.length}`, affiliation: 'Test Institute', expertise: 'cell biology' });
  return u;
}

beforeEach(() => {
  db = openDatabase();
  ensureReviewSchema(db);
  alice = seedUser('alice@lab.io', 'Alice Reviewer');
  bob = seedUser('bob@lab.io', 'Bob Reviewer');
  carol = seedUser('carol@lab.io', 'Carol Reviewer');
});

describe('submitting a review', () => {
  test('records a confirmation with attribution', () => {
    const r = submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm', confidence: 'high', comment: 'Standard.' });
    assert.equal(r.ok, true);
    const reviews = reviewsForEdge(db, EDGES[0]);
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].display_name, 'Alice Reviewer');
    assert.ok(reviews[0].orcid, 'attribution must carry an ORCID');
  });

  test('refuses a dispute with no stated reason', () => {
    const r = submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'dispute', comment: '   ' });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /must state why/);
  });

  test('refuses a refinement that proposes nothing', () => {
    assert.equal(submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'refine' }).ok, false);
    assert.equal(submitReview(db, {
      edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'refine',
      proposedMechanism: 'The arrest is p21-dependent early and p16-dependent late.',
    }).ok, true);
  });

  test('rejects an unknown verdict rather than storing it', () => {
    assert.equal(validateReview({ edgeKey: 'e', verdict: 'looks-fine' }).ok, false);
  });

  test('a reviewer changing their mind supersedes, and the history survives', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm', now: 1000 });
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'dispute', comment: 'On reflection the direction is context-dependent.', now: 2000 });

    const current = reviewsForEdge(db, EDGES[0]);
    assert.equal(current.length, 1, 'only the latest review counts');
    assert.equal(current[0].verdict, 'dispute');

    const history = reviewHistory(db, EDGES[0]);
    assert.equal(history.length, 2, 'the earlier judgement must not be erased');
    assert.equal(history[0].verdict, 'confirm');
    assert.ok(history[0].superseded_by, 'the superseding review is recorded');
  });
});

describe('derived edge status', () => {
  test('unreviewed edges say so plainly', () => {
    const s = edgeStatus(db, EDGES[0]);
    assert.equal(s.status, 'unreviewed');
    assert.match(s.basis, /No domain expert has reviewed/);
  });

  test('ONE dispute outweighs many confirmations — deliberately', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[0], reviewerId: bob.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[0], reviewerId: carol.id, verdict: 'dispute', comment: 'Only holds in fibroblasts.' });

    const s = edgeStatus(db, EDGES[0]);
    assert.equal(s.status, 'disputed', 'a dispute must not be outvoted');
    assert.equal(s.confirms, 2);
    assert.equal(s.disputes, 1);
    assert.match(s.basis, /not outvoted/);
  });

  test('declining on expertise grounds is recorded, not discarded', () => {
    submitReview(db, { edgeKey: EDGES[1], reviewerId: alice.id, verdict: 'insufficient-expertise', comment: 'Not my field.' });
    const s = edgeStatus(db, EDGES[1]);
    assert.equal(s.status, 'awaiting-expertise');
    assert.equal(s.declined, 1);
    assert.match(s.basis, /needs a different specialist/);
  });

  test('a proposed refinement leaves the edge usable but not final', () => {
    submitReview(db, { edgeKey: EDGES[2], reviewerId: alice.id, verdict: 'refine', proposedMechanism: 'Mitophagy specifically, not bulk autophagy.' });
    assert.equal(edgeStatus(db, EDGES[2]).status, 'refinement-proposed');
  });

  test('status is derived, so it changes the moment a review does', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    assert.equal(edgeStatus(db, EDGES[0]).status, 'confirmed');
    submitReview(db, { edgeKey: EDGES[0], reviewerId: bob.id, verdict: 'dispute', comment: 'Contradicted in vivo.' });
    assert.equal(edgeStatus(db, EDGES[0]).status, 'disputed', 'no cached status may survive a new review');
  });

  test('batches statuses for a whole graph in one call', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    const all = edgeStatuses(db, EDGES);
    assert.equal(Object.keys(all).length, 3);
    assert.equal(all[EDGES[0]].status, 'confirmed');
    assert.equal(all[EDGES[1]].status, 'unreviewed');
  });
});

describe('reviewer worklist', () => {
  test('puts never-examined edges first and hides what this reviewer already did', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    const list = reviewWorklist(db, EDGES, { reviewerId: alice.id });
    assert.ok(!list.some((s) => s.edgeKey === EDGES[0]), 'already reviewed by Alice');
    assert.equal(list[0].status, 'unreviewed');
  });

  test('a thinly-reviewed edge outranks a well-reviewed one', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[0], reviewerId: bob.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[1], reviewerId: alice.id, verdict: 'confirm' });
    const list = reviewWorklist(db, [EDGES[0], EDGES[1]], { reviewerId: carol.id });
    assert.equal(list[0].edgeKey, EDGES[1], 'the edge with one review needs a second more than the edge with two');
  });
});

describe('credit — the reason an expert would do this', () => {
  test('contribution is countable, attributed and exportable', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[1], reviewerId: alice.id, verdict: 'dispute', comment: 'Overstated.' });
    submitReview(db, { edgeKey: EDGES[2], reviewerId: alice.id, verdict: 'refine', proposedMechanism: 'Narrower.' });

    const credit = reviewerCredit(db, alice.id);
    assert.equal(credit.total, 3);
    assert.equal(credit.confirms, 1);
    assert.equal(credit.disputes, 1);
    assert.equal(credit.refinements, 1);
    assert.equal(credit.profile.orcid, alice.id ? credit.profile.orcid : null);
    assert.match(credit.statement, /3 edge review\(s\)/);
  });

  test('superseded reviews do not inflate credit', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm', now: 1 });
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm', now: 2 });
    assert.equal(reviewerCredit(db, alice.id).total, 1);
  });

  test('contributors list is ordered by contribution', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[1], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[0], reviewerId: bob.id, verdict: 'confirm' });
    const list = contributors(db);
    assert.equal(list[0].display_name, 'Alice Reviewer');
    assert.equal(list[0].reviews, 2);
  });
});

describe('coverage — the asset that grows with use', () => {
  test('reports honestly when nothing has been reviewed', () => {
    const c = reviewCoverage(db, EDGES);
    assert.equal(c.coverage, 0);
    assert.equal(c.unreviewed, 3);
    assert.match(c.statement, /never examined/);
  });

  test('coverage rises and names the number of experts', () => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[1], reviewerId: bob.id, verdict: 'confirm' });
    const c = reviewCoverage(db, EDGES);
    assert.equal(c.reviewed, 2);
    assert.equal(c.reviewers, 2);
    assert.ok(Math.abs(c.coverage - 0.667) < 0.01);
  });
});

describe('evidence standards — what makes the ledger matter', () => {
  beforeEach(() => {
    submitReview(db, { edgeKey: EDGES[0], reviewerId: alice.id, verdict: 'confirm' });
    submitReview(db, { edgeKey: EDGES[1], reviewerId: bob.id, verdict: 'dispute', comment: 'Direction is context-dependent.' });
    // EDGES[2] left unreviewed.
  });

  test('an analysis can be restricted to expert-confirmed edges only', () => {
    assert.deepEqual(edgesPassingStandard(db, EDGES, 'expert-confirmed'), [EDGES[0]]);
  });

  test('"not-disputed" keeps unreviewed edges but drops contested ones', () => {
    const kept = edgesPassingStandard(db, EDGES, 'not-disputed');
    assert.ok(kept.includes(EDGES[0]));
    assert.ok(kept.includes(EDGES[2]));
    assert.ok(!kept.includes(EDGES[1]));
  });

  test('"reviewed" drops the never-examined edge', () => {
    assert.deepEqual(edgesPassingStandard(db, EDGES, 'reviewed').sort(), [EDGES[0], EDGES[1]].sort());
  });

  test('an unknown standard falls open rather than silently dropping everything', () => {
    assert.equal(edgesPassingStandard(db, EDGES, 'nonsense').length, EDGES.length);
  });
});
