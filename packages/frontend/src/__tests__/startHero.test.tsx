import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Start: what Genesis is, the evidence, how to check it, then the one chat.
 * Rendered statically (no DOM environment here), so effects do not run: the
 * engine chips and the backend line show their honest pre-fetch state, and the
 * Science Memory count is what the store really returns.
 */
const REPO = resolve(__dirname, '../../../..');
const json = (path: string): Record<string, unknown> => JSON.parse(readFileSync(resolve(REPO, path), 'utf8')) as Record<string, unknown>;

async function render(): Promise<string> {
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, location: { hash: '' } });
  const { StartHero } = await import('../components/StartHero');
  return renderToStaticMarkup(<StartHero />);
}

describe('StartHero', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('leads with what Genesis is and the three entries: verified discovery, Reviewer Room, the drug run', async () => {
    const html = await render();
    expect(html).toContain('data-testid="start-hero"');
    expect(html).toContain('Verifiable computational drug discovery.');
    expect(html).toContain('Real scientific engines. Falsifiable results. Cryptographic evidence. Replay.');
    expect(html).toContain('data-testid="start-proof"');
    expect(html).toContain('href="#/discovery-track"');
    expect(html).toContain('href="#/reviewer"');
    expect(html).toContain('data-testid="door-proof-drug"');
    expect(html).toContain('No Genesis prediction has been tested in a laboratory yet.');
    // The chat entries stay, after the evidence.
    for (const id of ['door-ask', 'door-laboratory', 'door-guided-demo']) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain('href="#/scientific-worlds"');
    expect(html).not.toContain('data-testid="door-discover"');
    expect(html.indexOf('data-testid="home-proof"')).toBeLessThan(html.indexOf('data-testid="door-ask"'));
    expect(html).toContain('runs saved in Scientific Memory');
    expect(html).toContain('checking…'); // effects do not run statically: the honest pre-fetch state
    expect(html).not.toContain('undefined');
  });

  it('shows the Astex numbers from the committed records, with the caveat visible and 81 never called Top-1', async () => {
    const html = await render();
    const run3 = json('docs/evidence/astex-redock-benchmark-2026-09-27-run3.json') as { summary: { successes: number } };
    const run7 = json('docs/evidence/astex-run7-gnina-rescore.json') as { topK: { top1: number }; samplingCeilingInPool: { successes: number }; vsVinaBaseline: { baselineTop1: number } };
    expect(html).toContain(`Vina baseline: ${run3.summary.successes}/85. Current Astex development result with GNINA rescoring: ${run7.topK.top1}/85.`);
    expect(html).toContain('Development benchmark, not validation.');
    expect(html).toContain('training data contains 76 of these 85 complexes');
    expect(html).toContain('Independent unseen validation pending');
    expect(html).toContain('pre-registered, not yet run');
    const gninaCard = html.slice(html.indexOf('data-testid="home-astex-gnina"'), html.indexOf('data-testid="home-astex-vina-pooled"'));
    expect(gninaCard).toContain(`${run7.topK.top1}<span> / 85`);
    expect(gninaCard).toContain('data-testid="home-astex-caveat"');
    const ceiling = html.slice(html.indexOf('data-testid="home-astex-ceiling"'), html.indexOf('data-testid="home-imatinib"'));
    expect(ceiling).toContain(`${run7.samplingCeilingInPool.successes}<span> / 85`);
    expect(ceiling).toContain('not a Top-1 result');
    expect(html).toContain(`${run7.vsVinaBaseline.baselineTop1}<span> / 85`);
    expect(html).not.toMatch(/independently validated|validated drug|clinically proven/i);
  });

  it('the three verification challenges lead to the existing Reviewer Room, and replay names its real verdicts', async () => {
    const html = await render();
    for (const id of ['A', 'B', 'C']) expect(html).toContain(`href="#/reviewer?focus=rv-c7" data-testid="home-challenge-${id}"`);
    expect(html).toContain('Verification fails');
    expect(html).toContain('MODEL_ESTIMATE as REAL_MEASUREMENT');
    expect(html).toContain('SIGNED_UNTRUSTED');
    for (const v of ['MATCH', 'DRIFT', 'ENGINE_VERSION_CHANGED', 'BLOCKED_BY_RUNTIME']) expect(html).toContain(`<code>${v}</code>`);
  });

  it('CSRN and real-lab status come from the record, not from a hardcoded success', async () => {
    const html = await render();
    const key = json('docs/keys/genesis-csrn-signing-key.json') as { status: string; keyId: string | null };
    if (key.status === 'ACTIVE' && key.keyId) {
      expect(html).toContain('Signed by the published Genesis key');
      expect(html).toContain(key.keyId);
    } else {
      expect(html).toContain('Genesis production signing key not generated yet.');
      expect(html).not.toContain('Signed by the published Genesis key');
    }
    expect(html).toContain('Signature proves integrity/authorship. It does not turn a model estimate into laboratory truth.');
    expect(html).toContain('First hardware-verified instrument connection pending.');
    expect(html).not.toMatch(/connected autonomous laboratory/i);
  });

  it('the wider Scientific OS sits below the drug-discovery story, and hidden modules stay hidden', async () => {
    const html = await render();
    expect(html.indexOf('data-testid="home-broader"')).toBeGreaterThan(html.indexOf('data-testid="home-pipeline"'));
    for (const label of ['Human Digital Twin', 'CERN / CMS Open Data', 'CERN Complex', 'Chemistry Live Lab', 'Quantum', 'Black holes', 'Research Console', 'Real Lab architecture']) expect(html).toContain(label);
    for (const href of ['#/human-biology-lab', '#/physics/cms-z', '#/cern-complex', '#/virtual-bio', '#/geodesics', '#/reality', '#/world-director']) expect(html).toContain(`href="${href}"`);
    expect(html).not.toMatch(/Cyber|Mirror|Myth Lab|DICOM|OMNICORE|MoveX/);
  });
});
