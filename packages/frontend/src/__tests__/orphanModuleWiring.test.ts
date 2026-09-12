import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCampaignWhyQuestion } from '../core/discovery/campaignWhyIntent';

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

describe('the model tournament runs both models rather than describing them', () => {
  const panel = read('components', 'ModelTournamentPanel.tsx');
  const app = read('App.tsx');

  it('is mounted on the conflict route', () => {
    expect(app).toMatch(/ModelTournamentPanel/);
  });

  /**
   * `counterfactualCompare.ts` refuses a two-model comparison by design and
   * names `modelVsModelCompare.ts` as the protocol that does it. The panel
   * must call that protocol, not reimplement a comparison of its own.
   */
  it('calls the real comparison and the real sweep', () => {
    expect(panel).toMatch(/compareModelVsModel\s*\(/);
    expect(panel).toMatch(/sweepModelDivergence\s*\(/);
  });

  it('computes no science of its own — no arithmetic on the two models values', () => {
    const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Recomputing the delta or the divergence here would be a second, silently
    // diverging implementation of what the module already returns.
    expect(code).not.toMatch(/modelAValue\s*[-+*/]\s*(metric\.)?modelBValue/);
    expect(code).not.toMatch(/Math\.(abs|max)\s*\([^)]*modelAValue/);
  });

  /**
   * The threshold is a disclosed distance cutoff, not a statistical test, and
   * "most discriminating" is a heuristic, not information gain. The panel
   * renders the module's own disclaimer rather than paraphrasing it, and says
   * what the threshold is not.
   */
  it('renders the honesty disclaimers instead of implying a calibrated test', () => {
    expect(panel).toMatch(/sweep\.reasoning/);
    expect(panel).toMatch(/nie jest\s*\n?\s*to p-value|nie jest to p-value/);
  });

  /** A non-COMPLETED comparison must read UNTESTED, never a fabricated agreement. */
  it('renders a blocked comparison as its real status, never as agreement', () => {
    expect(panel).toMatch(/data-testid="tournament-blocked"/);
    expect(panel).toMatch(/UNTESTED:\s*'NIEPRZETESTOWANE'/);
  });
});

describe('the protection study shows the conflict instead of one number', () => {
  const screen = read('components', 'ProtectionPriorityScreen.tsx');

  it('is a real route with a real menu entry, not a URL-only screen', () => {
    expect(read('App.tsx')).toMatch(/#\/protection-priority/);
    expect(read('core', 'navigation.ts')).toMatch(/#\/protection-priority/);
  });

  it('calls the real study rather than computing a ranking of its own', () => {
    expect(screen).toMatch(/runProtectionPriorityStudy\s*\(/);
    const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // A sort here would be a second ranking, silently free to disagree with
    // the one the study computed under its own admission rules.
    expect(code).not.toMatch(/\.sort\s*\(/);
  });

  /**
   * The whole point of the module is that different objectives can crown
   * different groups. A screen that rendered one ranking, or averaged them,
   * would answer a question the data does not answer.
   */
  it('renders every objective separately, never a single collapsed answer', () => {
    expect(screen).toMatch(/PROTECTION_OBJECTIVES\.map/);
    expect(screen).toMatch(/winnerByObjective/);
    expect(screen).toMatch(/data-testid="protection-conflict"/);
  });

  /** Rejections and limitations are what a dishonest version of this screen drops. */
  it('renders rejected candidates and the study limitations', () => {
    expect(screen).toMatch(/rejectionReason/);
    expect(screen).toMatch(/study\.limitations\.map/);
  });

  /**
   * The age-gradient profile is DECLARED illustrative. `defineCohortProfile`
   * without provenance marks it UNCALIBRATED, and the screen must show that
   * marking rather than let a reviewer read the numbers as clinical.
   */
  it('shows the cohort calibration and labels the gradient profile illustrative', () => {
    expect(screen).toMatch(/cohortCalibration/);
    expect(screen).toMatch(/ILUSTRACYJNY, nieskalibrowany/);
  });
});

describe('the campaign screen accepts a "why" question in words', () => {
  const campaign = read('components', 'CampaignScreen.tsx');

  it('routes free text through the real intent parser', () => {
    expect(campaign).toMatch(/parseCampaignWhyQuestion\s*\(\s*whyQuestion\s*\)/);
  });

  /**
   * The parser returns `kind: null` rather than guessing, precisely because a
   * guessed kind answers a different question than the one asked. The screen
   * must carry that refusal through instead of falling back to some default.
   */
  it('refuses honestly when no kind matches, rather than answering something else', () => {
    expect(campaign).toMatch(/intent\.kind === null/);
    expect(campaign).toMatch(/data-testid="campaign-why-unresolved"/);
    const code = campaign.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // A `?? 'status'`-style default on the kind would be exactly the guess the
    // parser exists to avoid.
    expect(code).not.toMatch(/intent\.kind\s*\?\?/);
  });

  /** The parsed generation must reach the backend, or "why stop at generation 3" silently becomes "why stop". */
  it('forwards the generation the sentence named', () => {
    expect(campaign).toMatch(/intent\.generation \?\? undefined/);
  });

  /**
   * REGRESSION for a real bug caught only by running the thing: the first
   * version of this input offered "dlaczego stop" as an example, and the
   * grammar does not accept it (it wants "dlaczego kampania się zatrzymała").
   * A screen that suggests phrasings its own parser rejects teaches the user
   * that the feature is broken. So every example the UI shows is parsed here.
   */
  it('every example phrasing the screen suggests is one the parser really accepts', () => {
    const examples = [
      'dlaczego kampania się zatrzymała',
      'dlaczego zmieniono strategię',
      'co dalej',
      'który silnik to policzył',
      'konflikt modeli',
    ];
    for (const example of examples) {
      expect(campaign, `the UI no longer offers "${example}" — update this list with the new examples`).toContain(example);
      expect(parseCampaignWhyQuestion(example).kind, `"${example}" is offered in the UI but the parser rejects it`).not.toBeNull();
    }
  });
});

describe('the sixth scientific world can be watched, not only tested', () => {
  const screen = read('components', 'GeodesicWorldScreen.tsx');

  it('is a real route with a real menu entry', () => {
    expect(read('App.tsx')).toMatch(/#\/geodesics/);
    expect(read('core', 'navigation.ts')).toMatch(/#\/geodesics/);
  });

  it('drives the registered solver through the real TemporalEngine', () => {
    expect(screen).toMatch(/makeRelativityGeodesicSolver\s*\(/);
    expect(screen).toMatch(/router\.routeTick/);
    expect(screen).toMatch(/engine\.advance/);
  });

  /**
   * The screen must read published coordinates, never integrate. A trajectory
   * computed here would be a second, silently diverging relativity.
   */
  it('integrates nothing of its own', () => {
    const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/stepSchwarzschildGeodesic/);
    // No trig on the orbital state: that is how a hand-rolled orbit starts.
    expect(code).not.toMatch(/Math\.(sin|cos|atan2)\s*\(/);
    expect(screen).toMatch(/entity\.spatial!\.position/);
  });

  /**
   * The unit conversion must go through the solver's own declared scalar,
   * which the module exposes exactly so the scaling is auditable rather than
   * a magic number in a view.
   */
  it('converts to Schwarzschild radii through the solver own declared scalar', () => {
    expect(screen).toMatch(/worldUnitsPerSchwarzschildRadius/);
  });

  /**
   * The capture boundary is a closed-form constant, so the screen states the
   * prediction and then reports whether the run matched it — including the
   * disagreeing branch, which must exist and must not be silent.
   */
  it('states the b_crit prediction and can report a disagreement', () => {
    expect(screen).toMatch(/CRITICAL_IMPACT_PARAMETER_RS/);
    expect(screen).toMatch(/data-testid="geodesic-verdict"/);
    expect(screen).toMatch(/NIEZGODNE z b_crit/);
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
