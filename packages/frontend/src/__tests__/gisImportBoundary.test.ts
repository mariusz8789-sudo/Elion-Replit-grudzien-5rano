import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fabricDir = join(here, '..', 'core', 'experimentFabric');
const barrel = readFileSync(join(fabricDir, 'index.ts'), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('GIS live-fetch boundary', () => {
  it('keeps importOsmMap out of the public Experiment Fabric barrel while GIS is parked', () => {
    expect(barrel).not.toMatch(/\bimportOsmMap\b/);
  });

  it('has no importOsmMap callers outside the spatialImport implementation', () => {
    const callers = sourceFiles(fabricDir)
      .filter((file) => !file.endsWith('spatialImport.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('importOsmMap'));
    expect(callers).toEqual([]);
  });

  it('does not execute a network request while checking the boundary', () => {
    expect(statSync(join(fabricDir, 'spatialImport.ts')).isFile()).toBe(true);
  });
});
