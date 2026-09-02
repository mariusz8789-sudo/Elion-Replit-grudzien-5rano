import { describe, expect, it } from 'vitest';
import {
  ADMET_PROPERTY_IDS,
  ADMET_PROPERTY_MAP,
  admetLimitations,
  admetPropertiesFor,
  runAdmetBatch,
  withAdmetProperties,
} from '../core/discovery/molecular/admetProvider';
import {
  admetApplicability,
  readAdmetPayload,
  unavailableAdmetTransport,
  type AdmetTransport,
} from '../core/discovery/molecular/admetTransport';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { evidenceGradeFor } from '../core/discovery/molecular/dossier';
import type { MoleculeCandidate } from '../core/discovery/molecular/types';

/**
 * REAL ADMET-AI. The available branch drives the repository's actual
 * `admet_worker.py` (ADMET-AI / Chemprop, Swanson et al. 2024, TDC benchmark).
 *
 * The property under test everywhere: an ADMET value is a PREDICTION. It may
 * be screened and ranked, and it may never be read as a measurement or as
 * evidence of safety.
 */
const transport = createNodeAdmetTransport();
const detected = transport.detect();
const admetAvailable = detected.available;

function candidate(id: string, smiles: string | null, heavy: number, mw: number): MoleculeCandidate {
  return {
    candidateId: id,
    formula: 'C9H8O4',
    structure: smiles === null
      ? { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null }
      : { status: 'ACTUAL_SOURCE', canonicalSmiles: smiles, engine: 'RDKit' },
    parentFormula: null,
    transformation: null,
    properties: [
      { propertyId: 'heavyAtomCount', status: 'COMPUTED', value: heavy, unit: 'atoms', engine: 'test' },
      { propertyId: 'molecularWeight', status: 'COMPUTED', value: mw, unit: 'g/mol', engine: 'test' },
      { propertyId: 'safety', status: 'REQUIRES_EXPERIMENT', value: null, unit: '', engine: null },
    ],
    origin: 'SEED',
  };
}

const ASPIRIN = candidate('aspirin', 'CC(=O)Oc1ccccc1C(=O)O', 13, 180.16);

describe('domena stosowalności jest sprawdzana PRZED wywołaniem modelu', () => {
  it('molekuła spoza zakresu drug-like jest odrzucona z powodem', () => {
    expect(admetApplicability(400, 5000).inDomain).toBe(false);
    expect(admetApplicability(2, 30).inDomain).toBe(false);
    expect(admetApplicability(13, 180).inDomain).toBe(true);
  });

  it('bez znanych deskryptorów stosowalność jest NIEUSTALONA, nie domyślnie OK', () => {
    const verdict = admetApplicability(null, null);
    expect(verdict.inDomain).toBe(false);
    expect(verdict.reason).toMatch(/cannot be established/i);
  });

  it('kandydat spoza domeny NIE trafia do modelu i jest raportowany', () => {
    const huge = candidate('huge', 'C'.repeat(10), 400, 5000);
    const batch = runAdmetBatch(unavailableAdmetTransport, [huge]);
    expect(batch.calledWith).toHaveLength(0);
  });

  it('kandydat bez struktury nigdy nie trafia do modelu', () => {
    const fake: AdmetTransport = {
      transportId: 'fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      predict: () => ({ ok: true, bySmiles: {}, engine: 'TEST_FIXTURE' }),
    };
    const batch = runAdmetBatch(fake, [candidate('noStruct', null, 13, 180)]);

    expect(batch.calledWith).toHaveLength(0);
    expect(batch.outOfDomain[0]!.reason).toMatch(/needs a structure, not a formula/i);
  });

  it('budżet wywołań jest twardy, a nadmiar raportowany', () => {
    const fake: AdmetTransport = {
      transportId: 'fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      predict: () => ({ ok: true, bySmiles: {}, engine: 'TEST_FIXTURE' }),
    };
    const many = ['a', 'b', 'c', 'd'].map((id, i) => candidate(id, `C${'C'.repeat(i)}O`, 13, 180));
    const batch = runAdmetBatch(fake, many, { maxCandidates: 2 });

    expect(batch.calledWith).toHaveLength(2);
    expect(batch.outOfDomain.some((o) => o.reason.includes('call budget'))).toBe(true);
  });
});

describe('brak silnika ADMET nigdy nie wygląda jak wynik', () => {
  it('bez transportu wszystkie właściwości są REQUIRES_EXTERNAL_ENGINE', () => {
    const batch = runAdmetBatch(unavailableAdmetTransport, [ASPIRIN]);
    const properties = admetPropertiesFor(ASPIRIN, batch);

    expect(properties).toHaveLength(ADMET_PROPERTY_IDS.length);
    expect(properties.every((p) => p.value === null)).toBe(true);
    expect(properties.every((p) => p.status === 'REQUIRES_EXTERNAL_ENGINE')).toBe(true);
    expect(admetLimitations(batch)[0]).toMatch(/did not run/i);
  });

  it('uszkodzona odpowiedź daje mniej realnych predykcji, nie zmyślone', () => {
    expect(Object.keys(readAdmetPayload({ 'CCO': { AMES: 'not-a-number' } }, 'e'))).toHaveLength(0);
    expect(Object.keys(readAdmetPayload({ 'CCO': { AMES: 0.1 } }, 'e'))).toEqual(['CCO']);
    expect(Object.keys(readAdmetPayload(null, 'e'))).toHaveLength(0);
  });
});

describe(`REALNY ADMET-AI (available=${admetAvailable})`, () => {
  if (!admetAvailable) {
    it('bez ADMET-AI ścieżka jest jawnie zablokowana', () => {
      expect(detected.available).toBe(false);
      if (detected.available) return;
      expect(detected.reason.length).toBeGreaterThan(0);
    });
    return;
  }

  const batch = runAdmetBatch(transport, [ASPIRIN]);
  const properties = admetPropertiesFor(ASPIRIN, batch);
  const byId = Object.fromEntries(properties.map((p) => [p.propertyId, p]));

  it('realny model zwraca predykcje dla aspiryny', () => {
    expect(batch.available).toBe(true);
    expect(batch.result?.ok).toBe(true);
    expect(batch.engineId).toMatch(/^ADMET-AI /);
  }, 900_000);

  it('KAŻDA wartość ADMET jest MODEL_PREDICTION, nigdy COMPUTED', () => {
    const withValues = properties.filter((p) => p.value !== null);
    expect(withValues.length).toBeGreaterThan(5);
    expect(withValues.every((p) => p.status === 'MODEL_PREDICTION')).toBe(true);
    expect(withValues.every((p) => p.status !== 'COMPUTED')).toBe(true);
    expect(withValues.every((p) => (p.engine ?? '').startsWith('ADMET-AI'))).toBe(true);
  });

  it('predykcje klasyfikacyjne są prawdopodobieństwami w [0,1]', () => {
    for (const property of properties) {
      if (property.value === null) continue;
      if (ADMET_PROPERTY_MAP[property.propertyId]!.unit !== 'probability') continue;
      expect(property.value, property.propertyId).toBeGreaterThanOrEqual(0);
      expect(property.value, property.propertyId).toBeLessThanOrEqual(1);
    }
  });

  it('wchłanianie jelitowe aspiryny jest przewidywane jako wysokie', () => {
    // Aspiryna jest dobrze wchłanianym lekiem doustnym — model to odzwierciedla.
    // To sprawdza, że most niesie realne liczby, a nie zera.
    expect(byId.admetAbsorption!.value).toBeGreaterThan(0.5);
  });

  it('w dossier stopień dowodu to PREDICTION, nigdy COMPUTATION', () => {
    const admetProperty = properties.find((p) => p.value !== null)!;
    expect(evidenceGradeFor(admetProperty)).toBe('PREDICTION');
    expect(evidenceGradeFor(admetProperty)).not.toBe('COMPUTATION');
    expect(evidenceGradeFor(admetProperty)).not.toBe('EXPERIMENTALLY_VALIDATED');
  });

  it('BEZPIECZEŃSTWO POZOSTAJE EKSPERYMENTALNE mimo działającego modelu toksyczności', () => {
    const enriched = withAdmetProperties([ASPIRIN], batch)[0]!;
    const safety = enriched.properties.find((p) => p.propertyId === 'safety')!;

    expect(safety.status).toBe('REQUIRES_EXPERIMENT');
    expect(safety.value).toBeNull();
    // I jest to powiedziane wprost w ograniczeniach.
    expect(admetLimitations(batch).join(' ')).toMatch(/does not.*establish|no admet endpoint.*establishes that a compound is safe/i);
  });

  it('ograniczenia mówią wprost, że predykcja to nie pomiar', () => {
    expect(admetLimitations(batch).join(' ')).toMatch(/not measurements/i);
    expect(admetLimitations(batch).join(' ')).toMatch(/low predicted probability is not evidence that an effect is absent/i);
  });

  it('powtórne wywołanie jest obsłużone z cache i daje te same wartości', () => {
    const again = runAdmetBatch(transport, [ASPIRIN]);
    const againProperties = admetPropertiesFor(ASPIRIN, again);
    expect(againProperties.map((p) => p.value)).toEqual(properties.map((p) => p.value));
  }, 900_000);
});
