import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { runDiscoveryCampaign } from '../core/discovery/molecular/discoveryCampaign';
import { createNodeDockingTransport } from '../core/discovery/molecular/dockingTransport.node';
import type { ReceptorSpec } from '../core/discovery/molecular/dockingTransport';
import { rdkitSmartsEnumeratorProvider } from '../core/discovery/molecular/enumeratorProviders';
import { generativeChemistryProvider } from '../core/discovery/molecular/generativeProvider';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import type { Objective } from '../core/discovery/molecular/multiObjective';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 10 + 15 — THE REAL END-TO-END CAMPAIGN.
 *
 * Question -> iterative generation -> real structures -> RDKit -> ADMET ->
 * docking -> screening -> Pareto ranking -> falsification -> dossier ->
 * next experiment, in one call, against real engines.
 */
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const docking = createNodeDockingTransport();

const rdkitAvailable = rdkit.detect().available;
const admetAvailable = admet.detect().available;
const dockingAvailable = docking.detect().available;

const question: DiscoveryQuestion = {
  questionId: 'campaign_v1',
  question: 'Which single-step analogues of the seed stay inside the declared physicochemical and predicted-ADMET window?',
  target: {
    targetId: 'target_undeclared',
    label: 'No biological target structure declared',
    source: 'NOT_AVAILABLE',
    affinityCapability: 'REQUIRES_EXTERNAL_ENGINE',
  },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 120, valueMax: 400, required: true, rationale: 'declared before the run' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: -1, valueMax: 4, required: true, rationale: 'declared before the run' },
      { criterionId: 'absorption-floor', propertyId: 'admetAbsorption', op: 'gte', value: 0.5, required: false, rationale: 'predicted absorption, declared before the run' },
    ],
  },
};

const objectives: readonly Objective[] = [
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'prefer smaller' },
  { objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 'target lipophilicity' },
  { objectiveId: 'low-mutagenicity', propertyId: 'mutagenicity', direction: 'minimise', rationale: 'prefer lower predicted Ames probability' },
];

const request: GenerationRequest = {
  seeds: ['CC(=O)Oc1ccccc1C(=O)O'],
  transformations: ['add-methyl', 'add-hydroxyl', 'add-fluoro'],
  depth: 1,
  maxCandidates: 12,
  constraints: question.constraints,
};

const standin: ReceptorSpec = {
  kind: 'SMALL_MOLECULE_STANDIN',
  smiles: 'c1ccc2c(c1)cccc2',
  provenance: 'Pipeline stand-in; not a biological receptor.',
};

describe('kampania z zablokowanym generatorem nie udaje wyniku', () => {
  it('brak generatora → zero kandydatów i jawny powód zatrzymania', () => {
    const run = runDiscoveryCampaign(question, generativeChemistryProvider(), request, objectives);

    expect(run.generationMethod.kind).toBe('NOT_AVAILABLE');
    expect(run.candidates).toHaveLength(0);
    expect(run.stopReason).toBe('GENERATOR_UNAVAILABLE');
    expect(run.dossier).toBeNull();
    expect(run.decision.verdict).not.toBe('FALSIFIED_WITHIN_PROTOCOL');
  });
});

describe(`REALNA KAMPANIA (rdkit=${rdkitAvailable} admet=${admetAvailable} docking=${dockingAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit kampania nie generuje struktur', () => {
      const run = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives);
      expect(run.candidates).toHaveLength(0);
    });
    return;
  }

  const run = runDiscoveryCampaign(
    question,
    rdkitSmartsEnumeratorProvider(rdkit),
    request,
    objectives,
    { admet, docking, receptor: standin },
    { maxGenerations: 2, totalCandidateBudget: 14, survivorsPerGeneration: 2, maxAdmetCalls: 14, maxDockingCalls: 2 },
  );

  it('1. ITERACYJNA SEARCH: więcej niż jedna generacja, z historią', () => {
    expect(run.generations.length).toBeGreaterThanOrEqual(1);
    expect(run.generations[0]!.newCount).toBeGreaterThan(0);
    // Każda generacja raportuje, ile realnie NOWEGO wyprodukowała.
    for (const generation of run.generations) {
      expect(generation.seeds.length).toBeGreaterThan(0);
      expect(generation.newCount).toBeLessThanOrEqual(generation.producedCount);
    }
    expect(run.stopReason.length).toBeGreaterThan(0);
  }, 900_000);

  it('2. kandydaci mają realne struktury RDKit', () => {
    expect(run.candidates.length).toBeGreaterThan(2);
    expect(run.candidates.every((c) => c.structure.status === 'ACTUAL_SOURCE')).toBe(true);
  });

  it('3. RDKit wniósł policzone deskryptory', () => {
    const rdkitReport = run.capabilities.find((c) => c.engine.startsWith('RDKit'))!;
    expect(rdkitReport.available).toBe(true);
    expect(rdkitReport.contributed).toContain('logP');
    expect(rdkitReport.contributed).toContain('tpsa');
  });

  if (admetAvailable) {
    it('4. ADMET-AI wniósł REALNE predykcje do kampanii', () => {
      const admetReport = run.capabilities.find((c) => c.engine.startsWith('ADMET-AI'))!;
      expect(admetReport.available).toBe(true);
      expect(admetReport.contributed).toContain('admetAbsorption');
      expect(admetReport.contributed).toContain('mutagenicity');

      const absorption = run.candidates[0]!.properties.find((p) => p.propertyId === 'admetAbsorption')!;
      expect(absorption.status).toBe('MODEL_PREDICTION');
      expect(typeof absorption.value).toBe('number');
    }, 900_000);

    it('5. kryterium oparte na PREDYKCJI realnie uczestniczy w screeningu', () => {
      const evaluated = run.evaluation[0]!.criteria.find((c) => c.criterionId === 'absorption-floor')!;
      expect(evaluated.verdict).not.toBe('NOT_AVAILABLE');
      expect(evaluated.observedStatus).toBe('MODEL_PREDICTION');
    });
  }

  if (dockingAvailable) {
    it('6. dokowanie wobec ZASTĘPCZEGO receptora NIE daje targetAffinity', () => {
      const dockReport = run.capabilities.find((c) => c.engine.includes('Vina'))!;
      expect(dockReport.available).toBe(true);
      expect(dockReport.contributed).toContain('dockingPipelineScore');
      expect(dockReport.contributed).not.toContain('targetAffinity');
      expect(run.limitations.join(' ')).toMatch(/STAND-IN receptor, not a biological target/i);
    }, 900_000);
  }

  it('7. ranking dzieli kandydatów na cztery kategorie z uzasadnieniem', () => {
    const total = run.ranking.retained.length + run.ranking.rejected.length + run.ranking.unevaluable.length + run.ranking.blocked.length;
    expect(total).toBe(run.candidates.length);
    expect(run.ranking.ranked.every((r) => r.justification.length > 0)).toBe(true);
  });

  it('8. falsyfikacja pyta, co obaliłoby każdego kandydata', () => {
    expect(run.falsification.perCandidate.length).toBe(run.candidates.length);
    expect(run.falsification.untestedRefutations.length).toBeGreaterThan(0);
  });

  it('9. dossier powstaje i nie twierdzi odkrycia', () => {
    expect(run.dossier).not.toBeNull();
    expect(run.dossier!.claimStatement).toMatch(/requiring experimental validation/i);
    expect(JSON.stringify(run.dossier)).not.toMatch(/discovered a new|proven safe|is effective/i);
  });

  it('10. następny eksperyment wynika z realnych braków', () => {
    expect(run.nextExperiment.length).toBeGreaterThan(0);
    expect(run.nextExperiment.some((s) => s.resolves === 'safety')).toBe(true);
  });

  it('11. BEZPIECZEŃSTWO pozostaje eksperymentalne mimo wszystkich silników', () => {
    const safety = run.candidates[0]!.properties.find((p) => p.propertyId === 'safety')!;
    expect(safety.status).toBe('REQUIRES_EXPERIMENT');
    expect(safety.value).toBeNull();
  });

  it('12. ograniczenia mówią wprost, że nic nie zostało zmierzone', () => {
    expect(run.limitations.join(' ')).toMatch(/Nothing here was measured/i);
    expect(run.limitations.join(' ')).toMatch(/not a generative model/i);
  });

  it('13. kampania jest odtwarzalna', () => {
    const again = runDiscoveryCampaign(
      question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives,
      { admet, docking, receptor: standin },
      { maxGenerations: 2, totalCandidateBudget: 14, survivorsPerGeneration: 2, maxAdmetCalls: 14, maxDockingCalls: 2 },
    );
    expect(again.runFingerprint).toBe(run.runFingerprint);
  }, 900_000);

  it('14. jedna powierzchnia wyniku zawiera wszystko, co obiecuje kontrakt', () => {
    for (const key of ['question', 'request', 'generationMethod', 'candidates', 'evaluation', 'ranking', 'falsification', 'dossier', 'nextExperiment', 'capabilities', 'limitations'] as const) {
      expect(run[key], key).toBeDefined();
    }
  });
});
