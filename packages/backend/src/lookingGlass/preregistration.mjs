import { createHash } from 'node:crypto';

/**
 * Looking Glass — benchmark pre-registration.
 *
 * WHAT THIS DEFENDS AGAINST. The retrospective benchmark's result is a count of
 * targets that beat their controls. If the target list can be edited after
 * seeing the output — one target quietly dropped, one added — the count means
 * nothing, and no reader can tell from the report that it happened. This is not
 * a hypothetical failure mode; it is the ordinary way benchmarks in this space
 * become marketing.
 *
 * `runBenchmark` already required a `preregistrationRef`, but a string is a
 * promise, not a control. This module turns it into one: the target list is
 * fingerprinted, and a run whose targets do not match the registered fingerprint
 * is refused rather than annotated.
 *
 * WHAT IT CANNOT DO, STATED PLAINLY. It cannot prove the file was written before
 * the corpus was built. `registeredAt` is a self-reported timestamp and can be
 * backdated by whoever writes the file. The check below compares it against the
 * corpus's own ingest timestamps, which catches carelessness and honest mistakes
 * but not deliberate fraud. Only an external anchor — a git commit in a public
 * repository, or a timestamping authority — makes the claim unforgeable, and the
 * published report should cite that commit rather than this field.
 */

/**
 * A pre-registration document.
 * @typedef {{ cutoffYear: number, registeredAt: number, targets: object[],
 *             parameters?: object, note?: string }} Preregistration
 */

/** The fields that define a target. Anything else is commentary and is ignored. */
function canonicalTarget(target) {
  return {
    aUi: String(target.aUi ?? ''),
    cUi: String(target.cUi ?? ''),
    publishedYear: target.publishedYear ?? null,
    expectedBridgeUis: [...(target.expectedBridgeUis ?? target.bridgeUis ?? [])].map(String).sort(),
    // Included deliberately: a target renamed after the fact is a different
    // claim, even when the concept pair is identical.
    name: String(target.name ?? ''),
  };
}

/**
 * A fingerprint of the target SET.
 *
 * Order-independent, because the order targets are listed in carries no meaning
 * and making it significant would produce false alarms that train people to
 * ignore the check.
 */
export function fingerprintTargets(targets) {
  const canonical = (targets ?? []).map(canonicalTarget)
    .sort((a, b) => (a.aUi + a.cUi + a.name).localeCompare(b.aUi + b.cUi + b.name));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Read a pre-registration document. Refuses anything it cannot fully validate —
 * a half-understood pre-registration is worse than none, because it still looks
 * like a control.
 */
export function parsePreregistration(text, { ref = null } = {}) {
  let doc;
  try {
    doc = JSON.parse(String(text));
  } catch (err) {
    throw new Error(`parsePreregistration: not valid JSON (${err.message}).`, { cause: err });
  }
  if (!Number.isInteger(doc.cutoffYear)) {
    throw new Error('parsePreregistration: cutoffYear must be an integer year.');
  }
  if (!Number.isFinite(doc.registeredAt)) {
    throw new Error('parsePreregistration: registeredAt must be a millisecond timestamp.');
  }
  if (!Array.isArray(doc.targets) || doc.targets.length === 0) {
    throw new Error('parsePreregistration: targets must be a non-empty array. An empty pre-registration registers nothing.');
  }
  for (const [i, t] of doc.targets.entries()) {
    if (!t?.aUi || !t?.cUi || !t?.name) {
      throw new Error(`parsePreregistration: target ${i} is missing name, aUi or cUi.`);
    }
  }
  return {
    ref: ref ?? doc.ref ?? null,
    cutoffYear: doc.cutoffYear,
    registeredAt: doc.registeredAt,
    targets: doc.targets,
    parameters: doc.parameters ?? {},
    note: doc.note ?? null,
    // The document as delivered, so a reader can hash the file themselves.
    sha256: createHash('sha256').update(String(text)).digest('hex'),
    fingerprint: fingerprintTargets(doc.targets),
  };
}

/**
 * Earliest moment any article entered the corpus.
 *
 * Used to check that the pre-registration predates the corpus. Returns null for
 * an empty corpus, where the question does not arise.
 */
export function earliestIngest(db) {
  const row = db.prepare('SELECT MIN(ingested_at) AS t FROM lg_articles').get();
  return row?.t ?? null;
}

/**
 * Check a run against its pre-registration. Throws on any mismatch.
 *
 * Returns the statement that belongs in the published report — including, when
 * the ordering check cannot be trusted, the reason it cannot.
 */
export function verifyPreregistration(db, prereg, { targets, cutoffYear }) {
  if (prereg.cutoffYear !== Number(cutoffYear)) {
    throw new Error(
      `verifyPreregistration: the run uses cut-off ${cutoffYear} but the pre-registration fixed ${prereg.cutoffYear}. `
      + 'Moving the cut-off after the fact changes which discoveries are held out.',
    );
  }

  const actual = fingerprintTargets(targets);
  if (actual !== prereg.fingerprint) {
    const registered = new Set(prereg.targets.map((t) => `${t.aUi}→${t.cUi}`));
    const running = new Set((targets ?? []).map((t) => `${t.aUi}→${t.cUi}`));
    const added = [...running].filter((k) => !registered.has(k));
    const removed = [...registered].filter((k) => !running.has(k));
    throw new Error(
      'verifyPreregistration: the target list does not match the pre-registration.'
      + (added.length ? ` Added: ${added.join(', ')}.` : '')
      + (removed.length ? ` Removed: ${removed.join(', ')}.` : '')
      + (!added.length && !removed.length ? ' The pairs are the same but a name, publication year or expected bridge differs.' : '')
      + ' Run the registered list, or register the new one and label the result post-hoc.',
    );
  }

  const firstIngest = earliestIngest(db);
  const orderingOk = firstIngest === null || prereg.registeredAt <= firstIngest;

  return {
    ref: prereg.ref,
    sha256: prereg.sha256,
    fingerprint: prereg.fingerprint,
    targets: prereg.targets.length,
    registeredAt: prereg.registeredAt,
    orderingOk,
    statement: orderingOk
      ? `Pre-registered ${prereg.targets.length} target(s); document sha256 ${prereg.sha256.slice(0, 12)}…, target-set fingerprint `
        + `${prereg.fingerprint.slice(0, 12)}…. The document's self-reported timestamp precedes the first ingest, which is `
        + 'consistent with pre-registration but does not prove it — cite the git commit that introduced the file.'
      : `WARNING: the pre-registration reports being written at ${new Date(prereg.registeredAt).toISOString()}, AFTER the corpus `
        + `began ingesting at ${new Date(firstIngest).toISOString()}. The target list may have been chosen with the corpus in `
        + 'hand. This result must be labelled post-hoc.',
  };
}
