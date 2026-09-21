import type { ElectronicLabNotebookEntry, ElectronicLabNotebookPort, LaboratoryInformationPort, LaboratoryRecord } from './limsElnPorts';
import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export interface CanonicalPersistencePort {
  put(namespace: string, key: string, value: string): void;
  get(namespace: string, key: string): string | undefined;
  list(namespace: string, prefix: string): readonly { readonly key: string; readonly value: string }[];
}

function encode(runtime: LabRuntime, value: unknown): string { return runtime.deterministic.canonicalize(value); }
function decodeRecord(text: string): LaboratoryRecord { return JSON.parse(text) as LaboratoryRecord; }
function decodeEntry(text: string): ElectronicLabNotebookEntry { return JSON.parse(text) as ElectronicLabNotebookEntry; }

/**
 * LIMS/ELN adapter backed by an injected canonical persistence seam.
 * This is not a database and must not create a second persistence architecture.
 */
export class PersistenceBackedLaboratoryInformationPort implements LaboratoryInformationPort {
  constructor(private readonly runtime: LabRuntime, private readonly persistence: CanonicalPersistencePort) {}
  putRecord(record: LaboratoryRecord): void {
    this.persistence.put('d140.lims', record.experimentId, encode(this.runtime, record));
    emitLabEvidence(this.runtime, {
      type: 'LIMS_RECORD_PERSISTED', modelId: 'D140_LIMS_ADAPTER', solverId: 'canonical-persistence-adapter-v1',
      input: record, result: { experimentId: record.experimentId }, epistemicStatus: 'REPLAY', evidenceClass: 'DERIVED',
      provenance: record.evidenceRefs, limitations: ['Persistence backend is injected; standalone E2E uses an in-memory fixture only.'],
    });
  }
  getRecord(experimentId: string): LaboratoryRecord | undefined {
    const text = this.persistence.get('d140.lims', experimentId);
    return text === undefined ? undefined : decodeRecord(text);
  }
}

export class PersistenceBackedElectronicLabNotebookPort implements ElectronicLabNotebookPort {
  constructor(private readonly runtime: LabRuntime, private readonly persistence: CanonicalPersistencePort) {}
  append(entry: ElectronicLabNotebookEntry): void {
    const key = `${entry.experimentId}/${entry.entryId}`;
    if (this.persistence.get('d140.eln', key) !== undefined) throw new Error(`ELN entry already exists: ${key}`);
    this.persistence.put('d140.eln', key, encode(this.runtime, entry));
    emitLabEvidence(this.runtime, {
      type: 'ELN_ENTRY_APPENDED', modelId: 'D140_ELN_ADAPTER', solverId: 'canonical-persistence-adapter-v1',
      input: entry, result: { key }, epistemicStatus: 'REPLAY', evidenceClass: 'DERIVED',
      provenance: entry.evidenceRefs, limitations: ['Persistence backend is injected; standalone E2E uses an in-memory fixture only.'],
    });
  }
  list(experimentId: string): readonly ElectronicLabNotebookEntry[] {
    return this.persistence.list('d140.eln', `${experimentId}/`).map((item) => decodeEntry(item.value));
  }
}

/** Explicit standalone-only fixture. Never integrate this as a second Genesis database. */
export class InMemoryCanonicalPersistenceFixture implements CanonicalPersistencePort {
  private readonly data = new Map<string, string>();
  put(namespace: string, key: string, value: string): void { this.data.set(`${namespace}:${key}`, value); }
  get(namespace: string, key: string): string | undefined { return this.data.get(`${namespace}:${key}`); }
  list(namespace: string, prefix: string): readonly { readonly key: string; readonly value: string }[] {
    const nsPrefix = `${namespace}:`;
    return [...this.data.entries()]
      .filter(([compound]) => compound.startsWith(`${nsPrefix}${prefix}`))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([compound, value]) => ({ key: compound.slice(nsPrefix.length), value }));
  }
}
