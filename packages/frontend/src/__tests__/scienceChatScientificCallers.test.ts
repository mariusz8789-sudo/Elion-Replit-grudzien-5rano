import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { runScientificIntegrationCampaign } from '../core/experimentFabric/scientificIntegration';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';

const executeResolvedCampaign = async (message: string) => {
  const resolved = resolveCommand(message, null);
  if (resolved.action?.type !== 'runScientificIntegration') throw new Error(`Not routed: ${message}`);
  let tick = 5_000;
  const ledger = new EvidenceLedger({ now: () => tick++ });
  const sink = createLedgerSink(ledger, `science-chat-test-${resolved.action.purpose.toLowerCase()}`);
  const result = await runScientificIntegrationCampaign(resolved.action.problemId, sink, {
    maxCycles: 1,
    ...(resolved.action.painQuestion === undefined ? {} : { painQuestion: resolved.action.painQuestion }),
    ...(resolved.action.physicsClaims === undefined ? {} : { physicsClaims: resolved.action.physicsClaims }),
  });
  return { resolved, result, ledger, sink };
};

describe('Science Chat real scientific-integration callers', () => {
  it('routes pain research through the existing campaign and reports the missing pain model honestly', async () => {
    const { resolved, result, ledger, sink } = await executeResolvedCampaign('/pain-research Explore mechanisms of chronic neuropathic pain.');
    expect(resolved.action).toMatchObject({ type: 'runScientificIntegration', purpose: 'PAIN_RESEARCH' });
    expect(result.painResearchResult).toMatchObject({
      status: 'BLOCKED',
      governance: {
        scope: 'SIMULATION_ONLY',
        deviceClaim: 'NOT_A_MEDICAL_DEVICE',
        researchPriorityDisclaimer: 'RESEARCH_PRIORITY_NOT_CLINICAL_EFFICACY',
      },
    });
    expect(sink.hashes.length).toBeGreaterThan(0);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it.each([
    ['/physics-claim An Einstein-Rosen wormhole is a hypothetical geometry.', 'WORMHOLE', 'HYPOTHESIS'],
    ['/physics-claim Five alternative multiverse branches are simulated.', 'MULTIVERSE', 'SIMULATION'],
    ['/physics-claim Time dilation is represented by this model.', 'TIME_DILATION', 'MODEL'],
    ['/physics-claim A gravity well is represented by this model.', 'GRAVITY_WELL', 'MODEL'],
    ['/physics-claim Historical reconstruction of Boston remains unsourced.', 'HISTORICAL_RECONSTRUCTION', 'INSUFFICIENT_EVIDENCE'],
    ['/physics-claim Historical reconstruction of Boston. source:archive/boston-1775', 'HISTORICAL_RECONSTRUCTION', 'RECONSTRUCTION'],
  ])('routes and validates %s', async (message, category, requiredLabel) => {
    const { result, ledger, sink } = await executeResolvedCampaign(message);
    expect(result.spacetimeIntegrityResults).toHaveLength(1);
    expect(result.spacetimeIntegrityResults?.[0]).toMatchObject({ ok: true, requiredLabel, claim: { category } });
    expect(sink.hashes.length).toBeGreaterThan(0);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('rejects backward-time-travel assertions instead of upgrading them', async () => {
    const { result } = await executeResolvedCampaign('/physics-claim A wormhole let us travel back in time and change the past.');
    expect(result.spacetimeIntegrityResults?.[0]).toMatchObject({ ok: false, requiredLabel: 'HYPOTHESIS' });
    expect(result.spacetimeIntegrityResults?.[0]?.reason).toMatch(/SPACETIME_INTEGRITY_REJECTED/);
  });
});
