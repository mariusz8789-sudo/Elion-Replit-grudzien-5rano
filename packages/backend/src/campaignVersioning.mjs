/**
 * campaignVersioning (Genesis 2.1, Part 4) — Scientific Version Control.
 *
 * Content-addressed, immutable snapshots of a Campaign's full persisted state: a snapshot's
 * id IS the SHA-256 hash of its canonical JSON (same idea as a git commit hash). History is
 * a DAG via `parentId`, never rewritten — `restore` creates a NEW snapshot whose content
 * equals an old one (`restoredFrom` points back), it never deletes or edits prior rows.
 *
 * Concurrency: creating a snapshot takes the client's last-known latest snapshot id
 * (`expectedParentId`). If the actual latest has since moved (someone else snapshotted first),
 * the write is REJECTED (409) — never silently merged. The caller must refresh and retry.
 *
 * Scientific diff: this module computes a STRUCTURAL diff (molecules added/removed, RDKit
 * descriptor deltas, structural-alert deltas, lifecycle-stage deltas, engine-version deltas)
 * directly over the persisted Campaign JSON. It deliberately does NOT recompute ranking/verdict:
 * that scoring algorithm lives in exactly one place (core/moleculeComparison.ts, frontend), and
 * duplicating it here in JS would create a second, driftable implementation — the same
 * parallel-system anti-pattern this project has refused everywhere else (see the ADMET
 * integration notes). The frontend fetches two snapshots' `data` from this API and re-runs the
 * real ranking engine on each side itself if it wants a verdict-level diff.
 */
import { createHash } from 'node:crypto';
import * as store from './store.mjs';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => { acc[k] = canonicalize(value[k]); return acc; }, {});
  }
  return value;
}

/** Deterministic JSON: same content → same string, regardless of key order. */
export function canonicalJson(data) {
  return JSON.stringify(canonicalize(data ?? {}));
}

/** Content hash = snapshot id. Two snapshots with identical content ALWAYS get the same id. */
export function contentHash(data) {
  return createHash('sha256').update(canonicalJson(data)).digest('hex');
}

const ROLE_RANK = { viewer: 1, collaborator: 2, owner: 3 };
export function hasRole(role, min) {
  return !!role && (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 99);
}

/**
 * Create a new immutable snapshot for a campaign.
 * `expectedParentId`: the client's last-known latest snapshot id (or null if it believes
 * there is none). Pass `undefined` to skip the conflict check (internal/automatic triggers
 * that always snapshot from a freshly-read state, e.g. right after a server-side save).
 * Returns `{ conflict: true, latest }` on a stale write, else `{ conflict: false, snapshot }`.
 */
export function createSnapshot(db, { campaignId, data, triggerKind, authorId, expectedParentId, restoredFrom = null, versions = {} }) {
  const latest = store.getLatestSnapshot(db, campaignId);
  const actualParentId = latest ? latest.id : null;
  if (expectedParentId !== undefined && expectedParentId !== actualParentId) {
    return { conflict: true, latest };
  }
  const id = contentHash(data);
  const snapshot = store.insertCampaignSnapshot(db, {
    id, campaignId, parentId: actualParentId, data, triggerKind, authorId, restoredFrom,
    rdkitVersion: versions.rdkitVersion ?? null,
    admetVersion: versions.admetVersion ?? null,
    groundingVersion: versions.groundingVersion ?? null,
    scoringVersion: versions.scoringVersion ?? null,
  });
  return { conflict: false, snapshot };
}

/** Restore = create a NEW snapshot with an old snapshot's content. History is never rewritten. */
export function restoreSnapshot(db, { campaignId, targetSnapshotId, authorId, expectedParentId, versions = {} }) {
  const target = store.getSnapshot(db, targetSnapshotId);
  if (!target || target.campaignId !== campaignId) return { notFound: true };
  return createSnapshot(db, {
    campaignId, data: target.data, triggerKind: 'restore', authorId, expectedParentId,
    restoredFrom: targetSnapshotId, versions,
  });
}

const DESCRIPTOR_KEYS = ['molecularWeight', 'logP', 'tpsa', 'hbd', 'hba', 'rotatableBonds', 'aromaticRings', 'qed'];

function moleculesById(data) {
  const map = new Map();
  for (const m of Array.isArray(data?.molecules) ? data.molecules : []) map.set(m.id, m);
  return map;
}

/**
 * Structural diff between two snapshots. Every changed descriptor value is tied to WHY it
 * changed — an RDKit-version bump between the two snapshots explains a descriptor delta;
 * otherwise it is a genuine data change (re-analysis / edit), never a bare before/after number.
 */
export function diffCampaigns(oldSnap, newSnap) {
  const oldData = oldSnap?.data ?? {};
  const newData = newSnap?.data ?? {};
  const oldMols = moleculesById(oldData);
  const newMols = moleculesById(newData);

  const moleculesAdded = [...newMols.values()].filter((m) => !oldMols.has(m.id)).map((m) => ({ id: m.id, name: m.name, smiles: m.smiles }));
  const moleculesRemoved = [...oldMols.values()].filter((m) => !newMols.has(m.id)).map((m) => ({ id: m.id, name: m.name, smiles: m.smiles }));

  const engineVersionChanges = [];
  for (const engine of ['rdkitVersion', 'admetVersion', 'groundingVersion', 'scoringVersion']) {
    const from = oldSnap?.[engine] ?? null;
    const to = newSnap?.[engine] ?? null;
    if (from !== to) engineVersionChanges.push({ engine, from, to });
  }
  const rdkitVersionChanged = engineVersionChanges.some((c) => c.engine === 'rdkitVersion');

  const stageChanges = [];
  const alertChanges = [];
  const descriptorChanges = [];
  for (const [id, newM] of newMols) {
    const oldM = oldMols.get(id);
    if (!oldM) continue;
    if (oldM.stage !== newM.stage) stageChanges.push({ id, name: newM.name, from: oldM.stage, to: newM.stage });

    const oldAlerts = new Set(oldM.alerts ?? []);
    const newAlerts = new Set(newM.alerts ?? []);
    const alertsAdded = [...newAlerts].filter((a) => !oldAlerts.has(a));
    const alertsRemoved = [...oldAlerts].filter((a) => !newAlerts.has(a));
    if (alertsAdded.length || alertsRemoved.length) alertChanges.push({ id, name: newM.name, added: alertsAdded, removed: alertsRemoved });

    const op = oldM.props, np = newM.props;
    if (op && np) {
      const fields = [];
      for (const key of DESCRIPTOR_KEYS) {
        const ov = op[key], nv = np[key];
        if (typeof ov === 'number' && typeof nv === 'number' && ov !== nv) {
          fields.push({ field: key, from: ov, to: nv, causedBy: rdkitVersionChanged ? 'rdkit_version_change' : 'data_change' });
        }
      }
      if (fields.length) descriptorChanges.push({ id, name: newM.name, fields });
    }
  }

  return {
    moleculesAdded, moleculesRemoved, stageChanges, alertChanges, descriptorChanges, engineVersionChanges,
    summary: {
      moleculesAdded: moleculesAdded.length,
      moleculesRemoved: moleculesRemoved.length,
      stageChanges: stageChanges.length,
      alertChanges: alertChanges.length,
      descriptorChanges: descriptorChanges.length,
      engineVersionChanges: engineVersionChanges.length,
    },
  };
}
