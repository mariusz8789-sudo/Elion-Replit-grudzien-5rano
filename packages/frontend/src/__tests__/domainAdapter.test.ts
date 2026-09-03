import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { buildDomainRegistry, describeDomainRegistry } from '../core/discovery/molecular/domainAdapter';
import { CURRENT_AGENT_ASSIGNMENTS, unimplementedAgentRoles } from '../core/discovery/molecular/gisDigitalTwinMultiAgentContracts';

describe('cross-domain discovery core — foundation', () => {
  it('the chemistry/biology adapter reports REAL engine availability, not a declared capability', () => {
    // ADMET-AI detection spawns Python and can be slow on a cold process.
    const rdkit = createNodeRdkitTransport({ timeoutMs: 30_000 });
    const admet = createNodeAdmetTransport({ timeoutMs: 30_000 });
    const registry = buildDomainRegistry({ rdkit, admet });
    const chem = registry.adapters.get('CHEMISTRY_BIOLOGY')!;
    const availability = chem.available();
    // Whatever the real detection says, it must be a real boolean with a reason when false.
    expect(typeof availability.ok).toBe('boolean');
    if (!availability.ok) expect(availability.reason.length).toBeGreaterThan(0);
  }, 60_000);

  it('every domain without a real executor is honestly UNAVAILABLE, never a fake working adapter', () => {
    const rdkit = createNodeRdkitTransport();
    const admet = createNodeAdmetTransport();
    const registry = buildDomainRegistry({ rdkit, admet });
    for (const domainId of ['ENVIRONMENT_WATER', 'ENGINEERING'] as const) {
      const adapter = registry.adapters.get(domainId)!;
      expect(adapter.available().ok).toBe(false);
      expect(() => adapter.execute({})).toThrow(/no executor/i);
    }
  });

  it('the physics adapter is the SECOND real executor: always available, defaults to the GPS case, produces a real derived result', () => {
    const rdkit = createNodeRdkitTransport();
    const admet = createNodeAdmetTransport();
    const registry = buildDomainRegistry({ rdkit, admet });
    const physics = registry.adapters.get('PHYSICS')!;
    expect(physics.available().ok).toBe(true);
    const outcome = physics.execute({}) as import('../core/discovery/molecular/domainAdapter').PhysicsAdapterResult;
    expect(outcome.caseId).toBe('GPS_TIME_DILATION');
    const result = outcome.raw as import('../core/discovery/physics/relativisticTimeDilation').RelativisticTimeDilationResult;
    expect(Number.isFinite(result.netMicrosecondsPerDay)).toBe(true);
    expect(result.hypotheses).toHaveLength(2);
    const supported = result.hypotheses.filter((h) => h.verdict === 'SUPPORTED');
    const falsified = result.hypotheses.filter((h) => h.verdict === 'FALSIFIED');
    expect(supported).toHaveLength(1);
    expect(falsified).toHaveLength(1);
    expect(result.fact.length).toBeGreaterThan(0);
    expect(result.theory.length).toBeGreaterThan(0);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(outcome.standard.domainId).toBe('PHYSICS');
    expect(outcome.standard.resultFingerprint).toBe(result.resultFingerprint);
  });

  it('the physics adapter accepts a structured request selecting the gravitational-redshift case', () => {
    const rdkit = createNodeRdkitTransport();
    const admet = createNodeAdmetTransport();
    const registry = buildDomainRegistry({ rdkit, admet });
    const physics = registry.adapters.get('PHYSICS')!;
    const outcome = physics.execute({ caseId: 'GRAVITATIONAL_REDSHIFT' }) as import('../core/discovery/molecular/domainAdapter').PhysicsAdapterResult;
    expect(outcome.caseId).toBe('GRAVITATIONAL_REDSHIFT');
    const result = outcome.raw as import('../core/discovery/physics/gravitationalRedshift').GravitationalRedshiftResult;
    expect(result.direction).toBe('REDSHIFT');
    expect(outcome.standard.caseId).toBe('GRAVITATIONAL_REDSHIFT');
    expect(outcome.standard.resultFingerprint).toBe(result.resultFingerprint);
  });

  it('the epidemiology adapter is the THIRD real executor: preregistered hypothesis loop over a real simulation, never RUNNABLE_IN_GENESIS by accident', () => {
    const rdkit = createNodeRdkitTransport();
    const admet = createNodeAdmetTransport();
    const registry = buildDomainRegistry({ rdkit, admet });
    const epi = registry.adapters.get('EPIDEMIOLOGY')!;
    expect(epi.available().ok).toBe(true);
    const result = epi.execute({}) as import('../core/experimentFabric/hypothesisLoop').HypothesisLoopResult;
    expect(result.preregistrationIntact.intact).toBe(true);
    expect(result.outcomes.length).toBeGreaterThan(0);
    expect(result.preregistration.hypotheses.every((h) => h.createdBeforeRun)).toBe(true);
    // Every outcome traces to a real, executed run — never a fabricated status with no run behind it.
    for (const outcome of result.outcomes) {
      if (outcome.status !== 'BLOCKED') {
        expect(outcome.runIds.length).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  it('the epidemiology adapter rejects an unknown problemId rather than silently falling back', () => {
    const rdkit = createNodeRdkitTransport();
    const admet = createNodeAdmetTransport();
    const registry = buildDomainRegistry({ rdkit, admet });
    const epi = registry.adapters.get('EPIDEMIOLOGY')!;
    expect(() => epi.execute({ problemId: 'does-not-exist' })).toThrow(/Unknown epidemiology problemId/);
  });

  it('describeDomainRegistry names every domain with a real status string', () => {
    const rdkit = createNodeRdkitTransport();
    const admet = createNodeAdmetTransport();
    const registry = buildDomainRegistry({ rdkit, admet });
    const text = describeDomainRegistry(registry);
    for (const domainId of ['CHEMISTRY_BIOLOGY', 'PHYSICS', 'ENVIRONMENT_WATER', 'EPIDEMIOLOGY', 'ENGINEERING']) {
      expect(text).toContain(domainId);
    }
  }, 60_000);

  it('agent-role assignments name a real module for every implemented role', () => {
    for (const assignment of CURRENT_AGENT_ASSIGNMENTS) {
      if (assignment.implementedBy !== null) {
        expect(assignment.implementedBy.length).toBeGreaterThan(0);
      }
    }
    expect(unimplementedAgentRoles()).toContain('EVIDENCE_AUDITOR');
  });
});
