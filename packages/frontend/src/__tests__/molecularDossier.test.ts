import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_NATURAL_PRODUCT_CONTEXT,
  UNSCREENED_REGULATORY_CONTEXT,
  buildLeadCandidateDossier,
  claimStatement,
  evidenceGradeFor,
  synthesisDisclosureFor,
  type RegulatoryContext,
} from '../core/discovery/molecular/dossier';
import { rdkitSmartsEnumeratorProvider, compositionEnumeratorProvider } from '../core/discovery/molecular/enumeratorProviders';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import { rankMultiObjective, type Objective } from '../core/discovery/molecular/multiObjective';
import { runProviderMolecularDiscovery } from '../core/discovery/molecular/providerDiscoveryRun';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 13 — DOSSIER / VALIDATION PLAN / LAB HANDOFF.
 *
 * The tests that matter here are the ones that stop the dossier turning into a
 * claim, and the ones that keep operational synthesis detail out of it.
 */
const transport = createNodeRdkitTransport();
const rdkitAvailable = transport.detect().available;

const question: DiscoveryQuestion = {
  questionId: 'question_dossier_v1',
  question: 'Which enumerated analogues satisfy the declared physicochemical window?',
  target: {
    targetId: 'target_undeclared',
    label: 'No biological target declared',
    source: 'NOT_AVAILABLE',
    affinityCapability: 'REQUIRES_EXTERNAL_ENGINE',
  },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 60, valueMax: 400, required: true, rationale: 'declared before the run' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: -1, valueMax: 4, required: true, rationale: 'declared before the run' },
    ],
  },
};

const objectives: readonly Objective[] = [
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'prefer smaller' },
  { objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 'target lipophilicity' },
];

const request: GenerationRequest = {
  seeds: ['c1ccccc1', 'CC(=O)Oc1ccccc1C(=O)O'],
  transformations: ['add-methyl', 'add-hydroxyl'],
  depth: 1,
  maxCandidates: 25,
  constraints: question.constraints,
};

describe('stopnie dowodu nigdy się nie zlewają', () => {
  it('COMPUTED to COMPUTATION, MODEL_PREDICTION to PREDICTION', () => {
    expect(evidenceGradeFor({ propertyId: 'x', value: 1, unit: '', status: 'COMPUTED', engine: 'e' })).toBe('COMPUTATION');
    expect(evidenceGradeFor({ propertyId: 'x', value: 1, unit: '', status: 'MODEL_PREDICTION', engine: 'e' })).toBe('PREDICTION');
  });

  it('nic w Genesis nie może dostać stopnia EXPERIMENTALLY_VALIDATED', () => {
    const statuses = ['COMPUTED', 'MODEL_PREDICTION', 'ACTUAL_SOURCE', 'USER_SUPPLIED', 'TEST_FIXTURE'] as const;
    for (const status of statuses) {
      expect(evidenceGradeFor({ propertyId: 'x', value: 1, unit: '', status, engine: 'e' })).not.toBe('EXPERIMENTALLY_VALIDATED');
    }
  });

  it('wartość podana przez użytkownika to HIPOTEZA, nie pomiar', () => {
    expect(evidenceGradeFor({ propertyId: 'x', value: 1, unit: '', status: 'USER_SUPPLIED', engine: null })).toBe('HYPOTHESIS');
    expect(evidenceGradeFor({ propertyId: 'x', value: 1, unit: '', status: 'TEST_FIXTURE', engine: null })).toBe('HYPOTHESIS');
  });

  it('brak wartości nie ma stopnia dowodu', () => {
    expect(evidenceGradeFor({ propertyId: 'x', value: null, unit: '', status: 'REQUIRES_EXPERIMENT', engine: null })).toBeNull();
  });
});

describe('ujawnianie syntezy jest fail-closed', () => {
  it('brak sprawdzenia rejestru → WSTRZYMANE, nie dozwolone', () => {
    const decision = synthesisDisclosureFor(UNSCREENED_REGULATORY_CONTEXT);
    expect(decision.level).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
    expect(decision.reason).toMatch(/not evidence that a compound is unregulated/i);
  });

  it('substancja kontrolowana → WSTRZYMANE', () => {
    const controlled: RegulatoryContext = { controlledScreen: 'DECLARED_CONTROLLED', screenedAgainst: 'national register', psychoactiveAnalogue: false, notes: [] };
    expect(synthesisDisclosureFor(controlled).level).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
  });

  it('analog psychoaktywny → WSTRZYMANE, nawet gdy niekontrolowany', () => {
    const analogue: RegulatoryContext = { controlledScreen: 'DECLARED_UNCONTROLLED', screenedAgainst: 'national register', psychoactiveAnalogue: true, notes: [] };
    const decision = synthesisDisclosureFor(analogue);
    expect(decision.level).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
    expect(decision.reason).toMatch(/psychoactive/i);
  });

  it('nieznany status analogu → WSTRZYMANE', () => {
    const unknown: RegulatoryContext = { controlledScreen: 'DECLARED_UNCONTROLLED', screenedAgainst: 'register', psychoactiveAnalogue: null, notes: [] };
    expect(synthesisDisclosureFor(unknown).level).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
  });

  it('tylko realnie sprawdzone i niekontrolowane → POZIOM PLANOWANIA (nie operacyjny)', () => {
    const clear: RegulatoryContext = { controlledScreen: 'DECLARED_UNCONTROLLED', screenedAgainst: 'national register', psychoactiveAnalogue: false, notes: [] };
    const decision = synthesisDisclosureFor(clear);
    expect(decision.level).toBe('PLANNING_LEVEL');
    expect(decision.reason).toMatch(/no quantities, temperatures, times, addition order or step-by-step/i);
  });
});

describe('dopuszczalne zdanie o kandydacie', () => {
  it('mówi o kandydacie wymagającym walidacji, nie o odkryciu', () => {
    const statement = claimStatement();
    expect(statement).toMatch(/computational candidate requiring experimental validation/i);
    expect(statement).not.toMatch(/discovered a new|safe version|proven|effective/i);
  });
});

describe('brak zachowanego kandydata nie daje pustego dossier', () => {
  it('zwraca null zamiast dokumentu wyglądającego na wynik', () => {
    const impossible: DiscoveryQuestion = {
      ...question,
      constraints: { ...question.constraints, criteria: [{ criterionId: 'imp', propertyId: 'molecularWeight', op: 'lte', value: 1, required: true, rationale: 't' }] },
    };
    const result = runProviderMolecularDiscovery(impossible, compositionEnumeratorProvider(), {
      ...request, seeds: ['C6H6'], transformations: ['add-CH2'],
    });
    const ranking = rankMultiObjective(result.batch.candidates, result.assessments, objectives);

    expect(buildLeadCandidateDossier({ result, ranking })).toBeNull();
  });
});

describe(`PEŁNE DOSSIER na realnym RDKit (available=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit nie ma struktur, więc nie ma dossier wiodącego kandydata', () => {
      const result = runProviderMolecularDiscovery(question, rdkitSmartsEnumeratorProvider(transport), request);
      const ranking = rankMultiObjective(result.batch.candidates, result.assessments, objectives);
      expect(buildLeadCandidateDossier({ result, ranking })).toBeNull();
    });
    return;
  }

  const result = runProviderMolecularDiscovery(question, rdkitSmartsEnumeratorProvider(transport), request);
  const ranking = rankMultiObjective(result.batch.candidates, result.assessments, objectives);
  const dossier = buildLeadCandidateDossier({ result, ranking })!;

  it('tożsamość opiera się na realnej, skanonizowanej strukturze', () => {
    expect(dossier.identity.canonicalSmiles).toBeTruthy();
    expect(dossier.identity.structureStatus).toBe('ACTUAL_SOURCE');
    expect(dossier.identity.structureEngine).toMatch(/^RDKit /);
  });

  it('każda policzona właściwość niesie stopień dowodu i silnik', () => {
    expect(dossier.computedProperties.length).toBeGreaterThan(3);
    for (const property of dossier.computedProperties) {
      expect(property.grade).not.toBeNull();
      expect(property.grade).not.toBe('EXPERIMENTALLY_VALIDATED');
      expect(property.engine).toBeTruthy();
    }
  });

  it('to, czego brak, jest wymienione razem z tym, czego wymaga', () => {
    const safety = dossier.unavailableMeasurements.find((u) => u.propertyId === 'safety')!;
    expect(safety.requires).toMatch(/laboratory measurement/i);
    const affinity = dossier.unavailableMeasurements.find((u) => u.propertyId === 'targetAffinity')!;
    expect(affinity.requires).toMatch(/PREDICTION and not an observation/i);
  });

  it('hipoteza jest oznaczona jako hipoteza i nie mówi o bioaktywności', () => {
    expect(dossier.hypothesis.grade).toBe('HYPOTHESIS');
    expect(dossier.hypothesis.statement).toMatch(/not about biological activity/i);
  });

  it('wybór kandydata jest uzasadniony, a odrzuceni są wymienieni', () => {
    expect(dossier.selection.whySelected.length).toBeGreaterThan(0);
    expect(dossier.selection.frontCaveat).toMatch(/Pareto front/i);
  });

  it('plan walidacji nazywa metody, wyniki i KONTROLE — bez procedury', () => {
    expect(dossier.validationPlan.length).toBeGreaterThan(2);
    for (const item of dossier.validationPlan) {
      expect(item.method.length).toBeGreaterThan(0);
      expect(item.control.length).toBeGreaterThan(0);
      expect(item.expectedOutput.length).toBeGreaterThan(0);
    }
    // Tożsamość i czystość zawsze poprzedzają pomiar właściwości.
    expect(dossier.validationPlan[0]!.resolves).toBe('structural identity');
  });

  it('domyślnie (bez sprawdzenia rejestru) trasa syntezy jest WSTRZYMANA', () => {
    expect(dossier.labHandoff.synthesisDisclosure).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
    expect(dossier.labHandoff.routeStrategy).toHaveLength(0);
    expect(dossier.labHandoff.precursorCategories).toHaveLength(0);
    expect(dossier.regulatory.flags).toContain('NOT_SCREENED_AGAINST_CONTROLLED_SUBSTANCE_REGISTER');
  });

  it('ŻADNA gałąź nie zawiera ilości, temperatur, czasów ani kolejności dodawania', () => {
    const cleared: RegulatoryContext = { controlledScreen: 'DECLARED_UNCONTROLLED', screenedAgainst: 'national register', psychoactiveAnalogue: false, notes: [] };
    const open = buildLeadCandidateDossier({ result, ranking, regulatory: cleared })!;

    expect(open.labHandoff.synthesisDisclosure).toBe('PLANNING_LEVEL');
    expect(open.labHandoff.routeStrategy.length).toBeGreaterThan(0);

    const everything = JSON.stringify(open).toLowerCase();
    // Wzorce operacyjne: masy/objętości, temperatury, czasy, kolejność dodawania.
    // Temperatura wymaga stopnia lub słowa — samo "13c" to znacznik izotopu w
    // "nmr (1h/13c)", a nie warunek reakcji.
    expect(everything).not.toMatch(/\b\d+(\.\d+)?\s?(g|mg|kg|ml|l|mmol|mol|equiv)\b/);
    expect(everything).not.toMatch(/\d+\s?°\s?[cf]\b|\b\d+\s?deg(rees)?\s?[cf]?\b/);
    // Czas trwania w procedurze czyta się "for 2 h" / "over 30 min"; samo "1h"
    // w "nmr (1h/13c)" to jądro obserwowane, nie czas reakcji.
    expect(everything).not.toMatch(/\b(for|over|during)\s+\d+(\.\d+)?\s?(h|hr|hrs|hours|min|minutes|sec|seconds)\b/);
    expect(everything).not.toMatch(/dropwise|reflux|stir for|heat to|cool to|then add|slowly add/);
    expect(open.labHandoff.expertHandoffSpecification.join(' ')).toMatch(/no quantities, temperatures, reaction times, addition order or step-by-step/i);
  });

  it('dowód wymagany przed jakimkolwiek twierdzeniem jest wypisany wprost', () => {
    const required = dossier.evidenceRequiredBeforeClaims.join(' ');
    expect(dossier.evidenceRequiredBeforeClaims.length).toBeGreaterThanOrEqual(5);
    expect(required).toMatch(/no efficacy claim, no safety claim and no therapeutic claim is supportable/i);
    // Naturalne pochodzenie nie zastępuje żadnego z tych dowodów.
    expect(required).toMatch(/natural origin.*does not substitute/i);
  });

  it('dossier niesie dopuszczalne zdanie i nie twierdzi odkrycia', () => {
    expect(dossier.claimStatement).toMatch(/requiring experimental validation/i);
    expect(JSON.stringify(dossier)).not.toMatch(/discovered a new safe|proven safe|is effective against/i);
  });

  it('kontekst naturalny jest prowieniencją, nie sygnałem bezpieczeństwa', () => {
    // Genesis nie ma bazy produktów naturalnych — domyślnie NIE WIADOMO.
    expect(dossier.naturalProduct).toEqual(UNKNOWN_NATURAL_PRODUCT_CONTEXT);
    expect(dossier.naturalProduct.knownNaturalProduct).toBeNull();
    expect(dossier.naturalProduct.references).toHaveLength(0);
  });

  it('dossier jest deterministyczne i odciskane', () => {
    const again = buildLeadCandidateDossier({ result, ranking })!;
    expect(again.dossierFingerprint).toBe(dossier.dossierFingerprint);
    expect(again.dossierId).toBe(dossier.dossierId);
  });
});
