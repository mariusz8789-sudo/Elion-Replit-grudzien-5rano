/**
 * Trwałość Kampanii Naukowej (P1). Historia decyzji i zdarzeń jest APPEND-ONLY —
 * nigdy nie przepisujemy podjętych decyzji naukowych. Kandydaci zachowują pełny
 * rodowód (parent + transformacja). Cały dostęp do tabel kampanii przechodzi tu.
 */
import { newId } from '../auth.mjs';

const J = (v) => JSON.stringify(v ?? null);
const P = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/* ---------------- Kampanie ---------------- */

export function createCampaign(db, c) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO campaigns (id, project_id, objective, domain, objective_vector_json, constraints_json, budget_json, stopping_json, strategy_json, seed, status, current_generation, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', 0, ?, ?, ?)`,
  ).run(
    id, c.projectId, c.objective, c.domain, J(c.objectiveVector ?? []), J(c.constraints ?? []),
    J(c.budget ?? {}), J(c.stopping ?? {}), J(c.strategy ?? {}), c.seed ?? null, c.createdBy ?? null, now, now,
  );
  return getCampaign(db, id);
}

export function getCampaign(db, id) {
  const r = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id, objective: r.objective, domain: r.domain,
    objectiveVector: P(r.objective_vector_json, []), constraints: P(r.constraints_json, []),
    budget: P(r.budget_json, {}), stopping: P(r.stopping_json, {}), strategy: P(r.strategy_json, {}),
    seed: r.seed ?? null, status: r.status, currentGeneration: r.current_generation,
    stopReason: r.stop_reason ?? null, final: r.final_json ? P(r.final_json, null) : null,
    createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listCampaigns(db, projectId) {
  return db.prepare('SELECT id FROM campaigns WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    .map((r) => getCampaign(db, r.id));
}

/** Aktualizuje pola stanu kampanii (status, generacja, strategia, stop, final). */
export function updateCampaign(db, id, patch) {
  const cur = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!cur) return null;
  db.prepare(
    `UPDATE campaigns SET status = ?, current_generation = ?, strategy_json = ?, stop_reason = ?, final_json = ?, updated_at = ? WHERE id = ?`,
  ).run(
    patch.status ?? cur.status,
    patch.currentGeneration ?? cur.current_generation,
    patch.strategy !== undefined ? J(patch.strategy) : cur.strategy_json,
    patch.stopReason !== undefined ? patch.stopReason : cur.stop_reason,
    patch.final !== undefined ? J(patch.final) : cur.final_json,
    Date.now(), id,
  );
  return getCampaign(db, id);
}

/* ---------------- Kandydaci (z rodowodem) ---------------- */

export function addCandidate(db, c) {
  const id = newId();
  db.prepare(
    `INSERT INTO campaign_candidates (id, campaign_id, generation, parent_id, parent_smiles, transformation, canonical_smiles, valid, descriptors_json, objective_vector_json, constraint_violations_json, pareto, status, rejected_reason, run_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, c.campaignId, c.generation, c.parentId ?? null, c.parentSmiles ?? null, c.transformation ?? null,
    c.canonicalSmiles, c.valid === false ? 0 : 1, J(c.descriptors ?? {}), J(c.objectiveVector ?? {}),
    J(c.constraintViolations ?? []), c.pareto ? 1 : 0, c.status ?? 'retained', c.rejectedReason ?? null,
    J(c.runIds ?? []), Date.now(),
  );
  return id;
}

function toCandidate(r) {
  return {
    id: r.id, campaignId: r.campaign_id, generation: r.generation, parentId: r.parent_id ?? null,
    parentSmiles: r.parent_smiles ?? null, transformation: r.transformation ?? null,
    canonicalSmiles: r.canonical_smiles, valid: r.valid === 1, descriptors: P(r.descriptors_json, {}),
    objectiveVector: P(r.objective_vector_json, {}), constraintViolations: P(r.constraint_violations_json, []),
    pareto: r.pareto === 1, status: r.status, rejectedReason: r.rejected_reason ?? null,
    runIds: P(r.run_ids_json, []), createdAt: r.created_at,
  };
}

export function listCandidates(db, campaignId, generation = null) {
  const rows = generation === null
    ? db.prepare('SELECT * FROM campaign_candidates WHERE campaign_id = ? ORDER BY generation ASC, created_at ASC').all(campaignId)
    : db.prepare('SELECT * FROM campaign_candidates WHERE campaign_id = ? AND generation = ? ORDER BY created_at ASC').all(campaignId, generation);
  return rows.map(toCandidate);
}

export function getCandidate(db, id) {
  const r = db.prepare('SELECT * FROM campaign_candidates WHERE id = ?').get(id);
  return r ? toCandidate(r) : null;
}

/** Ustawia flagę Pareto dla podanego zbioru id (po przeliczeniu frontu). */
export function setParetoFlags(db, campaignId, paretoIds) {
  const set = new Set(paretoIds);
  for (const c of db.prepare('SELECT id FROM campaign_candidates WHERE campaign_id = ?').all(campaignId)) {
    db.prepare('UPDATE campaign_candidates SET pareto = ? WHERE id = ?').run(set.has(c.id) ? 1 : 0, c.id);
  }
}

/* ---------------- Decyzje strategiczne (append-only) ---------------- */

export function addDecision(db, d) {
  const id = newId();
  db.prepare(
    `INSERT INTO campaign_decisions (id, campaign_id, generation, state_hash, evidence_json, metrics_json, algorithm, decision, params_json, purpose, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, d.campaignId, d.generation, d.stateHash, J(d.evidence ?? {}), J(d.metrics ?? {}),
    d.algorithm, d.decision, J(d.params ?? {}), d.purpose ?? '', Date.now(),
  );
  return id;
}

export function listDecisions(db, campaignId) {
  return db.prepare('SELECT * FROM campaign_decisions WHERE campaign_id = ? ORDER BY generation ASC, created_at ASC').all(campaignId)
    .map((r) => ({
      id: r.id, campaignId: r.campaign_id, generation: r.generation, stateHash: r.state_hash,
      evidence: P(r.evidence_json, {}), metrics: P(r.metrics_json, {}), algorithm: r.algorithm,
      decision: r.decision, params: P(r.params_json, {}), purpose: r.purpose, createdAt: r.created_at,
    }));
}

/* ---------------- Zdarzenia (append-only, dla WHY + grafu odkryć) ---------------- */

export function addEvent(db, e) {
  const id = newId();
  db.prepare('INSERT INTO campaign_events (id, campaign_id, generation, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, e.campaignId, e.generation ?? 0, e.type, J(e.payload ?? {}), Date.now());
  return id;
}

export function listEvents(db, campaignId) {
  return db.prepare('SELECT * FROM campaign_events WHERE campaign_id = ? ORDER BY created_at ASC').all(campaignId)
    .map((r) => ({ id: r.id, campaignId: r.campaign_id, generation: r.generation, type: r.type, payload: P(r.payload_json, {}), createdAt: r.created_at }));
}
