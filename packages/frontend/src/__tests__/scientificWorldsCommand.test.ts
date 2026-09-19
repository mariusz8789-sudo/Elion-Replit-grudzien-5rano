import { describe, expect, it } from 'vitest';
import { isWorldCommandShape, normalizeText, parseWorldCommands, validateWorldCommand, type CommandCatalog } from '../core/scientificWorlds/worldCommand';
import { planActions } from '../core/scientificWorlds/actionPlanner';

const catalog: CommandCatalog = {
  worldId: 'lab-1',
  allowedIntents: ['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'ASK', 'SCENARIO', 'INSPECT'],
  stations: [
    { id: 'st-crystal', label: 'Syntezator kryształów', keywords: ['syntezator', 'syntezatora kryształów', 'kryształ', 'crystal', 'synthesizer'], experimentId: 'crystal-synthesis' },
    { id: 'st-collider', label: 'Konsola zderzacza', keywords: ['zderzacz', 'collider', 'konsola zderzacza'], experimentId: 'collision-batch' },
    { id: 'st-epi', label: 'Pulpit epidemiologiczny', keywords: ['epidemi', 'epidemiology desk', 'seir'], experimentId: 'seir-epidemic' },
    { id: 'st-window', label: 'Okno obserwacyjne', keywords: ['okno', 'window'] },
  ],
};

describe('parseWorldCommands — deterministic Polish/English intent classification', () => {
  it('the acceptance sentence becomes NAVIGATE + RUN_EXPERIMENT + INSPECT(provenance), same ids every time', () => {
    const text = 'Idź do laboratorium i uruchom eksperyment na syntezie kryształu. Potem pokaż mi, co otrzymałeś i skąd to pochodzi.';
    const a = parseWorldCommands(text, catalog, 7);
    const b = parseWorldCommands(text, catalog, 7);
    expect(a).toEqual(b);
    expect(a.commands.map((c) => c.intent)).toEqual(['NAVIGATE', 'RUN_EXPERIMENT', 'INSPECT']);
    expect(a.commands[0].targetEntityId).toBe('st-crystal');
    expect(a.commands[1].targetEntityId).toBe('st-crystal');
    expect(a.commands[2].parameters).toEqual({ provenance: true, result: true });
    expect(new Set(a.commands.map((c) => c.commandId)).size).toBe(3);
    expect(a.unresolved).toEqual([]);
    for (const c of a.commands) expect(c.commandId).toMatch(/^cmd-[0-9a-f]{8}$/);
    expect(parseWorldCommands(text, catalog, 8).commands[0].commandId).not.toBe(a.commands[0].commandId);
  });
  it('a run with an explicit composition and a follow-up without a station name binds to the last station', () => {
    const r = parseWorldCommands('Podejdź do syntezatora, a potem uruchom próbę NaCl.', catalog, 1);
    expect(r.commands.map((c) => [c.intent, c.targetEntityId])).toEqual([['NAVIGATE', 'st-crystal'], ['RUN_EXPERIMENT', 'st-crystal']]);
    expect(r.commands[1].parameters).toEqual({ composition: 'NaCl' });
  });
  it('energy, thresholds and seeds are read as numbers; a what-if reads multipliers and percentages', () => {
    const r = parseWorldCommands('Uruchom zderzacz przy 13 TeV z progiem ADD 5 TeV, seed 42', catalog, 1);
    expect(r.commands[0].intent).toBe('RUN_EXPERIMENT');
    expect(r.commands[0].parameters).toEqual({ sqrtSGeV: 13000, addThresholdTeV: 5, seed: 42 });
    const s = parseWorldCommands('Co się stanie, jeśli epidemia ma dwukrotnie większą transmisję i szpitale tracą 30% przepustowości?', catalog, 1);
    expect(s.commands[0].intent).toBe('SCENARIO');
    expect(s.commands[0].targetEntityId).toBe('st-epi');
    expect(s.commands[0].parameters).toEqual({ transmissionMultiplier: 2, hospitalCapacityMultiplier: 0.7 });
  });
  it('questions become ASK; nonsense is unresolved, never a command', () => {
    const q = parseWorldCommands('Dlaczego kryształ NaCl jest stabilny?', catalog, 1);
    expect(q.commands[0].intent).toBe('ASK');
    const n = parseWorldCommands('fioletowy poniedziałek', catalog, 1);
    expect(n.commands).toEqual([]);
    expect(n.unresolved).toEqual(['fioletowy poniedziałek']);
  });
  it('normalizeText is accent-insensitive', () => {
    expect(normalizeText('Idź do SYNTEZATORA  kryształów')).toBe('idz do syntezatora krysztalow');
  });
});

describe('validateWorldCommand — schema and permission gate', () => {
  it('refuses a run at a station that runs nothing, an unknown station, a forbidden intent and bad parameters', () => {
    const base = { commandId: 'cmd-0123abcd', text: 'x', requestedAtLogicalTime: 1 } as const;
    expect(validateWorldCommand({ ...base, intent: 'RUN_EXPERIMENT', targetEntityId: 'st-window' }, catalog)).toEqual({ ok: false, reason: 'station Okno obserwacyjne runs no experiment' });
    expect(validateWorldCommand({ ...base, intent: 'NAVIGATE', targetEntityId: 'nope' }, catalog).ok).toBe(false);
    expect(validateWorldCommand({ ...base, intent: 'NAVIGATE' }, catalog).ok).toBe(false);
    expect(validateWorldCommand({ ...base, intent: 'SCENARIO' }, { ...catalog, allowedIntents: ['NAVIGATE'] }).ok).toBe(false);
    expect(validateWorldCommand({ ...base, intent: 'ASK', parameters: { 'bad key': 1 } }, catalog).ok).toBe(false);
    expect(validateWorldCommand({ ...base, intent: 'ASK', parameters: { n: Number.NaN } }, catalog).ok).toBe(false);
    expect(validateWorldCommand({ ...base, intent: 'RUN_EXPERIMENT', targetEntityId: 'st-crystal', parameters: { composition: 'NaCl' } }, catalog)).toEqual({ ok: true });
  });
  it('isWorldCommandShape guards foreign payloads', () => {
    expect(isWorldCommandShape({ commandId: 'cmd-1', text: 't', intent: 'ASK', requestedAtLogicalTime: 0 })).toBe(true);
    expect(isWorldCommandShape({ commandId: 'cmd-1', text: 't', intent: 'DESTROY', requestedAtLogicalTime: 0 })).toBe(false);
    expect(isWorldCommandShape({ commandId: 'cmd-1', text: 't', intent: 'ASK', requestedAtLogicalTime: 0, parameters: { f: () => 1 } })).toBe(false);
  });
});

describe('planActions — the body does the work, the experiment runs once', () => {
  it('expands a run at a distant station into walk → align → reach → interact → execute → observe → report', () => {
    const { commands } = parseWorldCommands('Idź do syntezatora kryształów i uruchom próbę NaCl. Potem pokaż mi, co otrzymałeś i skąd to pochodzi.', catalog, 3);
    expect(commands.map((c) => c.intent)).toEqual(['NAVIGATE', 'RUN_EXPERIMENT', 'INSPECT']);
    const plan = planActions(commands, catalog, null);
    expect(plan.rejected).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);
    const exec = plan.steps.find((s) => s.kind === 'EXECUTE');
    expect(exec && exec.kind === 'EXECUTE' ? exec : null).toEqual({ kind: 'EXECUTE', stationId: 'st-crystal', experimentId: 'crystal-synthesis', inputs: { composition: 'NaCl' } });
    const report = plan.steps[plan.steps.length - 1];
    expect(report).toEqual({ kind: 'REPORT', includeProvenance: true, includeResult: true });
    expect(plan.planId).toMatch(/^plan-[0-9a-f]{8}$/);
    expect(planActions(commands, catalog, null).planId).toBe(plan.planId);
  });
  it('an agent already at the station does not walk; a run always ends in a report; invalid commands are rejected with the reason', () => {
    const run = parseWorldCommands('uruchom zderzacz przy 13 TeV', catalog, 1).commands[0];
    const plan = planActions([run], catalog, 'st-collider');
    expect(plan.steps.map((s) => s.kind)).toEqual(['ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);
    const bad = planActions([{ commandId: 'cmd-00000000', text: 'x', intent: 'RUN_EXPERIMENT', targetEntityId: 'st-window', requestedAtLogicalTime: 1 }], catalog, null);
    expect(bad.steps).toEqual([]);
    expect(bad.rejected[0].reason).toContain('runs no experiment');
  });
  it('ASK and SCENARIO are deferred to their subsystems, not executed by the body', () => {
    const { commands } = parseWorldCommands('Co jeśli transmisja jest dwukrotnie większa?', catalog, 1);
    const plan = planActions(commands, catalog, null);
    expect(plan.steps).toEqual([{ kind: 'DEFER', intent: 'SCENARIO', text: commands[0].text, parameters: { transmissionMultiplier: 2 } }]);
  });
});
