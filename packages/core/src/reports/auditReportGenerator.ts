/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, type Clock } from '../expansionHash.js';
export type VisualState = 'NORMAL' | 'WARNING' | 'CRITICAL';
export interface SolverDelta { readonly step: number; readonly metric: string; readonly value: number; readonly thresholdWarning: number; readonly thresholdCritical: number; }
export interface CounterfactualBranch { readonly branchId: string; readonly divergenceStep: number; readonly visualState: VisualState; }
export interface DecisionNode { readonly nodeId: string; readonly parent: string | null; readonly choice: string; readonly visualState: VisualState; }
export interface AuditTrail { readonly runId: string; readonly steps: readonly SolverDelta[]; readonly counterfactualBranches: readonly CounterfactualBranch[]; readonly decisionTree: readonly DecisionNode[]; }
export interface AuditReport { readonly jsonLd: Record<string, unknown>; readonly html: string; readonly fingerprint: string; }
export function mapDeltaToVisual(d: SolverDelta): VisualState {
  const a = Math.abs(d.value);
  if (a >= Math.abs(d.thresholdCritical)) return 'CRITICAL';
  if (a >= Math.abs(d.thresholdWarning)) return 'WARNING';
  return 'NORMAL';
}
const COLOR: Record<VisualState, string> = { NORMAL: '#34d399', WARNING: '#fbbf24', CRITICAL: '#f87171' };
export function generateAuditJsonLd(trail: AuditTrail): Record<string, unknown> {
  return {
    '@context': { '@vocab': 'https://genesis.os/audit#', step: 'https://genesis.os/audit#step', metric: 'https://genesis.os/audit#metric', visualState: 'https://genesis.os/audit#visualState', solverDelta: 'https://genesis.os/audit#solverDelta' },
    '@type': 'GenesisAuditReport', runId: trail.runId,
    hasPart: trail.steps.map(d => ({ '@type': 'StateTransition', step: d.step, metric: d.metric, solverDelta: d.value, visualState: mapDeltaToVisual(d) })),
    counterfactual: trail.counterfactualBranches.map(b => ({ '@type': 'CounterfactualBranch', branchId: b.branchId, divergenceStep: b.divergenceStep, visualState: b.visualState })),
    decisionTree: trail.decisionTree.map(n => ({ '@type': 'DecisionNode', nodeId: n.nodeId, parent: n.parent, choice: n.choice, visualState: n.visualState })),
  };
}
export function generateAuditHtml(trail: AuditTrail): string {
  const rows = trail.steps.map(d => { const v = mapDeltaToVisual(d); return `<tr><td>${d.step}</td><td>${d.metric}</td><td>${d.value}</td><td style="color:${COLOR[v]}">${v}</td></tr>`; }).join('');
  const branches = trail.counterfactualBranches.map(b => `<li>${b.branchId} @step ${b.divergenceStep} <span style="color:${COLOR[b.visualState]}">${b.visualState}</span></li>`).join('');
  const tree = trail.decisionTree.map(n => `<li>${n.nodeId}${n.parent ? ' ← ' + n.parent : ''}: ${n.choice} <span style="color:${COLOR[n.visualState]}">${n.visualState}</span></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Genesis Audit ${trail.runId}</title></head><body style="font-family:system-ui;background:#0b1526;color:#dce8f5;padding:24px"><h1>Genesis Audit Report</h1><p>runId: ${trail.runId}</p><h2>State Transitions (visual ⇄ solver delta)</h2><table border="1" cellspacing="0" cellpadding="6" style="border-color:#22384f"><tr><th>step</th><th>metric</th><th>delta</th><th>visual</th></tr>${rows}</table><h2>Counterfactual Branches</h2><ul>${branches}</ul><h2>Decision Tree</h2><ul>${tree}</ul><p style="color:#7d93ad">Synthetic audit trail; visual states map 1:1 to solver deltas via documented thresholds.</p></body></html>`;
}
export function generateAuditReport(trail: AuditTrail, clock: Clock): AuditReport {
  const jsonLd = generateAuditJsonLd(trail);
  const html = generateAuditHtml(trail);
  return { jsonLd, html, fingerprint: sha256hex(stableStringify({ trail, at: clock.now() })) };
}
