import { readJSON, writeJSON } from '../storage';
import type { CanonicalPersistencePort } from './limsElnPersistenceIntegration';

/**
 * D-140 real-repo binding: `CanonicalPersistencePort` implemented on top of the ONE canonical
 * synchronous persistence layer (`core/storage.ts`, the same `readJSON`/`writeJSON` every other
 * settings/state module in this app uses). No second database, no new storage engine.
 *
 * `storage.ts` only exposes flat key/value pairs (no native prefix-listing), so this adapter
 * keeps a small per-namespace key index alongside the values — itself persisted through the same
 * canonical `readJSON`/`writeJSON` functions, never a parallel index store.
 */

function indexKey(namespace: string): string {
  return `d140-index:${namespace}`;
}

function valueKey(namespace: string, key: string): string {
  return `d140-value:${namespace}:${key}`;
}

function readIndex(namespace: string): string[] {
  return readJSON<string[]>(indexKey(namespace), []);
}

export function createGenesisLabPersistencePort(): CanonicalPersistencePort {
  return {
    put(namespace: string, key: string, value: string): void {
      const index = readIndex(namespace);
      if (!index.includes(key)) {
        writeJSON(indexKey(namespace), [...index, key].sort());
      }
      writeJSON(valueKey(namespace, key), value);
    },
    get(namespace: string, key: string): string | undefined {
      return readJSON<string | undefined>(valueKey(namespace, key), undefined);
    },
    list(namespace: string, prefix: string): readonly { readonly key: string; readonly value: string }[] {
      return readIndex(namespace)
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, value: readJSON<string | undefined>(valueKey(namespace, key), undefined) }))
        .filter((item): item is { key: string; value: string } => item.value !== undefined);
    },
  };
}
