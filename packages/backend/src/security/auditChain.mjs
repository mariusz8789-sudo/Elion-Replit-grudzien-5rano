/**
 * D-084 — tamper-evident audit chain.
 *
 * ===================== THE BUG THIS EXISTS TO NOT HAVE ====================
 *
 * The reviewed candidate package shipped a hash-chained audit log whose
 * canonicalizer was:
 *
 *   const canon = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());
 *
 * The second argument of `JSON.stringify` is a REPLACER ARRAY, not a key
 * order. It filters keys, and it applies the SAME top-level key list to every
 * nested object. So for an entry `{ type, payload, actor, seq }` the allowed
 * keys are ["actor","payload","seq","type"], and the nested `payload.u` is not
 * among them — every payload serialized as `{}`.
 *
 * MEASURED, not read: appending {u:'x'} and then mutating the stored entry to
 * {u:'tampered'} left `verify()` returning ok:true. The package's own test
 * asserted the tamper WOULD be caught, so that test fails against its own
 * code. An audit log whose chain does not cover the payload is worse than no
 * audit log, because it is believed.
 *
 * Here the chain covers the WHOLE record through `canonicalHash`, the
 * repository's existing recursive key-sorting sha256 (provenance.mjs). No new
 * crypto, no second canonicalizer that could drift from the first.
 *
 * ============================ FAIL-CLOSED ENUM ===========================
 *
 * verifyChain returns the FIRST breach it finds, never a boolean alone:
 *   CHAIN_EMPTY        nothing to verify — not evidence of integrity
 *   CHAIN_ROOT_INVALID entry 0 does not start from the genesis marker
 *   CHAIN_BREAK_AT_n   entry n's recorded prev is not entry n-1's hash
 *   CHAIN_TAMPERED_AT_n entry n's content no longer hashes to its own hash
 *   CHAIN_SEQ_GAP_AT_n  sequence numbers are not contiguous (a deletion)
 */

import { canonicalHash } from '../provenance.mjs';

export const CHAIN_GENESIS = 'genesis';

/** Every security-relevant event this repository knows how to emit. */
export const SECURITY_EVENTS = Object.freeze([
  'AUTH_FAIL', 'PERMISSION_DENY', 'TENANT_CROSS_ACCESS', 'RATE_LIMITED',
  'EGRESS_BLOCKED', 'UPLOAD_REJECTED', 'PATH_ESCAPE', 'TOOL_NOT_GRANTED',
  'PIN_DRIFT', 'PIN_MISSING', 'GATE_TAMPERED', 'WINNER_FABRICATION_ATTEMPT',
  'HARK_MISMATCH', 'ENDPOINT_FAMILY_MIXING', 'CROSS_SOURCE_DUPLICATE',
  'SUPPLYCHAIN_DRIFT', 'SECRET_FOUND',
]);

/** The exact bytes the chain commits to. Everything an auditor would care about is inside. */
function entryDigest(prevHash, record) {
  return canonicalHash({
    prev: prevHash,
    seq: record.seq,
    event: record.event,
    actor: record.actor,
    payload: record.payload ?? null,
    at: record.at,
  });
}

/**
 * Appends one record, returning a NEW frozen array. The caller keeps the
 * chain; nothing here mutates what it was handed, so a caller cannot acquire
 * a half-updated chain if it throws.
 */
export function chainAppend(chain, { event, actor, payload = null, at }) {
  if (!SECURITY_EVENTS.includes(event)) throw new Error(`FAIL_CLOSED[UNKNOWN_SECURITY_EVENT]: ${event}`);
  if (typeof at !== 'number' || !Number.isFinite(at)) throw new Error('FAIL_CLOSED[AUDIT_TIMESTAMP_REQUIRED]: the caller supplies the clock so the chain stays replayable');
  const prev = chain.length ? chain[chain.length - 1].hash : CHAIN_GENESIS;
  const record = { seq: chain.length, event, actor: String(actor ?? 'unknown'), payload, at, prev };
  const entry = Object.freeze({ ...record, hash: entryDigest(prev, record) });
  return Object.freeze([...chain, entry]);
}

/** Recomputes the whole chain. Returns the first breach, with its code, or ok. */
export function verifyChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return Object.freeze({ ok: false, code: 'CHAIN_EMPTY', reason: 'an empty chain proves nothing was recorded, which is not the same as nothing having happened' });
  }
  let prev = CHAIN_GENESIS;
  for (let i = 0; i < chain.length; i += 1) {
    const e = chain[i];
    if (e.seq !== i) return Object.freeze({ ok: false, code: `CHAIN_SEQ_GAP_AT_${i}`, reason: `entry at index ${i} carries seq ${e.seq}; a gap means a record was removed` });
    if (e.prev !== prev) return Object.freeze({ ok: false, code: i === 0 ? 'CHAIN_ROOT_INVALID' : `CHAIN_BREAK_AT_${i}`, reason: `entry ${i} links to ${e.prev} but the previous hash is ${prev}` });
    if (e.hash !== entryDigest(prev, e)) return Object.freeze({ ok: false, code: `CHAIN_TAMPERED_AT_${i}`, reason: `entry ${i} no longer hashes to its recorded digest — its content changed after it was written` });
    prev = e.hash;
  }
  return Object.freeze({ ok: true, length: chain.length, head: prev });
}

/**
 * Chain head for a set of access_audit rows already persisted by
 * `access.mjs::appendAccessAudit`. This DERIVES a chain over existing rows
 * rather than introducing a second audit table: the repository already has
 * one audit store, and a parallel one would be two sources of truth about
 * what happened.
 */
export function chainOverAuditRows(rows, { at = (r) => r.createdAt } = {}) {
  let chain = Object.freeze([]);
  for (const r of [...rows].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))) {
    chain = chainAppend(chain, {
      event: SECURITY_EVENTS.includes(r.action) ? r.action : 'PERMISSION_DENY',
      actor: r.userId ?? 'system',
      payload: { action: r.action, accessLevel: r.accessLevel, workflow: r.workflow, runId: r.runId, resultStatus: r.resultStatus },
      at: at(r),
    });
  }
  return chain;
}

/* ------------------------------------------------------------------------ */
/* D-086 — DURABLE CHAIN                                                     */
/*                                                                           */
/* An in-memory chain dies with the process, and a tamper-evident log that   */
/* does not survive a restart cannot evidence anything about yesterday. This */
/* appends one JSON object per line (JSONL) so a partial write damages one   */
/* record rather than the file, and so appending never rewrites history.     */
/*                                                                           */
/* THE START IS FAIL-CLOSED. `loadChain` verifies before returning, and      */
/* `openDurableChain` REFUSES to start on a broken chain. Continuing to      */
/* append onto a log that was edited would produce a file whose later        */
/* entries verify perfectly and whose earlier ones are a lie — the worst of  */
/* both, because it looks verified.                                          */
/* ------------------------------------------------------------------------ */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';

/** Reads a JSONL chain from disk and verifies it. Never returns an unverified chain. */
export function loadChain(filePath) {
  if (!existsSync(filePath)) return Object.freeze({ ok: true, chain: Object.freeze([]), fresh: true });
  let lines;
  try {
    lines = readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim() !== '');
  } catch {
    return Object.freeze({ ok: false, code: 'AUDIT_UNREADABLE', chain: Object.freeze([]), reason: `${filePath} could not be read` });
  }
  const chain = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      chain.push(Object.freeze(JSON.parse(lines[i])));
    } catch {
      return Object.freeze({ ok: false, code: `AUDIT_MALFORMED_AT_${i}`, chain: Object.freeze([]), reason: `line ${i + 1} of ${filePath} is not valid JSON; a damaged record is not a missing record` });
    }
  }
  const v = verifyChain(chain);
  if (!v.ok && !(chain.length === 0 && v.code === 'CHAIN_EMPTY')) {
    return Object.freeze({ ok: false, code: v.code, chain: Object.freeze([]), reason: v.reason });
  }
  return Object.freeze({ ok: true, chain: Object.freeze(chain), fresh: chain.length === 0 });
}

/**
 * Opens a durable chain, refusing to start if what is on disk does not verify.
 * Returns an appender that writes through to the file on every record.
 */
export function openDurableChain(filePath) {
  const loaded = loadChain(filePath);
  if (!loaded.ok) {
    throw new Error(`FAIL_CLOSED[AUDIT_CHAIN_BROKEN]: ${loaded.code} — ${loaded.reason}. Refusing to append onto a log whose history cannot be trusted.`);
  }
  let chain = loaded.chain;
  return Object.freeze({
    get chain() { return chain; },
    append(record) {
      const next = chainAppend(chain, record);
      appendFileSync(filePath, `${JSON.stringify(next[next.length - 1])}\n`);
      chain = next;
      return next[next.length - 1];
    },
    verify() { return verifyChain(chain); },
  });
}
