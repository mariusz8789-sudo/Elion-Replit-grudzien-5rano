import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

/**
 * GENESIS GRAPHICS RUNTIME — architecture boundary guard.
 *
 * The engine's whole value proposition (README's "commercial engine test": usable without
 * importing Genesis scientific logic) depends on `core/three/graphics/` never reaching sideways
 * into simulation/scientific/world-composition code. Nothing enforces that at the type level —
 * TypeScript happily lets a graphics module `import` a simulation type — so this test enforces it
 * structurally: every import in every graphics/*.ts source file (examples included) must resolve
 * to `three`, a sibling file inside this same directory, or one of a small, explicitly-approved
 * list of generic (non-scientific) shared modules. Anything else fails the test, on purpose —
 * loosening the allow-list is a real architectural decision, not something that should happen by
 * accident three imports deep in a large file.
 */

const GRAPHICS_DIR = join(__dirname, '..', 'core', 'three', 'graphics');

/** Generic, non-scientific shared modules the graphics layer is allowed to depend on — a render
 * tier heuristic, the Sim3D contract types, and the asset-licensing/provenance gate. None of these
 * know anything about hospitals, epidemics, hypotheses, or any other Genesis domain concept. */
const ALLOWED_EXTERNAL_IMPORTS = new Set(['../types', '../quality', '../assetGovernance']);

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsFiles(full));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  // Matches both `import ... from 'x'` and `import('x')` (dynamic import), including type-only imports.
  const re = /(?:import|export)(?:\s+type)?\s+[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    specifiers.push(match[1] ?? match[2] ?? '');
  }
  return specifiers.filter(Boolean);
}

describe('graphics/ architecture boundary', () => {
  const files = collectTsFiles(GRAPHICS_DIR);

  it('finds the graphics source files (sanity check the scan itself works)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('every graphics/*.ts import resolves to three, a file inside graphics/, or an approved generic module', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        const isThree = specifier === 'three' || specifier.startsWith('three/');
        if (isThree) continue;
        if (!specifier.startsWith('.')) {
          // A bare package specifier (not relative, not "three") — nothing in graphics/ needs one
          // today; flag it rather than silently allow a new dependency.
          violations.push(`${file.replace(GRAPHICS_DIR, 'graphics')} imports "${specifier}" (bare package specifier)`);
          continue;
        }
        const resolved = resolve(dirname(file), specifier);
        const withinGraphics = !relative(GRAPHICS_DIR, resolved).startsWith('..');
        const isApproved = ALLOWED_EXTERNAL_IMPORTS.has(specifier);
        if (!withinGraphics && !isApproved) {
          violations.push(`${file.replace(GRAPHICS_DIR, 'graphics')} imports "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('never imports anything from simulation/world/scientific/event modules by path shape', () => {
    // Belt-and-suspenders on top of the allow-list above: even if a future addition to
    // ALLOWED_EXTERNAL_IMPORTS were careless, these path fragments should never appear in a
    // graphics/*.ts import specifier — they name concepts this layer must never know about.
    const forbiddenFragments = ['simulation', 'events', 'scienceChat', 'scienceMemory', 'lookingGlass', 'reality', 'experimentFabric', 'worldEngine', 'hospitalResource', 'epidemicCity', 'discoveryLoop'];
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        const lower = specifier.toLowerCase();
        if (forbiddenFragments.some((fragment) => lower.includes(fragment.toLowerCase()))) {
          violations.push(`${file.replace(GRAPHICS_DIR, 'graphics')} imports "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
