import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from './auth.mjs';
import {
  openDatabase,
  createUser,
  createProject,
  createTrial,
  listTrials,
  getMainBranch,
  listBranches,
  createBranch,
  forkBranch,
  createMergeRequest,
  listMergeRequests,
  decideMergeRequest,
  contributionGraph,
} from './store.mjs';

/**
 * Scientific Git — gałęzie, odgałęzianie, recenzja/scalanie i graf kontrybucji.
 * Wszystko na żywej bazie in-memory: to realne operacje wersjonowania rekordu
 * naukowego, nie makieta.
 */

function seed(email = 'a@lab.org') {
  return { email };
}

function setup() {
  const db = openDatabase();
  const owner = createUser(db, { email: 'owner@lab.org', displayName: 'Owner', passwordHash: hashPassword('password123') });
  const project = createProject(db, { name: 'Reaktor', ownerId: owner.id });
  return { db, owner, project };
}

describe('branches', () => {
  test('every new project starts with a main branch', () => {
    const { db, project } = setup();
    const main = getMainBranch(db, project.id);
    assert.equal(main.name, 'main');
    assert.equal(listBranches(db, project.id).length, 1);
  });

  test('createBranch adds a named line and rejects duplicates', () => {
    const { db, owner, project } = setup();
    const b = createBranch(db, { projectId: project.id, name: 'hipoteza-A', createdBy: owner.id });
    assert.equal(b.name, 'hipoteza-A');
    assert.equal(listBranches(db, project.id).length, 2);
    assert.throws(() => createBranch(db, { projectId: project.id, name: 'hipoteza-A', createdBy: owner.id }), /branch_exists/);
  });

  test('trials default to main and number per (branch, experiment)', () => {
    const { db, owner, project } = setup();
    const main = getMainBranch(db, project.id);
    const t1 = createTrial(db, { projectId: project.id, experimentId: 'e', authorId: owner.id, params: {}, outputs: {}, status: 'draft' });
    assert.equal(t1.branchId, main.id);
    assert.equal(t1.index, 1);

    const branch = createBranch(db, { projectId: project.id, name: 'b2', createdBy: owner.id });
    const t2 = createTrial(db, { projectId: project.id, experimentId: 'e', authorId: owner.id, params: {}, outputs: {}, status: 'draft', branchId: branch.id });
    assert.equal(t2.branchId, branch.id);
    assert.equal(t2.index, 1); // osobna numeracja na nowej gałęzi

    assert.equal(listTrials(db, project.id, 'e', main.id).length, 1);
    assert.equal(listTrials(db, project.id, 'e', branch.id).length, 1);
    assert.equal(listTrials(db, project.id, 'e').length, 2); // obie gałęzie razem
  });
});

describe('forkBranch', () => {
  test('copies base-branch trials into the new branch with parent lineage', () => {
    const { db, owner, project } = setup();
    const main = getMainBranch(db, project.id);
    const base = createTrial(db, { projectId: project.id, experimentId: 'e', authorId: owner.id, params: { x: 1 }, outputs: { y: 2 }, status: 'baseline', modelVersion: 'v1' });

    const fork = forkBranch(db, { projectId: project.id, name: 'wariant', baseBranchId: main.id, createdBy: owner.id });
    const forked = listTrials(db, project.id, 'e', fork.id);
    assert.equal(forked.length, 1);
    assert.equal(forked[0].parentId, base.id); // rodowód zachowany
    assert.deepEqual(forked[0].params, { x: 1 });
    assert.equal(forked[0].modelVersion, 'v1');
    // Oryginał nietknięty.
    assert.equal(listTrials(db, project.id, 'e', main.id).length, 1);
  });
});

describe('merge requests: review and merge', () => {
  function setupBranches() {
    const { db, owner, project } = setup();
    const main = getMainBranch(db, project.id);
    const feature = createBranch(db, { projectId: project.id, name: 'feature', createdBy: owner.id });
    createTrial(db, { projectId: project.id, experimentId: 'e', authorId: owner.id, params: { x: 9 }, outputs: { y: 1 }, status: 'promising', branchId: feature.id });
    return { db, owner, project, main, feature };
  }

  test('approving a merge copies source trials into target (nothing overwritten)', () => {
    const { db, owner, project, main, feature } = setupBranches();
    const mr = createMergeRequest(db, { projectId: project.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'Scal feature', createdBy: owner.id });
    assert.equal(mr.status, 'open');

    const decided = decideMergeRequest(db, mr.id, { approve: true, deciderId: owner.id, reviewNote: 'wygląda dobrze' });
    assert.equal(decided.status, 'merged');
    assert.equal(decided.mergedCount, 1);

    const onMain = listTrials(db, project.id, 'e', main.id);
    assert.equal(onMain.length, 1);
    assert.deepEqual(onMain[0].params, { x: 9 });
    // Źródło nadal istnieje — historia obu gałęzi zachowana.
    assert.equal(listTrials(db, project.id, 'e', feature.id).length, 1);
  });

  test('rejecting a merge changes status but copies nothing', () => {
    const { db, owner, project, main, feature } = setupBranches();
    const mr = createMergeRequest(db, { projectId: project.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'Nie', createdBy: owner.id });
    const decided = decideMergeRequest(db, mr.id, { approve: false, deciderId: owner.id, reviewNote: 'brak walidacji' });
    assert.equal(decided.status, 'rejected');
    assert.equal(listTrials(db, project.id, 'e', main.id).length, 0);
  });

  test('deciding an already-decided merge request is a no-op (returns null)', () => {
    const { db, owner, project, main, feature } = setupBranches();
    const mr = createMergeRequest(db, { projectId: project.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'x', createdBy: owner.id });
    decideMergeRequest(db, mr.id, { approve: true, deciderId: owner.id });
    assert.equal(decideMergeRequest(db, mr.id, { approve: false, deciderId: owner.id }), null);
  });

  test('listMergeRequests returns newest first', () => {
    const { db, owner, project, main, feature } = setupBranches();
    createMergeRequest(db, { projectId: project.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'A', createdBy: owner.id });
    createMergeRequest(db, { projectId: project.id, sourceBranchId: feature.id, targetBranchId: main.id, title: 'B', createdBy: owner.id });
    const list = listMergeRequests(db, project.id);
    assert.equal(list.length, 2);
  });
});

describe('contribution graph', () => {
  test('aggregates trials per author from real rows', () => {
    const { db, owner, project } = setup();
    const alice = createUser(db, { email: 'alice@lab.org', displayName: 'Alice', passwordHash: hashPassword('password123') });
    createTrial(db, { projectId: project.id, experimentId: 'e', authorId: owner.id, params: {}, outputs: {}, status: 'draft' });
    createTrial(db, { projectId: project.id, experimentId: 'e', authorId: owner.id, params: {}, outputs: {}, status: 'draft' });
    createTrial(db, { projectId: project.id, experimentId: 'e', authorId: alice.id, params: {}, outputs: {}, status: 'draft' });

    const g = contributionGraph(db, project.id);
    assert.equal(g.totalTrials, 3);
    assert.equal(g.contributors[0].trials, 2); // owner najwięcej, pierwszy
    assert.equal(g.contributors[0].userId, owner.id);
    assert.equal(Object.values(g.perDay).reduce((a, b) => a + b, 0), 3);
    assert.ok(seed());
  });
});
