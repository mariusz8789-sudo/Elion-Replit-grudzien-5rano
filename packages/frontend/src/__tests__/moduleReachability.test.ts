import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * MODULE REACHABILITY — is every module this repo contains actually reachable
 * from the running application?
 *
 * This test exists because of a specific, real failure. `core/agent/domeWorld/`
 * was complete, tested, correct, and reached by NOTHING: no screen called it,
 * no route rendered it, so no user could ever see Genesis falsify the flat-disc
 * model. A coordination doc had swept three named modules for exactly this and
 * concluded "no orphaned modules found" — true for those three, false for the
 * repo, because a sweep by hand only ever checks what someone remembered to
 * name.
 *
 * So the sweep is mechanical now. It walks the real import graph from the real
 * entry point and asserts that the set of unreachable modules is exactly the
 * documented one below. A NEW orphan fails this test; that is the whole point.
 *
 * WHY TESTS ARE NOT ENTRY POINTS: being reached only by your own test is
 * precisely the domeWorld shape — green, proven, invisible. A module in that
 * state must be listed here with a reason, not hidden by counting its test as
 * a consumer.
 *
 * THE ALLOWLIST IS NOT A SUPPRESSION LIST. Every entry carries why it is
 * legitimately unreached. "We haven't got to it" is a legitimate reason when
 * written down; silence is not.
 */

const SRC = resolve(process.cwd(), 'src');

function allSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return allSourceFiles(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file) || file.includes('/__tests__/');

/** Relative specifier -> real file, trying the extensions Vite itself tries. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null; // a package, not one of ours
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  for (const candidate of candidates) {
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* next candidate */ }
  }
  return null;
}

/**
 * All five ways this codebase actually pulls a module in. The side-effect form
 * (`import './labs/index';` — no `from`) matters more than it looks: the entire
 * 23-experiment lab registry is loaded that way, and a sweep that only matches
 * `from '…'` reports every lab as an orphan. That false positive is how a
 * reachability check loses its credibility on the first run.
 */
const IMPORT_PATTERNS: readonly RegExp[] = [
  /from\s+'([^']+)'/g,
  /import\('([^']+)'\)/g,
  /require\('([^']+)'\)/g,
  /^\s*import\s+'([^']+)';/gm,
  /import\.meta\.glob<?[^(]*\(\s*'([^']+)'/g,
];

function importGraph(files: readonly string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const targets = new Set<string>();
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const resolved = resolveSpecifier(file, match[1]!);
        if (resolved !== null) targets.add(resolved);
      }
    }
    graph.set(file, targets);
  }
  return graph;
}

function reachableFrom(graph: Map<string, Set<string>>, entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const target of graph.get(file) ?? []) stack.push(target);
  }
  return seen;
}

/**
 * KNOWN, JUSTIFIED ORPHANS. Ordered by directory. Adding a line here is a
 * deliberate act that says "unreached on purpose, and here is why" — which is
 * reviewable. Deleting a line because the module got wired is the happy path.
 */
const ALLOWED_ORPHANS: Readonly<Record<string, string>> = {
  // --- Deliberately OFF in the product, not broken ---------------------------
  // The Sovereign/governance module is staged behind a visibly disabled menu
  // entry ("wkrótce") by an explicit product decision recorded in
  // MASTER_PRIORITY_GENESIS.md ("Cyber/GOV pozostaje OFF main"). Wiring it
  // would ship a capability the menu says does not exist yet.
  'core/governance/index.ts': 'Sovereign staged OFF by product decision; menu badges it "wkrótce".',
  'core/governance/approval.ts': 'Same Sovereign staging decision.',
  'core/governance/audit.ts': 'Same Sovereign staging decision.',
  'core/governance/capabilities.ts': 'Same Sovereign staging decision.',
  'core/governance/decision.ts': 'Same Sovereign staging decision.',

  // --- Not browser code at all ----------------------------------------------
  // `.node.ts` transports and the compute server entry run in Node, on the
  // backend side of the boundary. They are unreachable from main.tsx BY
  // DESIGN — reaching them from the browser bundle would be the bug.
  'core/compute/serverEntry.ts': 'Node-side entry point; never imported by the browser bundle.',
  'core/repro/reproEntry.node.ts': 'Node-side facade for scripts/repro-demo.mjs (P3.2 one-command reproducibility pack); bundled by esbuild --platform=node and never imported by the browser bundle. It computes nothing of its own -- it calls runExternalAnchor and runAutonomousInquiry and returns what they returned.',
  'core/agent/causalInference.ts': 'CAP-2 (docs/B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md) -- a new, general-purpose DiD/ITS/synthetic-control estimator library, built and TDD-verified against simulated panels before any real B1 data was pulled. Deliberately NOT yet wired into any UI: the B1 experiment itself (real DEFRA/AURN data, preregistration, execution, evidence classification) is still in progress. Reached today only by its own test suite (causalInference.test.ts); remove this entry once B1 wires it into the existing backend/service or Evidence path, mirroring qe4BrydgesAnalysis.ts\'s own orphan-then-wired history.',
  'core/agent/qe4RegimeInquiryLoop.ts': 'Discovery Engine P0-2/P0-3/P0-5, canonical after D-026: the QE4 regime inquiry loop. Reached at runtime by core/repro/reproEntry.node.ts -> scripts/repro-demo.mjs (4 real checks incl. all 7 rounds\' replay fingerprints), which is the Node side of the boundary and therefore not reachable from main.tsx by design -- the same category as the other .node.ts entries here. Remove this entry once a browser screen renders a discovery campaign.',
  'core/agent/modelSpace.ts': 'Discovery engine PHASE 2: the generic model grammar (enumerate/mutate/fit/fingerprint model FORMS). Reached at runtime through core/repro/reproEntry.node.ts -> scripts/repro-demo.mjs, which is the Node side of the boundary; no browser screen renders a campaign yet.',
  'core/agent/residualStructure.ts': 'Discovery engine PHASE 3: names structure in a model\'s residuals and derives new candidate models from it. Same Node-side reachability as modelSpace.ts.',
  'core/agent/observationGap.ts': 'Discovery engine M1: the record and classification for "no attached experiment can discriminate — here is the measurement I do not have". Imported by core/agent/discoveryCampaign.ts, so it shares that module\'s Node-side reachability through core/repro/reproEntry.node.ts -> scripts/repro-demo.mjs (5 checks over the real Brydges window); no browser screen renders a campaign yet.',
  'core/agent/discoveryCampaign.ts': 'Discovery engine PHASE 4/5: the generic autonomous campaign loop. Verified at runtime by scripts/repro-demo.mjs (8 checks over two real laboratories); no browser screen renders a campaign yet.',
  'core/agent/falsifiedModelRegistry.ts': 'M2 — Global Falsified-Model Registry: cross-campaign consultation/append-only log of falsified model fingerprints, imported (statically, so reachable via the same chain) by discoveryCampaign.ts behind its opt-in `respectFalsifiedModelRegistry` option. Same Node/test-only reachability as its three discovery-engine siblings above; no browser screen renders a campaign yet.',
  'core/agent/integrityGates.ts': 'F2/F5 — Government Research mode integrity gates (temporal-lineage and excluded-basis-smuggling checks, plus the hold-out diagnostic), imported (statically, unconditional) by discoveryCampaign.ts. Same Node/test-only reachability as its discovery-engine siblings above; no browser screen renders a campaign yet.',
  'core/agent/sovereignTruthAnswer.ts': 'Sovereign Truth-Answer Protocol v1 — Government Research plane: Question Router, AnswerRecord, Template Enforcer, machine-enforced Assertions. Standalone (no discoveryCampaign.ts dependency; reuses tautologyGate.ts/knowledge/supplementalRegistry.ts/dataProvenance.ts/matrixFoundation/replayVerdict.ts/events/hash.ts). Reached today only by its own test suite (sovereignTruthAnswer.test.ts); no browser screen or NL command routes to it yet — out of this task\'s explicit scope (Government Research plane only, no Phase B/Streams/Lucy).',
  'core/biotechData/campaignLabs.ts': 'Discovery engine PHASE 7/8: the two laboratory adapters (pinned QE4 quantum data; pinned NASA NSSDC planetary data) the campaign runs against. Same Node-side reachability.',
  'core/discovery/molecular/compoundLookupTransport.node.ts': 'Node-side transport; the browser uses the HTTP path.',
  'core/discovery/molecular/rdkitTransport.node.ts': 'Node-side RDKit transport; the browser uses the HTTP path.',

  // --- Executable documentation ---------------------------------------------
  // The graphics `examples/` are runnable reference scenes for the kit, kept
  // beside it on purpose. A product screen importing one would be a product
  // screen rendering a demo.
  'core/three/graphics/examples/heroApparatusExample.ts': 'Runnable reference scene for the graphics kit, not product UI.',
  'core/three/graphics/examples/worldEnvironmentExample.ts': 'Runnable reference scene for the graphics kit, not product UI.',
  'core/three/graphics/examples/worldFrameExample.ts': 'Runnable reference scene for the graphics kit, not product UI.',

  // --- Barrels ---------------------------------------------------------------
  // Re-export barrels whose consumers import the concrete modules directly.
  // Unreached barrels cost nothing and removing them would churn imports.
  'core/discovery/index.ts': 'Re-export barrel; consumers import the concrete modules directly.',
  'core/worldModel/index.ts': 'Re-export barrel; consumers import the concrete modules directly.',
  'core/hazard/index.ts': 'Re-export barrel; consumers import the concrete modules directly.',
  'core/hazard/earthquake/index.ts': 'Re-export barrel; consumers import the concrete modules directly.',

  // --- Superseded: a live module already does this job ------------------------
  // Keeping these listed rather than deleting them is a judgement call, not an
  // oversight: each is tested, and the replacement is named here so the next
  // reader does not have to rediscover which one is live.
  'core/world/firstPerson.ts': 'Superseded by core/three/firstPersonController.ts, which all three first-person screens use.',
  'core/worldModel/domains/genesisCityWorld2.ts': 'An earlier city composition; the live path is genesisScientificCity3/4.ts through createScientificWorld.',
  'core/events/epidemicTransmissionAnalysis.ts': 'Superseded by contacts/clusterAnalysis.ts + simulation/worldEngineContract.ts::computeHotspots, both already on City3DWebGLScreen; its infection.transmission events are never produced in production.',
  'core/knowledge/context.ts': 'A convenience wrapper that never gained a caller — experimentFabric/router.ts reads findSupplementalKnowledge directly.',

  // --- Libraries waiting for a first caller -----------------------------------
  // Primitives, contracts and fingerprints. A fingerprint is never a screen's
  // subject, so "no screen shows it" is not evidence of a defect here.
  'core/events/eventTraceFingerprint.ts': 'Ordered-trace digest primitive; its consumer is a future run record, not a screen.',
  'core/matrixFoundation/headlessStepper.ts': 'Wall-clock-free stepping primitive extracted from runScenario; no first consumer yet.',
  'core/matrixFoundation/ruleSetFingerprint.ts': 'Rule-set identity digest; a provenance field on a run record, never a rendered result.',
  'core/matrixFoundation/worldStateFingerprint.ts': 'Per-entity world-state digest; a reproducibility primitive, never a rendered result.',
  'core/three/graphics/animation.ts': 'Generic non-skeletal motion driver for the graphics kit; awaiting a first caller.',
  'core/three/graphics/cameraSequence.ts': 'Shot-list executor over CameraRig; awaiting a first caller.',
  'core/world/worldEngineInterface.ts': 'The scientific half of a contract whose World Engine implementation is owned outside this package — deliberately no implementation here.',
  'core/hazard/datasetRegistry.ts': 'Metadata-only dataset catalogue that declares NOT_IMPLEMENTED; surfacing it would imply data Genesis has not acquired.',
  'core/csrn/genesisCertificateAdapter.ts': 'Genesis record -> CSRN certificate adapter; certificate issuance is a separate pipeline with no in-app entry point.',
  'core/agent/datasetLaboratory.ts': 'Discovery Engine P0.1 seam (docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md): a declared contract type, not a screen subject. Its first implementation is qe4DatasetLaboratory.ts, listed next; both await P0.2 (hypothesis generation from the dataset grid), the next scoped task, as their first real caller.',
  'core/biotechData/qe4DatasetLaboratory.ts': 'Discovery Engine P0.1: the QE4 implementation of datasetLaboratory.ts. Computes nothing itself (pure glue over qe4BrydgesAnalysis.ts, proven by its own tests) and has no caller yet because P0.2-P0.6 (the autonomous loop that will drive it) are the next scoped tasks, not yet built.',

  // --- Complete capability, blocked on a named prerequisite --------------------
  // These are the honest ones: real, tested science with nothing showing it.
  // Each line says what has to exist first, so the block is checkable.
  'core/agent/discoveryTrace.ts': 'Consumes ResearchChainResult (the PARAMETER chain); production runs only runMechanismResearchChain, a different type.',
  'core/simulationRenderer/spatialWorldFrame.ts': 'Data half of the OSM -> canonical-renderer bridge; no screen imports real licensed OSM data yet.',
  'core/three/graphics/spatialFeatureBridge.ts': 'Rendering half of the same OSM bridge, blocked by the same missing real-data entry point.',
  'core/three/shotPlanPlayer.ts': "Blocked by the contract bug its own doc records: shotPlan.ts casts 'OBSERVER', which is a member of neither camera union.",
  'core/world/moleculeWorldAdapter.ts': 'Third-domain proof of the generic WorldState contract; no screen drives a molecular run through the world layer yet.',
  'core/world/particleWorldAdapter.ts': 'Needs a DivergenceSweepResult, which only modelVsModelCompare produces — blocked behind that module.',
  'core/world/scienceDirector.ts': 'Camera/observation director over WorldState; no screen drives a world through it yet.',
};

describe('every module is reachable from the running application, or documented as not', () => {
  it('reports the real reachability of the whole frontend source tree', () => {
    const files = allSourceFiles(SRC);
    const graph = importGraph(files);
    const entries = files.filter((file) => /\/main\.tsx$/.test(file));
    expect(entries.length, 'expected exactly one browser entry point').toBe(1);

    const reachable = reachableFrom(graph, entries);
    const production = files.filter((file) => !isTest(file));
    const orphans = production.filter((file) => !reachable.has(file)).map((file) => relative(SRC, file)).sort();

    const undocumented = orphans.filter((file) => !(file in ALLOWED_ORPHANS));
    const staleAllowlistEntries = Object.keys(ALLOWED_ORPHANS).filter((file) => !orphans.includes(file)).sort();

    // eslint-disable-next-line no-console -- deliberate: the human-readable reachability record this test exists to produce.
    console.log(
      `[reachability] ${production.length - orphans.length}/${production.length} production modules reachable from main.tsx | ` +
      `${orphans.length} unreachable (${Object.keys(ALLOWED_ORPHANS).length} documented)`,
    );

    /**
     * A NEW orphan is the domeWorld failure happening again: a module that is
     * complete and invisible, with nothing to announce it. Either wire it, or
     * add it above with the reason it is legitimately unreached.
     */
    expect(undocumented, 'new unreachable module(s) — wire them, or document them in ALLOWED_ORPHANS with a reason').toEqual([]);

    /**
     * The reverse also matters: a module that got wired must leave the list,
     * or the allowlist slowly becomes a fiction that hides the next real one.
     */
    expect(staleAllowlistEntries, 'these are reachable now — delete their ALLOWED_ORPHANS entries').toEqual([]);
  });

  /**
   * The allowlist is only worth anything if every line says WHY. A one-word
   * reason is how a suppression list is born.
   */
  it('every documented orphan carries a real reason, not a placeholder', () => {
    for (const [file, reason] of Object.entries(ALLOWED_ORPHANS)) {
      expect(reason.length, `${file}: reason is too short to be a real justification`).toBeGreaterThan(30);
      expect(reason, `${file}: reason must not be a TODO`).not.toMatch(/TODO|FIXME|\?\?\?/);
    }
  });
});
