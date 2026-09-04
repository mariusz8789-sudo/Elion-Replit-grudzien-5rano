import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDatasetAdapterEligibility, listDatasetMetadata } from '../core/hazard/datasetRegistry';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_DIR = join(HERE, '..', 'core');
const HAZARD_DIR = join(CORE_DIR, 'hazard');
const EARTHQUAKE_RENDERER_FILES = [
  join(CORE_DIR, 'simulationRenderer', 'earthquakeCommandCenter.ts'),
  join(CORE_DIR, 'simulationRenderer', 'earthquakeCoordinateMapping.ts'),
  join(CORE_DIR, 'simulationRenderer', 'earthquakeEvidenceExport.ts'),
  join(CORE_DIR, 'simulationRenderer', 'earthquakePersistedRunHistory.ts'),
  join(CORE_DIR, 'simulationRenderer', 'scenarioOverlayGate.ts'),
] as const;

const NETWORK_RUNTIME_PATTERNS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /\bnavigator\.sendBeacon\s*\(/,
  /\bhttps?\.(?:get|request)\s*\(/,
  /\b(?:axios|got|ky|superagent)\s*[.(]/,
  /from\s+['"](?:axios|node-fetch|undici|got|ky|superagent)['"]/,
] as const;

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

describe('Earthquake synthetic-only no-network boundary', () => {
  it('keeps the hazard domain, dry registry, and Earthquake renderer boundary free of direct network runtime APIs and HTTP clients', () => {
    const files = [...collectTypeScriptFiles(HAZARD_DIR), ...EARTHQUAKE_RENDERER_FILES];
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of NETWORK_RUNTIME_PATTERNS) {
        expect(source, `${file} must remain local-only; matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps every registered dataset dry, metadata-only, and explicitly ineligible for an adapter', () => {
    const datasets = listDatasetMetadata();
    expect(datasets.length).toBeGreaterThan(0);

    for (const dataset of datasets) {
      expect(dataset.registryStatus).toBe('DRY_METADATA_ONLY');
      expect(dataset.ingestionStatus).toBe('NOT_IMPLEMENTED');
      expect(evaluateDatasetAdapterEligibility(dataset).eligible).toBe(false);
    }
  });
});
