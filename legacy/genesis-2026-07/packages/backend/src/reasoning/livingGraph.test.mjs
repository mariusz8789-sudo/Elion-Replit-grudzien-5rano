import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { ensureReasoningSchema, seedGraphSnapshot, recordEvidence, currentSnapshot } from './store.mjs';
import {
  assertClaim, reviseClaim, retireClaim, claimState, claimHistory, liveClaims,
  seedClaimsFromSnapshot, detectContradictions, resolveContradiction, contradictionId,
  confidenceTimeline, CAUSES,
} from './livingGraph.mjs';

/**
 * Phase 1b — the Living Knowledge Graph.
 *
 * The property under test is not "confidence can be stored". It is that a
 * belief's HISTORY survives, that every movement names what caused it and which
 * rule turned that cause into a number, and that a conflict is surfaced rather
 * than averaged away.
 *
 * The refusals are the design. A revision with no cause, no rule, or a single
 * merged confidence number would each make the graph unauditable while leaving
 * every type check and every screen intact.
 */

let db;
let actor;
const P = 'user:test';

const belief = { confidence: 0.5, coverage: 0.2, rule: 'manual/1' };

const claimOf = (over = {}) => assertClaim(db, {
  projectId: P, subject: 'cellular-senescence', predicate: 'promotes', object: 'sasp',
  actorId: actor, now: 1000, ...belief, ...over,
});

beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  actor = createUser(db, { email: 'a@lab.org', displayName: 'A', passwordHash: 'x' }).id;
});

describe('asserting a claim', () => {
  test('creates the claim and its first revision together', () => {
    const { claim, created } = claimOf();
    assert.equal(created, true);
    const state = claimState(db, claim.id);
    assert.equal(state.confidence, 0.5);
    assert.equal(state.coverage, 0.2);
    assert.equal(state.lastCause, 'initial');
    assert.equal(state.revisions, 1);
    assert.equal(state.live, true);
  });

  test('the same relationship asserted twice is one claim', () => {
    // Two rows for one relationship would be two beliefs that quietly disagree.
    const first = claimOf();
    const second = claimOf({ confidence: 0.9 });
    assert.equal(second.created, false);
    assert.equal(second.claim.id, first.claim.id);
    assert.equal(claimState(db, first.claim.id).confidence, 0.5, 're-asserting must not overwrite a belief');
  });

  test('different tenants hold their own belief about the same relationship', () => {
    // The curated graph is shared; what a laboratory concludes from it is not.
    const mine = claimOf({ projectId: 'user:alice' });
    const theirs = claimOf({ projectId: 'user:bob', confidence: 0.9 });
    assert.notEqual(mine.claim.id, theirs.claim.id);
    assert.equal(claimState(db, mine.claim.id).confidence, 0.5);
    assert.equal(claimState(db, theirs.claim.id).confidence, 0.9);
  });

  test('refuses a belief with no rule behind it', () => {
    // A confidence with no rule cannot be re-derived, argued with, or corrected
    // when the rule turns out to be wrong — and the rules will be wrong.
    assert.throws(() => claimOf({ rule: '' }), /rule is required/);
  });

  test('refuses confidence and coverage merged into one number', () => {
    assert.throws(() => claimOf({ coverage: undefined }), /NOT interchangeable/);
    assert.throws(() => claimOf({ confidence: 1.4 }), /confidence must be a number in \[0, 1\]/);
  });
});

describe('revising a belief', () => {
  test('appends rather than overwrites, and the history survives', () => {
    const { claim } = claimOf();
    reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.8, coverage: 0.4,
      cause: 'new-evidence', causeRef: 'ev-1', rule: 'evidence-weighted/1', actorId: actor, now: 2000,
    });
    const history = claimHistory(db, claim.id);
    assert.equal(history.length, 2);
    assert.equal(history[0].confidence, 0.5, 'the earlier belief is still there');
    assert.equal(claimState(db, claim.id).confidence, 0.8);
  });

  test('reports the direction of the last movement', () => {
    const { claim } = claimOf({ confidence: 0.8 });
    reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.3, coverage: 0.5,
      cause: 'retraction', causeRef: 'doi:10.1000/retracted', rule: 'retraction/1', actorId: actor, now: 2000,
    });
    const state = claimState(db, claim.id);
    assert.equal(state.trend, -0.5);
    assert.equal(state.lastCause, 'retraction');
    assert.equal(state.lastCauseRef, 'doi:10.1000/retracted');
  });

  test('refuses a revision that does not name what moved it', () => {
    const { claim } = claimOf();
    assert.throws(() => reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.9, coverage: 0.3,
      cause: 'review', rule: 'review-derived/1', actorId: actor,
    }), /must name what moved the belief/);
  });

  test('refuses a cause outside the audited vocabulary', () => {
    const { claim } = claimOf();
    assert.throws(() => reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.9, coverage: 0.3,
      cause: 'felt-right', causeRef: 'x', rule: 'r/1', actorId: actor,
    }), /cause must be one of/);
    assert.ok(CAUSES.includes('retraction'));
  });

  test("refuses to reuse 'initial' for a later change", () => {
    const { claim } = claimOf();
    assert.throws(() => reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.9, coverage: 0.3,
      cause: 'initial', rule: 'r/1', actorId: actor,
    }), /belongs to the first revision only/);
  });

  test('another tenant cannot revise your belief', () => {
    const { claim } = claimOf();
    const r = reviseClaim(db, {
      claimId: claim.id, projectId: 'user:someone-else', confidence: 0.9, coverage: 0.3,
      cause: 'manual', rule: 'r/1', actorId: actor,
    });
    assert.equal(r.ok, false);
    assert.equal(claimState(db, claim.id).confidence, 0.5);
  });
});

describe('retiring a claim', () => {
  test('keeps the history and records the withdrawal as a movement to zero', () => {
    // A claim that simply stops appearing reads as though it was never made.
    const { claim } = claimOf();
    const r = retireClaim(db, {
      claimId: claim.id, projectId: P, cause: 'retraction',
      causeRef: 'doi:10.1000/retracted', actorId: actor, now: 3000,
    });
    assert.equal(r.ok, true);
    const state = claimState(db, claim.id);
    assert.equal(state.live, false);
    assert.equal(state.confidence, 0);
    assert.equal(state.lastCause, 'retraction');
    assert.equal(claimHistory(db, claim.id).length, 2);
    assert.equal(liveClaims(db, P).length, 0);
  });

  test('a retired claim cannot be revised back to life by accident', () => {
    const { claim } = claimOf();
    retireClaim(db, { claimId: claim.id, projectId: P, cause: 'manual', actorId: actor, now: 3000 });
    const r = reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.9, coverage: 0.5,
      cause: 'new-evidence', causeRef: 'ev-2', rule: 'r/1', actorId: actor, now: 4000,
    });
    assert.equal(r.ok, false);
    assert.match(r.message, /Revive it explicitly/);
  });

  test('a retraction that retires a claim must name itself', () => {
    const { claim } = claimOf();
    const r = retireClaim(db, { claimId: claim.id, projectId: P, cause: 'retraction', actorId: actor });
    assert.equal(r.ok, false);
    assert.match(r.message, /must name itself/);
  });
});

describe('seeding from the curated graph', () => {
  beforeEach(() => seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: GRAPH_EDGES, now: 100 }));

  test('creates one claim per directed curated edge', () => {
    const r = seedClaimsFromSnapshot(db, { projectId: P, actorId: actor, now: 200 });
    assert.ok(r.seeded > 0);
    assert.equal(r.snapshotId, currentSnapshot(db).id);
    const claims = liveClaims(db, P);
    assert.equal(claims.length, r.seeded);
    assert.ok(claims.every((c) => c.origin === 'curated' && c.origin_ref));
  });

  test('starts low and with zero coverage, and says which rule chose that', () => {
    // A curated edge is an author's assertion, not a reviewed one, and nothing
    // has been read yet.
    seedClaimsFromSnapshot(db, { projectId: P, actorId: actor, now: 200 });
    const state = claimState(db, liveClaims(db, P)[0].id);
    assert.equal(state.coverage, 0);
    assert.ok(state.confidence <= 0.5);
    assert.equal(state.rule, 'curated-seed/1');
  });

  test('re-seeding does not reset a belief the tenant has moved', () => {
    // Server restarts re-seed. Resetting somebody's revised confidence back to
    // the curator's starting point would silently discard their work.
    seedClaimsFromSnapshot(db, { projectId: P, actorId: actor, now: 200 });
    const claim = liveClaims(db, P)[0];
    reviseClaim(db, {
      claimId: claim.id, projectId: P, confidence: 0.95, coverage: 0.8,
      cause: 'review', causeRef: 'rev-1', rule: 'review-derived/1', actorId: actor, now: 300,
    });
    const again = seedClaimsFromSnapshot(db, { projectId: P, actorId: actor, now: 400 });
    assert.equal(again.seeded, 0);
    assert.equal(claimState(db, claim.id).confidence, 0.95);
  });
});

describe('contradiction detection', () => {
  test('finds opposite directions asserted for the same pair', () => {
    claimOf({ subject: 'x', predicate: 'promotes', object: 'y' });
    claimOf({ subject: 'x', predicate: 'counteracts', object: 'y', confidence: 0.4 });
    const found = detectContradictions(db, P);
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, 'sign-conflict');
    assert.match(found[0].detail, /cannot both be right in the same system/);
  });

  test('does not invent a conflict from a claim about a different pair', () => {
    claimOf({ subject: 'x', predicate: 'promotes', object: 'y' });
    claimOf({ subject: 'x', predicate: 'counteracts', object: 'z' });
    assert.deepEqual(detectContradictions(db, P), []);
  });

  test('a retired claim stops contradicting', () => {
    const a = claimOf({ subject: 'x', predicate: 'promotes', object: 'y' });
    claimOf({ subject: 'x', predicate: 'counteracts', object: 'y' });
    assert.equal(detectContradictions(db, P).length, 1);
    retireClaim(db, { claimId: a.claim.id, projectId: P, cause: 'manual', actorId: actor, now: 5000 });
    assert.deepEqual(detectContradictions(db, P), []);
  });

  test('finds evidence pointing both ways on one edge', () => {
    const base = {
      projectId: P, edgeKey: 'a→b→mechanistic', citation: 'doi:10.1000/x', tier: 'rodent',
      outcome: 'lifespan', strength: 0.5, humanRelevance: 0.2, createdBy: actor, now: 1,
    };
    recordEvidence(db, { ...base, direction: 'increase' });
    recordEvidence(db, { ...base, citation: 'doi:10.1000/y', direction: 'decrease' });
    const found = detectContradictions(db, P);
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, 'evidence-conflict');
    assert.match(found[0].detail, /Averaging them would erase the disagreement/);
  });

  test('detection is derived — nothing is cached', () => {
    // A stored contradiction list is a cache of a scientific judgement, and it
    // will eventually disagree with the claims it describes.
    claimOf({ subject: 'x', predicate: 'promotes', object: 'y' });
    const second = claimOf({ subject: 'x', predicate: 'counteracts', object: 'y' });
    assert.equal(detectContradictions(db, P).length, 1);
    retireClaim(db, { claimId: second.claim.id, projectId: P, cause: 'manual', actorId: actor, now: 6000 });
    assert.equal(detectContradictions(db, P).length, 0, 'the finding follows the claims immediately');
  });

  test('one tenant does not see another tenant conflicts', () => {
    claimOf({ projectId: 'user:alice', subject: 'x', predicate: 'promotes', object: 'y' });
    claimOf({ projectId: 'user:alice', subject: 'x', predicate: 'counteracts', object: 'y' });
    assert.equal(detectContradictions(db, 'user:alice').length, 1);
    assert.equal(detectContradictions(db, 'user:bob').length, 0);
  });
});

describe('resolving a contradiction', () => {
  function conflict() {
    claimOf({ subject: 'x', predicate: 'promotes', object: 'y' });
    claimOf({ subject: 'x', predicate: 'counteracts', object: 'y' });
    return detectContradictions(db, P)[0];
  }

  test('a resolution attaches to the derived conflict and is shown with it', () => {
    const c = conflict();
    const r = resolveContradiction(db, {
      contradictionId: c.id, projectId: P, kind: c.kind, resolvedBy: actor,
      resolution: 'Both hold: the effect reverses above 40% confluence. Split into two context-scoped claims.',
      now: 7000,
    });
    assert.equal(r.ok, true);
    const after = detectContradictions(db, P)[0];
    assert.equal(after.resolution.resolved_by, actor);
    assert.match(after.resolution.resolution, /reverses above 40% confluence/);
  });

  test('the conflict is still reported after resolution, not hidden', () => {
    // Resolving records a judgement; it does not make the disagreement go away,
    // and a reader is entitled to see both.
    const c = conflict();
    resolveContradiction(db, {
      contradictionId: c.id, projectId: P, kind: c.kind, resolvedBy: actor,
      resolution: 'Context-dependent; keeping both claims deliberately.', now: 7000,
    });
    assert.equal(detectContradictions(db, P).length, 1);
  });

  test('refuses an unattributed or unexplained resolution', () => {
    const c = conflict();
    assert.match(resolveContradiction(db, { contradictionId: c.id, projectId: P, kind: c.kind, resolution: 'ok', resolvedBy: actor }).message, /what was decided and why/);
    assert.match(resolveContradiction(db, { contradictionId: c.id, projectId: P, kind: c.kind, resolution: 'A long enough explanation.', resolvedBy: null }).message, /cannot be questioned/);
  });

  test('the conflict id is stable across ordering', () => {
    const a = contradictionId({ projectId: P, kind: 'sign-conflict', parts: ['c1', 'c2'] });
    const b = contradictionId({ projectId: P, kind: 'sign-conflict', parts: ['c2', 'c1'] });
    assert.equal(a, b, 'a resolution must not detach because the pair came back in a different order');
  });
});

describe('confidence over time', () => {
  test('returns one point per revision, not a resampled series', () => {
    // Interpolating between revisions would draw a line through moments when
    // nobody believed anything in particular.
    const { claim } = claimOf();
    reviseClaim(db, { claimId: claim.id, projectId: P, confidence: 0.7, coverage: 0.3, cause: 'review', causeRef: 'r1', rule: 'review-derived/1', actorId: actor, now: 2000 });
    reviseClaim(db, { claimId: claim.id, projectId: P, confidence: 0.2, coverage: 0.6, cause: 'retraction', causeRef: 'doi:x', rule: 'retraction/1', actorId: actor, now: 3000 });

    const points = confidenceTimeline(db, P);
    assert.equal(points.length, 3);
    assert.deepEqual(points.map((p) => p.confidence), [0.5, 0.7, 0.2]);
    assert.deepEqual(points.map((p) => p.cause), ['initial', 'review', 'retraction']);
    assert.ok(points.every((p) => p.rule));
  });

  test('every point carries the cause and rule, so a curve can be interrogated', () => {
    const { claim } = claimOf();
    reviseClaim(db, { claimId: claim.id, projectId: P, confidence: 0.9, coverage: 0.4, cause: 'new-evidence', causeRef: 'ev-9', rule: 'evidence-weighted/1', actorId: actor, now: 2000 });
    const last = confidenceTimeline(db, P).at(-1);
    assert.equal(last.cause_ref, 'ev-9');
    assert.equal(last.rule, 'evidence-weighted/1');
  });
});
