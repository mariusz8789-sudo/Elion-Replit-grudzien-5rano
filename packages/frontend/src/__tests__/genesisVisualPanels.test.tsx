import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PipelineTimeline } from '../components/genesis-ui/PipelineTimeline';
import { CandidateSpaceMap, classifyElimination } from '../components/genesis-ui/CandidateSpaceMap';
import { WinnerGateDiagram } from '../components/genesis-ui/WinnerGateDiagram';
import { ProvenanceDag, buildProvenanceGraph, DAG_COLUMNS } from '../components/genesis-ui/ProvenanceDag';
import { ReplayTwinPanel, compareStages } from '../components/genesis-ui/ReplayTwinPanel';
import { VerdictWhyStrip } from '../components/genesis-ui/VerdictWhyStrip';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../core/orchestrator/winnerRecord';
import type { StageRecord } from '../core/orchestrator/contracts';
import type { GenesisDomainReplayResult } from '../core/orchestrator/genesisDomainRegistry';

/**
 * D-117 — the visual layer over one real run. Every component below is a pure
 * projection, so it is tested against the COMMITTED, replay-verified
 * artifact of the real LOWER-HARM PRODUCTION run (artifacts/lower-harm/*),
 * never against a hand-written fixture that could drift from the pipeline.
 * The NO_WINNER paths use the same real detail with a synthetic blocker so
 * the "honest failure" rendering is covered too.
 */
const ARTIFACT_DIR = new URL('../../../../artifacts/lower-harm/', import.meta.url);
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, ARTIFACT_DIR), 'utf8')) as T;
const detail = readJson<LowerHarmRunDetail>('run-detail.json');
const record = readJson<LowerHarmWinnerRecord>('winner-record.json');
const replayArtifact = readJson<{ stages: readonly { stage: string; status: string; fingerprint: string }[] }>('replay-verification.json');
const stages = replayArtifact.stages as unknown as readonly StageRecord[];

const blocker: NoWinnerBlocker = {
  kind: 'NO_WINNER_BLOCKER',
  blockedAt: 'ADJUDICATION_CONJUNCT',
  verdict: 'NO_WINNER',
  failedConjuncts: [{ criterion: 'G2_SEPARATES_TOP2', held: false, detail: 'synthetic: bands overlap' }],
  refusedGates: [],
  stageNote: null,
  reason: 'synthetic blocker for rendering coverage',
};

describe('PipelineTimeline', () => {
  it('renders every one of the 20 stages in order with its status class and fingerprint prefix', () => {
    const html = renderToStaticMarkup(<PipelineTimeline stages={stages} />);
    expect(stages.length).toBe(20);
    expect(html).toContain('20 stages, 20 OK');
    for (const s of stages) {
      expect(html).toContain(`data-testid="timeline-${s.stage}"`);
      expect(html).toContain(s.fingerprint.slice(0, 6));
    }
    expect(html.indexOf('timeline-01_FORMALIZE')).toBeLessThan(html.indexOf('timeline-20_'));
    expect((html.match(/gu-timeline-ok/g) ?? []).length).toBe(20);
  });

  it('shows a non-OK stage with its own status class instead of hiding it', () => {
    const html = renderToStaticMarkup(<PipelineTimeline stages={[{ stage: '01_FORMALIZE', status: 'ABORTED', fingerprint: 'deadbeef00', note: 'x' }]} />);
    expect(html).toContain('gu-timeline-aborted');
    expect(html).toContain('1 stages, 0 OK');
  });
});

describe('CandidateSpaceMap', () => {
  it('plots every candidate of the real run, rings exactly the TOP2 pair and classifies each real elimination reason', () => {
    const html = renderToStaticMarkup(<CandidateSpaceMap candidates={detail.candidates} />);
    for (const c of detail.candidates) expect(html).toContain(`data-testid="cmap-${c.candidateId}"`);
    expect((html.match(/gu-cmap-top2"/g) ?? []).length + (html.match(/gu-cmap-top2 /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((html.match(/gu-cmap-ring/g) ?? []).length).toBe(2);
    const classes = new Set(detail.candidates.map(classifyElimination));
    expect(classes.has('QUALIFIES')).toBe(true);
    expect(classes.has('SAFETY_VETO')).toBe(true);
    expect(classes.has('BELOW_FLOOR')).toBe(true);
    expect(classes.has('INSUFFICIENT_EVIDENCE')).toBe(true);
    expect(classes.has('OTHER')).toBe(false); // every real elimination has a named class
  });

  it('never drops an eliminated candidate — the map has one point per candidate, tooltips carry the real reason', () => {
    const html = renderToStaticMarkup(<CandidateSpaceMap candidates={detail.candidates} />);
    expect((html.match(/class="gu-cmap-point/g) ?? []).length).toBe(detail.candidates.length);
    const vetoed = detail.candidates.find((c) => classifyElimination(c) === 'SAFETY_VETO')!;
    expect(html).toContain(vetoed.eliminationReason!.slice(0, 30));
  });
});

describe('WinnerGateDiagram', () => {
  it('draws the three real conjuncts as HELD gates, the open end-cap says WINNER, and the G2 band carries both TOP2 candidates', () => {
    const html = renderToStaticMarkup(
      <WinnerGateDiagram conjuncts={detail.conjuncts} falsification={detail.falsification} gateDecisions={detail.gateDecisions} verdict="WINNER" />,
    );
    expect(detail.conjuncts.length).toBe(3);
    for (const c of detail.conjuncts) expect(html).toContain(`data-testid="gate-diagram-${c.criterion}"`);
    expect((html.match(/gu-gated-held/g) ?? []).length).toBe(3);
    expect(html).not.toContain('gu-gated-failed');
    expect(html).toContain('gu-gated-end-open');
    expect(html).toContain('>WINNER<');
    for (const id of detail.top2Ids) expect(html).toContain(`data-testid="g2-band-${id}"`);
    expect(html).toContain(detail.falsification!.decisionRuleFingerprint!.slice(0, 8));
  });

  it('a failed conjunct closes the flow: the gate is FAILED, later gates are unreached and the end-cap is closed', () => {
    const conjuncts = detail.conjuncts.map((c, i) => (i === 1 ? { ...c, held: false } : c));
    const html = renderToStaticMarkup(<WinnerGateDiagram conjuncts={conjuncts} falsification={null} gateDecisions={[]} verdict="NO_WINNER" />);
    expect((html.match(/gu-gated-failed/g) ?? []).length).toBe(1);
    expect((html.match(/gu-gated-unreached/g) ?? []).length).toBe(1);
    expect(html).toContain('gu-gated-end-closed');
    expect(html).toContain('>NO_WINNER<');
    expect(html).not.toContain('data-testid="g2-band"');
  });
});

describe('ProvenanceDag', () => {
  it('builds one node per real artefact of the run and ends at the WinnerRecord', () => {
    const g = buildProvenanceGraph(detail, record, record.evidenceCustody);
    const ids = g.nodes.map((n) => n.id);
    for (const e of detail.evidence) expect(ids).toContain(`obs:${e.nctId}:${e.candidateId}`);
    for (const id of detail.top2Ids) expect(ids).toContain(`cand:${id}`);
    for (const gd of detail.gateDecisions) expect(ids).toContain(`gate:${gd.candidateId}`);
    expect(g.nodes.find((n) => n.id === 'outcome')?.kind).toBe('record');
    expect(g.nodes.find((n) => n.id === 'outcome')?.sub).toContain(record.recordFingerprint);
    expect(g.nodes.find((n) => n.id === 'custody')?.sub).toContain(record.evidenceCustody!.hash!.slice(0, 12));
    // every edge joins two existing nodes, and every observation hangs off custody
    for (const e of g.edges) { expect(ids).toContain(e.from); expect(ids).toContain(e.to); }
    expect(g.edges.filter((e) => e.from === 'custody').length).toBe(detail.evidence.length);
    expect(g.edges.some((e) => e.from === `gate:${record.winnerId}` && e.to === 'outcome')).toBe(true);
    expect(new Set(g.nodes.map((n) => n.column)).size).toBe(DAG_COLUMNS.length);
  });

  it('a NO_WINNER run ends at the blocker node, in red, naming the stage that blocked', () => {
    const g = buildProvenanceGraph(detail, blocker, null);
    const outcome = g.nodes.find((n) => n.id === 'outcome')!;
    expect(outcome.kind).toBe('blocker');
    expect(outcome.tone).toBe('fail');
    expect(outcome.sub).toBe('ADJUDICATION_CONJUNCT');
    expect(g.nodes.find((n) => n.id === 'custody')?.label).toContain('not recorded');
    const html = renderToStaticMarkup(<ProvenanceDag detail={detail} record={blocker} custody={null} />);
    expect(html).toContain('gu-dag-blocker');
    expect(html).toContain('data-testid="dag-outcome"');
  });

  it('renders the real run as SVG with a node per graph entry', () => {
    const html = renderToStaticMarkup(<ProvenanceDag detail={detail} record={record} custody={record.evidenceCustody} />);
    const g = buildProvenanceGraph(detail, record, record.evidenceCustody);
    for (const n of g.nodes) expect(html).toContain(`data-testid="dag-${n.id}"`);
    expect((html.match(/gu-dag-edge/g) ?? []).length).toBe(g.edges.length);
  });
});

describe('ReplayTwinPanel', () => {
  const runLike = (over: Partial<{ stages: readonly StageRecord[] }> = {}) => ({
    kind: 'RUN' as const, verdict: 'WINNER', auditFingerprint: 'a', stages, ...over,
  }) as unknown as GenesisDomainReplayResult['first'];

  it('two identical stage lists match on every row', () => {
    const rows = compareStages(stages, stages);
    expect(rows.length).toBe(20);
    expect(rows.every((r) => r.match)).toBe(true);
    const html = renderToStaticMarkup(<ReplayTwinPanel replay={{ ok: true, first: runLike(), second: runLike() }} />);
    expect(html).toContain('all fingerprints identical');
    expect(html).not.toContain('gu-twin-mismatch');
  });

  it('a single differing fingerprint is flagged on exactly that row and in the header', () => {
    const drifted = stages.map((s, i) => (i === 7 ? { ...s, fingerprint: 'ffffffffff' } : s));
    const rows = compareStages(stages, drifted);
    expect(rows.filter((r) => !r.match).map((r) => r.stage)).toEqual([stages[7]!.stage]);
    const html = renderToStaticMarkup(<ReplayTwinPanel replay={{ ok: false, first: runLike(), second: runLike({ stages: drifted }) }} />);
    expect(html).toContain('1 differ');
    expect((html.match(/gu-twin-mismatch/g) ?? []).length).toBe(1);
  });

  it('a blocked run is reported, not compared', () => {
    const blocked = { kind: 'EXECUTION_BLOCKED', code: 'X', error: 'e', fingerprint: 'f' } as unknown as GenesisDomainReplayResult['first'];
    const html = renderToStaticMarkup(<ReplayTwinPanel replay={{ ok: false, first: runLike(), second: blocked }} />);
    expect(html).toContain('nothing to compare');
  });
});

describe('VerdictWhyStrip', () => {
  it('lists each conjunct as a held chip, the favourite gate outcome and the record fingerprint for the real WINNER run', () => {
    const html = renderToStaticMarkup(<VerdictWhyStrip detail={detail} record={record} />);
    expect((html.match(/gu-why-held/g) ?? []).length).toBe(4); // 3 conjuncts + record chip
    expect(html).toContain('REQUIRES HUMAN APPROVAL');
    expect(html).toContain(record.recordFingerprint);
    expect(html).toContain(`${detail.evidence.length} real observations`);
  });

  it('names the blocker for a NO_WINNER run', () => {
    const html = renderToStaticMarkup(<VerdictWhyStrip detail={detail} record={blocker} />);
    expect(html).toContain('blocked at ADJUDICATION_CONJUNCT');
  });
});
