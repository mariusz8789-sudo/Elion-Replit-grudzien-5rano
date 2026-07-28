import { getArtifact, listArtifacts, currentSnapshot } from './store.mjs';
import { runAndRecord } from './discoveryEngine.mjs';

/**
 * L4 — replay and diff.
 *
 * The question this answers is the one no competitor can retrofit:
 *
 *   "This is what Genesis concluded in March. Here is the same question today.
 *    Here is exactly what changed, and why."
 *
 * It is cheap to build here and impossible to add later, because it requires
 * append-only history from the first write — snapshots that supersede rather
 * than replace, evidence that retires rather than deletes, beliefs that revise
 * rather than update, and a replay key that excludes the clock. All four
 * decisions were made in Phases 0–2 and each one cost something at the time.
 *
 * THE DISTINCTION THAT MATTERS, and the reason the diff is not just a text
 * comparison:
 *
 *   SAME inputs_hash, different body  → THE REASONING CHANGED. Either an
 *       improvement or a regression, and always worth knowing about, because
 *       nothing about the world moved.
 *   DIFFERENT inputs_hash             → THE WORLD CHANGED. New evidence, a
 *       re-curated graph, a filed review. The answer is allowed to differ.
 *
 * Conflating those two would let a silent engine regression look like scientific
 * progress.
 */

/** Set difference that keeps order and is readable in a report. */
const missing = (a, b) => a.filter((x) => !b.includes(x));

function statements(artifact) {
  return (artifact?.body?.hypotheses ?? []).map((h) => h.statement);
}

/**
 * Compare two artifacts answering the same question.
 *
 * Refuses to compare artifacts of different kinds or different questions — a
 * diff between unrelated answers would produce a confident list of differences
 * that means nothing.
 */
export function diffArtifacts(db, projectId, beforeId, afterId) {
  const before = getArtifact(db, beforeId, projectId);
  const after = getArtifact(db, afterId, projectId);
  if (!before || !after) {
    return { ok: false, error: 'not_found', message: 'Both artifacts must exist in this workspace.' };
  }
  if (before.kind !== after.kind) {
    return { ok: false, error: 'incomparable', message: `Cannot diff a ${before.kind} artifact against a ${after.kind} one.` };
  }
  if (before.question !== after.question) {
    return {
      ok: false, error: 'incomparable',
      message: 'These artifacts answer different questions. A diff between them would list differences that mean nothing.',
    };
  }
  if (before.created_at > after.created_at) {
    return { ok: false, error: 'incomparable', message: 'The "before" artifact is newer than the "after" one. Order them.' };
  }

  const sameInputs = before.inputs_hash === after.inputs_hash;
  const bodyChanged = JSON.stringify(before.body) !== JSON.stringify(after.body);

  const beforeStatements = statements(before);
  const afterStatements = statements(after);
  const beforeRefusals = before.refusals ?? [];
  const afterRefusals = after.refusals ?? [];

  const resolvedRefusals = missing(beforeRefusals, afterRefusals);
  const newRefusals = missing(afterRefusals, beforeRefusals);

  return {
    ok: true,
    question: before.question,
    before: { id: before.id, at: before.created_at, snapshot: before.snapshot_id, inputsHash: before.inputs_hash },
    after: { id: after.id, at: after.created_at, snapshot: after.snapshot_id, inputsHash: after.inputs_hash },

    // The classification, stated first because everything else reads
    // differently depending on it.
    kind: sameInputs
      ? (bodyChanged ? 'reasoning-changed' : 'unchanged')
      : 'inputs-changed',
    interpretation: sameInputs
      ? (bodyChanged
        ? 'The inputs are identical and the answer is not. Nothing about the world moved, so this is a change in Genesis itself — '
          + 'an improvement or a regression, and it must be explained before the newer answer is trusted.'
        : 'Nothing changed. The same question over the same inputs produced the same answer, which is what reproducibility looks like.')
      : 'The inputs changed — new evidence, a re-curated graph, or a filed review — so the answer is allowed to differ. '
        + 'The specific changes are listed below.',

    graphRecurated: before.snapshot_id !== after.snapshot_id,

    hypotheses: {
      added: missing(afterStatements, beforeStatements),
      removed: missing(beforeStatements, afterStatements),
      unchanged: afterStatements.filter((s) => beforeStatements.includes(s)).length,
    },

    // A refusal that DISAPPEARED is the most interesting line in any diff: the
    // platform previously declined to say something and now will. It is listed
    // first for that reason.
    refusals: {
      resolved: resolvedRefusals,
      added: newRefusals,
      note: resolvedRefusals.length
        ? 'Genesis previously declined to answer part of this and no longer does. Check WHY before treating the new answer as stronger.'
        : null,
    },

    uncertainty: {
      coverage: {
        before: before.uncertainty?.coverage ?? null,
        after: after.uncertainty?.coverage ?? null,
        delta: Number(((after.uncertainty?.coverage ?? 0) - (before.uncertainty?.coverage ?? 0)).toFixed(4)),
      },
      belief: {
        before: before.uncertainty?.belief ?? null,
        after: after.uncertainty?.belief ?? null,
        delta: Number(((after.uncertainty?.belief ?? 0) - (before.uncertainty?.belief ?? 0)).toFixed(4)),
      },
      // Kept apart on purpose, one last time: reading more papers and becoming
      // more confident are different events, and a single "uncertainty went
      // down" number would hide which one happened.
      note: 'Coverage and belief move for different reasons and are never summed.',
    },

    review: {
      before: before.provenance?.review ?? null,
      after: after.provenance?.review ?? null,
    },
    evidence: {
      before: (before.provenance?.evidenceIds ?? []).length,
      after: (after.provenance?.evidenceIds ?? []).length,
      added: missing(after.provenance?.evidenceIds ?? [], before.provenance?.evidenceIds ?? []).length,
    },
  };
}

/**
 * Re-run a stored question against the world as it stands now, and diff.
 *
 * The original artifact is never touched. Replay produces a NEW artifact and a
 * comparison — rewriting the old one would destroy the only evidence that
 * Genesis once thought something else, which is the entire point.
 */
export function replayArtifact(db, { artifactId, projectId, createdBy, now = Date.now() }) {
  const original = getArtifact(db, artifactId, projectId);
  if (!original) return { ok: false, error: 'not_found', message: 'No such artifact in this workspace.' };
  if (original.kind !== 'discovery') {
    return { ok: false, error: 'not_replayable', message: `Only discovery artifacts can be replayed; this one is "${original.kind}".` };
  }
  if (!currentSnapshot(db)) {
    return { ok: false, error: 'no_graph', message: 'No graph snapshot to replay against.' };
  }

  const replayed = runAndRecord(db, {
    projectId, question: original.question,
    focus: original.provenance?.focusNodes?.[0] ?? null,
    createdBy, now,
  });
  return { ok: true, original, replayed, diff: diffArtifacts(db, projectId, original.id, replayed.id) };
}

/**
 * Every answer this workspace has given to the same question, oldest first,
 * with the diff between each consecutive pair.
 *
 * This is the shape a reader actually wants: not "here are six artifacts" but
 * "here is how the answer moved, and what moved it".
 */
export function answerHistory(db, projectId, question) {
  const all = listArtifacts(db, projectId, { kind: 'discovery', limit: 200 })
    .filter((a) => a.question === question)
    .sort((a, b) => a.created_at - b.created_at);

  const transitions = [];
  for (let i = 1; i < all.length; i += 1) {
    const diff = diffArtifacts(db, projectId, all[i - 1].id, all[i].id);
    if (diff.ok) transitions.push(diff);
  }
  return {
    question,
    answers: all.map((a) => ({
      id: a.id, at: a.created_at, snapshot: a.snapshot_id, inputsHash: a.inputs_hash,
      hypotheses: (a.body?.hypotheses ?? []).length, refusals: (a.refusals ?? []).length,
      coverage: a.uncertainty?.coverage ?? null, belief: a.uncertainty?.belief ?? null,
    })),
    transitions,
  };
}
