import { describe, expect, it } from 'vitest';
import {
  PROPERTY_ROUTES,
  planEngineRouting,
  routeProperty,
  type EngineAvailabilityMap,
} from '../core/discovery/molecular/engineRouter';
import type { DiscoveryQuestion, MoleculeCandidate } from '../core/discovery/molecular/types';

/**
 * ETAP 5 — CAPABILITY-AWARE ROUTING.
 *
 * These tests are about refusing to run engines that would produce a number
 * without meaning. The distinction between "engine missing" and "engine
 * inapplicable" is the whole point, so it is asserted directly.
 */
const structured: MoleculeCandidate = {
  candidateId: 'cand_structured',
  formula: 'C9H8O4',
  structure: { status: 'ACTUAL_SOURCE', canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', engine: 'RDKit 2026.03.5' },
  parentFormula: null,
  transformation: null,
  properties: [{ propertyId: 'heavyAtomCount', status: 'COMPUTED', value: 13, unit: 'atoms', engine: 'test' }],
  origin: 'SEED',
};

const formulaOnly: MoleculeCandidate = {
  ...structured,
  candidateId: 'cand_formula_only',
  structure: { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null },
};

const hugeMolecule: MoleculeCandidate = {
  ...structured,
  candidateId: 'cand_huge',
  properties: [{ propertyId: 'heavyAtomCount', status: 'COMPUTED', value: 400, unit: 'atoms', engine: 'test' }],
};

const questionWithoutTarget: DiscoveryQuestion = {
  questionId: 'q1',
  question: 'test',
  target: { targetId: 't', label: 'none', source: 'NOT_AVAILABLE', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: { allowedElements: ['C', 'H', 'O'], maxHeavyAtoms: 50, criteria: [] },
};

const questionWithTarget: DiscoveryQuestion = {
  ...questionWithoutTarget,
  target: { targetId: 't2', label: 'declared receptor', source: 'USER_SUPPLIED', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
};

const allAvailable: EngineAvailabilityMap = {
  rdkit: { engine: 'rdkit', available: true, reason: '', version: '2026.03.5' },
  'admet-ai': { engine: 'admet-ai', available: true, reason: '', version: '1.0' },
  'autodock-vina': { engine: 'autodock-vina', available: true, reason: '', version: '1.2' },
};

const noneAvailable: EngineAvailabilityMap = {
  rdkit: { engine: 'rdkit', available: false, reason: 'rdkit_unavailable: No module named "rdkit"', version: null },
  'admet-ai': { engine: 'admet-ai', available: false, reason: 'admet_ai_unavailable: No module named "admet_ai"', version: null },
  'autodock-vina': { engine: 'autodock-vina', available: false, reason: 'docking_unavailable: No module named "vina"', version: null },
};

describe('trzy odmowy znaczą co innego i nie są mylone', () => {
  it('ENGINE_ABSENT — silnik po prostu nie jest zainstalowany', () => {
    const decision = routeProperty('logP', structured, questionWithoutTarget, noneAvailable)!;

    expect(decision.run).toBe(false);
    if (decision.run) return;
    expect(decision.refusal).toBe('ENGINE_ABSENT');
    // Powód pochodzi z realnego detektora adaptera, nie z zaślepki.
    expect(decision.reason).toContain('No module named');
    expect(decision.resultStatus).toBe('REQUIRES_EXTERNAL_ENGINE');
  });

  it('PRECONDITION_MISSING — silnik jest, ale brakuje wejścia', () => {
    const decision = routeProperty('logP', formulaOnly, questionWithoutTarget, allAvailable)!;

    expect(decision.run).toBe(false);
    if (decision.run) return;
    expect(decision.refusal).toBe('PRECONDITION_MISSING');
    expect(decision.reason).toMatch(/only a molecular formula/i);
  });

  it('NOT_VALID_FOR_DOMAIN — silnik zwróciłby liczbę, która nic nie znaczy', () => {
    const decision = routeProperty('admetAbsorption', hugeMolecule, questionWithoutTarget, allAvailable)!;

    expect(decision.run).toBe(false);
    if (decision.run) return;
    expect(decision.refusal).toBe('NOT_VALID_FOR_DOMAIN');
    expect(decision.reason).toMatch(/would not mean anything/i);
  });
});

describe('dostępność silnika nie czyni obliczenia sensownym', () => {
  it('poza domeną stosowalności odmowa zostaje, choć silnik JEST dostępny', () => {
    const withEngine = routeProperty('admetAbsorption', hugeMolecule, questionWithoutTarget, allAvailable)!;
    const withoutEngine = routeProperty('admetAbsorption', hugeMolecule, questionWithoutTarget, noneAvailable)!;

    expect(withEngine.run).toBe(false);
    expect(withoutEngine.run).toBe(false);
    if (withEngine.run || withoutEngine.run) return;
    // Zainstalowanie silnika NIE zamienia bezsensownego obliczenia w sensowne.
    expect(withEngine.refusal).toBe('NOT_VALID_FOR_DOMAIN');
  });

  it('bezpieczeństwo jest nierutowalne z zasady, niezależnie od silników', () => {
    const decision = routeProperty('safety', structured, questionWithTarget, allAvailable)!;

    expect(decision.run).toBe(false);
    if (decision.run) return;
    expect(decision.refusal).toBe('NOT_VALID_FOR_DOMAIN');
    expect(decision.resultStatus).toBe('REQUIRES_EXPERIMENT');
    expect(decision.reason).toMatch(/not a computable property/i);
  });

  it('dokowanie bez realnego receptora 3D nie jest słabszym wynikiem, tylko żadnym', () => {
    const withoutTarget = routeProperty('targetAffinity', structured, questionWithoutTarget, allAvailable)!;
    expect(withoutTarget.run).toBe(false);
    if (withoutTarget.run) return;
    expect(withoutTarget.refusal).toBe('PRECONDITION_MISSING');
    expect(withoutTarget.reason).toMatch(/a target name is not one/i);

    // Z zadeklarowanym celem i dostępnym silnikiem dokowanie ma sens.
    const withTarget = routeProperty('targetAffinity', structured, questionWithTarget, allAvailable)!;
    expect(withTarget.run).toBe(true);
  });
});

describe('plan nie uruchamia wszystkich silników dla każdej molekuły', () => {
  it('w środowisku z samym RDKit planowany jest tylko RDKit', () => {
    const onlyRdkit: EngineAvailabilityMap = {
      ...noneAvailable,
      rdkit: { engine: 'rdkit', available: true, reason: '', version: '2026.03.5' },
    };
    const plan = planEngineRouting([structured], questionWithTarget, onlyRdkit);

    expect(plan.enginesUsed).toEqual(['rdkit']);
    expect(plan.toRun.map((r) => r.propertyId).sort()).toEqual(['logP', 'tpsa']);
    // Reszta jest odmówiona Z POWODEM, nie pominięta.
    expect(plan.refused.length).toBeGreaterThan(0);
    expect(plan.refused.every((r) => r.reason.length > 0)).toBe(true);
  });

  it('kandydat bez struktury nie trafia do żadnego silnika strukturalnego', () => {
    const plan = planEngineRouting([formulaOnly], questionWithTarget, allAvailable);

    expect(plan.toRun).toHaveLength(0);
    expect(plan.refused.every((r) => r.refusal === 'PRECONDITION_MISSING' || r.refusal === 'NOT_VALID_FOR_DOMAIN')).toBe(true);
  });

  it('odmowy są agregowane po powodzie, z licznikiem kandydatów', () => {
    const plan = planEngineRouting([formulaOnly, { ...formulaOnly, candidateId: 'c2' }], questionWithTarget, allAvailable);
    const structureRefusals = plan.refused.filter((r) => r.reason.includes('structure'));

    expect(structureRefusals.length).toBeGreaterThan(0);
    expect(structureRefusals.some((r) => r.candidateCount === 2)).toBe(true);
  });

  it('każda trasa wskazuje realny adapter z tego repozytorium', () => {
    const realEngines = ['rdkit', 'admet-ai', 'autodock-vina', 'pyscf', 'openmm', 'biopython'];
    expect(PROPERTY_ROUTES.every((r) => realEngines.includes(r.engine))).toBe(true);
  });
});

describe('REALNA sonda dostępności silników (czyta adaptery z repo)', () => {
  it('zwraca werdykt dla każdego silnika, z realnym powodem gdy brak', async () => {
    const { probeEngineAvailability } = await import('../core/discovery/molecular/engineAvailability.node');
    const availability = probeEngineAvailability();

    // Każdy zadeklarowany silnik ma werdykt — żaden nie jest po cichu pominięty.
    for (const engine of ['rdkit', 'admet-ai', 'autodock-vina', 'pyscf', 'openmm', 'biopython'] as const) {
      expect(availability[engine], engine).toBeDefined();
      const state = availability[engine]!;
      // Niedostępny silnik MUSI podać powód; dostępny podaje wersję.
      if (!state.available) expect(state.reason.length, engine).toBeGreaterThan(0);
    }

    // Krzyżowa kontrola: sonda i transport RDKit muszą się zgadzać co do tego
    // samego runtime'u. To wiąże werdykt z rzeczywistością w OBU środowiskach —
    // i tam, gdzie RDKit jest, i tam, gdzie go nie ma (CI).
    const { createNodeRdkitTransport } = await import('../core/discovery/molecular/rdkitTransport.node');
    expect(availability.rdkit!.available).toBe(createNodeRdkitTransport().detect().available);

    // Plan zbudowany z REALNEJ dostępności nie planuje nieobecnych silników.
    const plan = planEngineRouting([structured], questionWithTarget, availability);
    for (const scheduled of plan.toRun) {
      expect(availability[scheduled.engine]!.available, scheduled.engine).toBe(true);
    }
    // Gdy RDKit jest realnie obecny, plan MUSI go użyć — inaczej test byłby pusty.
    if (availability.rdkit!.available) {
      expect(plan.enginesUsed).toContain('rdkit');
      expect(plan.toRun.map((r) => r.propertyId)).toContain('logP');
    }
  }, 60_000);
});
