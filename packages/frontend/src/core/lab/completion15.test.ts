import { describe, expect, it } from 'vitest';
import { createStandaloneLabRuntime } from './standaloneDeterminism';
import { bindTwinStateToCanonicalWorld, type CanonicalWorldVisualizationPort, type RenderProbeResult, type WorldEntityState } from './worldVisualizationIntegration';
import { executeCanonicalScientificSolver, newtonCoolingTransferSolver } from './scientificSolverIntegration';
import { InMemoryCanonicalPersistenceFixture, PersistenceBackedElectronicLabNotebookPort, PersistenceBackedLaboratoryInformationPort } from './limsElnPersistenceIntegration';

class WorldFixture implements CanonicalWorldVisualizationPort {
  private entity: WorldEntityState | undefined;
  upsertScientificEntity(entity: WorldEntityState): void { this.entity = entity; }
  readScientificEntity(entityId: string): WorldEntityState | undefined { return this.entity?.entityId === entityId ? this.entity : undefined; }
  renderProbe(entityId: string): RenderProbeResult {
    if (this.entity?.entityId !== entityId) return { entityId, visible: false, frameFingerprint: 'missing', renderedScalarState: {} };
    return { entityId, visible: true, frameFingerprint: 'fixture-frame', renderedScalarState: this.entity.scalarState };
  }
}

describe('D-140 missing 15% completion adapters', () => {
  it('binds Digital Twin residual into a visible canonical-world seam', () => {
    const runtime = createStandaloneLabRuntime();
    const result = bindTwinStateToCanonicalWorld(runtime, new WorldFixture(), {
      entityId: 'sample-1', kind: 'sample', position: [0, 0, 0], predictedValue: 300, measuredValue: 301,
      residual: 1, unit: 'K', provenance: ['TEST'],
    });
    expect(result.visible).toBe(true);
  });

  it('executes an injected scientific solver deterministically', () => {
    const runtime = createStandaloneLabRuntime();
    const input = { initialKelvin: 320, ambientKelvin: 295, coolingConstantPerSecond: 0.02, elapsedSeconds: 10 };
    const a = executeCanonicalScientificSolver(runtime, newtonCoolingTransferSolver, input, ['TEST']);
    const b = executeCanonicalScientificSolver(runtime, newtonCoolingTransferSolver, input, ['TEST']);
    expect(a.outputFingerprint).toBe(b.outputFingerprint);
    expect(a.output.temperatureKelvin).toBeGreaterThan(295);
    expect(a.output.temperatureKelvin).toBeLessThan(320);
  });

  it('round-trips LIMS and append-only ELN through injected persistence', () => {
    const runtime = createStandaloneLabRuntime();
    const persistence = new InMemoryCanonicalPersistenceFixture();
    const lims = new PersistenceBackedLaboratoryInformationPort(runtime, persistence);
    const eln = new PersistenceBackedElectronicLabNotebookPort(runtime, persistence);
    lims.putRecord({ experimentId: 'e1', protocolId: 'p1', sampleIds: ['s1'], instrumentIds: ['i1'], evidenceRefs: ['ev1'], fingerprints: ['fp1'], attachments: [] });
    expect(lims.getRecord('e1')?.protocolId).toBe('p1');
    eln.append({ entryId: 'n1', experimentId: 'e1', text: 'done', evidenceRefs: ['ev1'], fingerprint: 'fp1' });
    expect(eln.list('e1')).toHaveLength(1);
  });
});
