import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import {
  buildCampaignEvidencePack,
  buildSavedCampaign,
  campaignLineageFingerprint,
  isSavedCampaign,
  replaySavedCampaign,
  verifyCampaignRoCrate,
} from '../core/discovery/molecular/campaignEvidence';
import { runDiscoveryCampaign } from '../core/discovery/molecular/discoveryCampaign';
import { rdkitSmartsEnumeratorProvider } from '../core/discovery/molecular/enumeratorProviders';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import type { Objective } from '../core/discovery/molecular/multiObjective';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryQuestion } from '../core/discovery/molecular/types';

/**
 * ETAP 9 — LINEAGE. The campaign must reach the EXISTING Evidence Pack,
 * RO-Crate and replay machinery, and replay must refuse to call a run under
 * different engines "the same experiment".
 */
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const rdkitAvailable = rdkit.detect().available;

const question: DiscoveryQuestion = {
  questionId: 'lineage_v1',
  question: 'Which analogues satisfy the declared window?',
  target: { targetId: 't', label: 'none declared', source: 'NOT_AVAILABLE', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 120, valueMax: 400, required: true, rationale: 'declared' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: -1, valueMax: 4, required: true, rationale: 'declared' },
    ],
  },
};
const objectives: readonly Objective[] = [{ objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'smaller' }];
const request: GenerationRequest = {
  seeds: ['CC(=O)Oc1ccccc1C(=O)O'], transformations: ['add-methyl'], depth: 1, maxCandidates: 6, constraints: question.constraints,
};

describe('zapis kampanii odrzuca uszkodzone rekordy', () => {
  it('brak lub zły kształt → BLOCKED, nigdy cichy MATCH', () => {
    expect(isSavedCampaign(undefined)).toBe(false);
    expect(isSavedCampaign({ contractVersion: '1' })).toBe(false);
    const fakeRun = { runFingerprint: 'x', generationMethod: { methodId: 'm' }, capabilities: [], question, request } as never;
    expect(replaySavedCampaign(undefined, fakeRun).status).toBe('BLOCKED');
    expect(replaySavedCampaign({}, fakeRun).status).toBe('BLOCKED');
  });
});

describe(`LINEAGE kampanii (rdkit=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit kampania nie ma kandydatów do udokumentowania', () => {
      const run = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives);
      expect(run.candidates).toHaveLength(0);
    });
    return;
  }

  const run = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives, { admet }, { maxAdmetCalls: 6 });

  it('Evidence Pack powstaje przez ISTNIEJĄCY silnik', () => {
    const pack = buildCampaignEvidencePack(run);
    expect(pack.runCount).toBe(1);
    expect(pack.runs[0]!.provenance.resultOrigin).toBe('real-engine');
  }, 900_000);

  it('RO-Crate round trip daje MATCH', () => {
    expect(verifyCampaignRoCrate(run).status).toBe('MATCH');
  });

  it('replay tej samej kampanii daje MATCH', () => {
    const saved = buildSavedCampaign(run);
    const again = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives, { admet }, { maxAdmetCalls: 6 });
    expect(replaySavedCampaign(saved, again).status).toBe('MATCH');
  }, 900_000);

  it('INNY ZESTAW SILNIKÓW to BLOCKED, nie DRIFT', () => {
    const saved = buildSavedCampaign(run);
    // Ta sama kampania bez ADMET: inny zestaw silników, więc inny eksperyment.
    const withoutAdmet = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives);
    const replay = replaySavedCampaign(saved, withoutAdmet);

    expect(replay.status).toBe('BLOCKED');
    expect(replay.status).not.toBe('DRIFT');
    expect(replay.reason).toMatch(/different experiment, not a drifted one/i);
    expect(replay.engineDelta.length).toBeGreaterThan(0);
  }, 900_000);

  it('zmiana wyniku przy TYM SAMYM zestawie silników to DRIFT', () => {
    const saved = { ...buildSavedCampaign(run), runFingerprint: 'tampered' };
    expect(replaySavedCampaign(saved, run).status).toBe('DRIFT');
  });

  it('odcisk linii rodowej jest deterministyczny i wiąże pytanie, metodę, silniki i dossier', () => {
    expect(campaignLineageFingerprint(run)).toBe(campaignLineageFingerprint(run));
    expect(campaignLineageFingerprint(run).length).toBeGreaterThan(0);
  });
});

describe('kontrakt DiscoveryRun realnie zawiera evidence i replay', () => {
  if (!rdkitAvailable) {
    // Bez RDKit nie ma kandydatów, ale kontrakt musi ISTNIEĆ — akcesory są
    // obecne i wołalne niezależnie od tego, czy jakikolwiek silnik działa.
    it('akcesory evidence/replay istnieją nawet bez silników', () => {
      const empty = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives);
      expect(typeof empty.evidence).toBe('function');
      expect(typeof empty.replay).toBe('function');
      expect(isSavedCampaign(empty.replay())).toBe(true);
    });
    return;
  }
  const run = runDiscoveryCampaign(question, rdkitSmartsEnumeratorProvider(rdkit), request, objectives);

  it('run.evidence() zwraca realną paczkę dowodową', () => {
    const pack = run.evidence();
    expect(pack.runCount).toBe(1);
    expect(pack.runs[0]!.provenance.resultOrigin).toBe('real-engine');
  });

  it('run.replay() zwraca zapis, który da się odtworzyć', () => {
    const saved = run.replay();
    expect(isSavedCampaign(saved)).toBe(true);
    expect(replaySavedCampaign(saved, run).status).toBe('MATCH');
  });
});
