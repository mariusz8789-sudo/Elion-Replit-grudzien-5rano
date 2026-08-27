import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as experimentFabric from '../core/experimentFabric';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..');
const CORE_DIR = join(SRC_DIR, 'core');
const SPATIAL_IMPORT = join(CORE_DIR, 'experimentFabric', 'spatialImport.ts');

/** Comments may legitimately name the parked symbol; only real code references are offenders. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx')) ? [path] : [];
  });
}

/**
 * GIS is PARKED. `importOsmMap` is the only function in the Experiment Fabric that performs a
 * live network fetch, so it must not be reachable from the public barrel and must have no callers
 * outside its own module until GIS is deliberately unparked.
 */
describe('GIS barrel boundary', () => {
  it('does not expose importOsmMap from the experimentFabric barrel', () => {
    expect(Object.keys(experimentFabric)).not.toContain('importOsmMap');
    expect((experimentFabric as Record<string, unknown>).importOsmMap).toBeUndefined();
  });

  it('keeps the pure normalizer and its request type public for the existing consumer', () => {
    expect(typeof experimentFabric.normalizeOsmMapXml).toBe('function');
    expect(typeof experimentFabric.OSM_ATTRIBUTION).toBe('string');
    expect(typeof experimentFabric.GENESIS_SPATIAL_DATASET_VERSION).toBe('string');
  });

  it('has no importOsmMap caller or re-export outside spatialImport.ts', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(CORE_DIR)) {
      if (file === SPATIAL_IMPORT) continue;
      if (stripComments(readFileSync(file, 'utf8')).includes('importOsmMap')) offenders.push(relative(SRC_DIR, file));
    }
    expect(offenders).toEqual([]);
  });

  it('keeps spatialImport.ts the only Experiment Fabric module with a network fetch', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(CORE_DIR, 'experimentFabric'))) {
      if (file === SPATIAL_IMPORT) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      if (/\bfetch\s*\(/.test(source) || /\bXMLHttpRequest\b/.test(source) || /from\s+['"](?:axios|node-fetch|undici)['"]/.test(source)) {
        offenders.push(relative(SRC_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('performs no network access itself', () => {
    // The suite only reads files from disk and inspects the already-imported barrel.
    expect(readFileSync(SPATIAL_IMPORT, 'utf8')).toContain('export async function importOsmMap');
  });
});
