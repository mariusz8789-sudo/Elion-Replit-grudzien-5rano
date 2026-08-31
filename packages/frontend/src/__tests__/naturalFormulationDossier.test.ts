import { describe, expect, it } from 'vitest';
import {
  buildNaturalFormulationDossier,
  FORMULATION_DOSSIER_CONTRACT_VERSION,
  FORMULATION_EXCLUSIONS,
} from '../core/naturalFormulationDossier';
import { buildPinnedChEMBLCaffeineDiscovery } from '../core/biotechData/chembl';
import { buildPinnedChEMBLAdenosineDiscovery } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLTheophyllineDiscovery } from '../core/biotechData/theophylline';
import type { CandidateDiscoveryReport } from '../core/biotechDiscoveryContract';

/**
 * DOSSIER HIPOTEZY KOMPOZYCJI NATURALNEJ.
 *
 * Ranking mówił, która para jest wyżej. Dossier ma powiedzieć naukowcowi to,
 * co pozwala coś z tym zrobić: skąd składnik, dlaczego akurat on, co wnosi
 * sam, co jest policzone, czego brakuje i jaki eksperyment to rozstrzygnie.
 *
 * Testy pilnują przede wszystkim granicy: dossier ma jawnie przyznawać się do
 * braków zamiast je dopowiadać, i strukturalnie nie mieć gdzie zapisać
 * proporcji, dawki ani procedury wytwarzania.
 */

const reports = (): CandidateDiscoveryReport[] => [
  buildPinnedChEMBLCaffeineDiscovery().report,
  buildPinnedChEMBLAdenosineDiscovery().report,
  buildPinnedChEMBLTheophyllineDiscovery().report,
];

const REQUESTED = ['CHEMBL251'];

describe('Struktura dossier', () => {
  it('doprowadza od raportów do TOP 3 hipotez kompozycji, a nie kończy na rankingu', () => {
    const dossier = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED, referenceLabel: 'kofeina' });

    expect(dossier.contractVersion).toBe(FORMULATION_DOSSIER_CONTRACT_VERSION);
    expect(dossier.hypotheses).toHaveLength(3);
    expect(dossier.hypotheses.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    for (const hypothesis of dossier.hypotheses) {
      expect(hypothesis.components).toHaveLength(2);
      expect(hypothesis.status).toBe('NATURAL_COMPOSITION_HYPOTHESIS');
      expect(hypothesis.clinicalClaim).toBe('NONE_VALIDATION_REQUIRED');
    }
  });

  it('każda kompozycja niesie komplet dziesięciu wymaganych pól', () => {
    const hypothesis = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED }).hypotheses[0]!;

    for (const component of hypothesis.components) {
      expect(component.candidateId).toBeTruthy();                       // 1 COMPONENTS
      expect(component.sourceStatus).toBeTruthy();                      // 2 SOURCE
      expect(component.sources.length).toBeGreaterThan(0);
      expect(component.whyIncluded.length).toBeGreaterThan(0);          // 3 WHY
      expect(component.contributedTargetIds).toBeDefined();             // 4 TARGET/MECHANISM
      expect(component.contributedMechanismIds).toBeDefined();
      expect(component.propertyStatus).toBeTruthy();                    // 5 PROPERTY
      expect(component.evidenceStatus).toBeTruthy();                    // 6 EVIDENCE
      expect(component.computeStatus).toBeTruthy();                     // 7 COMPUTE
      expect(component.uncertainty).toBeTruthy();                       // 8 UNCERTAINTY
      expect(component.missingEvidence).toBeDefined();                  // 9 MISSING EVIDENCE
    }
    expect(hypothesis.validationExperiments.length).toBeGreaterThan(0); // 10 VALIDATION
    expect(hypothesis.why.length).toBeGreaterThan(0);
  });

  it('SOURCE to realna prowieniencja rekordu, nie słowo „literatura"', () => {
    const component = buildNaturalFormulationDossier({ reports: reports() }).hypotheses[0]!.components[0]!;

    for (const source of component.sources) {
      expect(source.source).toBeTruthy();
      expect(source.sourceId).toBeTruthy();
      expect(source.evidenceType).toBeTruthy();
      expect(source.status).toBeTruthy();
    }
  });

  it('WHY nazywa target, który dany składnik wnosi jako jedyny — albo mówi, że żadnego', () => {
    const hypothesis = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED }).hypotheses[0]!;
    const joined = hypothesis.components.flatMap((component) => component.whyIncluded).join(' ');

    expect(joined).toMatch(/jedyny w tej kompozycji pokrywa|Nie wnosi żadnego targetu/);
    expect(hypothesis.why.join(' ')).toMatch(/komplementarne|nie są komplementarne/i);
  });
});

describe('Uczciwość braków', () => {
  it('brak profilu własności jest MISSING_DATA, a nie zmyśloną wartością', () => {
    const dossier = buildNaturalFormulationDossier({ reports: reports() });
    const withoutProfile = dossier.hypotheses.flatMap((entry) => entry.components).filter((component) => component.propertyStatus !== 'PRESENT');

    for (const component of withoutProfile) {
      expect(component.propertyMetrics).toEqual([]);
      expect(component.propertyUncertainty).toMatch(/brak/i);
    }
  });

  it('składnik bez evidence jest nazwany najsłabszym ogniwem, a nie pominięty', () => {
    const base = reports();
    const stripped: CandidateDiscoveryReport[] = [{ ...base[0]!, evidenceIds: [] }, base[1]!, base[2]!];
    const dossier = buildNaturalFormulationDossier({ reports: stripped });
    const component = dossier.hypotheses
      .flatMap((entry) => entry.components)
      .find((entry) => entry.candidateId === base[0]!.candidateId);

    expect(component).toBeDefined();
    expect(component!.evidenceStatus).toBe('MISSING_DATA');
    expect(component!.whyIncluded.join(' ')).toMatch(/najsłabsze ogniwo/i);
    expect(dossier.unfilledFields.join(' ')).toMatch(/EVIDENCE/);
  });

  it('niepokryty żądany target staje się osobnym eksperymentem walidacyjnym', () => {
    const dossier = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: ['target-ktorego-nikt-nie-pokrywa'] });
    const uncovered = dossier.hypotheses[0]!.validationExperiments.filter((entry) => entry.scope === 'UNCOVERED_TARGET');

    expect(uncovered.length).toBeGreaterThan(0);
    expect(uncovered[0]!.question).toContain('target-ktorego-nikt-nie-pokrywa');
    expect(dossier.unfilledFields.join(' ')).toMatch(/TARGET COVERAGE/);
  });

  it('wymienia niewypełnione pola wprost, zamiast pokazywać komplet', () => {
    const dossier = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED });

    expect(dossier.unfilledFields.length).toBeGreaterThan(0);
    for (const field of dossier.unfilledFields) expect(field).toMatch(/—/);
  });
});

describe('Granica: hipoteza badawcza, nie receptura', () => {
  it('struktura wyniku nie ma gdzie zapisać proporcji, dawki ani procedury wytwarzania', () => {
    const serialized = JSON.stringify(buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED }));
    const keys = new Set<string>();
    JSON.parse(serialized, function collect(this: unknown, key: string, value: unknown) { if (key) keys.add(key.toLowerCase()); return value; });

    for (const forbidden of ['dose', 'dosage', 'dawka', 'ratio', 'proporcja', 'amount', 'mg', 'synthesis', 'synteza', 'route', 'administration', 'recipe', 'receptura', 'formulationratio']) {
      expect([...keys]).not.toContain(forbidden);
    }
  });

  it('deklaruje wprost, czego nie zawiera', () => {
    const dossier = buildNaturalFormulationDossier({ reports: reports() });

    expect(dossier.exclusions).toEqual([...FORMULATION_EXCLUSIONS]);
    expect(dossier.exclusions.join(' ')).toMatch(/nie recepturą/i);
    expect(dossier.exclusions.join(' ')).toMatch(/równoważności klinicznej/i);
  });

  it('żadna hipoteza nie twierdzi skuteczności ani równoważności', () => {
    const dossier = buildNaturalFormulationDossier({ reports: reports() });
    const text = JSON.stringify(dossier).toLowerCase();

    expect(text).not.toContain('naturalny xanax');
    expect(text).not.toContain('naturalna ketamina');
    expect(text).not.toContain('zastępuje lek');
    for (const hypothesis of dossier.hypotheses) {
      expect(hypothesis.clinicalClaim).toBe('NONE_VALIDATION_REQUIRED');
      expect(hypothesis.uncertainty).toBeTruthy();
    }
  });

  it('każdy eksperyment walidacyjny jest typowanym żądaniem albo jawną blokadą', () => {
    for (const experiment of buildNaturalFormulationDossier({ reports: reports() }).hypotheses[0]!.validationExperiments) {
      expect(experiment.question).toBeTruthy();
      if (experiment.request) {
        expect(experiment.request.status).toBe('BLOCKED');
        expect(experiment.request.requestId).toMatch(/^request:/);
        expect(experiment.request.constraints.noClinicalInference).toBe(true);
      } else {
        expect(experiment.blockedReason).toBeTruthy();
      }
    }
  });
});

describe('Determinizm', () => {
  it('ten sam wsad daje ten sam odcisk dossier, inne żądane targety inny', () => {
    const a = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED });
    const b = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: REQUESTED });
    const c = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: ['inny-target'] });

    expect(b.dossierFingerprint).toBe(a.dossierFingerprint);
    expect(c.dossierFingerprint).not.toBe(a.dossierFingerprint);
  });

  it('poniżej dwóch raportów nie ma kompozycji i dossier tego nie ukrywa', () => {
    const dossier = buildNaturalFormulationDossier({ reports: [reports()[0]!] });

    expect(dossier.hypotheses).toEqual([]);
    expect(dossier.unfilledFields).toEqual([]);
  });
});
