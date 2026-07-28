import { canonicalHash } from '../provenance.mjs';
import { newId } from '../auth.mjs';

/**
 * L2 — the hypothesis graveyard. Necropolis for claims rather than molecules.
 *
 * `cognitive/necropolis.mjs` already remembers failed regions of MOLECULE
 * PARAMETER SPACE, where "near a known failure" is a distance and can be
 * measured. This is the other half: a refuted hypothesis, a claim that failed to
 * replicate, a mechanism retracted out from under a paper. It is deliberately a
 * separate module rather than a widened one, because the two answer the same
 * question with completely different evidence and merging them would force one
 * matching rule onto both.
 *
 * WHY THIS IS THE COMPOUNDING ASSET. Everything else in Genesis can be rebuilt
 * by a competitor with the same literature. A record of what THIS laboratory
 * already tried and buried cannot be — it is their own history, it grows every
 * month they use the platform, and its value to them rises as it grows. That is
 * also why it is strictly tenant-scoped and why there is no cross-tenant
 * exchange here, tempting as one would be.
 *
 * THE MATCHING RULE, AND WHAT IT REFUSES TO DO
 *
 * Matching is STRUCTURAL ONLY: exact subject/predicate/object, the reversed
 * direction, or some other claim about the same pair. There is no text
 * similarity and no embedding search, and that is not a gap to fill later.
 *
 * A false "you already tried this" suppresses a live hypothesis, and it does so
 * invisibly — the scientist never sees what was withheld, so the error cannot be
 * noticed, argued with, or corrected. A false "this is novel" merely wastes an
 * experiment the platform was going to suggest anyway. The two errors are not
 * symmetric, so the matching is not either.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hypothesis_graveyard (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  statement     TEXT NOT NULL,
  subject       TEXT,
  predicate     TEXT,
  object        TEXT,
  buried_at     INTEGER NOT NULL,
  buried_by     TEXT NOT NULL,
  cause         TEXT NOT NULL,
  -- What killed it. Mandatory: a hypothesis buried with no evidence is a
  -- prejudice, and it would go on suppressing proposals forever.
  evidence_ref  TEXT NOT NULL,
  -- The part humans actually reuse. Free text on purpose.
  lesson        TEXT NOT NULL DEFAULT '',
  -- Whether it is worth re-testing if the method improves. A grave that can
  -- never be reopened turns a limit of 2015 technique into a permanent fact.
  resurrectable INTEGER NOT NULL DEFAULT 1,
  exhumed_at    INTEGER,
  exhumed_by    TEXT,
  exhumed_why   TEXT,
  UNIQUE (project_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_graveyard_triple ON hypothesis_graveyard(project_id, subject, object, exhumed_at);
`;

/** Why a hypothesis died. Anything outside this list is not an audited reason. */
export const BURIAL_CAUSES = ['refuted', 'failed-replication', 'retracted', 'superseded'];

export const VERDICT = Object.freeze({
  BURIED: 'BURIED',
  OPPOSITE_BURIED: 'OPPOSITE_BURIED',
  PAIR_BURIED: 'PAIR_BURIED',
  NOVEL: 'NOVEL',
});

const OPPOSITES = { promotes: 'counteracts', counteracts: 'promotes' };

export function ensureGraveyardSchema(db) {
  db.exec(SCHEMA);
  return db;
}

/** Identity within a tenant: the claim, not when it was buried or by whom. */
export function graveContentHash({ subject, predicate, object, statement }) {
  return canonicalHash({
    subject: subject ? String(subject) : null,
    predicate: predicate ? String(predicate) : null,
    object: object ? String(object) : null,
    // Only used when the hypothesis is not expressible as a triple. Normalised
    // for whitespace and case, and NOT otherwise interpreted.
    statement: subject && object ? null : String(statement ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
  });
}

/**
 * Bury a hypothesis. Idempotent within a tenant: burying the same claim twice
 * returns the existing grave rather than accumulating duplicates that would each
 * have to be exhumed separately.
 */
export function buryHypothesis(db, input) {
  const {
    projectId, statement, subject = null, predicate = null, object = null,
    cause, evidenceRef, lesson = '', resurrectable = true,
    actorId, now = Date.now(),
  } = input ?? {};

  const errors = [];
  if (!projectId) errors.push('projectId is required — a graveyard belongs to one laboratory.');
  if (!statement || !String(statement).trim()) errors.push('statement is required: what was believed, in words a person can read later.');
  if (!BURIAL_CAUSES.includes(cause)) errors.push(`cause must be one of: ${BURIAL_CAUSES.join(', ')}.`);
  if (!evidenceRef || !String(evidenceRef).trim()) {
    errors.push('evidenceRef is required. A hypothesis buried with no evidence is a prejudice, and it would go on suppressing proposals forever.');
  }
  if (!actorId) errors.push('actorId is required.');
  if ((subject && !object) || (object && !subject)) {
    errors.push('subject and object must be given together, or not at all.');
  }
  if (errors.length) throw new Error(`buryHypothesis refused: ${errors.join(' ')}`);

  const contentHash = graveContentHash({ subject, predicate, object, statement });
  const existing = db.prepare('SELECT * FROM hypothesis_graveyard WHERE project_id = ? AND content_hash = ?')
    .get(String(projectId), contentHash);
  if (existing) return { grave: existing, created: false };

  const id = newId();
  db.prepare(`
    INSERT INTO hypothesis_graveyard
      (id, project_id, content_hash, statement, subject, predicate, object,
       buried_at, buried_by, cause, evidence_ref, lesson, resurrectable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(projectId), contentHash, String(statement), subject, predicate, object,
    Number(now), String(actorId), String(cause), String(evidenceRef), String(lesson),
    resurrectable ? 1 : 0);

  return { grave: db.prepare('SELECT * FROM hypothesis_graveyard WHERE id = ?').get(id), created: true };
}

/**
 * Has this been tried?
 *
 * Returns a verdict and the graves behind it, never a bare boolean — the caller
 * has to be able to show a scientist WHY a proposal was held back, and a
 * scientist has to be able to disagree.
 *
 * The verdicts are graded because they mean different things:
 *
 *   BURIED           this exact claim was buried here
 *   OPPOSITE_BURIED  the reverse direction was buried — relevant, and NOT the
 *                    same thing: "X does not promote Y" being refuted says
 *                    nothing about whether X counteracts Y
 *   PAIR_BURIED      something else about this pair was buried; weakest signal
 *   NOVEL            nothing recorded, which is not evidence that it is new
 */
export function assessHypothesis(db, { projectId, subject = null, predicate = null, object = null, statement = null }) {
  const project = String(projectId);
  const exact = db.prepare('SELECT * FROM hypothesis_graveyard WHERE project_id = ? AND content_hash = ? AND exhumed_at IS NULL')
    .get(project, graveContentHash({ subject, predicate, object, statement }));
  if (exact) {
    return {
      verdict: VERDICT.BURIED, graves: [exact],
      statement: `This laboratory buried this exact hypothesis (${exact.cause}). ${exact.lesson || 'No lesson was recorded.'}`
        + (exact.resurrectable ? ' It was marked worth re-testing if the method improves.' : ' It was marked not worth re-testing.'),
    };
  }

  if (!subject || !object) {
    return { verdict: VERDICT.NOVEL, graves: [], statement: 'Nothing matching was found. That is an absence of a record, not evidence of novelty.' };
  }

  const pair = db.prepare(
    'SELECT * FROM hypothesis_graveyard WHERE project_id = ? AND subject = ? AND object = ? AND exhumed_at IS NULL ORDER BY buried_at DESC',
  ).all(project, String(subject), String(object));
  if (pair.length === 0) {
    return { verdict: VERDICT.NOVEL, graves: [], statement: 'Nothing matching was found. That is an absence of a record, not evidence of novelty.' };
  }

  const opposite = predicate ? pair.filter((g) => g.predicate === OPPOSITES[predicate]) : [];
  if (opposite.length > 0) {
    return {
      verdict: VERDICT.OPPOSITE_BURIED, graves: opposite,
      statement: `The OPPOSITE direction was buried here (${opposite[0].cause}). That is relevant but not the same claim — `
        + 'refuting one direction says nothing about the other, and treating it as settled would suppress a live hypothesis.',
    };
  }

  return {
    verdict: VERDICT.PAIR_BURIED, graves: pair,
    statement: `${pair.length} other hypothesis(es) about this pair were buried here. The weakest of the signals: worth reading before designing an experiment, not a reason to stop.`,
  };
}

/**
 * Reopen a grave. Requires a reason, because the whole value of the record is
 * that entries are not removed casually.
 *
 * Exhuming does not delete: the burial and the reason for reopening both stay,
 * so a reader can see that the laboratory changed its mind and why.
 */
export function exhume(db, { id, projectId, why, actorId, now = Date.now() }) {
  if (!why || String(why).trim().length < 10) {
    return { ok: false, error: 'invalid_input', message: 'Reopening a grave requires a reason — what changed since it was buried.' };
  }
  const grave = db.prepare('SELECT * FROM hypothesis_graveyard WHERE id = ? AND project_id = ? AND exhumed_at IS NULL')
    .get(String(id), String(projectId));
  if (!grave) return { ok: false, error: 'not_found', message: 'No buried hypothesis with that id in this workspace.' };
  if (!grave.resurrectable) {
    return {
      ok: false, error: 'not_resurrectable',
      message: 'This hypothesis was buried as not worth re-testing. Overturning that is a burial decision to revisit deliberately, not an exhumation.',
    };
  }

  db.prepare('UPDATE hypothesis_graveyard SET exhumed_at = ?, exhumed_by = ?, exhumed_why = ? WHERE id = ?')
    .run(Number(now), String(actorId), String(why), String(id));
  return { ok: true, grave: db.prepare('SELECT * FROM hypothesis_graveyard WHERE id = ?').get(String(id)) };
}

export function listGraves(db, projectId, { includeExhumed = false, limit = 200 } = {}) {
  const sql = includeExhumed
    ? 'SELECT * FROM hypothesis_graveyard WHERE project_id = ? ORDER BY buried_at DESC LIMIT ?'
    : 'SELECT * FROM hypothesis_graveyard WHERE project_id = ? AND exhumed_at IS NULL ORDER BY buried_at DESC LIMIT ?';
  return db.prepare(sql).all(String(projectId), Number(limit));
}

/**
 * What this laboratory has learned from failing, as a readable list.
 *
 * The lessons are the reason anyone would keep the record. Graves with no lesson
 * are counted separately rather than hidden, because an unrecorded lesson is a
 * gap worth showing to the person who could still fill it.
 */
export function lessons(db, projectId) {
  const graves = listGraves(db, projectId, { limit: 1000 });
  const withLesson = graves.filter((g) => g.lesson && g.lesson.trim());
  return {
    total: graves.length,
    withLesson: withLesson.length,
    withoutLesson: graves.length - withLesson.length,
    byCause: BURIAL_CAUSES.map((cause) => ({ cause, n: graves.filter((g) => g.cause === cause).length }))
      .filter((r) => r.n > 0),
    lessons: withLesson.map((g) => ({
      id: g.id, statement: g.statement, cause: g.cause, lesson: g.lesson,
      evidenceRef: g.evidence_ref, buriedAt: g.buried_at, resurrectable: Boolean(g.resurrectable),
    })),
  };
}
