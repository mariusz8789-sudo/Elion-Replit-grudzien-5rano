import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENTS } from '../data/elements';
import { runTitrationScenario } from '../labs/experiments/chemistry-titration';
import { replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import type { ApiResult, FabricComputeResponse, ScientificExecutionEvent } from '../core/backend/client';
import {
  CHEMISTRY_EDUCATION_EXPERIMENTS,
  CHEMISTRY_PERIODIC_TABLE,
  CHEMISTRY_PRESENTATION_LEVELS,
  EDUCATIONAL_PROCEDURE_LABEL,
  EXCLUDED_REACTIONS,
  REACTION_KNOWLEDGE,
  arrheniusReplayRunner,
  buildEducationalTimeline,
  chemistryEducationRunner,
  chemistryElementBySymbol,
  elementCounts,
  evaluateArrheniusLocally,
  lookupReaction,
  periodicTableCoverage,
  planChemistryExperiment,
  presentChemistryRun,
  reactantsFromText,
  replayComputationalRun,
  replayEducationalRun,
  routeChemistryPrompt,
  runComputationalExperiment,
  runEducationalExperiment,
  type FabricExecutor,
} from '../core/chemistryEducation';

/**
 * Chemistry Live Lab: the education layer must reuse the canonical element
 * data, models, session/replay and execution-event contracts, refuse what it
 * has no model for, never fabricate instrument telemetry, and show ONE result
 * at three depths.
 */

/** A backend double that runs the SAME shared kinetics graph the backend model evaluates. */
function kineticsBackend(overrides: { persisted?: boolean; fail?: 'network' | 'rejected' } = {}): { execute: FabricExecutor; calls: { temperatureK: number }[] } {
  const calls: { temperatureK: number }[] = [];
  const execute: FabricExecutor = async ({ modelId, inputs }) => {
    calls.push({ temperatureK: inputs.temperatureK });
    if (overrides.fail === 'network') return { ok: false, status: 0, error: 'network', message: 'offline' } as ApiResult<FabricComputeResponse>;
    const status = overrides.fail === 'rejected' ? 'rejected' : 'ok';
    return {
      ok: true,
      data: {
        contractVersion: '1.0.0',
        request: { sourceText: null, domainId: 'chemistry', modelId, requestedVisualization: null },
        persisted: overrides.persisted ?? false,
        run: {
          runId: `run-${calls.length}`, modelId, modelVersion: '1.0.0', domain: 'chemistry', engine: 'genesis-compute@test', status,
          inputs, outputs: status === 'ok' ? evaluateArrheniusLocally(inputs.temperatureK, inputs.activationEnergyKJ) : undefined,
          message: status === 'rejected' ? 'temperatureK out of range' : undefined,
          provenance: { source: 'core/modelGraph/chemistryKineticsGraph.ts', formula: 'k = A·exp(−Ea/RT)', honesty: 'simplified' },
        },
      },
    };
  };
  return { execute, calls };
}

describe('1–2. canonical periodic table', () => {
  it('reuses all 118 canonical elements, H first and Og last', () => {
    expect(periodicTableCoverage()).toEqual({ count: 118, first: 'H', last: 'Og' });
    expect(CHEMISTRY_PERIODIC_TABLE).toHaveLength(ELEMENTS.length);
    const h = chemistryElementBySymbol('H')!;
    const og = chemistryElementBySymbol('Og')!;
    expect([h.atomicNumber, h.period, h.group, h.shells]).toEqual([1, 1, 1, [1]]);
    expect([og.atomicNumber, og.period, og.group, og.shells.length]).toEqual([118, 7, 18, 7]);
    expect(chemistryElementBySymbol('Fe')).toMatchObject({ atomicNumber: 26, period: 4, group: 8, name: 'Żelazo' });
  });

  it('exposes only data-backed properties: f-block has no group, missing χ/trends stay null', () => {
    expect(chemistryElementBySymbol('Ce')).toMatchObject({ period: 6, group: null, block: 'LANTHANIDE' });
    expect(chemistryElementBySymbol('U')).toMatchObject({ period: 7, group: null, block: 'ACTINIDE' });
    expect(chemistryElementBySymbol('Ne')!.paulingElectronegativity).toBeNull();
    expect(chemistryElementBySymbol('Kr')!.firstIonizationKJ).not.toBeNull();
    expect(chemistryElementBySymbol('Rb')!.firstIonizationKJ).toBeNull();
  });
});

describe('3. known experiments plan successfully', () => {
  it('every catalog entry plans READY with defaults (teacher-approved where required)', () => {
    for (const template of CHEMISTRY_EDUCATION_EXPERIMENTS) {
      const plan = planChemistryExperiment(template.experimentId, {}, { teacherApproved: true });
      expect(plan.status, template.experimentId).toBe('READY');
      expect(plan.template?.protocol.devices).toEqual([]);
    }
  });

  it('routes the five reference prompts to supported models', () => {
    expect(routeChemistryPrompt('Pokaż miareczkowanie kwasu octowego NaOH.')).toMatchObject({ status: 'ROUTED', experimentId: 'acid-base-titration', params: { acid: 'acetic' } });
    expect(routeChemistryPrompt('Pokaż geometrię cząsteczki w modelu VSEPR.')).toMatchObject({ status: 'ROUTED', experimentId: 'vsepr-geometry' });
    expect(routeChemistryPrompt('Pokaż, jak temperatura wpływa na szybkość reakcji.')).toMatchObject({ status: 'ROUTED', experimentId: 'arrhenius-kinetics' });
    expect(routeChemistryPrompt('Pokaż polarność wiązania Na-Cl.')).toMatchObject({ status: 'ROUTED', experimentId: 'bond-polarity', params: { elementA: 'Na', elementB: 'Cl' } });
    expect(routeChemistryPrompt('Pokaż żelazo w układzie okresowym i wyjaśnij jego budowę atomową.')).toMatchObject({ status: 'ROUTED', experimentId: 'element-structure', params: { symbol: 'Fe' } });
  });
});

describe('4. unsupported reactions are refused explicitly', () => {
  it('an unmodelled reaction returns UNSUPPORTED_REACTION_MODEL, never a fabricated product', () => {
    const lookup = lookupReaction(reactantsFromText('Fe + S'));
    expect(lookup.status).toBe('UNSUPPORTED_REACTION_MODEL');
    expect(routeChemistryPrompt('Fe + S → ?')).toMatchObject({ status: 'UNSUPPORTED_REACTION_MODEL' });
    expect(routeChemistryPrompt('Pokaż miareczkowanie kwasu solnego NaOH')).toMatchObject({ status: 'UNSUPPORTED_REACTION_MODEL' });
    expect(routeChemistryPrompt('Co powstanie w reakcji magnezu z kwasem?')).toMatchObject({ status: 'UNSUPPORTED_REACTION_MODEL' });
    expect(planChemistryExperiment('acid-base-titration', { acid: 'sulfuric' }).status).toBe('UNSUPPORTED_REACTION_MODEL');
    expect(planChemistryExperiment('reaction-thermochemistry', { reactionId: 'thermo:R-ZN-CUSO4' }, { teacherApproved: true }).status).toBe('UNSUPPORTED_REACTION_MODEL');
    expect(planChemistryExperiment('no-such-experiment').status).toBe('UNKNOWN_EXPERIMENT');
  });

  it('a supported reaction resolves only to its record, and every record balances element by element', () => {
    const hcl = lookupReaction(reactantsFromText('HCl + NaOH'));
    expect(hcl.status === 'SUPPORTED' && hcl.record.reactionId).toBe('thermo:R-HCL-NAOH');
    for (const record of REACTION_KNOWLEDGE) {
      const side = (ps: typeof record.reactants) => ps.reduce<Record<string, number>>((acc, p) => {
        for (const [el, n] of Object.entries(elementCounts(p.formula))) acc[el] = (acc[el] ?? 0) + n * p.coefficient;
        return acc;
      }, {});
      expect(side(record.products), record.reactionId).toEqual(side(record.reactants));
    }
  });

  it('the engine reaction that does not balance (Zn + CuSO4, Cu missing) is excluded, not offered', () => {
    const zn = EXCLUDED_REACTIONS.find((r) => r.canonicalRef === 'R-ZN-CUSO4');
    expect(zn?.reason).toMatch(/ELEMENT_BALANCE_FAILED: Cu/);
    expect(REACTION_KNOWLEDGE.some((r) => r.canonicalRef === 'R-ZN-CUSO4')).toBe(false);
  });
});

describe('5, 7, 8. educational runs: label, no fabricated telemetry, deterministic timeline', () => {
  const run = runEducationalExperiment(planChemistryExperiment('acid-base-titration', { acid: 'acetic' }));

  it('carries the EDUCATIONAL PROCEDURE MODEL — NOT PHYSICAL LAB TELEMETRY label and a MODEL epistemic status', () => {
    expect(run.label).toBe(EDUCATIONAL_PROCEDURE_LABEL);
    expect(EDUCATIONAL_PROCEDURE_LABEL).toMatch(/NOT PHYSICAL LAB TELEMETRY/);
    expect(run.session.epistemicStatus).toBe('MODEL');
    expect(run.session.engineLabel.startsWith(EDUCATIONAL_PROCEDURE_LABEL)).toBe(true);
  });

  it('every observation is model-computed or canonical data — never an instrument reading', () => {
    for (const template of CHEMISTRY_EDUCATION_EXPERIMENTS.filter((t) => t.liveKind === 'EDUCATIONAL_PROCEDURE_MODEL')) {
      const r = runEducationalExperiment(planChemistryExperiment(template.experimentId, {}, { teacherApproved: true }));
      for (const stage of r.artifact.stages) {
        if (stage.observation) expect(['MODEL_COMPUTED', 'CANONICAL_DATASET']).toContain(stage.observation.origin);
      }
      expect(template.protocol.steps.every((s) => s.type === 'ANALYZE' || s.type === 'STOP')).toBe(true);
      expect(template.protocol.safetyConstraints).toContain('NO_INSTRUMENT_TELEMETRY');
    }
  });

  it('the pH shown at each step is exactly the canonical runner output', () => {
    const step = run.artifact.stages.find((s) => s.stageId === 'titrant-6')!;
    expect(step.visualParams).toEqual({ acid: 'acetic', vb: 25 });
    expect(step.observation!.value).toBe(Number(runTitrationScenario({ acid: 'acetic', vb: 25 }).ph.toFixed(2)));
  });

  it('the timeline follows QUESTION→…→LEARNING_CHECK and is identical on every build', () => {
    const again = runEducationalExperiment(planChemistryExperiment('acid-base-titration', { acid: 'acetic' }));
    expect(again.timeline).toEqual(run.timeline);
    expect(again.session.contentHash).toBe(run.session.contentHash);
    expect(buildEducationalTimeline(run.artifact.stages)).toEqual(run.timeline);
    const kinds = run.timeline.map((e) => e.kind);
    expect(kinds[0]).toBe('QUESTION');
    expect(kinds.at(-1)).toBe('LEARNING_CHECK');
    for (const kind of ['EXPERIMENT_SELECTED', 'PLAN', 'SAFETY_CHECK', 'PREPARATION', 'STEP', 'OBSERVATION', 'ANALYSIS', 'RESULT', 'EXPLANATION'] as const) expect(kinds).toContain(kind);
    const offsets = run.timeline.map((e) => e.atMs);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });
});

describe('6. computational experiments use the canonical backend engine path', () => {
  it('Arrhenius runs through the backend model chemistry-arrhenius, emitting only real execution events', async () => {
    const backend = kineticsBackend();
    const seen: ScientificExecutionEvent[] = [];
    const plan = planChemistryExperiment('arrhenius-kinetics', { temperatureK: 308, activationEnergyKJ: 50 });
    expect(plan.template?.modelBinding).toMatchObject({ kind: 'BACKEND_FABRIC_MODEL', backendModelId: 'chemistry-arrhenius' });
    const run = await runComputationalExperiment(plan, { execute: backend.execute, now: () => 1, onEvent: (e) => seen.push(e) });
    expect(run.status).toBe('COMPLETED');
    expect(backend.calls.map((c) => c.temperatureK)).toEqual([298.15, 308, 318]);
    expect(run.executions.map((e) => e.runId)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(seen).toEqual(run.events);
    expect(run.events.filter((e) => e.type === 'ENGINE_OUTPUT_AVAILABLE').map((e) => e.executionId)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(run.events.at(-1)?.type).toBe('EXECUTION_COMPLETED');
    expect(run.artifact!.stages.filter((s) => s.observation).every((s) => s.observation!.origin === 'BACKEND_ENGINE_OUTPUT')).toBe(true);
  });

  it('without a backend there is no result and no fabricated progress — the run is FAILED/BLOCKED', async () => {
    const plan = planChemistryExperiment('arrhenius-kinetics');
    const offline = await runComputationalExperiment(plan, { execute: kineticsBackend({ fail: 'network' }).execute });
    expect(offline).toMatchObject({ status: 'FAILED', session: null, artifact: null });
    expect(offline.events.map((e) => e.type)).toEqual(['EXPERIMENT_PLANNED', 'ENGINE_SELECTED', 'EXECUTION_FAILED']);
    const rejected = await runComputationalExperiment(plan, { execute: kineticsBackend({ fail: 'rejected' }).execute });
    expect(rejected.status).toBe('BLOCKED');
    expect(rejected.events.some((e) => e.type === 'ENGINE_OUTPUT_AVAILABLE')).toBe(false);
  });
});

describe('9. safety class enforcement', () => {
  it('BLOCKED_HAZARDOUS gives no procedure — only a concept explanation', () => {
    const hcn = planChemistryExperiment('acid-base-titration', { acid: 'hcn' }, { teacherApproved: true });
    expect(hcn.status).toBe('BLOCKED_HAZARDOUS');
    expect(hcn.conceptOnly?.equation).toContain('HCN');
    expect(() => runEducationalExperiment(hcn)).toThrow(/not READY/);
    expect(planChemistryExperiment('reaction-thermochemistry', { reactionId: 'thermo:R-NA-CL2' }, { teacherApproved: true }).status).toBe('BLOCKED_HAZARDOUS');
    expect(planChemistryExperiment('reaction-thermochemistry', { reactionId: 'thermo:R-H2-O2' }, { teacherApproved: true }).status).toBe('BLOCKED_HAZARDOUS');
  });

  it('TEACHER_REVIEW content waits for a teacher; CLASSROOM_SAFE_MODEL runs directly', () => {
    expect(planChemistryExperiment('acid-base-titration', { acid: 'formic' }).status).toBe('REQUIRES_TEACHER_REVIEW');
    expect(planChemistryExperiment('acid-base-titration', { acid: 'formic' }, { teacherApproved: true }).status).toBe('READY');
    expect(planChemistryExperiment('acid-base-titration', { acid: 'acetic' }).status).toBe('READY');
  });

  it('a protocol with a physical actuation or instrument step is blocked before it can run', async () => {
    const catalog = await import('../core/chemistryEducation/catalog');
    const template = catalog.CHEMISTRY_EDUCATION_EXPERIMENTS[0];
    const original = template.protocol;
    (template as { protocol: typeof original }).protocol = { ...original, steps: [{ stepId: 'mix', type: 'MIX', deviceId: 'pump-1' }, ...original.steps], devices: ['pump-1'] };
    try {
      expect(planChemistryExperiment(template.experimentId, {}).status).toBe('BLOCKED_PHYSICAL_ACTUATION');
    } finally {
      (template as { protocol: typeof original }).protocol = original;
    }
  });

  it('missing reference data blocks instead of estimating (neon has no Pauling χ)', () => {
    expect(planChemistryExperiment('bond-polarity', { elementA: 'Ne', elementB: 'F' }).status).toBe('BLOCKED_MISSING_DATA');
  });
});

describe('10. SCHOOL / UNIVERSITY / RESEARCH show the same scientific result', () => {
  it('all three levels read one sealed session; only depth differs', () => {
    const run = runEducationalExperiment(planChemistryExperiment('bond-polarity', { elementA: 'Na', elementB: 'Cl' }));
    const views = CHEMISTRY_PRESENTATION_LEVELS.map((level) => presentChemistryRun(run, level));
    expect(new Set(views.map((v) => v.sessionContentHash)).size).toBe(1);
    expect(new Set(views.map((v) => v.resultSummary)).size).toBe(1);
    expect(views[0].sections.map((s) => s.id)).toContain('what-to-notice');
    expect(views[0].quiz.length).toBeGreaterThan(0);
    expect(views[1].sections.map((s) => s.id)).toEqual(expect.arrayContaining(['equation', 'parameters', 'assumptions', 'intermediate', 'limitations']));
    expect(views[2].sections.map((s) => s.id)).toEqual(expect.arrayContaining(['model', 'raw', 'fingerprints', 'provenance', 'evidence']));
    expect(views[2].sections.find((s) => s.id === 'raw')!.body).toBe(JSON.stringify(run.session.outputs));
  });
});

describe('11. Evidence only from eligible scientific execution', () => {
  it('educational models and ephemeral backend runs are not Evidence; persisted project runs are eligible', async () => {
    expect(runEducationalExperiment(planChemistryExperiment('vsepr-geometry')).evidence).toMatchObject({ eligible: false, code: 'EDUCATIONAL_MODEL_NOT_EVIDENCE' });
    const plan = planChemistryExperiment('arrhenius-kinetics');
    const ephemeral = await runComputationalExperiment(plan, { execute: kineticsBackend().execute });
    expect(ephemeral.evidence).toMatchObject({ eligible: false, code: 'EPHEMERAL_RUN_NOT_PERSISTED' });
    expect(ephemeral.events.some((e) => e.type === 'EVIDENCE_PROPOSED')).toBe(false);
    const persisted = await runComputationalExperiment(plan, { execute: kineticsBackend({ persisted: true }).execute });
    expect(persisted.evidence).toMatchObject({ eligible: true, code: 'PERSISTED_PROJECT_RUN' });
  });
});

describe('12. replay uses the canonical ExperimentSession replay', () => {
  it('educational replay re-executes the canonical runner and reports MATCH', () => {
    const run = runEducationalExperiment(planChemistryExperiment('element-structure', { symbol: 'Fe' }));
    expect(replayEducationalRun(run)).toMatchObject({ status: 'MATCH', driftedKeys: [] });
    expect(replayExperimentSession(run.session, chemistryEducationRunner).status).toBe('MATCH');
  });

  it('computational replay re-executes the shared kinetics graph against the sealed backend outputs; tampering is DRIFT', async () => {
    const run = await runComputationalExperiment(planChemistryExperiment('arrhenius-kinetics'), { execute: kineticsBackend().execute });
    expect(replayComputationalRun(run)).toMatchObject({ status: 'MATCH' });
    const tampered = { ...run.session!, outputs: { ...run.session!.outputs, selected_rateConstant: 1 } };
    expect(replayExperimentSession(tampered, arrheniusReplayRunner)).toMatchObject({ status: 'DRIFT', driftedKeys: ['selected_rateConstant'] });
  });
});

describe('13–14. no duplicate chemistry or lab engine', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../core/chemistryEducation');
  const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && statSync(path.join(dir, f)).isFile()).map((f) => ({ f, text: readFileSync(path.join(dir, f), 'utf8') }));

  it('the layer never implements chemistry math itself — it imports the canonical models', () => {
    const all = sources.map((s) => s.text).join('\n');
    for (const forbidden of [/Math\.exp\(/, /Math\.log10\(/, /8\.314/, /titrationPH\(/, /new ModelGraph\(/, /class \w+Sim\b/]) {
      expect(all, String(forbidden)).not.toMatch(forbidden);
    }
    expect(all).toMatch(/from '\.\.\/\.\.\/labs\/experiments\/chemistry-titration'/);
    expect(all).toMatch(/from '\.\.\/physics'/);
    expect(all).toMatch(/from '@genesis\/core\/lab\/ThermodynamicLabEngine\.js'/);
    expect(all).toMatch(/from '\.\.\/modelGraph\/chemistryKineticsGraph'/);
  });

  it('no second lab/protocol/replay/evidence/renderer: only canonical contracts are used', () => {
    const all = sources.map((s) => s.text).join('\n');
    expect(all).toMatch(/from '\.\.\/lab\/experimentProtocol'/);
    expect(all).toMatch(/from '\.\.\/scientificWorlds\/experimentSession'/);
    for (const forbidden of [/class \w*(Lab|Protocol|Replay|Evidence|Ledger|Renderer|Scene)\w*/, /from 'three'/, /EvidenceLedger/, /new WebGLRenderer/]) {
      expect(all, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('the educational runner is only the canonical ExperimentRunner contract (outputs are primitives)', () => {
    const r = chemistryEducationRunner('vsepr-geometry', 0, { shapeId: 'ax2e2' });
    expect(Object.values(r.outputs).every((v) => ['string', 'number', 'boolean'].includes(typeof v))).toBe(true);
    expect(r.epistemicStatus).toBe('MODEL');
  });
});
