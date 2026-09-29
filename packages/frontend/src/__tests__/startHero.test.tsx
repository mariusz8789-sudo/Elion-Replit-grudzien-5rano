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

async function render(): Promise<string> {
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, location: { hash: '' } });
  const { StartHero } = await import('../components/StartHero');
  return renderToStaticMarkup(<StartHero />);
}

describe('StartHero dashboard', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('leads with what Genesis is and one command input, and holds no chat and no menu of its own', async () => {
    const html = await render();
    expect(html).toContain('data-testid="start-hero"');
    expect(html).toContain('Genesis · Scientific OS');
    expect(html).toContain('Verifiable computational drug discovery.');
    expect(html).toContain('data-testid="home-command"');
    expect(html).toContain('placeholder="What do you want to investigate?"');
    expect(html).toContain('checking backend…');
    expect(html).not.toContain('science-chat');
    expect(html).not.toContain('undefined');
  });

  it('shows four areas, each with one sentence, one status and a real route', async () => {
    const html = await render();
    const cards: readonly [string, string, string][] = [
      ['drug', 'Design, test and falsify computational drug candidates.', '#/drug'],
      ['biology', 'Explore anatomy from body to organ, tissue and cell.', '#/human-biology-lab'],
      ['evidence', 'Verify where a result came from and reproduce it.', '#/reviewer'],
      ['physics', 'Run physical models and inspect real CMS Open Data.', '#/physics/cms-z'],
    ];
    for (const [id, line, hash] of cards) {
      const start = html.indexOf(`data-testid="home-area-${id}"`);
      expect(start).toBeGreaterThan(-1);
      const card = html.slice(start, html.indexOf('</article>', start));
      expect(card).toContain(line);
      expect(card).toContain(`href="${hash}"`);
      expect(card).toContain('hp-area-status');
    }
    // Human Biology states the path, never an atlas count.
    const bio = html.slice(html.indexOf('data-testid="home-area-biology"'), html.indexOf('data-testid="home-area-evidence"'));
    expect(bio).toContain('Body → organ → tissue → cell');
    expect(bio.replace(/<[^>]*>/g, ' ')).not.toMatch(/\d/);
  });

  it('the drug status comes from the committed Astex records, with the training-data caveat visible', async () => {
    const html = await render();
    const run3 = json('docs/evidence/astex-redock-benchmark-2026-09-27-run3.json') as { summary: { successes: number } };
    const run7 = json('docs/evidence/astex-run7-gnina-rescore.json') as { topK: { top1: number } };
    const drug = html.slice(html.indexOf('data-testid="home-area-drug"'), html.indexOf('data-testid="home-area-biology"'));
    expect(drug).toContain(`Vina baseline ${run3.summary.successes}/85 · GNINA dev ${run7.topK.top1}/85`);
    expect(drug).toContain('not validation: 76 of 85 complexes are in GNINA&#x27;s training data.');
    expect(html).not.toMatch(/independently validated|validated drug|clinically proven/i);
  });

  it('evidence and replay statuses come from the records, CSRN from the key file', async () => {
    const html = await render();
    const retro = json('docs/evidence/imatinib-retrosynthesis-2026-09-27.json') as { replayVerdict: string };
    expect(html).toContain(`Replay ${retro.replayVerdict}`);
    const key = json('docs/keys/genesis-csrn-signing-key.json') as { status: string; keyId: string | null };
    const csrn = html.slice(html.indexOf('data-testid="home-csrn"'), html.indexOf('</p>', html.indexOf('data-testid="home-csrn"')));
    if (key.status === 'ACTIVE' && key.keyId) expect(csrn).toContain(`SIGNED · ${key.keyId}`);
    else expect(csrn).toContain('PENDING · key not generated yet');
    expect(html).toContain('No Genesis prediction has been tested in a laboratory yet.');
  });

  it('recent research is read from Scientific Memory and says so honestly when empty', async () => {
    const html = await render();
    expect(html).toContain('data-testid="home-recent-empty"');
    expect(html).toContain('No runs saved yet.');
  });

  it('engines wait for the server, and the broader row links only, without Cyber/Mirror/Myths', async () => {
    const html = await render();
    expect(html).toContain('checking this server…');
    expect(html).not.toContain('hp-tone-ok" title="Reads molecules');
    const broader = html.slice(html.indexOf('data-testid="home-broader"'));
    for (const href of ['#/lab/quantum', '#/cern-complex', '#/virtual-bio', '#/world-director']) expect(broader).toContain(`href="${href}"`);
    expect(html).not.toMatch(/Cyber|Mirror|Myth|DICOM|OMNICORE|MoveX/);
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
