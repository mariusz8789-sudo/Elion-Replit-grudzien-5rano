/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerCascadeCandidate } from '../core/hazard/cascadeCandidate';
import type { CascadeCandidate } from '../core/hazard/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const HAZARD_DIR = join(HERE, '..', 'core', 'hazard');

describe('CascadeCandidate — worked example (Earthquake -> road closure -> hospital access)', () => {
  it('registers the hypothesis as BLOCKED once a concrete evidence gap is named, never as affirmed', () => {
    const candidate = registerCascadeCandidate({
      sourceHazardRunId: 'run_eq_demo',
      sourceHazardType: 'earthquake',
      potentialEffect: 'road closure near a severely shaken site',
      candidateDependency: 'change in hospital accessibility',
      evidenceRequired: [
        { requirement: 'road-network-topology-model', rationale: 'No routing/infrastructure graph exists to determine which roads serve which facilities.' },
        { requirement: 'structural-damage-to-road-infrastructure-model', rationale: 'DamageAssessment for buildings is NOT_MODELED; road/bridge structural response is a separate, also-missing model.' },
      ],
    });

    expect(candidate.validationStatus).toBe('BLOCKED');
    expect(candidate.validationReason).toContain('road-network-topology-model');
    expect(candidate.sourceHazardType).toBe('earthquake');
    expect(candidate.cascadeCandidateId).toMatch(/^cascade_run_eq_demo_/);
  });
});

describe('CascadeCandidate — type-level honesty guarantee', () => {
  it('an unexamined hypothesis (no evidence requirement named) is NOT_MODELED, not silently dropped', () => {
    const candidate = registerCascadeCandidate({
      sourceHazardRunId: 'run_eq_demo',
      sourceHazardType: 'earthquake',
      potentialEffect: 'possible aftershock-triggered landslide',
      candidateDependency: 'possible additional exposure at a downslope site',
      evidenceRequired: [],
    });
    expect(candidate.validationStatus).toBe('NOT_MODELED');
    expect(candidate.validationReason.length).toBeGreaterThan(0);
  });

  it('validationStatus can never be anything but NOT_MODELED or BLOCKED for any input', () => {
    const allowed = new Set(['NOT_MODELED', 'BLOCKED']);
    const empty = registerCascadeCandidate({
      sourceHazardRunId: 'run-x', sourceHazardType: 'earthquake', potentialEffect: 'x', candidateDependency: 'y', evidenceRequired: [],
    });
    const withEvidence = registerCascadeCandidate({
      sourceHazardRunId: 'run-x', sourceHazardType: 'earthquake', potentialEffect: 'x', candidateDependency: 'y',
      evidenceRequired: [{ requirement: 'r', rationale: 'because' }],
    });
    expect(allowed.has(empty.validationStatus)).toBe(true);
    expect(allowed.has(withEvidence.validationStatus)).toBe(true);
  });

  it('is pure and deterministic: identical inputs produce a deep-equal record every call', () => {
    const params = {
      sourceHazardRunId: 'run_eq_determinism',
      sourceHazardType: 'earthquake',
      potentialEffect: 'road closure',
      candidateDependency: 'hospital access change',
      evidenceRequired: [{ requirement: 'road-network-topology-model', rationale: 'missing' }],
    };
    expect(registerCascadeCandidate(params)).toEqual(registerCascadeCandidate(params));
  });

  it('produces a stable, collision-resistant id from the source run and the named hypothesis', () => {
    const a = registerCascadeCandidate({
      sourceHazardRunId: 'run-1', sourceHazardType: 'earthquake', potentialEffect: 'Road Closure!', candidateDependency: 'Hospital Access', evidenceRequired: [],
    });
    const b = registerCascadeCandidate({
      sourceHazardRunId: 'run-1', sourceHazardType: 'earthquake', potentialEffect: 'road closure', candidateDependency: 'hospital access', evidenceRequired: [],
    });
    const c = registerCascadeCandidate({
      sourceHazardRunId: 'run-2', sourceHazardType: 'earthquake', potentialEffect: 'road closure', candidateDependency: 'hospital access', evidenceRequired: [],
    });
    expect(a.cascadeCandidateId).toBe(b.cascadeCandidateId);
    expect(a.cascadeCandidateId).not.toBe(c.cascadeCandidateId);
  });

  it('returns a frozen record and a frozen evidenceRequired array', () => {
    const candidate: CascadeCandidate = registerCascadeCandidate({
      sourceHazardRunId: 'run-frozen', sourceHazardType: 'earthquake', potentialEffect: 'x', candidateDependency: 'y',
      evidenceRequired: [{ requirement: 'r', rationale: 'because' }],
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.evidenceRequired)).toBe(true);
    expect(() => {
      (candidate as { validationStatus: string }).validationStatus = 'CONFIRMED';
    }).toThrow();
  });

  it('does not mutate the caller-supplied evidenceRequired array', () => {
    const evidenceRequired = [{ requirement: 'r', rationale: 'because' }];
    registerCascadeCandidate({
      sourceHazardRunId: 'run-x', sourceHazardType: 'earthquake', potentialEffect: 'x', candidateDependency: 'y', evidenceRequired,
    });
    expect(Object.isFrozen(evidenceRequired)).toBe(false);
    expect(evidenceRequired.length).toBe(1);
  });
});

describe('CascadeCandidate isolation — domain-neutral, no renderer/UI/epidemic/City3D imports', () => {
  it('cascadeCandidate.ts imports nothing but ./contracts', () => {
    const source = readFileSync(join(HAZARD_DIR, 'cascadeCandidate.ts'), 'utf8');
    const importLines = source.match(/^import .*from '([^']+)'/gm) ?? [];
    for (const line of importLines) {
      const match = line.match(/from '([^']+)'/);
      expect(match?.[1]).toBe('./contracts');
    }
  });
});
