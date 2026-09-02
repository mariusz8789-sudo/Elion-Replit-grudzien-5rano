import { describe, expect, it } from 'vitest';
import { RDKIT_STRUCTURAL_PROPERTY_IDS } from '../core/discovery/molecular/chemistry';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import {
  describeSmilesBatch,
  rdkitStructuralEngine,
  rdkitStructuralProperties,
  rdkitStructure,
} from '../core/discovery/molecular/rdkitStructuralProvider';
import { unavailableRdkitTransport, type RdkitTransport } from '../core/discovery/molecular/rdkitTransport';

/**
 * ETAP 1 — REAL RDKit BRIDGE.
 *
 * The available-branch tests drive the repository's ACTUAL RDKit worker
 * (`packages/backend/src/compute/rdkit_worker.py`). RDKit is an optional
 * runtime dependency, so where it is absent — including CI — the blocked branch
 * is asserted instead. A skipped real-engine check never counts as validation.
 */
const transport = createNodeRdkitTransport();
const detected = transport.detect();
const rdkitAvailable = detected.available;

/** Known reference molecule: aspirin. Values below are RDKit's, not invented. */
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';

describe('transport bez silnika nigdy nie udaje wyniku', () => {
  it('brak transportu → BLOCKED_BY_RUNTIME i żadnej wartości', () => {
    const result = unavailableRdkitTransport.describe(ASPIRIN);

    expect(result.ok).toBe(false);
    const properties = rdkitStructuralProperties(result);
    expect(properties).toHaveLength(RDKIT_STRUCTURAL_PROPERTY_IDS.length);
    expect(properties.every((p) => p.value === null)).toBe(true);
    expect(properties.every((p) => p.status === 'REQUIRES_EXTERNAL_ENGINE')).toBe(true);
    expect(rdkitStructure(result).canonicalSmiles).toBeNull();
  });

  it('batch bez silnika oznacza KAŻDE wejście jako zablokowane, nie pomija ich', () => {
    const batch = describeSmilesBatch(unavailableRdkitTransport, [ASPIRIN, 'c1ccccc1']);

    expect(batch.detected.available).toBe(false);
    expect(batch.callCount).toBe(0);
    expect(Object.keys(batch.bySmiles).sort()).toEqual([ASPIRIN, 'c1ccccc1'].sort());
    expect(Object.values(batch.bySmiles).every((r) => r.ok === false)).toBe(true);
  });

  it('budżet wywołań jest twardy, a pominięte wejścia są raportowane', () => {
    const fake: RdkitTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      describe: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transformations: () => ({ ok: true, transformations: [] }),
    };
    const batch = describeSmilesBatch(fake, ['a', 'b', 'c', 'd'], { maxCalls: 2 });

    expect(batch.callCount).toBe(2);
    expect(batch.skipped).toHaveLength(2);
    // Pominięte NIE dostają zmyślonego wyniku ani cichego sukcesu.
    expect(Object.keys(batch.bySmiles)).toHaveLength(2);
  });
});

describe(`RDKit real bridge (available=${rdkitAvailable})`, () => {
  if (rdkitAvailable) {
    it('realny RDKit zwraca policzone deskryptory dla aspiryny', () => {
      const result = transport.describe(ASPIRIN);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.molecularFormula).toBe('C9H8O4');
      expect(result.engine).toMatch(/^RDKit /);

      const properties = rdkitStructuralProperties(result);
      const byId = Object.fromEntries(properties.map((p) => [p.propertyId, p]));

      // Realne wartości RDKit — nie wpisane ręcznie, tylko sprawdzone co do rzędu.
      expect(byId.logP!.status).toBe('COMPUTED');
      expect(byId.logP!.value).toBeCloseTo(1.31, 1);
      expect(byId.tpsa!.status).toBe('COMPUTED');
      expect(byId.tpsa!.value).toBeCloseTo(63.6, 1);
      expect(byId.hbd!.value).toBe(1);
      expect(byId.hba!.value).toBe(3);
      expect(byId.aromaticRings!.value).toBe(1);
      expect(byId.formalCharge!.value).toBe(0);

      // Każda policzona właściwość niesie realny silnik, nie null.
      for (const property of properties) {
        if (property.status === 'COMPUTED') expect(property.engine).toMatch(/^RDKit /);
      }
    });

    it('struktura pochodzi z kanonizacji RDKit, nie ze zgadywania', () => {
      const structure = rdkitStructure(transport.describe(ASPIRIN));
      expect(structure.status).toBe('ACTUAL_SOURCE');
      expect(structure.canonicalSmiles).toBeTruthy();
      // Kanoniczny SMILES aspiryny wg RDKit — stabilny dla danej wersji.
      expect(structure.canonicalSmiles).toContain('c1ccccc1');
    });

    it('nieprawidłowy SMILES jest odrzucony jako NOT_AVAILABLE, nigdy jako wynik', () => {
      const result = transport.describe('this-is-not-a-molecule');
      expect(result.ok).toBe(false);

      const properties = rdkitStructuralProperties(result);
      expect(properties.every((p) => p.value === null)).toBe(true);
      // Silnik BYŁ dostępny i odmówił — to inny stan niż brak silnika.
      expect(properties.every((p) => p.status === 'NOT_AVAILABLE')).toBe(true);
    });

    it('silnik strukturalny mapuje wzór → SMILES tylko z jawnego przypisania', () => {
      const batch = describeSmilesBatch(transport, [ASPIRIN]);
      const engine = rdkitStructuralEngine(batch, { C9H8O4: ASPIRIN });

      expect(engine.engineId).toMatch(/^rdkit:/);
      const resolved = engine.propertiesFor('C9H8O4');
      expect(resolved.find((p) => p.propertyId === 'logP')!.status).toBe('COMPUTED');

      // Wzór bez przypisanego SMILES pozostaje niedostępny — moduł nie wybiera
      // struktury dla wzoru, bo wiele struktur ma ten sam wzór sumaryczny.
      const unassigned = engine.propertiesFor('C6H6');
      expect(unassigned.every((p) => p.status === 'REQUIRES_EXTERNAL_ENGINE')).toBe(true);
      expect(engine.structureFor('C6H6').canonicalSmiles).toBeNull();
    });
  } else {
    it('bez RDKit most jest jawnie zablokowany — nie liczy się jako walidacja', () => {
      expect(detected.available).toBe(false);
      if (detected.available) return;
      expect(detected.reason.length).toBeGreaterThan(0);

      const result = transport.describe(ASPIRIN);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('BLOCKED_BY_RUNTIME');
    });
  }
});
