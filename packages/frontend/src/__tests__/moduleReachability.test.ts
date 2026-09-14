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
  'core/agent/structuralDiscovery.ts': 'M3 structural discovery: the runnable demonstration that the engine builds a model form it was never given, plus its three negative controls. Orchestrates existing components only (discoveryCampaign, residualStructure, modelSpace, falsifiedModelRegistry, beliefRevision, tautologyGate). Reached at runtime through core/repro/reproEntry.node.ts -> scripts/m3-demonstrator.mjs and scripts/repro-demo.mjs.',
  'core/agent/sovereignTruthAnswer.ts': 'Sovereign Truth-Answer Protocol v1 — Government Research plane: Question Router, AnswerRecord, Template Enforcer, machine-enforced Assertions. Standalone (no discoveryCampaign.ts dependency; reuses tautologyGate.ts/knowledge/supplementalRegistry.ts/dataProvenance.ts/matrixFoundation/replayVerdict.ts/events/hash.ts). Reached today only by its own test suite (sovereignTruthAnswer.test.ts); no browser screen or NL command routes to it yet — out of this task\'s explicit scope (Government Research plane only, no Phase B/Streams/Lucy).',
  'core/benchmark/types.ts': 'A10 external-benchmark harness — generic types (BenchmarkCase/Dataset/Runner/Score/Result). Reached at runtime through core/repro/reproEntry.node.ts -> scripts/repro-demo.mjs, the same Node-side boundary as the discovery-engine modules above; no browser screen runs a benchmark yet.',
  'core/benchmark/benchmarkRunner.ts': 'A10 — generic runner: dataset integrity/checksum, duplicate-case and ordering guards, score summarization, provenance/fingerprint assembly, replay comparison. Same Node-side reachability as core/benchmark/types.ts.',
  'core/benchmark/discoveryBenchManifest.ts': 'A10 — the FROZEN case manifest for DiscoveryBench\'s real evolution_freshwater_fish task family (4 cases, frozen before any Genesis run). Same Node-side reachability.',
  'core/benchmark/discoveryBenchFixtureData.ts': 'A10 — the real DiscoveryBench CSV fixture embedded as a TS literal (same convention as core/biotechData/*\'s pinned datasets), so this benchmark never depends on a filesystem read at runtime. Same Node-side reachability.',
  'core/benchmark/discoveryBenchAdapter.ts': 'A10 — translates the frozen DiscoveryBench fixture into Genesis\'s own ModelPoint/CampaignLaboratory shapes and reads results back out via fitModelSpec/runDiscoveryCampaign, unmodified. Same Node-side reachability.',
  'core/benchmark/discoveryBenchScorer.ts': 'A10 — judges each frozen case\'s expected rule against Genesis\'s two real facets; DiscoveryBench\'s own LLM-judged HMS metric is NO_ACCESS in this sandbox (no private API key) — see discoveryBenchManifest.ts. Same Node-side reachability.',
  'core/benchmark/discoveryBenchRun.ts': 'A10 — the one E2E entry point (load -> freeze -> run -> evaluate -> score -> provenance -> fingerprint). Reached at runtime by core/repro/reproEntry.node.ts -> scripts/repro-demo.mjs; no browser screen runs a benchmark yet.',
  'core/agent/conformalPrediction.ts': 'A8 — Conformal Uncertainty Layer: split conformal prediction intervals for a fitted ModelFit, plus an M1 extension (classifyConformalObservationGap) that feeds a conformal-interval-derived discriminability into the existing classifyObservationGap unchanged. Reused infra only: fitModelSpec/ModelFit (modelSpace.ts), fnv1a/canonicalJson (events/hash.ts), makeRng (epidemic/agents.ts), classifyObservationGap (observationGap.ts), computeReplayVerdict (matrixFoundation/replayVerdict.ts). Reached at runtime by core/repro/reproEntry.node.ts -> scripts/repro-demo.mjs, the Node side of the boundary; no browser screen renders a calibrated interval yet.',
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
  'core/biotechData/qe4DatasetLaboratory.ts': 'Discovery Engine P0.1: the QE4 implementation of datasetLaboratory.ts. Computes nothing itself (pure glue over qe4BrydgesAnalysis.ts, proven by its own tests) and has no caller yet because P0.2-P0.6 (the autonomous loop that will drive it) are the next scoped tasks, not yet built.',
  'core/biotechData/domainAdapterRegistry.ts': 'Phase E, Krok 4/7: the real QE4 + Kepler DomainAdapter demonstrator pair, wrapping campaignLabs.ts::makeQe4CampaignLab/makeKeplerCampaignLab unmodified. Same reachability status and future caller as core/agent/domainAdapter.ts above.',
  'core/agent/bannedStringScanner.ts': 'Phase E, Krok 7/7 (E6 Multilingual, Rule 2 truth-engine i18n): the generic, reusable, 3-language banned-string scanner the audit confirmed did not exist (govDrugDiscoveryE2E.ts has its own EN/PL-only local one, left unmodified — a shipped, tested government feature, not touched by this mandate). Proven per-language (TE7.2): EN/PL/AR banned phrases each caught, a hit hidden in only one language still caught by scanAllLocales, clean text produces zero hits in all 3. 10/10 tests (bannedStringScanner.test.ts). Reached today only by its own tests — a future caller (this repo\'s next truth-engine feature, or a retrofit of govDrugDiscoveryE2E.ts) is the intended wiring point.',
  'core/agent/discoveryContracts.ts': 'Phase F, Krok 1-2 (genuine-discovery layer on top of Phase E): DiscoveryStatus taxonomy (extends noveltyGate.ts\'s ResultLabel with KNOWN_RESULT/EXTENSION/NOVEL_HYPOTHESIS/DISCOVERY_CANDIDATE/CONFLICTING_EVIDENCE/FAILED_DISCOVERY) + classifyDiscoveryStatus/assertValidDiscoveryStatus, the master gate an AC1-13 anti-cheating battery exercises BEFORE the engines that would produce real inputs are built. 19/19 tests (discoveryContracts.test.ts). Its real caller is the Phase F Krok 10 E2E-01 demonstrator (not yet built). Remove this entry once that wires it in.',
  'core/agent/discoveryReplicationEngine.ts': 'Phase F, Krok 3: independent replication with freeze-before-access (AC7) and dataset-disjointness/contamination checks (AC5/AC6) enforced, not just documented — reuses modelSpace.ts::fitModelSpec unmodified, adds two real deterministic adversarial re-fits (label-shuffle, half-split). 12/12 tests. Same future caller as discoveryContracts.ts above (Krok 10 E2E-01).',
  'core/agent/literatureNoveltyAdapter.ts': 'Phase F, Krok 4 (Novelty L5/L6): real OpenAlex/Crossref clients + aggregation logic. Krok 0 audit found this sandbox\'s network policy blocks both (and even ChEMBL/ClinicalTrials.gov, which worked earlier this session via a separate CI job) -- confirmed again here at runtime by a live test against the real client with no injected fetch, which genuinely gets NO_ACCESS. Parsing/aggregation logic fully exercised via injected fake clients (14/14 tests). Same future caller as discoveryContracts.ts above.',
  'core/agent/selfFalsificationBattery.ts': 'Phase F, Krok 5: all 13 mandated probes, always run together. TAUTOLOGY/OVERFITTING/DATASET_CONTAMINATION/HIDDEN_PREREG reuse tautologyGate.ts/modelSpace.ts/discoveryReplicationEngine.ts verbatim; ALTERNATIVE_MODEL and MULTIPLE_TESTING are new but mechanical (rival-model RSS comparison, declared-correction check); the remaining 7 (SELECTION_BIAS/LEAKAGE/CONFOUNDING/MEASUREMENT_ARTIFACT/NUMERICAL_ARTIFACT/PREPROCESSING_ARTIFACT/TEMPORAL_LEAKAGE) are honest STRUCTURAL_REVIEW probes over caller-declared fields -- undeclared reports UNRESOLVED, never silently assumed clean. 22/22 tests. Same future caller as discoveryContracts.ts above.',
  'core/agent/novelHypothesisGenerator.ts': 'Phase F, Krok 6 (scoped down from the mandate\'s full 13-source OpenEndedDirectionFinder + NovelHypothesisGenerator -- disclosed honestly rather than padded: directionFinder.ts\'s existing 4 sources from Phase E were reused unchanged, not expanded to 13). generateNovelHypothesis wraps a real beliefRevision.ts::Hypothesis (createHypothesis, unmodified) and REFUSES to construct one missing a mechanism, >=1 competing explanation, a falsifier, or a required experiment. Ceiling is NOVEL_HYPOTHESIS -- never promotes itself. 8/8 tests. Same future caller as discoveryContracts.ts above.',
  'core/agent/genuineDiscoveryOrchestrator.ts': 'Phase F, Krok 8+10 (the capstone): composes Kroki 1/3/4/5 around a real Phase E OrchestratorCampaignRecord into the discovery track (novelty L1-L6 -> replication -> self-falsification -> DiscoveryStatus). Proven on real Kepler (REPRODUCTION, overall=KNOWN, matches repro-demo\'s own f4804820) and real QE4 (THE core Phase F finding: Phase E\'s own noveltyGate.ts alone labels this DISCOVERY from internal checks only; this module, requiring external L5/L6 verification first, downgrades the SAME campaign to UNKNOWN once literature search is confirmed unreachable -- never lets an unverified internal-only DISCOVERY through). 5/5 tests plus scripts/genuine-discovery-e2e-01.mjs (8/8). Reached today by its own test suite and that demonstrator; no browser screen uses it. Krok 7 (discovery strategies A-G) and Krok 9 (benchmark suite) were NOT built this session -- disclosed, not silently skipped.',

  'core/biotechData/surpass2DirectEvidence.ts': 'Mandate step 3: exposes the three tirzepatide arms of SURPASS-2 (NCT03987919) that were already pinned in this repository but unreachable as candidate-side observations, which is the structural cause of the D-042 defect. 15/15 tests. NOW REACHED IN PRODUCTION (D-046): core/biotechData/a2Surpass2ReAdjudication.ts imports SURPASS2_STUDY from here to record source-study identity/sha256 in its frozen record, and scripts/gov-drug-a2-surpass2-readjudication.mjs runs it end to end (Node-side, same non-browser boundary as other script-reached Phase E/F modules above) -- no browser screen renders it yet. This entry stays documented because the reach is script-only, matching this file\'s own convention for Node-only modules.',
  'core/biotechData/a2Surpass2ReAdjudication.ts': 'Mandate step 8/9 (D-046): the SURPASS-2 re-adjudication. Reuses extractCandidateSafety/falsifyCandidate/scoreCandidate/decideA2Verdict UNMODIFIED; scope is safety-only for tirzepatide\'s diarrhea category, efficacy untouched, dose-selection rule (highest dose) and the 1.0 threshold both read from existing code/preregistration, never redefined. Result: the diarrhea veto (RR 2.71, n=16) is superseded by a direct SURPASS-2 comparison (RR 1.20, CI includes 1, n=470) -- but the candidate stays vetoed, because the same trial independently promotes a DIFFERENT category (structural serious-AE, RR 2.07 direct) past the threshold; the overall A2 verdict (CONFLICTING_EVIDENCE) is unchanged. Both OLD and NEW results are returned separately, nothing overwritten. 12/12 tests plus scripts/gov-drug-a2-surpass2-readjudication.mjs (6/6 invariants). Reached only by its own test and that script -- no browser screen or other caller yet.',
  'core/biotechData/a2AdjudicationReferenceImplementation.ts': 'Reference implementation #1 of the Genesis Adjudication Protocol (D-047), re-running the exact SURPASS-2/tirzepatide case (D-042 through D-046) through the phase machine. Delegates ALL decision logic to the pre-existing, unmodified runA2Analysis / runReAdjudication (transitively extractCandidateSafety / falsifyCandidate / scoreCandidate / decideA2Verdict) -- adds zero new veto rules and zero new scoring. Genuinely wires in evidenceProvenance.ts::classifyComparisonEvidenceClass for the audit-layer evidence-class annotation (decision-inert: it never feeds falsifyCandidate). 10/10 tests, including a source-text cross-check that the imports this file claims (protocol module, evidenceProvenance.ts, a2Surpass2ReAdjudication.ts) are genuinely present, not merely described. Reached by scripts/genesis-adjudication-protocol-demo.mjs -- no browser screen yet.',
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

  // --- Phase G, Scientific Proof Ladder (P0-P10): NOT wired into the React
  // app yet — no screen renders a certificate. Real runtime evidence exists
  // via `npm run proof-ladder:demo` (scripts/proof-ladder-demonstrator.mjs),
  // which issues real certificates for the already-verified Kepler
  // (f4804820) and QE4 (44f245c9) campaigns, exercises the prediction
  // registry and the blind-dataset access guard against real QE4 point data,
  // and prints both certificates -- 10/10 properties held. Intended future
  // caller: a screen or the GDD/genuine-discovery orchestrators issuing a
  // certificate as part of their own output, not yet built.
  'core/agent/proofLadder.ts': 'Phase G Proof Ladder P0-P10 status computer; runtime evidence via npm run proof-ladder:demo, not yet wired into a screen.',
  'core/agent/blindDataset.ts': 'Phase G blind-access enforcement (the real access-layer freeze-token guard the design called for); runtime evidence via npm run proof-ladder:demo, not yet wired into a screen.',
  'core/agent/causalLadder.ts': 'Phase G Proof Ladder P9 (causal gate over the real causalInference.ts DiD/ITS/synthetic-control methods); covered by 10 unit tests against real CausalFitResult shapes, not yet wired into a live causal claim.',
  'core/agent/discoveryCertificate.ts': 'Phase G GenesisDiscoveryCertificate v2; runtime evidence via npm run proof-ladder:demo, not yet wired into a screen.',

  // --- Physics World integration (D-052) --------------------------------------
  // A hardening/integration pass over an externally authored bundle: toy
  // particle/atomic/molecular/high-energy models, wired to the existing
  // Genesis hash provider (fnv1a) and the D-047 Genesis Adjudication
  // Protocol for its DEMO5 hypothesis test. Reached today by its own vitest
  // suites (physicsWorld.test.ts, physicsRecipe.test.ts) and
  // scripts/physics-world-demo.mjs (npm run physics-world:demo) -- no
  // browser screen renders a physics-world run yet. Remove these entries
  // once a screen wires runExperiment/demo5GenesisLoop/buildPhysicsRecipe in.
  'core/physicsWorld/contracts.ts': 'Physics World integration (D-052); reached only by its own test suites and scripts/physics-world-demo.mjs, no screen yet.',
  'core/physicsWorld/core.ts': 'Physics World integration (D-052); same reach as contracts.ts.',
  'core/physicsWorld/backends.ts': 'Physics World integration (D-052); same reach as contracts.ts. PYTHIA/Geant4/external-matter backends are fail-closed contracts only, by design (mandate item 7) -- detectBackends() never reports them available.',
  'core/physicsWorld/models.ts': 'Physics World integration (D-052); same reach as contracts.ts. Toy models ported from the source bundle unchanged.',
  'core/physicsWorld/experiment.ts': 'Physics World integration (D-052); same reach as contracts.ts.',
  'core/physicsWorld/genesisAdapter.ts': 'Physics World integration (D-052); DEMO5 rewired through core/agent/genesisAdjudicationProtocol.ts (D-047) rather than a bespoke verdict function -- no second adjudication engine. Same reach as contracts.ts.',
  'core/physicsWorld/physicsRecipe.ts': 'Physics World integration (D-052); domain-scoped Research Recipe projection (WinnerRecord + gates G1-G9), matching the existing per-domain pattern (govDrugDiscoveryE2E.ts::generateResearchRecipe is the other one) rather than a shared cross-domain recipe engine. Same reach as contracts.ts.',

  // --- DOBUDOWANIE RESZTY MASZYNY (D-057): Evidence Connectors, Commercial
  // Layer, Physics Backend version registry, Winner Promotion Gate ----------
  'core/physicsWorld/backendRegistry.ts': 'D-057 Physics Backend version registry: extends backends.ts::detectBackends() with a minimum-version floor (BackendDescriptor/requireBackendVersion), same reach status as backends.ts itself -- no screen calls a real physics backend yet (PYTHIA/Geant4 are not installed in this pass), so this stays reached only by its own test suite (physicsBackendRegistry.test.ts). Remove this entry once a real experiment call site wires requireBackendVersion in.',
  'core/evidenceConnectors/testFixtures.ts': 'D-057 Evidence Connectors: explicitly-named TEST-ONLY ConnectorPort fixtures (fixedBytesPort/alwaysFailingPort), same convention as core/orchestrator/toyAdapters.ts\'s SYNTHETIC_TEST_ONLY naming -- deliberately never imported by product UI (EvidenceSourceStatusPanel.tsx uses the real httpConnectorPort.ts instead). Reached only by evidenceConnectors.test.ts.',
  'core/commercial/testFixtures.ts': 'D-057 Commercial Layer: explicitly-named TEST-ONLY PaymentAdapter fixtures (alwaysConfirmingAdapter/alwaysRefusingAdapter) -- this repo ships no real payment processor, so no product UI imports these; they exist solely so commercial.test.ts can exercise the PAID path. Reached only by commercial.test.ts.',
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
