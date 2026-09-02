import { describe, expect, it } from 'vitest';
import {
  resolveCompound,
  seedsFromResolution,
  type CompoundLookupTransport,
} from '../core/discovery/molecular/compoundResolver';
import { buildLeadCandidateDossier } from '../core/discovery/molecular/dossier';
import { rdkitSmartsEnumeratorProvider } from '../core/discovery/molecular/enumeratorProviders';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import { rankMultiObjective, type Objective } from '../core/discovery/molecular/multiObjective';
import { runProviderMolecularDiscovery } from '../core/discovery/molecular/providerDiscoveryRun';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * THE WHOLE FLOW A PERSON ACTUALLY USES:
 *
 *   drug name / molecular formula
 *     -> resolved starting structure(s)
 *     -> several enumerated candidates with real RDKit descriptors
 *     -> multi-objective ranking
 *     -> lead-candidate dossier + validation plan + lab handoff
 *
 * The compound lookup is a labelled TEST_FIXTURE (live PubChem is unreachable
 * from this sandbox). EVERYTHING downstream of the starting structure is real:
 * real SMARTS reactions, real RDKit descriptors, real screening.
 */
const rdkit = createNodeRdkitTransport();
const rdkitAvailable = rdkit.detect().available;

/** Recorded PubChem response shape for aspirin. Labelled, never called live. */
const lookup: CompoundLookupTransport = {
  transportId: 'test-fixture',
  available: () => ({ available: true, reason: '' }),
  fetchJson: () => ({
    ok: true,
    body: { PropertyTable: { Properties: [{ CID: 2244, SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', MolecularFormula: 'C9H8O4' }] } },
  }),
};

const question: DiscoveryQuestion = {
  questionId: 'question_from_named_compound_v1',
  question: 'Which single-step analogues of the supplied compound stay inside the declared physicochemical window?',
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
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 120, valueMax: 400, required: true, rationale: 'declared before the run' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: -1, valueMax: 4, required: true, rationale: 'declared before the run' },
    ],
  },
};

const objectives: readonly Objective[] = [
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'prefer smaller analogues' },
  { objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 'target lipophilicity' },
];

describe('nazwa leku → struktura startowa', () => {
  it('nazwa rozwiązuje się do jednej struktury z realnym identyfikatorem rejestru', () => {
    const resolution = resolveCompound({ kind: 'name', value: 'aspirin' }, lookup);

    expect(resolution.status).toBe('RESOLVED_SINGLE');
    expect(resolution.structures[0]!.molecularFormula).toBe('C9H8O4');
    expect(seedsFromResolution(resolution)).toHaveLength(1);
  });

  it('ten sam wzór sumaryczny NIE daje jednej cząsteczki', () => {
    const byFormula = resolveCompound({ kind: 'formula', value: 'C9H8O4' }, lookup);
    // Ta sama odpowiedź rejestru, inne pytanie — i inny, uczciwszy werdykt.
    expect(byFormula.status).toBe('RESOLVED_AMBIGUOUS');
    expect(byFormula.ambiguityNote).toMatch(/does not determine a structure/i);
  });
});

describe(`nazwa → kandydaci → dossier (RDKit available=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit przepływ zatrzymuje się jawnie, nie po cichu', () => {
      const seeds = seedsFromResolution(resolveCompound({ kind: 'name', value: 'aspirin' }, lookup));
      const request: GenerationRequest = { seeds, transformations: ['add-methyl'], depth: 1, maxCandidates: 20, constraints: question.constraints };
      const result = runProviderMolecularDiscovery(question, rdkitSmartsEnumeratorProvider(rdkit), request);

      expect(result.generationCapability.available).toBe(false);
      expect(result.batch.candidates).toHaveLength(0);
      expect(result.decision.verdict).not.toBe('FALSIFIED_WITHIN_PROTOCOL');
    });
    return;
  }

  const seeds = seedsFromResolution(resolveCompound({ kind: 'name', value: 'aspirin' }, lookup));
  const request: GenerationRequest = {
    seeds,
    transformations: ['add-methyl', 'add-hydroxyl', 'add-amino', 'add-fluoro'],
    depth: 1,
    maxCandidates: 20,
    constraints: question.constraints,
  };
  const result = runProviderMolecularDiscovery(question, rdkitSmartsEnumeratorProvider(rdkit), request, { validateCandidates: true });
  const ranking = rankMultiObjective(result.batch.candidates, result.assessments, objectives);
  const dossier = buildLeadCandidateDossier({ result, ranking })!;

  it('z jednej nazwy powstaje KILKU realnych kandydatów strukturalnych', () => {
    expect(result.batch.candidates.length).toBeGreaterThan(2);
    expect(result.batch.candidates.every((c) => c.structure.status === 'ACTUAL_SOURCE')).toBe(true);
    // Kandydaci są RÓŻNI — enumeracja naprawdę coś zmieniła.
    expect(new Set(result.batch.candidates.map((c) => c.structure.canonicalSmiles)).size)
      .toBe(result.batch.candidates.length);
  });

  it('każdy kandydat niesie policzone deskryptory z realnego silnika', () => {
    for (const candidate of result.batch.candidates) {
      const logP = candidate.properties.find((p) => p.propertyId === 'logP')!;
      expect(logP.status).toBe('COMPUTED');
      expect(logP.engine).toMatch(/^RDKit /);
    }
  });

  it('ranking wskazuje lidera i uzasadnia wybór', () => {
    expect(ranking.retained.length).toBeGreaterThan(0);
    expect(ranking.retained.some((r) => r.onParetoFront)).toBe(true);
    expect(dossier.selection.whySelected.length).toBeGreaterThan(0);
  });

  it('dossier jest kompletne: tożsamość, dowód, plan walidacji, handoff', () => {
    expect(dossier.identity.canonicalSmiles).toBeTruthy();
    expect(dossier.computedProperties.length).toBeGreaterThan(5);
    expect(dossier.validationPlan.length).toBeGreaterThan(2);
    expect(dossier.labHandoff.expertHandoffSpecification.length).toBeGreaterThan(2);
    expect(dossier.evidenceRequiredBeforeClaims.length).toBeGreaterThan(4);
  });

  it('DOSSIER NIE TWIERDZI ODKRYCIA ANI BEZPIECZEŃSTWA', () => {
    expect(dossier.claimStatement).toMatch(/computational candidate requiring experimental validation/i);
    const serialised = JSON.stringify(dossier);
    expect(serialised).not.toMatch(/discovered a new|proven safe|is safe|side.effect free|therapeutically effective/i);
    // Bezpieczeństwo pozostaje eksperymentalne, cokolwiek policzył RDKit.
    expect(dossier.unavailableMeasurements.some((u) => u.propertyId === 'safety' && u.status === 'REQUIRES_EXPERIMENT')).toBe(true);
  });

  it('domyślnie trasa syntezy jest wstrzymana do przeglądu eksperckiego', () => {
    expect(dossier.labHandoff.synthesisDisclosure).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
    expect(dossier.regulatory.flags).toContain('NOT_SCREENED_AGAINST_CONTROLLED_SUBSTANCE_REGISTER');
    expect(dossier.regulatory.flags).toContain('NO_HUMAN_OR_ANIMAL_USE_IS_SUPPORTED_BY_THIS_DOCUMENT');
  });

  it('cały przepływ jest odtwarzalny', () => {
    const again = runProviderMolecularDiscovery(question, rdkitSmartsEnumeratorProvider(rdkit), request);
    expect(again.resultFingerprint).toBe(result.resultFingerprint);
  });
});
