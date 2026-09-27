import { describe, expect, it } from 'vitest';
import { buildDiscoveryEvidenceChain, buildDiscoveryEvidencePack } from '../core/discovery/molecular/evidence';
import {
  RDKIT_SMARTS_PROVIDER_ID,
  compositionEnumeratorProvider,
  rdkitSmartsEnumeratorProvider,
} from '../core/discovery/molecular/enumeratorProviders';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import { generativeChemistryProvider } from '../core/discovery/molecular/generativeProvider';
import { proposeNextDiscoverySteps } from '../core/discovery/molecular/nextStep';
import { describeProviderRun, runProviderMolecularDiscovery } from '../core/discovery/molecular/providerDiscoveryRun';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 4 + ETAP 12 — the whole loop over a declared provider.
 *
 * With RDKit present this is the real thing end to end: real SMARTS reactions
 * produce real structures, RDKit computes real descriptors, the pre-registered
 * criteria screen them, and the existing Evidence Pack / RO-Crate machinery
 * runs UNCHANGED over the result.
 */
const transport = createNodeRdkitTransport();
const rdkitAvailable = transport.detect().available;

/**
 * A question whose criteria are all resolvable BY RDKIT — so with the engine
 * present the run genuinely resolves rather than stalling on missing data.
 * Criteria are declared here, before any candidate exists.
 */
const question: DiscoveryQuestion = {
  questionId: 'question_provider_loop_v1',
  question: 'Which enumerated analogues of the declared seeds satisfy the declared physicochemical window?',
  target: {
    targetId: 'target_none_declared',
    label: 'No biological target is declared for this run',
    source: 'NOT_AVAILABLE',
    affinityCapability: 'REQUIRES_EXTERNAL_ENGINE',
  },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 60, valueMax: 400, required: true, rationale: 'Small-molecule composition window, declared before the run.' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: -1, valueMax: 4, required: true, rationale: 'Lipophilicity window; resolvable only with a real structural engine.' },
      { criterionId: 'tpsa-ceiling', propertyId: 'tpsa', op: 'lte', value: 120, required: false, rationale: 'Optional polarity ceiling.' },
    ],
  },
};

const request: GenerationRequest = {
  seeds: ['c1ccccc1', 'CC(=O)Oc1ccccc1C(=O)O'],
  transformations: ['add-methyl', 'add-hydroxyl'],
  depth: 1,
  maxCandidates: 25,
  constraints: question.constraints,
};

describe('pętla providerowa niesie metodę generowania w rekordzie', () => {
  it('wynik mówi, CZYM wygenerowano kandydatów', () => {
    const provider = compositionEnumeratorProvider();
    const result = runProviderMolecularDiscovery(question, provider, {
      ...request,
      seeds: ['C6H6', 'C9H8O4'],
      transformations: ['add-CH2', 'add-OH'],
    });

    expect(result.generationCapability.kind).toBe('DETERMINISTIC_ENUMERATOR');
    expect(describeProviderRun(result)).toMatch(/deterministic enumerator/);
    expect(describeProviderRun(result)).not.toMatch(/generative model/);
  });

  it('ta sama metoda i ten sam request dają ten sam odcisk wyniku', () => {
    const provider = compositionEnumeratorProvider();
    const a = runProviderMolecularDiscovery(question, provider, request);
    const b = runProviderMolecularDiscovery(question, provider, request);
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });

  it('brak generatora nie udaje pustej przestrzeni chemicznej', () => {
    const result = runProviderMolecularDiscovery(question, generativeChemistryProvider(), request);

    expect(result.generationCapability.kind).toBe('NOT_AVAILABLE');
    expect(result.batch.candidates).toHaveLength(0);
    // Zero kandydatów przy braku generatora NIE może być czytane jako falsyfikacja.
    expect(result.decision.verdict).not.toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(result.generationNotes.join(' ')).toMatch(/no generator exists/i);
  });
});

describe(`PEŁNA PĘTLA na realnym RDKit (available=${rdkitAvailable})`, () => {
  if (rdkitAvailable) {
    const provider = rdkitSmartsEnumeratorProvider(transport);
    const result = runProviderMolecularDiscovery(question, provider, request, { validateCandidates: true });

    it('1. generacja: realne struktury z realnych reakcji SMARTS', () => {
      expect(result.generationCapability.methodId).toBe(RDKIT_SMARTS_PROVIDER_ID);
      expect(result.batch.candidates.length).toBeGreaterThan(2);
      expect(result.batch.candidates.every((c) => c.structure.status === 'ACTUAL_SOURCE')).toBe(true);
      expect(result.batch.candidates.every((c) => (c.structure.canonicalSmiles ?? '').length > 0)).toBe(true);
    });

    it('2. walidacja strukturalna przechodzi przez realny silnik', () => {
      expect(result.structuralValidation.length).toBeGreaterThan(0);
      expect(result.structuralValidation.every((v) => v.valid === true)).toBe(true);
      expect(result.structuralValidation.every((v) => v.checkedBy.startsWith('RDKit '))).toBe(true);
    });

    it('3. deskryptory są POLICZONE, nie zablokowane', () => {
      const first = result.batch.candidates[0]!;
      const logP = first.properties.find((p) => p.propertyId === 'logP')!;
      const tpsa = first.properties.find((p) => p.propertyId === 'tpsa')!;

      expect(logP.status).toBe('COMPUTED');
      expect(tpsa.status).toBe('COMPUTED');
      expect(typeof logP.value).toBe('number');
      // logP było luką zdolności w ścieżce kompozycyjnej — tu już nie jest.
      expect(result.capabilityGaps.some((g) => g.propertyId === 'logP')).toBe(false);
    });

    it('4. pytanie ROZSTRZYGA SIĘ, bo wszystkie wymagane kryteria są policzalne', () => {
      expect(result.decision.verdict).not.toBe('NOT_RESOLVED');
      expect(result.decision.notResolvedCount).toBe(0);
    });

    it('5. to, co niepoliczalne, nadal jest jawnie niedostępne', () => {
      const first = result.batch.candidates[0]!;
      const safety = first.properties.find((p) => p.propertyId === 'safety')!;
      const affinity = first.properties.find((p) => p.propertyId === 'targetAffinity')!;

      expect(safety.status).toBe('REQUIRES_EXPERIMENT');
      expect(safety.value).toBeNull();
      expect(affinity.status).toBe('REQUIRES_EXTERNAL_ENGINE');
      expect(affinity.value).toBeNull();
    });

    it('6. ISTNIEJĄCE silniki dowodowe przyjmują ten wynik bez zmian', () => {
      const chain = buildDiscoveryEvidenceChain(result);
      expect(chain.createdFromRealRunsOnly).toBe(true);

      const roundTrip = verifyEvidencePackRoCrateRoundTrip(buildDiscoveryEvidencePack(result));
      expect(roundTrip.status).toBe('MATCH');
    });

    it('7. następny krok wskazuje realne braki, nie wymyślone', () => {
      const steps = proposeNextDiscoverySteps(result);

      // logP jest policzone — nie może już figurować jako brakująca zdolność.
      expect(steps.some((s) => s.resolves === 'logP')).toBe(false);
      // Bezpieczeństwo i powinowactwo nadal wymagają czegoś, czego Genesis nie ma.
      expect(steps.some((s) => s.kind === 'REQUIRES_EXTERNAL_EXPERIMENT' && s.resolves === 'safety')).toBe(true);
      expect(steps.some((s) => s.resolves === 'targetAffinity')).toBe(true);
    });

    it('8. przebieg jest odtwarzalny: ten sam request, ten sam odcisk', () => {
      const again = runProviderMolecularDiscovery(question, rdkitSmartsEnumeratorProvider(transport), request);
      expect(again.resultFingerprint).toBe(result.resultFingerprint);
    });
  } else {
    it('bez RDKit pętla strukturalna jest jawnie zablokowana', () => {
      const provider = rdkitSmartsEnumeratorProvider(transport);
      const result = runProviderMolecularDiscovery(question, provider, request);

      expect(result.generationCapability.available).toBe(false);
      expect(result.batch.candidates).toHaveLength(0);
      // Zero kandydatów z braku silnika NIE jest falsyfikacją hipotezy.
      expect(result.decision.verdict).not.toBe('FALSIFIED_WITHIN_PROTOCOL');
    });
  }
});
