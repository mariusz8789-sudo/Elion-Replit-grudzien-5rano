import { describe, expect, it } from 'vitest';
import type { GenesisSelfModel, ScientificClaimProposal } from '../core/backend/client';
import { routeModelRequest } from '../core/experimentFabric/modelRouter';
import { backendReasoningDescriptor, createBackendReasoningPort } from '../core/experimentFabric/backendReasoningPort';

/** ENTITY-3: the router reaches the backend adapter through its own port; the result stays REASONING_ONLY. */
const selfWith = (status: string, providerId: string | null) => ({ knownModels: [{ kind: 'REASONING_MODEL', status, providerId, model: 'm' }] }) as unknown as GenesisSelfModel;

const PROPOSAL = { proposalId: 'claim-1', claim: 'X may be an agonist', claimType: 'HYPOTHESIS', status: 'PROPOSED', generatedBy: { providerId: 'ANTHROPIC_CLAUDE' } } as unknown as ScientificClaimProposal;

describe('backend reasoning port', () => {
  it('is available to the router only when the backend self model says CONFIGURED', () => {
    expect(backendReasoningDescriptor(selfWith('CONFIGURED', 'ANTHROPIC_CLAUDE'))).toMatchObject({ providerId: 'ANTHROPIC_CLAUDE', available: true });
    expect(backendReasoningDescriptor(selfWith('BLOCKED_BY_PROVIDER_CONFIGURATION', null))).toBeNull();
    expect(backendReasoningDescriptor(null)).toBeNull();
  });

  it('routes a scientific question to the backend and never upgrades the answer', async () => {
    const descriptor = backendReasoningDescriptor(selfWith('CONFIGURED', 'ANTHROPIC_CLAUDE'))!;
    const questions: string[] = [];
    const port = createBackendReasoningPort(async ({ question }) => { questions.push(question); return { ok: true, data: { status: 'PROPOSED', proposal: PROPOSAL } }; });
    const routed = await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'Is X an agonist?' }, [descriptor], port);
    expect(routed.status).toBe('ROUTED');
    if (routed.status !== 'ROUTED') return;
    expect(routed.kind).toBe('REASONING_ONLY');
    expect(questions).toEqual(['Is X an agonist?']);
    expect(JSON.parse(routed.outputText)).toMatchObject({ status: 'PROPOSED', proposal: { status: 'PROPOSED', claimType: 'HYPOTHESIS' } });
  });

  it('passes a backend refusal through as its status, and blocks when no provider is configured', async () => {
    const port = createBackendReasoningPort(async () => ({ ok: false, status: 503, error: 'BLOCKED_BY_PROVIDER_CONFIGURATION', message: '' }));
    const out = await port.invoke('ANTHROPIC_CLAUDE', { taskClass: 'SCIENTIFIC_REASONING', prompt: 'q' });
    expect(JSON.parse(out.outputText)).toEqual({ status: 'BLOCKED_BY_PROVIDER_CONFIGURATION', proposal: null });
    const blocked = await routeModelRequest({ taskClass: 'SCIENTIFIC_REASONING', prompt: 'q' }, [], port);
    expect(blocked.status).toBe('BLOCKED');
  });
});
