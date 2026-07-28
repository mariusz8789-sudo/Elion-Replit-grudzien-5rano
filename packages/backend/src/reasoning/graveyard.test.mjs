import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser } from '../store.mjs';
import { ensureReasoningSchema } from './store.mjs';
import {
  buryHypothesis, assessHypothesis, exhume, listGraves, lessons,
  graveContentHash, VERDICT, BURIAL_CAUSES,
} from './graveyard.mjs';

/**
 * Phase 2 — the hypothesis graveyard.
 *
 * The asymmetry that shapes this module is worth stating before the tests: a
 * false "you already tried this" suppresses a live hypothesis INVISIBLY — the
 * scientist never sees what was withheld — while a false "this is novel" wastes
 * an experiment the platform was going to suggest anyway. So matching is
 * structural only, and several tests exist to pin the things it refuses to
 * match.
 */

let db;
let actor;
const P = 'user:lab';

const bury = (over = {}) => buryHypothesis(db, {
  projectId: P, statement: 'Telomerase activation extends healthspan in wild-type mice.',
  subject: 'telomerase', predicate: 'promotes', object: 'healthspan',
  cause: 'failed-replication', evidenceRef: 'doi:10.1000/failed-repro',
  lesson: 'The 2016 effect did not survive a second cohort; the original used a mixed background.',
  actorId: actor, now: 1000, ...over,
});

beforeEach(() => {
  db = openDatabase(':memory:');
  ensureReasoningSchema(db);
  actor = createUser(db, { email: 'a@lab.org', displayName: 'A', passwordHash: 'x' }).id;
});

describe('burying', () => {
  test('records the claim, what killed it and the lesson', () => {
    const { grave, created } = bury();
    assert.equal(created, true);
    assert.equal(grave.cause, 'failed-replication');
    assert.equal(grave.evidence_ref, 'doi:10.1000/failed-repro');
    assert.match(grave.lesson, /mixed background/);
    assert.equal(grave.resurrectable, 1);
  });

  test('refuses a burial with no evidence behind it', () => {
    // A hypothesis buried on a hunch would go on suppressing proposals forever,
    // and nobody downstream could tell why.
    assert.throws(() => bury({ evidenceRef: '' }), /buried with no evidence is a prejudice/);
  });

  test('refuses a cause outside the audited vocabulary', () => {
    assert.throws(() => bury({ cause: 'seemed-unlikely' }), /cause must be one of/);
    assert.ok(BURIAL_CAUSES.includes('retracted'));
  });

  test('refuses a burial with no readable statement', () => {
    // The triple is for matching; the statement is what a person reads in two
    // years when deciding whether this still applies.
    assert.throws(() => bury({ statement: '  ' }), /what was believed, in words a person can read later/);
  });

  test('burying the same claim twice returns the existing grave', () => {
    const first = bury();
    const second = bury({ lesson: 'a different note' });
    assert.equal(second.created, false);
    assert.equal(second.grave.id, first.grave.id);
    assert.equal(listGraves(db, P).length, 1);
  });

  test('identity ignores when it was buried and by whom', () => {
    const a = graveContentHash({ subject: 'x', predicate: 'promotes', object: 'y', statement: 'one wording' });
    const b = graveContentHash({ subject: 'x', predicate: 'promotes', object: 'y', statement: 'another wording' });
    assert.equal(a, b, 'a triple is the claim; the prose around it is not');
  });
});

describe('assessing a proposal', () => {
  test('an exact match reports the burial and the lesson', () => {
    bury();
    const r = assessHypothesis(db, { projectId: P, subject: 'telomerase', predicate: 'promotes', object: 'healthspan' });
    assert.equal(r.verdict, VERDICT.BURIED);
    assert.match(r.statement, /failed-replication/);
    assert.match(r.statement, /mixed background/);
    assert.equal(r.graves.length, 1);
  });

  test('the opposite direction is reported as such, never as the same claim', () => {
    // Refuting "X promotes Y" says nothing about whether X counteracts Y.
    // Collapsing them would suppress a live hypothesis on the strength of a
    // result about a different one.
    bury();
    const r = assessHypothesis(db, { projectId: P, subject: 'telomerase', predicate: 'counteracts', object: 'healthspan' });
    assert.equal(r.verdict, VERDICT.OPPOSITE_BURIED);
    assert.match(r.statement, /not the same claim/);
  });

  test('another claim about the same pair is the weakest signal, and says so', () => {
    bury({ predicate: 'promotes', statement: 'A' });
    const r = assessHypothesis(db, { projectId: P, subject: 'telomerase', predicate: 'requires', object: 'healthspan' });
    assert.equal(r.verdict, VERDICT.PAIR_BURIED);
    assert.match(r.statement, /not a reason to stop/);
  });

  test('nothing found is reported as an absent record, not as novelty', () => {
    // "We have no record" and "this is new" are different statements, and only
    // one of them is true.
    const r = assessHypothesis(db, { projectId: P, subject: 'autophagy', predicate: 'promotes', object: 'healthspan' });
    assert.equal(r.verdict, VERDICT.NOVEL);
    assert.match(r.statement, /absence of a record, not evidence of novelty/);
  });

  test('similar wording is NOT matched', () => {
    // The deliberate limit. A text-similarity match would be right often enough
    // to be trusted and wrong invisibly, which is the worst combination
    // available for a mechanism that hides proposals.
    bury({ subject: null, predicate: null, object: null, statement: 'Telomerase activation extends healthspan in mice.' });
    const r = assessHypothesis(db, { projectId: P, statement: 'Telomerase activation extends healthspan in rodents.' });
    assert.equal(r.verdict, VERDICT.NOVEL);
  });

  test('one laboratory never sees another laboratory graves', () => {
    // The record is this laboratory's own history. That is exactly why it
    // compounds, and exactly why it must not leak.
    bury({ projectId: 'user:alice' });
    assert.equal(assessHypothesis(db, { projectId: 'user:alice', subject: 'telomerase', predicate: 'promotes', object: 'healthspan' }).verdict, VERDICT.BURIED);
    assert.equal(assessHypothesis(db, { projectId: 'user:bob', subject: 'telomerase', predicate: 'promotes', object: 'healthspan' }).verdict, VERDICT.NOVEL);
  });

  test('an exhumed grave stops suppressing', () => {
    const { grave } = bury();
    exhume(db, { id: grave.id, projectId: P, why: 'A cleaner knock-in line makes the original objection testable again.', actorId: actor, now: 2000 });
    assert.equal(assessHypothesis(db, { projectId: P, subject: 'telomerase', predicate: 'promotes', object: 'healthspan' }).verdict, VERDICT.NOVEL);
  });
});

describe('reopening a grave', () => {
  test('requires a reason and keeps the burial', () => {
    const { grave } = bury();
    const r = exhume(db, { id: grave.id, projectId: P, why: 'Single-cell readout now resolves the subpopulation the original missed.', actorId: actor, now: 2000 });
    assert.equal(r.ok, true);
    assert.equal(r.grave.exhumed_by, actor);
    assert.match(r.grave.exhumed_why, /single-cell readout/i);
    assert.equal(r.grave.cause, 'failed-replication', 'the original burial is still on the record');
    assert.equal(listGraves(db, P, { includeExhumed: true }).length, 1);
  });

  test('refuses an unexplained reopening', () => {
    const { grave } = bury();
    assert.match(exhume(db, { id: grave.id, projectId: P, why: 'why not', actorId: actor }).message, /what changed since it was buried/);
  });

  test('a grave marked not worth re-testing is not reopened casually', () => {
    const { grave } = bury({ resurrectable: false });
    const r = exhume(db, { id: grave.id, projectId: P, why: 'We would like to try it again anyway.', actorId: actor });
    assert.equal(r.ok, false);
    assert.match(r.message, /a burial decision to revisit deliberately/);
  });

  test("one laboratory cannot reopen another's grave", () => {
    const { grave } = bury({ projectId: 'user:alice' });
    assert.equal(exhume(db, { id: grave.id, projectId: 'user:bob', why: 'A long enough reason to pass validation.', actorId: actor }).ok, false);
  });
});

describe('what the laboratory has learned', () => {
  test('lists the lessons and counts the graves that have none', () => {
    // An unrecorded lesson is a gap worth showing to the person who could still
    // fill it, not something to hide from the summary.
    bury();
    bury({ subject: 'senolytics', object: 'lifespan', statement: 'B', lesson: '', cause: 'refuted', evidenceRef: 'doi:10.1000/b' });
    const r = lessons(db, P);
    assert.equal(r.total, 2);
    assert.equal(r.withLesson, 1);
    assert.equal(r.withoutLesson, 1);
    assert.deepEqual(r.byCause.map((c) => c.cause).sort(), ['failed-replication', 'refuted']);
    assert.match(r.lessons[0].lesson, /mixed background/);
  });

  test('every lesson carries what killed the hypothesis', () => {
    bury();
    assert.equal(lessons(db, P).lessons[0].evidenceRef, 'doi:10.1000/failed-repro');
  });
});
