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

/**
 * The frontend's production .ts/.tsx, as repo-relative POSIX paths. Invariants 10 reaches across the
 * package boundary on purpose: the second Evidence/Replay path Genesis actually has is in the
 * browser (packages/frontend/src/core/discovery), and an invariant that could not see it would be
 * green while the duplicate it is meant to pin moved.
 */
function frontendModules(dir = path.join(REPO, 'packages/frontend/src'), out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules' && name !== '__tests__') frontendModules(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(name) || name.includes('.test.')) continue;
    out.push(path.relative(REPO, full).split(path.sep).join('/'));
  }
  return out;
}

const FRONTEND = frontendModules();
const FRONTEND_SOURCE = new Map(FRONTEND.map((rel) => [rel, readFileSync(path.join(REPO, rel), 'utf8')]));

/** Frontend modules under one of `roots` whose source mentions `needle`. */
function frontendMentions(needle, roots) {
  return FRONTEND
    .filter((rel) => roots.some((root) => rel.startsWith(`packages/frontend/src/${root}`)))
    .filter((rel) => FRONTEND_SOURCE.get(rel).includes(needle))
    .sort();
}

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

  it('a ResearchRun is started from the HTTP seam only', () => {
    // One way in. A module that could start a run of its own would be a second entry to the loop,
    // outside the intake that records who asked and why.
    const allowed = ['packages/backend/src/api.mjs'];
    const actual = importersOfSymbol('startResearchRun', { except: ['packages/backend/src/researchRun.mjs'] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module starts a ResearchRun. Second entry into the loop?'));
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 8 — ONE STAGE-TIMING AUTHORITY (schema v17, discoveryTiming.mjs)
// ---------------------------------------------------------------------------

describe('INVARIANT: one stage-timing authority', () => {
  const TIMING = 'packages/backend/src/discoveryTiming.mjs';

  /** Every function in discoveryTiming.mjs that WRITES a row. Readers are listed separately. */
  const WRITERS = ['openStage', 'closeStage', 'recordSpan', 'recordCount', 'recordMember', 'recordStageStatus', 'linkScopeToCampaign', 'recordCompetitorBaseline'];
  const READERS = ['stageTimings', 'discoveryTimingReport', 'campaignCycleTiming', 'genesisSpeedup', 'getCompetitorBaseline', 'listCompetitorBaselines', 'campaignsOfScope'];

  it('stage timing is written from inside the canonical loop and nowhere else', () => {
    // The timing is part of the loop's own write transaction, not a parallel clock: if a tool-layer
    // or HTTP module could open or close a stage, Genesis would have a second timeline to reconcile
    // with the hash-chained research state, and the 2x number would stop meaning the loop's own time.
    const allowed = ['packages/backend/src/researchRun.mjs', 'packages/backend/src/researchRunExecution.mjs'];
    const writers = new Set();
    for (const w of WRITERS) for (const rel of importersOfSymbol(w, { except: [TIMING] })) writers.add(rel);
    const actual = [...writers].sort();
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module writes stage timing. Second clock?'));
  });

  it('the HTTP surface may only READ timing, never write it', () => {
    const api = SOURCE.get('packages/backend/src/api.mjs');
    const imported = api.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/discoveryTiming\.mjs'/);
    assert.ok(imported, 'api.mjs must import from discoveryTiming.mjs (the read-only timing routes)');
    const names = imported[1].split(',').map((s) => s.trim()).filter(Boolean);
    const writers = names.filter((n) => WRITERS.includes(n));
    assert.deepEqual(writers, [], `api.mjs imported timing WRITERS: ${writers.join(', ')}. Routes report time; the loop records it.`);
    assert.ok(names.every((n) => READERS.includes(n)), `api.mjs imported a non-reader from discoveryTiming.mjs: ${names.join(', ')}`);
  });

  it('the four timing tables are created in one place and queried from one module', () => {
    const TABLES = ['discovery_stage_marks', 'discovery_stage_facts', 'discovery_timing_campaign_links', 'discovery_competitor_baselines'];
    const allowed = ['packages/backend/src/discoveryTiming.mjs', 'packages/backend/src/store.mjs'];
    for (const table of TABLES) {
      const named = mentions(table);
      assert.deepEqual(named, allowed, report(named, allowed, `${table} is named outside its one module and its one schema.`));
    }
  });

  it('the timing tables are append-only: the timing module issues no UPDATE or DELETE', () => {
    // "Append-only" is the whole reason a stage boundary can be trusted after the fact. A rewrite
    // would let a slow run be made fast retroactively.
    const timing = SOURCE.get(TIMING);
    assert.ok(timing, `${TIMING} must exist`);
    for (const verb of ['UPDATE ', 'DELETE FROM']) {
      assert.ok(!timing.includes(verb), `${TIMING} contains ${verb.trim()}: the timing tables must stay append-only.`);
    }
  });

  it('a competitor time can only come from the provenance-gated table, never from a constant', () => {
    // The 2x claim needs a competitor number. There is none in this repository, and the ONLY way one
    // can enter is a row in discovery_competitor_baselines with every provenance column filled.
    const timing = SOURCE.get(TIMING);
    assert.ok(timing.includes('TARGET_2X_NOT_YET_BENCHMARKED'), 'genesisSpeedup must be able to report that nothing has been benchmarked.');
    const speedup = timing.slice(timing.indexOf('export function genesisSpeedup'));
    assert.ok(
      /discovery_competitor_baselines|getCompetitorBaseline|listCompetitorBaselines/.test(speedup),
      'genesisSpeedup must read its competitor time from the baselines table.',
    );
    // A module may NAME the vocabulary in a comment (api.mjs:902 documents what the route reports);
    // what it may not do is DECLARE its own copy, which would be a second definition of the claim.
    const redeclared = MODULES
      .filter((rel) => rel !== TIMING)
      .filter((rel) => /(?:const|let|var)\s+(?:TARGET_2X_NOT_YET_BENCHMARKED|SPEEDUP_GREEN_THRESHOLD)\s*=/.test(SOURCE.get(rel)))
      .sort();
    assert.deepEqual(redeclared, [], report(redeclared, [], 'A second module declares its own speedup vocabulary instead of importing it.'));
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 9 — ONE SCHEMA / MIGRATION AUTHORITY
// ---------------------------------------------------------------------------

describe('INVARIANT: one schema authority', () => {
  it('store.mjs is the only module that moves the schema version', () => {
    // Two migrators on one database is the fastest way to two states of the same science.
    const actual = mentions('user_version');
    assert.deepEqual(actual, ['packages/backend/src/store.mjs'], report(actual, ['store.mjs'], 'A second module writes PRAGMA user_version.'));
    const named = mentions('CURRENT_SCHEMA_VERSION', { except: ['packages/backend/src/store.mjs'] })
      .filter((rel) => !/from\s+'[^']*store\.mjs'/.test(SOURCE.get(rel)));
    assert.deepEqual(named, [], report(named, [], 'A module names CURRENT_SCHEMA_VERSION without importing store.mjs.'));
  });

  it('the schema the code knows is v17, declared once', () => {
    const store = SOURCE.get('packages/backend/src/store.mjs');
    assert.match(store, /export const CURRENT_SCHEMA_VERSION = 17;/, 'store.mjs must declare CURRENT_SCHEMA_VERSION = 17 (the discoveryTiming schema).');
    assert.equal((store.match(/export const CURRENT_SCHEMA_VERSION/g) ?? []).length, 1, 'CURRENT_SCHEMA_VERSION must be declared exactly once.');
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 10 — THE BROWSER-LOCAL DISCOVERY ENGINE IS CONTAINED
// ---------------------------------------------------------------------------

describe('INVARIANT: the browser-local Discovery Engine stays a demo tool', () => {
  // packages/frontend/src/core/discovery is a genuine SECOND evidence+replay implementation: it runs
  // the in-browser scenario engine, hashes its own evidence pack and produces its own replay verdict,
  // persisted in the viewer's localStorage. It is not the canonical path and must never become one.
  // Removing it is not a small change (docs/genesis1/ONE-BRAIN.md, RED-3), so these tests pin the
  // containment instead: one surface, and no route from it into the canonical Evidence ledger.
  const PRIMITIVES = ['runDiscoveryCase', 'replayDiscoveryCase', 'LocalEvidenceStore', 'computeEvidencePackSha256'];
  const SURFACE = 'packages/frontend/src/components/visual-simulation/EvidenceReplayPanel.tsx';

  for (const primitive of PRIMITIVES) {
    it(`${primitive} has exactly one product surface`, () => {
      const actual = frontendMentions(primitive, ['components/', 'App.tsx']);
      assert.deepEqual(actual, [SURFACE], report(actual, [SURFACE], `${primitive} reached a second screen. The browser-local engine is spreading.`));
    });
  }

  it('the browser-local engine has no route into the canonical Evidence ledger', () => {
    // The one ledger is reached over HTTP through core/backend/client.ts. If that module (or the
    // ResearchRun screens) ever imported the browser-local discovery pack, a localStorage artefact
    // could be proposed as Evidence and Genesis would have two things called an evidence pack in one
    // ledger.
    const canonical = ['core/backend/client.ts', 'core/verifyTarget.ts', 'core/scienceChat/', 'components/verify/', 'components/labHandoff/', 'components/reports/'];
    const offenders = FRONTEND
      .filter((rel) => canonical.some((root) => rel.startsWith(`packages/frontend/src/${root}`)))
      .filter((rel) => PRIMITIVES.some((p) => FRONTEND_SOURCE.get(rel).includes(p)))
      .sort();
    assert.deepEqual(offenders, [], report(offenders, [], 'A ResearchRun-facing frontend module touches the browser-local Discovery Engine.'));
  });
});

// ---------------------------------------------------------------------------
// INVARIANT 11 — THE TWO WORKER SYSTEMS DO NOT MERGE
// ---------------------------------------------------------------------------

describe('INVARIANT: the capability worker and the ResearchRun worker stay separate systems', () => {
  // Invariant 4 forbids a researchRun* module from calling routeCapability. This is the other
  // direction: the private capability-worker system (compute/workerServer.mjs +
  // compute/remoteScientificWorkerClient.mjs, push-RPC, GENESIS_SCIENTIFIC_WORKER_TOKEN) must not
  // learn about ResearchRun either, or the two job models grow into one half-merged third.
  it('the capability-worker system never references a ResearchRun', () => {
    const offenders = ['packages/backend/src/compute/workerServer.mjs', 'packages/backend/src/compute/remoteScientificWorkerClient.mjs']
      .filter((rel) => {
        const src = SOURCE.get(rel);
        assert.ok(src, `${rel} must exist`);
        return /[Rr]esearchRun/.test(src);
      });
    assert.deepEqual(offenders, [], report(offenders, [], 'The capability-worker system now knows about ResearchRun. Two job models merging.'));
  });

  it('only Virtual Lab and Replay route a capability, and the caller list is closed', () => {
    const allowed = ['packages/backend/src/campaign/verify.mjs', 'packages/backend/src/campaign/virtualLabClosedLoop.mjs'];
    const actual = importersOfSymbol('routeCapability', { except: ['packages/backend/src/compute/remoteScientificWorkerClient.mjs'] });
    assert.deepEqual(actual, allowed, report(actual, allowed, 'A new module routes a capability. Virtual Lab and Replay are the only two.'));
  });
});
