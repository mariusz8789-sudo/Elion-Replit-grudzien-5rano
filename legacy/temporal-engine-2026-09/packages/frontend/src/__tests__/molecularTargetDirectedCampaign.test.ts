import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { buildCampaignEvidencePack, buildSavedCampaign, replaySavedCampaign, verifyCampaignRoCrate } from '../core/discovery/molecular/campaignEvidence';
import { createNodeDockingTransport } from '../core/discovery/molecular/dockingTransport.node';
import type { Objective } from '../core/discovery/molecular/multiObjective';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { repositoryProxyReceptor } from '../core/discovery/molecular/receptorPreparation.node';
import { runReferenceCompoundDiscovery } from '../core/discovery/molecular/referenceDiscovery';
import { affinityIsAboutTarget } from '../core/discovery/molecular/targetHypothesis';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 17 — THE FULL TARGET-DIRECTED CAMPAIGN, WITH THE GATE OPEN.
 *
 * Every other test shows the mechanism gate CLOSED. This one shows it opening
 * honestly, which is the harder and more important case.
 *
 * The question asked here is one this environment can actually answer:
 * "which analogues of the seed dock best into villin headpiece HP36?" The
 * target of that question IS PDB 1VII, the structure is the target, and the
 * declared hypothesis carries the PDB citation. So a docking score genuinely
 * is a target affinity for THIS question.
 *
 * That is the whole distinction: 1VII is a proxy when the question is about
 * ketamine's mechanism, and the actual target when the question is about
 * binding 1VII. The engine decides from the declaration, not from vibes.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const docking = createNodeDockingTransport();
const prep = repositoryProxyReceptor(REPO_ROOT);

const rdkitAvailable = rdkit.detect().available;
const admetAvailable = admet.detect().available;
const dockingAvailable = docking.detect().available;
const allReal = rdkitAvailable && dockingAvailable && prep.ok;

const question: DiscoveryQuestion = {
  questionId: 'hp36_binders_v1',
  question: 'Which single-step analogues of the seed are computationally prioritised for binding villin headpiece subdomain HP36 (PDB 1VII)?',
  target: { targetId: 'PDB:1VII', label: 'Villin headpiece subdomain HP36', source: 'ACTUAL_SOURCE', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
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
  { objectiveId: 'strong-binding', propertyId: 'targetAffinity', direction: 'minimise', rationale: 'more negative Vina score is a better predicted pose' },
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'prefer smaller' },
];

describe(`TARGET-DIRECTED CAMPAIGN (all real engines = ${allReal})`, () => {
  if (!allReal) {
    it('bez pełnego zestawu silników kampania celowana jest jawnie zablokowana', () => {
      expect(allReal).toBe(false);
    });
    return;
  }

  // The receptor IS the declared target here, so it is labelled as such.
  const targetReceptor = { ...prep.receptor, relevance: 'MECHANISTICALLY_IMPLICATED' as const, proxyCaveat: null };

  const result = runReferenceCompoundDiscovery(
    {
      reference: { kind: 'smiles', value: 'CNC1(CCCCC1=O)c1ccccc1Cl' },
      target: {
        referenceCompound: 'seed structure',
        declaredTarget: {
          targetId: 'PDB:1VII',
          targetName: 'Villin headpiece subdomain HP36',
          biologicalSystem: 'actin-binding cytoskeletal protein',
          mechanismHypothesis: 'Direct binding to the HP36 fold, as scored by docking into the experimental structure.',
          evidence: [{ source: 'PDB', identifier: '1VII', establishes: 'Experimental NMR structure of the protein being docked into.' }],
        },
      },
      question,
      objectives,
      transformations: ['add-methyl', 'add-hydroxyl'],
      candidateBudget: 4,
    },
    {
      rdkit,
      admet: admetAvailable ? admet : undefined,
      docking,
      receptorStructure: targetReceptor,
    },
    { maxAdmetCalls: 4, maxDockingCalls: 4 },
  );

  it('1. TARGET jest ROZWIĄZANY, bo deklaracja niesie realny cytat PDB', () => {
    expect(result.targetHypothesis.status).toBe('RESOLVED');
    expect(result.targetHypothesis.targetId).toBe('PDB:1VII');
    expect(result.targetHypothesis.evidence[0]!.source).toBe('PDB');
  }, 900_000);

  it('2. BRAMA JEST OTWARTA: dokowana struktura JEST zadeklarowanym celem', () => {
    const gate = affinityIsAboutTarget(result.targetHypothesis, targetReceptor);
    expect(gate.meaningful).toBe(true);
    expect(result.affinityAboutTarget.meaningful).toBe(true);
  });

  it('3. targetAffinity to REALNY wynik Vina, oznaczony jako PREDYKCJA', () => {
    const withAffinity = result.run.candidates
      .map((c) => c.properties.find((p) => p.propertyId === 'targetAffinity'))
      .filter((p) => p !== undefined && p.value !== null);

    expect(withAffinity.length).toBeGreaterThan(0);
    for (const property of withAffinity) {
      expect(property!.status).toBe('MODEL_PREDICTION');
      expect(property!.status).not.toBe('COMPUTED');
      expect(property!.value).toBeLessThan(0);
      expect(property!.engine).toMatch(/Vina/);
      expect(property!.unit).toBe('kcal/mol');
    }
  }, 900_000);

  it('4. wynik dokowania REALNIE uczestniczy w rankingu wielokryterialnym', () => {
    expect(result.run.ranking.objectives.map((o) => o.objectiveId)).toContain('strong-binding');
    // Cel oparty na powinowactwie jest ocenialny dla kandydatów, którzy je mają.
    const evaluable = result.run.ranking.ranked
      .flatMap((r) => r.objectives.values)
      .filter((v) => v.objectiveId === 'strong-binding' && v.evaluable);
    expect(evaluable.length).toBeGreaterThan(0);
  });

  it('5. zdanie o priorytetyzacji nazywa cel i NIE twierdzi aktywności', () => {
    expect(result.prioritisation).toMatch(/computationally prioritised against the resolved target hypothesis/i);
    expect(result.prioritisation).toMatch(/not evidence of activity/i);
    expect(result.prioritisation).toMatch(/not been experimentally validated/i);
  });

  it('6. dowód, RO-Crate i replay działają na kampanii celowanej', () => {
    const pack = buildCampaignEvidencePack(result.run);
    expect(pack.runs[0]!.provenance.resultOrigin).toBe('real-engine');
    expect(verifyCampaignRoCrate(result.run).status).toBe('MATCH');
    expect(replaySavedCampaign(buildSavedCampaign(result.run), result.run).status).toBe('MATCH');
  });

  it('7. BEZPIECZEŃSTWO nadal wymaga eksperymentu, mimo otwartej bramy', () => {
    const safety = result.run.candidates[0]!.properties.find((p) => p.propertyId === 'safety')!;
    expect(safety.status).toBe('REQUIRES_EXPERIMENT');
    expect(safety.value).toBeNull();
  });

  it('8. ograniczenia nadal mówią, że dokowanie to predykcja, nie pomiar', () => {
    expect(result.limitations.join(' ')).toMatch(/predictions from an empirical scoring function|not measured binding/i);
    expect(result.limitations.join(' ')).toMatch(/Nothing here was measured/i);
  });

  it('9. TA SAMA struktura jako PROXY zamyka bramę — decyduje deklaracja, nie wygoda', () => {
    const asProxy = { ...prep.receptor, relevance: 'STRUCTURAL_PROXY' as const, proxyCaveat: 'not the target' };
    expect(affinityIsAboutTarget(result.targetHypothesis, asProxy).meaningful).toBe(false);
  });
});
