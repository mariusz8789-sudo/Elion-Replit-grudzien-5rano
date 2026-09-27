import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import {
  attachSolverVerification,
  routeModelRequest,
  type ModelInvokePort,
  type ModelProviderDescriptor,
  type ModelRoutingResult,
} from '../core/experimentFabric/modelRouter';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };

const stubInvoke: ModelInvokePort = {
  async invoke(providerId, request) {
    return { outputText: `stub:${providerId}:${request.taskClass}` };
  },
};

function providers(overrides: readonly ModelProviderDescriptor[] = []): readonly ModelProviderDescriptor[] {
  return overrides.length > 0 ? overrides : [
    { providerId: 'ANTHROPIC_CLAUDE', taskClasses: ['SCIENTIFIC_REASONING', 'META_COGNITION'], available: true },
    { providerId: 'OPENAI_ASTRA', taskClasses: ['WORLD_AUTHOR', 'SCIENTIFIC_REASONING'], available: true },
    { providerId: 'PRIVATE_LOCAL', taskClasses: ['GENERAL_CODING'], available: true },
  ];
}

describe('ModelRouter — deterministic routing', () => {
  it('picks the first available, capable provider in declared list order', async () => {
    const a = await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'p' }, providers(), stubInvoke);
    expect(a.status).toBe('ROUTED');
    expect((a as ModelRoutingResult).providerId).toBe('ANTHROPIC_CLAUDE');
  });

  it('is repeatable: identical input always yields the identical decision', async () => {
    const first = await routeModelRequest({ taskClass: 'WORLD_AUTHOR', prompt: 'design a world' }, providers(), stubInvoke);
    const second = await routeModelRequest({ taskClass: 'WORLD_AUTHOR', prompt: 'design a world' }, providers(), stubInvoke);
    expect(first).toEqual(second);
  });

  it('reorders selection when the caller reorders declared priority', async () => {
    const reordered = [
      { providerId: 'OPENAI_ASTRA' as const, taskClasses: ['SCIENTIFIC_REASONING' as const], available: true },
      { providerId: 'ANTHROPIC_CLAUDE' as const, taskClasses: ['SCIENTIFIC_REASONING' as const], available: true },
    ];
    const result = await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'p' }, reordered, stubInvoke);
    expect((result as ModelRoutingResult).providerId).toBe('OPENAI_ASTRA');
  });
});

describe('ModelRouter — BLOCKED paths', () => {
  it('returns BLOCKED when no declared provider is available for the task class', async () => {
    const result = await routeModelRequest(
      { taskClass: 'DRUG_CANDIDATE_RESEARCH', prompt: 'p' },
      providers(),
      stubInvoke,
    );
    expect(result.status).toBe('BLOCKED');
  });

  it('returns BLOCKED when the only capable provider is unavailable', async () => {
    const result = await routeModelRequest(
      { taskClass: 'GENERAL_CODING', prompt: 'p' },
      [{ providerId: 'PRIVATE_LOCAL', taskClasses: ['GENERAL_CODING'], available: false }],
      stubInvoke,
    );
    expect(result.status).toBe('BLOCKED');
  });

  it('returns BLOCKED for an unknown task class', async () => {
    const result = await routeModelRequest({ taskClass: 'NOT_A_REAL_TASK_CLASS', prompt: 'p' }, providers(), stubInvoke);
    expect(result.status).toBe('BLOCKED');
  });
});

describe('ModelRouter — evidence emission', () => {
  it('emits an Evidence record for a routed decision when a sink is supplied', async () => {
    const ledger = new EvidenceLedger(clock);
    const sink = createLedgerSink(ledger, 'test-world');
    const result = await routeModelRequest({ taskClass: 'META_COGNITION', prompt: 'p' }, providers(), stubInvoke, sink);
    expect(result.status).toBe('ROUTED');
    expect((result as ModelRoutingResult).evidenceRef).not.toBeNull();
    expect(ledger.getActive().length).toBe(1);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('emits an Evidence record for a BLOCKED decision too', async () => {
    const ledger = new EvidenceLedger(clock);
    const sink = createLedgerSink(ledger, 'test-world');
    await routeModelRequest({ taskClass: 'DRUG_CANDIDATE_RESEARCH', prompt: 'p' }, providers(), stubInvoke, sink);
    expect(ledger.getActive().length).toBe(1);
  });
});

describe('ModelRouter — solver verification boundary', () => {
  it('a routed reasoning-only result is never VERIFIED_BY_SOLVER on its own', async () => {
    const result = (await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'p' }, providers(), stubInvoke)) as ModelRoutingResult;
    expect(result.kind).toBe('REASONING_ONLY');
  });

  it('attachSolverVerification upgrades kind only when given real Evidence refs', async () => {
    const result = (await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'p' }, providers(), stubInvoke)) as ModelRoutingResult;
    const verified = attachSolverVerification(result, {
      solverId: 'newtonian-kinematics',
      solverVersion: '1.0.0',
      evidenceRefs: [{ id: 'EV-abc', contentHash: 'abc123' }],
    });
    expect(verified.kind).toBe('VERIFIED_BY_SOLVER');
    expect(verified.solverVerification.evidenceRefs.length).toBeGreaterThan(0);
  });

  it('attachSolverVerification rejects a verification with zero Evidence refs — text alone cannot self-promote', async () => {
    const result = (await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'p' }, providers(), stubInvoke)) as ModelRoutingResult;
    expect(() => attachSolverVerification(result, { solverId: 'x', solverVersion: '1.0.0', evidenceRefs: [] })).toThrow(
      /MODEL_ROUTER_VERIFICATION_REJECTED/,
    );
  });
});
