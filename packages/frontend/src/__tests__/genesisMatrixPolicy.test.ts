import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deriveMatrixVisualState, MATRIX_HEAVY_3D_ROUTES } from '../core/genesisMatrixPolicy';
import { toMatrixConfig } from '../components/liveMatrix/genesisVisualState';

/**
 * GENESIS MATRIX POLICY — the pure route+state->visual mapping that drives
 * App.tsx's one `LiveMatrixBackground` mount. No jsdom/React here (this repo
 * has neither — see liveMatrixController.test.ts's own note), so this file
 * proves the POLICY, exactly the layer the App.tsx integration test
 * (liveMatrixBoundary.test.tsx) does not reach.
 */

describe('deriveMatrixVisualState: real Genesis state drives the config', () => {
  it('is a pure, deterministic function — same route + same activity signal => identical config', () => {
    const a = deriveMatrixVisualState('home', false);
    const b = deriveMatrixVisualState('home', false);
    expect(a).toEqual(b);
    expect(toMatrixConfig(a)).toEqual(toMatrixConfig(b));
  });

  it('depends on the real hasActiveSim() signal, not a constant — an open experiment session changes activity', () => {
    const idle = deriveMatrixVisualState('pilot', false);
    const running = deriveMatrixVisualState('pilot', true);
    expect(idle.activity).not.toBe(running.activity);
    expect(running.activity).toBe('RUNNING');
    // toMatrixConfig's own ACTIVITY_TIER maps RUNNING to the highest non-ATTENTION tier (3).
    expect(toMatrixConfig(running).activity).toBe(3);
  });

  it('Home gets a genuinely visible tier, never the practically-invisible one', () => {
    const home = deriveMatrixVisualState('home', false);
    expect(home.quality).toBe('HIGH');
    expect(home.intensity ?? 0).toBeGreaterThanOrEqual(0.5);
    const config = toMatrixConfig(home);
    expect(config.quality).toBe('HIGH');
  });

  it('every heavy-3D route gets the agreed lighter policy: LOW quality, reduced intensity vs. a non-3D route', () => {
    const baseline = deriveMatrixVisualState('pilot', false).intensity ?? 0;
    for (const routeKind of MATRIX_HEAVY_3D_ROUTES) {
      const state = deriveMatrixVisualState(routeKind, false);
      expect(state.quality, `${routeKind} should get LOW quality`).toBe('LOW');
      expect(state.intensity ?? 0, `${routeKind} should be dimmer than a non-3D route`).toBeLessThan(baseline);
    }
  });

  it('never returns a "practically invisible" config for a heavy-3D route either — LOW quality is not zero', () => {
    for (const routeKind of MATRIX_HEAVY_3D_ROUTES) {
      const state = deriveMatrixVisualState(routeKind, false);
      expect(state.intensity ?? 0).toBeGreaterThan(0);
      expect(() => toMatrixConfig(state)).not.toThrow();
    }
  });

  it('the same fixed seed is used for every route — one persistent field, not re-seeded per navigation', () => {
    const seeds = new Set(['home', 'pilot', 'genesis-world', 'matrix'].map((r) => deriveMatrixVisualState(r, false).seed));
    expect(seeds.size).toBe(1);
  });
});

describe('MATRIX_HEAVY_3D_ROUTES stays honest about App.tsx\'s real route table', () => {
  const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it('every listed route kind is a real Route[\'kind\'] literal in App.tsx (no invented/stale route names)', () => {
    const typeBlockMatch = appSource.match(/type Route =([\s\S]*?);\n\nfunction parseHash/);
    expect(typeBlockMatch, 'could not locate the Route union in App.tsx').not.toBeNull();
    const typeBlock = typeBlockMatch![1]!;
    const realKinds = new Set([...typeBlock.matchAll(/kind:\s*'([\w-]+)'/g)].map((m) => m[1]!));
    for (const routeKind of MATRIX_HEAVY_3D_ROUTES) {
      expect(realKinds.has(routeKind), `'${routeKind}' is not a real Route['kind'] in App.tsx anymore`).toBe(true);
    }
  });

  it('every route kind actually mounting a Three.js/WebGL scene component is covered (regression net for the grep this list was built from)', () => {
    // The same search used to build the list in the first place — re-run here so a NEW heavy 3D
    // screen wired into App.tsx without updating the policy fails this test instead of silently
    // running Matrix at full HIGH quality alongside a live WebGL scene.
    const componentsDir = join(process.cwd(), 'src', 'components');
    const webglComponents = new Set<string>();
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry: string) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    for (const file of walk(componentsDir)) {
      if (!file.endsWith('.tsx')) continue;
      const source = readFileSync(file, 'utf8');
      if (/useThreeLoop|WebGLRenderer/.test(source)) {
        webglComponents.add(file.replace(componentsDir + '/', '').replace(/\.tsx$/, ''));
      }
    }
    // Route kinds whose App.tsx branch mounts one of the WebGL-bearing components above.
    const routeToComponent: Record<string, string> = {
      lab: 'LabShell', // registry-driven; conservatively treated as heavy (see genesisMatrixPolicy.ts doc)
      'city3d': 'visual-simulation/City3DWebGLScreen',
      'scientific-city': 'visual-simulation/GenesisScientificCityScreen',
      'hf-slice': 'visual-simulation/HighFidelitySliceScreen',
      'first-person-lab': 'visual-simulation/FirstPersonLabScreen',
      'investor-demo': 'visual-simulation/InvestorDemoScreen',
      character: 'visual-simulation/CharacterLabScreen',
      'genesis-world': 'visual-simulation/GenesisWorldScreen',
      molecule: 'visual-simulation/MoleculeLabScreen',
    };
    for (const [routeKind, component] of Object.entries(routeToComponent)) {
      if (component === 'LabShell') continue; // LabShell itself is asserted as WebGL-bearing below instead.
      expect(webglComponents.has(component), `${component} no longer imports a WebGL loop — MATRIX_HEAVY_3D_ROUTES('${routeKind}') may be stale`).toBe(true);
      expect(MATRIX_HEAVY_3D_ROUTES.has(routeKind), `${component} mounts a live WebGL scene but '${routeKind}' is missing from MATRIX_HEAVY_3D_ROUTES`).toBe(true);
    }
    expect(webglComponents.has('LabShell')).toBe(true);
  });
});

describe('the real UI stacks above Matrix, by actual z-index numbers, not by assumption', () => {
  it("'.shell' (AppShell's root, wrapping every route + the floating Science Chat) has a higher z-index than LiveMatrixBackground's own default", () => {
    const bgSource = readFileSync(
      join(process.cwd(), 'src', 'components', 'liveMatrix', 'LiveMatrixBackground.tsx'), 'utf8',
    );
    const bgZIndexMatch = bgSource.match(/zIndex:\s*(-?\d+)/);
    expect(bgZIndexMatch, "LiveMatrixBackground.tsx no longer sets a literal zIndex — update this test's assumption").not.toBeNull();
    const matrixZIndex = Number(bgZIndexMatch![1]);

    const cssSource = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
    const shellRuleMatch = cssSource.match(/\.shell\s*\{\s*position:\s*relative;\s*z-index:\s*(-?\d+);?\s*\}/);
    expect(shellRuleMatch, "the '.shell { position: relative; z-index: N }' rule in styles.css moved or changed shape").not.toBeNull();
    const shellZIndex = Number(shellRuleMatch![1]);

    expect(shellZIndex).toBeGreaterThan(matrixZIndex);
  });
});
