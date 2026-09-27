import { sha256HexSync } from '@genesis/core/knowledge/sha256.js';
import { canonicalJson } from '../events/hash';
import type { DetectiveReport } from './environmentalDetective';

/**
 * ENVIRONMENTAL CASE GRAPH (D-130) — the explainable, GIS-ready shape the
 * delivered gap-closure pack asked for, built ON the detective's report
 * (D-128): CASE → ACTORS / PLACES / EVENTS / SOURCES / ANOMALIES /
 * COUNTER-EXPLANATIONS / NEXT ACTIONS. Every signal carries its source,
 * timestamp, spatial reference, detection method, evidence grade and
 * uncertainty. The graph's status is CANDIDATE_SITE_FOR_REVIEW or
 * INSUFFICIENT_EVIDENCE — there is no field for an accusation, no scoring
 * of actors, and a case whose counter-explanations were not written down
 * cannot become a candidate. Synthetic signals and synthetic series can
 * never yield a candidate site. Nothing here fabricates real data: actors,
 * places, events and sources are what the caller declares, each with its
 * source ids.
 */

export type CaseNodeKind = 'ACTOR' | 'SITE' | 'EVENT' | 'SOURCE' | 'ANOMALY' | 'PERMIT' | 'VEHICLE';
export type CaseActorRole = 'PERMIT_HOLDER' | 'OPERATOR' | 'REPORTER' | 'REGULATOR' | 'UNKNOWN';
export interface CaseNode { readonly id: string; readonly kind: CaseNodeKind; readonly label: string; readonly sourceIds: readonly string[]; readonly role?: CaseActorRole; readonly confidence: number; }
export interface CaseEdge { readonly from: string; readonly to: string; readonly relation: string; readonly sourceIds: readonly string[]; readonly validFrom?: string; readonly validTo?: string; }
export type DetectionMethod = 'PUBLIC_RECORD' | 'SENSOR_NETWORK' | 'SATELLITE' | 'ORTHOPHOTO' | 'FIELD_VISIT' | 'MODEL_OUTPUT' | 'SYNTHETIC';
export type EvidenceGrade = 'A' | 'B' | 'C' | 'SYNTHETIC';
export interface SpatialReference { readonly crs: 'EPSG:4326'; readonly lat: number; readonly lon: number; readonly geometryWkt?: string; }
export interface CaseSignal { readonly id: string; readonly sourceId: string; readonly observedAt: string; readonly spatial: SpatialReference | null; readonly method: DetectionMethod; readonly evidenceGrade: EvidenceGrade; readonly uncertainty: number; readonly signal: string; }
export interface CaseSource { readonly id: string; readonly label: string; readonly url: string | null; readonly kind: 'OFFICIAL_MONITORING' | 'PUBLIC_REGISTER' | 'IMAGERY' | 'FIELD' | 'MODEL' | 'SYNTHETIC'; }

export interface EnvironmentalCaseGraphInput {
  readonly report: DetectiveReport;
  readonly actors?: readonly { readonly id: string; readonly label: string; readonly role: CaseActorRole; readonly sourceIds: readonly string[] }[];
  readonly sites?: readonly { readonly id: string; readonly label: string; readonly spatial: SpatialReference | null; readonly sourceIds: readonly string[] }[];
  readonly events?: readonly { readonly id: string; readonly label: string; readonly at: string; readonly sourceIds: readonly string[] }[];
  readonly sources: readonly CaseSource[];
  readonly signals: readonly CaseSignal[];
  readonly edges?: readonly CaseEdge[];
  readonly counterExplanations: readonly string[];
  readonly nextActions: readonly string[];
}

export type CaseStatus = 'CANDIDATE_SITE_FOR_REVIEW' | 'INSUFFICIENT_EVIDENCE';
export interface GeoJsonFeature { readonly type: 'Feature'; readonly geometry: { readonly type: 'Point'; readonly coordinates: readonly [number, number] }; readonly properties: Record<string, string | number | boolean | null>; }
export interface EnvironmentalCaseGraph {
  readonly caseId: string; readonly nodes: readonly CaseNode[]; readonly edges: readonly CaseEdge[]; readonly signals: readonly CaseSignal[]; readonly sources: readonly CaseSource[];
  readonly anomalies: DetectiveReport['anomalies']; readonly counterExplanations: readonly string[]; readonly nextActions: readonly string[];
  readonly status: CaseStatus; readonly epistemicStatus: 'MODEL' | 'INSUFFICIENT_EVIDENCE'; readonly reasons: readonly string[];
  readonly gis: { readonly type: 'FeatureCollection'; readonly crs: 'EPSG:4326'; readonly features: readonly GeoJsonFeature[] };
  readonly disclaimer: string; readonly fingerprint: string;
}

export const CASE_GRAPH_DISCLAIMER = 'A case graph is a review aid, not a finding: it never identifies a responsible party, and CANDIDATE_SITE_FOR_REVIEW means only that verified signals and a pinned dataset justify a human review of the site.';
const BAD_ID = /[^A-Za-z0-9:_./-]/;

/** Build the graph; the status follows the rules in the header and every refusal is a reason. */
export function buildEnvironmentalCaseGraph(input: EnvironmentalCaseGraphInput): EnvironmentalCaseGraph {
  const { report } = input;
  const sourceIds = new Set(input.sources.map((s) => s.id));
  const reasons: string[] = [];
  const nodes: CaseNode[] = [];
  const addNode = (n: CaseNode): void => { if (BAD_ID.test(n.id)) throw new Error(`CASE_NODE_ID_INVALID:${n.id}`); if (nodes.some((x) => x.id === n.id)) throw new Error(`CASE_NODE_DUPLICATE:${n.id}`); nodes.push(n); };
  const conf = (ids: readonly string[]): number => { const known = ids.filter((id) => sourceIds.has(id)); if (known.length !== ids.length) reasons.push(`unknown source id on ${ids.join(',')}`); return known.length ? Math.min(1, 0.4 + 0.2 * known.length) : 0; };
  for (const s of input.sources) addNode({ id: s.id, kind: 'SOURCE', label: s.label, sourceIds: [s.id], confidence: s.kind === 'SYNTHETIC' ? 0 : 1 });
  for (const a of input.actors ?? []) addNode({ id: a.id, kind: 'ACTOR', label: a.label, role: a.role, sourceIds: a.sourceIds, confidence: conf(a.sourceIds) });
  for (const s of input.sites ?? []) addNode({ id: s.id, kind: 'SITE', label: s.label, sourceIds: s.sourceIds, confidence: conf(s.sourceIds) });
  for (const e of input.events ?? []) addNode({ id: e.id, kind: 'EVENT', label: `${e.label} @ ${e.at}`, sourceIds: e.sourceIds, confidence: conf(e.sourceIds) });
  report.anomalies.forEach((a, i) => addNode({ id: `anomaly:${report.caseId}:${i}`, kind: 'ANOMALY', label: `${a.unit} period ${a.period}: ${a.value} (robust z ${a.robustZ.toFixed(2)})`, sourceIds: [`report:${report.caseId}`], confidence: report.provenance.kind === 'SYNTHETIC' ? 0 : 0.6 }));
  const edges = [...(input.edges ?? [])];
  for (const e of edges) { if (!nodes.some((n) => n.id === e.from) || !nodes.some((n) => n.id === e.to)) throw new Error(`CASE_EDGE_DANGLING:${e.from}->${e.to}`); }
  for (const s of input.signals) { if (!sourceIds.has(s.sourceId)) reasons.push(`signal ${s.id} cites unknown source ${s.sourceId}`); if (s.uncertainty < 0 || s.uncertainty > 1) throw new Error(`CASE_SIGNAL_UNCERTAINTY_OUT_OF_RANGE:${s.id}`); }

  const verified = input.signals.filter((s) => s.evidenceGrade !== 'SYNTHETIC' && s.method !== 'SYNTHETIC' && sourceIds.has(s.sourceId) && input.sources.find((x) => x.id === s.sourceId)?.kind !== 'SYNTHETIC');
  if (report.provenance.kind === 'SYNTHETIC') reasons.push('the measurement series is SYNTHETIC: no candidate site can follow from it');
  if (report.verdict !== 'EFFECT_SUGGESTED') reasons.push(`detective verdict is ${report.verdict}, not EFFECT_SUGGESTED`);
  if (verified.length === 0) reasons.push('no verified (non-synthetic, sourced) signal');
  if (input.counterExplanations.length === 0) reasons.push('no counter-explanations were written down; a candidate needs at least one alternative to test');
  if (input.nextActions.length === 0) reasons.push('no next actions; a review candidate must say what to check');
  const candidate = report.provenance.kind === 'REAL_DATASET' && report.verdict === 'EFFECT_SUGGESTED' && verified.length > 0 && input.counterExplanations.length > 0 && input.nextActions.length > 0;
  const status: CaseStatus = candidate ? 'CANDIDATE_SITE_FOR_REVIEW' : 'INSUFFICIENT_EVIDENCE';
  reasons.push(candidate ? `${verified.length} verified signal(s) + pinned dataset ${report.provenance.sourceUrl} → review recommended; alternatives listed: ${input.counterExplanations.length}` : 'status INSUFFICIENT_EVIDENCE');

  const features: GeoJsonFeature[] = [
    ...input.signals.filter((s) => s.spatial).map((s) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.spatial!.lon, s.spatial!.lat] as const }, properties: { id: s.id, kind: 'SIGNAL', sourceId: s.sourceId, observedAt: s.observedAt, method: s.method, evidenceGrade: s.evidenceGrade, uncertainty: s.uncertainty, signal: s.signal } })),
    ...(input.sites ?? []).filter((s) => s.spatial).map((s) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.spatial!.lon, s.spatial!.lat] as const }, properties: { id: s.id, kind: 'SITE', label: s.label, sourceIds: s.sourceIds.join(',') } })),
  ];
  const body = { caseId: report.caseId, nodes, edges, signals: input.signals, sources: input.sources, anomalies: report.anomalies, counterExplanations: input.counterExplanations, nextActions: input.nextActions, status, epistemicStatus: candidate ? 'MODEL' as const : 'INSUFFICIENT_EVIDENCE' as const, reasons, gis: { type: 'FeatureCollection' as const, crs: 'EPSG:4326' as const, features }, disclaimer: CASE_GRAPH_DISCLAIMER };
  return { ...body, fingerprint: sha256HexSync(canonicalJson({ caseId: body.caseId, status, reportFingerprint: report.fingerprint, nodes: nodes.map((n) => n.id), edges, signals: input.signals.map((s) => s.id), counterExplanations: input.counterExplanations, nextActions: input.nextActions })) };
}
