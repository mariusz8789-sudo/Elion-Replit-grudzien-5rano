/**
 * ONE BRAIN — architectural invariants (docs/genesis1/ONE-BRAIN.md).
 *
 * Genesis has exactly one canonical scientific loop:
 *
 *   Science Chat / Research Intake -> ResearchRun -> hypotheses -> preregistration
 *   -> experiments -> engines -> falsification -> Evidence -> Replay -> DecisionTrace
 *   -> next justified experiment -> lab handoff -> observation -> human review
 *
 * Virtual Lab, the campaign discovery loop, Worlds, literature, engines, workers and the UI are
 * TOOLS of that loop, not second brains. Every test below fails if a second path appears or an
 * old one comes back. They are deliberately STATIC source checks, not behavioural ones: a second
 * path is a wiring fact, and wiring is what regresses. A test that only exercised today's call
 * graph would stay green while a new module quietly minted its own evidence.
 *
 * HOW TO CHANGE ONE OF THESE. The allowlists are the architecture, not an inconvenience. Adding a
 * name to one is a decision: record it in docs/DECISIONS.md and say which authority it belongs to.
 * If a test fails because you moved code, move the allowlist entry; if it fails because you added a
 * second writer, that is the test doing its job.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SRC, '../../..');

/** Every production (non-test) .mjs under packages/backend/src, as a repo-relative POSIX path. */
function productionModules(dir = SRC, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules' && name !== 'fixtures') productionModules(full, out);
      continue;
    }
    if (!name.endsWith('.mjs')) continue;
    if (name.includes('.test.') || name.endsWith('.test.mjs')) continue;
    out.push(path.relative(REPO, full).split(path.sep).join('/'));
  }
  return out;
}

const MODULES = productionModules();
const SOURCE = new Map(MODULES.map((rel) => [rel, readFileSync(path.join(REPO, rel), 'utf8')]));

/** Modules whose source mentions `needle`, excluding the module that defines it. */
function mentions(needle, { except = [] } = {}) {
  const skip = new Set(except);
  return MODULES.filter((rel) => !skip.has(rel) && SOURCE.get(rel).includes(needle)).sort();
}

/** Modules that `import ... from '<...>/<basename>'`, resolved by basename (the repo has no duplicates). */
function importersOf(basename, { except = [] } = {}) {
  const skip = new Set(except);
  const re = new RegExp(`from\\s+'[^']*/?${basename.replace('.', '\\.')}'`);
  return MODULES.filter((rel) => !skip.has(rel) && re.test(SOURCE.get(rel))).sort();
}

/**
 * Modules that IMPORT the named binding. Stricter than `mentions`: a module that only names a symbol
 * in a comment is documenting the architecture, not joining it, and must not trip an invariant.
 */
function importersOfSymbol(symbol, { except = [] } = {}) {
  const skip = new Set(except);
  const re = new RegExp(`import\\s*(?:\\w+\\s*,\\s*)?\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, 's');
  return MODULES.filter((rel) => !skip.has(rel) && re.test(SOURCE.get(rel))).sort();
}

const report = (actual, allowed, what) => `${what}\n  allowed: ${allowed.join(', ') || '(none)'}\n  actual:  ${actual.join(', ') || '(none)'}`;

// ---------------------------------------------------------------------------
// INVARIANT 1 — ONE EVIDENCE PATH
// ---------------------------------------------------------------------------

describe('INVARIANT: one Evidence path', () => {
  const LEDGER = 'packages/backend/src/knowledgeApi.mjs';

  it('there is exactly one Evidence ledger, opened only as a process bootstrap', () => {
    // A second Evidence path would most likely arrive as a second ledger. Opening the one ledger is a
    // process concern (the server, and the isolated child process that executes an experiment with no
    // server around it); nothing in the scientific loop may open one of its own.
    const allowed = ['packages/backend/src/researchRunChild.mjs', 'packages/backend/src/server.mjs'];
    const actual = importersOfSymbol('openKnowledgeLedgerPersistence', { except: [LEDGER] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module opens an Evidence ledger. Second Evidence store?'));
  });

  it('the set of production modules that may propose Evidence is a closed, justified list', () => {
    // Four call sites, one per real source of a scientific observation. Each is a BRIDGE into the
    // single ledger seam, never its own ledger:
    //   researchRunExecution.mjs  the canonical loop's own experiment result (the default path)
    //   researchRunLab.mjs        an external-lab observation bound to a ResearchRun, after human review
    //   api.mjs                   the HTTP routes that carry a reviewed lab / virtual-lab result in
    //   campaign/virtualLabClosedLoop.mjs  in-silico result -> NewEvidenceInput (it builds the input
    //                             only; api.mjs performs the propose, see the module header)
    const allowed = [
      'packages/backend/src/api.mjs',
      'packages/backend/src/campaign/virtualLabClosedLoop.mjs',
      'packages/backend/src/knowledgeApi.mjs',
      'packages/backend/src/researchRunExecution.mjs',
      'packages/backend/src/researchRunLab.mjs',
    ];
    const actual = mentions('proposeStructuredEvidence');
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module proposes Evidence. Second Evidence path?'));
  });

  it('the campaign discovery loop may not propose Evidence (it is a tool, not a brain)', () => {
    const orchestrator = SOURCE.get('packages/backend/src/campaign/orchestrator.mjs');
    assert.ok(orchestrator, 'campaign/orchestrator.mjs must exist for this invariant to mean anything');
    assert.ok(
      !orchestrator.includes('proposeStructuredEvidence'),
      'campaign/orchestrator.mjs::runCampaign proposed Evidence. The campaign loop produces Scientific Runs; '
      + 'Evidence is proposed by the ResearchRun loop (or by a reviewed lab/virtual-lab observation), never here.',
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 2 — ONE REPLAY AUTHORITY
// ---------------------------------------------------------------------------

describe('INVARIANT: one Replay authority', () => {
  const VERIFY = 'packages/backend/src/campaign/verify.mjs';

  it('campaign/verify.mjs is the only module that re-runs a capability to compare it', () => {
    const replayers = mentions('replayCapabilityInputs', { except: [VERIFY] })
      // genesisVerify.mjs is the customer-facing report; it CALLS the replayer, it does not own one.
      .filter((rel) => !SOURCE.get(rel).includes(`from './campaign/verify.mjs'`) && !SOURCE.get(rel).includes(`from './verify.mjs'`));
    assert.deepEqual(
      replayers,
      [],
      report(replayers, [], 'A module names the replayer without importing campaign/verify.mjs. Second replay implementation?'),
    );
  });

  it('every replay consumer imports the one replayer, and the list is closed', () => {
    const allowed = [
      'packages/backend/src/api.mjs',
      'packages/backend/src/campaign/virtualLabClosedLoop.mjs',
      'packages/backend/src/genesisVerify.mjs',
      'packages/backend/src/researchRunExecution.mjs',
    ];
    const actual = importersOf('verify.mjs', { except: [VERIFY] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module replays. Second Replay authority?'));
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 3 — ONE DECISIONTRACE AUTHORITY
// ---------------------------------------------------------------------------

describe('INVARIANT: one DecisionTrace authority', () => {
  it('buildDecisionTrace is called from the canonical loop only', () => {
    const allowed = ['packages/backend/src/researchRunExecution.mjs'];
    const actual = mentions('buildDecisionTrace', { except: ['packages/backend/src/decisionTrace.mjs'] });
    assert.deepEqual(
      actual,
      allowed,
      report(actual, allowed, 'Only the ResearchRun loop justifies the next experiment with a DecisionTrace.'),
    );
  });

  it('the campaign loop\'s own next-experiment decider never produces a DecisionTrace', () => {
    // campaign/nextExperiment.mjs::analyzeAndDecide picks the next GENERATION inside one campaign.
    // That is a tool-level choice. The loop-level "next justified experiment" is the ResearchRun's,
    // and it is the only one that is traced, replayed and shown to a human. If analyzeAndDecide ever
    // starts writing DecisionTraces, Genesis has two brains deciding what to do next.
    const decider = SOURCE.get('packages/backend/src/campaign/nextExperiment.mjs');
    assert.ok(decider, 'campaign/nextExperiment.mjs must exist for this invariant to mean anything');
    for (const forbidden of ['buildDecisionTrace', 'proposeStructuredEvidence', 'researchRun']) {
      assert.ok(
        !decider.includes(forbidden),
        `campaign/nextExperiment.mjs now references ${forbidden}: the campaign loop is becoming a second brain.`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 4 — ONE ENGINE AUTHORITY FOR THE RESEARCHRUN LOOP
// ---------------------------------------------------------------------------

describe('INVARIANT: one engine authority', () => {
  const ENGINES = 'packages/backend/src/researchRunEngines.mjs';

  it('RESEARCH_RUN_EXECUTORS is the single table that says which engine runs an experiment', () => {
    // researchRunExecution.mjs reaches the same table through DEFAULT_RESEARCH_TOOLS (researchRunEngines.mjs:210),
    // which is the injectable seam the tests and the remote worker substitute. Nobody else may read it raw.
    const allowed = [
      'packages/backend/src/genesisVerify.mjs',
      'packages/backend/src/remoteEngineChild.mjs',
      'packages/backend/src/remoteWorker.mjs',
      'packages/backend/src/remoteWorkerApi.mjs',
    ];
    const actual = importersOfSymbol('RESEARCH_RUN_EXECUTORS', { except: [ENGINES] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module reads the executor table.'));
    assert.ok(
      SOURCE.get(ENGINES).includes('export const DEFAULT_RESEARCH_TOOLS = Object.freeze({ executors: RESEARCH_RUN_EXECUTORS'),
      'DEFAULT_RESEARCH_TOOLS must be built from RESEARCH_RUN_EXECUTORS, so the default loop and the remote worker share one table.',
    );
  });

  it('the remote worker runs the SAME executor table as the in-process one', () => {
    // This is what makes the remote worker a worker and not a second engine authority: it cannot
    // choose, substitute or invent an engine. It advertises which of the canonical engines it has.
    for (const rel of [
      'packages/backend/src/remoteWorkerApi.mjs',
      'packages/backend/src/remoteWorker.mjs',
      'packages/backend/src/remoteEngineChild.mjs',
    ]) {
      const src = SOURCE.get(rel);
      assert.ok(src, `${rel} must exist`);
      assert.ok(
        /from\s+'\.\/researchRunEngines\.mjs'/.test(src),
        `${rel} must import RESEARCH_RUN_EXECUTORS from researchRunEngines.mjs, never define its own engine set.`,
      );
    }
  });

  it('the ResearchRun loop never decides engine PLACEMENT through the capability router', () => {
    // Two placement deciders exist on purpose and must not meet:
    //   routeCapability (compute/remoteScientificWorkerClient.mjs)  Virtual Lab / replay capabilities,
    //                                                              LOCAL vs a configured private worker
    //   researchRunJobs.mjs RESEARCH_REMOTE_CAPABILITY              a ResearchRun experiment, in-process
    //                                                              vs the pull-model remote worker
    // If a researchRun* module ever calls routeCapability, there are two answers to "where does this
    // experiment run" for the same experiment, and the lease queue stops being the single truth.
    const offenders = MODULES
      .filter((rel) => /\/(researchRun|remoteWorker|remoteEngineChild)[^/]*\.mjs$/.test(rel))
      .filter((rel) => SOURCE.get(rel).includes('routeCapability'));
    assert.deepEqual(
      offenders,
      [],
      report(offenders, [], 'A ResearchRun/remote-worker module calls routeCapability. Two engine-placement authorities.'),
    );
  });

  it('only one module may serve the remote-worker HTTP API', () => {
    const allowed = ['packages/backend/src/remoteWorker.mjs', 'packages/backend/src/server.mjs'];
    const actual = mentions('WORKER_API_PREFIX', { except: ['packages/backend/src/remoteWorkerApi.mjs'] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A second module routes /api/worker/v1.'));
    assert.ok(
      SOURCE.get('packages/backend/src/server.mjs').includes('handleRemoteWorkerApi'),
      'server.mjs must dispatch /api/worker/v1 to remoteWorkerApi.mjs::handleRemoteWorkerApi.',
    );
  });

  it('the in-process worker and the remote worker cannot claim the same job', () => {
    // Without this filter two workers race for one frozen experiment and the run could be executed twice.
    const jobs = SOURCE.get('packages/backend/src/researchRunJobs.mjs');
    assert.ok(
      /claimFilter:\s*\{\s*excludeCapabilities:\s*\[RESEARCH_REMOTE_CAPABILITY\]\s*\}/.test(jobs),
      'createResearchRunWorker must exclude RESEARCH_REMOTE_CAPABILITY from its claim filter, '
      + 'so a remote-only job is never also claimed in-process.',
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 5 — NO ORPHANED SECOND EXECUTION PATH
// ---------------------------------------------------------------------------

describe('INVARIANT: no orphaned second execution path into the loop', () => {
  // compute/{openmm,pyscf,vina}ResearchRunExecutor.mjs are named as if they were the ResearchRun
  // executor. They are NOT: they hold canonical engine reference cases and are reached from their
  // own tests only. They are kept for those cases (see docs/genesis1/ONE-BRAIN.md, RED-1), but they
  // must stay out of the loop: if the loop ever imported them there would be two definitions of
  // "how a ResearchRun runs an engine".
  const ORPHANS = ['openmmResearchRunExecutor.mjs', 'pyscfResearchRunExecutor.mjs', 'vinaResearchRunExecutor.mjs', 'localCanonicalScientificExecutor.mjs'];

  for (const orphan of ORPHANS) {
    it(`${orphan} is not reachable from the ResearchRun loop or a worker`, () => {
      const offenders = importersOf(orphan)
        .filter((rel) => /\/(researchRun|remoteWorker|remoteEngineChild|api|server)[^/]*\.mjs$/.test(rel));
      assert.deepEqual(
        offenders,
        [],
        report(offenders, [], `${orphan} entered the canonical loop. Second engine-execution path.`),
      );
    });
  }

  it('admetResearchRunExecutor is used for the LICENCE gate only, not for execution', () => {
    // researchRunEngines.mjs imports admitAdmetUse from it (D-057 commercial ADMET admission).
    // Importing its execution port instead would route one engine through a second executor.
    const engines = SOURCE.get('packages/backend/src/researchRunEngines.mjs');
    const imported = engines.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/compute\/admetResearchRunExecutor\.mjs'/);
    assert.ok(imported, 'researchRunEngines.mjs must import from compute/admetResearchRunExecutor.mjs');
    const names = imported[1].split(',').map((s) => s.trim()).filter(Boolean).sort();
    assert.deepEqual(
      names,
      ['admitAdmetUse'],
      `researchRunEngines.mjs may take only the licence gate from admetResearchRunExecutor.mjs, got: ${names.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 6 — ONE IDENTITY MODEL
// ---------------------------------------------------------------------------

describe('INVARIANT: one identity model', () => {
  it('the entity record is never an input to a measurement, a gate or a verdict', () => {
    // genesisIdentity.mjs says so in its own header; this is the machine check.
    const offenders = mentions('GENESIS_IDENTITY', { except: ['packages/backend/src/genesisIdentity.mjs'] })
      .filter((rel) => /\/(researchRun|campaign\/|compute\/|genesisVerify|decisionTrace|knowledgeApi)/.test(rel));
    assert.deepEqual(
      offenders,
      [],
      report(offenders, [], 'A scientific module reads GENESIS_IDENTITY. The mission must never change a number.'),
    );
  });

  it('human identity has exactly one password/session implementation', () => {
    const allowed = ['packages/backend/src/api.mjs'];
    const actual = mentions('hashPassword', { except: ['packages/backend/src/auth.mjs'] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A second module hashes passwords.'));
  });

  it('project authorisation has exactly one role model', () => {
    const allowed = ['packages/backend/src/api.mjs'];
    const actual = mentions('accessLevelForProject', { except: ['packages/backend/src/access.mjs'] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A second module decides project access.'));
  });

  it('the two machine credentials stay in their own system and are never cross-read', () => {
    // MACHINE identity is where "one identity model" is genuinely split, and the split is recorded,
    // not hidden (docs/genesis1/ONE-BRAIN.md, RED-2):
    //   GENESIS_WORKER_TOKEN             the remote ResearchRun worker (remoteWorkerApi.mjs)
    //   GENESIS_SCIENTIFIC_WORKER_TOKEN  the private capability workers (compute/workerServer.mjs)
    // Neither may read the other's secret: one leaked token must not open both doors.
    const researchWorkerToken = mentions('GENESIS_WORKER_TOKEN');
    const capabilityWorkerToken = mentions('GENESIS_SCIENTIFIC_WORKER_TOKEN');
    const both = researchWorkerToken.filter((rel) => capabilityWorkerToken.includes(rel));
    assert.deepEqual(
      both,
      [],
      report(both, [], 'A module reads BOTH machine tokens. The two worker systems must not share a credential.'),
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 7 — ONE RESEARCHRUN SCIENTIFIC LOOP
// ---------------------------------------------------------------------------

describe('INVARIANT: one ResearchRun scientific loop', () => {
  it('executeResearchExperiment is the only place an experiment is frozen and applied', () => {
    const allowed = [
      'packages/backend/src/api.mjs',
      'packages/backend/src/remoteWorkerApi.mjs',
      'packages/backend/src/researchRunAdvance.mjs',
      'packages/backend/src/researchRunChild.mjs',
      'packages/backend/src/researchRunJobs.mjs',
    ];
    const actual = importersOfSymbol('executeResearchExperiment', { except: ['packages/backend/src/researchRunExecution.mjs'] });
    assert.deepEqual(
      actual,
      allowed,
      report(actual, allowed, 'A new caller executes a ResearchRun experiment. Every route must reach the one function.'),
    );
  });

  it('the hash-chained research state has one append primitive and a closed set of writers', () => {
    // One chain, one append function (agentRun.mjs), and every writer is a hop OF the canonical loop:
    // the run itself, its plan, its experiments, its advance, its artifacts, its datasets, its
    // literature, its lab hop, its fan-out, and the generated-analysis adapter (whose output is
    // always NOT_EVIDENCE). A writer outside this list is a second loop writing the same chain.
    const allowed = [
      'packages/backend/src/generatedScientificAnalysis.mjs',
      'packages/backend/src/researchRun.mjs',
      'packages/backend/src/researchRunAdvance.mjs',
      'packages/backend/src/researchRunArtifacts.mjs',
      'packages/backend/src/researchRunDatasets.mjs',
      'packages/backend/src/researchRunExecution.mjs',
      'packages/backend/src/researchRunFanOut.mjs',
      'packages/backend/src/researchRunLab.mjs',
      'packages/backend/src/researchRunLiterature.mjs',
    ];
    const actual = importersOfSymbol('appendServerResearchStateEvent', { except: ['packages/backend/src/agentRun.mjs'] });
    assert.deepEqual(
      actual,
      allowed,
      report(actual, allowed, 'A new module appends to the research state chain. One chain, one set of writers.'),
    );
    // No campaign/compute module may append to it at all.
    const outsiders = actual.filter((rel) => /\/(campaign|compute|literature|security)\//.test(rel));
    assert.deepEqual(outsiders, [], report(outsiders, [], 'A tool-layer module writes the research state chain.'));
  });

  it('the lab handoff reuses the campaign lab primitives instead of re-implementing them', () => {
    // researchRunLab.mjs is the loop's lab hop. campaign/labClosedLoop.mjs owns the external-lab
    // observation record and campaign/labEvidenceBridge.mjs owns the observation -> Evidence shape.
    // A re-implementation here would give Genesis two lab handoffs with two observation formats.
    const lab = SOURCE.get('packages/backend/src/researchRunLab.mjs');
    assert.ok(lab, 'researchRunLab.mjs must exist');
    assert.ok(
      /from\s+'\.\/campaign\/labClosedLoop\.mjs'/.test(lab),
      'researchRunLab.mjs must bind campaign/labClosedLoop.mjs, not define its own observation record.',
    );
    assert.ok(
      /from\s+'\.\/campaign\/labEvidenceBridge\.mjs'/.test(lab),
      'researchRunLab.mjs must use campaign/labEvidenceBridge.mjs for the observation -> Evidence shape.',
    );
  });

  it('the campaign discovery loop is a tool: it never starts, steers or advances a ResearchRun', () => {
    const offenders = MODULES
      .filter((rel) => rel.startsWith('packages/backend/src/campaign/'))
      .filter((rel) => /startResearchRun|advanceResearchRun|steerResearchRun|executeResearchExperiment/.test(SOURCE.get(rel)));
    assert.deepEqual(
      offenders,
      [],
      report(offenders, [], 'A campaign module drives a ResearchRun. The loop calls its tools; a tool never calls the loop.'),
    );
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 8 — THE BROWSER-LOCAL DEMO IS NOT EVIDENCE AND NOT REPLAY
// ---------------------------------------------------------------------------

/**
 * The 2026-10-04 audit found a complete second Evidence-and-Replay implementation living in
 * the browser under `packages/frontend/src/core/discovery/*` — its own store, its own
 * MATCH/DRIFT verdict, its own SHA-256 pack — reaching exactly one product surface, a
 * synthetic Worlds demo. It was not a second brain because of what it computed; it was a
 * second brain because of what it was CALLED.
 *
 * The owner's resolution (D-172) was to rename, not delete, and to fix the vocabulary at the
 * root: the stored state is a **LOCAL_SIMULATION_SNAPSHOT**, the re-run is a **DEMO_REPLAY**,
 * and the words "Evidence" and "Replay" no longer name anything that cluster owns. The full
 * redirect into the canonical ResearchRun loop happens ONLY once the epidemic scenario is a
 * real ResearchRun; nothing here asks for that migration now.
 *
 * This invariant reads ACROSS the package boundary on purpose. The claim being defended is not
 * about backend code: it is that a browser-local demo artefact can neither be published nor
 * read as canonical Genesis Evidence. That claim spans both packages, so the check does too,
 * and it lives beside the other seven rather than in a second invariant file.
 */
describe('INVARIANT: the browser-local demo is not Evidence and not Replay', () => {
  const FRONTEND = path.join(REPO, 'packages/frontend/src');

  /** Every .ts/.tsx under packages/frontend/src, as a repo-relative POSIX path. */
  function frontendModules(dir = FRONTEND, out = []) {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'node_modules') frontendModules(full, out);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      out.push(path.relative(REPO, full).split(path.sep).join('/'));
    }
    return out;
  }

  const FE = frontendModules();
  const FE_SOURCE = new Map(FE.map((rel) => [rel, readFileSync(path.join(REPO, rel), 'utf8')]));

  /** The demo cluster itself: the modules the audit named, under their post-D-172 names. */
  const DEMO_CLUSTER = [
    'packages/frontend/src/core/discovery/localSimulationSnapshotStore.ts',
    'packages/frontend/src/core/discovery/localSimulationSnapshotPack.ts',
    'packages/frontend/src/core/discovery/demoReplay.ts',
  ];
  const DEMO_PANEL = 'packages/frontend/src/components/visual-simulation/LocalSimulationSnapshotPanel.tsx';

  it('the renamed demo modules exist and the old Evidence/Replay-named ones are gone', () => {
    for (const rel of [...DEMO_CLUSTER, DEMO_PANEL]) {
      assert.ok(FE_SOURCE.has(rel), `${rel} must exist: the demo cluster's post-D-172 name.`);
    }
    const revived = [
      'packages/frontend/src/core/discovery/evidenceStore.ts',
      'packages/frontend/src/core/discovery/discoveryReplay.ts',
      'packages/frontend/src/core/discovery/discoveryEvidence.ts',
      'packages/frontend/src/components/visual-simulation/EvidenceReplayPanel.tsx',
    ].filter((rel) => FE_SOURCE.has(rel));
    assert.deepEqual(
      revived,
      [],
      report(revived, [], 'An Evidence/Replay-named module of the browser-local demo came back. The demo is LOCAL_SIMULATION_SNAPSHOT + DEMO_REPLAY.'),
    );
  });

  it('the demo cluster names its own artefacts LOCAL_SIMULATION_SNAPSHOT / DEMO_REPLAY and nothing else', () => {
    // The vocabulary check. A symbol the demo cluster EXPORTS may not be named with a bare
    // Evidence or Replay word: that is exactly how this became readable as a second brain.
    // `Demo*` is allowed because DEMO_REPLAY is the owner's chosen term.
    const offenders = [];
    for (const rel of [...DEMO_CLUSTER, DEMO_PANEL]) {
      const src = FE_SOURCE.get(rel);
      for (const match of src.matchAll(/^export (?:async function|function|const|class|interface|type|enum)\s+(\w+)/gm)) {
        const name = match[1];
        if (/^(Demo|DEMO_|runDemo|LocalSimulationSnapshot|LOCAL_SIMULATION_SNAPSHOT)/.test(name)) continue;
        if (/evidence/i.test(name) || /replay/i.test(name)) offenders.push(`${rel}::${name}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      report(offenders, [], 'A browser-local demo export is named Evidence or Replay. Use LOCAL_SIMULATION_SNAPSHOT / DEMO_REPLAY.'),
    );

    // Both terms must actually be present, or the rename was only a deletion of words.
    const store = FE_SOURCE.get('packages/frontend/src/core/discovery/localSimulationSnapshotStore.ts');
    assert.match(store, /LOCAL_SIMULATION_SNAPSHOT_KIND = 'LOCAL_SIMULATION_SNAPSHOT'/,
      'The store must declare the LOCAL_SIMULATION_SNAPSHOT discriminant.');
    assert.match(FE_SOURCE.get('packages/frontend/src/core/discovery/demoReplay.ts'), /export function runDemoReplay\b/,
      'The demo re-run must be runDemoReplay.');
  });

  it('a demo snapshot carries a discriminant that is not, and cannot be read as, an Evidence Pack', () => {
    const store = FE_SOURCE.get('packages/frontend/src/core/discovery/localSimulationSnapshotStore.ts');
    // Every stored record is tagged, and a record without the tag is refused by the validator.
    assert.match(store, /kind: typeof LOCAL_SIMULATION_SNAPSHOT_KIND/, 'The stored shape must carry `kind`.');
    assert.match(
      store,
      /if \(value\.kind !== LOCAL_SIMULATION_SNAPSHOT_KIND\) issues\.push/,
      'validateLocalSimulationSnapshot must reject a record that is not tagged LOCAL_SIMULATION_SNAPSHOT.',
    );
    // And it is written under its own storage key, not the old Evidence-named one.
    assert.match(store, /const STORAGE_KEY = 'local-simulation-snapshot\/v1'/, 'The demo must own its storage key.');
    assert.ok(
      !/const STORAGE_KEY = 'evidence-store\/v1'/.test(store),
      'The demo store must not write under the old Evidence-named localStorage key.',
    );
  });

  it('the demo snapshot is not publishable: no Evidence Pack, report or RO-Crate path reads it', () => {
    // THE PUBLISHABILITY ASSERTION. A demo snapshot must not be exportable through any
    // canonical Evidence Pack or report path. The way that would happen is an export/report
    // module importing the demo cluster, so that is what is checked — in both directions.
    const DEMO_BASENAMES = ['localSimulationSnapshotStore', 'localSimulationSnapshotPack', 'demoReplay', 'LocalSimulationSnapshotPanel'];
    const EXPORT_SURFACE = /(evidencePack|roCrate|report|export|publish|ledger|researchRun)/i;

    const importers = FE.filter((rel) => {
      if ([...DEMO_CLUSTER, DEMO_PANEL].includes(rel)) return false;
      if (rel.includes('/__tests__/')) return false;
      const src = FE_SOURCE.get(rel);
      return DEMO_BASENAMES.some((base) => new RegExp(`from\\s+'[^']*/${base}'`).test(src));
    });
    const publishers = importers.filter((rel) => EXPORT_SURFACE.test(path.basename(rel)));
    assert.deepEqual(
      publishers,
      [],
      report(publishers, [], 'An Evidence Pack / report / ledger / ResearchRun module imports the browser-local demo. A demo snapshot must not be publishable as canonical Evidence.'),
    );

    // The demo cluster must not reach the other way either: into the canonical loop's own names.
    const CANONICAL = ['proposeStructuredEvidence', 'openKnowledgeLedgerPersistence', 'replayCapabilityInputs', 'buildDecisionTrace', 'appendServerResearchStateEvent'];
    const leaks = [];
    for (const rel of [...DEMO_CLUSTER, DEMO_PANEL]) {
      for (const needle of CANONICAL) {
        if (FE_SOURCE.get(rel).includes(needle)) leaks.push(`${rel}::${needle}`);
      }
    }
    assert.deepEqual(
      leaks,
      [],
      report(leaks, [], 'The browser-local demo names a canonical ledger/replay/DecisionTrace primitive. It must never reach the canonical ledger.'),
    );
  });

  it('the UI says plainly that this is a local demo snapshot in the browser, not Genesis Evidence', () => {
    const panel = FE_SOURCE.get(DEMO_PANEL);
    // The user-facing disclosure. A viewer looking at this panel must be told, on the screen,
    // what they are looking at — not only in a source comment.
    const banner = panel.match(/local-snapshot-not-evidence[\s\S]{0,1200}?<\/p>/);
    assert.ok(banner, `${DEMO_PANEL} must render the local-snapshot-not-evidence disclosure.`);
    const text = banner[0];
    for (const required of ['DEMO', 'LOCAL_SIMULATION_SNAPSHOT', 'przegl', 'Genesis Evidence', 'Genesis Replay', 'DEMO_REPLAY']) {
      assert.ok(text.includes(required), `The UI disclosure must say "${required}". It currently reads: ${text}`);
    }
    // The panel's own heading must not advertise itself as Evidence & Replay any more.
    assert.ok(
      !/EVIDENCE\s*&(amp;)?\s*REPLAY/i.test(panel),
      'The demo panel still shows an "EVIDENCE & REPLAY" heading to the user.',
    );
    assert.match(panel, /LOCAL_SIMULATION_SNAPSHOT \(DEMO\)/, 'The demo panel heading must name itself a DEMO snapshot.');
    // There is no signing key: the fingerprint must never be shown as a signature.
    const withoutDisclaimers = panel.replace(/bez podpisu|NIEPODPISANE|klucza podpisuj\w*/gi, '');
    assert.ok(
      !/podpisan|\bsigned\b/i.test(withoutDisclaimers),
      'The demo panel must not describe its SHA-256 as a signature. Canonical evidence packages are UNSIGNED.',
    );
  });

  it('nothing has started the ResearchRun migration this decision deferred', () => {
    // D-172 defers the redirect until the epidemic scenario is a real ResearchRun. If a later
    // session starts it here, this fails and sends them back to the decision record.
    // An import or a backend-client call is the migration starting; a comment that NAMES
    // ResearchRun is the deferral being documented, which is what we asked for.
    const offenders = [...DEMO_CLUSTER, DEMO_PANEL].filter((rel) => {
      const src = FE_SOURCE.get(rel);
      return /from\s+'[^']*researchRun/i.test(src) || /\b(start|advance|steer|execute)ResearchRun\w*\s*\(/.test(src);
    });
    assert.deepEqual(
      offenders,
      [],
      report(offenders, [], 'The browser-local demo calls into ResearchRun. D-172 defers that redirect until the epidemic scenario IS a ResearchRun.'),
    );
    for (const rel of ['packages/frontend/src/core/discovery/localSimulationSnapshotStore.ts', DEMO_PANEL]) {
      assert.match(
        FE_SOURCE.get(rel),
        /DO NOT BUILD THE RESEARCHRUN MIGRATION NOW/,
        `${rel} must carry the deferral note at the top, so the next session does not start the migration.`,
      );
    }
  });
});
