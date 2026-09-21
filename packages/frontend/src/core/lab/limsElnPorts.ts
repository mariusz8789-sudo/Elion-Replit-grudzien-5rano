export interface LaboratoryRecord {
  readonly experimentId: string;
  readonly protocolId: string;
  readonly sampleIds: readonly string[];
  readonly instrumentIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly fingerprints: readonly string[];
  readonly attachments: readonly string[];
  readonly operatorIdentity?: string;
}
export interface LaboratoryInformationPort { putRecord(record: LaboratoryRecord): void; getRecord(experimentId: string): LaboratoryRecord | undefined }
export interface ElectronicLabNotebookEntry { readonly entryId: string; readonly experimentId: string; readonly text: string; readonly evidenceRefs: readonly string[]; readonly fingerprint: string }
export interface ElectronicLabNotebookPort { append(entry: ElectronicLabNotebookEntry): void; list(experimentId: string): readonly ElectronicLabNotebookEntry[] }
