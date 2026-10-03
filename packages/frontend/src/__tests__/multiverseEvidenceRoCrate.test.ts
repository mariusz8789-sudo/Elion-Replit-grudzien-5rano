import { describe, expect, it } from 'vitest';
import { buildMultiverseBranchEvidencePack } from '../core/experimentFabric/multiverseEvidence';
import { buildSavedScenarioCounterfactual, runScenarioCounterfactual } from '../core/simulation/scenarioCounterfactual';
import { buildCounterfactualEvidencePack } from '../core/experimentFabric/counterfactualEvidence';
import {
  exportEvidencePackRoCrate,
  serializeEvidencePackRoCrate,
  verifyEvidencePackRoCrateRoundTrip,
} from '../core/experimentFabric/evidencePackRoCrate';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../core/simulation/preparednessQuestions';
import { runTemporalMultiverse, type TemporalMultiverseSpec } from '../core/simulation/temporalMultiverse';

/**
 * RO-CRATE AUDYT + ROUND-TRIP DLA GAŁĘZI MULTIVERSE.
 *
 * Poprzedni handoff jawnie zgłaszał RO-Crate jako nieaudytowany gap: paczka
 * dowodowa z gałęzi multiverse nie niosła branchId/decyzji/rozjazdu/werdyktu
 * replay. Te testy pilnują trzech rzeczy: że teraz niesie (FAZA 1/5), że
 * eksport → serializacja → ponowny odczyt odtwarza to identycznie zamiast po
 * cichu gubić (FAZA 2), i że stara, jednoramienna paczka kontrfaktyczna nie
 * zmieniła znaczenia — kontekst multiverse jest opcjonalny, nie domyślny.
 */

const QUESTION = GOVERNED_PREPAREDNESS_QUESTIONS[0]!; // prep:isolation-timing
const PREPAREDNESS = { questionId: QUESTION.questionId, askedText: QUESTION.question, resolutionFingerprint: 'fp-rocrate' };

const SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'ISOLATION',
  days: 18,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
  branches: [{ branchId: 'B-opoznione', scenarioId: 'ISOLATION', interventionStartDay: 20 }],
  preparedness: PREPAREDNESS,
};

describe('FAZA 1 — audyt: paczka z gałęzi multiverse niesie branch/decyzję/rozjazd/replay', () => {
  it('multiverseBranchContext ma branchId, deklarowaną decyzję, zmierzony rozjazd i werdykt replay', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const result = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione');
    const context = result.pack!.multiverseBranchContext!;

    expect(context.sourceMultiverseFingerprint).toBe(multiverse.multiverseFingerprint);
    expect(context.branchId).toBe('B-opoznione');
    expect(context.declaredInterventionStartDay).toBe(20);
    expect(context.firstDivergentDayFromBaseline).not.toBeNull();
    expect(context.branchState!.logicalDay).toBe(context.firstDivergentDayFromBaseline);
    expect(context.replayVerdict).toBe('MATCH');
  });

  it('RO-Crate eksportuje ten kontekst pod genesis:multiverseBranch', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const pack = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione').pack!;
    const crate = exportEvidencePackRoCrate(pack);
    const packNode = crate['@graph'].find((n) => (n['@id'] as string).startsWith('#evidence-pack/'))!;

    expect(packNode['genesis:multiverseBranch']).toEqual(pack.multiverseBranchContext);
  });

  it('zwykła paczka kontrfaktyczna (bez multiverse) NIE dostaje tego pola — stara semantyka nietknięta', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual({
      baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
      days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
      baselineInterventionStartDay: 0, variantInterventionStartDay: 8,
    }), PREPAREDNESS);
    const pack = buildCounterfactualEvidencePack(saved).pack!;

    expect(pack.multiverseBranchContext).toBeUndefined();
    expect(exportEvidencePackRoCrate(pack)['@graph'].some((n) => 'genesis:multiverseBranch' in n)).toBe(false);
  });
});

describe('FAZA 2 — RO-Crate round-trip', () => {
  it('paczka z gałęzi multiverse: eksport → reload → identyczność jest MATCH', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const pack = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione').pack!;
    const roundTrip = verifyEvidencePackRoCrateRoundTrip(pack);

    expect(roundTrip.status).toBe('MATCH');
    expect(roundTrip.missing).toEqual([]);
  });

  it('zwykła paczka kontrfaktyczna też odtwarza się jako MATCH (bez kontekstu multiverse)', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual({
      baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
      days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
      baselineInterventionStartDay: 0, variantInterventionStartDay: 8,
    }), PREPAREDNESS);
    const pack = buildCounterfactualEvidencePack(saved).pack!;

    expect(verifyEvidencePackRoCrateRoundTrip(pack).status).toBe('MATCH');
  });

  it('niesparsowalny odczyt (np. ucięty plik) jest BLOCKED, nie zgadniętym dopasowaniem', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const pack = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione').pack!;
    const truncated = serializeEvidencePackRoCrate(pack).slice(0, 40); // symulacja urwanego zapisu

    const roundTrip = verifyEvidencePackRoCrateRoundTrip(pack, truncated);
    expect(roundTrip.status).toBe('BLOCKED');
    expect(roundTrip.reason).toMatch(/JSON/);
  });

  it('odczyt bez kontekstu gałęzi multiverse (realnie okrojony zapis) jest BLOCKED', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const pack = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione').pack!;
    const json = serializeEvidencePackRoCrate(pack);
    // Symulacja realnego magazynu, który zgubił jedną właściwość węzła przy
    // zapisie — nie edytujemy funkcji eksportu, tylko to, co "wróciło z dysku".
    const corrupted = JSON.stringify(exportEvidencePackRoCrate(pack), (key, value) => (key === 'genesis:multiverseBranch' ? undefined : value));

    expect(verifyEvidencePackRoCrateRoundTrip(pack, json).status).toBe('MATCH'); // kontrolne: nieuszkodzony zapis nadal MATCH
    const roundTrip = verifyEvidencePackRoCrateRoundTrip(pack, corrupted);
    expect(roundTrip.status).toBe('BLOCKED');
    expect(roundTrip.missing.some((entry) => entry.includes('multiverseBranchContext'))).toBe(true);
  });

  it('odczyt z podmienionym fingerprintem runu (uszkodzenie w locie) jest BLOCKED', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const pack = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione').pack!;
    // Podmiana WSZYSTKICH wystąpień: ten sam fingerprint pojawia się też w
    // `@id` powiązanych węzłów (input/activity dzielą tożsamość runu), a
    // `.replace` zamieniłby tylko pierwsze i ominął dokładnie sprawdzane pole.
    const corrupted = serializeEvidencePackRoCrate(pack).replaceAll(pack.runs[0]!.provenance.runFingerprint, 'deadbeef');

    const roundTrip = verifyEvidencePackRoCrateRoundTrip(pack, corrupted);
    expect(roundTrip.status).toBe('BLOCKED');
    expect(roundTrip.missing.some((entry) => entry.includes('runFingerprint'))).toBe(true);
  });
});

describe('FAZA 4 — integralność prerejestracji na multiverse', () => {
  it('to samo pytanie z innym brzmieniem daje inną tożsamość multiverse', () => {
    const withCanonicalText = runTemporalMultiverse(SPEC);
    const withDifferentText = runTemporalMultiverse({
      ...SPEC,
      preparedness: { ...PREPAREDNESS, askedText: 'Zupełnie inaczej sformułowane pytanie o to samo.' },
    });

    expect(withDifferentText.multiverseFingerprint).not.toBe(withCanonicalText.multiverseFingerprint);
  });

  it('ta sama prerejestracja i to samo wykonanie dają identyczny odcisk (MATCH tożsamości)', () => {
    const first = runTemporalMultiverse(SPEC);
    const second = runTemporalMultiverse(SPEC);

    expect(second.multiverseFingerprint).toBe(first.multiverseFingerprint);
  });
});

describe('FAZA 10 — niemutowalność', () => {
  it('budowanie Evidence Pack i eksport RO-Crate nie mutują źródłowego multiverse ani paczki', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const multiverseSnapshot = JSON.parse(JSON.stringify(multiverse));
    const pack = buildMultiverseBranchEvidencePack(multiverse, 'B-opoznione').pack!;
    const packSnapshot = JSON.parse(JSON.stringify(pack));

    exportEvidencePackRoCrate(pack);
    verifyEvidencePackRoCrateRoundTrip(pack);

    expect(JSON.parse(JSON.stringify(multiverse))).toEqual(multiverseSnapshot);
    expect(JSON.parse(JSON.stringify(pack))).toEqual(packSnapshot);
  });
});
