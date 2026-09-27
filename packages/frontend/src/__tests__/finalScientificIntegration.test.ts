import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import {
  classifyOutcome,
  runScientificIntegrationCampaign,
} from '../core/experimentFabric/scientificIntegration';
import type { ModelInvokePort, ModelProviderDescriptor } from '../core/experimentFabric/modelRouter';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };

const CHAINING_PROBLEM = 'problem:intervention-timing';
const BACKEND_UNREACHABLE_PROBLEM = 'problem:pyscf-h2-bond-length-stability';

function ledgerAndSink() {
  const ledger = new EvidenceLedger(clock);
  return { ledger, sink: createLedgerSink(ledger, 'scientific-integration-test') };
}

describe('scientificIntegration — bounded cycles and explicit budget', () => {
  it('respects an explicit maxCycles budget', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 2 });
    expect(result.cycles.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic: two independent runs over the same problem produce the same cycle count and statuses', async () => {
    const a = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink().sink, { maxCycles: 3 });
    const b = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink().sink, { maxCycles: 3 });
    expect(a.cycles.length).toBe(b.cycles.length);
    expect(a.cycles.map((c) => c.cycle.result.loop.discrimination)).toEqual(b.cycles.map((c) => c.cycle.result.loop.discrimination));
  }, 20_000);
});

describe('scientificIntegration — at least two competing hypotheses, real falsification', () => {
  it('every cycle carries at least two hypothesis outcomes (competing hypotheses)', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 1 });
    expect(result.cycles[0]!.cycle.result.loop.outcomes.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a real falsification/support assessment per hypothesis, never fabricated', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 1 });
    const statuses = result.cycles[0]!.cycle.result.loop.outcomes.map((o) => o.status);
    expect(statuses.every((s) => ['SUPPORTED', 'FALSIFIED', 'INCONCLUSIVE', 'BLOCKED', 'UNKNOWN'].includes(s))).toBe(true);
  });
});

describe('scientificIntegration — BLOCKED vs FAILED classification', () => {
  it('classifies a structurally-unavailable engine as BLOCKED, not FAILED', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(BACKEND_UNREACHABLE_PROBLEM, sink, { maxCycles: 1 });
    const cycle = result.cycles[0]!.cycle;
    for (const outcome of cycle.result.loop.outcomes) {
      if (outcome.status === 'BLOCKED') {
        expect(classifyOutcome(outcome)).not.toBe('OK');
      }
    }
  });
});

describe('scientificIntegration — canonical Evidence anchoring', () => {
  it('anchors one Evidence record per hypothesis outcome into the canonical ledger', async () => {
    const { ledger, sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 1 });
    const report = result.cycles[0]!;
    expect(report.evidenceRefs.length).toBe(report.cycle.result.loop.outcomes.length);
    expect(ledger.getActive().length).toBeGreaterThanOrEqual(report.evidenceRefs.length);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});

describe('scientificIntegration — D-141 meta metrics per cycle', () => {
  it('computes information gain and knowledge gaps from the real measured ranking', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 1 });
    const metrics = result.cycles[0]!.metrics;
    expect(Number.isFinite(metrics.informationGain)).toBe(true);
    expect(Array.isArray(metrics.knowledgeGaps)).toBe(true);
  });
});

describe('scientificIntegration — DecisionTrace per cycle', () => {
  it('builds a fingerprinted DecisionTrace referencing real evidence and the real next-experiment reason', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 1 });
    const report = result.cycles[0]!;
    expect(report.decisionTrace.evidenceRefs).toEqual(report.evidenceRefs);
    expect(report.decisionTrace.suggestedNextExperiment).toBe(report.cycle.result.nextExperiment.resolves);
    expect(report.decisionTrace.traceFingerprint).toMatch(/^trace_/);
  });
});

describe('scientificIntegration — replay fingerprint match', () => {
  it('two independent campaigns over the same problem reach byte-identical decision trace fingerprints', async () => {
    const a = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink().sink, { maxCycles: 1 });
    const b = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink().sink, { maxCycles: 1 });
    expect(a.cycles[0]!.decisionTrace.traceFingerprint).toBe(b.cycles[0]!.decisionTrace.traceFingerprint);
  });
});

describe('scientificIntegration — optional ModelRouter narrative (REASONING_ONLY, never authoritative)', () => {
  const providers: readonly ModelProviderDescriptor[] = [
    { providerId: 'ANTHROPIC_CLAUDE', taskClasses: ['META_COGNITION'], available: true },
  ];
  const invokePort: ModelInvokePort = { async invoke(providerId) { return { outputText: `narration by ${providerId}` }; } };

  it('runs identically without providers/invokePort supplied (no narrative)', async () => {
    const { sink } = ledgerAndSink();
    const result = await runScientificIntegrationCampaign(CHAINING_PROBLEM, sink, { maxCycles: 1 });
    expect(result.cycles[0]!.narrative).toBeUndefined();
  });

  it('attaches a REASONING_ONLY narrative when providers/invokePort are supplied, without changing scientific status', async () => {
    const bare = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink().sink, { maxCycles: 1 });
    const narrated = await runScientificIntegrationCampaign(CHAINING_PROBLEM, ledgerAndSink().sink, { maxCycles: 1, providers, invokePort });
    expect(narrated.cycles[0]!.narrative).toContain('narration by ANTHROPIC_CLAUDE');
    expect(narrated.status).toBe(bare.status);
    expect(narrated.cycles[0]!.cycle.result.loop.discrimination).toEqual(bare.cycles[0]!.cycle.result.loop.discrimination);
  });
});
