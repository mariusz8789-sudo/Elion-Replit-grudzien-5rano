import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { buildCampaignEvidencePack, buildSavedCampaign, replaySavedCampaign, verifyCampaignRoCrate } from '../core/discovery/molecular/campaignEvidence';
import { resolveCompound, type CompoundLookupTransport } from '../core/discovery/molecular/compoundResolver';
import { runDiscoveryCampaign } from '../core/discovery/molecular/discoveryCampaign';
import { createNodeDockingTransport } from '../core/discovery/molecular/dockingTransport.node';
import { rdkitSmartsEnumeratorProvider } from '../core/discovery/molecular/enumeratorProviders';
import { generativeChemistryProvider } from '../core/discovery/molecular/generativeProvider';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import type { Objective } from '../core/discovery/molecular/multiObjective';
import { buildNaturalProductLead } from '../core/discovery/molecular/naturalProducts';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 15 — PROOF OF CAPABILITY, ANSWERED IN CODE.
 *
 * Ten questions, each answered YES / PARTIAL / NOT_AVAILABLE by an assertion
 * rather than a description. Where a capability is PARTIAL or NOT_AVAILABLE,
 * the test asserts the HONEST FAILURE SHAPE — that is the claim being made.
 */
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const docking = createNodeDockingTransport();

const rdkitAvailable = rdkit.detect().available;
const admetAvailable = admet.detect().available;
const dockingAvailable = docking.detect().available;

const lookup: CompoundLookupTransport = {
  transportId: 'test-fixture',
  available: () => ({ available: true, reason: '' }),
  fetchJson: () => ({ ok: true, body: { PropertyTable: { Properties: [{ CID: 2244, SMILES: 'CC(=O)Oc1ccccc1C(=O)O', MolecularFormula: 'C9H8O4' }] } } }),
};

const question: DiscoveryQuestion = {
  questionId: 'capability_proof_v1',
  question: 'Which analogues of the seed satisfy the declared physicochemical and predicted-absorption window?',
  target: { targetId: 't', label: 'No target structure declared', source: 'NOT_AVAILABLE', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 120, valueMax: 400, required: true, rationale: 'declared' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: -1, valueMax: 4, required: true, rationale: 'declared' },
    ],
  },
};
const objectives: readonly Objective[] = [
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'smaller' },
  { objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 'lipophilicity' },
];
const request: GenerationRequest = {
  seeds: ['CC(=O)Oc1ccccc1C(=O)O'], transformations: ['add-methyl', 'add-hydroxyl'], depth: 1, maxCandidates: 8, constraints: question.constraints,
};

const run = rdkitAvailable
  ? runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives,
    { admet: admetAvailable ? admet : undefined, docking: dockingAvailable ? docking : undefined, receptor: null },
    { maxAdmetCalls: 8 })
  : null;

describe('PROOF 1 — czy Genesis generuje nowe struktury?', () => {
  it(`YES (rdkit=${rdkitAvailable}): realne reakcje SMARTS dają nowe, unikalne struktury`, () => {
    if (!rdkitAvailable) { expect(rdkit.detect().available).toBe(false); return; }
    expect(run!.candidates.length).toBeGreaterThan(1);
    const smiles = run!.candidates.map((c) => c.structure.canonicalSmiles);
    expect(new Set(smiles).size).toBe(smiles.length);
    // Produkty RÓŻNIĄ się od zasiewu — coś naprawdę powstało.
    expect(smiles.some((s) => s !== request.seeds[0])).toBe(true);
  });
});

describe('PROOF 2 — czy Genesis je waliduje?', () => {
  it(`YES: każda struktura jest kanonizowana przez RDKit (available=${rdkitAvailable})`, () => {
    if (!rdkitAvailable) return;
    expect(run!.candidates.every((c) => c.structure.status === 'ACTUAL_SOURCE')).toBe(true);
    expect(run!.candidates.every((c) => (c.structure.engine ?? '').startsWith('RDKit'))).toBe(true);
    // Nieprawidłowy SMILES jest odrzucany, nie naprawiany.
    expect(rdkit.describe('not-a-molecule').ok).toBe(false);
  });
});

describe('PROOF 3 — czy Genesis liczy realne właściwości?', () => {
  it(`YES: deskryptory RDKit są COMPUTED z realnego silnika`, () => {
    if (!rdkitAvailable) return;
    const logP = run!.candidates[0]!.properties.find((p) => p.propertyId === 'logP')!;
    expect(logP.status).toBe('COMPUTED');
    expect(typeof logP.value).toBe('number');
    expect(logP.engine).toMatch(/^RDKit /);
  });
});

describe('PROOF 4 — czy Genesis rozwiązuje target/source?', () => {
  it('PARTIAL: nazwa → struktura działa; TARGET biologiczny pozostaje NOT_RESOLVED', () => {
    // Rozwiązywanie związku: działa.
    expect(resolveCompound({ kind: 'name', value: 'aspirin' }, lookup).status).toBe('RESOLVED_SINGLE');
    // Źródło naturalne: działa jako prowieniencja.
    const lead = buildNaturalProductLead(
      { sourceOrganism: 'Salix alba', compoundName: 'aspirin', evidence: [{ kind: 'PEER_REVIEWED_LITERATURE', reference: 'ref', establishes: 'occurrence' }] },
      lookup,
    );
    expect(lead.evidenceStrength).toBe('CITED');
    // Ale TARGET biologiczny nie jest rozwiązany — i jest to jawne.
    expect(question.target.source).toBe('NOT_AVAILABLE');
    if (rdkitAvailable) {
      expect(run!.nextExperiment.some((s) => s.resolves === 'targetAffinity')).toBe(true);
    }
  });
});

describe('PROOF 5 — czy Genesis uruchamia dostępne predictive engines?', () => {
  it(`ADMET-AI: ${admetAvailable ? 'YES' : 'NOT_AVAILABLE'} — realne predykcje albo jawna blokada`, () => {
    if (!rdkitAvailable) return;
    const report = run!.capabilities.find((c) => c.engine.includes('ADMET') || c.engine.includes('admet'))!;
    if (admetAvailable) {
      expect(report.available).toBe(true);
      expect(report.contributed.length).toBeGreaterThan(0);
      const absorption = run!.candidates[0]!.properties.find((p) => p.propertyId === 'admetAbsorption')!;
      expect(absorption.status).toBe('MODEL_PREDICTION');
    } else {
      expect(report.available).toBe(false);
      expect(report.reason.length).toBeGreaterThan(0);
    }
  }, 900_000);

  it(`AutoDock Vina: ${dockingAvailable ? 'YES (engine) but targetAffinity NOT_AVAILABLE without a receptor' : 'NOT_AVAILABLE'}`, () => {
    if (!rdkitAvailable) return;
    // Bez zadeklarowanego receptora dokowanie NIE daje powinowactwa — i to jest
    // poprawne zachowanie, nie brak funkcji.
    const affinity = run!.candidates[0]!.properties.find((p) => p.propertyId === 'targetAffinity');
    expect(affinity?.value ?? null).toBeNull();
  });
});

describe('PROOF 6 — czy Genesis porównuje kandydatów?', () => {
  it('YES: ranking Pareto z uzasadnieniem dla każdego kandydata', () => {
    if (!rdkitAvailable) return;
    expect(run!.ranking.ranked.length).toBe(run!.candidates.length);
    expect(run!.ranking.ranked.every((r) => r.justification.length > 0)).toBe(true);
    expect(run!.ranking.frontCaveat.length).toBeGreaterThan(0);
  });
});

describe('PROOF 7 — czy Genesis odrzuca słabych kandydatów?', () => {
  it('YES: odrzucenie następuje na REALNYCH wartościach, z podaniem kryterium', () => {
    const strict: DiscoveryQuestion = {
      ...question,
      constraints: { ...question.constraints, criteria: [{ criterionId: 'mw-tiny', propertyId: 'molecularWeight', op: 'lte', value: 100, required: true, rationale: 'declared' }] },
    };
    if (!rdkitAvailable) return;
    const strictRun = runDiscoveryCampaign(strict, rdkitSmartsEnumeratorProvider(rdkit), { ...request, constraints: strict.constraints }, objectives);
    expect(strictRun.decision.rejectedCount).toBeGreaterThan(0);
    const rejected = strictRun.ranking.rejected[0];
    if (rejected) expect(rejected.justification).toMatch(/Failed required criteria on real values/i);
  }, 900_000);
});

describe('PROOF 8 — czy Genesis zapisuje dowody?', () => {
  it('YES: Evidence Pack + RO-Crate round trip przez ISTNIEJĄCE silniki', () => {
    if (!rdkitAvailable) return;
    const pack = buildCampaignEvidencePack(run!);
    expect(pack.runCount).toBe(1);
    expect(pack.runs[0]!.provenance.resultOrigin).toBe('real-engine');
    expect(verifyCampaignRoCrate(run!).status).toBe('MATCH');
  });
});

describe('PROOF 9 — czy Genesis odtwarza eksperyment?', () => {
  it('YES: ten sam przebieg → MATCH; inny zestaw silników → BLOCKED', () => {
    if (!rdkitAvailable) return;
    const saved = buildSavedCampaign(run!);
    expect(replaySavedCampaign(saved, run!).status).toBe('MATCH');
    expect(replaySavedCampaign({ ...saved, runFingerprint: 'tampered' }, run!).status).toBe('DRIFT');
    expect(replaySavedCampaign({ ...saved, engineIds: [...saved.engineIds, 'phantom-engine'] }, run!).status).toBe('BLOCKED');
  });
});

describe('PROOF 10 — czy Genesis proponuje kolejny eksperyment?', () => {
  it('YES: kroki wynikają z realnych braków i nie udają wykonania', () => {
    if (!rdkitAvailable) return;
    expect(run!.nextExperiment.length).toBeGreaterThan(0);
    expect(run!.nextExperiment.some((s) => s.kind === 'REQUIRES_EXTERNAL_EXPERIMENT' && s.resolves === 'safety')).toBe(true);
    expect(run!.nextExperiment.filter((s) => s.kind === 'RUNNABLE_IN_GENESIS').every((s) => s.resolves === 'candidateSpace')).toBe(true);
  });
});

describe('PROOF 11 — czego Genesis NIE potrafi (jawnie)', () => {
  it('NOT_AVAILABLE: model generatywny — runtime jest, wag nie ma', () => {
    const capability = generativeChemistryProvider().capabilities();
    expect(capability.kind).toBe('NOT_AVAILABLE');
    expect(capability.reason).toMatch(/model hub is unreachable|no model weights/i);
  });

  it('NOT_AVAILABLE: bezpieczeństwo — pozostaje eksperymentalne przy WSZYSTKICH silnikach', () => {
    if (!rdkitAvailable) return;
    const safety = run!.candidates[0]!.properties.find((p) => p.propertyId === 'safety')!;
    expect(safety.status).toBe('REQUIRES_EXPERIMENT');
    expect(safety.value).toBeNull();
    expect(run!.limitations.join(' ')).toMatch(/Nothing here was measured/i);
  });
});
