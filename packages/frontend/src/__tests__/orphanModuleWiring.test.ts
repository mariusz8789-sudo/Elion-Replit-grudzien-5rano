import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WIRING REGRESSIONS for the modules a reachability sweep found complete,
 * tested and reachable by nothing (see `moduleReachability.test.ts` for the
 * sweep itself, and `docs/MASTER_PRIORITY_GENESIS.md` §7b for how the first
 * one — `core/agent/domeWorld/` — was missed).
 *
 * `moduleReachability.test.ts` proves these modules are REACHED. This file
 * proves they are reached FOR THEIR OWN PURPOSE: that the screen calls the
 * real function and renders what it returns, rather than importing it to
 * satisfy the sweep. An import with no call site would pass a reachability
 * check and change nothing a user sees, which is the failure mode both files
 * exist to prevent.
 *
 * Source-text assertions, because this repo's vitest runs in a node
 * environment with no DOM — the same technique `liveMatrixBoundary.test.tsx`
 * and `domeWorldChallenge.test.ts` already use for "is this wired".
 */

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts: string[]): string => readFileSync(join(SRC, ...parts), 'utf8');

describe('world persistence is connected at both ends, not just built at both ends', () => {
  const screen = read('components', 'visual-simulation', 'GenesisWorldScreen.tsx');

  /**
   * The backend has served `/api/worlds` with a passing "survives a real
   * process restart" test, and the browser never called it. Both halves
   * existing is exactly what made this easy to miss.
   */
  it('the screen holding the live TemporalEngine calls the real persistence client', () => {
    expect(screen).toMatch(/saveWorldSnapshotToBackend\s*\(/);
    expect(screen).toMatch(/loadWorldSnapshotFromBackend\s*\(/);
  });

  it('the snapshot is produced by serializeWorld, never hand-assembled in the screen', () => {
    expect(screen).toMatch(/serializeWorld\s*\(\s*record\s*,/);
    // A hand-built object literal with these keys would be a second snapshot format.
    expect(screen).not.toMatch(/keyframeEntities\s*:/);
  });

  it('a second save is an update, not a silently swallowed 409', () => {
    expect(screen).toMatch(/reason\s*===\s*'conflict'/);
    expect(screen).toMatch(/updateWorldSnapshotOnBackend\s*\(/);
  });

  /**
   * The load button restores an engine in memory and reports its real
   * numbers. It does NOT rebuild the 3D scene, and the status text has to
   * say so — claiming a restored view we do not render would be the exact
   * fabrication this codebase's rules forbid.
   */
  it('the load path says plainly that the 3D scene still shows the live world', () => {
    expect(screen).toMatch(/restoreWorld\s*\(/);
    expect(screen).toMatch(/scena 3D nadal pokazuje świat żywy/);
  });
});

describe('the Matrix hub shows the epistemic state it can already compute', () => {
  const hub = read('components', 'GenesisMatrixHub.tsx');

  it('calls buildEpistemicStateGraph on the records it already holds', () => {
    expect(hub).toMatch(/buildEpistemicStateGraph\s*\(\s*records\s*\)/);
  });

  /**
   * A status with no visible derivation is a label. The rule is what makes it
   * checkable, so rendering it is part of the contract, not decoration.
   */
  it('renders each record status together with the rule that derived it', () => {
    expect(hub).toMatch(/derivationRule/);
    expect(hub).toMatch(/data-testid="epistemic-node-status"/);
  });

  it('renders the distribution and the reproducibility fingerprint', () => {
    expect(hub).toMatch(/data-testid="epistemic-distribution"/);
    expect(hub).toMatch(/epistemicState\.fingerprint/);
  });

  it('computes the transitive evidence blast radius, which the one-hop relation list cannot', () => {
    expect(hub).toMatch(/computeEvidenceImpact\s*\(\s*detail\.record\.id\s*,\s*records\s*\)/);
    expect(hub).toMatch(/data-testid="evidence-impact-count"/);
  });

  /**
   * `epistemicStateGraph.ts` derives status from real fields precisely so the
   * free-text `record.epistemicStatus` is never trusted. The screen must not
   * reintroduce that read beside it.
   */
  it('does not fall back to the free-text epistemicStatus field for these statuses', () => {
    const code = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/record\.epistemicStatus/);
  });
});

describe('the experiment pilot explains what changed, not only what was decided', () => {
  const pilot = read('components', 'ExperimentPilotScreen.tsx');

  it('calls the real explainWhyBeliefChanged on the loop result it just executed', () => {
    expect(pilot).toMatch(/explainWhyBeliefChanged\s*\(\s*loopResult\s*\)/);
    expect(pilot).toMatch(/data-testid="belief-change-why"/);
  });

  /**
   * BEFORE and AFTER are the whole point — either column alone is just a
   * status list, and the observation column is what connects them.
   */
  it('renders before, observation and after together', () => {
    expect(pilot).toMatch(/why\.before\.find/);
    expect(pilot).toMatch(/why\.observation\.find/);
    expect(pilot).toMatch(/why\.after\.map/);
  });

  /**
   * "Nothing changed" is a real, common and honest outcome of running an
   * experiment. A screen that only renders when something moved would quietly
   * overstate how often the evidence decides anything.
   */
  it('states it plainly when no hypothesis changed status', () => {
    expect(pilot).toMatch(/Żadna hipoteza nie zmieniła statusu/);
  });
});

describe('the dead duplicate is gone, not merely unused', () => {
  /**
   * `MissionStatusBar.tsx` rendered narrator/AI-health/lab-count/visited from
   * the same sources as `GenesisCommandCenterHero.tsx`, which App.tsx actually
   * mounts. Its own doc said it was extracted "so the Command Center could
   * reuse it without a second implementation" — and the Command Center built
   * the second implementation anyway, leaving this one with zero importers and
   * no test.
   */
  it('MissionStatusBar.tsx no longer exists', () => {
    expect(() => read('components', 'MissionStatusBar.tsx')).toThrow();
  });

  it('its CSS went with it, so styles.css does not keep rules for a deleted component', () => {
    expect(read('styles.css')).not.toMatch(/\.mission-bar/);
  });

  /** The surviving implementation still renders all four facts. */
  it('GenesisCommandCenterHero still covers every fact the deleted bar showed', () => {
    const hero = read('components', 'GenesisCommandCenterHero.tsx');
    expect(hero).toMatch(/api\/health/);
    expect(hero).toMatch(/NARRATOR/);
    expect(hero).toMatch(/getLabs/);
    expect(hero).toMatch(/getVisitedCount/);
  });
});
