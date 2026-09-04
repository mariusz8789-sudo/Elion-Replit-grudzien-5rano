import { describe, expect, it, vi } from 'vitest';
import { RealityBranchStore } from '../core/reality/branches';

describe('RealityBranchStore', () => {
  it('starts with exactly one root branch, active by default, parentId null', () => {
    const store = new RealityBranchStore('Znajomy świat', { centralMassSolar: 1 });
    const branches = store.listBranches();
    expect(branches).toHaveLength(1);
    expect(branches[0].parentId).toBeNull();
    expect(store.getActive().id).toBe(store.getRootId());
    expect(store.getActive().parameters).toEqual({ centralMassSolar: 1 });
  });

  it('createBranch copies parent parameters and applies overrides without mutating the parent', () => {
    const store = new RealityBranchStore('root', { mass: 1, alpha: 1 });
    const root = store.getRootId();
    const child = store.createBranch(root, 'Cięższa gwiazda', { mass: 4 });
    expect(child.parameters).toEqual({ mass: 4, alpha: 1 });
    expect(child.parentId).toBe(root);
    expect(store.getBranch(root).parameters).toEqual({ mass: 1, alpha: 1 });
  });

  it('branches remain independently addressable after creating a child (parent is not replaced)', () => {
    const store = new RealityBranchStore('root', { mass: 1 });
    const root = store.getRootId();
    const child = store.createBranch(root, 'B', { mass: 2 });
    expect(store.listBranches().map((b) => b.id).sort()).toEqual([root, child.id].sort());
  });

  it('diff reports only keys whose values actually differ', () => {
    const store = new RealityBranchStore('root', { mass: 1, alpha: 1, strong: 1 });
    const root = store.getRootId();
    const child = store.createBranch(root, 'B', { mass: 4 });
    const diff = store.diff(root, child.id);
    expect(diff).toEqual([{ key: 'mass', a: 1, b: 4 }]);
  });

  it('diff is symmetric-safe: comparing a branch to itself yields no differences', () => {
    const store = new RealityBranchStore('root', { mass: 1 });
    const root = store.getRootId();
    expect(store.diff(root, root)).toEqual([]);
  });

  it('setActive switches the active branch and notifies subscribers; unknown id throws without switching', () => {
    const store = new RealityBranchStore('root', { mass: 1 });
    const root = store.getRootId();
    const child = store.createBranch(root, 'B', { mass: 2 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setActive(child.id);
    expect(store.getActive().id).toBe(child.id);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.setActive('nope')).toThrow();
    expect(store.getActive().id).toBe(child.id);
  });

  it('getBranch throws for an unknown id', () => {
    const store = new RealityBranchStore('root', { mass: 1 });
    expect(() => store.getBranch('missing')).toThrow();
  });
});
