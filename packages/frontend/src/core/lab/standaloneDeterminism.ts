import type { DeterministicLabRuntime, LabEvidenceEvent, LabEvidencePort, LabRuntime } from './labRuntime';

function canonicalizeInner(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number cannot be canonicalized');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeInner).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeInner(obj[key])}`).join(',')}}`;
  }
  if (value === undefined) return '"__undefined__"';
  throw new Error(`Unsupported canonical value type: ${typeof value}`);
}

export function fnv32a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const standaloneDeterminism: DeterministicLabRuntime = {
  canonicalize: canonicalizeInner,
  fingerprint: (value: unknown) => `fnv32a:${fnv32a(canonicalizeInner(value))}`,
};

export class RecordingEvidencePort implements LabEvidencePort {
  readonly events: LabEvidenceEvent[] = [];
  emit(event: LabEvidenceEvent): void { this.events.push(event); }
}

export function createStandaloneLabRuntime(evidence?: LabEvidencePort): LabRuntime {
  return evidence === undefined
    ? { deterministic: standaloneDeterminism }
    : { deterministic: standaloneDeterminism, evidence };
}
