import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReviewSchema, submitReview, upsertReviewerProfile } from '../edgeReview.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { ensureReasoningSchema, seedGraphSnapshot, recordEvidence, retireEvidence, edgeKeyOf } from './store.mjs';
import { assertClaim, reviseClaim } from './livingGraph.mjs';
import { buryHypothesis, exhume } from './graveyard.mjs';
import { knowledgeTimeline, timelineSummary, EVENT_KINDS } from './timeline.mjs';

/**
 * Phase 3 — the knowledge timeline, merged into Memory.
 *
 * Four append-only sources become one stream. The tests worth reading are the
 * ones about what it refuses to do: no interpolation, no cache, no silent empty
 * result for a typo, and no claim about whether the science got better.
 */

let db;
let actor;
let P;

beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  ensureReviewSchema(db);
  actor = createUser(db, { email: 'a@lab.org', displayName: 'Dr A', passwordHash: 'x' }).id;
  P = `user:${actor}`;
  seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: GRAPH_EDGES, now: 1 });
});

function fullHistory() {
  recordEvidence(db, {
    projectId: P, citation: 'doi:10.1000/study-a', tier: 'rodent', outcome: 'lifespan', direction: 'increase',
    strength: 0.6, humanRelevance: 0.2, createdBy: actor, now: 1000,
  });
  const claim = assertClaim(db, {
    projectId: P, subject: 'senolytics', predicate: 'promotes', object: 'healthspan',
    confidence: 0.4, coverage: 0.1, rule: 'manual/1', actorId: actor, now: 2000,
  }).claim;
  upsertReviewerProfile(db, actor, { displayName: 'Dr A', affiliation: 'Lab', expertise: 'senescence' });
  submitReview(db, { edgeKey: edgeKeyOf(GRAPH_EDGES[0]), reviewerId: actor, verdict: 'confirm', now: 3000 });
  reviseClaim(db, {
    claimId: claim.id, projectId: P, confidence: 0.7, coverage: 0.3,
    cause: 'review', causeRef: 'rev-1', rule: 'review-derived/1', actorId: actor, now: 4000,
  });
  const grave = buryHypothesis(db, {
    projectId: P, statement: 'Telomerase extends healthspan in wild-type mice.',
    subject: 'telomerase', predicate: 'promotes', object: 'healthspan',
    cause: 'failed-replication', evidenceRef: 'doi:10.1000/failed',
    lesson: 'Did not survive a second cohort.', actorId: actor, now: 5000,
  }).grave;
  return { claim, grave };
}

describe('one stream from four sources', () => {
  test('every kind of event appears, in time order', () => {
    fullHistory();
    const { events } = knowledgeTimeline(db, P);
    assert.deepEqual(events.map((e) => e.at), [1000, 2000, 3000, 4000, 5000]);
    assert.deepEqual(events.map((e) => e.kind), ['evidence', 'belief', 'review', 'belief', 'burial']);
  });

  test('every event carries a readable detail, not just a code', () => {
    fullHistory();
    const { events } = knowledgeTimeline(db, P);
    assert.ok(events.every((e) => typeof e.detail === 'string' && e.detail.length > 20));
  });

  test('a belief revision names its cause and the rule behind the number', () => {
    // A confidence curve nobody can interrogate is decoration.
    fullHistory();
    const revision = knowledgeTimeline(db, P).events.find((e) => e.kind === 'belief' && e.cause === 'review');
    assert.equal(revision.rule, 'review-derived/1');
    assert.match(revision.detail, /because of review/);
    assert.match(revision.detail, /by rule review-derived\/1/);
  });

  test('a retraction and an exhumation appear at the moment they happened', () => {
    const { grave } = fullHistory();
    const record = db.prepare('SELECT id FROM evidence_records LIMIT 1').get();
    retireEvidence(db, record.id, P, { now: 6000 });
    exhume(db, { id: grave.id, projectId: P, why: 'A cleaner line makes the objection testable again.', actorId: actor, now: 7000 });

    const kinds = knowledgeTimeline(db, P).events.filter((e) => e.at >= 6000).map((e) => e.kind);
    assert.deepEqual(kinds, ['retraction', 'exhumation']);
  });

  test('a retired study is not erased from the history that used it', () => {
    fullHistory();
    const record = db.prepare('SELECT id FROM evidence_records LIMIT 1').get();
    retireEvidence(db, record.id, P, { now: 6000 });
    const events = knowledgeTimeline(db, P).events;
    assert.ok(events.some((e) => e.kind === 'evidence' && e.ref === record.id), 'the entry survives');
    assert.ok(events.some((e) => e.kind === 'retraction' && e.ref === record.id));
  });
});

describe('what it refuses to do', () => {
  test('an unknown event kind throws instead of returning nothing', () => {
    // Silently returning an empty list for a typo is how a reader concludes
    // their laboratory did nothing.
    assert.throws(() => knowledgeTimeline(db, P, { kinds: ['beleif'] }), /unknown event kind/);
    assert.ok(EVENT_KINDS.includes('belief'));
  });

  test('it declares which sources existed when it was read', () => {
    // A timeline is only as complete as the tables behind it, and saying so
    // beats implying completeness.
    const bare = openDatabase(':memory:');
    const t = knowledgeTimeline(bare, 'user:x');
    assert.deepEqual(t.events, []);
    assert.equal(t.sources.belief, false);
    assert.equal(t.sources.evidence, false);
  });

  test('truncation is reported rather than silent', () => {
    fullHistory();
    const t = knowledgeTimeline(db, P, { limit: 2 });
    assert.equal(t.events.length, 2);
    assert.equal(t.total, 5);
    assert.equal(t.truncated, true);
  });

  test('the summary counts, and does not claim the science improved', () => {
    fullHistory();
    const s = timelineSummary(db, P);
    assert.match(s.statement, /1 study\(ies\) entered/);
    assert.match(s.statement, /1 hypothesis\(es\) buried/);
    for (const forbidden of [/improv/i, /better/i, /progress/i, /success/i]) {
      assert.equal(s.statement.match(forbidden), null, `the summary must not editorialise: ${forbidden}`);
    }
  });

  test('an empty window says so without implying the field stood still', () => {
    const s = timelineSummary(db, P);
    assert.match(s.statement, /absence of activity, not an absence of change in the field/);
  });
});

describe('windows and filtering', () => {
  test('bounds are inclusive at both ends', () => {
    fullHistory();
    const t = knowledgeTimeline(db, P, { since: 2000, until: 4000 });
    assert.deepEqual(t.events.map((e) => e.at), [2000, 3000, 4000]);
  });

  test('filtering to one kind returns only that kind', () => {
    fullHistory();
    const t = knowledgeTimeline(db, P, { kinds: ['burial'] });
    assert.equal(t.events.length, 1);
    assert.equal(t.events[0].kind, 'burial');
  });

  test('the summary reports which beliefs rose and which fell', () => {
    const claim = assertClaim(db, {
      projectId: P, subject: 'a', predicate: 'promotes', object: 'b',
      confidence: 0.8, coverage: 0.2, rule: 'manual/1', actorId: actor, now: 100,
    }).claim;
    reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.2, coverage: 0.5,
      cause: 'retraction', causeRef: 'doi:x', rule: 'retraction/1', actorId: actor, now: 200,
    });
    const s = timelineSummary(db, P);
    assert.equal(s.beliefsThatFell, 1);
    assert.equal(s.beliefsThatRose, 0);
  });
});

describe('tenancy', () => {
  test('another workspace sees its own history, not yours', () => {
    fullHistory();
    const other = knowledgeTimeline(db, 'user:someone-else');
    assert.ok(!other.events.some((e) => e.kind === 'evidence'));
    assert.ok(!other.events.some((e) => e.kind === 'burial'));
  });

  test('expert reviews are shown to everyone, deliberately', () => {
    // The ledger is a public act. A verdict changes what everyone should believe
    // about that edge, so it appears on every workspace's timeline — and is
    // marked global so nobody mistakes it for their own record.
    fullHistory();
    const other = knowledgeTimeline(db, 'user:someone-else').events.filter((e) => e.kind === 'review');
    assert.equal(other.length, 1);
    assert.equal(other[0].global, true);
  });
});

describe('measuring direction from where a belief started', () => {
  /**
   * Regression. The first version measured movement across non-initial
   * revisions only, so a claim asserted at 0.8 and revised once to 0.2 compared
   * 0.2 against itself and reported as unmoved — the exact opposite of what
   * happened, and silently.
   */
  test('a single revision downward counts as a fall', () => {
    const claim = assertClaim(db, {
      projectId: P, subject: 'a', predicate: 'promotes', object: 'b',
      confidence: 0.9, coverage: 0.2, rule: 'manual/1', actorId: actor, now: 100,
    }).claim;
    reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.1, coverage: 0.4,
      cause: 'retraction', causeRef: 'doi:x', rule: 'retraction/1', actorId: actor, now: 200,
    });
    assert.equal(timelineSummary(db, P).beliefsThatFell, 1);
  });

  test('a claim that was only asserted has not moved', () => {
    assertClaim(db, {
      projectId: P, subject: 'a', predicate: 'promotes', object: 'b',
      confidence: 0.5, coverage: 0.1, rule: 'manual/1', actorId: actor, now: 100,
    });
    const s = timelineSummary(db, P);
    assert.equal(s.beliefsThatRose, 0);
    assert.equal(s.beliefsThatFell, 0);
  });
});
