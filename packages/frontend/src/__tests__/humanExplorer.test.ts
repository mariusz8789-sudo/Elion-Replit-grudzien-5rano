import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t, localeDirection, isLocale, SUPPORTED_LOCALES } from '../core/i18n';
import { EXPLORER_ORGANS, SCALE_LADDER, SCALE_METRES, bloodMagnificationCommands, canClaimDirectObservation, explorerCommands, explorerPath, explorerTruthLabel, levelLabel, levelOfSession, magnificationCommands, organById, parseExplorerZoom, systemCommands } from '../core/scientificWorlds/humanExplorer';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { MUSEUM_CALM, chunkForSpeech, epistemicStatusLine, museumCalmSettings, museumUtterances } from '../core/guide/museumCalm';

afterEach(() => setLocale('pl'));

describe('i18n — pack locales es/ar on the canonical dictionary (no auto-translation)', () => {
  it('serves pack vocabulary per locale, falls back to Polish, keeps the key visible when nothing exists', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pl', 'en', 'es', 'ar']);
    expect(t('explorer.cell', 'es')).toBe('Célula');
    expect(t('explorer.cell', 'ar')).toBe('خلية');
    expect(t('explorer.cell', 'en')).toBe('Cell');
    expect(t('nav.search', 'es')).toBe('Szukaj'); // no pack string → Polish, never a guessed translation
    expect(t('explorer.organ', 'es')).toBe('Narząd'); // no pack string → the Polish source label, never a guessed Spanish word
    expect(t('explorer.nonexistent', 'es')).toBe('explorer.nonexistent'); // absent everywhere → visible key
    expect(isLocale('ar')).toBe(true); expect(isLocale('de')).toBe(false);
  });
  it('Arabic is RTL and setLocale flips the document direction; ids stay untouched', () => {
    expect(localeDirection('ar')).toBe('rtl'); expect(localeDirection('pl')).toBe('ltr');
    const fakeDoc = { documentElement: { dir: 'ltr', lang: 'pl' } };
    (globalThis as { document?: unknown }).document = fakeDoc;
    try {
      setLocale('ar');
      expect(fakeDoc.documentElement.dir).toBe('rtl'); expect(fakeDoc.documentElement.lang).toBe('ar');
      expect(EXPLORER_ORGANS[0].organId).toBe('heart');
      setLocale('pl');
      expect(fakeDoc.documentElement.dir).toBe('ltr');
    } finally { delete (globalThis as { document?: unknown }).document; }
  });
});

describe('human explorer — BODY→MOLECULE ladder on the V3 atlas and canonical experiments', () => {
  const manifest = createHumanDigitalTwinManifest('HDT-test');
  it('every explorer organ is an ORGAN node of the atlas; scale ladder is monotone', () => {
    for (const o of EXPLORER_ORGANS) expect(organById(manifest, o.organId)?.organId).toBe(o.organId);
    expect(organById(manifest, 'unicorn-horn')).toBeNull();
    for (let i = 1; i < SCALE_LADDER.length; i++) expect(SCALE_METRES[SCALE_LADDER[i]]).toBeLessThanOrEqual(SCALE_METRES[SCALE_LADDER[i - 1]]);
  });
  it('the path down to a molecule runs histology → hyperscope 100× → 500× → central-dogma, all labelled non-observation', () => {
    const path = explorerPath(EXPLORER_ORGANS[0], 'molecule');
    expect(path.map((s) => s.level)).toEqual(SCALE_LADDER.slice(0, 7));
    expect(path.map((s) => s.experimentId)).toEqual([null, null, null, 'histology-slide', 'hyperscope-capture', 'hyperscope-capture', 'central-dogma']);
    expect(path.map((s) => s.magnification)).toEqual([null, null, null, 40, 100, 500, null]);
    for (const s of path) { expect(canClaimDirectObservation(s.evidenceMode)).toBe(false); expect(explorerTruthLabel(s.evidenceMode)).toMatch(/NOT_DIRECT_OBSERVATION$/); }
    expect(canClaimDirectObservation('REAL_IMAGE')).toBe(true); expect(explorerTruthLabel('REAL_DATASET')).toBe('REAL_DATASET');
  });
  it('parses zoom requests in pl / en / es / ar and rejects body-level or organ-less text', () => {
    expect(parseExplorerZoom('przybliż do komórki serca')).toMatchObject({ organ: { organId: 'heart' }, level: 'cell' });
    expect(parseExplorerZoom('zoom to the liver tissue')).toMatchObject({ organ: { organId: 'liver' }, level: 'tissue' });
    expect(parseExplorerZoom('acércate a la molécula del cerebro')).toMatchObject({ organ: { organId: 'brain' }, level: 'molecule' });
    expect(parseExplorerZoom('تكبير خلية القلب')).toMatchObject({ organ: { organId: 'heart' }, level: 'cell' });
    expect(parseExplorerZoom('przybliż do ciała')).toBeNull();
    expect(parseExplorerZoom('przybliż do komórki')).toBeNull();
    expect(parseExplorerZoom('idź do mikroskopu')).toBeNull();
  });
  it('emits canonical WorldCommands: navigate, focus, the experiments in ladder order, then inspect; deterministic ids', () => {
    const organ = EXPLORER_ORGANS[0];
    const a = explorerCommands(organ, 'organelle', 'x', 7); const b = explorerCommands(organ, 'organelle', 'x', 7);
    expect(a).toEqual(b);
    expect(a.map((c) => c.intent)).toEqual(['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'RUN_EXPERIMENT', 'RUN_EXPERIMENT', 'INSPECT']);
    expect(a[1].parameters).toEqual({ action: 'FOCUS_ANATOMY', focus: 'heart', mode: 'ORGANS' });
    expect(a[2]).toMatchObject({ targetEntityId: 'station:histology', parameters: { tissue: 'CARDIAC', stage: 'slide' } });
    expect(a[3]).toMatchObject({ targetEntityId: 'station:microscopy', parameters: { magnification: 100 } });
    expect(a[4]).toMatchObject({ targetEntityId: 'station:microscopy', parameters: { magnification: 500 } });
    expect(new Set(a.map((c) => c.commandId)).size).toBe(a.length);
    const mol = explorerCommands(EXPLORER_ORGANS[1], 'molecule', 'y', 1);
    expect(mol[1].parameters?.mode).toBe('BRAIN');
    expect(mol.at(-2)).toMatchObject({ targetEntityId: 'station:compute', parameters: { organId: 'brain', tissue: 'NEURAL', explorerLevel: 'molecule' } });
  });
  it('the biology command bridge routes a zoom clause through the explorer before the pack router', () => {
    const { commands: cmds, unresolved } = parseBiologyWorldCommands('przybliż do komórki serca', 3);
    expect(unresolved).toEqual([]);
    expect(cmds.map((c) => c.intent)).toEqual(['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'RUN_EXPERIMENT', 'INSPECT']);
    expect(new Set(cmds.map((c) => c.commandId)).size).toBe(cmds.length);
  });
  it('DNA and atom rungs: DNA runs the central dogma at the compute wall; atoms run nothing and say so; a zoom to DNA does not repeat the molecule session', () => {
    const organ = EXPLORER_ORGANS[0];
    expect(explorerPath(organ, 'dna').at(-1)).toMatchObject({ level: 'dna', experimentId: 'central-dogma' });
    expect(explorerPath(organ, 'atom').at(-1)).toMatchObject({ level: 'atom', experimentId: null, evidenceMode: 'ILLUSTRATIVE' });
    const dna = explorerCommands(organ, 'dna', 'z', 2);
    expect(dna.filter((c) => c.targetEntityId === 'station:compute').length).toBe(1);
    expect(magnificationCommands(organ, 500, 'm', 3).map((c) => c.intent)).toEqual(['NAVIGATE', 'RUN_EXPERIMENT', 'INSPECT']);
    expect(magnificationCommands(organ, 500, 'm', 3)[1].parameters).toEqual({ magnification: 500, tissue: 'CARDIAC', organId: 'heart' });
    expect(bloodMagnificationCommands(500, 'blood', 3)[1].parameters).toEqual({ magnification: 500, tissue: 'BLOOD', specimenKind: 'REFERENCE_BLOOD_SMEAR' });
    expect(systemCommands('SKELETAL', 's', 4)[1].parameters).toEqual({ action: 'FOCUS_ANATOMY', focus: 'system:skeletal', mode: 'XRAY' });
    expect(levelOfSession('hyperscope-capture', 500, true)).toBe('organelle'); expect(levelOfSession('hyperscope-capture', 100, true)).toBe('cell');
    expect(levelOfSession('central-dogma', null, true)).toBe('molecule'); expect(levelOfSession('central-dogma', null, true, 'dna')).toBe('dna'); expect(levelOfSession(null, null, false)).toBe('body');
    expect(new Set(EXPLORER_ORGANS.map((o) => o.organId)).size).toBe(EXPLORER_ORGANS.length);
  });
  it('level labels come from i18n with the visible-key fallback for the untranslated level', () => {
    expect(levelLabel('cell', 'es')).toBe('Célula');
    expect(levelLabel('organ', 'ar')).toBe('Narząd'); expect(levelLabel('atom', 'en')).toBe('Atoms');
  });
});

describe('museum calm — the guide-voice pack on the existing voice engine', () => {
  const base = { enabled: true, volume: 1, rate: 1.2, lang: 'pl' as const, captions: false };
  it('calms pacing, forces captions, keeps language/enabled, never raises the user\'s own quieter values', () => {
    const s = museumCalmSettings(base);
    expect(s).toMatchObject({ enabled: true, lang: 'pl', captions: true, rate: MUSEUM_CALM.rate, volume: MUSEUM_CALM.volume });
    expect(museumCalmSettings({ ...base, rate: 0.5, volume: 0.1 })).toMatchObject({ rate: 0.72, volume: 0.45 });
    expect(museumCalmSettings({ ...base, rate: Number.NaN }).rate).toBe(MUSEUM_CALM.rate);
  });
  it('chunks on sentences, then on word boundaries; never empty, never mid-word', () => {
    expect(chunkForSpeech('   ')).toEqual([]);
    expect(chunkForSpeech('Jedno zdanie. Drugie zdanie! Trzecie?')).toEqual(['Jedno zdanie.', 'Drugie zdanie!', 'Trzecie?']);
    const long = Array.from({ length: 60 }, (_, i) => `slowo${i}`).join(' ');
    const chunks = chunkForSpeech(long, 50);
    expect(chunks.every((c) => c.length <= 50 && c.length > 0)).toBe(true);
    expect(chunks.join(' ')).toBe(long);
  });
  it('spoken status line exists per known status and language; unknown status is null, not invented', () => {
    expect(epistemicStatusLine('SIMULATION', 'pl')).toMatch(/symulacji/);
    expect(epistemicStatusLine('MODEL', 'en')).toMatch(/model view/);
    expect(epistemicStatusLine('WINNER', 'pl')).toBeNull();
    const u = museumUtterances([{ key: 'k', text: 'A. B.' }], 'SIMULATION', 'en');
    expect(u.map((x) => x.key)).toEqual(['status', 'k:0', 'k:1']);
    expect(museumUtterances([{ key: 'k', text: 'A.' }], null, 'pl').map((x) => x.key)).toEqual(['k:0']);
  });
});
