import { describe, expect, it } from 'vitest';
import { buildAutomotiveAuditResult } from '../core/automotive/auditResult';
import { buildDemoAutomotiveAssessment } from '../core/automotive/demoFixture';
import { buildAutomotiveEvidencePack } from '../core/automotive/evidence';
import { buildAutomotiveExperimentGraph, proposeNextAutomotiveDataRequests } from '../core/automotive/nextStep';
import { buildSavedAutomotiveAssessment, replaySavedAutomotiveAssessment } from '../core/automotive/replay';
import { verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';

/**
 * P — FULL END-TO-END AUTOMOTIVE AUDIT FIXTURE (§17/§18-P).
 *
 * One coherent TEST_FIXTURE vehicle, three photos, three findings (one
 * CONFIRMED, one POSSIBLE, one REQUIRES_INSPECTION hidden-damage flag), a
 * vehicle configuration with a performance package, an insurer estimate
 * with a wrong-variant bumper line and a missing grille line, run through
 * the WHOLE pipeline: cost calculation -> gap analysis -> Evidence Pack ->
 * RO-Crate round trip -> save/replay -> next-data-request scan.
 */

describe('Pełny audyt end-to-end na jednej spójnej fixture', () => {
  const assessment = buildDemoAutomotiveAssessment();
  const result = buildAutomotiveAuditResult(assessment);

  it('kwota referencyjna jest NOT_AVAILABLE tak długo, jak jedna linia (wspornik radaru) nie jest wyceniona — fail-closed na całym estymacie', () => {
    expect(result.referenceTotal.status).toBe('NOT_AVAILABLE');
    expect(result.costStatus).toBe('REQUIRES_INSPECTION');
  });

  it('porównanie linia-po-linii wykrywa brakujące pozycje, niezgodność konfiguracji i niewycenione znalezisko', () => {
    const categories = result.gaps.map((g) => g.category);
    expect(categories).toContain('MISSING_ITEM'); // grille, i wariant bumpera bez dopasowania
    expect(categories).toContain('VEHICLE_CONFIGURATION_MISMATCH'); // standardowy zderzak vs pakiet PRESENT
    expect(categories).toContain('REQUIRES_INSPECTION'); // wspornik radaru, hidden damage
  });

  it('werdykt ogólny to POTENTIAL_UNDERESTIMATION — realny, oparty na dowodach wniosek', () => {
    expect(result.overall).toBe('POTENTIAL_UNDERESTIMATION');
  });

  it('linia bez rozjazdu (reflektor) nie generuje żadnego gapu', () => {
    expect(result.gaps.some((g) => g.relatedPartId === 'headlamp-left')).toBe(false);
  });

  it('Evidence Pack -> RO-Crate -> reload -> verify daje MATCH', () => {
    const pack = buildAutomotiveEvidencePack(result);
    const roundTrip = verifyEvidencePackRoCrateRoundTrip(pack);
    expect(roundTrip.status).toBe('MATCH');
    expect(pack.hypothesisAssessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('save -> reload -> replay daje MATCH; zmieniony input daje DRIFT', () => {
    const saved = buildSavedAutomotiveAssessment(assessment);
    expect(replaySavedAutomotiveAssessment(saved).status).toBe('MATCH');

    const tampered = {
      ...saved,
      assessment: {
        ...saved.assessment,
        referenceLineItems: saved.assessment.referenceLineItems.map((item) =>
          (item.lineItemId === 'ref-headlamp' ? { ...item, unitPrice: { status: 'TEST_FIXTURE' as const, value: 999 } } : item)),
      },
    };
    expect(replaySavedAutomotiveAssessment(tampered).status).toBe('DRIFT');
  });

  it('graf eksperymentu (ISTNIEJĄCY buildExperimentGraph) zawiera pytanie, hipotezę, eksperyment i dowód', () => {
    const graph = buildAutomotiveExperimentGraph(result);
    const kinds = graph.nodes.map((n) => n.kind);
    expect(kinds).toContain('QUESTION');
    expect(kinds).toContain('HYPOTHESIS');
    expect(kinds).toContain('EXPERIMENT');
    expect(kinds).toContain('EVIDENCE');
  });

  it('skan następnych potrzebnych danych nazywa konkretne brakujące zewnętrzne źródła', () => {
    const requests = proposeNextAutomotiveDataRequests(result);
    const targets = requests.map((r) => r.target);
    // Żaden dostawca OEM/aftermarket nie istnieje w tej fixture -> brakujące numery części.
    expect(targets).toContain('OEM_CATALOG');
    expect(targets).toContain('AFTERMARKET_CATALOG');
    // Znaleziska POSSIBLE/REQUIRES_INSPECTION potrzebują realnej inspekcji wizyjnej.
    expect(targets).toContain('VISION_PROVIDER');
    // Wspornik radaru jest niewyceniony -> referencyjna kwota wymaga źródła cen.
    expect(targets).toContain('PRICING_PROVIDER');
    expect(requests.every((r) => r.kind === 'NEXT_DATA_REQUEST')).toBe(true);
  });

  it('te same wejścia dwukrotnie dają identyczny wynik (determinizm całego pionu)', () => {
    const first = buildAutomotiveAuditResult(buildDemoAutomotiveAssessment());
    const second = buildAutomotiveAuditResult(buildDemoAutomotiveAssessment());
    expect(second).toEqual(first);
  });

  it('budowanie audytu nie mutuje wejściowego assessment', () => {
    const fresh = buildDemoAutomotiveAssessment();
    const snapshot = JSON.parse(JSON.stringify(fresh));
    buildAutomotiveAuditResult(fresh);
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(snapshot);
  });
});

describe('Wynik "NOT ENOUGH EVIDENCE TO DETERMINE" jest poprawnym, kompletnym wynikiem', () => {
  it('brak insurerEstimate i brak referenceTotal daje NOT_ENOUGH_EVIDENCE_TO_DETERMINE', () => {
    const assessment = buildDemoAutomotiveAssessment();
    const result = buildAutomotiveAuditResult({ ...assessment, insurerEstimate: null });
    expect(result.overall).toBe('NOT_ENOUGH_EVIDENCE_TO_DETERMINE');
  });
});
