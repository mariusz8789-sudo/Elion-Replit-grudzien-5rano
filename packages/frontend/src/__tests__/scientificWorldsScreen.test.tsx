import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QUICK_COMMANDS, ScientificWorldsScreen, describePlan } from '../components/ScientificWorldsScreen';
import { narrateReport, narrateSession } from '../core/scientificWorlds/narration';
import { createExperimentSession, replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { createLabExperimentRunner } from '../core/scientificWorlds/experimentRunners';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { LAB_CATALOG } from '../core/scientificWorlds/labWorld';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';

describe('ScientificWorldsScreen — static render (no WebGL)', () => {
  const html = renderToStaticMarkup(<ScientificWorldsScreen />);
  it('renders the canvas, the visor, the three HUD safe zones, an empty transcript and no session', () => {
    expect(html).toContain('data-testid="scientific-worlds"');
    expect(html).toContain('data-agent-state="IDLE"');
    for (const id of ['sw-canvas', 'sw-visor', 'sw-status', 'sw-evidence', 'sw-command', 'sw-input', 'sw-send', 'sw-quick-synteza']) expect(html).toContain(`data-testid="${id}"`);
    for (const id of ['sw-camera', 'sw-voice', 'sw-level']) expect(html).not.toContain(`data-testid="${id}"`);
    expect(html).not.toContain('data-testid="sw-session"');
    expect(html).not.toContain('sw-line-');
    expect(html).toContain('GENESIS · LABORATORIUM');
    expect(html).toContain('>bezczynny<');
    expect(html).toContain('aria-expanded="false"');
    for (const domain of ['Drug Discovery', 'Chemistry', 'Physics']) expect(html).toContain(domain);
    expect(html).toContain('id="sw-advanced-controls"');
    expect(html).toContain('hidden=""');
  });
  it('every quick command parses into at least one command the lab accepts', () => {
    for (const q of QUICK_COMMANDS) {
      const parsed = parseWorldCommands(q.text, LAB_CATALOG, 1);
      expect(parsed.commands.length, q.label).toBeGreaterThan(0);
      const plan = planActions(parsed.commands, LAB_CATALOG, null);
      expect(plan.rejected, q.label).toEqual([]);
      expect(plan.steps.length, q.label).toBeGreaterThan(0);
    }
  });
  it('describePlan says what was understood, what was not, and what was refused', () => {
    expect(describePlan(0, ['bla'], [], [])).toBe('Nie zrozumiałem: „bla”.');
    expect(describePlan(1, [], ['NAVIGATE', 'ALIGN'], [{ reason: 'x' }])).toBe('Rozumiem 1 polecenie: NAVIGATE → ALIGN. Odrzucone: x.');
    expect(describePlan(0, [], [], [])).toBe('Nie znalazłem polecenia w tym tekście.');
  });
});

describe('narration — every sentence comes from the session', () => {
  const runner = createLabExperimentRunner('narration-test', kernelLedger);
  it('reads the crystal result, the epistemic status, the provenance and the replay verdict', () => {
    const { session } = createExperimentSession({ worldId: 'narration-test', stationId: 'st-synthesizer', experimentId: 'crystal-synthesis', seed: 7, inputs: { composition: 'NaCl' }, logicalTime: 1 }, runner);
    const explorer = narrateSession(session, { level: 'EXPLORER', lang: 'pl', includeProvenance: false });
    expect(explorer.map((l) => l.key)).toEqual(['result', 'status']);
    expect(explorer[0].text).toContain(String(session.outputs.name));
    expect(explorer[0].text).toContain('rock-salt');
    expect(explorer[1].text).toContain('wynik modelu (oszacowanie)');
    expect(explorer[1].text).toContain('EMPIRICAL_ESTIMATE_MODEL');
    const auditor = narrateSession(session, { level: 'AUDITOR', lang: 'en', includeProvenance: true, replay: replayExperimentSession(session, runner) });
    expect(auditor.map((l) => l.key)).toEqual(['result', 'status', 'values', 'steps', 'provenance', 'replay']);
    expect(auditor[4].text).toContain(session.sessionId);
    expect(auditor[4].text).toContain(session.contentHash.slice(0, 16));
    expect(auditor[5].text).toContain('MATCH');
  });
  it('a speculative horizon is spoken as speculative; a report without a session says so; deferred intents are named', () => {
    const { session } = createExperimentSession({ worldId: 'narration-test', experimentId: 'micro-blackhole', seed: 1, inputs: { sqrtSGeV: 14000, addThresholdTeV: 5 }, logicalTime: 2 }, runner);
    const lines = narrateSession(session, { level: 'EXPLORER', lang: 'pl', includeProvenance: false });
    expect(lines[0].text).toContain('horyzont się formuje');
    expect(lines[1].text).toContain('spekulacja — brak dowodów');
    const empty = narrateReport({ planId: 'p', session: null, includeProvenance: true, includeResult: true, deferred: [{ kind: 'DEFER', intent: 'SCENARIO', text: 'co jeśli', parameters: {} }], rejected: [{ commandId: 'c', reason: 'nope' }] }, { level: 'EXPLORER', lang: 'pl' });
    expect(empty.map((l) => l.key)).toEqual(['none', 'defer-SCENARIO', 'rejected-c']);
    expect(empty[0].text).toContain('Nie mam jeszcze żadnego wyniku');
  });
});
