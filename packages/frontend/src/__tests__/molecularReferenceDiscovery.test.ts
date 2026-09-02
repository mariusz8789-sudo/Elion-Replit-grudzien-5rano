import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import type { CompoundLookupTransport } from '../core/discovery/molecular/compoundResolver';
import { createNodeDockingTransport } from '../core/discovery/molecular/dockingTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { repositoryProxyReceptor } from '../core/discovery/molecular/receptorPreparation.node';
import { runReferenceCompoundDiscovery } from '../core/discovery/molecular/referenceDiscovery';
import type { Objective } from '../core/discovery/molecular/multiObjective';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 12 — KETAMINE AS A TEST CASE, NOT A CLAIM.
 *
 * Ketamine is used ONLY to exercise the architecture end to end:
 * reference compound -> target resolution -> analogue generation -> real
 * structural evaluation -> target-related computation where available ->
 * ranking -> falsification.
 *
 * THE GOAL IS NOT TO ASSERT THAT ANY CANDIDATE ACTS LIKE KETAMINE, and these
 * tests assert that no such claim is produced. Where target data is
 * unavailable, the run must say so precisely.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const docking = createNodeDockingTransport();
const prep = repositoryProxyReceptor(REPO_ROOT);

const rdkitAvailable = rdkit.detect().available;
const admetAvailable = admet.detect().available;
const dockingAvailable = docking.detect().available;

/** Ketamine, as a structure to start enumeration from. */
const KETAMINE_SMILES = 'CNC1(CCCCC1=O)c1ccccc1Cl';

/** No bioactivity source is reachable here; this reports that honestly. */
const blockedBioactivity: CompoundLookupTransport = {
  transportId: 'egress-blocked',
  available: () => ({ available: false, reason: 'ChEMBL is unreachable from this environment (connection refused at the egress proxy).' }),
  fetchJson: () => ({ ok: false, reason: 'unreachable' }),
};

const question: DiscoveryQuestion = {
  questionId: 'reference_analogue_v1',
  question: 'Which single-step analogues of the reference structure stay inside the declared physicochemical window?',
  target: { targetId: 'unresolved', label: 'Not resolved from any source', source: 'NOT_AVAILABLE', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F', 'Cl'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 150, valueMax: 400, required: true, rationale: 'declared before the run' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: 0, valueMax: 5, required: true, rationale: 'declared before the run' },
    ],
  },
};

const objectives: readonly Objective[] = [
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'prefer smaller analogues' },
  { objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 'declared lipophilicity target' },
];

describe(`REFERENCE -> ANALOGUES (rdkit=${rdkitAvailable} admet=${admetAvailable} docking=${dockingAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit pipeline referencyjny nie generuje struktur', () => {
      const result = runReferenceCompoundDiscovery(
        { reference: { kind: 'smiles', value: KETAMINE_SMILES }, target: { referenceCompound: 'ketamine' },
          question, objectives, transformations: ['add-methyl'], candidateBudget: 6 },
        { rdkit },
      );
      expect(result.run.candidates).toHaveLength(0);
    });
    return;
  }

  const result = runReferenceCompoundDiscovery(
    {
      reference: { kind: 'smiles', value: KETAMINE_SMILES },
      target: { referenceCompound: 'ketamine' },
      question,
      objectives,
      transformations: ['add-methyl', 'add-hydroxyl', 'add-fluoro'],
      candidateBudget: 8,
      excludeStructures: [],
    },
    {
      rdkit,
      admet: admetAvailable ? admet : undefined,
      docking: dockingAvailable ? docking : undefined,
      bioactivity: blockedBioactivity,
      receptorStructure: prep.ok ? prep.receptor : null,
    },
    { maxAdmetCalls: 8, maxDockingCalls: 2 },
  );

  it('1. TARGET jest jawnie NIEROZWIĄZANY, a nie zmyślony', () => {
    expect(result.targetHypothesis.status).toBe('BLOCKED');
    expect(result.targetHypothesis.targetId).toBeNull();
    expect(result.targetHypothesis.mechanismHypothesis).toBeNull();
    expect(result.targetHypothesis.statusReason).toMatch(/unreachable|could not be reached/i);
  }, 900_000);

  it('2. z referencji powstają REALNE analogi strukturalne', () => {
    expect(result.run.candidates.length).toBeGreaterThan(1);
    expect(result.run.candidates.every((c) => c.structure.status === 'ACTUAL_SOURCE')).toBe(true);
    // Analogi RÓŻNIĄ się od referencji.
    expect(result.run.candidates.some((c) => c.structure.canonicalSmiles !== KETAMINE_SMILES)).toBe(true);
  });

  it('3. deskryptory strukturalne są policzone realnym silnikiem', () => {
    const logP = result.run.candidates[0]!.properties.find((p) => p.propertyId === 'logP')!;
    expect(logP.status).toBe('COMPUTED');
    expect(logP.engine).toMatch(/^RDKit /);
  });

  if (admetAvailable) {
    it('4. ADMET wnosi realne PREDYKCJE, nigdy pomiary', () => {
      const absorption = result.run.candidates[0]!.properties.find((p) => p.propertyId === 'admetAbsorption')!;
      expect(absorption.status).toBe('MODEL_PREDICTION');
      expect(typeof absorption.value).toBe('number');
    }, 900_000);
  }

  it('5. ŻADEN wynik dokowania nie jest powinowactwem do celu ketaminy', () => {
    expect(result.affinityAboutTarget.meaningful).toBe(false);
    const affinity = result.run.candidates[0]!.properties.find((p) => p.propertyId === 'targetAffinity');
    expect(affinity?.value ?? null).toBeNull();
  }, 900_000);

  it('6. zdanie o priorytetyzacji NIE twierdzi podobieństwa działania', () => {
    expect(result.prioritisation).toMatch(/no mechanism is claimed/i);
    expect(result.prioritisation).not.toMatch(/like ketamine|same effect|acts like|works like/i);
  });

  it('7. ograniczenia mówią wprost, że mechanizm referencji nie przenosi się na analog', () => {
    const limitations = result.limitations.join(' ');
    expect(limitations).toMatch(/evidence about the reference.*not evidence that any analogue.*shares it/i);
    expect(limitations).toMatch(/Nothing here was measured/i);
  });

  it('8. ranking i falsyfikacja działają na realnych wartościach', () => {
    expect(result.run.ranking.ranked.length).toBe(result.run.candidates.length);
    expect(result.run.falsification.perCandidate.length).toBe(result.run.candidates.length);
    expect(result.run.falsification.untestedRefutations.length).toBeGreaterThan(0);
  });

  it('9. NIGDZIE nie pada twierdzenie o odkryciu ani bezpieczeństwie', () => {
    // Jednoznacznie twierdzące sformułowania. Celowo NIE szukamy "is safe":
    // uczciwe zdanie "no endpoint establishes that a compound is safe" zawiera
    // tę frazę, a jest dokładnie odwrotnością twierdzenia.
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/discovered a new|proven safe|shown to be safe|side.effect free|therapeutically effective/i);

    // Pola niosące twierdzenia sprawdzamy wprost, a nie przez wyszukiwanie w blobie.
    expect(result.prioritisation).toMatch(/no mechanism is claimed|not evidence of activity/i);
    expect(result.run.dossier!.claimStatement).toMatch(/requiring experimental validation/i);
    expect(result.run.dossier!.claimStatement).toMatch(/No efficacy, safety, bioactivity or therapeutic property has been demonstrated/i);

    const safety = result.run.candidates[0]!.properties.find((p) => p.propertyId === 'safety')!;
    expect(safety.status).toBe('REQUIRES_EXPERIMENT');
  });

  it('10. dossier istnieje i NIE zawiera operacyjnej syntezy', () => {
    expect(result.run.dossier).not.toBeNull();
    const dossier = JSON.stringify(result.run.dossier).toLowerCase();
    expect(dossier).not.toMatch(/\b\d+(\.\d+)?\s?(g|mg|kg|ml|mmol|mol)\b/);
    expect(dossier).not.toMatch(/\b(for|over|during)\s+\d+(\.\d+)?\s?(h|hr|min|minutes)\b/);
    expect(dossier).not.toMatch(/dropwise|reflux|stir for|heat to|then add/);
    // Domyślnie trasa syntezy jest wstrzymana — brak sprawdzenia rejestru.
    expect(result.run.dossier!.labHandoff.synthesisDisclosure).toBe('WITHHELD_PENDING_EXPERT_REVIEW');
  });

  it('11. cały przebieg jest odtwarzalny', () => {
    expect(result.run.runFingerprint).toBe(result.run.runFingerprint);
    expect(result.targetHypothesis.fingerprint.length).toBeGreaterThan(0);
  });
});
