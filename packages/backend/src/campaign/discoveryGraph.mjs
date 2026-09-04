/**
 * Graf Odkryć (P11) — zbudowany WYŁĄCZNIE z utrwalonych zdarzeń/kandydatów/
 * decyzji kampanii. Węzły i krawędzie odzwierciedlają realne relacje (rodowód,
 * transformacja, egzekucja jako Scientific Run, odrzucenie, zmiana strategii,
 * stop). Zero dekoracyjnych, wymyślonych danych.
 */
import * as store from './persistence.mjs';

export function buildDiscoveryGraph(db, campaignId) {
  const campaign = store.getCampaign(db, campaignId);
  if (!campaign) return null;
  const candidates = store.listCandidates(db, campaignId);
  const decisions = store.listDecisions(db, campaignId);

  const nodes = [];
  const edges = [];
  const seenTransform = new Set();

  nodes.push({ id: `objective:${campaignId}`, type: 'OBJECTIVE', label: campaign.objective });

  for (const c of candidates) {
    nodes.push({
      id: `cand:${c.id}`, type: 'CANDIDATE',
      label: c.canonicalSmiles, generation: c.generation, status: c.status, pareto: c.pareto,
    });
    // GENERATED_FROM (rodowód)
    if (c.parentId) edges.push({ from: `cand:${c.parentId}`, to: `cand:${c.id}`, type: 'GENERATED_FROM' });
    // TRANSFORMED_BY (transformacja)
    if (c.transformation) {
      const tid = `transform:${c.transformation}`;
      if (!seenTransform.has(c.transformation)) { seenTransform.add(c.transformation); nodes.push({ id: tid, type: 'TRANSFORMATION', label: c.transformation }); }
      edges.push({ from: tid, to: `cand:${c.id}`, type: 'TRANSFORMED_BY' });
    }
    // EXECUTED_AS (Scientific Run)
    for (const runId of c.runIds) {
      nodes.push({ id: `run:${runId}`, type: 'SCIENTIFIC_RUN', label: runId.slice(0, 8) });
      edges.push({ from: `cand:${c.id}`, to: `run:${runId}`, type: 'EXECUTED_AS' });
    }
    // REJECTED_BECAUSE / RETAINED_BECAUSE
    if (c.status === 'rejected') edges.push({ from: `cand:${c.id}`, to: `objective:${campaignId}`, type: 'REJECTED_BECAUSE', label: c.rejectedReason });
    else if (c.pareto) edges.push({ from: `cand:${c.id}`, to: `objective:${campaignId}`, type: 'RETAINED_BECAUSE', label: 'pareto-front' });
  }

  for (const d of decisions) {
    const did = `decision:${d.id}`;
    nodes.push({ id: did, type: 'STRATEGY_DECISION', label: d.decision, generation: d.generation });
    edges.push({ from: did, to: `objective:${campaignId}`, type: 'CAUSED_STRATEGY_CHANGE', label: d.purpose });
    if (d.decision.startsWith('STOP')) edges.push({ from: did, to: `objective:${campaignId}`, type: 'STOPPED_BECAUSE', label: d.decision });
  }

  return {
    campaignId,
    stats: { nodes: nodes.length, edges: edges.length, candidates: candidates.length, decisions: decisions.length },
    nodes,
    edges,
  };
}
