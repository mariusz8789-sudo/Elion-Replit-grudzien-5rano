import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Start is the dashboard: an overview only. Rendered statically (no DOM
 * environment here), so effects do not run: the engine row and the backend
 * dot show their honest pre-fetch state, and Recent research is what the
 * Scientific Memory store really returns (empty here).
 */
const REPO = resolve(__dirname, '../../../..');
const json = (path: string): Record<string, unknown> => JSON.parse(readFileSync(resolve(REPO, path), 'utf8')) as Record<string, unknown>;

async function render(locale: 'pl' | 'en' | 'ar' = 'en'): Promise<string> {
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, location: { hash: '' } });
  // English unless a test asks for Polish: the assertions below read the English wording.
  const { setLocale } = await import('../core/i18n');
  setLocale(locale);
  const { StartHero } = await import('../components/StartHero');
  return renderToStaticMarkup(<StartHero />);
}

describe('StartHero dashboard', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('leads with what Genesis is and one command input, and holds no chat and no menu of its own', async () => {
    const html = await render();
    expect(html).toContain('data-testid="start-hero"');
    expect(html).toContain('Genesis · Scientific OS');
    expect(html).toContain('<em>Verifiable</em> computational drug discovery.');
    expect(html).toContain('data-testid="home-command"');
    expect(html).toContain('placeholder="What do you want to investigate?"');
    expect(html).toContain('checking backend…');
    expect(html).not.toContain('science-chat');
    expect(html).not.toContain('undefined');
  });

  it('follows the language switch: Polish under PL, English under EN, English under Arabic until a native check', async () => {
    const pl = await render('pl');
    expect(pl).toContain('lang="pl"');
    expect(pl).toContain('<em>Sprawdzalne</em> obliczeniowe odkrywanie leków.');
    expect(pl).toContain('placeholder="Co chcesz zbadać?"');
    expect(pl).toContain('Biologia człowieka');
    expect(pl).not.toContain('Verifiable');
    // Hashes and protocol tokens stay as they are; engine names only under Technical details.
    expect(pl).toContain('REPLAY MATCH');
    expect(pl).toContain('Szczegóły techniczne');
    expect(pl).toContain('Analiza molekularna');
    const ar = await render('ar');
    expect(ar).toContain('<em>Verifiable</em> computational drug discovery.');
    expect(ar).toContain('lang="en"');
  });

  it('keeps molecules out of the centre: Molecule World is reached only from the Drug Discovery card', async () => {
    const html = await render();
    const live = html.slice(html.indexOf('data-testid="home-live-view"'));
    expect(live.slice(0, live.indexOf('</div></div>') + 12)).not.toContain('#/molecule');
    expect(html).toContain('data-view="anatomy"');
    const drug = html.slice(html.indexOf('data-testid="home-area-drug"'), html.indexOf('data-testid="home-area-biology"'));
    expect(drug).toContain('href="#/molecule"');
    expect(html.split('href="#/molecule"').length - 1).toBe(1);
    // The benchmark card carries no molecule picture: caffeine is not one of its complexes.
    const run = html.slice(html.indexOf('data-testid="home-running"'), html.indexOf('</section>', html.indexOf('data-testid="home-running"')));
    expect(run).not.toContain('<img');
  });

  it('is the approved command centre: hero with Running now and Latest verified, bento, and the More strip', async () => {
    const html = await render();
    for (const id of ['home-running', 'home-latest', 'home-live-view', 'home-area-drug', 'home-area-biology', 'home-area-evidence', 'home-area-physics', 'home-recent', 'home-engines', 'home-more']) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    for (const [id, hash] of [['drug', '#/drug'], ['biology', '#/human-biology-lab'], ['evidence', '#/reviewer'], ['physics', '#/physics/cms-z']] as const) {
      const start = html.indexOf(`data-testid="home-area-${id}"`);
      expect(html.slice(start, html.indexOf('</article>', start))).toContain(`href="${hash}"`);
    }
    // Human Biology states the path, never an atlas count.
    const bio = html.slice(html.indexOf('data-testid="home-area-biology"'), html.indexOf('data-testid="home-area-evidence"'));
    expect(bio).toContain('Body');
    expect(bio.replace(/<[^>]*>/g, ' ')).not.toMatch(/\d/);
  });

  it('Running now is the committed Run 8 status record, dated, with no progress number', async () => {
    const html = await render();
    const run8 = json('docs/evidence/run8-status.json') as { status: string; complexes: number; dataset: string; seeds: number };
    const card = html.slice(html.indexOf('data-testid="home-running"'), html.indexOf('data-testid="home-latest"'));
    expect(card).toContain(run8.status === 'RUNNING' ? 'RUNNING NOW' : 'LATEST BENCHMARK');
    expect(card).toContain(`${run8.complexes}</b> unseen ${run8.dataset} complexes · ${run8.seeds} seeds · pre-registered`);
    expect(card).toContain('recorded ');
    expect(card).not.toMatch(/\d+\s*\/\s*308/);
  });

  it('the drug numbers come from the committed Astex records, with the training-data caveat visible', async () => {
    const html = await render();
    const run3 = json('docs/evidence/astex-redock-benchmark-2026-09-27-run3.json') as { summary: { successes: number } };
    const run7 = json('docs/evidence/astex-run7-gnina-rescore.json') as { topK: { top1: number } };
    const drug = html.slice(html.indexOf('data-testid="home-area-drug"'), html.indexOf('data-testid="home-area-biology"'));
    expect(drug).toContain(`${run3.summary.successes}<small>/85</small>`);
    expect(drug).toContain(`${run7.topK.top1}<small>/85</small>`);
    // Capabilities on the card; the exact engines (owner's Astex wording) under Technical details.
    expect(drug).toContain('Docking baseline · pre-registered');
    expect(drug).toContain('Pose rescoring · development');
    expect(drug).toContain('76 of these 85 complexes are in the rescoring model&#x27;s training data. This is development, not independent validation.');
    const tech = drug.slice(drug.indexOf('data-testid="home-drug-tech"'), drug.indexOf('</details>', drug.indexOf('data-testid="home-drug-tech"')));
    expect(tech).toContain(`Vina baseline: AutoDock Vina, pre-registered: ${run3.summary.successes}/85`);
    expect(tech).toContain(`GNINA rescoring (CNN) of the run 6 poses: ${run7.topK.top1}/85`);
    expect(tech).toContain('76 of these 85 complexes are in GNINA&#x27;s training data.');
    expect(html).not.toMatch(/independently validated|validated drug|clinically proven|government-ready/i);
  });

  it('evidence and replay come from the records, CSRN from the key file', async () => {
    const html = await render();
    const retro = json('docs/evidence/imatinib-retrosynthesis-2026-09-27.json') as { replayVerdict: string; run: { inputHash: string; outputHash: string } };
    expect(html).toContain(`REPLAY ${retro.replayVerdict}`);
    expect(html).toContain(retro.run.inputHash.slice(0, 8));
    expect(html).toContain(retro.run.outputHash.slice(0, 8));
    const key = json('docs/keys/genesis-csrn-signing-key.json') as { status: string; keyId: string | null };
    const csrn = html.slice(html.indexOf('data-testid="home-csrn"'), html.indexOf('</p>', html.indexOf('data-testid="home-csrn"')));
    if (key.status === 'ACTIVE' && key.keyId) expect(csrn).toContain(`CSRN SIGNED · ${key.keyId}`);
    else expect(csrn).toContain('CSRN KEY PENDING');
    expect(csrn).toContain('no lab test yet');
  });

  it('recent research is read from Scientific Memory and says so honestly when empty', async () => {
    const html = await render();
    expect(html).toContain('data-testid="home-recent-empty"');
    expect(html).toContain('No runs saved in this browser yet.');
  });

  it('live sources wait for the server instead of showing numbers', async () => {
    const html = await render();
    expect(html).toContain('Checking this server…');
    expect(html).toContain('Reading CMS data from the server…');
  });

  it('the More strip shows the five owner groups with counts from the audit catalogue, and no showcase names', async () => {
    const html = await render();
    const { SCIENTIFIC_OS, labelCounts } = await import('../core/scientificOs/catalogue');
    const strip = html.slice(html.indexOf('data-testid="home-more"'));
    for (const id of ['ls', 'gov', 'phys', 'world', 'edu']) {
      const g = SCIENTIFIC_OS.find((x) => x.id === id)!;
      expect(strip).toContain(`href="#/more?group=${id}" data-testid="home-group-${id}"`);
      const tile = strip.slice(strip.indexOf(`data-testid="home-group-${id}"`));
      expect(tile).toContain(`${g.items.length} capabilities · ${labelCounts(g).AVAILABLE} available`);
    }
    expect(strip).toContain('href="#/more"');
    expect(html).not.toMatch(/Mirror|Myth|DICOM|OMNICORE|MoveX|CICADA/);
  });
});

describe('relativeTime', () => {
  it('reads only the timestamp it is given', async () => {
    const { relativeTime } = await import('../components/StartHero');
    const now = Date.parse('2026-09-29T04:00:00Z');
    expect(relativeTime('2026-09-29T03:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-09-29T03:40:00Z', now)).toBe('20 min ago');
    expect(relativeTime('2026-09-29T01:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-09-28T02:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('not a date', now)).toBe('unknown time');
  });
});
