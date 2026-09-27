export type Id = string;

export type EpistemicStatus =
  | "KNOWN"
  | "SUPPORTED"
  | "INFERRED"
  | "SIMULATED"
  | "ASSUMED"
  | "UNKNOWN"
  | "CONTRADICTED"
  | "UNVERIFIED";

export interface ProvenanceRef {
  source: string;
  sourceId: string;
  version?: string;
  retrievedAt?: string;
  hash?: string;
}

export interface ExecutionRef {
  engineId: string;
  engineVersion: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
}

export interface ClockPort {
  nowIso(): string;
}

export class SystemClock implements ClockPort {
  nowIso(): string { return new Date().toISOString(); }
}
