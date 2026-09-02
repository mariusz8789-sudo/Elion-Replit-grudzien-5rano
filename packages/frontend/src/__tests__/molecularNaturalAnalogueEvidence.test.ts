import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import {
  buildNaturalAnalogueDossier,
  buildNaturalAnalogueEvidencePack,
  buildNaturalAnalogueExperimentGraph,
  buildSavedNaturalAnalogueRun,
  exportNaturalAnalogueRoCrate,
  explainNaturalAnalogueEvidence,
  isSavedNaturalAnalogueRun,
  proposeNaturalAnalogueNextSteps,
  replaySavedNaturalAnalogueRun,
  verifyNaturalAnalogueRoCrateRoundTrip,
} from '../core/discovery/molecular/naturalAnalogueEvidence';
import type { NaturalAnalogueCampaignRequest } from '../core/discovery/molecular/naturalAnalogueCampaign';
import { NATURAL_PRODUCT_CANDIDATE_POOL } from '../core/discovery/molecular/naturalProductCandidatePool';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryConstraints, DiscoveryQuestion } from '../core/discovery/molecular/types';
import type { Objective } from '../core/discovery/molecular/multiObjective';

/**
 * NATURAL-DISCOVERY MISSION, ETAP 14 — EVIDENCE PACK / RO-CRATE / REPLAY.
 *
 * "Tak aby ktoś inny mógł odtworzyć cały tok: question -> source -> candidate
 * -> computation -> ranking -> falsification -> conclusion."
 */
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const rdkitAvailable = rdkit.detect().available;
const admetAvailable = admet.detect().available;

const screeningConstraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'N', 'O', 'S', 'Cl', 'F'],
  maxHeavyAtoms: 40,
  criteria: [
    { criterionId: 'tpsa-bbb', propertyId: 'tpsa', op: 'lte', value: 90, required: true, rationale: 'TPSA <= 90 Å² BBB heuristic (Kelder et al. 1999).' },
    { criterionId: 'mw-cns', propertyId: 'molecularWeight', op: 'lte', value: 450, required: true, rationale: 'CNS-relevant MW bound.' },
    { criterionId: 'lipinski', propertyId: 'lipinskiViolations', op: 'lte', value: 1, required: true, rationale: 'At most one Lipinski violation.' },
    { criterionId: 'heavy-atoms', propertyId: 'heavyAtomCount', op: 'lte', value: 35, required: true, rationale: 'Bounded complexity.' },
  ],
};

const objectives: Objective[] = [
  { objectiveId: 'mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'x' },
  { objectiveId: 'tpsa', propertyId: 'tpsa', direction: 'minimise', rationale: 'x' },
  { objectiveId: 'bbb', propertyId: 'bloodBrainBarrier', direction: 'maximise', rationale: 'x' },
  { objectiveId: 'ames', propertyId: 'mutagenicity', direction: 'minimise', rationale: 'x' },
];

const question: DiscoveryQuestion = {
  questionId: 'natural-ketamine-nmda-analogue-evidence-v1',
  question: 'Which natural products are computationally prioritised against ketamine\'s resolved NMDA-receptor mechanism family?',
  target: { targetId: 'nmda-receptor', label: 'NMDA receptor', source: 'USER_SUPPLIED', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: screeningConstraints,
};

function buildRequest(): NaturalAnalogueCampaignRequest {
  return {
    referenceName: 'ketamine',
    referenceFallbackSmiles: 'CNC1(CCCCC1=O)c1ccccc1Cl',
    referenceFallbackFormula: 'C13H16ClNO',
    target: {
      referenceCompound: 'ketamine',
      declaredTarget: {
        targetId: 'nmda-receptor', targetName: 'NMDA receptor (ionotropic glutamate receptor)',
        biologicalSystem: 'CNS glutamatergic neurotransmission',
        mechanismHypothesis: 'Non-competitive, use-dependent NMDA receptor open-channel blocker.',
        evidence: [{ source: 'LITERATURE', identifier: 'Anis NA et al. Br J Pharmacol. 1983;79(2):565-575.', establishes: 'Founding characterisation of ketamine as an NMDA antagonist.' }],
      },
    },
    referenceTargetKeywords: ['nmda'],
    candidatePool: NATURAL_PRODUCT_CANDIDATE_POOL,
    screeningConstraints,
    objectives,
    question,
  };
}

describe('isSavedNaturalAnalogueRun', () => {
  it('odrzuca dane niepełne lub uszkodzone', () => {
    expect(isSavedNaturalAnalogueRun(null)).toBe(false);
    expect(isSavedNaturalAnalogueRun({})).toBe(false);
    expect(isSavedNaturalAnalogueRun({ version: '1.0.0', resultFingerprint: 'x' })).toBe(false);
  });
});

describe(`REALNA ewidencja/replay (RDKit=${rdkitAvailable}, ADMET-AI=${admetAvailable})`, () => {
  if (!rdkitAvailable || !admetAvailable) {
    it('bez obu silników przebieg jest nadal deterministyczny (MATCH), ale każdy kandydat pozostaje UNEVALUABLE', () => {
      const saved = buildSavedNaturalAnalogueRun(buildRequest(), { rdkit, admet });
      const replay = replaySavedNaturalAnalogueRun(saved, { rdkit, admet });
      expect(replay.status).toBe('MATCH');
      expect(replay.result!.candidates.every((c) => c.status !== 'RETAINED_RANKED')).toBe(true);
    });
    return;
  }

  it('replay tego samego zapisanego runu daje MATCH z realnymi silnikami', () => {
    const saved = buildSavedNaturalAnalogueRun(buildRequest(), { rdkit, admet });
    expect(isSavedNaturalAnalogueRun(saved)).toBe(true);

    const replay = replaySavedNaturalAnalogueRun(saved, { rdkit, admet });
    expect(replay.status).toBe('MATCH');
    expect(replay.result).not.toBeNull();
  }, 60_000);

  it('zmiana puli kandydatów po zapisie daje DRIFT, nie ciche MATCH', () => {
    const saved = buildSavedNaturalAnalogueRun(buildRequest(), { rdkit, admet });
    const tampered = { ...saved, request: { ...saved.request, candidatePool: NATURAL_PRODUCT_CANDIDATE_POOL.slice(0, 1) } };
    const replay = replaySavedNaturalAnalogueRun(tampered, { rdkit, admet });
    expect(replay.status).toBe('DRIFT');
  }, 60_000);

  it('uszkodzony zapis jest BLOCKED, nigdy nie przeliczany na oślep', () => {
    const replay = replaySavedNaturalAnalogueRun({ version: '1.0.0' }, { rdkit, admet });
    expect(replay.status).toBe('BLOCKED');
  });

  it('dossier, evidence pack, experiment graph i next-steps istnieją dla najlepszego kandydata', () => {
    const saved = buildSavedNaturalAnalogueRun(buildRequest(), { rdkit, admet });
    const replay = replaySavedNaturalAnalogueRun(saved, { rdkit, admet });
    const result = replay.result!;

    const dossier = buildNaturalAnalogueDossier(result);
    const pack = buildNaturalAnalogueEvidencePack(result);
    const graph = buildNaturalAnalogueExperimentGraph(result);
    const advice = explainNaturalAnalogueEvidence(result);
    const nextSteps = proposeNaturalAnalogueNextSteps(result);

    if (result.bestCandidate === 'NOT_RESOLVED') {
      expect(dossier).toBeNull();
    } else {
      expect(dossier).not.toBeNull();
      expect(dossier!.claimStatement).toBeDefined();
    }
    expect(pack).not.toBeNull();
    expect(graph).not.toBeNull();
    expect(advice).not.toBeNull();
    expect(Array.isArray(nextSteps)).toBe(true);
  }, 60_000);

  it('RO-Crate eksport i weryfikacja round-trip działają na pakiecie z realnego runu', () => {
    const saved = buildSavedNaturalAnalogueRun(buildRequest(), { rdkit, admet });
    const replay = replaySavedNaturalAnalogueRun(saved, { rdkit, admet });
    const pack = buildNaturalAnalogueEvidencePack(replay.result!)!;

    const roCrate = exportNaturalAnalogueRoCrate(pack);
    expect(roCrate).toBeDefined();

    const verification = verifyNaturalAnalogueRoCrateRoundTrip(pack);
    expect(verification.status).toBe('MATCH');
    expect(verification.missing).toHaveLength(0);
  }, 60_000);
});
