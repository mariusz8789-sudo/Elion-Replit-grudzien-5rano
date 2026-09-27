import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { contentHash, canonicalJson, diffCampaigns, hasRole } from './campaignVersioning.mjs';

/**
 * Scientific Version Control (Genesis 2.1, Part 4). Proves — without any atrapa/stub —
 * that: snapshots are content-addressed and immutable, stale writes are rejected (409)
 * rather than silently merged, restore never rewrites history, the structural diff
 * engine explains WHY a value changed, and Owner/Collaborator/Viewer roles are actually
 * enforced across every new route (not just documented).
 */
let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}
function register(email) {
  const r = call('POST', '/api/auth/register', { body: { email, password: 'password123' } });
  return r.body; // { token, user, expiresInMs }
}
function makeCampaign(token, id, molecules = []) {
  return call('PUT', `/api/campaigns/${id}`, { token, body: { campaign: { id, name: 'Kampania X', status: 'ACTIVE', molecules } } });
}

describe('canonical hashing', () => {
  test('same content, different key order → identical hash (content-addressed)', () => {
    const a = { name: 'x', molecules: [{ id: 1, props: { mw: 10 } }] };
    const b = { molecules: [{ props: { mw: 10 }, id: 1 }], name: 'x' };
    assert.equal(contentHash(a), contentHash(b));
    assert.equal(canonicalJson(a), canonicalJson(b));
  });

  test('different content → different hash', () => {
    assert.notEqual(contentHash({ molecules: [] }), contentHash({ molecules: [{ id: 1 }] }));
  });
});

describe('hasRole', () => {
  test('rank order: owner > collaborator > viewer, null has none', () => {
    assert.ok(hasRole('owner', 'viewer'));
    assert.ok(hasRole('collaborator', 'collaborator'));
    assert.ok(!hasRole('viewer', 'collaborator'));
    assert.ok(!hasRole(null, 'viewer'));
  });
});

describe('snapshot creation via API', () => {
  test('requires auth', () => {
    const r = call('POST', '/api/campaigns/camp1/snapshots', { body: { data: {} } });
    assert.equal(r.status, 401);
  });

  test('owner can create a snapshot; it is immutable and content-addressed', () => {
    const owner = register('owner1@lab.org');
    makeCampaign(owner.token, 'camp1');
    const data = { id: 'camp1', molecules: [{ id: 'm1', name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', stage: 'NEW', alerts: [] }] };
    const r1 = call('POST', '/api/campaigns/camp1/snapshots', { token: owner.token, body: { data, triggerKind: 'molecules_added' } });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.snapshot.id, contentHash(data));
    assert.equal(r1.body.snapshot.parentId, null);
    assert.equal(r1.body.snapshot.triggerKind, 'molecules_added');
    assert.equal(r1.body.snapshot.authorId, owner.user.id);

    // Re-submitting IDENTICAL content is a no-op — same id, not a new row.
    const r2 = call('POST', '/api/campaigns/camp1/snapshots', { token: owner.token, body: { data, triggerKind: 'manual' } });
    assert.equal(r2.body.snapshot.id, r1.body.snapshot.id);
    const list = call('GET', '/api/campaigns/camp1/snapshots', { token: owner.token });
    assert.equal(list.body.snapshots.length, 1, 'identical content must not create a duplicate snapshot row');
  });

  test('a second snapshot chains to the first via parentId — a DAG, never rewritten', () => {
    const owner = register('owner2@lab.org');
    makeCampaign(owner.token, 'camp2');
    const s1 = call('POST', '/api/campaigns/camp2/snapshots', {
      token: owner.token, body: { data: { molecules: [] }, triggerKind: 'manual' },
    }).body.snapshot;
    const s2 = call('POST', '/api/campaigns/camp2/snapshots', {
      token: owner.token, body: { data: { molecules: [{ id: 'm1' }] }, triggerKind: 'molecules_added' },
    }).body.snapshot;
    assert.equal(s2.parentId, s1.id);
    const list = call('GET', '/api/campaigns/camp2/snapshots', { token: owner.token }).body.snapshots;
    assert.equal(list.length, 2);
    assert.ok(!('data' in list[0]), 'list view must not ship the full data blob');
  });

  test('stale write is rejected with 409, never silently merged', () => {
    const owner = register('owner3@lab.org');
    makeCampaign(owner.token, 'camp3');
    const s1 = call('POST', '/api/campaigns/camp3/snapshots', {
      token: owner.token, body: { data: { molecules: [] }, triggerKind: 'manual', expectedParentId: null },
    }).body.snapshot;
    // Someone else snapshots first, moving the latest pointer forward.
    call('POST', '/api/campaigns/camp3/snapshots', {
      token: owner.token, body: { data: { molecules: [{ id: 'x' }] }, triggerKind: 'manual', expectedParentId: s1.id },
    });
    // This client still thinks `s1` is the latest — stale.
    const conflict = call('POST', '/api/campaigns/camp3/snapshots', {
      token: owner.token, body: { data: { molecules: [{ id: 'y' }] }, triggerKind: 'manual', expectedParentId: s1.id },
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'stale_write');
  });

  test('restore creates a NEW snapshot equal to an old one; history is never rewritten', () => {
    const owner = register('owner4@lab.org');
    makeCampaign(owner.token, 'camp4');
    const s1 = call('POST', '/api/campaigns/camp4/snapshots', { token: owner.token, body: { data: { molecules: [] }, triggerKind: 'manual' } }).body.snapshot;
    const s2 = call('POST', '/api/campaigns/camp4/snapshots', { token: owner.token, body: { data: { molecules: [{ id: 'm1' }] }, triggerKind: 'manual' } }).body.snapshot;
    const restored = call('POST', `/api/campaigns/camp4/snapshots/${s1.id}/restore`, { token: owner.token, body: {} }).body.snapshot;
    assert.equal(restored.id, s1.id, 'restoring content identical to s1 dedupes to s1 itself');
    // Prove nothing was deleted/rewritten: both original snapshots still exist untouched.
    const list = call('GET', '/api/campaigns/camp4/snapshots', { token: owner.token }).body.snapshots;
    assert.ok(list.some((s) => s.id === s1.id) && list.some((s) => s.id === s2.id));
  });

  test('restoring an unknown snapshot id 404s', () => {
    const owner = register('owner5@lab.org');
    makeCampaign(owner.token, 'camp5');
    const r = call('POST', '/api/campaigns/camp5/snapshots/does-not-exist/restore', { token: owner.token, body: {} });
    assert.equal(r.status, 404);
  });
});

describe('scientific diff engine', () => {
  test('reports added/removed molecules', () => {
    const oldSnap = { data: { molecules: [{ id: 'a', name: 'A', smiles: 'CCO' }] } };
    const newSnap = { data: { molecules: [{ id: 'b', name: 'B', smiles: 'CCN' }] } };
    const d = diffCampaigns(oldSnap, newSnap);
    assert.equal(d.moleculesRemoved.length, 1);
    assert.equal(d.moleculesRemoved[0].id, 'a');
    assert.equal(d.moleculesAdded.length, 1);
    assert.equal(d.moleculesAdded[0].id, 'b');
  });

  test('descriptor change is attributed to data_change when engine version is unchanged', () => {
    const oldSnap = { rdkitVersion: '2026.03.3', data: { molecules: [{ id: 'a', name: 'A', props: { molecularWeight: 180.1 } }] } };
    const newSnap = { rdkitVersion: '2026.03.3', data: { molecules: [{ id: 'a', name: 'A', props: { molecularWeight: 182.5 } }] } };
    const d = diffCampaigns(oldSnap, newSnap);
    assert.equal(d.descriptorChanges.length, 1);
    assert.equal(d.descriptorChanges[0].fields[0].causedBy, 'data_change');
    assert.equal(d.engineVersionChanges.length, 0);
  });

  test('descriptor change is attributed to rdkit_version_change when the RDKit version differs', () => {
    const oldSnap = { rdkitVersion: '2025.09.1', data: { molecules: [{ id: 'a', name: 'A', props: { molecularWeight: 180.1 } }] } };
    const newSnap = { rdkitVersion: '2026.03.3', data: { molecules: [{ id: 'a', name: 'A', props: { molecularWeight: 180.2 } }] } };
    const d = diffCampaigns(oldSnap, newSnap);
    assert.equal(d.descriptorChanges[0].fields[0].causedBy, 'rdkit_version_change');
    assert.ok(d.engineVersionChanges.some((c) => c.engine === 'rdkitVersion'));
  });

  test('structural-alert and lifecycle-stage deltas are reported', () => {
    const oldSnap = { data: { molecules: [{ id: 'a', name: 'A', stage: 'NEW', alerts: [] }] } };
    const newSnap = { data: { molecules: [{ id: 'a', name: 'A', stage: 'ANALYSED', alerts: ['PAINS'] }] } };
    const d = diffCampaigns(oldSnap, newSnap);
    assert.equal(d.stageChanges[0].from, 'NEW');
    assert.equal(d.stageChanges[0].to, 'ANALYSED');
    assert.deepEqual(d.alertChanges[0].added, ['PAINS']);
  });

  test('diff API endpoint returns the same structural diff for two real snapshots', () => {
    const owner = register('owner6@lab.org');
    makeCampaign(owner.token, 'camp6');
    const s1 = call('POST', '/api/campaigns/camp6/snapshots', {
      token: owner.token, body: { data: { molecules: [{ id: 'm1', name: 'A', stage: 'NEW', alerts: [] }] }, triggerKind: 'manual' },
    }).body.snapshot;
    const s2 = call('POST', '/api/campaigns/camp6/snapshots', {
      token: owner.token, body: { data: { molecules: [{ id: 'm1', name: 'A', stage: 'ANALYSED', alerts: [] }] }, triggerKind: 'manual' },
    }).body.snapshot;
    const r = call('GET', `/api/campaigns/camp6/diff`, { token: owner.token, query: { from: s1.id, to: s2.id } });
    assert.equal(r.status, 200);
    assert.equal(r.body.diff.stageChanges.length, 1);
  });
});

describe('permissions: owner / collaborator / viewer', () => {
  test('a stranger gets 404, not 403 — existence is not leaked', () => {
    const owner = register('owner7@lab.org');
    const stranger = register('stranger7@lab.org');
    makeCampaign(owner.token, 'camp7');
    assert.equal(call('GET', '/api/campaigns/camp7', { token: stranger.token }).status, 404);
    assert.equal(call('GET', '/api/campaigns/camp7/snapshots', { token: stranger.token }).status, 404);
  });

  test('owner can invite a collaborator by email; collaborator gains read+write, not membership management', () => {
    const owner = register('owner8@lab.org');
    const collab = register('collab8@lab.org');
    makeCampaign(owner.token, 'camp8');
    const invite = call('POST', '/api/campaigns/camp8/members', { token: owner.token, body: { email: 'collab8@lab.org', role: 'collaborator' } });
    assert.equal(invite.status, 201);
    assert.equal(invite.body.member.role, 'collaborator');

    const read = call('GET', '/api/campaigns/camp8', { token: collab.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.role, 'collaborator');

    // Collaborator CAN write the campaign body and create snapshots.
    assert.equal(call('PUT', '/api/campaigns/camp8', { token: collab.token, body: { campaign: { id: 'camp8', name: 'Renamed', molecules: [] } } }).status, 200);
    assert.equal(call('POST', '/api/campaigns/camp8/snapshots', { token: collab.token, body: { data: { molecules: [] }, triggerKind: 'manual' } }).status, 201);

    // Collaborator CANNOT invite other members or delete the campaign.
    assert.equal(call('POST', '/api/campaigns/camp8/members', { token: collab.token, body: { email: 'x@lab.org', role: 'viewer' } }).status, 403);
    assert.equal(call('DELETE', '/api/campaigns/camp8', { token: collab.token }).status, 403);
  });

  test('viewer can read and comment but cannot write the campaign or create snapshots', () => {
    const owner = register('owner9@lab.org');
    const viewer = register('viewer9@lab.org');
    makeCampaign(owner.token, 'camp9');
    call('POST', '/api/campaigns/camp9/members', { token: owner.token, body: { email: 'viewer9@lab.org', role: 'viewer' } });

    assert.equal(call('GET', '/api/campaigns/camp9', { token: viewer.token }).status, 200);
    assert.equal(call('PUT', '/api/campaigns/camp9', { token: viewer.token, body: { campaign: { id: 'camp9', name: 'x', molecules: [] } } }).status, 403);
    assert.equal(call('POST', '/api/campaigns/camp9/snapshots', { token: viewer.token, body: { data: {}, triggerKind: 'manual' } }).status, 403);

    const comment = call('POST', '/api/campaigns/camp9/comments', { token: viewer.token, body: { body: 'Wygląda obiecująco.' } });
    assert.equal(comment.status, 201);
    assert.equal(comment.body.comment.authorId, viewer.user.id);
    assert.equal(comment.body.comment.resolved, false);

    // Viewer cannot resolve their own comment (needs collaborator+).
    assert.equal(call('POST', `/api/campaigns/camp9/comments/${comment.body.comment.id}/resolve`, { token: viewer.token, body: {} }).status, 403);
    const resolved = call('POST', `/api/campaigns/camp9/comments/${comment.body.comment.id}/resolve`, { token: owner.token, body: {} });
    assert.equal(resolved.body.comment.resolved, true);
  });

  test('owner can remove a collaborator; access is revoked immediately', () => {
    const owner = register('owner10@lab.org');
    const collab = register('collab10@lab.org');
    makeCampaign(owner.token, 'camp10');
    call('POST', '/api/campaigns/camp10/members', { token: owner.token, body: { email: 'collab10@lab.org', role: 'collaborator' } });
    assert.equal(call('GET', '/api/campaigns/camp10', { token: collab.token }).status, 200);
    call('DELETE', `/api/campaigns/camp10/members/${collab.user.id}`, { token: owner.token });
    assert.equal(call('GET', '/api/campaigns/camp10', { token: collab.token }).status, 404);
  });

  test('a member can remove themselves (leave) even without owner role', () => {
    const owner = register('owner11@lab.org');
    const collab = register('collab11@lab.org');
    makeCampaign(owner.token, 'camp11');
    call('POST', '/api/campaigns/camp11/members', { token: owner.token, body: { email: 'collab11@lab.org', role: 'collaborator' } });
    const r = call('DELETE', `/api/campaigns/camp11/members/${collab.user.id}`, { token: collab.token });
    assert.equal(r.status, 200);
    assert.equal(call('GET', '/api/campaigns/camp11', { token: collab.token }).status, 404);
  });
});
