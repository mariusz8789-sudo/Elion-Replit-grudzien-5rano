import { TEST_ONLY_HASH_PORT } from "../hashReplay/testHash.js";
import type { HashPort } from "../hashReplay/hashPort.js";

/** ADAPTER/VALIDATOR UTILITY (fix area 6). `fingerprint()` now takes an optional
 * `HashPort` (fix area 4) instead of a private local fnv1a32 — bind the real repo's
 * `core/events/hash.ts` HashPort in production. */
export type DataEpistemicClass =
  | "MEASURED"
  | "SUPPORTED"
  | "INFERRED"
  | "SIMULATED"
  | "ASSUMED"
  | "UNKNOWN"
  | "UNVERIFIED";

export interface DataSourceRecord {
  id: string;
  provider: string;
  sourceUrl?: string;
  api?: string;
  observationDate?: string;
  version: string;
  license: string;
  spatialResolution?: string;
  temporalResolution?: string;
  units?: string;
  transformations: string[];
  missingness?: string;
  qualityNotes: string[];
  contentHash?: string;
  epistemicClass: DataEpistemicClass;
}

export class DataRegistry {
  private readonly records = new Map<string, DataSourceRecord>();

  constructor(private readonly hashPort: HashPort = TEST_ONLY_HASH_PORT) {}

  register(record: DataSourceRecord): void {
    if (!record.id.trim()) throw new Error("Data source id is required.");
    if (!record.provider.trim()) throw new Error("Data provider is required.");
    if (!record.version.trim()) throw new Error("Data version is required.");
    if (!record.license.trim()) throw new Error("Data license is required.");
    if (this.records.has(record.id)) throw new Error(`Duplicate data source id: ${record.id}`);
    this.records.set(record.id, structuredClone(record));
  }

  get(id: string): DataSourceRecord | undefined {
    const value = this.records.get(id);
    return value ? structuredClone(value) : undefined;
  }

  list(): DataSourceRecord[] {
    return [...this.records.values()].map((x) => structuredClone(x));
  }

  fingerprint(): string {
    return this.hashPort.fingerprint(this.list().sort((a, b) => a.id.localeCompare(b.id)));
  }
}
