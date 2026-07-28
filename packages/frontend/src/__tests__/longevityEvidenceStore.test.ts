import { describe, expect, it } from 'vitest';
import { resolveLoad, resolveAdd, toRecord } from '../core/longevityEvidence';
import type { StoredEvidence } from '../core/backend/client';
import type { EvidenceRecord } from '@genesis-os/reasoning/evidence';

/**
 * The evidence store's honesty contract.
 *
 * These records are what a scientist spent an afternoon entering. Two failures
 * are unacceptable and neither is caught by a type check:
 *
 *   - losing a record because a write failed;
 *   - reporting a record as saved when it is not.
 *
 * The second is worse: someone who believes their evidence is on the server
 * closes the tab. Every case below asserts both halves — the record survives,
 * AND `persisted` tells the truth about it.
 */

function row(over: Partial<StoredEvidence> = {}): StoredEvidence {
  return {
    id: 'ev-1', project_id: 'user:u1', edge_key: null, intervention: 'senolytics',
    hallmark: 'cellular-senescence', citation: 'doi:10.1000/x', tier: 'rodent', outcome: 'lifespan',
    direction: 'beneficial', species: 'C57BL/6 mouse', sample_size: 40, effect_size: null, notes: '',
    strength: 42, human_relevance: 17, graded_with: 'genesis-evidence-grading/2',
    provenance: 'a'.repeat(64), created_at: 1000, created_by: 'u1', retired_at: null, ...over,
  };
}

const draft = { id: 'draft-local', citation: 'doi:10.1000/typed-by-hand' } as unknown as EvidenceRecord;
const offline = { ok: false, status: 0, error: 'offline', message: 'Brak połączenia z backendem.' } as const;

describe('loading', () => {
  it('signed out: nothing loaded, nothing claimed, no error', () => {
    expect(resolveLoad(null)).toEqual({ records: [], persisted: false, error: null });
  });

  it('signed in: the server list becomes the truth', () => {
    const state = resolveLoad({ ok: true, data: [row(), row({ id: 'ev-2' })] });
    expect(state.records).toHaveLength(2);
    expect(state.persisted).toBe(true);
    expect(state.error).toBeNull();
  });

  it('an unreachable server must not look like an empty account', () => {
    // Returning [] with no message would tell a scientist their evidence is
    // gone. It is a different and much more alarming statement than "offline".
    const state = resolveLoad(offline);
    expect(state.persisted).toBe(false);
    expect(state.error).toMatch(/could not be loaded/i);
    expect(state.error).toMatch(/will not be saved/i);
  });
});

describe('adding', () => {
  it('signed out: the record is kept and not reported as saved', () => {
    const r = resolveAdd(draft, null);
    expect(r.record).toBe(draft);
    expect(r.persisted).toBe(false);
    expect(r.error).toBeNull(); // expected state, not a failure
  });

  it("signed in: the server's row replaces the draft", () => {
    // The browser computed a grade for immediate display; only the stored one
    // carries a graded_with version, so only the stored one is kept.
    const r = resolveAdd(draft, { ok: true, data: { evidence: row({ id: 'server-assigned' }) } });
    expect(r.record.id).toBe('server-assigned');
    expect(r.persisted).toBe(true);
  });

  it('a rejected write keeps the draft and says it is unsaved', () => {
    const r = resolveAdd(draft, offline);
    expect(r.record).toBe(draft);
    expect(r.persisted).toBe(false);
    expect(r.error).toBe('Brak połączenia z backendem.');
  });

  it('a failure with no message still produces one', () => {
    // A silent failure is the same as a lie here.
    const r = resolveAdd(draft, { ok: false, status: 500, error: 'internal', message: '' });
    expect(r.persisted).toBe(false);
    expect(r.error).toMatch(/only in this tab/i);
  });
});

describe('row mapping', () => {
  it('carries identity, citation and sample size across unchanged', () => {
    const mapped = toRecord(row());
    expect(mapped.id).toBe('ev-1');
    expect(mapped.citation).toBe('doi:10.1000/x');
    expect(mapped.interventionId).toBe('senolytics');
    expect(mapped.sampleSize).toBe(40);
  });

  it('a null species does not become the string "null"', () => {
    expect(toRecord(row({ species: null })).system).toBe('');
  });
});
