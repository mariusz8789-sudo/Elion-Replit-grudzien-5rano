import { describe, expect, it } from 'vitest';
import { investigateEnvironmentalCase, type EnvironmentalCaseInput } from '../core/agent/environmentalDetective';
import { CASE_GRAPH_DISCLAIMER, buildEnvironmentalCaseGraph, type CaseSignal, type CaseSource } from '../core/agent/environmentalCaseGraph';

const CUT = 24;
function series(unit: string, seed: number, n: number, base: number, slope: number, step: number, stepAt: number, noise = 0.6) {
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { unit, points: Array.from({ length: n }, (_, period) => ({ period, value: base + slope * period + (period >= stepAt ? step : 0) + (rnd() - 0.5) * noise })) };
}
function caseInput(step: number, kind: 'SYNTHETIC' | 'REAL_DATASET'): EnvironmentalCaseInput {
  return { caseId: `no2-${kind.toLowerCase()}`, quantity: 'NO2 monthly mean', measurementUnit: 'µg/m³', treated: series('site-A', 11, 48, 40, -0.05, step, CUT), controls: Array.from({ length: 3 }, (_, i) => series(`ctrl-${i}`, 100 + i, 48, 38 + i, -0.05, 0, CUT)), interventionPeriod: CUT, provenance: { kind, sourceUrl: kind === 'SYNTHETIC' ? 'genesis://synthetic/no2-panel' : 'https://uk-air.defra.gov.uk/data/' } };
}
const sources: CaseSource[] = [
  { id: 'src:aurn', label: 'AURN monitoring network', url: 'https://uk-air.defra.gov.uk/', kind: 'OFFICIAL_MONITORING' },
  { id: 'src:register', label: 'Public permit register', url: null, kind: 'PUBLIC_REGISTER' },
  { id: 'src:synth', label: 'Synthetic demo feed', url: null, kind: 'SYNTHETIC' },
];
const verifiedSignal: CaseSignal = { id: 'sig:1', sourceId: 'src:aurn', observedAt: '2025-03-01T00:00:00Z', spatial: { crs: 'EPSG:4326', lat: 51.5, lon: -0.12 }, method: 'SENSOR_NETWORK', evidenceGrade: 'A', uncertainty: 0.2, signal: 'NO2 step change at site-A' };
const syntheticSignal: CaseSignal = { id: 'sig:2', sourceId: 'src:synth', observedAt: '2025-03-01T00:00:00Z', spatial: null, method: 'SYNTHETIC', evidenceGrade: 'SYNTHETIC', uncertainty: 0.5, signal: 'generated' };
const actors = [{ id: 'actor:permit-holder', label: 'Permit holder (declared)', role: 'PERMIT_HOLDER' as const, sourceIds: ['src:register'] }];
const sites = [{ id: 'site:A', label: 'Site A', spatial: { crs: 'EPSG:4326' as const, lat: 51.5, lon: -0.12 }, sourceIds: ['src:register'] }];

describe('environmental case graph — explainable, GIS-ready, never an accusation (D-130)', () => {
  it('a pinned dataset with EFFECT_SUGGESTED, a verified signal, counter-explanations and next actions → CANDIDATE_SITE_FOR_REVIEW with GeoJSON', () => {
    const report = investigateEnvironmentalCase(caseInput(-8, 'REAL_DATASET'));
    expect(report.verdict).toBe('EFFECT_SUGGESTED');
    const g = buildEnvironmentalCaseGraph({ report, actors, sites, sources, signals: [verifiedSignal, syntheticSignal], edges: [{ from: 'actor:permit-holder', to: 'site:A', relation: 'HOLDS_PERMIT_FOR', sourceIds: ['src:register'] }], counterExplanations: ['sensor relocation', 'seasonal traffic change'], nextActions: ['request permit inspection log', 'compare with satellite NO2 column'] });
    expect(g.status).toBe('CANDIDATE_SITE_FOR_REVIEW'); expect(g.epistemicStatus).toBe('MODEL');
    expect(g.nodes.map((n) => n.kind)).toEqual(expect.arrayContaining(['SOURCE', 'ACTOR', 'SITE']));
    expect(g.gis.features.map((f) => f.properties.kind)).toEqual(['SIGNAL', 'SITE']);
    expect(g.gis.features[0].geometry.coordinates).toEqual([-0.12, 51.5]);
    expect(g.disclaimer).toBe(CASE_GRAPH_DISCLAIMER);
    expect(JSON.stringify(g)).not.toMatch(/accus|guilt|culpab/i);
    expect(g.fingerprint).toBe(buildEnvironmentalCaseGraph({ report, actors, sites, sources, signals: [verifiedSignal, syntheticSignal], edges: [{ from: 'actor:permit-holder', to: 'site:A', relation: 'HOLDS_PERMIT_FOR', sourceIds: ['src:register'] }], counterExplanations: ['sensor relocation', 'seasonal traffic change'], nextActions: ['request permit inspection log', 'compare with satellite NO2 column'] }).fingerprint);
  });
  it('synthetic series, only synthetic signals, or missing counter-explanations → INSUFFICIENT_EVIDENCE with the reason', () => {
    const synth = buildEnvironmentalCaseGraph({ report: investigateEnvironmentalCase(caseInput(-8, 'SYNTHETIC')), sources, signals: [verifiedSignal], counterExplanations: ['x'], nextActions: ['y'] });
    expect(synth.status).toBe('INSUFFICIENT_EVIDENCE'); expect(synth.reasons.join(' ')).toMatch(/SYNTHETIC/);
    const real = investigateEnvironmentalCase(caseInput(-8, 'REAL_DATASET'));
    expect(buildEnvironmentalCaseGraph({ report: real, sources, signals: [syntheticSignal], counterExplanations: ['x'], nextActions: ['y'] }).reasons.join(' ')).toMatch(/no verified/);
    const noAlt = buildEnvironmentalCaseGraph({ report: real, sources, signals: [verifiedSignal], counterExplanations: [], nextActions: ['y'] });
    expect(noAlt.status).toBe('INSUFFICIENT_EVIDENCE'); expect(noAlt.reasons.join(' ')).toMatch(/counter-explanations/);
    expect(buildEnvironmentalCaseGraph({ report: investigateEnvironmentalCase(caseInput(0, 'REAL_DATASET')), sources, signals: [verifiedSignal], counterExplanations: ['x'], nextActions: ['y'] }).reasons.join(' ')).toMatch(/not EFFECT_SUGGESTED/);
  });
  it('refuses dangling edges, duplicate ids and out-of-range uncertainty; unknown source ids are reported', () => {
    const real = investigateEnvironmentalCase(caseInput(-8, 'REAL_DATASET'));
    expect(() => buildEnvironmentalCaseGraph({ report: real, sources, signals: [], edges: [{ from: 'a', to: 'b', relation: 'r', sourceIds: [] }], counterExplanations: [], nextActions: [] })).toThrow(/CASE_EDGE_DANGLING/);
    expect(() => buildEnvironmentalCaseGraph({ report: real, sites: [sites[0], sites[0]], sources, signals: [], counterExplanations: [], nextActions: [] })).toThrow(/CASE_NODE_DUPLICATE/);
    expect(() => buildEnvironmentalCaseGraph({ report: real, sources, signals: [{ ...verifiedSignal, uncertainty: 2 }], counterExplanations: [], nextActions: [] })).toThrow(/UNCERTAINTY_OUT_OF_RANGE/);
    const g = buildEnvironmentalCaseGraph({ report: real, sources, signals: [{ ...verifiedSignal, sourceId: 'src:nope' }], counterExplanations: ['x'], nextActions: ['y'] });
    expect(g.reasons.join(' ')).toMatch(/unknown source src:nope/); expect(g.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});
