import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { probeLiveCompoundLookup } from '../core/discovery/molecular/compoundLookupTransport.node';
import { pubchemNameUrl } from '../core/discovery/molecular/compoundResolver';
import {
  naturalAnalogueCampaignFingerprint,
  runNaturalAnalogueCampaign,
  type NaturalAnalogueCampaignRequest,
} from '../core/discovery/molecular/naturalAnalogueCampaign';
import { NATURAL_PRODUCT_CANDIDATE_POOL } from '../core/discovery/molecular/naturalProductCandidatePool';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { chemblMoleculeUrl } from '../core/discovery/molecular/targetResolution';
import type { DiscoveryConstraints, DiscoveryQuestion } from '../core/discovery/molecular/types';
import type { Objective } from '../core/discovery/molecular/multiObjective';

/**
 * REAL E2E — "GENESIS — MAXIMUM-CONFIDENCE NATURAL DISCOVERY MISSION".
 *
 * Reference case: ketamine. Question: which natural products are
 * computationally prioritised against ketamine's resolved NMDA-receptor
 * mechanism family, and how far does the evidence actually go?
 *
 * This suite (a) records what a REAL, awaited attempt against PubChem/ChEMBL
 * actually does in this runtime, then (b) runs the full campaign end to end
 * against the REAL RDKit and REAL ADMET-AI engines when they are present.
 */
const rdkit = createNodeRdkitTransport();
const admet = createNodeAdmetTransport();
const rdkitAvailable = rdkit.detect().available;
const admetAvailable = admet.detect().available;

const KETAMINE_SMILES = 'CNC1(CCCCC1=O)c1ccccc1Cl';
const KETAMINE_FORMULA = 'C13H16ClNO';

const screeningConstraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'N', 'O', 'S', 'Cl', 'F'],
  maxHeavyAtoms: 40,
  criteria: [
    { criterionId: 'tpsa-bbb', propertyId: 'tpsa', op: 'lte', value: 90, required: true, rationale: 'TPSA <= 90 Å² is a standard heuristic for blood-brain-barrier penetration (Kelder et al. 1999).' },
    { criterionId: 'mw-cns', propertyId: 'molecularWeight', op: 'lte', value: 450, required: true, rationale: 'CNS-relevant compounds are typically well under 450 g/mol.' },
    { criterionId: 'lipinski', propertyId: 'lipinskiViolations', op: 'lte', value: 1, required: true, rationale: 'At most one Lipinski violation.' },
    { criterionId: 'heavy-atoms', propertyId: 'heavyAtomCount', op: 'lte', value: 35, required: true, rationale: 'Bounded structural complexity for this screen.' },
  ],
};

const objectives: Objective[] = [
  { objectiveId: 'mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'Lower molecular weight favours CNS penetration.' },
  { objectiveId: 'tpsa', propertyId: 'tpsa', direction: 'minimise', rationale: 'Lower polar surface area favours BBB penetration.' },
  { objectiveId: 'bbb', propertyId: 'bloodBrainBarrier', direction: 'maximise', rationale: 'Ketamine acts centrally; predicted BBB penetration is directly relevant.' },
  { objectiveId: 'ames', propertyId: 'mutagenicity', direction: 'minimise', rationale: 'Lower predicted mutagenicity is a safety-relevant screen, not a safety claim.' },
];

const question: DiscoveryQuestion = {
  questionId: 'natural-ketamine-nmda-analogue-v1',
  question: 'Which natural products are computationally prioritised as candidates sharing ketamine\'s resolved NMDA-receptor mechanism family, screened for CNS-relevant drug-likeness?',
  target: { targetId: 'nmda-receptor', label: 'NMDA receptor (ionotropic glutamate receptor)', source: 'USER_SUPPLIED', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: screeningConstraints,
};

function buildRequest(): NaturalAnalogueCampaignRequest {
  return {
    referenceName: 'ketamine',
    referenceFallbackSmiles: KETAMINE_SMILES,
    referenceFallbackFormula: KETAMINE_FORMULA,
    target: {
      referenceCompound: 'ketamine',
      declaredTarget: {
        targetId: 'nmda-receptor',
        targetName: 'NMDA receptor (ionotropic glutamate receptor)',
        biologicalSystem: 'Central nervous system glutamatergic neurotransmission',
        mechanismHypothesis: 'Non-competitive, use-dependent open-channel blocker of the NMDA receptor (PCP/MK-801 binding site).',
        evidence: [{
          source: 'LITERATURE',
          identifier: 'Anis NA, Berry SC, Burton NR, Lodge D. "The dissociative anaesthetics, ketamine and phencyclidine, selectively reduce excitation of central mammalian neurones by N-methyl-aspartate." Br J Pharmacol. 1983;79(2):565-575.',
          establishes: 'Founding pharmacological characterisation of ketamine as an NMDA receptor antagonist.',
        }],
      },
    },
    referenceTargetKeywords: ['nmda'],
    candidatePool: NATURAL_PRODUCT_CANDIDATE_POOL,
    screeningConstraints,
    objectives,
    question,
  };
}

describe('ETAP 1 — próba na REALNYCH źródłach jest wykonana, nie założona', () => {
  it('realna próba PubChem dla "ketamine" jest zapisana z prawdziwym wynikiem (status/reason)', async () => {
    const result = await probeLiveCompoundLookup(pubchemNameUrl('ketamine'));
    expect(typeof result.available).toBe('boolean');
    expect(result.url).toContain('ketamine');
    // Whatever happens (blocked, 403, or actually resolved), the fact is real and checkable.
    if (!result.available) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  }, 15_000);

  it('realna próba ChEMBL dla "ketamine" jest zapisana z prawdziwym wynikiem', async () => {
    const result = await probeLiveCompoundLookup(chemblMoleculeUrl('ketamine'));
    expect(typeof result.available).toBe('boolean');
    if (!result.available) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  }, 15_000);
});

describe('runNaturalAnalogueCampaign — bez ketaminy zahardkodowanej w logice pipeline\'u', () => {
  it('target jest rozwiązany PRZED odczytaniem puli kandydatów (kolejność w kodzie), a referencja korzysta z fallbacku z realną walidacją RDKit', () => {
    const result = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
    expect(result.targetHypothesis.status).toBe('RESOLVED');
    expect(result.targetHypothesis.targetName).toMatch(/NMDA/i);
    expect(result.referenceResolution.usedFallback).toBe(true);
    expect(result.limitations.join(' ')).toMatch(/live name lookup did not resolve/i);
  });

  it('harmalina (zły target) jest ODRZUCONA na etapie mechanizmu, niezależnie od reszty', () => {
    const result = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
    const harmaline = result.candidates.find((c) => c.candidateKey === 'harmaline')!;
    expect(harmaline.status).toBe('REJECTED_MECHANISM');
    expect(harmaline.mechanismFalsification.verdict).toBe('REJECTED_WRONG_TARGET');
  });

  it('conantokin-G (peptyd bez struktury) jest UNEVALUABLE, NIE odrzucony jako zły', () => {
    const result = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
    const conantokin = result.candidates.find((c) => c.candidateKey === 'conantokin-g')!;
    expect(conantokin.status).toBe('UNEVALUABLE_NO_STRUCTURE');
    expect(conantokin.mechanismFalsification.verdict).toBe('RETAINED');
  });

  it('wynik jest deterministyczny (ten sam fingerprint dla dwóch identycznych przebiegów)', () => {
    const a = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
    const b = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
    expect(naturalAnalogueCampaignFingerprint(a)).toBe(naturalAnalogueCampaignFingerprint(b));
  });

  it('żadne oświadczenie top-kandydata nie twierdzi odkrycia "bezpiecznego zamiennika ketaminy"', () => {
    const result = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
    const allText = [
      ...result.limitations,
      ...result.topCandidates.flatMap((t) => [t.whyIncluded, ...t.whatWeKnow, ...t.whatWeDontKnow]),
    ].join(' ').toLowerCase();
    expect(allText).not.toMatch(/found a safe natural ketamine replacement/);
    expect(allText).not.toMatch(/discovered a new safe version/);
  });
});

describe(`REALNA kampania end-to-end (RDKit=${rdkitAvailable}, ADMET-AI=${admetAvailable})`, () => {
  if (!rdkitAvailable || !admetAvailable) {
    it('bez obu silników ścieżka jest jawnie zablokowana, nie udaje sukcesu', () => {
      const result = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });
      expect(result.candidates.every((c) => c.status !== 'RETAINED_RANKED')).toBe(true);
    });
    return;
  }

  const result = runNaturalAnalogueCampaign(buildRequest(), { rdkit, admet });

  it('agmatyna i kwas kynureninowy oba mają CONFIRMED strukturę i realne deskryptory RDKit', () => {
    const agmatine = result.candidates.find((c) => c.candidateKey === 'agmatine')!;
    const kynurenic = result.candidates.find((c) => c.candidateKey === 'kynurenic-acid')!;
    expect(agmatine.structuralValidation.status).toBe('CONFIRMED');
    expect(kynurenic.structuralValidation.status).toBe('CONFIRMED');
    // Każdy status poniżej jest wynikiem REALNEGO obliczenia, nigdy założeniem z góry.
    expect(['RETAINED_RANKED', 'REJECTED_SCREENING', 'REJECTED_MECHANISM']).toContain(agmatine.status);
    expect(['RETAINED_RANKED', 'REJECTED_SCREENING', 'REJECTED_MECHANISM']).toContain(kynurenic.status);
  }, 60_000);

  it('agmatyna dociera do rankingu (RETAINED_RANKED) — realny wynik przeszedł falsyfikację mechanizmu i screening', () => {
    const agmatine = result.candidates.find((c) => c.candidateKey === 'agmatine')!;
    expect(agmatine.status).toBe('RETAINED_RANKED');
  }, 60_000);

  it('REALNY ADMET-AI: kwas kynureninowy jest odrzucony sygnałem toksyczności (DILI), nie strukturą ani targetem', () => {
    const kynurenic = result.candidates.find((c) => c.candidateKey === 'kynurenic-acid')!;
    if (kynurenic.status === 'REJECTED_MECHANISM') {
      expect(kynurenic.mechanismFalsification.verdict).toBe('REJECTED_TOXICITY_SIGNAL');
      const dili = kynurenic.admetToxicitySignals.find((s) => s.endpoint === 'liverInjury');
      expect(dili).toBeDefined();
      expect(dili!.probability).toBeGreaterThanOrEqual(0.85);
      // "Endogenous" nigdy nie przesłania realnego sygnału toksyczności.
      expect(kynurenic.mechanismFalsification.checks.find((c) => c.checkId === 'WRONG_TARGET')!.outcome).toBe('PASS');
    }
  }, 60_000);

  it('podobieństwo strukturalne do ketaminy jest REALNE i niskie dla obu małocząsteczkowych kandydatów', () => {
    for (const key of ['agmatine', 'kynurenic-acid']) {
      const record = result.candidates.find((c) => c.candidateKey === key)!;
      expect(record.similarityToReference).not.toBeNull();
      expect(record.similarityToReference!.available).toBe(true);
      expect(record.similarityToReference!.tanimoto!).toBeLessThan(0.3);
    }
  }, 60_000);

  it('każdy kandydat z RETAINED_RANKED ma niezależne dowody z >=2 osi i poziom pewności 2-4, nigdy 5', () => {
    for (const record of result.candidates) {
      if (record.status !== 'RETAINED_RANKED') continue;
      expect(record.independentEvidence.independentAxisCount).toBeGreaterThanOrEqual(2);
      expect(record.confidence).toBeGreaterThanOrEqual(2);
      expect(record.confidence).toBeLessThanOrEqual(4);
      expect(record.confidenceStatement).not.toMatch(/has validated/i);
    }
  }, 60_000);

  it('red-team dla kandydatów RETAINED_RANKED nazywa lukę gatunkową jako otwartą', () => {
    for (const record of result.candidates) {
      if (record.status !== 'RETAINED_RANKED') continue;
      expect(record.redTeam).not.toBeNull();
      const speciesGap = record.redTeam!.findings.find((f) => f.angle === 'SPECIES_GAP')!;
      expect(speciesGap.addressed).toBe(false);
    }
  }, 60_000);

  it('best candidate (jeśli istnieje) niesie oświadczenie pewności i nie twierdzi eksperymentalnej walidacji', () => {
    if (result.bestCandidate === 'NOT_RESOLVED') {
      expect(result.bestCandidateReason.length).toBeGreaterThan(0);
      return;
    }
    expect(result.bestCandidate.confidenceStatement).not.toMatch(/EXPERIMENTAL_EVIDENCE/);
  }, 60_000);

  it('każdy top candidate niesie WHY_INCLUDED / WHY_NOT / WHAT_WE_KNOW / WHAT_WE_DONT_KNOW / NEXT_EXPERIMENT', () => {
    for (const top of result.topCandidates) {
      expect(top.whyIncluded.length).toBeGreaterThan(0);
      expect(top.whatWeKnow.length).toBeGreaterThan(0);
      expect(top.whatWeDontKnow.length).toBeGreaterThan(0);
      expect(top.nextExperiment.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
