import { describe, expect, it } from 'vitest';
import {
  dockingLimitations,
  dockingPropertiesFor,
  runDockingBatch,
  withDockingProperties,
} from '../core/discovery/molecular/dockingProvider';
import {
  isTargetAffinityMeaningful,
  unavailableDockingTransport,
  type ReceptorSpec,
} from '../core/discovery/molecular/dockingTransport';
import { createNodeDockingTransport } from '../core/discovery/molecular/dockingTransport.node';
import { evidenceGradeFor } from '../core/discovery/molecular/dossier';
import type { MoleculeCandidate } from '../core/discovery/molecular/types';

/**
 * REAL AutoDock Vina. The available branch drives the repository's actual
 * `dock_worker.py` (Vina + Meeko).
 *
 * The property under test: a docking score is a statement about a TARGET only
 * when it was computed against a real 3D receptor.
 */
const transport = createNodeDockingTransport();
const detected = transport.detect();
const dockingAvailable = detected.available;

function candidate(id: string, smiles: string | null): MoleculeCandidate {
  return {
    candidateId: id,
    formula: 'C9H8O4',
    structure: smiles === null
      ? { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null }
      : { status: 'ACTUAL_SOURCE', canonicalSmiles: smiles, engine: 'RDKit' },
    parentFormula: null,
    transformation: null,
    properties: [],
    origin: 'SEED',
  };
}

const ASPIRIN = candidate('aspirin', 'CC(=O)Oc1ccccc1C(=O)O');

const STANDIN: ReceptorSpec = {
  kind: 'SMALL_MOLECULE_STANDIN',
  smiles: 'c1ccc2c(c1)cccc2',
  provenance: 'Pipeline stand-in; not a biological receptor.',
};

describe('reguła sensowności powinowactwa jest osobna i testowalna', () => {
  it('tylko realny receptor daje sensowne targetAffinity', () => {
    expect(isTargetAffinityMeaningful('REAL_RECEPTOR').meaningful).toBe(true);
    const standin = isTargetAffinityMeaningful('SMALL_MOLECULE_STANDIN');
    expect(standin.meaningful).toBe(false);
    expect(standin.reason).toMatch(/not a target affinity/i);
  });
});

describe('brak silnika dokowania nigdy nie wygląda jak wynik', () => {
  it('bez transportu obie właściwości są REQUIRES_EXTERNAL_ENGINE', () => {
    const batch = runDockingBatch(unavailableDockingTransport, [ASPIRIN], STANDIN);
    const properties = dockingPropertiesFor(ASPIRIN, batch);

    expect(properties.every((p) => p.value === null)).toBe(true);
    expect(properties.every((p) => p.status === 'REQUIRES_EXTERNAL_ENGINE')).toBe(true);
    expect(dockingLimitations(batch)[0]).toMatch(/did not run/i);
  });

  it('BRAK RECEPTORA blokuje dokowanie z jawnym powodem', () => {
    const batch = runDockingBatch(unavailableDockingTransport, [ASPIRIN], null);
    expect(batch.receptorKind).toBeNull();
  });

  it('kandydat bez struktury nie jest dokowany', () => {
    const fake = {
      transportId: 'fixture',
      detect: () => ({ available: true as const, engine: 'TEST_FIXTURE', vinaVersion: '0', meekoVersion: '0' }),
      dock: () => ({ ok: false as const, error: 'INVALID_INPUT' as const, reason: 'fixture' }),
    };
    const batch = runDockingBatch(fake, [candidate('noStruct', null)], STANDIN);
    expect(batch.skipped[0]!.reason).toMatch(/needs a ligand structure/i);
    expect(Object.keys(batch.byCandidate)).toHaveLength(0);
  });

  it('budżet dokowań jest twardy i raportowany', () => {
    const fake = {
      transportId: 'fixture',
      detect: () => ({ available: true as const, engine: 'TEST_FIXTURE', vinaVersion: '0', meekoVersion: '0' }),
      dock: () => ({ ok: true as const, bestAffinityKcalMol: -5, poses: [], receptorKind: 'SMALL_MOLECULE_STANDIN' as const, engine: 'TEST_FIXTURE', seed: 42 }),
    };
    const many = ['a', 'b', 'c'].map((id, i) => candidate(id, `C${'C'.repeat(i)}O`));
    const batch = runDockingBatch(fake, many, STANDIN, { maxDocks: 2 });

    expect(Object.keys(batch.byCandidate)).toHaveLength(2);
    expect(batch.skipped.some((s) => s.reason.includes('docking budget'))).toBe(true);
  });
});

describe(`REALNY AutoDock Vina (available=${dockingAvailable})`, () => {
  if (!dockingAvailable) {
    it('bez Vina ścieżka dokowania jest jawnie zablokowana', () => {
      expect(detected.available).toBe(false);
      if (detected.available) return;
      expect(detected.reason.length).toBeGreaterThan(0);
    });
    return;
  }

  const batch = runDockingBatch(transport, [ASPIRIN], STANDIN, { maxDocks: 1 });
  const properties = dockingPropertiesFor(ASPIRIN, batch);

  it('realny Vina zwraca wynik dokowania', () => {
    const result = batch.byCandidate[ASPIRIN.candidateId]!;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.bestAffinityKcalMol).toBe('number');
    expect(result.engine).toMatch(/Vina/);
  }, 600_000);

  it('WYNIK PRZY ZASTĘPCZYM RECEPTORZE NIE JEST targetAffinity', () => {
    const targetAffinity = properties.find((p) => p.propertyId === 'targetAffinity')!;
    const pipeline = properties.find((p) => p.propertyId === 'dockingPipelineScore')!;

    // Liczba istnieje, ale NIE jako odpowiedź na pytanie o cel biologiczny.
    expect(targetAffinity.value).toBeNull();
    expect(targetAffinity.status).toBe('NOT_AVAILABLE');
    expect(typeof pipeline.value).toBe('number');
    expect(pipeline.status).toBe('MODEL_PREDICTION');
  });

  it('wynik dokowania to PREDYKCJA, nigdy pomiar', () => {
    const pipeline = properties.find((p) => p.propertyId === 'dockingPipelineScore')!;
    expect(evidenceGradeFor(pipeline)).toBe('PREDICTION');
    expect(evidenceGradeFor(pipeline)).not.toBe('EXPERIMENTALLY_VALIDATED');
  });

  it('ograniczenia mówią wprost o zastępczym receptorze', () => {
    const notes = dockingLimitations(batch).join(' ');
    expect(notes).toMatch(/STAND-IN receptor, not a biological target/i);
    expect(notes).toMatch(/not a measured binding constant/i);
  });

  it('to samo wywołanie jest deterministyczne (cache + stały seed)', () => {
    const again = runDockingBatch(transport, [ASPIRIN], STANDIN, { maxDocks: 1 });
    const first = batch.byCandidate[ASPIRIN.candidateId]!;
    const second = again.byCandidate[ASPIRIN.candidateId]!;
    expect(first.ok && second.ok && second.bestAffinityKcalMol).toBe(first.ok && first.bestAffinityKcalMol);
  }, 600_000);

  it('withDockingProperties podmienia właściwości bez gubienia innych', () => {
    const enriched = withDockingProperties([{ ...ASPIRIN, properties: [{ propertyId: 'logP', status: 'COMPUTED', value: 1.3, unit: '', engine: 'RDKit' }] }], batch)[0]!;
    expect(enriched.properties.find((p) => p.propertyId === 'logP')!.value).toBe(1.3);
    expect(enriched.properties.some((p) => p.propertyId === 'dockingPipelineScore')).toBe(true);
  });
});
