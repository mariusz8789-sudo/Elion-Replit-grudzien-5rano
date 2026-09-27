import type { DeterministicPort } from './contracts';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
}

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export const deterministic: DeterministicPort = {
  fingerprint(value: unknown): string { return `fnv1a32:${fnv1a32(canonical(value)).toString(16).padStart(8, '0')}`; },
  stableUnit(key: string): number { return fnv1a32(key) / 0xffffffff; },
};
